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

    var MIN_SLOTS = 2;
    var MAX_SLOTS = 8;
    var STORE_KEY = 'bw_wheel_recent';

    /* 칸 색. 채도를 높게 잡는다 — 원판은 화려해야 원판이다. */
    var SEG = [
        ['#38bdf8', '#0369a1'], ['#fb7185', '#9f1239'], ['#a78bfa', '#6d28d9'],
        ['#34d399', '#047857'], ['#fbbf24', '#b45309'], ['#22d3ee', '#0e7490'],
        ['#fb923c', '#c2410c'], ['#e879f9', '#a21caf']
    ];


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
            REVEAL_MS: REVEAL_MS, PERFECT: PERFECT, GAUGE_PERIOD: GAUGE_PERIOD,
            spinDegrees: spinDegrees, spinDuration: spinDuration,
            sliceDeg: sliceDeg, spinEase: spinEase, pointedIndex: pointedIndex,
            normalizeNames: normalizeNames, spinOnce: spinOnce
        };
        return;
    }


    // ══════════════════════════════════════════════════════════
    //  공유
    // ══════════════════════════════════════════════════════════
    var SHARE_URL = 'https://game.binaryworld.kr/wheel';
    var SHARE_TITLE = '해머 원판돌리기';
    var SHARE_DESC = '이름을 직접 넣어 만드는 온라인 돌림판. 세게 칠수록 오래 도는 원판돌리기!';

    window.shareTwitter = function shareTwitter() {
        window.open('https://twitter.com/intent/tweet?text=' +
            encodeURIComponent(SHARE_TITLE + ' - 점심메뉴·커피내기·랜덤뽑기') +
            '&url=' + encodeURIComponent(SHARE_URL));
    };
    window.shareFacebook = function shareFacebook() {
        window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(SHARE_URL));
    };
    window.setupKakaoShareButton = function setupKakaoShareButton() {
        if (!window.Kakao || !document.querySelector('#btnKakao')) { return; }
        if (!Kakao.isInitialized()) { Kakao.init('8b68c737be6b8e9a8007c61ee6f9b8da'); }
        Kakao.Share.createDefaultButton({
            container: '#btnKakao',
            objectType: 'feed',
            content: {
                title: SHARE_TITLE,
                description: SHARE_DESC,
                imageUrl: 'https://game.binaryworld.kr/img/wheel.png',
                link: { mobileWebUrl: SHARE_URL, webUrl: SHARE_URL }
            }
        });
    };


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

            /** 혼신의 일격 — 순수한 보상이다. 확률과는 무관하다. */
            perfect: function () {
                tone(880, 0.09, 'square', 0.05);
                tone(1320, 0.10, 'square', 0.045, null, 0.06);
                tone(1760, 0.16, 'square', 0.04, null, 0.12);
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
            dot.style.background = SEG[i % SEG.length][0];
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

    function strike() {
        state.power = state.gaugeVal;
        sfx.hit(state.power);
        if (state.power >= PERFECT) { sfx.perfect(); state.shake = 20; }
        el.gauge.hidden = true;
        setPhase('strike', STRIKE_MS);
    }

    function beginSpin() {
        var jitter = (Math.random() * 2 - 1) * JITTER_DEG;
        state.spinFrom = state.ang;
        state.spinTo = state.ang + spinDegrees(state.power, jitter);
        state.lastTick = Math.floor(state.ang / sliceDeg(state.n));
        state.shake = Math.max(state.shake, 8);
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
                c: SEG[Math.floor(Math.random() * SEG.length)][0],
                life: 1
            });
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

        stepConfetti(dt);

        switch (state.phase) {
        case 'ready':
            stepGauge(dt);
            state.hammer += (0 - state.hammer) * (1 - Math.pow(0.02, dt));
            break;

        case 'strike':
            // 해머가 내려온다. 뒤로 갈수록 빨라진다
            state.hammer = Math.pow(t, 0.55);
            if (t >= 1) { state.flash = 0.45; beginSpin(); }
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
            p.life -= dt * 0.42;
            if (p.life <= 0 || p.y > view.h + 30) { state.confetti.splice(i, 1); }
        }
    }


    // ══════════════════════════════════════════════════════════
    //  그리기
    // ══════════════════════════════════════════════════════════
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
     */
    function geom() {
        return {
            cx: view.w / 2,
            cy: view.h * 0.53,
            r: Math.min(view.w * 0.36, view.h * 0.37)
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

        ctx.restore();

        drawConfetti();
        drawFlash();
    }

    function drawBackdrop(g) {
        var bg = ctx.createLinearGradient(0, 0, 0, view.h);
        bg.addColorStop(0, '#0b1220');
        bg.addColorStop(1, '#161f2e');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, view.w, view.h);

        // 원판 뒤 후광 — 결과가 나오면 확 밝아진다
        var power = 0.15 + state.glow * 0.45;
        var ha = ctx.createRadialGradient(g.cx, g.cy, g.r * 0.3, g.cx, g.cy, g.r * 2.1);
        ha.addColorStop(0, 'rgba(56,189,248,' + power.toFixed(3) + ')');
        ha.addColorStop(1, 'rgba(56,189,248,0)');
        ctx.fillStyle = ha;
        ctx.fillRect(0, 0, view.w, view.h);

        // 비네트 — 가장자리를 조인다
        var vg = ctx.createRadialGradient(
            view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.28,
            view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.7);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, view.w, view.h);
    }

    /** 접촉 그림자. 거리감은 그림자가 만든다. */
    function drawShadow(g) {
        ctx.save();
        ctx.translate(g.cx, g.cy + g.r * 1.05);
        ctx.scale(1, 0.13);
        var grd = ctx.createRadialGradient(0, 0, 0, 0, 0, g.r);
        grd.addColorStop(0, 'rgba(0,0,0,0.6)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, g.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawWheel(g) {
        var n = state.n;
        var slice = sliceDeg(n);
        var r = g.r;
        var decided = state.picked >= 0 && (state.phase === 'reveal' || state.phase === 'done');
        var k = state.phase === 'done' ? 1 : (state.phase === 'reveal' ? phaseT() : 0);
        var i;

        ctx.save();
        ctx.translate(g.cx, g.cy);

        // 바깥 금테
        ctx.beginPath();
        ctx.arc(0, 0, r + 10, 0, Math.PI * 2);
        var rim = ctx.createLinearGradient(-r, -r, r, r);
        rim.addColorStop(0, '#fef3c7');
        rim.addColorStop(0.4, '#e0b024');
        rim.addColorStop(0.75, '#a37512');
        rim.addColorStop(1, '#facc15');
        ctx.fillStyle = rim;
        ctx.fill();

        // 칸
        for (i = 0; i < n; i++) {
            var a0 = (i * slice + state.ang - 90) * Math.PI / 180;
            var a1 = ((i + 1) * slice + state.ang - 90) * Math.PI / 180;
            var pair = SEG[i % SEG.length];
            var isPicked = decided && state.picked === i;
            // 뽑힌 칸은 살짝 커진다 — 경계선이 아니라 덩어리로 읽히게
            var rr = r + (isPicked ? 8 * k : 0);

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, rr, a0, a1);
            ctx.closePath();

            // 안쪽이 밝고 바깥이 어두운 방사형 — 평면이 원반이 된다
            var grd = ctx.createRadialGradient(0, 0, r * 0.12, 0, 0, rr);
            grd.addColorStop(0, pair[0]);
            grd.addColorStop(1, pair[1]);
            ctx.fillStyle = grd;
            ctx.fill();

            if (isPicked) {
                ctx.fillStyle = 'rgba(255,255,255,' + (0.40 * k).toFixed(3) + ')';
                ctx.fill();
            } else if (decided) {
                // 결정된 뒤 나머지는 물러난다
                ctx.fillStyle = 'rgba(3,7,18,' + (0.55 * k).toFixed(3) + ')';
                ctx.fill();
            }

            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // 왼쪽 위에서 오는 광택
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.clip();
        var gl = ctx.createLinearGradient(-r, -r, r * 0.35, r * 0.55);
        gl.addColorStop(0, 'rgba(255,255,255,0.28)');
        gl.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        gl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();

        // 이름 — 빨리 돌 때는 생략한다. 안 읽히기도 하고, 그게 곧 속도감이다
        var speed = state.phase === 'spin' ? (1 - spinEase(phaseT())) : 0;
        if (speed < 0.30) {
            var alpha = state.phase === 'spin' ? Math.min(1, (0.30 - speed) / 0.16) : 1;
            for (i = 0; i < n; i++) { drawLabel(i, n, slice, r, alpha, decided && state.picked === i); }
        }

        // 테두리 볼트 — 바늘이 튕길 대상이자 딸깍 소리의 출처
        for (i = 0; i < n; i++) {
            var pa = (i * slice + state.ang - 90) * Math.PI / 180;
            var px = Math.cos(pa) * (r + 5), py = Math.sin(pa) * (r + 5);
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.arc(px, py + 1.2, 3.4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fffbeb';
            ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
        }

        ctx.restore();
    }

    function drawLabel(i, n, slice, r, alpha, isPicked) {
        var mid = (i * slice + slice / 2 + state.ang - 90) * Math.PI / 180;
        var rr = r * 0.64;

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
        var fs = Math.max(11, Math.min(20, r * (n > 6 ? 0.11 : 0.14)));
        var lim = n > 6 ? 5 : 7;
        if (nm.length > lim) { nm = nm.slice(0, lim - 1) + '…'; }

        ctx.font = '800 ' + fs + 'px Manrope, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = fs * 0.32;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(nm, 0, 0);
        ctx.fillStyle = isPicked ? '#0b1220' : '#fff';
        ctx.fillText(nm, 0, 0);

        ctx.restore();
    }

    /** 가운데 축 — 금속 허브. */
    function drawHub(g) {
        var r = Math.max(14, g.r * 0.15);
        ctx.save();
        ctx.translate(g.cx, g.cy);

        ctx.beginPath(); ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();

        var grd = ctx.createLinearGradient(-r, -r, r, r);
        grd.addColorStop(0, '#f8fafc');
        grd.addColorStop(0.45, '#94a3b8');
        grd.addColorStop(1, '#334155');
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();

        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
        ctx.restore();
    }

    /** 바늘. 못에 걸려 휘었다 튕긴다 — 딸깍이 눈에도 보인다. */
    function drawPointer(g) {
        var bend = state.pinBend * 0.34;
        ctx.save();
        ctx.translate(g.cx, g.cy - g.r - 8);
        ctx.rotate(bend);

        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.moveTo(-11, -17); ctx.lineTo(11, -17); ctx.lineTo(1.5, 20); ctx.closePath();
        ctx.fill();

        var grd = ctx.createLinearGradient(-10, -16, 10, 19);
        grd.addColorStop(0, '#fef3c7');
        grd.addColorStop(0.45, '#fbbf24');
        grd.addColorStop(1, '#b45309');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(-10, -16); ctx.lineTo(10, -16); ctx.lineTo(0, 19); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.4; ctx.stroke();

        // 꼭지 캡
        ctx.beginPath(); ctx.arc(0, -17, 6.5, 0, Math.PI * 2);
        var cg = ctx.createLinearGradient(-7, -24, 7, -10);
        cg.addColorStop(0, '#fff7ed'); cg.addColorStop(1, '#d97706');
        ctx.fillStyle = cg; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
    }

    /**
     * 해머. 때리는 물건이 화면에 있어야 때린 게 된다.
     *
     * 손 위치를 원판 오른쪽 위에 두고 자루가 손에서 위로 뻗는다.
     * 들었을 때는 오른쪽으로 눕고, 내려찍으면 원판 가장자리로 온다.
     */
    function drawHammer(g) {
        var hx = g.cx + g.r * 0.97;
        var hy = g.cy - g.r * 0.62;
        var L = g.r * 0.52;
        var hw = g.r * 0.32, hh = g.r * 0.19;

        // 들림(0) -> 내려찍음(1)
        var a = 0.78 + (-1.55 - 0.78) * state.hammer;

        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(a);

        // 자루 — 나무
        var sw = Math.max(5, g.r * 0.055);
        var sg = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
        sg.addColorStop(0, '#6b3f10');
        sg.addColorStop(0.4, '#c98a3c');
        sg.addColorStop(1, '#5c360d');
        ctx.fillStyle = sg;
        ctx.fillRect(-sw / 2, -L, sw, L + hh * 0.15);

        // 손잡이 끝 마감
        ctx.fillStyle = '#3f240a';
        ctx.fillRect(-sw / 2 - 1.5, -2, sw + 3, 6);

        // 머리 — 금속
        var mg = ctx.createLinearGradient(-hw / 2, -L - hh / 2, hw / 2, -L + hh / 2);
        mg.addColorStop(0, '#f8fafc');
        mg.addColorStop(0.35, '#a8b3c1');
        mg.addColorStop(0.72, '#5b6673');
        mg.addColorStop(1, '#242c38');
        ctx.fillStyle = mg;
        roundRectPath(-hw / 2, -L - hh / 2, hw, hh, hh * 0.24);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // 타격면을 밝게 + 윗면 하이라이트
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(-hw / 2 + 2, -L - hh / 2 + 2.5, hw * 0.16, hh - 5);
        ctx.fillStyle = 'rgba(255,255,255,0.26)';
        ctx.fillRect(-hw / 2 + 2.5, -L - hh / 2 + 2.5, hw - 5, hh * 0.2);

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

    function drawFlash() {
        if (state.flash <= 0.01) { return; }
        ctx.fillStyle = 'rgba(255,255,255,' + (state.flash * 0.42).toFixed(3) + ')';
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

        if (window.setupKakaoShareButton) { window.setupKakaoShareButton(); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
