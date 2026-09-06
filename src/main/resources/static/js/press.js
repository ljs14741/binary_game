/*
 * 압력 프레스 — 누를수록 내려온다
 *
 * 기획서: docs/plans/press.md (개정 이력·시뮬레이션 수치는 전부 거기 있다)
 *
 * 규칙 — 총 레버 횟수는 인원의 두 바퀴로 고정이고 그 중 정확히 한 번이 걸린다.
 * 어느 회차가 걸릴지가 전부 같은 확률이라 사람별 당첨 확률도 정확히 균등하다.
 * 화면에 확률 숫자는 안 쓴다. 문구·색·경보 템포로만 위험을 전한다.
 *
 * 조심할 것 둘
 * 1. 프레스가 내려갈 목표 위치를 미리 그리면 결과가 먼저 보인다.
 *    애니메이션 중에는 현재 위치만 그린다.
 * 2. 화면과 소리는 경보 클럭(pulsePhase) 하나를 공유한다. 따로 굴리면 어긋난다.
 */
(function () {
    'use strict';
    // ── 판정 규칙 ───────────────────────────────────────────
    // 총 레버 횟수는 인원의 두 바퀴로 고정이고, 그 중 정확히 한 번이 걸린다.
    // 어느 회차가 걸릴지는 전부 같은 확률이다 (4명이면 8회차 각 12.5%).
    // → 사람별 당첨 확률도 정확히 균등해진다 (4명이면 각 25%).
    var LAPS = 2;                                 // 최대 몇 바퀴까지 도는가
    var GAP_FULL = 100;                           // 간격 최대치 (표시·계산 공통)
    var GAP_JITTER = 0.14;                        // 하강량 흔들림. 기준선 대비 ±14%
    var PULSE_MIN = 1.0;                          // 첫 레버에서의 경보 주기(Hz)
    var PULSE_MAX = 3.8;                          // 마지막 레버에서의 경보 주기(Hz)

    // ── 연출 타이밍 ─────────────────────────────────────────
    var CHARGE_MS = 500;      // 유압 충전. 프레스가 떨린다
    var JOLT_MS = 130;        // 덜컹 — 페이크로 한 번 튄다
    var HOLD_MS = 190;        // 정적. 이 순간이 제일 조인다
    var DROP_BASE_MS = 230;   // 하강 기본 시간
    var DROP_PER_GAP = 16;    // 간격 1당 추가 시간 (거리에 비례 = 누설 없음)
    var DROP_PER_RISK = 600;  // 위험할수록 브레이크를 길게. 위험도는 이미 화면에 떠 있으니 누설이 아니다
    var DROP_MAX_MS = 1250;
    var SETTLE_MS = 320;      // 착지 후 잔진동
    var CLOSE_CALL_MS = 620;  // 아슬아슬하게 살았을 때
    var RESULT_MS = 2000;     // 터지는 연출을 다 보여준 뒤 카드를 띄운다
    var CLOSE_CALL_LEFT = 2;  // 남은 회차가 이 이하로 살아남으면 아슬아슬 연출

    var COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#c084fc'];

    // ── 순수 계산부 (Node 로 검증한다) ──────────────────────
    /** 한 판의 총 레버 횟수. 인원의 두 바퀴다. */
    function totalPresses(players) { return players * LAPS; }

    /**
     * 이번 레버에 걸릴 확률. 남은 회차가 k 면 1/k 다.
     *
     * 어느 회차가 걸릴지는 전부 같은 확률(1/총회차)이지만,
     * 여기까지 살아서 왔다는 조건이 붙으면 확률이 올라간다.
     * 4명(8회차) 기준 12.5 → 14.3 → 16.7 → 20 → 25 → 33.3 → 50 → 100%.
     * 마지막 회차는 확정이다. 대신 거기까지 갈 확률 자체가 1/8 이라
     * 모든 회차의 최종 당첨 확률은 정확히 같다.
     */
    function hitChance(pressesLeft) {
        if (pressesLeft <= 1) { return 1; }
        return 1 / pressesLeft;
    }

    /** n 회차를 마친 뒤 프레스가 있어야 할 기준 간격. 남은 회차에 비례한다. */
    function baseGap(done, total) {
        if (total <= 0) { return 0; }
        return GAP_FULL * Math.max(0, total - done) / total;
    }

    /** 살아남았을 때의 실제 간격. 기준선 둘레로 흔들어 하강량을 예측 못하게 한다. */
    function rollGap(done, total, from) {
        var ideal = baseGap(done, total);
        var to = ideal * (1 - GAP_JITTER + Math.random() * GAP_JITTER * 2);
        // 최소한 눈에 보일 만큼은 내려온다. 절대 올라가지 않는다.
        return Math.max(0.6, Math.min(to, from * 0.94));
    }

    /** 위험도 문구. 숫자만 있으면 차갑다. */
    function dangerLabel(p) {
        if (p >= 1) { return '확정'; }
        if (p < 0.15) { return '여유'; }
        if (p < 0.22) { return '슬슬'; }
        if (p < 0.40) { return '조심'; }
        return '위험';
    }
    /**
     * 경보 주기(Hz). 회차가 하나 넘어갈 때마다 **한 칸씩 균등하게** 빨라진다.
     * 단계로 툭툭 끊지 않고 매 레버마다 조금씩 조여야 "점점 빨라진다"가 읽힌다.
     * 4명(8회차) 기준 1.0 → 1.4 → 1.8 → 2.2 → 2.6 → 3.0 → 3.4 → 3.8 Hz.
     */
    function pulseRate(done, total) {
        if (total <= 1) { return PULSE_MAX; }
        var t = Math.min(1, Math.max(0, done / (total - 1)));
        return PULSE_MIN + (PULSE_MAX - PULSE_MIN) * t;
    }

    function dangerColor(p) {
        if (p >= 1) { return '#f43f5e'; }
        if (p < 0.15) { return '#34d399'; }
        if (p < 0.22) { return '#a3e635'; }
        if (p < 0.40) { return '#fbbf24'; }
        return '#fb923c';
    }


    /** 표시용 압력(MPa). 간격이 좁을수록 올라간다. */
    function pressureOf(gap) {
        return 1.2 + (1 - Math.max(0, Math.min(GAP_FULL, gap)) / GAP_FULL) * 9.6;
    }

    /** 한 판을 끝까지 돌려본다. 검증용. */
    function simulate(players) {
        var total = totalPresses(players);
        for (var n = 1; n <= total; n++) {
            if (Math.random() < hitChance(total - n + 1)) {
                return { presses: n, total: total, ended: true };
            }
        }
        return { presses: total, total: total, ended: false };   // 여기 오면 버그다
    }

    // ── 상태 ────────────────────────────────────────────────
    var state = {
        players: 4,
        gap: GAP_FULL,      // 남은 간격 (0~100)
        gapFrom: GAP_FULL,  // 이번 하강의 출발 간격
        gapTo: GAP_FULL,    // 이번 하강의 도착 간격 (화면에 미리 쓰지 않는다)
        total: 8,           // 이 판의 총 레버 횟수 = 인원 × 2
        presses: 0,         // 지금까지 당긴 횟수
        turn: 0,            // 0-based 참가자 번호
        phase: 'setup',     // setup|ready|charge|jolt|hold|drop|settle|closecall|result|over
        loser: null,
        dropMs: 400,
        doomed: false       // 이번 클릭에 걸리는가. 로직 전용 — 화면에 절대 새지 않는다
    };

    var canvas, ctx, dpr = 1, view = { w: 320, h: 380 };
    var el = {};
    var timer = 0, phaseLen = 0, shake = 0, warnPhase = 0;
    // 경보 클럭. 경고등·붉은 조명·배경음이 전부 이 하나를 공유한다.
    var pulsePhase = 0, pulseCount = 0;
    var dust = [], juice = [], steam = [], confetti = [];
    var reduceMotion = false;

    // ── 판 시작 ─────────────────────────────────────────────
    function startGame(players) {
        state.players = players;
        state.total = totalPresses(players);
        state.gap = GAP_FULL;
        state.gapFrom = GAP_FULL;
        state.gapTo = GAP_FULL;
        state.turn = 0;
        state.presses = 0;
        state.loser = null;
        state.doomed = false;
        state.phase = 'ready';
        dust = []; juice = []; steam = []; confetti = [];
        shake = 0;
        timer = 0; phaseLen = 0;
        // 첫 프레임에 바로 한 박 친다. 시작하자마자 삐- 하고 울려야 한다.
        pulsePhase = 1; pulseCount = -1;
        resize();
        syncHud();
    }

    function setPhase(name, ms) {
        state.phase = name;
        phaseLen = ms;
        timer = ms;
    }

    /** 0~1. 현재 단계가 얼마나 진행됐는가. */
    function phaseT() {
        if (phaseLen <= 0) { return 1; }
        return Math.min(1, Math.max(0, 1 - timer / phaseLen));
    }

    /**
     * 화면에 보여줄 위험도.
     * 레버를 당긴 직후부터 착지 전까지는 "지금 진행 중인 레버"의 확률을 유지한다.
     * 안 그러면 프레스가 내려오는 도중에 다음 회차 확률이 먼저 보인다.
     */
    /** 지금 화면이 가리켜야 할 "이미 끝난 회차 수". 하강 중에는 진행 중인 레버를 뺀다. */
    function shownDone() {
        var mid = state.phase === 'charge' || state.phase === 'jolt' ||
                  state.phase === 'hold' || state.phase === 'drop';
        return Math.max(0, state.presses - (mid ? 1 : 0));
    }

    function shownRisk() {
        return hitChance(state.total - shownDone());
    }

    /** 지금 박자. 화면과 소리가 이 하나를 공유한다. */
    function shownRate() {
        return pulseRate(shownDone(), state.total);
    }

    // ── 레버 ────────────────────────────────────────────────
    function pullLever() {
        if (state.phase !== 'ready') { return; }

        state.gapFrom = state.gap;

        // 여기서 결과가 정해진다. 화면에는 아직 아무것도 새지 않는다.
        // 남은 회차가 k 면 1/k. 마지막 회차는 확정이다.
        var risk = hitChance(state.total - state.presses);
        state.presses += 1;
        state.doomed = Math.random() < risk;
        state.gapTo = state.doomed ? 0 : rollGap(state.presses, state.total, state.gapFrom);

        // 거리에 비례시키되 위험할수록 브레이크를 길게 끈다.
        // 후반에는 간격이 찔끔씩만 줄어서, 거리만으로 시간을 잡으면 툭툭 끊긴다.
        var travel = state.gapFrom - state.gapTo;
        state.dropMs = Math.min(DROP_MAX_MS,
            DROP_BASE_MS + travel * DROP_PER_GAP + risk * DROP_PER_RISK);

        setPhase('charge', CHARGE_MS);
        sfx.charge();
        sfx.wake();
        syncHud();
    }

    function stepPhase() {
        switch (state.phase) {
            case 'charge':
                setPhase('jolt', JOLT_MS);
                sfx.clank();
                puffSteam();
                break;
            case 'jolt':
                setPhase('hold', HOLD_MS);
                break;
            case 'hold':
                setPhase('drop', state.dropMs);
                sfx.hydraulic(state.dropMs);
                break;
            case 'drop':
                landed();
                break;
            case 'settle':
                afterSettle();
                break;
            case 'closecall':
                nextTurn();
                break;
            case 'result':
                showResult();
                break;
        }
    }

    function landed() {
        state.gap = state.gapTo;

        if (state.doomed) {
            state.gap = 0;
            state.loser = state.turn + 1;
            setPhase('result', RESULT_MS);
            shake = 520;
            sfx.smash();
            burstJuice();
            burstDust(1);
            window.setTimeout(burstConfetti, 420);
            syncHud();
            return;
        }

        setPhase('settle', SETTLE_MS);
        shake = 150;
        sfx.thud();
        burstDust(0.45);
        syncHud();
    }

    function afterSettle() {
        // 이제 두 번 안쪽으로 남았다. 다음은 거의, 또는 확실히 걸린다.
        if (state.total - state.presses <= CLOSE_CALL_LEFT) {
            setPhase('closecall', CLOSE_CALL_MS);
            sfx.creak();
            syncHud();
            return;
        }
        nextTurn();
    }

    function nextTurn() {
        state.turn = (state.turn + 1) % state.players;
        setPhase('ready', 0);
        sfx.relief();
        syncHud();
    }

    function showResult() {
        state.phase = 'over';
        el.resultTitle.textContent = state.loser + '번 당첨!';
        el.resultDetail.textContent = '축하합니다. 벌칙 확정입니다.';   // 몇 번째였는지도 안 알려준다
        el.result.hidden = false;
    }

    // ── 루프 ────────────────────────────────────────────────
    var raf = null, last = 0, running = false;

    function loop(now) {
        var dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        warnPhase += dt;
        if (shake > 0) { shake = Math.max(0, shake - dt * 1400); }

        if (timer > 0) {
            timer -= dt * 1000;
            if (timer <= 0) { timer = 0; stepPhase(); }
        }

        stepPulse(dt);
        stepParticles(dt);
        draw();
        raf = requestAnimationFrame(loop);
    }

    function startLoop() {
        if (running) { return; }
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(loop);
    }

    function stopLoop() { running = false; cancelAnimationFrame(raf); }

    /**
     * 경보 클럭을 한 프레임 굴린다.
     * 경고등이 좌우로 번갈아 켜지고, 같은 박에 배경음이 한 번 친다.
     * 게임이 시작되면 처음부터 울리고, 위험해질수록 같이 빨라진다.
     */
    function stepPulse(dt) {
        if (state.phase === 'setup' || state.phase === 'over' || state.phase === 'result') { return; }
        pulsePhase += dt * shownRate();
        while (pulsePhase >= 1) {
            pulsePhase -= 1;
            pulseCount += 1;
            sfx.pulse(pulseCount, shownRisk());
        }
    }

    /** 방금 친 박에서 얼마나 지났나. 1이면 방금, 0이면 다음 박 직전. */
    function pulseGlow() {
        return Math.max(0, 1 - pulsePhase * 3.2);
    }
    // ── 파티클 ──────────────────────────────────────────────
    function burstJuice() {
        var g = geom();
        var i, a, sp;
        for (i = 0; i < 110; i++) {
            a = Math.random() * Math.PI - Math.PI;
            sp = 90 + Math.random() * 430;
            juice.push({
                x: g.cx + (Math.random() - 0.5) * g.tomatoR * 2.1,
                y: g.tomatoCy,
                vx: Math.cos(a) * sp * 1.5,
                vy: Math.sin(a) * sp * 0.55 - 60,
                r: 2 + Math.random() * 5,
                seed: Math.random() < 0.12,
                life: 0.7 + Math.random() * 0.8
            });
        }
    }

    function burstDust(power) {
        var g = geom();
        for (var i = 0; i < Math.round(26 * power) + 8; i++) {
            var side = Math.random() < 0.5 ? -1 : 1;
            dust.push({
                x: g.cx + side * (g.tomatoR + Math.random() * view.w * 0.28),
                y: g.floorTop - 2,
                vx: side * (30 + Math.random() * 150) * power,
                vy: -(20 + Math.random() * 90) * power,
                r: 3 + Math.random() * 9,
                life: 0.5 + Math.random() * 0.7
            });
        }
    }

    function puffSteam() {
        var g = geom();
        var by = plateBottomY();
        for (var i = 0; i < 10; i++) {
            var side = i % 2 === 0 ? -1 : 1;
            steam.push({
                x: g.cx + side * 26,
                y: by - g.plateH - 6,
                vx: side * (40 + Math.random() * 70),
                vy: -8 - Math.random() * 24,
                r: 4 + Math.random() * 6,
                life: 0.45 + Math.random() * 0.4
            });
        }
    }

    function burstConfetti() {
        for (var i = 0; i < 80; i++) {
            confetti.push({
                x: view.w * (0.15 + Math.random() * 0.7),
                y: view.h * 0.32,
                vx: (Math.random() - 0.5) * 320,
                vy: -Math.random() * 340 - 70,
                w: 4 + Math.random() * 5,
                h: 7 + Math.random() * 8,
                rot: Math.random() * Math.PI,
                vr: (Math.random() - 0.5) * 13,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                life: 1.5 + Math.random()
            });
        }
    }

    function stepParticles(dt) {
        var i, p;
        for (i = juice.length - 1; i >= 0; i--) {
            p = juice[i]; p.life -= dt;
            if (p.life <= 0) { juice.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1000 * dt; p.vx *= 0.99;
        }
        for (i = dust.length - 1; i >= 0; i--) {
            p = dust[i]; p.life -= dt;
            if (p.life <= 0) { dust.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 70 * dt;
            p.vx *= 0.94; p.r += dt * 9;
        }
        for (i = steam.length - 1; i >= 0; i--) {
            p = steam[i]; p.life -= dt;
            if (p.life <= 0) { steam.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.r += dt * 22;
        }
        for (i = confetti.length - 1; i >= 0; i--) {
            p = confetti[i]; p.life -= dt;
            if (p.life <= 0) { confetti.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 520 * dt; p.rot += p.vr * dt;
        }
    }

    // ── 배치 ────────────────────────────────────────────────
    function resize() {
        if (!canvas) { return; }
        var rect = canvas.parentElement.getBoundingClientRect();
        dpr = Math.min(2, window.devicePixelRatio || 1);
        view.w = Math.max(260, rect.width);
        view.h = Math.max(320, Math.min(window.innerHeight * 0.5, 460));
        canvas.width = Math.round(view.w * dpr);
        canvas.height = Math.round(view.h * dpr);
        canvas.style.width = view.w + 'px';
        canvas.style.height = view.h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function geom() {
        var beamH = 20;
        var railW = Math.max(16, view.w * 0.062);
        var anvilH = 26;
        var floorTop = view.h - anvilH - 10;
        var tomatoR = Math.max(21, Math.min(36, view.w * 0.095));
        var tomatoTop = floorTop - tomatoR * 2;
        var plateH = 24;
        return {
            cx: view.w / 2,
            beamH: beamH,
            railW: railW,
            railL: railW * 0.35,
            railR: view.w - railW * 1.35,
            innerL: railW * 1.35,
            innerR: view.w - railW * 1.35,
            anvilH: anvilH,
            floorTop: floorTop,
            tomatoR: tomatoR,
            tomatoTop: tomatoTop,
            tomatoCy: tomatoTop + tomatoR,
            plateH: plateH,
            topY: beamH,
            travel: tomatoTop - (beamH + plateH)
        };
    }

    /** 앞은 중력 가속, 뒤는 유압 브레이크. 마지막 구간이 길게 끌린다. */
    function dropEase(t) {
        if (t < 0.45) { return 1.9 * t * t; }
        var u = (t - 0.45) / 0.55;
        return 0.385 + 0.615 * (1 - Math.pow(1 - u, 3.4));
    }

    /** 지금 프레스 바닥이 있어야 할 y. 목표 위치는 절대 미리 그리지 않는다. */
    function plateBottomY() {
        var g = geom();
        var shown = state.gap;

        if (state.phase === 'drop') {
            shown = state.gapFrom + (state.gapTo - state.gapFrom) * dropEase(phaseT());
        } else if (state.phase === 'charge') {
            shown = state.gapFrom + Math.sin(warnPhase * 46) * 0.22;
        } else if (state.phase === 'jolt') {
            shown = state.gapFrom - Math.sin(phaseT() * Math.PI) * 1.6;
        }

        var ratio = Math.min(1, Math.max(0, shown / GAP_FULL));
        return g.topY + g.plateH + g.travel * (1 - ratio);
    }

    function theme() {
        var light = document.documentElement.getAttribute('data-theme') === 'light';
        return light
            ? {
                bg1: '#dfe5ec', bg2: '#b9c3cf', wall: 'rgba(90,105,125,0.10)',
                mDark: '#7c8899', mMid: '#c3ccd8', mLite: '#eef2f7',
                anvil1: '#8b96a5', anvil2: '#5f6a78',
                shadow: 'rgba(30,40,55,0.42)'
            }
            : {
                bg1: '#1a2029', bg2: '#080b10', wall: 'rgba(180,205,235,0.045)',
                mDark: '#2e3742', mMid: '#5a6675', mLite: '#98a5b5',
                anvil1: '#48525f', anvil2: '#252c35',
                shadow: 'rgba(0,0,0,0.55)'
            };
    }

    /** 세로 금속 그라디언트. 위가 밝고 아래가 어둡다. */
    function metalV(y, h, t) {
        var g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, t.mLite);
        g.addColorStop(0.18, t.mMid);
        g.addColorStop(1, t.mDark);
        return g;
    }

    /** 가로 금속 그라디언트. 원통 느낌을 낸다. */
    function metalH(x, w, t) {
        var g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, t.mDark);
        g.addColorStop(0.28, t.mMid);
        g.addColorStop(0.44, t.mLite);
        g.addColorStop(0.62, t.mMid);
        g.addColorStop(1, t.mDark);
        return g;
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // ── 그리기 ──────────────────────────────────────────────
    function draw() {
        if (!ctx) { return; }
        var t = theme(), g = geom();
        var risk = shownRisk();

        drawBackdrop(t, g, risk);

        ctx.save();
        if (shake > 0 && !reduceMotion) {
            ctx.translate((Math.random() - 0.5) * shake / 22, (Math.random() - 0.5) * shake / 26);
        }

        drawAnvil(t, g);
        drawGroundShadow(t, g);
        drawTomato(g, risk);
        drawContactShadow(t, g);
        drawRails(t, g);
        drawPress(t, g, risk);
        drawBeam(t, g, risk);
        drawParticles();

        ctx.restore();
        drawVignette(risk);
        drawConfetti();
    }

    function drawBackdrop(t, g, risk) {
        var grad = ctx.createLinearGradient(0, 0, 0, view.h);
        grad.addColorStop(0, t.bg1);
        grad.addColorStop(1, t.bg2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, view.w, view.h);

        // 뒷벽 패널 이음새
        ctx.strokeStyle = t.wall;
        ctx.lineWidth = 2;
        for (var x = view.w * 0.2; x < view.w * 0.85; x += view.w * 0.16) {
            ctx.beginPath();
            ctx.moveTo(x, g.beamH);
            ctx.lineTo(x, g.floorTop);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(0, g.floorTop - 46);
        ctx.lineTo(view.w, g.floorTop - 46);
        ctx.stroke();

        // 붉은 경보등이 처음부터 화면을 훑는다. 위험할수록 진하고 빨라진다.
        if (state.phase !== 'over' && state.phase !== 'setup') {
            var amb = 0.05 + risk * 0.15;
            var flash = pulseGlow() * (0.06 + risk * 0.14);
            ctx.fillStyle = 'rgba(220,38,60,' + (amb + flash).toFixed(3) + ')';
            ctx.fillRect(0, 0, view.w, view.h);
        }
        // 충전 중에는 화면이 잠깐 어두워진다
        if (state.phase === 'charge') {
            ctx.fillStyle = 'rgba(0,0,0,' + (0.16 * phaseT()).toFixed(3) + ')';
            ctx.fillRect(0, 0, view.w, view.h);
        }
    }

    function drawRails(t, g) {
        [g.railL, g.railR].forEach(function (x) {
            ctx.fillStyle = metalH(x, g.railW, t);
            ctx.fillRect(x, 0, g.railW, g.floorTop + 6);
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.fillRect(x + g.railW * 0.38, 0, g.railW * 0.24, g.floorTop + 6);
            ctx.fillStyle = t.mLite;
            for (var y = g.beamH + 22; y < g.floorTop - 10; y += 46) {
                ctx.beginPath();
                ctx.arc(x + g.railW * 0.2, y, 2.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(x + g.railW * 0.8, y, 2.1, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    function drawBeam(t, g, risk) {
        ctx.fillStyle = metalV(0, g.beamH, t);
        ctx.fillRect(0, 0, view.w, g.beamH);
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(0, g.beamH - 3, view.w, 3);

        // 유압 실린더 배럴
        var bw = 46, bh = 26;
        ctx.fillStyle = metalH(g.cx - bw / 2, bw, t);
        roundRect(g.cx - bw / 2, g.beamH - 4, bw, bh, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(g.cx - bw / 2, g.beamH + bh - 6);
        ctx.lineTo(g.cx + bw / 2, g.beamH + bh - 6);
        ctx.stroke();

        // 경고등 두 개 — 좌우가 번갈아 켜진다. 삐뽀삐뽀.
        var on = state.phase !== 'over' && state.phase !== 'setup';
        var glow = on ? pulseGlow() : 0;
        var leftTurn = (pulseCount % 2) === 0;
        [[g.cx - bw / 2 - 22, leftTurn], [g.cx + bw / 2 + 22, !leftTurn]].forEach(function (lamp) {
            var a = 0.14 + (lamp[1] ? glow * 0.86 : glow * 0.10);
            ctx.fillStyle = 'rgba(251,113,133,' + a.toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(lamp[0], g.beamH * 0.5, 5.5, 0, Math.PI * 2);
            ctx.fill();
            if (lamp[1] && glow > 0.02) {
                ctx.fillStyle = 'rgba(251,113,133,' + (glow * 0.22).toFixed(3) + ')';
                ctx.beginPath();
                ctx.arc(lamp[0], g.beamH * 0.5, 9 + glow * 8, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    function drawPress(t, g, risk) {
        var by = plateBottomY();
        var top = by - g.plateH;
        var rodTop = g.beamH + 20;
        var rodW = 20;

        // 유압 로드
        ctx.fillStyle = metalH(g.cx - rodW / 2, rodW, t);
        ctx.fillRect(g.cx - rodW / 2, rodTop, rodW, Math.max(0, top - rodTop + 2));

        // 벨로우즈 주름 — 늘어난 만큼 성기게 벌어진다
        var rodLen = Math.max(1, top - rodTop);
        ctx.strokeStyle = 'rgba(0,0,0,0.34)';
        ctx.lineWidth = 2;
        for (var i = 1; i <= 7; i++) {
            var fy = rodTop + rodLen * (i / 8);
            ctx.beginPath();
            ctx.moveTo(g.cx - rodW / 2 - 3, fy);
            ctx.lineTo(g.cx + rodW / 2 + 3, fy);
            ctx.stroke();
        }

        // 프레스 판 본체
        var pw = g.innerR - g.innerL;
        ctx.fillStyle = metalV(top, g.plateH, t);
        ctx.fillRect(g.innerL, top, pw, g.plateH);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(g.innerL, top, pw, 3);

        // 가이드 슈 — 레일을 물고 내려온다
        ctx.fillStyle = t.mDark;
        ctx.fillRect(g.railL, top + 2, g.railW, g.plateH - 4);
        ctx.fillRect(g.railR, top + 2, g.railW, g.plateH - 4);

        // 리벳
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        for (var x = g.innerL + 18; x < g.innerR - 10; x += 34) {
            ctx.beginPath();
            ctx.arc(x, top + 8, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }

        // 하단 경고 사선 — 산업 기계의 시각적 서명
        var sh = 7, sy = by - sh;
        ctx.save();
        ctx.beginPath();
        ctx.rect(g.innerL, sy, pw, sh);
        ctx.clip();
        ctx.fillStyle = risk >= 0.40 ? '#ef4444' : '#f5c518';
        ctx.fillRect(g.innerL, sy, pw, sh);
        ctx.fillStyle = 'rgba(20,20,24,0.92)';
        for (var s = g.innerL - sh; s < g.innerR + sh; s += 16) {
            ctx.beginPath();
            ctx.moveTo(s, by);
            ctx.lineTo(s + sh, sy);
            ctx.lineTo(s + sh + 8, sy);
            ctx.lineTo(s + 8, by);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(g.innerL, by, pw, 2);
    }

    /** 프레스가 가까울수록 짙고 좁아진다. 거리감은 그림자가 만든다. */
    function drawContactShadow(t, g) {
        if (state.gap <= 0 && state.phase !== 'drop') { return; }
        var by = plateBottomY();
        var d = Math.max(0, g.tomatoTop - by);
        var near = 1 - Math.min(1, d / 150);
        if (near <= 0.02) { return; }

        var rx = g.tomatoR * (1.5 - near * 0.55);
        var ry = g.tomatoR * (0.42 - near * 0.16);
        var rg = ctx.createRadialGradient(0, 0, 1, 0, 0, rx);
        rg.addColorStop(0, t.shadow);
        rg.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.save();
        ctx.globalAlpha = near * 0.6;
        ctx.translate(g.cx, g.tomatoTop + 4);
        ctx.scale(1, ry / rx);
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawGroundShadow(t, g) {
        var by = plateBottomY();
        var near = 1 - Math.min(1, Math.max(0, g.floorTop - by) / 260);
        ctx.save();
        ctx.globalAlpha = 0.18 + near * 0.3;
        ctx.fillStyle = t.shadow;
        ctx.fillRect(g.innerL + 8, g.floorTop - 3, (g.innerR - g.innerL) - 16, 4);
        ctx.restore();
    }

    function drawAnvil(t, g) {
        var topW = view.w * 0.52, botW = view.w * 0.74;
        ctx.fillStyle = t.anvil2;
        ctx.beginPath();
        ctx.moveTo(g.cx - topW / 2, g.floorTop);
        ctx.lineTo(g.cx + topW / 2, g.floorTop);
        ctx.lineTo(g.cx + botW / 2, g.floorTop + g.anvilH);
        ctx.lineTo(g.cx - botW / 2, g.floorTop + g.anvilH);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = t.anvil1;
        ctx.fillRect(g.cx - topW / 2 - 6, g.floorTop - 6, topW + 12, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(g.cx - topW / 2 - 6, g.floorTop - 6, topW + 12, 2);

        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        [-topW * 0.36, topW * 0.36].forEach(function (dx) {
            ctx.beginPath();
            ctx.arc(g.cx + dx, g.floorTop + 10, 3.2, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawTomato(g, risk) {
        if (state.gap <= 0 && (state.phase === 'result' || state.phase === 'over')) { return; }

        var by = plateBottomY();
        var d = Math.max(0, g.tomatoTop - by);
        var near = 1 - Math.min(1, d / 120);
        var squash = 1 - near * 0.14;
        var r = g.tomatoR;
        var cx = g.cx, cy = g.tomatoCy;

        // 겁먹은 떨림
        if (!reduceMotion && risk > 0.22) {
            cx += Math.sin(warnPhase * 34) * risk * 1.7;
            cy += Math.cos(warnPhase * 41) * risk * 0.9;
        }

        ctx.save();
        ctx.translate(cx, cy + r * (1 - squash));
        ctx.scale(1 + (1 - squash) * 0.7, squash);

        var rg = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r * 1.15);
        rg.addColorStop(0, '#fb7185');
        rg.addColorStop(0.45, '#ef4444');
        rg.addColorStop(1, '#a41c1c');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // 광택
        ctx.save();
        ctx.translate(-r * 0.34, -r * 0.38);
        ctx.rotate(-0.5);
        ctx.scale(1, 0.62);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 눈 — 위험할수록 커지고 위를 올려다본다
        var eyeR = r * (0.17 + risk * 0.07);
        var lookUp = -eyeR * (0.15 + risk * 0.4);
        [-r * 0.33, r * 0.33].forEach(function (ex) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(ex, -r * 0.05, eyeR, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1b1b22';
            ctx.beginPath();
            ctx.arc(ex, -r * 0.05 + lookUp, eyeR * 0.52, 0, Math.PI * 2);
            ctx.fill();
        });

        // 입 — 위험하면 벌어진다
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath();
        ctx.ellipse(0, r * 0.42, r * (0.1 + risk * 0.1), r * (0.06 + risk * 0.14), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 꼭지 — 다섯 갈래
        ctx.save();
        ctx.translate(cx, cy - r * 0.94 + r * (1 - squash) * 1.2);
        ctx.fillStyle = '#16a34a';
        for (var i = 0; i < 5; i++) {
            ctx.save();
            ctx.rotate((i / 5) * Math.PI * 2);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-r * 0.16, -r * 0.1);
            ctx.lineTo(0, -r * 0.42);
            ctx.lineTo(r * 0.16, -r * 0.1);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.fillStyle = '#15803d';
        ctx.fillRect(-2, -r * 0.34, 4, r * 0.3);
        ctx.restore();
    }

    function drawParticles() {
        var i, p;
        for (i = 0; i < steam.length; i++) {
            p = steam[i];
            ctx.globalAlpha = Math.min(0.5, p.life) * 0.7;
            ctx.fillStyle = '#e8eef6';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        for (i = 0; i < dust.length; i++) {
            p = dust[i];
            ctx.globalAlpha = Math.min(0.42, p.life) * 0.8;
            ctx.fillStyle = '#9aa5b1';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        for (i = 0; i < juice.length; i++) {
            p = juice[i];
            ctx.globalAlpha = Math.min(1, p.life);
            ctx.fillStyle = p.seed ? '#fde68a' : (i % 5 === 0 ? '#fca5a5' : '#dc2626');
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawConfetti() {
        for (var i = 0; i < confetti.length; i++) {
            var c = confetti[i];
            ctx.save();
            ctx.globalAlpha = Math.min(1, c.life);
            ctx.translate(c.x, c.y);
            ctx.rotate(c.rot);
            ctx.fillStyle = c.color;
            ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
            ctx.restore();
        }
    }

    function drawVignette(risk) {
        if (state.phase === 'setup' || state.phase === 'over') { return; }
        // 처음부터 옅게 깔고, 위험해질수록 조여든다. 박에 맞춰 한 번씩 짙어진다.
        var a = Math.min(0.55, 0.10 + risk * 0.32 + pulseGlow() * 0.07);
        var rg = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.28, view.w / 2, view.h / 2, view.h * 0.78);
        rg.addColorStop(0, 'rgba(0,0,0,0)');
        rg.addColorStop(1, 'rgba(120,10,25,' + a.toFixed(3) + ')');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, view.w, view.h);
    }

    // ── 사운드 ──────────────────────────────────────────────
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
        function tone(freq, dur, type, vol, slideTo, delay) {
            if (muted) { return; }
            var a = ac(); if (!a) { return; }
            var t0 = a.currentTime + (delay || 0);
            var o = a.createOscillator(), gn = a.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, t0);
            if (slideTo) { o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur); }
            gn.gain.setValueAtTime(0.0001, t0);
            gn.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + Math.min(0.03, dur * 0.2));
            gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            o.connect(gn); gn.connect(a.destination);
            o.start(t0); o.stop(t0 + dur + 0.02);
        }
        function noise(dur, vol, shape) {
            if (muted) { return; }
            var a = ac(); if (!a) { return; }
            var n = Math.max(1, Math.floor(a.sampleRate * dur));
            var buf = a.createBuffer(1, n, a.sampleRate);
            var d = buf.getChannelData(0);
            for (var i = 0; i < n; i++) {
                var k = i / n;
                var env = shape === 'up' ? k : (shape === 'flat' ? 0.7 : (1 - k));
                d[i] = (Math.random() * 2 - 1) * env;
            }
            var src = a.createBufferSource(), gn = a.createGain(), f = a.createBiquadFilter();
            src.buffer = buf;
            f.type = 'lowpass';
            f.frequency.setValueAtTime(shape === 'up' ? 900 : 2400, a.currentTime);
            gn.gain.setValueAtTime(vol || 0.2, a.currentTime);
            src.connect(f); f.connect(gn); gn.connect(a.destination);
            src.start();
        }

        /* 배경음 — 음악 파일을 쓰지 않는다.
           경보 클럭이 칠 때마다 베이스를 한 음씩 놓는다. 네 박짜리 짧은 루프라
           위험해져서 클럭이 빨라지면 배경음도 그대로 빨라진다.
           화면의 경고등과 같은 박을 쓰기 때문에 소리와 빛이 어긋나지 않는다. */
        var BASS = [55, 55, 58.27, 55];      // A1 · A1 · B♭1 · A1
        return {
            // 유압이 차오른다 — 음이 올라가며 조인다
            charge: function () {
                tone(70, CHARGE_MS / 1000, 'sawtooth', 0.05, 190);
                noise(CHARGE_MS / 1000, 0.05, 'up');
            },
            clank: function () { tone(1100, 0.05, 'square', 0.05, 380); noise(0.06, 0.13); },
            hydraulic: function (ms) {
                var s = ms / 1000;
                noise(s * 0.75, 0.09, 'flat');
                tone(150, s, 'sawtooth', 0.05, 48);
                // 마지막 브레이크 구간의 끼익
                tone(430, Math.min(0.45, s * 0.4), 'sawtooth', 0.035, 240, s * 0.6);
            },
            thud: function () { noise(0.16, 0.2); tone(96, 0.18, 'sine', 0.14, 52); },
            creak: function () { tone(300, 0.5, 'sawtooth', 0.045, 170); },
            relief: function () { tone(520, 0.1, 'sine', 0.04); tone(760, 0.1, 'sine', 0.03, null, 0.07); },
            heart: function () {
                tone(58, 0.11, 'sine', 0.11, 40);
                tone(52, 0.1, 'sine', 0.07, 36, 0.15);
            },
            smash: function () {
                noise(0.7, 0.36);
                tone(72, 0.6, 'sawtooth', 0.22, 34);
                tone(180, 0.3, 'square', 0.08, 60, 0.03);
            },
            /**
             * 한 박. 경보 클럭이 부른다.
             * 사이렌은 **첫 박부터 울린다.** 높은 음과 낮은 음이 번갈아 나서 삐- 뽀- 가 되고,
             * 화면 좌우 경고등이 같은 박에 교대로 켜진다.
             * 위험해질수록 커지고, 클럭이 빨라지니 사이렌도 같이 빨라진다.
             */
            pulse: function (n, risk) {
                var hi = (n % 2) === 0;
                var siren = hi ? 1046 : 784;              // 삐(C6) · 뽀(G5)
                var vol = 0.055 + risk * 0.055;

                var hz = BASS[n % BASS.length];           // 밑에 깔리는 베이스
                tone(hz, 0.19, 'sine', 0.07 + risk * 0.04, hz * 0.74);

                tone(siren, 0.115, 'square', vol);
                tone(siren * 2, 0.075, 'triangle', vol * 0.35);   // 배음 — 멀리서도 들리게

                if (risk >= 0.40) {                       // 위험 — 사이렌이 겹쳐 운다
                    tone(siren * 1.5, 0.07, 'square', vol * 0.55, null, 0.06);
                }
                if (risk >= 1) {                          // 확정 — 길게 운다
                    tone(1320, 0.2, 'sawtooth', 0.05, 980, 0.02);
                }
            },
            /** 사용자 제스처 안에서 오디오를 깨워둔다. */
            wake: function () { ac(); },
            setMuted: function (m) { muted = m; },
            isMuted: function () { return muted; }
        };
    })();

    // ── HUD ─────────────────────────────────────────────────
    function syncHud() {
        var gap = Math.max(0, state.gap);
        var risk = shownRisk();
        var color = dangerColor(risk);
        // 숫자는 하나도 안 보여준다 — 남은 횟수도, 확률도, 간격도.
        // 셀 수 있게 두면 사람은 계산을 하고, 계산은 긴장을 걷어간다.
        // 위험은 게이지·문구·색·경보 템포로만 전한다.

        el.gaugeFill.style.width = (gap / GAP_FULL * 100).toFixed(1) + '%';
        el.gaugeFill.style.background = color;
        el.pressure.textContent = pressureOf(gap).toFixed(1);

        el.dangerTag.textContent = dangerLabel(risk);
        el.dangerTag.style.color = color;
        el.dangerTag.style.borderColor = color;
        // 태그와 레버가 경보 클럭과 같은 박자로 뛴다.
        var beat = (1 / shownRate()).toFixed(2) + 's';
        el.dangerTag.style.animationDuration = beat;
        el.lever.style.animationDuration = beat;

        el.turn.textContent = (state.turn + 1) + '번 차례';
        el.turn.style.color = COLORS[state.turn % COLORS.length];

        var hot = risk >= 0.24;
        el.lever.disabled = state.phase !== 'ready';
        el.lever.textContent = state.phase !== 'ready' ? '…'
            : (risk >= 1 ? '피할 수 없습니다' : (hot ? '당길까요…?' : '레버 당기기'));
        el.lever.classList.toggle('is-risky', hot);
        el.stage.classList.toggle('is-risky', hot);
    }

    // ── UI ──────────────────────────────────────────────────
    function headerOffset() {
        var h = document.getElementById('global-header');
        if (!h) { return 8; }
        var pos = window.getComputedStyle(h).position;
        return (pos === 'fixed' || pos === 'sticky') ? h.getBoundingClientRect().height + 12 : 8;
    }

    function scrollIntoView(target) {
        if (!target) { return; }
        var y = target.getBoundingClientRect().top + window.pageYOffset - headerOffset();
        window.scrollTo({ top: Math.max(0, y), behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    function backToSetup() {
        el.result.hidden = true;
        el.play.hidden = true;
        el.setup.hidden = false;
        el.start.hidden = false;
        state.phase = 'setup';
        stopLoop();
        pulsePhase = 0; pulseCount = 0;
        scrollIntoView(el.setup);
    }

    function bind() {
        el.setup.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-players]');
            if (!btn) { return; }
            btn.parentElement.querySelectorAll('button').forEach(function (b) { b.classList.remove('is-active'); });
            btn.classList.add('is-active');
        });

        el.start.addEventListener('click', function () {
            var p = parseInt(el.setup.querySelector('[data-players].is-active').getAttribute('data-players'), 10);
            el.setup.hidden = true;
            el.start.hidden = true;
            el.play.hidden = false;
            sfx.wake();          // 클릭 안에서 오디오를 열어둬야 첫 박이 난다
            startGame(p);
            startLoop();
            scrollIntoView(el.play);
        });

        el.lever.addEventListener('click', pullLever);

        el.again.addEventListener('click', function () {
            el.result.hidden = true;
            startGame(state.players);
            startLoop();
            scrollIntoView(el.play);
        });
        el.setupAgain.addEventListener('click', backToSetup);

        el.mute.addEventListener('click', function () {
            var m = !sfx.isMuted();
            sfx.setMuted(m);
            if (!m) { sfx.wake(); }
            el.mute.textContent = m ? '소리 꺼짐' : '소리 켜짐';
            el.mute.setAttribute('aria-pressed', String(!m));
        });

        window.addEventListener('resize', function () { resize(); });
        document.addEventListener('bw:theme-change', function () { draw(); });
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { stopLoop(); }
            else if (state.phase !== 'setup') { startLoop(); }
        });
    }

    // 계산부만 떼어 검증할 수 있게 열어둔다. 브라우저에서는 module 이 없어 무시된다.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            totalPresses: totalPresses,
            hitChance: hitChance,
            pulseRate: pulseRate,
            baseGap: baseGap,
            rollGap: rollGap,
            dangerLabel: dangerLabel,
            pressureOf: pressureOf,
            simulate: simulate,
            GAP_FULL: GAP_FULL,
            LAPS: LAPS
        };
        return;
    }

    // ── 공유 ────────────────────────────────────────────────
    var SHARE_URL = 'https://game.binaryworld.kr/press';
    var SHARE_TITLE = '압력 프레스';
    var SHARE_DESC = '한 번만 더 당겨보세요. 커피내기·점심내기·벌칙뽑기 복불복 게임!';

    window.shareTwitter = function shareTwitter() {
        window.open('https://twitter.com/intent/tweet?text=' +
            encodeURIComponent(SHARE_TITLE + ' - 커피내기·점심내기·벌칙뽑기') +
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
                imageUrl: 'https://game.binaryworld.kr/img/press.png',
                link: { mobileWebUrl: SHARE_URL, webUrl: SHARE_URL }
            }
        });
    };

    document.addEventListener('DOMContentLoaded', function () {
        canvas = document.getElementById('press-canvas');
        if (!canvas) { return; }
        ctx = canvas.getContext('2d');
        reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        el.setup = document.getElementById('press-setup');
        el.start = document.getElementById('press-start');
        el.play = document.getElementById('press-play');
        el.stage = document.getElementById('press-stage');
        el.gaugeFill = document.getElementById('press-gauge-fill');
        el.pressure = document.getElementById('press-pressure');
        el.dangerTag = document.getElementById('press-danger');
        el.turn = document.getElementById('press-turn');
        el.lever = document.getElementById('press-lever');
        el.mute = document.getElementById('press-mute');
        el.result = document.getElementById('press-result');
        el.resultTitle = document.getElementById('press-result-title');
        el.resultDetail = document.getElementById('press-result-detail');
        el.again = document.getElementById('press-again');
        el.setupAgain = document.getElementById('press-setup-again');

        bind();
        resize();
        setupKakaoShareButton();
    });
})();
