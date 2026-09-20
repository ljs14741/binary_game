/*
 * 턱압프레스 — 당길수록 턱이 내려온다
 *
 * 기획서: docs/plans/press.md (개정 이력·시뮬레이션 수치는 전부 거기 있다)
 *
 * 규칙 — 총 레버 횟수는 인원의 두 바퀴로 고정이고 그 중 정확히 한 번이 걸린다.
 * 어느 회차가 걸릴지가 전부 같은 확률이라 사람별 당첨 확률도 정확히 균등하다.
 * 화면에 확률 숫자는 안 쓴다. 문구·색·경보 템포로만 위험을 전한다.
 *
 * 조심할 것 둘
 * 1. 턱이 내려갈 목표 위치를 미리 그리면 결과가 먼저 보인다.
 *    애니메이션 중에는 현재 위치만 그린다.
 * 2. 화면과 소리는 경보 클럭(pulsePhase) 하나를 공유한다. 따로 굴리면 어긋난다.
 */
(function () {
    'use strict';

    // 화면 문구. 템플릿(press.html)이 messages*.properties 에서 읽어 window.PRESS_I18N 으로 넘긴다.
    // 없으면(검증 하네스 등) 한국어 기본값. 문구를 고칠 땐 properties 를 고친다.
    var T = Object.assign({
        dangerMax: '초위험', danger0: '여유', danger1: '슬슬', danger2: '조심', danger3: '위험',
        resultTitle: '{0}번 당첨!',
        resultDetail: '축하합니다. 벌칙 확정입니다.',
        turn: '{0}번 차례',
        lever: '레버 당기기',
        leverNoEscape: '피할 수 없습니다',
        leverHot: '당길까요…?',
        soundOn: '소리 켜짐',
        soundOff: '소리 꺼짐'
    }, (typeof window !== 'undefined' && window.PRESS_I18N) || {});
    function fmt(t, v) { return t.replace('{0}', String(v)); }
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
    var CHARGE_MS = 500;      // 유압 충전. 턱이 떨린다
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

    // ── 접촉 (찌그러뜨리기만 하고 안 터짐) ──────────────────
    // 안 걸린 회차 중 일부는 턱이 끝까지 내려와 수박을 찌그러뜨린다. 뜸을 들인 뒤 터지지 않는다.
    // **그 뒤로는 올라오지 않는다.** 다음 사람은 이미 눌린 수박 위에서 이어받고, 레버마다
    // 턱이 조금씩 더 파고든다. 걸린 회차도 똑같이 파고들고 같은 길이의 뜸을 들인 뒤에 터지므로,
    // 뜸이 끝나기 전에는 두 갈래를 구분할 방법이 없다 (= 결과가 새지 않는다).
    var FAKE_BASE = 0.16;     // 안 걸린 회차가 첫 접촉이 될 기본 확률
    var FAKE_PER_RISK = 0.5;  // 위험할수록 접촉이 잦다. 후반이 더 조여야 한다
    var SQUASH_MS = 560;      // 파고든 뒤 뜸. 터지든 버티든 이 길이는 같다
    var PUSH_MS = 480;        // 접촉 상태에서 레버를 당겼을 때 더 파고드는 시간
    var CRUSH_MAX = 0.95;     // 찌그러짐(0~1)은 여기까지만 간다. 터지는 건 확률이지 깊이가 아니다

    var MELON_WIDE = 1.3;                         // 수박 가로/세로 비

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

    /** n 회차를 마친 뒤 턱이 있어야 할 기준 간격. 남은 회차에 비례한다. */
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

    /**
     * 안 걸린 회차가 첫 접촉(찌그러뜨리기만)이 될 확률. 위험할수록 잦다. 이미 접촉했으면 안 쓴다.
     * 안 걸렸다는 조건 위에서만 굴리므로 당첨 확률에는 영향이 없다.
     * 4명 기준 0.22 → 0.23 → 0.24 → 0.26 → 0.29 → 0.33 → 0.41. 마지막 회차는 늘 걸리므로 해당 없음.
     */
    function fakeChance(risk) {
        return Math.min(0.6, FAKE_BASE + risk * FAKE_PER_RISK);
    }

    /**
     * 다음 찌그러짐. 남은 여유(CRUSH_MAX - 지금)의 30~55% 를 먹는다.
     * 걸린 회차도 같은 식으로 굴린다 — 깊이로는 결과를 못 읽어야 한다.
     */
    function rollCrush(from) {
        return Math.min(CRUSH_MAX, from + (CRUSH_MAX - from) * (0.3 + Math.random() * 0.25));
    }

    /** 위험도 문구. 숫자만 있으면 차갑다. */
    function dangerLabel(p) {
        // 마지막 회차는 실제로 100% 지만 '확정'이라고 쓰지 않는다. 답을 알려주는 문구는 긴장을 걷어간다.
        if (p >= 1) { return T.dangerMax; }
        if (p < 0.15) { return T.danger0; }
        if (p < 0.22) { return T.danger1; }
        if (p < 0.40) { return T.danger2; }
        return T.danger3;
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
        phase: 'setup',     // setup|ready|charge|jolt|hold|drop|push|squash|settle|closecall|result|over
        loser: null,
        dropMs: 400,
        doomed: false,      // 이번 클릭에 걸리는가. 로직 전용 — 화면에 절대 새지 않는다
        fake: false,        // 이번 클릭이 첫 접촉(찌그러뜨리기만)인가. 역시 화면에 새지 않는다
        contact: false,     // 턱이 수박에 닿은 채인가. 한번 닿으면 판이 끝날 때까지 안 올라온다
        crush: 0,           // 찌그러진 정도 0~1. 접촉 뒤 레버마다 조금씩 커진다
        crushFrom: 0,       // 이번 파고들기의 출발점
        crushTo: 0,         // 이번 파고들기의 도착점 (뜸 전엔 화면에 미리 쓰지 않는다)
        gapAfter: GAP_FULL  // 접촉 회차에서 게이지가 갈 간격
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
        state.fake = false;
        state.contact = false;
        state.crush = 0; state.crushFrom = 0; state.crushTo = 0;
        state.gapAfter = GAP_FULL;
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
                  state.phase === 'hold' || state.phase === 'drop' ||
                  state.phase === 'squash' || state.phase === 'push';
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
        state.gapAfter = state.doomed ? 0 : rollGap(state.presses, state.total, state.gapFrom);
        // 안 걸렸어도 일부는 끝까지 내려가 찌그러뜨린다. 걸린 회차와 하강 거리·시간이 같아진다.
        state.fake = !state.doomed && !state.contact && Math.random() < fakeChance(risk);
        state.gapTo = (state.doomed || state.fake || state.contact) ? 0 : state.gapAfter;
        // 얼마나 더 파고들지도 여기서 정한다. 걸리든 안 걸리든 같은 식으로 굴린다
        state.crushFrom = state.crush;
        state.crushTo = rollCrush(state.crush);

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
                if (state.contact) {
                    // 이미 닿아 있다 — 내려올 거리가 없으니 바로 더 파고든다
                    setPhase('push', PUSH_MS);
                    sfx.grunt(PUSH_MS + SQUASH_MS);
                    sfx.strain(PUSH_MS + SQUASH_MS);
                    break;
                }
                setPhase('drop', state.dropMs);
                sfx.hydraulic(state.dropMs);
                break;
            case 'push':
                setPhase('squash', SQUASH_MS);
                shake = 120;
                burstDust(0.25);
                break;
            case 'drop':
                landed();
                break;
            case 'squash':
                afterSquash();
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
        // 끝까지 내려왔다 — 터지든 버티든 먼저 찌그러뜨리고 뜸을 들인다. 여기선 아직 아무것도 모른다.
        if (state.doomed || state.fake) {
            setPhase('squash', SQUASH_MS);
            shake = 160;
            sfx.thud();
            sfx.grunt(SQUASH_MS);
            sfx.strain(SQUASH_MS);
            burstDust(0.35);
            syncHud();
            return;
        }

        state.gap = state.gapTo;
        setPhase('settle', SETTLE_MS);
        shake = 150;
        sfx.thud();
        burstDust(0.45);
        syncHud();
    }

    /** 뜸이 끝났다. 이제야 갈린다. */
    function afterSquash() {
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

        // 버텼다 — 수박은 찌그러진 채 남고, 턱은 그대로다. 다음 사람이 이 위에서 이어받는다
        state.contact = true;
        state.crush = state.crushTo;
        state.gap = state.gapAfter;
        setPhase('settle', SETTLE_MS);
        shake = 90;
        sfx.creak();
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
        el.resultTitle.textContent = fmt(T.resultTitle, state.loser);
        el.resultDetail.textContent = T.resultDetail;   // 몇 번째였는지도 안 알려준다
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
    /** 수박이 터진다 — 붉은 과육이 제일 많고, 검은 씨와 초록 껍질 조각이 섞여 튄다. */
    function burstJuice() {
        var g = geom();
        var i, a, sp, roll;
        for (i = 0; i < 130; i++) {
            a = Math.random() * Math.PI - Math.PI;
            sp = 90 + Math.random() * 430;
            roll = Math.random();
            juice.push({
                x: g.cx + (Math.random() - 0.5) * g.melonR * MELON_WIDE * 2.1,
                y: g.melonCy,
                vx: Math.cos(a) * sp * 1.5,
                vy: Math.sin(a) * sp * 0.55 - 60,
                r: roll < 0.1 ? 4 + Math.random() * 6 : 2 + Math.random() * 5,
                kind: roll < 0.1 ? 'rind' : (roll < 0.25 ? 'seed' : 'flesh'),
                life: 0.7 + Math.random() * 0.8
            });
        }
    }

    function burstDust(power) {
        var g = geom();
        for (var i = 0; i < Math.round(26 * power) + 8; i++) {
            var side = Math.random() < 0.5 ? -1 : 1;
            dust.push({
                x: g.cx + side * (g.melonR + Math.random() * view.w * 0.28),
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
                y: by - g.plateH - 2,
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
        var melonR = Math.max(23, Math.min(40, view.w * 0.105));   // 세로 반지름. 가로는 MELON_WIDE 배
        var melonTop = floorTop - melonR * 2;
        var plateH = Math.round(Math.max(72, Math.min(110, view.h * 0.27)));   // 얼굴 높이. 턱 밑이 접촉면이다
        var topY = beamH + plateH * 0.42;                                       // 시작 위치. 목·어깨가 보이게 조금 내려 둔다
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
            melonR: melonR,
            melonTop: melonTop,
            melonCy: melonTop + melonR,
            plateH: plateH,
            topY: topY,
            travel: melonTop - (topY + plateH)
        };
    }

    /** 앞은 중력 가속, 뒤는 유압 브레이크. 마지막 구간이 길게 끌린다. */
    function dropEase(t) {
        if (t < 0.45) { return 1.9 * t * t; }
        var u = (t - 0.45) / 0.55;
        return 0.385 + 0.615 * (1 - Math.pow(1 - u, 3.4));
    }

    /** 지금 턱 밑(접촉면)이 있어야 할 y. 목표 위치는 절대 미리 그리지 않는다. */
    function plateBottomY() {
        var g = geom();
        var shown = state.gap;

        if (state.contact || state.phase === 'squash' || state.phase === 'push') {
            shown = 0;
        } else if (state.phase === 'drop') {
            shown = state.gapFrom + (state.gapTo - state.gapFrom) * dropEase(phaseT());
        } else if (state.phase === 'charge') {
            shown = state.gapFrom + Math.sin(warnPhase * 46) * 0.22;
        } else if (state.phase === 'jolt') {
            shown = state.gapFrom - Math.sin(phaseT() * Math.PI) * 1.6;
        }

        var ratio = Math.min(1, Math.max(0, shown / GAP_FULL));
        return g.topY + g.plateH + g.travel * (1 - ratio) + pressDepth(g);
    }

    /**
     * 턱이 수박을 파고든 깊이(px). 접촉 뒤에만 0 보다 크다.
     * 찌그러뜨리는 동안 점점 깊어지며 떨리고, 버텼으면 올라오면서 빠르게 풀린다.
     */
    function pressDepth(g) {
        var max = g.melonR * 0.32;
        var crush = state.crush;
        var tremble = 0;
        if (state.phase === 'squash') {
            var t = phaseT();
            // 첫 접촉이면 0 에서 파고들고, 이미 닿아 있었으면 push 에서 도착한 깊이를 유지한다
            crush = state.contact ? state.crushTo : state.crushTo * Math.min(1, t / 0.4);
            tremble = t > 0.4 ? 1.6 : 0;
        } else if (state.phase === 'push') {
            var u = phaseT();
            crush = state.crushFrom + (state.crushTo - state.crushFrom) * (1 - Math.pow(1 - u, 2.4));
        } else if (state.phase === 'charge' && state.contact) {
            tremble = 0.7;
        } else if (state.phase === 'result' || state.phase === 'over') {
            crush = 1;
        }
        if (reduceMotion) { tremble = 0; }
        return max * crush + Math.sin(warnPhase * 58) * tremble;
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
        drawMelon(g, risk);
        drawContactShadow(t, g);
        drawRails(t, g);
        drawHead(t, g, risk);
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

        // 몸통이 지나가는 자리. 예전엔 여기 유압 실린더가 있었다
        var bw = 46;

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

    /*
     * 턱 — 프레스 판 자리에 얼굴이 내려온다. 접촉면은 턱 밑바닥이다.
     * 특정인을 닮게 그리지 않는다 (이름·사진·닮은꼴 전부 금지, 근거는 docs/plans/press.md).
     * 표정은 risk 로만 조인다: 눈이 가늘어지고, 눈썹이 몰리고, 이를 악물고, 땀이 흐른다.
     * 얼굴 좌표는 전부 by(턱 밑) 기준이라 내려오는 동안 그대로 따라온다.
     */
    function drawHead(t, g, risk) {
        var by = plateBottomY();
        // 터진 뒤 — 얼굴 전체가 일그러진다. 충격 직후에 제일 심하고 서서히 풀린다
        var crushed = state.gap <= 0 && (state.phase === 'result' || state.phase === 'over');
        var wince = crushed ? (state.phase === 'over' ? 0.55 : 0.55 + 0.45 * (1 - phaseT())) : 0;
        var H = g.plateH;
        var top = by - H;
        var cx = g.cx;
        var hw = Math.min((g.innerR - g.innerL) * 0.66, H * 1.28);   // 턱 폭 = 얼굴에서 제일 넓다
        var fw = hw * 0.78;                                          // 이마 폭
        var pushing = (state.phase === 'squash' || state.phase === 'push') ? 0.9
                    : (state.contact ? 0.45 + state.crush * 0.3 : 0);   // 닿아 있는 동안은 계속 힘을 주고 있다
        var strain = Math.max(risk, wince, pushing);                 // 표정의 세기

        ctx.save();
        if (wince > 0) {
            ctx.translate(cx, by);
            ctx.scale(1 + wince * 0.1, 1 - wince * 0.12);
            ctx.rotate((Math.random() - 0.5) * wince * 0.04);
            ctx.translate(-cx, -by);
        }

        // 몸통 — 검은 쫄쫄이. 머리 위로 목·어깨가 이어지고, 위쪽은 화면 밖으로 잘려 나간다.
        // 몸이 통째로 내려오는 그림이라 "기계"가 아니라 "사람이 턱으로 누른다"로 읽힌다
        var neckW = hw * 0.42, neckH = H * 0.22;
        var shW = hw * 1.42;                                         // 어깨 폭
        var shY = top - neckH;                                       // 어깨선
        var suit = ctx.createLinearGradient(cx - shW / 2, 0, cx + shW / 2, 0);
        suit.addColorStop(0, '#0b0b0d');
        suit.addColorStop(0.35, '#26262b');
        suit.addColorStop(0.5, '#33333a');
        suit.addColorStop(0.65, '#26262b');
        suit.addColorStop(1, '#0b0b0d');
        ctx.fillStyle = suit;
        // 팔 — 어깨에서 받침대까지. 손은 바닥을 짚고 있어 머리가 내려와도 자리가 안 바뀐다.
        // 엎드려서 턱으로 누르는 자세는 이 팔 둘이 만든다
        var handX = Math.min(g.innerR - hw * 0.2, g.melonR * MELON_WIDE + hw * 0.5);
        var armW = Math.max(10, hw * 0.24);
        ctx.strokeStyle = '#1a1a1e';
        ctx.lineWidth = armW;
        ctx.lineCap = 'round';
        [-1, 1].forEach(function (sd) {
            var sx = cx + sd * shW * 0.4, sy = shY - H * 0.1;
            var hx = cx + sd * handX, hy = g.floorTop - armW * 0.5;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            // 팔꿈치가 바깥으로 살짝 굽는다
            ctx.quadraticCurveTo(cx + sd * (handX + hw * 0.06), sy + (hy - sy) * 0.45, hx, hy);
            ctx.stroke();
        });
        // 손 — 살색. 힘줄수록 붉다
        ctx.fillStyle = strain > 0.4 ? '#e59a72' : '#efb48e';
        [-1, 1].forEach(function (sd) {
            ctx.beginPath();
            ctx.ellipse(cx + sd * handX, g.floorTop - 4, armW * 0.62, armW * 0.42, 0, 0, Math.PI * 2);
            ctx.fill();
        });

        // 등이 위로 이어지다 화면 밖으로 나간다. 어깨는 둥글게, 목 쪽으로 파인다
        ctx.fillStyle = suit;
        ctx.beginPath();
        ctx.moveTo(cx - shW * 0.44, -H);
        ctx.lineTo(cx + shW * 0.44, -H);
        ctx.lineTo(cx + shW * 0.46, shY - H * 0.5);
        ctx.quadraticCurveTo(cx + shW / 2, shY - H * 0.08, cx + shW * 0.36, shY);
        ctx.quadraticCurveTo(cx + shW * 0.2, shY + H * 0.05, cx + neckW / 2, top + H * 0.12);
        ctx.lineTo(cx - neckW / 2, top + H * 0.12);
        ctx.quadraticCurveTo(cx - shW * 0.2, shY + H * 0.05, cx - shW * 0.36, shY);
        ctx.quadraticCurveTo(cx - shW / 2, shY - H * 0.08, cx - shW * 0.46, shY - H * 0.5);
        ctx.closePath();
        ctx.fill();
        // 등 가운데 솔기
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, -H);
        ctx.lineTo(cx, shY - H * 0.05);
        ctx.stroke();
        // 목 — 살색. 힘줄이 선다
        ctx.fillStyle = '#e9b48a';
        ctx.fillRect(cx - neckW / 2, shY - 2, neckW, neckH + H * 0.12);
        ctx.strokeStyle = 'rgba(120,60,30,' + (0.25 + strain * 0.5).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        [-0.3, 0.3].forEach(function (k) {
            ctx.beginPath();
            ctx.moveTo(cx + k * neckW, shY);
            ctx.lineTo(cx + k * neckW * 0.8, top + H * 0.1);
            ctx.stroke();
        });

        // 얼굴 윤곽 — 턱이 이마보다 넓은 역사다리꼴. 턱 밑은 판처럼 평평하다
        function headPath() {
            var cr = Math.min(12, H * 0.14);
            ctx.beginPath();
            ctx.moveTo(cx - hw / 2 + cr, by);
            ctx.lineTo(cx + hw / 2 - cr, by);
            ctx.quadraticCurveTo(cx + hw / 2, by, cx + hw / 2, by - cr);
            ctx.lineTo(cx + hw / 2, by - H * 0.46);
            ctx.bezierCurveTo(cx + hw / 2, by - H * 0.72, cx + fw / 2, by - H * 0.78, cx + fw / 2 * 0.92, top + H * 0.08);
            ctx.quadraticCurveTo(cx, top - H * 0.04, cx - fw / 2 * 0.92, top + H * 0.08);
            ctx.bezierCurveTo(cx - fw / 2, by - H * 0.78, cx - hw / 2, by - H * 0.72, cx - hw / 2, by - H * 0.46);
            ctx.lineTo(cx - hw / 2, by - cr);
            ctx.quadraticCurveTo(cx - hw / 2, by, cx - hw / 2 + cr, by);
            ctx.closePath();
        }

        ctx.save();
        headPath();
        ctx.clip();

        // 피부 — 힘줄수록 붉어진다
        var skin = ctx.createLinearGradient(0, top, 0, by);
        skin.addColorStop(0, '#f7d0ae');
        skin.addColorStop(0.55, '#f0b98e');
        skin.addColorStop(1, '#d99668');
        ctx.fillStyle = skin;
        ctx.fillRect(cx - hw, top - 4, hw * 2, H + 8);
        if (strain > 0.15) {
            ctx.fillStyle = 'rgba(220,60,60,' + ((strain - 0.15) * 0.42).toFixed(3) + ')';
            ctx.fillRect(cx - hw, top - 4, hw * 2, H + 8);
        }

        // 쫄쫄이 두건 — 얼굴만 뚫려 있다. 이마 위와 양옆을 검은 천이 감싼다
        ctx.fillStyle = '#141416';
        ctx.beginPath();
        ctx.moveTo(cx - hw, top - 8);
        ctx.lineTo(cx + hw, top - 8);
        ctx.lineTo(cx + hw, by - H * 0.16);
        ctx.lineTo(cx + hw / 2 - hw * 0.06, by - H * 0.16);
        ctx.lineTo(cx + hw / 2 - hw * 0.06, by - H * 0.46);
        ctx.bezierCurveTo(cx + hw / 2 - hw * 0.06, by - H * 0.7, cx + fw * 0.44, top + H * 0.2, cx, top + H * 0.2);
        ctx.bezierCurveTo(cx - fw * 0.44, top + H * 0.2, cx - hw / 2 + hw * 0.06, by - H * 0.7, cx - hw / 2 + hw * 0.06, by - H * 0.46);
        ctx.lineTo(cx - hw / 2 + hw * 0.06, by - H * 0.16);
        ctx.lineTo(cx - hw, by - H * 0.16);
        ctx.closePath();
        ctx.fill();
        // 천 가장자리 — 얼굴 구멍 테두리
        ctx.strokeStyle = 'rgba(70,70,80,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + hw / 2 - hw * 0.06, by - H * 0.46);
        ctx.bezierCurveTo(cx + hw / 2 - hw * 0.06, by - H * 0.7, cx + fw * 0.44, top + H * 0.2, cx, top + H * 0.2);
        ctx.bezierCurveTo(cx - fw * 0.44, top + H * 0.2, cx - hw / 2 + hw * 0.06, by - H * 0.7, cx - hw / 2 + hw * 0.06, by - H * 0.46);
        ctx.stroke();

        // 볼 홍조 — 위험할수록 진하다
        var cheekY = by - H * 0.36;
        [-1, 1].forEach(function (s) {
            var ccx = cx + s * hw * 0.3;
            var rg = ctx.createRadialGradient(ccx, cheekY, 1, ccx, cheekY, hw * 0.16);
            rg.addColorStop(0, 'rgba(239,68,68,' + (0.12 + strain * 0.42).toFixed(3) + ')');
            rg.addColorStop(1, 'rgba(239,68,68,0)');
            ctx.fillStyle = rg;
            ctx.fillRect(ccx - hw * 0.16, cheekY - hw * 0.16, hw * 0.32, hw * 0.32);
        });

        // 턱 밑 그늘 — 턱이 툭 튀어나온 느낌은 이 그늘이 만든다
        var jawShade = ctx.createLinearGradient(0, by - H * 0.24, 0, by);
        jawShade.addColorStop(0, 'rgba(120,60,30,0)');
        jawShade.addColorStop(1, 'rgba(120,60,30,0.38)');
        ctx.fillStyle = jawShade;
        ctx.fillRect(cx - hw, by - H * 0.24, hw * 2, H * 0.24);
        // 수염 자국 — 턱을 넓게 읽히게 한다
        ctx.fillStyle = 'rgba(40,30,25,0.22)';
        for (var sx = -hw * 0.44; sx <= hw * 0.44; sx += hw * 0.075) {
            for (var sy = by - H * 0.2; sy < by - 3; sy += H * 0.055) {
                var jit = Math.sin(sx * 7.1 + sy * 3.3) * 1.2;
                ctx.beginPath();
                ctx.arc(cx + sx + jit, sy + jit * 0.6, 1.1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // 턱 보조개
        ctx.strokeStyle = 'rgba(120,60,30,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, by - H * 0.11);
        ctx.lineTo(cx, by - H * 0.03);
        ctx.stroke();

        // 눈썹 — 힘줄수록 안쪽이 내려와 미간이 모인다
        var browY = top + H * 0.34;
        ctx.strokeStyle = '#2b2422';
        ctx.lineWidth = Math.max(3, H * 0.05);
        ctx.lineCap = 'round';
        [-1, 1].forEach(function (s) {
            ctx.beginPath();
            ctx.moveTo(cx + s * hw * 0.09, browY + strain * H * 0.07);
            ctx.lineTo(cx + s * hw * 0.32, browY - H * 0.03);
            ctx.stroke();
        });
        // 미간 주름
        if (strain > 0.3) {
            ctx.strokeStyle = 'rgba(120,60,30,' + ((strain - 0.3) * 1.1).toFixed(3) + ')';
            ctx.lineWidth = 1.5;
            [-1, 1].forEach(function (s) {
                ctx.beginPath();
                ctx.moveTo(cx + s * hw * 0.04, browY - H * 0.02);
                ctx.lineTo(cx + s * hw * 0.03, browY + H * 0.08);
                ctx.stroke();
            });
        }

        // 눈 — 아래(수박)를 내려다본다. 힘줄수록 가늘어지고, 터지면 꽉 감는다
        var eyeY = top + H * 0.46;
        var eyeRx = hw * 0.085, eyeRy = Math.max(1.4, hw * 0.058 * (1 - strain * 0.6));
        [-1, 1].forEach(function (s) {
            var ex = cx + s * hw * 0.2;
            if (wince > 0) {
                ctx.strokeStyle = '#2b2422';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(ex - eyeRx, eyeY - eyeRx * 0.5);
                ctx.lineTo(ex + s * eyeRx * 0.1, eyeY + eyeRx * 0.2);
                ctx.lineTo(ex + eyeRx, eyeY - eyeRx * 0.5);
                ctx.stroke();
                return;
            }
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(ex, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1b1b22';
            ctx.beginPath();
            ctx.ellipse(ex - s * eyeRx * 0.15, eyeY + eyeRy * 0.35, eyeRx * 0.42, Math.max(1.2, eyeRy * 0.8), 0, 0, Math.PI * 2);
            ctx.fill();
        });

        // 코 — 콧구멍 둘
        ctx.fillStyle = 'rgba(120,60,30,0.55)';
        [-1, 1].forEach(function (s) {
            ctx.beginPath();
            ctx.ellipse(cx + s * hw * 0.05, top + H * 0.6, hw * 0.022, hw * 0.014, 0, 0, Math.PI * 2);
            ctx.fill();
        });

        // 입 — 이를 악물고 있다. 힘줄수록 옆으로 벌어지며 이가 더 드러난다
        var mouthY = top + H * 0.75;
        var mw = hw * (0.3 + strain * 0.18), mh = H * (0.06 + strain * 0.05 + wince * 0.12);
        ctx.fillStyle = '#5a1a1a';
        roundRect(cx - mw / 2, mouthY - mh / 2, mw, mh, mh / 2);
        ctx.fill();
        ctx.save();
        roundRect(cx - mw / 2 + 1.5, mouthY - mh / 2 + 1.5, mw - 3, mh - 3, (mh - 3) / 2);
        ctx.clip();
        ctx.fillStyle = '#fbfbf6';
        ctx.fillRect(cx - mw / 2, mouthY - mh / 2, mw, mh);
        ctx.strokeStyle = 'rgba(60,40,40,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - mw / 2, mouthY);
        ctx.lineTo(cx + mw / 2, mouthY);
        for (var tx = -mw / 2 + mw / 7; tx < mw / 2; tx += mw / 7) {
            ctx.moveTo(cx + tx, mouthY - mh / 2);
            ctx.lineTo(cx + tx, mouthY + mh / 2);
        }
        ctx.stroke();
        ctx.restore();

        // 이마 핏줄 — 위험 구간부터
        if (strain >= 0.4) {
            ctx.strokeStyle = 'rgba(110,70,140,' + (Math.min(1, (strain - 0.4) * 1.6) * 0.75).toFixed(3) + ')';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx + hw * 0.34, top + H * 0.22);
            ctx.lineTo(cx + hw * 0.38, top + H * 0.28);
            ctx.lineTo(cx + hw * 0.33, top + H * 0.33);
            ctx.lineTo(cx + hw * 0.37, top + H * 0.39);
            ctx.stroke();
        }

        // 땀 — 관자놀이에서 흘러내린다. 경보 클럭과 같은 시계를 쓴다
        if (strain > 0.2 && state.phase !== 'over') {
            var n = strain >= 0.4 ? 3 : 1;
            for (var k = 0; k < n; k++) {
                var side = k % 2 ? -1 : 1;
                var run = ((warnPhase * (0.5 + strain * 0.8) + k * 0.37) % 1);
                var dyy = top + H * 0.28 + run * H * 0.45;
                var dxx = cx + side * hw * (0.4 - k * 0.05);
                ctx.fillStyle = 'rgba(125,200,255,0.85)';
                ctx.beginPath();
                ctx.moveTo(dxx, dyy - 5);
                ctx.quadraticCurveTo(dxx + 3.2, dyy, dxx, dyy + 3);
                ctx.quadraticCurveTo(dxx - 3.2, dyy, dxx, dyy - 5);
                ctx.fill();
            }
        }

        // 터진 뒤 — 턱에 튄 과즙
        if (state.gap <= 0 && (state.phase === 'result' || state.phase === 'over')) {
            ctx.fillStyle = 'rgba(220,38,38,0.9)';
            [[-0.3, 0.06, 0.09], [0.12, 0.1, 0.12], [0.36, 0.05, 0.07], [-0.05, 0.22, 0.06], [0.24, 0.3, 0.05]].forEach(function (b) {
                ctx.beginPath();
                ctx.ellipse(cx + b[0] * hw, by - b[1] * H, hw * b[2], hw * b[2] * 0.7, 0.3, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        ctx.restore();

        // 윤곽선
        headPath();
        ctx.strokeStyle = 'rgba(60,30,20,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 턱 밑 접촉면 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(cx - hw / 2 + 6, by, hw - 12, 2);

        ctx.restore();
    }

    /** 프레스가 가까울수록 짙고 좁아진다. 거리감은 그림자가 만든다. */
    function drawContactShadow(t, g) {
        if (state.gap <= 0 && state.phase !== 'drop') { return; }
        var by = plateBottomY();
        var d = Math.max(0, g.melonTop - by);
        var near = 1 - Math.min(1, d / 150);
        if (near <= 0.02) { return; }

        var rx = g.melonR * MELON_WIDE * (1.4 - near * 0.5);
        var ry = g.melonR * (0.42 - near * 0.16);
        var rg = ctx.createRadialGradient(0, 0, 1, 0, 0, rx);
        rg.addColorStop(0, t.shadow);
        rg.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.save();
        ctx.globalAlpha = near * 0.6;
        ctx.translate(g.cx, g.melonTop + 4);
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

    /*
     * 수박 — 당하는 쪽의 얼굴. 위험할수록 눈이 커지고 위를 올려다본다.
     * 옆으로 긴 타원이라 턱이 닿는 접촉면이 넓고, 눌리면 더 납작해진다.
     */
    function drawMelon(g, risk) {
        if (state.gap <= 0 && (state.phase === 'result' || state.phase === 'over')) {
            drawMelonWreck(g);
            return;
        }

        var by = plateBottomY();
        var d = Math.max(0, g.melonTop - by);
        var near = 1 - Math.min(1, d / 120);
        var r = g.melonR;
        var depth = Math.max(0, by - g.melonTop);                  // 턱이 파고든 깊이
        var crush = Math.min(1, depth / (r * 0.32));               // 0~1. 찌그러진 정도
        var squash = 1 - near * 0.14 - crush * 0.2;
        var rx = r * MELON_WIDE;
        var cx = g.cx, cy = g.melonCy;

        // 겁먹은 떨림
        if (!reduceMotion && risk > 0.22) {
            cx += Math.sin(warnPhase * 34) * risk * 1.7;
            cy += Math.cos(warnPhase * 41) * risk * 0.9;
        }

        ctx.save();
        ctx.translate(cx, cy + r * (1 - squash));
        ctx.scale(1 + (1 - squash) * 0.7, squash);

        // 껍질 — 진녹색 바탕
        var rg = ctx.createRadialGradient(-rx * 0.3, -r * 0.35, r * 0.2, 0, 0, rx * 1.1);
        rg.addColorStop(0, '#4ade80');
        rg.addColorStop(0.5, '#16a34a');
        rg.addColorStop(1, '#14532d');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, r, 0, 0, Math.PI * 2);
        ctx.fill();

        // 줄무늬 — 세로로 굽은 띠. 타원 안에서만 그린다
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, r, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.strokeStyle = 'rgba(20,60,30,0.75)';
        ctx.lineWidth = r * 0.16;
        ctx.lineCap = 'round';
        for (var i = -2; i <= 2; i++) {
            var sx = i * rx * 0.36;
            ctx.beginPath();
            ctx.moveTo(sx - r * 0.12, -r * 1.1);
            ctx.bezierCurveTo(sx + r * 0.22, -r * 0.4, sx - r * 0.22, r * 0.4, sx + r * 0.12, r * 1.1);
            ctx.stroke();
        }
        ctx.restore();

        // 금 — 찌그러질수록 껍질에 금이 번진다. 터질지 버틸지는 이걸로 알 수 없다
        if (crush > 0.05) {
            ctx.strokeStyle = 'rgba(15,40,20,' + (0.5 + crush * 0.5).toFixed(3) + ')';
            ctx.lineWidth = 1.6 + crush * 1.2;
            ctx.lineCap = 'round';
            [[-0.55, -0.6, -0.2, 0.1, -0.45, 0.55], [0.5, -0.5, 0.25, 0.05, 0.6, 0.5], [0.05, -0.9, -0.1, -0.4, 0.15, -0.1]].forEach(function (c, i) {
                var len = Math.min(1, crush * (1.6 - i * 0.3));
                if (len <= 0) { return; }
                ctx.beginPath();
                ctx.moveTo(c[0] * rx, c[1] * r);
                ctx.lineTo(c[0] * rx + (c[2] - c[0]) * rx * len, c[1] * r + (c[3] - c[1]) * r * len);
                if (len > 0.6) { ctx.lineTo(c[2] * rx + (c[4] - c[2]) * rx * (len - 0.6) / 0.4, c[3] * r + (c[5] - c[3]) * r * (len - 0.6) / 0.4); }
                ctx.stroke();
            });
            // 눌린 자리에서 과즙이 살짝 배어 나온다
            ctx.fillStyle = 'rgba(225,29,72,' + (crush * 0.85).toFixed(3) + ')';
            [-1, 1].forEach(function (sd) {
                ctx.beginPath();
                ctx.ellipse(sd * rx * 0.55, -r * 0.55, r * 0.09 * crush + 0.5, r * 0.16 * crush + 0.5, 0, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // 광택
        ctx.save();
        ctx.translate(-rx * 0.4, -r * 0.42);
        ctx.rotate(-0.4);
        ctx.scale(1.4, 0.55);
        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 눈 — 위험할수록 커지고 위를 올려다본다. 찌그러질 땐 최대치
        var fear = Math.max(risk, crush);
        var eyeR = r * (0.17 + fear * 0.07);
        var lookUp = -eyeR * (0.15 + fear * 0.4);
        [-rx * 0.28, rx * 0.28].forEach(function (ex) {
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
        ctx.ellipse(0, r * 0.42, r * (0.1 + fear * 0.12), r * (0.06 + fear * 0.16), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 꼭지 — 짧게 말린 줄기
        ctx.save();
        ctx.translate(cx, cy - r * 0.96 + r * (1 - squash) * 1.2);
        ctx.strokeStyle = '#3f6212';
        ctx.lineWidth = Math.max(2.5, r * 0.11);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 2);
        ctx.quadraticCurveTo(r * 0.05, -r * 0.22, r * 0.26, -r * 0.3);
        ctx.stroke();
        ctx.restore();
    }

    /** 터지고 남은 것 — 납작해진 껍질 위로 붉은 과육이 퍼져 있다. 파티클이 사라져도 이건 남는다. */
    function drawMelonWreck(g) {
        var r = g.melonR, rx = r * MELON_WIDE;
        var cy = g.floorTop - 3;
        ctx.save();
        ctx.translate(g.cx, cy);
        ctx.fillStyle = '#15803d';
        ctx.beginPath();
        ctx.ellipse(0, 0, rx * 1.55, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        ctx.ellipse(0, -1, rx * 1.3, r * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fda4af';
        ctx.beginPath();
        ctx.ellipse(-rx * 0.3, -3, rx * 0.5, r * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1c1917';
        [-0.9, -0.5, -0.1, 0.35, 0.7, 1.1].forEach(function (k, i) {
            ctx.beginPath();
            ctx.ellipse(k * rx, (i % 2 ? -2 : 1), 2.2, 1.4, 0.4, 0, Math.PI * 2);
            ctx.fill();
        });
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
            ctx.fillStyle = p.kind === 'seed' ? '#1c1917' : (p.kind === 'rind' ? '#15803d' : (i % 5 === 0 ? '#fda4af' : '#e11d48'));
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
        function noise(dur, vol, shape, cutoff) {
            if (muted) { return; }
            var a = ac(); if (!a) { return; }
            var n = Math.max(1, Math.floor(a.sampleRate * dur));
            var buf = a.createBuffer(1, n, a.sampleRate);
            var d = buf.getChannelData(0);
            for (var i = 0; i < n; i++) {
                var k = i / n;
                var env = shape === 'up' ? k : (shape === 'flat' ? 0.7 : (shape === 'wet' ? (1 - k) * (1 - k) : (1 - k)));
                d[i] = (Math.random() * 2 - 1) * env;
            }
            var src = a.createBufferSource(), gn = a.createGain(), f = a.createBiquadFilter();
            src.buffer = buf;
            f.type = 'lowpass';
            f.frequency.setValueAtTime(cutoff || (shape === 'up' ? 900 : 2400), a.currentTime);
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
            // 찌그러뜨리는 동안 — 껍질이 삐걱대며 버티는 소리. 음이 올라가며 조인다
            /**
             * 으으으윽 — 목소리. 톱니파를 목구멍(밴드패스)으로 걸러 낮게 울리고,
             * 떨림(비브라토)을 얹어 힘주는 소리로 만든다. 음이 천천히 올라가며 조인다.
             */
            grunt: function (ms) {
                if (muted) { return; }
                var a = ac(); if (!a) { return; }
                var t0 = a.currentTime, s = ms / 1000;
                var o = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain();
                var f = a.createBiquadFilter(), gn = a.createGain();
                o.type = 'sawtooth';
                o.frequency.setValueAtTime(98, t0);
                o.frequency.linearRampToValueAtTime(150, t0 + s);
                lfo.type = 'sine';
                lfo.frequency.setValueAtTime(7, t0);
                lfo.frequency.linearRampToValueAtTime(11, t0 + s);
                lg.gain.setValueAtTime(6, t0);
                lfo.connect(lg); lg.connect(o.frequency);
                f.type = 'bandpass';
                f.frequency.setValueAtTime(420, t0);           // "으" 의 목구멍
                f.frequency.linearRampToValueAtTime(560, t0 + s);
                f.Q.setValueAtTime(3.5, t0);
                gn.gain.setValueAtTime(0.0001, t0);
                gn.gain.exponentialRampToValueAtTime(0.16, t0 + 0.08);
                gn.gain.setValueAtTime(0.16, t0 + s * 0.8);
                gn.gain.exponentialRampToValueAtTime(0.0001, t0 + s);
                o.connect(f); f.connect(gn); gn.connect(a.destination);
                o.start(t0); lfo.start(t0);
                o.stop(t0 + s + 0.02); lfo.stop(t0 + s + 0.02);
            },
            strain: function (ms) {
                var s = ms / 1000;
                tone(120, s, 'sawtooth', 0.06, 210);
                noise(s, 0.05, 'up', 1800);
                tone(1500, 0.08, 'square', 0.02, 900, s * 0.55);
            },
            relief: function () { tone(520, 0.1, 'sine', 0.04); tone(760, 0.1, 'sine', 0.03, null, 0.07); },
            heart: function () {
                tone(58, 0.11, 'sine', 0.11, 40);
                tone(52, 0.1, 'sine', 0.07, 36, 0.15);
            },
            // 수박이 깨진다 — 껍질이 쩍(마른 고음) → 과육이 철퍽(젖은 저음) → 바닥 울림
            smash: function () {
                noise(0.07, 0.5, null, 7000);
                noise(0.9, 0.34, 'wet', 1100);
                tone(60, 0.55, 'sine', 0.26, 28);
                tone(140, 0.25, 'square', 0.06, 50, 0.04);
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

        el.turn.textContent = fmt(T.turn, state.turn + 1);
        el.turn.style.color = COLORS[state.turn % COLORS.length];

        var hot = risk >= 0.24;
        el.lever.disabled = state.phase !== 'ready';
        el.lever.textContent = state.phase !== 'ready' ? '…'
            : (risk >= 1 ? T.leverNoEscape : (hot ? T.leverHot : T.lever));
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
            el.mute.textContent = m ? T.soundOff : T.soundOn;
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
            fakeChance: fakeChance,
            pressureOf: pressureOf,
            simulate: simulate,
            GAP_FULL: GAP_FULL,
            LAPS: LAPS
        };
        return;
    }

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
    });
})();
