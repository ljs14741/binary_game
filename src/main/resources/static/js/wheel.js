/*
 * 해머 돌림판 — 해머로 쳐서 돌리는 원판돌리기
 *
 * 기획서: docs/plans/wheel.md
 *
 * 규칙은 한 줄이다. **한 번 돌려서 하나 뽑고 끝난다.**
 *
 * 여러 명이 한 화면을 보고 돌리든, 혼자 점심 메뉴를 고르든 똑같다.
 * 벌칙자를 가려내는 게임이 아니라 **하나를 정하는 도구**다.
 * 그래서 회차도, 순서 유불리도, 살아남기도 없다. 원판에 사람 얼굴도 없다 —
 * 여기 들어가는 건 사람 이름일 수도 있고 음식 이름일 수도 있다.
 *
 * 원판돌리기에 없던 것 하나만 얹었다 — **해머**.
 * 게이지가 0~100 을 왕복하고, 멈춘 세기만큼 원판이 돈다.
 *
 *   세기 0   ->  2.6바퀴  ->  2.2초
 *   세기 100 ->  9.2바퀴  ->  5.0초
 *
 * 세기는 **어디에 멈출지를 정하지 못한다.** 타격 오차 하나만으로 원판이
 * 반 바퀴씩 흔들리기 때문이다 (8칸 기준 여덟 칸). 세기가 정하는 건
 * "얼마나 오래 조마조마하냐" 뿐이고, 그래서 마음껏 세게 쳐도 된다.
 *
 * ⚠ 결과를 미리 뽑아놓고 각도를 역산하지 않는다. 순서가 반대다 —
 *   세기와 오차로 각도를 만들고, 멈춘 자리를 읽어서 결과를 정한다.
 *   그래서 그리는 쪽이 결과를 알 방법 자체가 없다.
 */
(function () {
    'use strict';

    // ── 물리 ────────────────────────────────────────────────
    /*
     * 세기 0 에서도 2.6바퀴는 돈다. 이게 조준을 막는 첫 번째 장치다.
     * 두 번째가 JITTER — 해머가 닿는 각도와 마찰은 매번 다르다.
     * ±180도면 8칸(한 칸 45도)에서도 여덟 칸이 흔들려 조준이 원천 봉쇄된다.
     */
    var MIN_TURNS = 2.6;
    var MAX_TURNS = 9.2;
    var SPAN_DEG = (MAX_TURNS - MIN_TURNS) * 360;
    var JITTER_DEG = 180;

    /*
     * 감속 지수. 마지막 한 바퀴에 회전 시간의 36~65% 를 쓴다 —
     * 딸깍딸깍 애태우는 구간이 여기다.
     * 3.4 로 잡았다가 낮췄다. 그 값이면 시간의 절반이 지나기 전에 회전의 90% 가
     * 끝나서 남은 절반이 거의 안 움직이는 지루한 구간이 됐다.
     */
    var DECEL = 2.2;

    // ── 타이밍 ──────────────────────────────────────────────
    var GAUGE_PERIOD = 0.85;      // 게이지 왕복 한 번 (초)
    var STRIKE_MS = 170;          // 해머가 내려찍는다
    var SPIN_MIN_MS = 2200;
    var SPIN_MAX_MS = 5000;
    var REVEAL_MS = 900;          // 뽑힌 칸이 차오르고 커진다
    var PERFECT = 92;             // 혼신의 일격. 확률에는 영향이 없다
    /*
     * 만점 타격의 히트스톱. 해머가 닿기 직전에 이만큼 멈췄다가 터진다.
     * 회전각·회전 시간과는 무관하다 — 결과가 정해지는 beginSpin() 이 이만큼 늦게 불릴 뿐이다.
     */
    var HITSTOP_MS = 140;

    var MIN_SLOTS = 2;
    var MAX_SLOTS = 8;
    var STORE_KEY = 'bw_wheel_recent';

    /*
     * 칸 색. 사탕처럼 선명하되 여덟 색의 밝기를 맞췄다 — 색상만 다르고 톤이 같아야
     * 한 물건으로 보인다. 밝은 톤·어두운 톤은 그릴 때 mix() 로 뽑는다.
     * 입력칸의 색 점과 색종이에도 같은 색을 쓴다.
     */
    var SEG = ['#4f8cff', '#ff5c6c', '#ffb830', '#3dd68c',
               '#b478ff', '#2fd2e8', '#ff8a3d', '#ff6ac8'];

    // ══════════════════════════════════════════════════════════
    //  순수 계산부 — Node 로 검증한다 (규격 6-9)
    // ══════════════════════════════════════════════════════════

    /** 세기(0~100) -> 회전각(도). 선형 + 타격 오차. 숨은 보정이 없다. */
    function spinDegrees(power, jitter) {
        return MIN_TURNS * 360 + (power / 100) * SPAN_DEG + jitter;
    }

    /** 세기가 셀수록 오래 돈다. 사람이 고르는 유일한 값이다. */
    function spinDuration(power) {
        return SPIN_MIN_MS + (power / 100) * (SPIN_MAX_MS - SPIN_MIN_MS);
    }

    function sliceDeg(n) { return 360 / n; }

    /** 감속 곡선. 마지막 한 바퀴에 시간을 몰아준다. */
    function spinEase(u) {
        var x = u < 0 ? 0 : (u > 1 ? 1 : u);
        return 1 - Math.pow(1 - x, DECEL);
    }

    /**
     * 바늘이 가리키는 칸을 읽는다. 바늘은 12시 고정이고 원판이 ang 만큼 돌았다.
     *
     * ⚠ 이 함수가 결과를 "읽는" 유일한 곳이다.
     */
    function pointedIndex(ang, n) {
        var s = sliceDeg(n);
        var a = ((360 - (ang % 360)) % 360 + 360) % 360;
        var i = Math.floor(a / s);
        return i < 0 ? 0 : (i >= n ? n - 1 : i);
    }

    /**
     * 이름을 다듬는다. 빈 칸은 "N번" 으로 채운다 —
     * 여덟 개를 다 타이핑해야 시작되는 게임이면 처음 온 사람은 그냥 나간다.
     */
    function normalizeNames(raw, count) {
        var out = [], i, s;
        for (i = 0; i < count; i++) {
            s = (raw && raw[i] != null) ? String(raw[i]).trim() : '';
            if (s.length > 12) { s = s.slice(0, 12); }
            out.push(s || ((i + 1) + '번'));
        }
        return out;
    }

    /** 한 번 돌린다 (검증용). 실제 게임도 정확히 이 순서를 따른다. */
    function spinOnce(n, rnd, power) {
        var ang = rnd() * 360;
        var p = power === undefined ? rnd() * 100 : power;
        p = p < 0 ? 0 : (p > 100 ? 100 : p);
        var jitter = (rnd() * 2 - 1) * JITTER_DEG;
        ang = (ang + spinDegrees(p, jitter)) % 360;
        return pointedIndex(ang, n);
    }

    // 계산부만 떼어 검증할 수 있게 열어둔다. 브라우저에서는 module 이 없어 무시된다.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            MIN_TURNS: MIN_TURNS, MAX_TURNS: MAX_TURNS,
            SPAN_DEG: SPAN_DEG, JITTER_DEG: JITTER_DEG, DECEL: DECEL,
            SPIN_MIN_MS: SPIN_MIN_MS, SPIN_MAX_MS: SPIN_MAX_MS,
            REVEAL_MS: REVEAL_MS, PERFECT: PERFECT, GAUGE_PERIOD: GAUGE_PERIOD, STRIKE_MS: STRIKE_MS, HITSTOP_MS: HITSTOP_MS,
            spinDegrees: spinDegrees, spinDuration: spinDuration,
            sliceDeg: sliceDeg, spinEase: spinEase, pointedIndex: pointedIndex,
            normalizeNames: normalizeNames, spinOnce: spinOnce
        };
        return;
    }

    // ══════════════════════════════════════════════════════════
    //  소리
    //
    //  박자를 따로 만들 필요가 없다 — 바늘이 못을 튕기는 "딸깍" 이 그대로
    //  리듬이고, 그 간격이 곧 속도 게이지다. 눈을 감고 들어도 얼마나 남았는지 안다.
    // ══════════════════════════════════════════════════════════
    var sfx = (function () {
        var actx = null, muted = false;

        function ac() {
            if (!actx) {
                var C = window.AudioContext || window.webkitAudioContext;
                if (!C) { return null; }
                actx = new C();
            }
            if (actx.state === 'suspended') { actx.resume(); }
            return actx;
        }

        /*
         * 음 하나. 반드시 짧은 어택을 준다 — 최대 볼륨에서 바로 시작하면
         * 매 음마다 딱딱 하는 클릭 잡음이 난다. 싸구려로 들리는 원인의 대부분이다.
         */
        function tone(freq, dur, type, vol, slideTo, delay) {
            if (muted) { return; }
            var a = ac(); if (!a) { return; }
            var t0 = a.currentTime + (delay || 0);
            var o = a.createOscillator(), g = a.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, t0);
            if (slideTo) { o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur); }
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + Math.min(0.012, dur * 0.3));
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            o.connect(g); g.connect(a.destination);
            o.start(t0); o.stop(t0 + dur + 0.02);
        }

        function noise(dur, vol, cut, delay, sweepTo) {
            if (muted) { return; }
            var a = ac(); if (!a) { return; }
            var t0 = a.currentTime + (delay || 0);
            var n = Math.max(1, Math.floor(a.sampleRate * dur));
            var buf = a.createBuffer(1, n, a.sampleRate);
            var d = buf.getChannelData(0), i;
            for (i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n); }
            var src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
            src.buffer = buf;
            f.type = sweepTo ? 'bandpass' : 'lowpass';
            f.frequency.setValueAtTime(cut || 2600, t0);
            if (sweepTo) { f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur); }
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            src.connect(f); f.connect(g); g.connect(a.destination);
            src.start(t0); src.stop(t0 + dur + 0.02);
        }

        return {
            setMuted: function (m) { muted = m; },
            isMuted: function () { return muted; },
            resume: function () { ac(); },

            /** 게이지가 끝에 닿을 때 — 째깍. 이게 대기 중의 박자다. */
            tick: function (hi) { tone(hi ? 1400 : 1050, 0.03, 'square', 0.020); },

            /** 바늘이 못을 튕긴다. 빠를수록 짧고 높다. */
            click: function (speed) {
                tone(880 + speed * 420, 0.030, 'square', 0.028 + 0.012 * speed);
                noise(0.018, 0.015, 5400);
            },

            /** 깡! 해머가 원판을 친다. */
            hit: function (power) {
                var v = 0.11 + 0.07 * (power / 100);
                noise(0.14, v, 3400, 0, 850);
                tone(155, 0.18, 'triangle', v * 0.85, 68);
                tone(640, 0.10, 'square', v * 0.38, 380);
            },

            /** 혼신의 일격 — 순수한 보상이다. 확률과는 무관하다. 히트스톱이 끝나는 순간에 울린다. */
            perfect: function () {
                tone(880, 0.09, 'square', 0.05);
                tone(1320, 0.10, 'square', 0.045, null, 0.06);
                tone(1760, 0.16, 'square', 0.04, null, 0.12);
                // 종 — 상행 3음 위에 길게 남는 한 겹. 타격음까지 더해도 동시 음량 합이 0.6 을 넘지 않는다
                tone(2093, 0.55, 'sine', 0.05, null, 0.12);
                tone(3136, 0.4, 'sine', 0.022, null, 0.14);
            },

            /** 만점 차징 — 히트스톱 동안 올라가는 한 음. "뭔가 온다" 를 귀로 먼저 알린다. */
            charge: function () {
                tone(320, HITSTOP_MS / 1000, 'sawtooth', 0.035, 1400);
            },

            /** 멈췄다 — 띵. */
            settle: function () {
                tone(1046, 0.26, 'sine', 0.065);
                tone(1568, 0.22, 'sine', 0.032, null, 0.02);
            },

            /** 결정됐다 — 상행 팡파레. 벌칙이 아니라 결정이니 축하해도 된다. */
            fanfare: function () {
                tone(523, 0.12, 'square', 0.05);
                tone(659, 0.12, 'square', 0.05, null, 0.10);
                tone(784, 0.14, 'square', 0.05, null, 0.20);
                tone(1046, 0.34, 'square', 0.058, null, 0.32);
                noise(0.5, 0.028, 900, 0.32);
            }
        };
    }());

    // ══════════════════════════════════════════════════════════
    //  DOM
    // ══════════════════════════════════════════════════════════
    var $ = function (id) { return document.getElementById(id); };
    var el = {};
    var canvas = null, ctx = null;
    var view = { w: 0, h: 0 };

    var state = null;
    var raf = 0, running = false, lastNow = 0;
    var slotCount = 4;

    // ══════════════════════════════════════════════════════════
    //  최근 목록
    // ══════════════════════════════════════════════════════════
    function loadRecent() {
        try {
            var s = window.localStorage.getItem(STORE_KEY);
            var v = s ? JSON.parse(s) : [];
            return Array.isArray(v) ? v.slice(0, 3) : [];
        } catch (e) { return []; }
    }

    function saveRecent(names) {
        try {
            var list = loadRecent();
            var key = names.join('');
            list = list.filter(function (x) { return x.join('') !== key; });
            list.unshift(names.slice());
            window.localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 3)));
        } catch (e) { /* 프라이빗 모드 등 — 조용히 넘어간다 */ }
        renderRecent();
    }

    function renderRecent() {
        if (!el.recent) { return; }
        var list = loadRecent();
        el.recent.innerHTML = '';
        if (!list.length) { el.recentWrap.hidden = true; return; }
        el.recentWrap.hidden = false;
        list.forEach(function (names) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'bw-wheel-chip';
            b.textContent = names.slice(0, 3).join(', ') + (names.length > 3 ? ' 외 ' + (names.length - 3) : '');
            b.addEventListener('click', function () { applyNames(names); });
            el.recent.appendChild(b);
        });
    }

    // ══════════════════════════════════════════════════════════
    //  설정 화면 — 칸 수와 이름. 그게 전부다
    // ══════════════════════════════════════════════════════════
    function buildSlots() {
        var prev = readSlots(), i;
        el.slots.innerHTML = '';
        for (i = 0; i < slotCount; i++) {
            var wrap = document.createElement('div');
            wrap.className = 'bw-wheel-slot';

            // 칸 색을 미리 보여준다 — 원판의 어느 칸인지 바로 이어진다
            var dot = document.createElement('span');
            dot.className = 'bw-wheel-dot';
            dot.style.background = SEG[i % SEG.length];
            wrap.appendChild(dot);

            var inp = document.createElement('input');
            inp.type = 'text';
            inp.maxLength = 12;
            inp.value = prev[i] || '';
            inp.placeholder = (i + 1) + '번';
            inp.setAttribute('aria-label', (i + 1) + '번 칸');
            wrap.appendChild(inp);

            el.slots.appendChild(wrap);
        }
        el.slotCount.textContent = String(slotCount);
        el.less.disabled = slotCount <= MIN_SLOTS;
        el.more.disabled = slotCount >= MAX_SLOTS;
    }

    function readSlots() {
        var out = [], i;
        if (!el.slots) { return out; }
        var ins = el.slots.querySelectorAll('input');
        for (i = 0; i < ins.length; i++) { out.push(ins[i].value); }
        return out;
    }

    function applyNames(names) {
        slotCount = Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, names.length));
        buildSlots();
        var ins = el.slots.querySelectorAll('input'), i;
        for (i = 0; i < ins.length; i++) { ins[i].value = names[i] || ''; }
    }

    // ══════════════════════════════════════════════════════════
    //  게임 — 한 번 돌리면 끝난다
    // ══════════════════════════════════════════════════════════
    function startGame() {
        var names = normalizeNames(readSlots(), slotCount);
        saveRecent(names);

        state = {
            names: names,
            n: names.length,
            ang: Math.random() * 360,
            phase: '',
            t0: 0,
            dur: 0,
            power: 0,
            gaugeT: 0,
            gaugeVal: 0,
            lastEdge: 0,
            spinFrom: 0,
            spinTo: 0,
            lastTick: 0,
            picked: -1,            // 원판이 멈춘 뒤에만 유효하다
            pinBend: 0,
            hammer: 0,             // 0 = 들림, 1 = 내려찍음
            trail: [],             // 휘두르는 동안 직전 프레임들의 해머 각도 (잔상용)
            impact: 0,             // 타격 순간의 번쩍임. 1 에서 0 으로 식는다
            bolts: [],             // 타격 번개의 꺾인 점들 (접점 기준 상대 좌표)
            perfect: false,        // 이번 타격이 만점(>= PERFECT)인가. strike() 에서 정해진다
            hold: 0,               // 히트스톱 중이면 1. 해머 오라·전구 점등이 이걸 본다
            wave: 0,               // 만점 충격파 링. 1 에서 0 으로
            pop: 0,                // "혼신의 일격!" 문구. 1 에서 0 으로
            run: 0,                // 테두리를 한 바퀴 도는 금색 스파크. 1 에서 0 으로
            shake: 0,
            flash: 0,
            glow: 0,
            confetti: []
        };

        el.setup.hidden = true;
        el.play.hidden = false;
        el.result.hidden = true;
        el.gauge.hidden = false;

        sfx.resume();
        resize();
        setPhase('ready');
        startLoop();
    }

    function setPhase(name, ms) {
        state.phase = name;
        state.t0 = performance.now();
        state.dur = ms || 0;
        syncButton();
    }

    function phaseT() {
        if (!state || !state.dur) { return 0; }
        var t = (performance.now() - state.t0) / state.dur;
        return t < 0 ? 0 : (t > 1 ? 1 : t);
    }

    function syncButton() {
        if (!state || !el.hit) { return; }
        if (state.phase === 'ready') {
            el.hit.textContent = '내려찍기';
            el.hit.disabled = false;
        } else if (state.phase === 'spin') {
            el.hit.textContent = '건너뛰기';
            el.hit.disabled = false;
        } else {
            el.hit.textContent = '돌아가는 중';
            el.hit.disabled = true;
        }
    }

    /** 화면을 누르든 버튼을 누르든 스페이스를 치든 전부 여기로 온다. */
    function act() {
        if (!state) { return; }
        if (state.phase === 'ready') { strike(); return; }
        // 건너뛰기 — 도구로 쓰려는 사람을 위한 것
        if (state.phase === 'spin') {
            state.ang = state.spinTo;
            settle();
        }
    }

    /*
     * 내려찍는다. 만점이면 히트스톱만큼 strike 단계가 길어진다 —
     * 해머가 닿기 직전에 멈춰 뜸을 들이고, 그 뒤에 보통 타격에는 없는 것들이 한꺼번에 터진다
     * (impact() 참조). 회전 결과에는 아무 영향이 없다.
     */
    function strike() {
        state.power = state.gaugeVal;
        state.perfect = state.power >= PERFECT;
        if (state.perfect) { sfx.charge(); }
        el.gauge.hidden = true;
        setPhase('strike', STRIKE_MS + (state.perfect ? HITSTOP_MS : 0));
    }

    /**
     * 해머가 닿았다. 여기서 보통 타격과 만점 타격이 갈린다.
     *
     *   보통 — 깡 + 플래시 0.45 + 흔들림 8 + 번개 3갈래 + 파편
     *   만점 — 위에 더해 플래시 1.0(한 프레임 새하얗게) + 흔들림 26 + 상행 3음 + 종
     *          + 충격파 링 + 전구 전체 점등 + 테두리 스파크 한 바퀴 + "혼신의 일격!" + 번개 6갈래
     */
    function impact() {
        sfx.hit(state.power);
        state.impact = 1;
        state.hold = 0;
        if (state.perfect) {
            sfx.perfect();
            state.flash = reduceMotion ? 0.3 : 1.6;     // 첫 프레임 67% 흰색. 보통은 19%
            state.shake = reduceMotion ? 0 : 26;
            state.wave = 1;
            state.pop = 1;
            state.run = 1;
        } else {
            state.flash = reduceMotion ? 0.2 : 0.45;
        }
        spawnSparks();
        beginSpin();
    }

    function beginSpin() {
        var jitter = (Math.random() * 2 - 1) * JITTER_DEG;
        state.spinFrom = state.ang;
        state.spinTo = state.ang + spinDegrees(state.power, jitter);
        state.lastTick = Math.floor(state.ang / sliceDeg(state.n));
        if (!reduceMotion) { state.shake = Math.max(state.shake, 8); }
        setPhase('spin', spinDuration(state.power));
    }

    /** 멈췄다. 여기서 비로소 결과를 읽는다. */
    function settle() {
        state.picked = pointedIndex(state.ang, state.n);
        state.glow = 1;
        state.pinBend = 1;
        sfx.settle();
        setPhase('reveal', REVEAL_MS);
    }

    function reveal() {
        sfx.fanfare();
        spawnConfetti();
        el.resultTitle.textContent = state.names[state.picked];
        // 카드의 왼쪽 띠가 당첨 칸 색이 된다 — 원판과 카드가 색으로 이어진다
        if (el.result.style && el.result.style.setProperty) {
            el.result.style.setProperty('--pick', SEG[state.picked % SEG.length]);
        }
        el.result.hidden = false;
        setPhase('done');
    }

    /** 벌칙이 아니라 결정이다. 아무도 안 다쳤으니 축하해도 된다 (규격 8-17). */
    function spawnConfetti() {
        var g = geom(), i;
        for (i = 0; i < 46; i++) {
            state.confetti.push({
                x: g.cx + (Math.random() - 0.5) * g.r * 1.6,
                y: g.cy - g.r * 0.4 - Math.random() * 40,
                vx: (Math.random() - 0.5) * 130,
                vy: -90 - Math.random() * 150,
                r: 3 + Math.random() * 4,
                a: Math.random() * Math.PI,
                va: (Math.random() - 0.5) * 9,
                c: SEG[Math.floor(Math.random() * SEG.length)],
                life: 1
            });
        }
    }

    /**
     * 타격 파편 + 번개. 닿은 자리에서 흰·하늘색·금색 조각이 튀고 번개가 서너 갈래 갈라진다.
     * 파편은 색종이와 같은 입자를 쓰되 빨리 꺼진다. 혼신의 일격이면 번개가 더 많다.
     */
    function spawnSparks() {
        var g = geom(), c = hammerContact(g), i, j;
        var perfect = state.power >= PERFECT;
        for (i = 0; i < 16; i++) {
            var a = -Math.PI * 1.05 + Math.random() * Math.PI * 1.1;   // 위쪽 반원으로
            var v = 160 + Math.random() * 260;
            state.confetti.push({
                x: c.x, y: c.y,
                vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                r: 1.6 + Math.random() * 2.2,
                a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 14,
                c: ['#ffffff', '#9fd8ff', '#f7c948'][i % 3],
                life: 1, decay: 2.4
            });
        }
        // 번개 — 접점에서 바깥으로 지그재그. 갈래마다 5~6마디
        state.bolts = [];
        var nb = perfect ? 6 : 3;
        for (i = 0; i < nb; i++) {
            var dir = -Math.PI * 0.95 + (i + 0.5) / nb * Math.PI * 1.0 + (Math.random() - 0.5) * 0.4;
            var pts = [], x = 0, y = 0, len = g.r * (perfect ? 0.5 : 0.36);
            var steps = 5 + Math.floor(Math.random() * 2);
            for (j = 0; j < steps; j++) {
                var side = (Math.random() - 0.5) * len * 0.28;
                x += Math.cos(dir) * (len / steps) + Math.cos(dir + Math.PI / 2) * side;
                y += Math.sin(dir) * (len / steps) + Math.sin(dir + Math.PI / 2) * side;
                pts.push([x, y]);
            }
            state.bolts.push(pts);
        }
    }

    function backToSetup() {
        stopLoop();
        state = null;
        el.play.hidden = true;
        el.result.hidden = true;
        el.setup.hidden = false;
        if (el.setup.scrollIntoView) {
            el.setup.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }

    function again() {
        el.result.hidden = true;
        startGame();
    }

    // ══════════════════════════════════════════════════════════
    //  루프
    // ══════════════════════════════════════════════════════════
    function startLoop() {
        if (running) { return; }
        running = true;
        lastNow = performance.now();
        raf = requestAnimationFrame(loop);
    }

    function stopLoop() { running = false; cancelAnimationFrame(raf); }

    function loop(now) {
        if (!running) { return; }
        var dt = Math.min(0.05, (now - lastNow) / 1000);
        lastNow = now;
        step(dt);
        draw();
        raf = requestAnimationFrame(loop);
    }

    function step(dt) {
        var t = phaseT();

        state.shake *= Math.pow(0.05, dt);
        state.pinBend *= Math.pow(0.004, dt);
        state.flash *= Math.pow(0.02, dt);
        state.glow *= Math.pow(0.35, dt);
        state.impact *= Math.pow(0.002, dt);
        state.wave *= Math.pow(0.03, dt);
        state.pop *= Math.pow(0.3, dt);
        state.run = Math.max(0, state.run - dt / 0.7);

        // 해머 잔상 — 직전 넉 장의 각도만 기억한다
        state.trail.push(hammerAngle(state.hammer));
        if (state.trail.length > 4) { state.trail.shift(); }

        stepConfetti(dt);

        switch (state.phase) {
        case 'ready':
            stepGauge(dt);
            state.hammer += (0 - state.hammer) * (1 - Math.pow(0.02, dt));
            break;

        case 'strike':
            // 해머가 내려온다. 뒤로 갈수록 빨라진다.
            // 만점이면 닿기 직전(82%)에 HITSTOP_MS 만큼 멈췄다가 마저 내려온다
            var u = t;
            if (state.perfect) {
                var ms = performance.now() - state.t0, pre = STRIKE_MS * 0.82;
                if (ms < pre) { u = ms / STRIKE_MS; }
                else if (ms < pre + HITSTOP_MS) { u = 0.82; state.hold = 1; }
                else { u = Math.min(1, (ms - HITSTOP_MS) / STRIKE_MS); state.hold = 0; }
            }
            state.hammer = Math.pow(u, 0.55);
            if (t >= 1) { impact(); }
            break;

        case 'spin':
            state.hammer += (0 - state.hammer) * (1 - Math.pow(0.06, dt));
            stepSpin(t);
            if (t >= 1) { settle(); }
            break;

        case 'reveal':
            if (t >= 1) { reveal(); }
            break;
        }
    }

    /** 게이지가 0~100 을 왕복한다. 끝에 닿을 때마다 째깍 소리가 난다. */
    function stepGauge(dt) {
        state.gaugeT += dt / GAUGE_PERIOD;
        var u = state.gaugeT % 1;
        state.gaugeVal = (u < 0.5 ? u * 2 : (1 - u) * 2) * 100;

        var edge = Math.floor(state.gaugeT * 2);
        if (edge !== state.lastEdge) {
            state.lastEdge = edge;
            sfx.tick(edge % 2 === 0);
        }
        if (el.gaugeFill) {
            el.gaugeFill.style.width = state.gaugeVal.toFixed(1) + '%';
            el.gaugeNum.textContent = String(Math.round(state.gaugeVal));
            el.gauge.classList.toggle('is-perfect', state.gaugeVal >= PERFECT);
        }
    }

    function stepSpin(t) {
        state.ang = state.spinFrom + (state.spinTo - state.spinFrom) * spinEase(t);

        // 딸깍 — 바늘이 못을 튕긴다. 간격이 곧 속도다.
        var slice = sliceDeg(state.n);
        var a1 = Math.floor(state.ang / slice);
        if (a1 !== state.lastTick) {
            var steps = Math.min(3, a1 - state.lastTick);
            var speed = 1 - spinEase(t);
            var i;
            for (i = 0; i < steps; i++) { sfx.click(speed); }
            state.lastTick = a1;
            state.pinBend = 1;
        }
    }

    function stepConfetti(dt) {
        var i, p;
        for (i = state.confetti.length - 1; i >= 0; i--) {
            p = state.confetti[i];
            p.vy += 420 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.a += p.va * dt;
            p.life -= dt * (p.decay || 0.42);
            if (p.life <= 0 || p.y > view.h + 30) { state.confetti.splice(i, 1); }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  그리기
    //
    //  목표는 "상품 룰렛" 이다 — 놀이공원·카지노에 있는 그 원판.
    //  남색 테두리에 전구가 한 바퀴 돌아가며 깜빡이고, 금색 몰딩이 두 줄,
    //  칸은 사탕처럼 광택이 나고, 가운데는 보석 허브다.
    //  해머는 토르의 묠니르 — 넓적하고 무거운 강철 머리, 가죽을 감은 짧은 자루,
    //  끝에는 가죽 고리. 내려찍으면 번개가 튄다.
    //
    //  재질은 전부 코드로 낸다. 잉크 외곽선 + 2톤(밝은 면·어두운 면) + 얇은 그라디언트.
    //  PNG 는 하나도 없다.
    // ══════════════════════════════════════════════════════════

    /* 아트 팔레트 한 장. 여기 색 밖의 색은 쓰지 않는다. */
    var INK = '#1e2130';                       // 외곽선
    var GOLD = { hi: '#fff3b8', base: '#f7c948', lo: '#c98d12', deep: '#7a4f08' };
    var NAVY = { hi: '#2f3f6e', base: '#1c2647', lo: '#0f1530' };
    var STEEL = { hi: '#eef2f8', base: '#b3bccb', lo: '#6c7789', deep: '#3a4252' };
    var LEATHER = { hi: '#a86a3c', base: '#7b4a28', lo: '#4a2a14' };
    var GEM = { hi: '#ff9db0', base: '#ff3d63', lo: '#a3122f' };

    /*
     * 움직임을 줄여 달라는 설정이면 잔상·궤적·전구 체이스를 뺀다. 잔상은 재미지 정보가 아니다.
     * 검증 하네스의 가짜 window 에는 matchMedia 가 없으니 있는지 먼저 본다.
     */
    var reduceMotion = !!(window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /** 외곽선 굵기. 원판 크기에 따라 2~3.5px. */
    function inkWidth(r) { return Math.max(2, Math.min(3.5, r * 0.022)); }

    /** '#rrggbb' 를 다른 색 쪽으로 t 만큼 섞는다. 칸 색의 밝은 톤·어두운 톤을 여기서 뽑는다. */
    function mix(hex, to, t) {
        var a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
        var r = ((a >> 16) + (((b >> 16) - (a >> 16)) * t)) | 0;
        var g = (((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t)) | 0;
        var bl = ((a & 255) + (((b & 255) - (a & 255)) * t)) | 0;
        return 'rgb(' + r + ',' + g + ',' + bl + ')';
    }

    /** 테마별 무대. 원판·해머는 두 테마에서 같고 배경만 바뀐다. */
    function theme() {
        var root = document.documentElement;       // 검증 하네스의 가짜 document 에는 없다
        var light = !!root && root.getAttribute('data-theme') === 'light';
        return light
            ? { bg1: '#e4e9f2', bg2: '#b9c4d4', ray: 'rgba(255,255,255,0.30)', vig: 0.2, floor: 'rgba(30,33,48,0.10)' }
            : { bg1: '#1a2140', bg2: '#080b16', ray: 'rgba(255,255,255,0.045)', vig: 0.5, floor: 'rgba(0,0,0,0.3)' };
    }

    function resize() {
        if (!canvas) { return; }
        var rect = canvas.parentNode.getBoundingClientRect();
        var w = Math.max(260, Math.round(rect.width));
        var h = Math.round(Math.max(300, Math.min(440, window.innerHeight * 0.46)));
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        view.w = w; view.h = h;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /**
     * 배치. 원판이 절대 잘리지 않게 잡는다.
     *
     * ⚠ 앞 판은 카메라 줌(x1.9)을 걸었다가 아래가 잘렸다. 줌을 아예 뺐다 —
     *   한 번 돌리고 끝나는 게임이라 화면을 옮겨 다닐 이유가 없다.
     *   반지름은 폭·높이 양쪽으로 묶는다. 해머가 오른쪽으로 뻗으므로 폭을 더 짜게 준다.
     *   r 은 칸의 반지름이고, 전구 테두리가 그 바깥에 14% 더 붙는다.
     */
    function geom() {
        return {
            cx: view.w / 2,
            cy: view.h * 0.53,
            r: Math.min(view.w * 0.34, view.h * 0.36)
        };
    }

    /** 전구 테두리 두께. 원판 그리기와 해머 접점 계산이 같이 쓴다. */
    function rimWidth(r) { return Math.max(15, r * 0.14); }

    /**
     * 해머의 손 위치와 자루 길이. 그리기와 타격점 계산이 같은 값을 써야 한다.
     *
     * 내려찍은 순간 타격면이 테두리의 50도 지점에 접선으로 닿게 역산한 값이다 —
     * 접점 P 에서 바깥 법선으로 머리 반폭만큼 나간 곳이 머리 중심, 거기서 접선을 따라
     * 자루 길이만큼 간 곳이 손이다. 든 자세(-0.1rad)의 머리가 폭 344px·높이 300px
     * 캔버스 안에 들어가도록 잡았다. 앞 판은 머리가 원판 한가운데를 때렸다.
     */
    function hammerGeom(g) {
        return {
            hx: g.cx + g.r * 1.188,
            hy: g.cy - g.r * 0.70,
            L: g.r * 0.46,
            hw: g.r * 0.4,           // 머리 폭 (자루와 직각 방향)
            hh: g.r * 0.27           // 머리 높이 (자루 방향)
        };
    }

    /** 들림(0) -> 내려찍음(1) 을 각도로. -50도에서 자루가 테두리에 접선이 된다. */
    function hammerAngle(h) { return -0.1 + (-0.873 + 0.1) * h; }

    /** 해머 타격면이 닿는 화면 좌표. 파편과 번개가 여기서 나온다. */
    function hammerContact(g) {
        var hm = hammerGeom(g), a = hammerAngle(1);
        var lx = -hm.hw / 2, ly = -hm.L;
        return {
            x: hm.hx + lx * Math.cos(a) - ly * Math.sin(a),
            y: hm.hy + lx * Math.sin(a) + ly * Math.cos(a)
        };
    }

    function draw() {
        var g = geom();

        ctx.clearRect(0, 0, view.w, view.h);
        drawBackdrop(g);

        ctx.save();
        var sh = state.shake;
        if (sh > 0.4) {
            ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
        }

        drawShadow(g);
        drawWheel(g);
        drawHub(g);
        drawPointer(g);
        drawHammer(g);
        drawImpact(g);
        drawPerfectFx(g);

        ctx.restore();

        drawConfetti();
        drawFlash();
    }

    function drawBackdrop(g) {
        var t = theme();
        var now = performance.now();
        var i;

        var bg = ctx.createRadialGradient(g.cx, g.cy - g.r * 0.3, g.r * 0.4, g.cx, g.cy, g.r * 2.6);
        bg.addColorStop(0, t.bg1);
        bg.addColorStop(1, t.bg2);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, view.w, view.h);

        // 뒤에서 천천히 도는 빛살 — 포스터의 그 무늬. 결과가 나오면 확 밝아진다
        ctx.save();
        ctx.translate(g.cx, g.cy);
        ctx.rotate(reduceMotion ? 0 : now * 0.00008);
        ctx.globalAlpha = 1 + state.glow * 3;
        ctx.fillStyle = t.ray;
        var RAYS = 14, big = Math.max(view.w, view.h) * 1.2;
        for (i = 0; i < RAYS; i++) {
            var a0 = (i / RAYS) * Math.PI * 2, a1 = a0 + Math.PI / RAYS;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, big, a0, a1);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // 후광 — 결정된 순간의 보상
        if (state.glow > 0.02) {
            var ha = ctx.createRadialGradient(g.cx, g.cy, g.r * 0.6, g.cx, g.cy, g.r * 2);
            ha.addColorStop(0, 'rgba(255,214,90,' + (state.glow * 0.45).toFixed(3) + ')');
            ha.addColorStop(1, 'rgba(255,214,90,0)');
            ctx.fillStyle = ha;
            ctx.fillRect(0, 0, view.w, view.h);
        }

        // 바닥 — 원판 아래 어두운 띠. 물건이 놓인 자리가 생긴다
        ctx.fillStyle = t.floor;
        ctx.fillRect(0, g.cy + g.r * 1.1, view.w, view.h);

        // 비네트 — 가장자리를 조인다
        var vg = ctx.createRadialGradient(
            view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.3,
            view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.72);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,' + t.vig + ')');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, view.w, view.h);
    }

    /** 접촉 그림자. 거리감은 그림자가 만든다. */
    function drawShadow(g) {
        var R = g.r + rimWidth(g.r);
        ctx.save();
        ctx.translate(g.cx, g.cy + R * 1.04);
        ctx.scale(1, 0.13);
        var grd = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        grd.addColorStop(0, 'rgba(0,0,0,0.55)');
        grd.addColorStop(0.7, 'rgba(0,0,0,0.25)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function segmentPath(rr, a0, a1) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, rr, a0, a1);
        ctx.closePath();
    }

    /**
     * 칸 전부. 사탕 광택 — 허브 쪽이 하얗게 밝고 테두리 쪽으로 진해진다.
     * 뽑힌 칸은 건너뛴다 (맨 위에 따로 그린다). decided 면 나머지가 물러난다.
     */
    function drawSegments(r, ang, n, slice, decided, k) {
        var i;
        for (i = 0; i < n; i++) {
            if (decided && state.picked === i) { continue; }
            var a0 = (i * slice + ang - 90) * Math.PI / 180;
            var a1 = ((i + 1) * slice + ang - 90) * Math.PI / 180;
            var c = SEG[i % SEG.length];

            segmentPath(r, a0, a1);
            var grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
            grd.addColorStop(0, mix(c, '#ffffff', 0.55));
            grd.addColorStop(0.35, mix(c, '#ffffff', 0.12));
            grd.addColorStop(0.8, c);
            grd.addColorStop(1, mix(c, '#000000', 0.22));
            ctx.fillStyle = grd;
            ctx.fill();

            if (decided) {
                ctx.fillStyle = 'rgba(14,17,32,' + (0.6 * k).toFixed(3) + ')';
                ctx.fill();
            }
        }
    }

    function drawWheel(g) {
        var n = state.n;
        var slice = sliceDeg(n);
        var r = g.r;
        var line = inkWidth(r);
        var rim = rimWidth(r);
        var R = r + rim;
        var decided = state.picked >= 0 && (state.phase === 'reveal' || state.phase === 'done');
        var k = state.phase === 'done' ? 1 : (state.phase === 'reveal' ? phaseT() : 0);
        var speed = state.phase === 'spin' ? (1 - spinEase(phaseT())) : 0;
        var i;

        ctx.save();
        ctx.translate(g.cx, g.cy);

        // ── 테두리 — 남색 몰딩. 잉크 -> 남색(위 밝고 아래 어둡게) -> 금색 몰딩 두 줄 ──
        ctx.beginPath(); ctx.arc(0, 0, R + line, 0, Math.PI * 2);
        ctx.fillStyle = INK; ctx.fill();
        var ng = ctx.createLinearGradient(0, -R, 0, R);
        ng.addColorStop(0, NAVY.hi);
        ng.addColorStop(0.5, NAVY.base);
        ng.addColorStop(1, NAVY.lo);
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fillStyle = ng; ctx.fill();

        var gold = ctx.createLinearGradient(-R, -R, R, R);
        gold.addColorStop(0, GOLD.hi);
        gold.addColorStop(0.4, GOLD.base);
        gold.addColorStop(0.75, GOLD.lo);
        gold.addColorStop(1, GOLD.base);
        ctx.strokeStyle = gold;
        ctx.lineWidth = Math.max(2.5, rim * 0.17);
        ctx.beginPath(); ctx.arc(0, 0, R - ctx.lineWidth * 0.7, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, r + ctx.lineWidth * 0.7, 0, Math.PI * 2); ctx.stroke();
        // 몰딩 아래 그늘 한 줄 — 두께가 생긴다
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, r + rim * 0.27, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, R - rim * 0.27, 0, Math.PI * 2); ctx.stroke();

        // ── 칸 ─────────────────────────────────────────────
        // 빨리 돌 때는 뒤에 반투명 잔상을 두 장 깐다 — 눈이 "빠르다" 고 믿는 건 이거다
        if (speed > 0.35 && !reduceMotion) {
            var blur = (speed - 0.35) / 0.65;
            ctx.globalAlpha = 0.28 * blur;
            drawSegments(r, state.ang - 16 * blur, n, slice, decided, k);
            ctx.globalAlpha = 0.5 * blur;
            drawSegments(r, state.ang - 7 * blur, n, slice, decided, k);
            ctx.globalAlpha = 1;
        }
        drawSegments(r, state.ang, n, slice, decided, k);

        // 칸 경계 — 그늘 한 줄 위에 흰 선. 선이 살짝 떠 보인다
        ctx.lineCap = 'round';
        for (i = 0; i < n; i++) {
            var pa = (i * slice + state.ang - 90) * Math.PI / 180;
            var ex = Math.cos(pa) * r, ey = Math.sin(pa) * r;
            ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = line * 1.8;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = line * 0.7;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
        }

        // 몰딩이 칸에 드리우는 안쪽 그림자
        var ig = ctx.createRadialGradient(0, 0, r * 0.86, 0, 0, r);
        ig.addColorStop(0, 'rgba(15,21,48,0)');
        ig.addColorStop(1, 'rgba(15,21,48,0.4)');
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = ig; ctx.fill();

        // ── 뽑힌 칸 — 8px 튀어나오고 하얗게 차오른다. 몰딩 위로 올라온다 ──
        if (decided) {
            var pi = state.picked;
            var b0 = (pi * slice + state.ang - 90) * Math.PI / 180;
            var b1 = ((pi + 1) * slice + state.ang - 90) * Math.PI / 180;
            var pc = SEG[pi % SEG.length];
            segmentPath(r + 8 * k, b0, b1);
            ctx.fillStyle = mix(pc, '#ffffff', 0.15); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,' + (0.42 * k).toFixed(3) + ')'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = line; ctx.lineJoin = 'round'; ctx.stroke();
        }

        // ── 광택 — 왼쪽 위에서 오는 유리 반사. 원판에 클립한다 ──
        ctx.save();
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
        var gl = ctx.createLinearGradient(-r, -r, r * 0.25, r * 0.45);
        gl.addColorStop(0, 'rgba(255,255,255,0.32)');
        gl.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        gl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();

        // ── 이름 — 빨리 돌 때는 생략한다. 안 읽히기도 하고, 그게 곧 속도감이다 ──
        if (speed < 0.30) {
            var alpha = state.phase === 'spin' ? Math.min(1, (0.30 - speed) / 0.16) : 1;
            for (i = 0; i < n; i++) { drawLabel(i, n, slice, r, alpha, decided && state.picked === i); }
        }

        drawBulbs(r, rim, n, slice, decided);

        ctx.restore();
    }

    /**
     * 테두리 전구. 칸 경계마다 하나는 꼭 오고(그게 바늘이 튕기는 못이다),
     * 그 사이를 채워 최소 12개가 되게 한다. 원판과 같이 돈다.
     *
     *   대기    — 짝수·홀수가 번갈아 깜빡인다
     *   회전 중 — 불이 한 방향으로 달린다
     *   결정    — 전부 켜져서 숨쉰다
     */
    function drawBulbs(r, rim, n, slice, decided) {
        var per = Math.ceil(12 / n), B = per * n;
        var br = Math.max(3.4, rim * 0.25);
        var now = performance.now();
        var phase = state.phase;
        var i;

        for (i = 0; i < B; i++) {
            var lit, glow = 1;
            if (decided) {
                lit = true; glow = 0.75 + 0.25 * Math.sin(now / 130 + i);
            } else if (state.hold || state.wave > 0.12) {
                // 만점 — 히트스톱 동안, 그리고 터진 직후 전부 켜진다. 보통 타격엔 없다
                lit = true; glow = 1.4;
            } else if (phase === 'spin' || phase === 'strike') {
                lit = reduceMotion ? i % 2 === 0 : ((i + Math.floor(now / 70)) % 3 === 0);
            } else {
                lit = reduceMotion ? true : ((i + Math.floor(now / 420)) % 2 === 0);
            }
            var a = (i * slice / per + state.ang - 90) * Math.PI / 180;
            var x = Math.cos(a) * (r + rim * 0.5), y = Math.sin(a) * (r + rim * 0.5);

            // 소켓
            ctx.beginPath(); ctx.arc(x, y, br + 1.5, 0, Math.PI * 2);
            ctx.fillStyle = INK; ctx.fill();
            if (lit) {
                ctx.fillStyle = 'rgba(255,214,110,' + (0.22 * glow).toFixed(3) + ')';
                ctx.beginPath(); ctx.arc(x, y, br * 2.6, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,230,150,' + (0.4 * glow).toFixed(3) + ')';
                ctx.beginPath(); ctx.arc(x, y, br * 1.7, 0, Math.PI * 2); ctx.fill();
            }
            ctx.beginPath(); ctx.arc(x, y, br, 0, Math.PI * 2);
            ctx.fillStyle = lit ? '#fff6cf' : '#6d5f48'; ctx.fill();
            // 유리알 반사
            ctx.beginPath(); ctx.arc(x - br * 0.3, y - br * 0.3, br * 0.32, 0, Math.PI * 2);
            ctx.fillStyle = lit ? '#fff' : 'rgba(255,255,255,0.35)'; ctx.fill();
        }
    }

    function drawLabel(i, n, slice, r, alpha, isPicked) {
        var mid = (i * slice + slice / 2 + state.ang - 90) * Math.PI / 180;
        var rr = r * 0.62;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(Math.cos(mid) * rr, Math.sin(mid) * rr);

        // 글자가 뒤집히지 않게 — 아래쪽 절반은 반대로 돌린다
        var rot = mid + Math.PI / 2;
        var deg = ((rot * 180 / Math.PI) % 360 + 360) % 360;
        if (deg > 90 && deg < 270) { rot += Math.PI; }
        ctx.rotate(rot);

        var nm = state.names[i];
        // 칸이 좁을수록 글자를 줄인다
        var fs = Math.max(11, Math.min(20, r * (n > 6 ? 0.115 : 0.145)));
        var lim = n > 6 ? 5 : 7;
        if (nm.length > lim) { nm = nm.slice(0, lim - 1) + '…'; }

        ctx.font = '800 ' + fs + 'px Manrope, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = fs * 0.34;
        ctx.strokeStyle = 'rgba(20,22,40,0.75)';
        ctx.strokeText(nm, 0, 0);
        ctx.fillStyle = isPicked ? '#fff7d6' : '#fff';
        ctx.fillText(nm, 0, 0);

        ctx.restore();
    }

    /** 가운데 축 — 금색 허브에 붉은 보석. 축이 있어야 도는 물건으로 보인다. */
    function drawHub(g) {
        var r = Math.max(15, g.r * 0.15);
        var line = inkWidth(g.r);
        ctx.save();
        ctx.translate(g.cx, g.cy);

        // 바닥 그림자
        ctx.beginPath(); ctx.arc(0, r * 0.14, r + line + 1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();

        // 잉크 -> 금색 (위 밝고 아래 어둡게)
        ctx.beginPath(); ctx.arc(0, 0, r + line, 0, Math.PI * 2);
        ctx.fillStyle = INK; ctx.fill();
        var gg = ctx.createLinearGradient(0, -r, 0, r);
        gg.addColorStop(0, GOLD.hi);
        gg.addColorStop(0.45, GOLD.base);
        gg.addColorStop(1, GOLD.lo);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = gg; ctx.fill();

        // 흰 링 — 금과 보석을 가른다
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1.5, r * 0.1);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2); ctx.stroke();

        // 보석
        ctx.beginPath(); ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2);
        ctx.fillStyle = GEM.lo; ctx.fill();
        var jg = ctx.createRadialGradient(-r * 0.2, -r * 0.24, 0, 0, 0, r * 0.52);
        jg.addColorStop(0, GEM.hi);
        jg.addColorStop(0.5, GEM.base);
        jg.addColorStop(1, GEM.lo);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = jg; ctx.fill();
        ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.24, r * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();

        ctx.restore();
    }

    /** 바늘. 못에 걸려 휘었다 튕긴다 — 딸깍이 눈에도 보인다. */
    function drawPointer(g) {
        var bend = state.pinBend * 0.34;
        var s = Math.max(0.85, Math.min(1.3, g.r / 120));   // 원판 크기에 따라 같이 커진다
        var line = inkWidth(g.r);
        ctx.save();
        // 끝이 칸 안쪽으로 살짝 들어온다 (몰딩 위를 지난다)
        ctx.translate(g.cx, g.cy - g.r * 0.96 - 24 * s);
        ctx.rotate(bend);
        ctx.scale(s, s);
        ctx.lineJoin = 'round';

        // 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.moveTo(-11, -14); ctx.lineTo(14, -14); ctx.lineTo(3, 27); ctx.closePath();
        ctx.fill();

        // 몸통 — 금색 2톤: 왼쪽 밝고 오른쪽 어둡다
        ctx.beginPath();
        ctx.moveTo(-12, -17); ctx.lineTo(12, -17); ctx.lineTo(0, 24); ctx.closePath();
        ctx.fillStyle = GOLD.base; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -17); ctx.lineTo(12, -17); ctx.lineTo(0, 24); ctx.closePath();
        ctx.fillStyle = GOLD.lo; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-8, -14); ctx.lineTo(-3, -14); ctx.lineTo(-1, 8); ctx.closePath();
        ctx.fillStyle = GOLD.hi; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-12, -17); ctx.lineTo(12, -17); ctx.lineTo(0, 24); ctx.closePath();
        ctx.strokeStyle = INK; ctx.lineWidth = line / s; ctx.stroke();

        // 꼭지 보석
        ctx.beginPath(); ctx.arc(0, -17, 8, 0, Math.PI * 2);
        ctx.fillStyle = INK; ctx.fill();
        var cg = ctx.createRadialGradient(-2, -19, 0, 0, -17, 7);
        cg.addColorStop(0, GEM.hi); cg.addColorStop(0.6, GEM.base); cg.addColorStop(1, GEM.lo);
        ctx.beginPath(); ctx.arc(0, -17, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = cg; ctx.fill();
        ctx.beginPath(); ctx.arc(-2.2, -19.5, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
        ctx.restore();
    }

    /**
     * 해머 — 묠니르. 때리는 물건이 화면에 있어야 때린 게 된다.
     *
     * 손 위치를 원판 오른쪽 위에 두고 자루가 손에서 위로 뻗는다.
     * 넓적한 강철 머리(양끝이 벌어진 타격면 + 새김 무늬), 가죽을 감은 짧은 자루,
     * 끝에 강철 마감과 가죽 고리. 휘두르는 동안은 지나온 자리에 잔상을 남긴다.
     */
    function drawHammer(g) {
        var hm = hammerGeom(g);
        var L = hm.L, hw = hm.hw, hh = hm.hh;
        var line = inkWidth(g.r);
        var a = hammerAngle(state.hammer);
        var i;

        ctx.save();
        ctx.translate(hm.hx, hm.hy);

        // 궤적 잔상 — 직전 프레임들의 머리를 옅게. 휘두를 때만 보인다
        if (!reduceMotion) {
            for (i = 0; i < state.trail.length; i++) {
                var ta = state.trail[i];
                if (Math.abs(ta - a) < 0.05) { continue; }
                ctx.save();
                ctx.rotate(ta);
                ctx.globalAlpha = 0.10 + 0.10 * i;
                ctx.fillStyle = STEEL.hi;
                roundRectPath(-hw / 2, -L - hh / 2, hw, hh, hh * 0.16);
                ctx.fill();
                ctx.restore();
            }
            // 휘두른 호 — 머리가 지나간 길을 흰 띠로
            if (state.trail.length && Math.abs(state.trail[0] - a) > 0.1) {
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = hh * 0.6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                // 자루 방향이 -y 이므로 각도에 -90도를 더한다
                ctx.arc(0, 0, L, state.trail[0] - Math.PI / 2, a - Math.PI / 2, state.trail[0] > a);
                ctx.stroke();
                ctx.restore();
            }
        }

        ctx.rotate(a);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // 만점 오라 — 히트스톱 동안 머리가 금빛으로 달아오르고 잔번개가 튄다
        if (state.hold) {
            var pulse = 0.75 + 0.25 * Math.sin(performance.now() / 28);
            var ag = ctx.createRadialGradient(0, -L, hw * 0.3, 0, -L, hw * 1.6);
            ag.addColorStop(0, 'rgba(255,230,140,' + (0.9 * pulse).toFixed(3) + ')');
            ag.addColorStop(0.45, 'rgba(255,200,60,' + (0.4 * pulse).toFixed(3) + ')');
            ag.addColorStop(1, 'rgba(255,200,60,0)');
            ctx.fillStyle = ag;
            ctx.beginPath(); ctx.arc(0, -L, hw * 1.6, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(180,230,255,0.9)'; ctx.lineWidth = 1.6;
            for (i = 0; i < 5; i++) {
                var za = Math.random() * Math.PI * 2, zr = hw * (0.55 + Math.random() * 0.35);
                ctx.beginPath();
                ctx.moveTo(Math.cos(za) * hw * 0.45, -L + Math.sin(za) * hh * 0.6);
                ctx.lineTo(Math.cos(za) * zr + (Math.random() - 0.5) * 6, -L + Math.sin(za) * zr * 0.7);
                ctx.stroke();
            }
        }

        // ── 자루 — 가죽 감기 ───────────────────────────────
        var sw = Math.max(7, g.r * 0.085);
        var top = -L + hh * 0.3, bottom = sw * 1.1;
        roundRectPath(-sw / 2 - line, top, sw + line * 2, bottom - top + line, sw * 0.35);
        ctx.fillStyle = INK; ctx.fill();
        var lg = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
        lg.addColorStop(0, LEATHER.hi);
        lg.addColorStop(0.5, LEATHER.base);
        lg.addColorStop(1, LEATHER.lo);
        roundRectPath(-sw / 2, top, sw, bottom - top, sw * 0.3);
        ctx.fillStyle = lg; ctx.fill();
        // 감긴 가죽 — 사선 홈. 위는 밝고 아래는 어두운 선이 한 쌍
        ctx.save();
        roundRectPath(-sw / 2, top, sw, bottom - top, sw * 0.3); ctx.clip();
        ctx.lineWidth = 1.3;
        for (i = top + sw * 0.8; i < bottom + sw; i += sw * 0.62) {
            ctx.strokeStyle = 'rgba(0,0,0,0.42)';
            ctx.beginPath(); ctx.moveTo(-sw / 2, i); ctx.lineTo(sw / 2, i - sw * 0.5); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,220,180,0.28)';
            ctx.beginPath(); ctx.moveTo(-sw / 2, i + 1.6); ctx.lineTo(sw / 2, i + 1.6 - sw * 0.5); ctx.stroke();
        }
        ctx.restore();

        // 끝 마감 — 강철 캡 + 가죽 고리
        roundRectPath(-sw / 2 - line - 1, bottom - sw * 0.55, sw + line * 2 + 2, sw * 0.6, 3);
        ctx.fillStyle = INK; ctx.fill();
        var capg = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
        capg.addColorStop(0, STEEL.hi); capg.addColorStop(0.5, STEEL.base); capg.addColorStop(1, STEEL.lo);
        roundRectPath(-sw / 2 - 1, bottom - sw * 0.5, sw + 2, sw * 0.5, 2);
        ctx.fillStyle = capg; ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = line * 1.6;
        ctx.beginPath();
        ctx.moveTo(-sw * 0.25, bottom);
        ctx.bezierCurveTo(-sw * 1.2, bottom + sw * 1.3, sw * 1.2, bottom + sw * 1.3, sw * 0.25, bottom);
        ctx.stroke();
        ctx.strokeStyle = LEATHER.base; ctx.lineWidth = line * 0.8;
        ctx.stroke();

        // ── 머리 — 강철 ────────────────────────────────────
        var hx0 = -hw / 2, hy0 = -L - hh / 2;
        var cap = hw * 0.16, flare = hh * 0.07;     // 양끝 타격면은 살짝 더 크다
        // 잉크 실루엣 (몸통 + 벌어진 양끝)
        roundRectPath(hx0 - line, hy0 - line, hw + line * 2, hh + line * 2, hh * 0.16 + line);
        ctx.fillStyle = INK; ctx.fill();
        roundRectPath(hx0 - line, hy0 - flare - line, cap + line * 2, hh + flare * 2 + line * 2, 3 + line);
        ctx.fill();
        roundRectPath(hx0 + hw - cap - line, hy0 - flare - line, cap + line * 2, hh + flare * 2 + line * 2, 3 + line);
        ctx.fill();
        // 몸통 — 위 밝고 아래 어둡다
        var mg = ctx.createLinearGradient(0, hy0, 0, hy0 + hh);
        mg.addColorStop(0, STEEL.hi);
        mg.addColorStop(0.3, STEEL.base);
        mg.addColorStop(0.75, STEEL.lo);
        mg.addColorStop(1, STEEL.deep);
        roundRectPath(hx0, hy0, hw, hh, hh * 0.16);
        ctx.fillStyle = mg; ctx.fill();
        // 타격면 — 한 톤 어두운 강철에 잉크 경계
        var cg2 = ctx.createLinearGradient(0, hy0 - flare, 0, hy0 + hh + flare);
        cg2.addColorStop(0, STEEL.base);
        cg2.addColorStop(0.5, STEEL.lo);
        cg2.addColorStop(1, STEEL.deep);
        ctx.fillStyle = cg2;
        roundRectPath(hx0, hy0 - flare, cap, hh + flare * 2, 3); ctx.fill();
        roundRectPath(hx0 + hw - cap, hy0 - flare, cap, hh + flare * 2, 3); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = line * 0.7;
        ctx.beginPath();
        ctx.moveTo(hx0 + cap, hy0); ctx.lineTo(hx0 + cap, hy0 + hh);
        ctx.moveTo(hx0 + hw - cap, hy0); ctx.lineTo(hx0 + hw - cap, hy0 + hh);
        ctx.stroke();
        // 새김 무늬 — 안쪽 테 두 줄 + 가운데 마름모. 묠니르의 그 문양
        var ix = hx0 + cap + hw * 0.06, iy = hy0 + hh * 0.18, iw = hw - cap * 2 - hw * 0.12, ih = hh * 0.64;
        ctx.strokeStyle = 'rgba(30,33,48,0.55)'; ctx.lineWidth = 1.2;
        ctx.strokeRect(ix, iy, iw, ih);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.strokeRect(ix + 1.2, iy + 1.2, iw, ih);
        var dx = ix + iw / 2, dy = iy + ih / 2, ds = Math.min(iw, ih) * 0.3;
        ctx.beginPath();
        ctx.moveTo(dx, dy - ds); ctx.lineTo(dx + ds, dy); ctx.lineTo(dx, dy + ds); ctx.lineTo(dx - ds, dy); ctx.closePath();
        ctx.fillStyle = STEEL.deep; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        // 반사광 — 윗면 왼쪽에 길게
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        roundRectPath(hx0 + cap + 2, hy0 + 2, iw * 0.55, hh * 0.09, 2); ctx.fill();

        // 자루가 머리에 박히는 자리 — 강철 깃
        roundRectPath(-sw * 0.6 - line, hy0 + hh - line, sw * 1.2 + line * 2, hh * 0.3 + line * 2, 2 + line);
        ctx.fillStyle = INK; ctx.fill();
        roundRectPath(-sw * 0.6, hy0 + hh, sw * 1.2, hh * 0.3, 2);
        ctx.fillStyle = STEEL.lo; ctx.fill();
        ctx.fillStyle = STEEL.hi;
        ctx.fillRect(-sw * 0.5, hy0 + hh + 1.5, sw, 1.5);

        // 만점 림라이트 — 히트스톱 동안 머리 윤곽이 금빛으로 탄다. 오라가 머리에 가려지니 위에 한 번 더
        if (state.hold) {
            ctx.strokeStyle = 'rgba(255,225,120,' + (0.55 + 0.35 * Math.sin(performance.now() / 28)).toFixed(3) + ')';
            ctx.lineWidth = line * 2.2;
            roundRectPath(hx0 - line, hy0 - flare - line, hw + line * 2, hh + flare * 2 + line * 2, hh * 0.16 + line);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * 타격 순간 — 닿은 자리에서 번개가 갈라지고 별이 번쩍인다.
     * impact 가 1 에서 0 으로 식는 동안만 보인다. 번개 모양은 spawnSparks 가 정한다.
     */
    function drawImpact(g) {
        var im = state.impact;
        if (im <= 0.02) { return; }
        var c = hammerContact(g);
        var n = 8, i, j;
        var s = g.r * (0.14 + 0.2 * (1 - im));   // 커지면서 옅어진다
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.globalAlpha = im;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';

        // 번개 — 하늘색 굵은 줄 위에 흰 심
        for (i = 0; i < state.bolts.length; i++) {
            var b = state.bolts[i];
            ctx.beginPath();
            ctx.moveTo(0, 0);
            for (j = 0; j < b.length; j++) { ctx.lineTo(b[j][0], b[j][1]); }
            ctx.strokeStyle = 'rgba(120,200,255,0.9)'; ctx.lineWidth = 4.5; ctx.stroke();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.stroke();
        }

        // 별
        ctx.fillStyle = '#fffbe6';
        ctx.beginPath();
        for (i = 0; i < n * 2; i++) {
            var rr = i % 2 ? s * 0.36 : s;
            var a = i * Math.PI / n;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,200,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
    }

    function roundRectPath(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function drawConfetti() {
        var i, p;
        for (i = 0; i < state.confetti.length; i++) {
            p = state.confetti[i];
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
            ctx.translate(p.x, p.y);
            ctx.rotate(p.a);
            ctx.fillStyle = p.c;
            ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
            ctx.restore();
        }
    }

    /**
     * 만점 전용 — 충격파 링이 원판 밖으로 퍼지고, 금색 스파크가 테두리를 한 바퀴 돌고,
     * "혼신의 일격!" 이 튀어나왔다 사라진다. 보통 타격에서는 이 함수가 아무것도 안 그린다.
     */
    function drawPerfectFx(g) {
        var rim = rimWidth(g.r), R = g.r + rim;
        var i;

        // 충격파 링 — 테두리에서 시작해 반지름의 90% 만큼 더 나가며 옅어진다
        if (state.wave > 0.02 && !reduceMotion) {
            var w = state.wave, rr = R + (1 - w) * g.r * 0.9;
            ctx.save();
            ctx.globalAlpha = w;
            ctx.strokeStyle = GOLD.base; ctx.lineWidth = 3 + 9 * w;
            ctx.beginPath(); ctx.arc(g.cx, g.cy, rr, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 + 3 * w;
            ctx.beginPath(); ctx.arc(g.cx, g.cy, rr - 2, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }

        // 테두리 스파크 — 접점(50도 지점 = 캔버스 각도 -40도)에서 출발해 한 바퀴. 꼬리 40도
        if (state.run > 0) {
            var head = -Math.PI * 0.222 + (1 - state.run) * Math.PI * 2;
            var rad = g.r + rim * 0.5;
            ctx.save();
            ctx.translate(g.cx, g.cy);
            ctx.lineCap = 'round';
            ctx.globalAlpha = Math.min(1, state.run * 3);
            ctx.strokeStyle = 'rgba(255,214,90,0.55)'; ctx.lineWidth = rim * 0.6;
            ctx.beginPath(); ctx.arc(0, 0, rad, head - 0.7, head); ctx.stroke();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = rim * 0.22;
            ctx.beginPath(); ctx.arc(0, 0, rad, head - 0.35, head); ctx.stroke();
            for (i = 0; i < 3; i++) {
                var sa = head - i * 0.12, sr = rad + (i - 1) * 4;
                ctx.beginPath(); ctx.arc(Math.cos(sa) * sr, Math.sin(sa) * sr, 3 - i * 0.6, 0, Math.PI * 2);
                ctx.fillStyle = i ? GOLD.hi : '#fff'; ctx.fill();
            }
            ctx.restore();
        }

        // 문구 — 게임의 목소리. 크게 튀어나왔다가 제자리를 찾고 사라진다
        if (state.pop > 0.03) {
            var p = state.pop;
            var sc = 1 + Math.max(0, p - 0.7) * 1.7;             // 처음 0.3초는 1.5배에서 줄어든다
            var fs = Math.max(20, Math.min(30, g.r * 0.25));
            ctx.save();
            // 원판 위쪽 절반 한가운데. 이때는 빨리 돌아 이름이 안 보이니 가려도 된다.
            // 왼쪽 위에 뒀더니 폭 344px 에서 잘렸다
            ctx.translate(g.cx, g.cy - g.r * 0.45);
            ctx.rotate(-0.1);
            ctx.scale(sc, sc);
            ctx.globalAlpha = Math.min(1, p * 2.5);
            ctx.font = '800 ' + fs + 'px Manrope, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.lineWidth = fs * 0.32; ctx.strokeStyle = INK;
            ctx.strokeText('혼신의 일격!', 0, 0);
            var tg = ctx.createLinearGradient(0, -fs * 0.5, 0, fs * 0.5);
            tg.addColorStop(0, GOLD.hi); tg.addColorStop(0.55, GOLD.base); tg.addColorStop(1, GOLD.lo);
            ctx.fillStyle = tg;
            ctx.fillText('혼신의 일격!', 0, 0);
            ctx.restore();
        }
    }

    function drawFlash() {
        if (state.flash <= 0.01) { return; }
        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.85, state.flash * 0.42).toFixed(3) + ')';
        ctx.fillRect(0, 0, view.w, view.h);
    }

    // ══════════════════════════════════════════════════════════
    //  초기화
    // ══════════════════════════════════════════════════════════
    function init() {
        el.setup = $('wheel-setup');
        el.play = $('wheel-play');
        el.slots = $('wheel-slots');
        el.slotCount = $('wheel-slot-count');
        el.less = $('wheel-less');
        el.more = $('wheel-more');
        el.start = $('wheel-start');
        el.recent = $('wheel-recent');
        el.recentWrap = $('wheel-recent-wrap');
        el.result = $('wheel-result');
        el.resultTitle = $('wheel-result-title');
        el.again = $('wheel-again');
        el.setupAgain = $('wheel-setup-again');
        el.mute = $('wheel-mute');
        el.stage = $('wheel-stage');
        el.hit = $('wheel-hit');
        el.gauge = $('wheel-gauge');
        el.gaugeFill = $('wheel-gauge-fill');
        el.gaugeNum = $('wheel-gauge-num');

        canvas = $('wheel-canvas');
        if (!canvas) { return; }
        ctx = canvas.getContext('2d');

        buildSlots();
        renderRecent();

        el.less.addEventListener('click', function () {
            if (slotCount > MIN_SLOTS) { slotCount--; buildSlots(); }
        });
        el.more.addEventListener('click', function () {
            if (slotCount < MAX_SLOTS) { slotCount++; buildSlots(); }
        });
        el.start.addEventListener('click', startGame);
        el.again.addEventListener('click', again);
        el.setupAgain.addEventListener('click', backToSetup);
        el.hit.addEventListener('click', act);

        // 캔버스를 눌러도 된다. PC 는 클릭, 모바일은 터치 — click 하나로 둘 다 받는다.
        el.stage.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('.bw-wheel-result')) { return; }
            act();
        });

        // 스페이스·엔터로도 친다. PC 에서 이게 제일 편하다.
        document.addEventListener('keydown', function (e) {
            if (!state || el.play.hidden) { return; }
            if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
                if (document.activeElement && document.activeElement.tagName === 'INPUT') { return; }
                e.preventDefault();
                act();
            }
        });

        el.mute.addEventListener('click', function () {
            var m = !sfx.isMuted();
            sfx.setMuted(m);
            el.mute.textContent = m ? '소리 꺼짐' : '소리 켜짐';
            el.mute.setAttribute('aria-pressed', String(!m));
        });

        window.addEventListener('resize', function () { if (state) { resize(); } });

    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
