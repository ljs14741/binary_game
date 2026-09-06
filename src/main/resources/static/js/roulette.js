/*
 * 물풍선 룰렛 — 펌프로 바람을 넣는다
 *
 * 기획서: docs/plans/roulette.md
 *
 * 이 게임의 정체는 "커지는 풍선" 이다.
 *
 * 앞선 판들은 물총으로 풍선을 쐈다. 총은 게임을 지탱한 적이 없고 세 판 내리
 * "총이 구리다" 는 말만 들었다. 그리고 삐뽀삐뽀 사이렌을 배경음으로 깔았는데,
 * 그건 기계 경보음이라 파티 게임에 안 어울렸다 — 소리가 화면 속 물건에서
 * 나오지 않으면 붙인 티가 난다.
 *
 * 펌프가 둘을 동시에 푼다.
 *   · 펌프질 자체가 박자다. 사이렌을 따로 깔 필요가 없다.
 *   · 풍선 크기가 곧 확률이다. 개수를 세지 않아도 "곧 터지겠다" 가 보인다.
 *
 * 규칙 네 줄:
 *   1) 풍선 하나와 펌프를 돌려 쓴다. 판 내내 같은 풍선이다.
 *   2) 내 차례에 펌프질을 세 번 한다. 한 번 누를 때마다 풍선이 한 단계 커진다.
 *   3) 안 터지면 옆사람에게 넘긴다.
 *   4) 터지면 바로 앞에서 터진 사람이 물벼락. 벌칙이다.
 *
 * ⚠ 터질 지점을 그리기 코드가 읽지 않는다. 풍선은 크기와 흔들림만 보고 그린다.
 * ⚠ 걸린 사람 옆에서 축하 연출을 하지 않는다 (규격 8-17).
 */
(function () {
    'use strict';

    // ── 규칙 ────────────────────────────────────────────────
    /*
     * 차례 수 = 인원 × 2. 4명이면 최대 8차례다.
     *
     * 한 차례에 펌프질을 몇 번 할지는 **인원에 따라 달라진다**.
     * 고정 3번으로 뒀더니 인원이 늘수록 총 단계가 늘어서
     * (8명이면 48단계) 한 번 부풀 때의 변화가 눈에 안 보였다.
     * 화면 크기는 정해져 있으니 단계가 많아지면 한 칸이 작아질 수밖에 없다.
     *
     * 그래서 **총 펌프질을 16번 안팎으로 맞춘다.** 인원과 무관하게
     * 한 번 부풀 때 반지름이 12~22% 커진다 — 몇 명이 하든 눈에 띈다.
     */
    var LAPS = 2;
    var TARGET_PUMPS = 16;

    // ── 연출 타이밍 ─────────────────────────────────────────
    var INTRO_MS = 900;           // 풍선과 펌프를 건네받는다
    var PUMP_MS = 300;            // 손잡이를 눌러 바람이 들어간다
    var TENSE_MS = 320;           // 풍선이 부르르 떤다 — 어느 쪽인지 알 수 없다
    var TENSE_LAST_MS = 480;      // 그 차례의 마지막 펌프질은 더 끈다
    var SILENCE_MS = 220;         // 터지기 직전 — BGM 을 뚝 끊고 완전한 정적. 여기가 제일 놀란다
    var SAFE_MS = 1400;           // 한 차례를 넘겼다
    var BURST_MS = 2000;          // 펑. 쏟아진다
    /*
     * BGM — 서커스 갈롭. 8분음표가 초당 몇 개 도는가.
     * 풍선이 부풀수록 빨라지고 음도 같이 올라간다. 신나다가 점점 기괴해진다.
     */
    var NOTE_MIN = 4.2;           // 쭈글쭈글할 때 (8분음표/초)
    var NOTE_MAX = 7.8;           // 터지기 직전

    /* A 단조. 화음 진행 Am - Am - Dm - E7 을 8분음표 16개에 얹는다. */
    var MEL = [0, 0, 3, 2, 0, 0, 3, 2, 0, 3, 7, 5, 3, 2, 0, -1];
    var CHORD_ROOT = [0, 0, 5, 7];
    var CHORD_TONES = [[0, 3, 7], [0, 3, 7], [5, 8, 12], [7, 11, 14]];

    var SLOWMO_RATE = 0.5;        // 부르르 구간은 시간이 늘어진다

    var COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#c084fc'];
    var HAIR = ['#1f2937', '#3f2a1d', '#111827', '#4b3621', '#1f2937', '#2d1b12', '#111827', '#3f2a1d'];


    // ── 순수 계산부 (Node 로 검증한다) ──────────────────────

    /** 이 인원일 때 한 차례에 펌프질 몇 번 하는가. */
    function pumpsPerTurn(players) {
        return Math.max(1, Math.round(TARGET_PUMPS / (players * LAPS)));
    }

    /** 이 인원의 총 펌프질 횟수. 자리마다 정확히 LAPS × pumpsPerTurn 번씩 맡는다. */
    function totalPumps(players) { return players * LAPS * pumpsPerTurn(players); }

    /** 풍선을 만든다. 터질 지점은 정확히 한 곳이다. */
    function newBalloon(players) {
        var n = totalPumps(players);
        return {
            total: n,
            boom: Math.floor(Math.random() * n),   // 화면에 절대 새지 않는다
            pumped: 0,
            by: []                                  // 펌프질 -> 누가 했나(0-based)
        };
    }

    /** 한 번 펌프질한다. { i, burst } 를 돌려준다. */
    function pump(b, who) {
        if (b.pumped >= b.total) { return null; }
        var i = b.pumped;
        b.pumped += 1;
        b.by[i] = who;
        return { i: i, burst: i === b.boom };
    }

    function remainingOf(b) { return b.total - b.pumped; }

    /** 얼마나 부풀었나. 0=쭈글쭈글 1=터지기 직전. 이게 곧 위험도다. */
    function fullness(b) { return b.total > 0 ? b.pumped / b.total : 0; }

    /** 이번 펌프질에 터질 확률. */
    function chanceLeft(remaining) { return remaining > 0 ? 1 / remaining : 0; }

    /** 이번 차례에 터질 확률. 화면 문구는 이걸 기준으로 말한다. */
    function turnRisk(b, perTurn) {
        var left = remainingOf(b);
        return left > 0 ? Math.min(1, (perTurn || 1) / left) : 1;
    }

    /** 위험도 문구. 숫자는 안 보여주고 이걸로만 말한다. */
    function dangerLabel(p) {
        if (p >= 1) { return '확정'; }
        if (p <= 0.17) { return '여유'; }
        if (p <= 0.26) { return '슬슬'; }
        if (p <= 0.40) { return '조심'; }
        return '위험';
    }

    function dangerColor(p) {
        if (p >= 1) { return '#f43f5e'; }
        if (p <= 0.17) { return '#34d399'; }
        if (p <= 0.26) { return '#a3e635'; }
        if (p <= 0.40) { return '#fbbf24'; }
        return '#fb923c';
    }

    /** BGM 속도(8분음표/초). 풍선이 부풀수록 균등하게 빨라진다. */
    function pulseRate(full) {
        var t = Math.min(1, Math.max(0, full));
        return NOTE_MIN + (NOTE_MAX - NOTE_MIN) * t;
    }

    /** 한 판을 끝까지 돌려본다. 검증용. */
    function simulate(players) {
        var b = newBalloon(players);
        var per = pumpsPerTurn(players);
        for (var i = 0; i < b.total; i++) {
            var who = Math.floor(i / per) % players;
            if (pump(b, who).burst) {
                return { pumps: i + 1, turns: Math.floor(i / per) + 1,
                         loser: who, total: b.total, perTurn: per };
            }
        }
        return { pumps: b.total, loser: -1, total: b.total };   // 여기 오면 버그다
    }

    // ── 상태 ────────────────────────────────────────────────
    var state = {
        players: 4,
        bal: null,
        turn: 0,          // 이번에 펌프질하는 사람 (0-based). 순서대로 돈다
        stroke: 0,        // 이번 차례의 몇 번째 펌프질인가 (0 ~ pumps-1)
        pumps: 3,         // 이 판에서 한 차례에 펌프질 몇 번 하는가 (인원이 정한다)
        phase: 'setup',   // setup|intro|ready|pump|tense|swell|safe|burst|over
        shot: null,       // 이번 펌프질의 판정. pump 가 끝날 때 정해진다
        loser: null
    };

    var canvas, ctx, dpr = 1, view = { w: 340, h: 500 };
    var el = {};
    var timer = 0, phaseLen = 0, shake = 0, dim = 0, flash = 0;
    var handleT = 0;                 // 펌프 손잡이가 눌린 정도 0~1
    var wobble = 0;                  // 풍선이 떠는 정도
    var swellT = 0;                  // 터지기 직전 부풀어 오르는 정도
    var shownFull = 0;               // 화면에 보이는 부풂 정도. 실제 값을 빠르게 따라간다
    var popT = 99;                   // 펌프질 반동 경과 시간(초). 0 이면 방금 튕겼다
    var pulsePhase = 0, pulseCount = 0;
    var splash = [], pour = [], scraps = [], wetGlass = [];
    var reduceMotion = false;

    var cam = { x: 170, y: 250, s: 1 };

    // ── 진행 ────────────────────────────────────────────────
    function startGame(players) {
        state.players = players;
        state.bal = newBalloon(players);
        state.pumps = pumpsPerTurn(players);
        state.turn = 0;
        state.stroke = 0;
        state.shot = null;
        state.loser = null;
        splash = []; pour = []; scraps = []; wetGlass = [];
        shake = 0; dim = 0; flash = 0; handleT = 0; wobble = 0; swellT = 0;
        shownFull = 0; popT = 99;
        pulsePhase = 1; pulseCount = -1;      // 첫 프레임에 바로 한 박 친다
        setPhase('intro', INTRO_MS);
        resize();
        cam.x = view.w / 2; cam.y = view.h / 2; cam.s = 1;
        sfx.handOver();
        syncHud();
    }

    function setPhase(name, ms) {
        state.phase = name;
        phaseLen = ms;
        timer = ms;
    }

    function phaseT() {
        if (phaseLen <= 0) { return 1; }
        return Math.min(1, Math.max(0, 1 - timer / phaseLen));
    }

    function lastStroke() { return state.stroke >= state.pumps - 1; }

    function shownRisk() { return state.bal ? turnRisk(state.bal, state.pumps) : 0; }

    /** BGM 속도. 오직 풍선 크기만 본다 — 크기가 곧 템포이자 확률이다. */
    function beatRate() {
        return state.bal ? pulseRate(shownFull) : NOTE_MIN;
    }

    /*
     * BGM 이 도는 구간. 판이 시작되면 계속 흐르고, 터지는 순간에만 뚝 끊긴다.
     * 끊겼다 붙었다 하면 BGM 이 아니라 효과음 모음으로 들린다.
     */
    function musicOn() {
        var ph = state.phase;
        return ph === 'intro' || ph === 'ready' || ph === 'pump' ||
               ph === 'tense' || ph === 'safe';
    }

    /** 내 차례를 시작한다. 세 번 연달아 펌프질한다. */
    function startTurn() {
        if (state.phase !== 'ready') { return; }
        state.stroke = 0;
        beginStroke();
        syncHud();
    }

    function beginStroke() {
        handleT = 0;
        wobble = 0;
        setPhase('pump', PUMP_MS);
        sfx.pump(fullness(state.bal), state.stroke, state.pumps);
    }

    function stepPhase() {
        switch (state.phase) {
            case 'intro':
                setPhase('ready', 0);
                syncHud();
                break;
            case 'pump':
                // 판정을 여기서 끝내고 결과를 들고 간다.
                // 그래야 풍선 그리는 쪽이 boom 을 볼 일이 없다
                state.shot = pump(state.bal, state.turn);
                // 반동은 **크기가 실제로 커지는 이 순간** 에 튕겨야 한다.
                // 손잡이를 누르기 시작할 때 튕기면 0.3초 뒤에 커져서 둘이 따로 논다
                popT = 0;
                puffAt(geom());
                setPhase('tense', lastStroke() ? TENSE_LAST_MS : TENSE_MS);
                sfx.creak(fullness(state.bal), lastStroke());
                syncHud();
                break;
            case 'tense':
                resolve();
                break;
            case 'swell':
                setPhase('burst', BURST_MS);
                shake = 900;
                sfx.burst();
                burstPour();
                syncHud();
                break;
            case 'safe':
                nextTurn();
                break;
            case 'burst':
                showResult();
                break;
        }
    }

    function resolve() {
        if (state.shot.burst) {
            // BGM 을 뚝 끊고 0.22초 완전한 정적. 풍선만 부풀어 오른다.
            // 여기서 사람들이 제일 크게 놀란다
            state.loser = state.turn;
            swellT = 0;
            setPhase('swell', SILENCE_MS);
            sfx.stopMusic();
            syncHud();
            return;
        }
        if (!lastStroke()) {
            // 아직 두 번 더 남았다. 곧바로 다음 펌프질로 간다 — 여기가 조마조마한 구간이다
            state.stroke += 1;
            beginStroke();
            syncHud();
            return;
        }
        setPhase('safe', SAFE_MS);
        flash = 1;
        sfx.hold();
        syncHud();
    }

    function nextTurn() {
        state.turn = (state.turn + 1) % state.players;
        state.stroke = 0;
        state.shot = null;
        handleT = 0; wobble = 0;
        setPhase('ready', 0);
        syncHud();
    }

    function showResult() {
        state.phase = 'over';
        var n = state.loser + 1;
        el.resultTitle.textContent = n + '번 물벼락!';
        el.resultTitle.style.color = COLORS[state.loser % COLORS.length];
        el.resultDetail.textContent = '응 너야~ ㅋㅋ 벌칙 확정입니다.';
        el.result.hidden = false;
        syncHud();
    }

    // ── 루프 ────────────────────────────────────────────────
    var raf = null, last = 0, running = false;

    /** 부르르 떠는 구간은 시간이 늘어진다. 여기가 조마조마한 구간이다. */
    function timeScale() {
        if (state.phase !== 'tense' || reduceMotion) { return 1; }
        return SLOWMO_RATE;
    }

    /**
     * 카메라. 마지막 펌프질의 부르르 구간에서 [풍선 + 내 얼굴] 로 들어가고,
     * 터지기 직전에는 얼굴로 한 번 더 밀착한다.
     * 앞의 두 번은 살짝만 당긴다 — 매번 최대로 들어가면 마지막이 안 세진다.
     */
    function camTarget(g) {
        var ph = state.phase;
        if (reduceMotion) { return { x: view.w / 2, y: view.h / 2, s: 1 }; }
        var b = g.balloon();
        var hy = g.me.y - g.me.s * 0.70;
        if (ph === 'tense') {
            var z = lastStroke() ? 1.50 : 1.16;
            return { x: (b.x + g.me.x) / 2, y: (b.y + hy) / 2, s: z };
        }
        if (ph === 'pump') {
            return { x: (b.x + g.me.x) / 2, y: (b.y + hy) / 2, s: lastStroke() ? 1.30 : 1.10 };
        }
        if (ph === 'swell') { return { x: g.me.x, y: hy + g.me.s * 0.04, s: 2.20 }; }
        if (ph === 'burst') {
            var k = Math.min(1, phaseT() * 2.2);
            return { x: g.me.x, y: hy + g.me.s * (0.04 + k * 0.34), s: 2.20 - k * 0.90 };
        }
        if (ph === 'safe') {
            return { x: view.w / 2, y: view.h / 2, s: 1 + (1 - Math.min(1, phaseT() * 2.6)) * 0.26 };
        }
        return { x: view.w / 2, y: view.h / 2, s: 1 };
    }

    function loop(now) {
        var raw = Math.min(0.05, (now - last) / 1000);
        last = now;
        var dt = raw * timeScale();

        if (shake > 0) { shake = Math.max(0, shake - dt * 1400); }
        if (flash > 0) { flash = Math.max(0, flash - raw * 5.0); }

        var ph = state.phase;

        // 손잡이가 눌렸다가 스르르 올라온다
        if (ph === 'pump') { handleT = Math.sin(phaseT() * Math.PI * 0.92); }
        else { handleT += (0 - handleT) * Math.min(1, raw * 8); }

        if (ph === 'tense') {
            wobble = 1;
            shake = Math.max(shake, lastStroke() ? 55 : 26);
        } else if (ph === 'swell') { swellT = phaseT(); }
        else if (ph === 'burst') { swellT = 1; }
        else { wobble = 0; }

        // 풍선 크기. 펌프질 한 번에 확 커져야 눈에 띈다
        var want = state.bal ? fullness(state.bal) : 0;
        shownFull += (want - shownFull) * Math.min(1, raw * 20);
        popT += raw;

        // 펌프질하는 동안 주변이 어둠에 묻힌다 (핀조명)
        var lit = ph === 'pump' || ph === 'tense' || ph === 'swell';
        dim += ((lit ? 0.72 : 0) - dim) * Math.min(1, raw * (lit ? 7 : 14));

        var ct = camTarget(geom());
        var k = raw * (ph === 'tense' || ph === 'swell' ? 13 : 7);
        cam.x += (ct.x - cam.x) * Math.min(1, k);
        cam.y += (ct.y - cam.y) * Math.min(1, k);
        cam.s += (ct.s - cam.s) * Math.min(1, k);

        if (timer > 0) {
            timer -= dt * 1000;
            if (timer <= 0) { timer = 0; stepPhase(); }
        }

        stepPulse(raw);
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

    /*
     * BGM 클럭. 8분음표 하나가 한 칸이다.
     * 화면 맥박과 음악이 이 하나를 공유한다 (규격 8-4).
     */
    function stepPulse(dt) {
        if (!musicOn()) { return; }
        var rate = beatRate();
        pulsePhase += dt * rate;
        while (pulsePhase >= 1) {
            pulsePhase -= 1;
            pulseCount += 1;
            sfx.note(pulseCount, shownFull, rate);
        }
    }

    /** 4분음표 한 박 안에서 얼마나 지났나. 1이면 방금 쳤다. */
    function pulseGlow() {
        if (!musicOn()) { return 0; }
        var q = ((pulseCount % 2) + pulsePhase) / 2;
        return Math.max(0, 1 - q * 3.4);
    }

    /** 펌프질 반동. 방금 눌렀으면 1 에서 시작해 흔들리며 잦아든다. */
    function popKick() {
        if (popT > 1.4 || reduceMotion) { return 0; }
        return Math.exp(-popT * 5.2) * Math.cos(popT * 13.5);
    }

    /** 펌프질 직후 매듭에서 바람이 새어 나오는 자국. 한 번 들어갔다는 신호다. */
    function puffAt(g) {
        var b = g.balloon();
        for (var i = 0; i < 10; i++) {
            var a = Math.PI * (0.15 + Math.random() * 0.7);
            var sp = 40 + Math.random() * 130;
            splash.push({
                x: b.x + (Math.random() - 0.5) * b.r * 0.5,
                y: b.y + b.r * 1.05,
                vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp * 0.5,
                r: 1.4 + Math.random() * 2.6,
                life: 0.22 + Math.random() * 0.2
            });
        }
    }

    // ── 파티클 ──────────────────────────────────────────────

    /** 풍선이 터진다. 물이 바로 아래로 쏟아진다. */
    function burstPour() {
        var g = geom();
        var b = g.balloon();
        for (var i = 0; i < 150; i++) {
            var a = Math.PI * (0.12 + Math.random() * 0.76);
            var sp = 60 + Math.random() * 430;
            pour.push({
                x: b.x + (Math.random() - 0.5) * b.r * 1.3,
                y: b.y + b.r * 0.3,
                vx: Math.cos(a) * sp * 0.55,
                vy: Math.abs(Math.sin(a)) * sp + 90,
                r: 2.5 + Math.random() * 7,
                life: 0.8 + Math.random() * 0.9
            });
        }
        for (i = 0; i < 44; i++) {
            wetGlass.push({
                x: view.w * Math.random(), y: view.h * Math.random() * 0.9,
                r: 4 + Math.random() * 15, vy: 8 + Math.random() * 26,
                life: 2.6 + Math.random()
            });
        }
        // 터진 고무 조각
        for (i = 0; i < 12; i++) {
            scraps.push({
                x: b.x, y: b.y,
                vx: (Math.random() - 0.5) * 340,
                vy: -60 - Math.random() * 200,
                w: b.r * (0.14 + Math.random() * 0.2),
                h: b.r * (0.10 + Math.random() * 0.16),
                rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
                life: 1.0 + Math.random() * 0.6
            });
        }
    }

    function stepParticles(dt) {
        var i, p;
        for (i = pour.length - 1; i >= 0; i--) {
            p = pour[i]; p.life -= dt;
            if (p.life <= 0) { pour.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1500 * dt; p.vx *= 0.99;
        }
        for (i = splash.length - 1; i >= 0; i--) {
            p = splash[i]; p.life -= dt;
            if (p.life <= 0) { splash.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt;
        }
        for (i = scraps.length - 1; i >= 0; i--) {
            p = scraps[i]; p.life -= dt;
            if (p.life <= 0) { scraps.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 620 * dt;
            p.vx *= 0.96; p.rot += p.vr * dt;
        }
        for (i = wetGlass.length - 1; i >= 0; i--) {
            p = wetGlass[i]; p.life -= dt;
            if (p.life <= 0) { wetGlass.splice(i, 1); continue; }
            p.y += p.vy * dt; p.vy += 14 * dt;
        }
    }

    // ── 배치 ────────────────────────────────────────────────
    function resize() {
        if (!canvas) { return; }
        var rect = canvas.parentElement.getBoundingClientRect();
        dpr = Math.min(2, window.devicePixelRatio || 1);
        view.w = Math.max(260, rect.width);
        view.h = Math.max(400, Math.min(window.innerHeight * 0.62, 540));
        canvas.width = Math.round(view.w * dpr);
        canvas.height = Math.round(view.h * dpr);
        canvas.style.width = view.w + 'px';
        canvas.style.height = view.h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /*
     * 화면은 위아래로 셋이다.
     *
     *            ◯            ← 풍선. 펌프질할 때마다 커진다. 이게 곧 위험도다
     *      ᴥ  ᴥ     ᴥ         ← 나머지 사람들 (뒤에서 구경)
     *            ◉  ▯         ← 이번 차례 사람과 펌프
     *
     * 남은 횟수를 UI 로 만들지 않는다. 풍선 크기가 말해준다 —
     * 세는 것보다 보는 게 빠르고, 세게 만들면 사람은 계산을 한다 (규격 8-3).
     */
    function geom() {
        var cx = view.w / 2;
        var meS = view.h * 0.30;
        var me = { x: cx - view.w * 0.06, y: view.h * 0.955, s: meS };

        /*
         * 풍선 크기 — **앞이 크고 뒤가 완만한** 곡선.
         *
         * 처음엔 비율 일정(기하급수)으로 뒀는데 그게 함정이었다.
         * 시작 반지름이 15px 이면 +16% 를 해봐야 **2.4px** 다. 비율은 컸지만 눈엔 안 보인다.
         * 상대 성장률만 보고 **절대 픽셀**을 안 본 탓이다.
         *
         * 그래서 두 가지를 바꿨다.
         *   ① 시작 크기를 키웠다 (2.8% → 8.5%). 손톱만 한 데서 시작하면 뭘 해도 안 보인다
         *   ② t^0.52 로 앞을 크게 부풀린다. **첫 펌프질에 반지름이 3분의 2 가까이 뛴다**
         *
         * 실제 풍선도 이렇게 부푼다 — 부피는 고르게 늘지만 반지름은 세제곱근이라
         * 처음에 확 커지고 나중엔 천천히 커진다.
         */
        // 좁은 폰에서 화면 밖으로 나가지 않게 폭으로도 한 번 묶는다
        var r0 = view.h * 0.085;
        var r1 = Math.min(view.h * 0.325, view.w * 0.480);
        var r = (r0 + (r1 - r0) * Math.pow(Math.min(1, shownFull), 0.52)) * (1 + swellT * 0.42);
        var by = view.h * 0.285 + Math.sin(last * 0.0016) * view.h * 0.005;
        function balloon() { return { x: cx + view.w * 0.02, y: by, r: r }; }

        // 펌프 — 이번 차례 사람 오른쪽 바닥에 놓여 있다
        var pw = meS * 0.20, ph = meS * 0.36;
        var px = me.x + meS * 0.40;
        var pump = {
            x: px, y: me.y, w: pw, h: ph,
            topY: me.y - ph,
            handY: me.y - ph - meS * 0.20 + handleT * meS * 0.19
        };

        var m = Math.max(0, (state.players || 4) - 1);
        var oS = view.h * 0.150;
        var oGap = Math.min(view.w * 0.19, (view.w * 0.92) / Math.max(1, m));
        function other(k) {
            return { x: cx + (k - (m - 1) / 2) * oGap, y: view.h * 0.70, s: oS };
        }

        return { cx: cx, me: me, balloon: balloon, pump: pump, other: other, others: m };
    }

    function theme() {
        var light = document.documentElement.getAttribute('data-theme') === 'light';
        return light
            ? {
                bg1: '#eaf1f8', bg2: '#c2cfdd', floor: 'rgba(71,85,105,0.28)',
                skin: '#f8d9bd', skinShade: '#e0b48f', line: '#7c4a2a',
                balloon1: '#7dd3fc', balloon2: '#0ea5e9', balloon3: '#0369a1',
                water: '#0ea5e9', waterLite: '#bae6fd',
                pumpA: '#e2e8f0', pumpB: '#94a3b8', pumpC: '#475569',
                hose: '#64748b',
                shadow: 'rgba(30,41,59,0.28)'
            }
            : {
                bg1: '#1b2432', bg2: '#080b10', floor: 'rgba(148,163,184,0.24)',
                skin: '#f0c9a5', skinShade: '#c99569', line: '#8a5a35',
                balloon1: '#7dd3fc', balloon2: '#0ea5e9', balloon3: '#075985',
                water: '#38bdf8', waterLite: '#bae6fd',
                pumpA: '#94a3b8', pumpB: '#475569', pumpC: '#2b3441',
                hose: '#475569',
                shadow: 'rgba(0,0,0,0.5)'
            };
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

        drawBackdrop(t, risk);

        ctx.save();
        ctx.translate(view.w / 2, view.h / 2);
        ctx.scale(cam.s, cam.s);
        ctx.translate(-cam.x, -cam.y);
        if (shake > 0 && !reduceMotion) {
            ctx.translate((Math.random() - 0.5) * shake / 26 / cam.s,
                          (Math.random() - 0.5) * shake / 30 / cam.s);
        }

        drawFloor(t, g);
        drawWatchers(t, g);
        drawHose(t, g);
        drawPump(t, g);
        drawShooter(t, g);
        drawBalloon(t, g);

        // 핀조명 — 주변을 어둠에 묻고 [풍선] 과 [내 캐릭터] 에만 빛을 내린다
        if (dim > 0.01) { drawDarkness(t, g); }

        drawScraps(t);
        drawPour(t);
        drawSplash(t);
        ctx.restore();

        drawVignette(risk);
        drawWetGlass();

        if (flash > 0.01) {
            ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.55).toFixed(3) + ')';
            ctx.fillRect(0, 0, view.w, view.h);
        }

        drawCaption();
    }

    function drawDarkness(t, g) {
        ctx.save();
        ctx.fillStyle = 'rgba(2,4,9,' + dim.toFixed(3) + ')';
        ctx.fillRect(-view.w, -view.h, view.w * 3, view.h * 3);

        var b = g.balloon(), me = g.me;
        var headY = me.y - me.s * 0.70;
        spotGlow(b.x, b.y, b.r * 2.2, 1.05);
        spotGlow(me.x, headY, me.s * 0.60, 0.95);

        var pool = ctx.createRadialGradient(me.x, me.y, 0, me.x, me.y, me.s * 0.62);
        pool.addColorStop(0, 'rgba(255,248,230,' + (0.20 * dim).toFixed(3) + ')');
        pool.addColorStop(1, 'rgba(255,248,230,0)');
        ctx.fillStyle = pool;
        ctx.beginPath();
        ctx.ellipse(me.x, me.y, me.s * 0.62, me.s * 0.17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        drawHose(t, g);
        drawPump(t, g);
        drawShooter(t, g);
        drawBalloon(t, g);
    }

    function spotGlow(x, y, r, power) {
        var glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
        glow.addColorStop(0, 'rgba(255,250,235,' + (0.32 * dim * power).toFixed(3) + ')');
        glow.addColorStop(0.55, 'rgba(255,250,235,' + (0.13 * dim * power).toFixed(3) + ')');
        glow.addColorStop(1, 'rgba(255,250,235,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawBackdrop(t, risk) {
        var bg = ctx.createLinearGradient(0, 0, 0, view.h);
        bg.addColorStop(0, t.bg1);
        bg.addColorStop(1, t.bg2);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, view.w, view.h);

        if (musicOn()) {
            var a = 0.02 + risk * 0.09 + pulseGlow() * (0.04 + risk * 0.12);
            ctx.fillStyle = 'rgba(190,30,55,' + a.toFixed(3) + ')';
            ctx.fillRect(0, 0, view.w, view.h);
        }
    }

    /** 바닥선. 사람들이 서 있는 자리를 알려주는 선 하나면 충분하다. */
    function drawFloor(t, g) {
        ctx.strokeStyle = t.floor;
        ctx.lineWidth = Math.max(2, view.h * 0.005);
        ctx.beginPath();
        ctx.moveTo(-view.w, view.h * 0.735);
        ctx.lineTo(view.w * 2, view.h * 0.735);
        ctx.stroke();
    }

    /*
     * 풍선. 판 내내 하나뿐이고 펌프질할 때마다 커진다.
     *
     * ⚠ 터질 지점을 그리는 분기를 절대 만들지 않는다.
     *   이 함수는 크기(shownFull)·흔들림(wobble)·부풂(swellT) 만 본다.
     */
    function drawBalloon(t, g) {
        if (!state.bal || state.phase === 'burst') { return; }   // 터져서 없다
        var b = g.balloon();
        var r = b.r;

        var wob = (wobble > 0 && !reduceMotion) ? Math.sin(last * 0.09) * 0.14 * wobble : 0;

        /*
         * 손잡이를 누르는 동안 풍선이 살짝 움츠러들었다가(예비 동작),
         * 바람이 들어가는 순간 옆으로 뽕 늘어나며 튕긴다.
         * 움츠렸다 펴는 예비 동작이 있어야 같은 크기 변화가 훨씬 크게 보인다.
         */
        var anti = (state.phase === 'pump' && !reduceMotion) ? -0.06 * phaseT() : 0;
        var kick = popKick();
        var rx = r * (1 + anti + wob + kick * 0.44);
        var ry = r * (1.12 + anti - wob * 0.7 - kick * 0.20);

        ctx.save();
        ctx.translate(b.x, b.y);

        // 매듭 — 아래쪽. 호스가 여기 물려 있다
        ctx.fillStyle = t.balloon3;
        ctx.beginPath();
        ctx.moveTo(-r * 0.15, ry * 0.94);
        ctx.lineTo(r * 0.15, ry * 0.94);
        ctx.lineTo(0, ry * 1.24);
        ctx.closePath();
        ctx.fill();

        // 몸통
        var grd = ctx.createRadialGradient(-rx * 0.34, -ry * 0.40, rx * 0.08, 0, 0, rx * 1.15);
        grd.addColorStop(0, t.balloon1);
        grd.addColorStop(0.55, t.balloon2);
        grd.addColorStop(1, t.balloon3);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        // 안에 찰랑이는 물
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = 'rgba(2,132,199,0.45)';
        var wl = -ry * 0.15 + Math.sin(last * 0.003) * ry * 0.04;
        ctx.fillRect(-rx, wl, rx * 2, ry * 2);
        ctx.fillStyle = 'rgba(186,230,253,0.55)';
        ctx.fillRect(-rx, wl, rx * 2, Math.max(1.5, ry * 0.035));
        ctx.restore();

        // 팽팽할수록 고무가 얇아져 반사광이 길게 늘어난다
        var tight = Math.min(1, shownFull + swellT);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.45 + tight * 0.30).toFixed(2) + ')';
        ctx.beginPath();
        ctx.ellipse(-rx * 0.36, -ry * 0.36, rx * (0.16 + tight * 0.10),
                    ry * (0.11 + tight * 0.06), -0.6, 0, Math.PI * 2);
        ctx.fill();

        // 터지기 직전에는 표면에 금이 간 듯한 결이 보인다
        if (tight > 0.72) {
            ctx.strokeStyle = 'rgba(255,255,255,' + ((tight - 0.72) * 0.9).toFixed(2) + ')';
            ctx.lineWidth = Math.max(1, r * 0.03);
            for (var i = 0; i < 4; i++) {
                var a = -0.9 + i * 0.6;
                ctx.beginPath();
                ctx.arc(0, 0, rx * 0.82, a, a + 0.36);
                ctx.stroke();
            }
        }

        // 바람이 막 들어간 순간 — 테두리가 하얗게 번쩍한다. 눈이 여기로 끌린다
        if (popT < 0.24) {
            ctx.strokeStyle = 'rgba(255,255,255,' + ((1 - popT / 0.24) * 0.8).toFixed(3) + ')';
            ctx.lineWidth = Math.max(2, r * 0.06);
            ctx.beginPath();
            ctx.ellipse(0, 0, rx * 1.04, ry * 1.03, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 위험할수록 테두리가 붉게 맥박친다
        var risk = shownRisk();
        if (risk >= 0.26 && state.phase !== 'over') {
            ctx.strokeStyle = 'rgba(251,113,133,' + (0.20 + pulseGlow() * 0.5).toFixed(3) + ')';
            ctx.lineWidth = Math.max(2, r * 0.07);
            ctx.beginPath();
            ctx.ellipse(0, 0, rx * 1.10, ry * 1.08, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    /** 펌프에서 풍선 매듭까지 이어진 호스. */
    function drawHose(t, g) {
        if (!state.bal || state.phase === 'burst') { return; }
        var b = g.balloon(), p = g.pump;
        ctx.strokeStyle = t.hose;
        ctx.lineWidth = Math.max(3, view.h * 0.009);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x + p.w * 0.5, p.topY + p.h * 0.18);
        ctx.quadraticCurveTo(p.x + p.w * 2.2, b.y + b.r * 2.2, b.x, b.y + b.r * 1.20);
        ctx.stroke();
    }

    /**
     * 발펌프. 손잡이를 누르면 몸통이 눌리고 바람이 들어간다.
     * 작게 그린다 — 주인공은 펌프가 아니라 풍선과 얼굴이다.
     */
    function drawPump(t, g) {
        var p = g.pump;

        // 바닥판
        ctx.fillStyle = t.pumpC;
        roundRect(p.x - p.w * 0.9, p.y - p.h * 0.10, p.w * 1.8, p.h * 0.12, p.h * 0.05);
        ctx.fill();

        // 몸통 — 손잡이가 내려온 만큼 짧아진다
        var body = p.h * (1 - handleT * 0.34);
        var bg = ctx.createLinearGradient(p.x - p.w / 2, 0, p.x + p.w / 2, 0);
        bg.addColorStop(0, t.pumpC);
        bg.addColorStop(0.4, t.pumpA);
        bg.addColorStop(1, t.pumpB);
        ctx.fillStyle = bg;
        roundRect(p.x - p.w / 2, p.y - body, p.w, body, p.w * 0.22);
        ctx.fill();

        // 주름 — 눌리면 촘촘해진다
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = Math.max(1, p.w * 0.09);
        for (var i = 1; i <= 3; i++) {
            var y = p.y - body * (i / 4);
            ctx.beginPath();
            ctx.moveTo(p.x - p.w * 0.42, y);
            ctx.lineTo(p.x + p.w * 0.42, y);
            ctx.stroke();
        }

        // 손잡이
        ctx.fillStyle = t.pumpC;
        roundRect(p.x - p.w * 0.14, p.handY, p.w * 0.28, p.y - body - p.handY + 2, p.w * 0.12);
        ctx.fill();
        ctx.fillStyle = t.pumpB;
        roundRect(p.x - p.w * 0.72, p.handY - p.w * 0.20, p.w * 1.44, p.w * 0.34, p.w * 0.16);
        ctx.fill();
    }

    /**
     * 이 사람이 지금 지어야 할 표정과 자세.
     *
     * ⚠ 물벼락이 터진 뒤에는 어떤 경로로도 웃는 표정이 나오지 않는다.
     *   벌칙 확정인 사람 옆에서 축하하지 않는다 (규격 8-17).
     */
    function faceOf(isMe) {
        var ph = state.phase, t = phaseT();
        var f = { eye: 'open', mouth: 'flat', sweat: 0, armUp: 0, tremble: 0,
                  wet: 0, slump: 0, pumpArm: 0, wipe: 0 };
        var risk = shownRisk();

        // ── 패배 확정 구간 — 다른 모든 표정 규칙을 덮어쓴다 ──
        if (ph === 'burst' || ph === 'over') {
            if (isMe) {
                f.eye = 'xx'; f.mouth = 'zig'; f.wet = 1;
                f.slump = Math.min(1, t * 2.2);
                f.tremble = Math.max(0, 0.5 - t * 1.5);
            } else {
                if (t < 0.45) { f.eye = 'wide'; f.mouth = 'gape'; }
                else { f.eye = 'sad'; f.mouth = 'frown'; }
            }
            return f;
        }
        if (ph === 'swell') {
            if (isMe) { f.eye = 'shut'; f.mouth = 'wide'; f.sweat = 1;
                        f.tremble = 1; f.pumpArm = 1; }
            else { f.eye = 'wide'; f.mouth = 'gape'; }
            return f;
        }

        if (ph === 'intro' || ph === 'setup' || ph === 'ready') {
            if (isMe && ph === 'ready') {
                f.eye = risk >= 0.4 ? 'wide' : 'open';
                f.mouth = risk >= 0.4 ? 'o' : 'flat';
                f.sweat = risk * 0.6;
                f.pumpArm = 1;
            }
            return f;
        }
        if (ph === 'pump') {
            // 손잡이를 누르는 동안. 마지막 한 번은 눈을 질끈 감는다
            if (isMe) {
                f.eye = lastStroke() ? 'shut' : 'wide';
                f.mouth = 'wide';
                f.sweat = 0.4 + risk * 0.6;
                f.tremble = 0.3 + risk * 0.4;
                f.pumpArm = 1;
            } else { f.eye = 'wide'; f.mouth = 'o'; }
            return f;
        }
        if (ph === 'tense') {
            if (isMe) {
                f.eye = 'shut'; f.mouth = 'wide';
                f.sweat = 1; f.tremble = 1; f.pumpArm = 1;
            } else { f.eye = 'wide'; f.mouth = lastStroke() ? 'gape' : 'o'; }
            return f;
        }
        if (ph === 'safe') {
            // 질끈 → 한쪽 눈 → 두 눈 → 후우 하고 땀을 훔친다 → 웃음
            // 구경꾼은 당사자가 숨을 내쉰 뒤에야 웃는다
            if (isMe) {
                f.sweat = Math.max(0, 1 - t * 1.8);
                f.tremble = Math.max(0, 0.8 - t * 2.6);
                if (t < 0.26) { f.eye = 'shut'; f.mouth = 'wide'; f.pumpArm = 1; }
                else if (t < 0.42) { f.eye = 'peek'; f.mouth = 'o'; f.pumpArm = 1; }
                else if (t < 0.60) { f.eye = 'wide'; f.mouth = 'o'; f.wipe = (t - 0.42) / 0.18; }
                else { f.eye = 'happy'; f.mouth = 'smile'; f.wipe = Math.max(0, 1 - (t - 0.60) * 5); }
            } else {
                if (t < 0.55) { f.eye = 'wide'; f.mouth = 'o'; }
                else { f.eye = 'happy'; f.mouth = 'smile'; }
            }
            return f;
        }
        return f;
    }

    /** 뒤에서 구경하는 사람들. 이번 차례 사람을 뺀 나머지다. */
    function drawWatchers(t, g) {
        var f = faceOf(false);
        var k = 0;
        for (var i = 0; i < state.players; i++) {
            if (i === state.turn) { continue; }
            drawPerson(t, g, i, g.other(k), f, false);
            k += 1;
        }
    }

    /** 이번 차례 사람. 크게, 앞에, 한 손은 펌프 손잡이에. */
    function drawShooter(t, g) {
        drawPerson(t, g, state.turn, g.me, faceOf(true), true);
    }

    /*
     * 사람 하나. 리얼하게 그리지 않는다 — 동글동글한 납작 캐릭터로,
     * 표정만 확실히 읽히게 한다. 폰 화면에서 얼굴이 크게 잡아도 90px 라
     * 눈썹·눈·입 세 개로 승부를 봐야 한다.
     */
    function drawPerson(t, g, seat, p, f, isMe) {
        var s = p.s;
        var color = COLORS[seat % COLORS.length];
        var hair = HAIR[seat % HAIR.length];
        var tr = f.tremble ? Math.sin(last * 0.05 + seat) * s * 0.016 * f.tremble : 0;
        var x = p.x + tr, y = p.y;
        var sl = f.slump * s * 0.07;                       // 축 처진다
        var hy = y - s * 0.70 + sl, hr = s * 0.29;

        ctx.fillStyle = t.shadow;
        ctx.beginPath();
        ctx.ellipse(p.x, y + s * 0.02, s * 0.23, s * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();

        drawArms(t, g, x, y, s, f, sl, isMe);

        var bw = s * 0.40, bh = s * 0.44 - sl;
        ctx.fillStyle = color;
        roundRect(x - bw / 2, y - bh, bw, bh, bw * 0.34);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.arc(x, y - bh * 0.52, s * 0.085, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = '800 ' + Math.round(s * 0.115) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(seat + 1), x, y - bh * 0.52 + s * 0.004);

        ctx.fillStyle = t.skinShade;
        roundRect(x - s * 0.05, hy + hr * 0.6, s * 0.10, s * 0.10, s * 0.03);
        ctx.fill();

        ctx.fillStyle = t.skin;
        ctx.beginPath();
        ctx.arc(x, hy, hr, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = hair;
        ctx.beginPath();
        ctx.ellipse(x, hy - hr * 0.34, hr * 0.98, hr * 0.72, 0, Math.PI, Math.PI * 2);
        ctx.fill();

        drawFace(t, x, hy, hr, f);
        if (f.sweat > 0.05) { drawSweat(x, hy, hr, f.sweat, seat); }
        if (f.wet > 0.05) { drawWetOverlay(t, x, y, s, hy, hr, f.wet); }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    /** 팔. 이번 차례 사람은 한 팔이 풍선을 향해 올라가고 그 끝에 물총이 있다. */
    function drawArms(t, g, x, y, s, f, sl, isMe) {
        var sy = y - s * 0.38 + sl, sx = s * 0.19;
        ctx.strokeStyle = t.skin;
        ctx.lineWidth = s * 0.075;
        ctx.lineCap = 'round';

        var u = f.armUp;
        var hands = [
            { ox: -sx, hx: x - sx - s * (0.05 + u * 0.10), hy: sy + s * (0.26 - u * 0.50) },
            { ox: sx, hx: x + sx + s * (0.05 + u * 0.10), hy: sy + s * (0.26 - u * 0.50) }
        ];

        // 살아남고 나서 이마의 땀을 훔친다. 안도가 몸으로 나오는 동작이다
        if (f.wipe > 0.02) {
            hands[0].hx = x + Math.sin(last * 0.018) * s * 0.15;
            hands[0].hy = y - s * 0.86;
        }

        // 오른손은 펌프 손잡이에 얹혀 있다. 손잡이를 따라 같이 내려간다
        if (f.pumpArm > 0 && isMe) {
            var p = g.pump;
            hands[1].hx = p.x;
            hands[1].hy = p.handY - s * 0.02;
        }

        for (var i = 0; i < 2; i++) {
            ctx.beginPath();
            ctx.moveTo(x + hands[i].ox, sy);
            ctx.lineTo(hands[i].hx, hands[i].hy);
            ctx.stroke();
        }
    }

    /** 눈·눈썹·입. 이 셋이 이 게임의 UI 전부다. */
    function drawFace(t, x, hy, hr, f) {
        var ex = hr * 0.40, ey = hy - hr * 0.06;
        var worried = f.eye === 'shut' || f.eye === 'wide' ||
                      f.eye === 'peek' || f.eye === 'sad' || f.eye === 'xx';
        var sgn, px;

        // 눈썹 — 있고 없고의 차이가 제일 크다
        ctx.strokeStyle = t.line;
        ctx.lineWidth = Math.max(1.4, hr * 0.09);
        ctx.lineCap = 'round';
        for (sgn = -1; sgn <= 1; sgn += 2) {
            var bx = x + sgn * ex, by = hy - hr * 0.42;
            ctx.beginPath();
            if (worried) {
                ctx.moveTo(bx - sgn * hr * 0.20, by + hr * 0.10);
                ctx.lineTo(bx + sgn * hr * 0.20, by - hr * 0.02);
            } else {
                ctx.moveTo(bx - sgn * hr * 0.20, by);
                ctx.lineTo(bx + sgn * hr * 0.20, by);
            }
            ctx.stroke();
        }

        for (sgn = -1; sgn <= 1; sgn += 2) {
            px = x + sgn * ex;
            var shut = f.eye === 'shut' || (f.eye === 'peek' && sgn < 0);

            if (f.eye === 'xx') {
                // 정신이 나갔다. 물벼락을 정통으로 맞은 얼굴
                ctx.strokeStyle = '#1f2937';
                ctx.lineWidth = Math.max(1.8, hr * 0.11);
                var d = hr * 0.17;
                ctx.beginPath();
                ctx.moveTo(px - d, ey - d); ctx.lineTo(px + d, ey + d);
                ctx.moveTo(px + d, ey - d); ctx.lineTo(px - d, ey + d);
                ctx.stroke();
            } else if (f.eye === 'sad') {
                // 측은하게 바라본다 — 눈꺼풀이 반쯤 내려온다
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.ellipse(px, ey + hr * 0.03, hr * 0.17, hr * 0.16, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#111827';
                ctx.beginPath();
                ctx.arc(px, ey + hr * 0.07, hr * 0.085, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#1f2937';
                ctx.lineWidth = Math.max(1.6, hr * 0.09);
                ctx.beginPath();
                ctx.arc(px, ey + hr * 0.14, hr * 0.19, Math.PI * 1.05, Math.PI * 1.95);
                ctx.stroke();
            } else if (shut || f.eye === 'happy') {
                ctx.strokeStyle = '#1f2937';
                ctx.lineWidth = Math.max(1.6, hr * 0.10);
                ctx.beginPath();
                ctx.arc(px, ey + hr * (shut ? 0.10 : 0.14), hr * 0.19,
                        Math.PI * 1.14, Math.PI * 1.86);
                ctx.stroke();
            } else {
                var big = f.eye === 'wide' || f.eye === 'peek';
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.ellipse(px, ey, hr * (big ? 0.20 : 0.15), hr * (big ? 0.24 : 0.17), 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#111827';
                ctx.beginPath();
                ctx.arc(px, ey - hr * (big ? 0.05 : 0), hr * (big ? 0.10 : 0.09), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        var my = hy + hr * 0.40;
        ctx.strokeStyle = '#1f2937';
        ctx.fillStyle = '#6b2737';
        ctx.lineWidth = Math.max(1.4, hr * 0.08);
        if (f.mouth === 'o') {
            ctx.beginPath();
            ctx.ellipse(x, my, hr * 0.11, hr * 0.13, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (f.mouth === 'wide') {
            ctx.beginPath();
            ctx.ellipse(x, my + hr * 0.03, hr * 0.19, hr * 0.25, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (f.mouth === 'gape') {
            // 턱이 빠질 듯이 벌어진다
            ctx.beginPath();
            ctx.ellipse(x, my + hr * 0.10, hr * 0.22, hr * 0.36, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#1f2937';
            ctx.lineWidth = Math.max(1.2, hr * 0.05);
            ctx.stroke();
        } else if (f.mouth === 'frown') {
            // 측은해하는 입 — 아래로 처진다
            ctx.beginPath();
            ctx.arc(x, my + hr * 0.30, hr * 0.22, Math.PI * 1.18, Math.PI * 1.82);
            ctx.stroke();
        } else if (f.mouth === 'smile') {
            ctx.beginPath();
            ctx.arc(x, my - hr * 0.10, hr * 0.22, Math.PI * 0.18, Math.PI * 0.82);
            ctx.stroke();
        } else if (f.mouth === 'zig') {
            ctx.beginPath();
            ctx.moveTo(x - hr * 0.22, my);
            for (var k = 1; k <= 4; k++) {
                ctx.lineTo(x - hr * 0.22 + hr * 0.11 * k, my + (k % 2 ? hr * 0.10 : 0));
            }
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(x - hr * 0.14, my);
            ctx.lineTo(x + hr * 0.14, my);
            ctx.stroke();
        }
    }

    /** 식은땀. 겁먹은 정도가 얼굴 밖으로 나오는 유일한 신호다. */
    function drawSweat(x, hy, hr, amt, seat) {
        var n = amt > 0.66 ? 3 : (amt > 0.33 ? 2 : 1);
        ctx.fillStyle = 'rgba(125,211,252,0.95)';
        for (var i = 0; i < n; i++) {
            var ph = (last * 0.0016 + i * 0.37 + seat * 0.11) % 1;
            var dx = (i % 2 ? 1 : -1) * hr * (0.95 + i * 0.06);
            var dy = -hr * 0.30 + ph * hr * 0.95;
            ctx.beginPath();
            ctx.ellipse(x + dx, hy + dy, hr * 0.075, hr * 0.11, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /** 물벼락을 맞은 뒤. 축 젖어서 색이 내려앉고 물이 뚝뚝 떨어진다. */
    function drawWetOverlay(t, x, y, s, hy, hr, amt) {
        ctx.save();
        ctx.globalAlpha = amt * 0.38;
        ctx.fillStyle = t.water;
        ctx.beginPath();
        ctx.arc(x, hy, hr * 1.05, 0, Math.PI * 2);
        ctx.fill();
        roundRect(x - s * 0.21, y - s * 0.45, s * 0.42, s * 0.45, s * 0.14);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = 'rgba(125,211,252,0.9)';
        for (var i = 0; i < 6; i++) {
            var ph = (last * 0.0013 + i * 0.28) % 1;
            ctx.beginPath();
            ctx.ellipse(x + (i - 2.5) * hr * 0.40, hy + hr * 0.75 + ph * s * 0.32,
                        hr * 0.07, hr * 0.13, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /** 빈 풍선의 잔해. 팔랑거리며 떨어진다. */
    function drawScraps(t) {
        for (var i = 0; i < scraps.length; i++) {
            var c = scraps[i];
            ctx.save();
            ctx.globalAlpha = Math.min(1, c.life);
            ctx.translate(c.x, c.y);
            ctx.rotate(c.rot);
            ctx.fillStyle = t.balloon2;
            ctx.beginPath();
            ctx.ellipse(0, 0, c.w, c.h, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    /** 터진 물풍선. 옆으로 튀는 게 아니라 아래로 쏟아진다. */
    function drawPour(t) {
        for (var i = 0; i < pour.length; i++) {
            var p = pour[i];
            ctx.globalAlpha = Math.min(1, p.life * 1.5) * 0.92;
            ctx.fillStyle = i % 4 === 0 ? t.waterLite : t.water;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, p.r * 0.8, p.r * 1.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawSplash(t) {
        for (var i = 0; i < splash.length; i++) {
            var p = splash[i];
            ctx.globalAlpha = Math.min(1, p.life * 2.2) * 0.9;
            ctx.fillStyle = t.waterLite;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawWetGlass() {
        for (var i = 0; i < wetGlass.length; i++) {
            var p = wetGlass[i];
            ctx.globalAlpha = Math.min(0.55, p.life * 0.35);
            var rg = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1, p.x, p.y, p.r);
            rg.addColorStop(0, 'rgba(255,255,255,0.75)');
            rg.addColorStop(0.6, 'rgba(186,230,253,0.35)');
            rg.addColorStop(1, 'rgba(56,189,248,0.05)');
            ctx.fillStyle = rg;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawVignette(risk) {
        if (state.phase === 'setup' || state.phase === 'over') { return; }
        var a = Math.min(0.6, 0.10 + risk * 0.28 + pulseGlow() * 0.07 + dim * 0.18);
        var rg = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.26,
                                          view.w / 2, view.h / 2, view.h * 0.78);
        rg.addColorStop(0, 'rgba(0,0,0,0)');
        rg.addColorStop(1, 'rgba(110,8,22,' + a.toFixed(3) + ')');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, view.w, view.h);
    }

    /*
     * 예능 자막.
     *
     * 화면 좌표에 그린다 — 카메라가 ×2.3 까지 들어가 있어도 자막 크기는 그대로여야 한다.
     * 굵은 검은 테두리 + 색 채움 + 살짝 기울임. 튀어나오듯 팝인한다.
     *
     * 걸린 사람을 놀리는 문구는 자막으로만 쓴다. 캐릭터 표정은 건드리지 않는다 —
     * 물벼락을 맞았는데 다들 웃고 있는 그림이 어색했던 게 앞 판의 문제였다 (규격 8-17).
     * 자막은 '게임의 목소리' 라서 웃겨도 되고, 얼굴은 안 된다.
     */
    function captionNow() {
        var ph = state.phase, t = phaseT();
        if (ph === 'safe' && t >= 0.42) {
            return { text: '휴, 살았다~', color: '#4ade80', at: (t - 0.42) / 0.13 };
        }
        if (ph === 'over') {
            return { text: '응 너야~ ㅋㅋ', color: '#fb7185', at: 3 };
        }
        if (ph === 'burst' && t >= 0.30) {
            return { text: '응 너야~ ㅋㅋ', color: '#fb7185', at: (t - 0.30) / 0.11 };
        }
        return null;
    }

    function drawCaption() {
        var c = captionNow();
        if (!c) { return; }

        var size = Math.min(view.w * 0.115, view.h * 0.075);
        // 튀어나오듯 팝인한다 — 감쇠하는 진동
        var s = 1 + 0.5 * Math.exp(-c.at * 5.5) * Math.cos(c.at * 13);
        var a = Math.min(1, c.at * 3.2);
        var y = view.h * (c.color === '#4ade80' ? 0.30 : 0.25);

        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(view.w / 2, y);
        ctx.rotate(-0.045);
        ctx.scale(s, s);
        ctx.font = '800 ' + Math.round(size) + 'px Syne, Manrope, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#0b1118';
        ctx.lineWidth = size * 0.30;
        ctx.strokeText(c.text, 0, 0);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = size * 0.10;
        ctx.strokeText(c.text, 0, 0);
        ctx.fillStyle = c.color;
        ctx.fillText(c.text, 0, 0);

        ctx.restore();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    // ── 사운드 ──────────────────────────────────────────────
    /*
     * 음악 파일을 쓰지 않는다. BGM 까지 전부 Web Audio 합성이다.
     *
     * 스타일은 서커스 갈롭 — 신나게 시작해서 풍선이 부풀수록 빨라지고
     * 조금씩 높아지며 기괴해진다. A 단조에 Am - Am - Dm - E7.
     *
     *   웅(베이스)  빠(화음)  웅  빠 …   ← 8분음표
     *   그 위에 멜로디 16음이 두 마디로 돈다
     *
     * 삐뽀삐뽀 사이렌은 뺐다 — 기계 경보음이라 이 게임에 안 어울린다 (규격 8-22).
     *
     * ⚠ BGM 은 판이 시작되면 계속 흐른다. 끊겼다 붙었다 하면 효과음 모음으로 들린다.
     *   딱 한 번만 끊는다 — 터지기 직전 0.22초. 그 정적이 제일 크게 놀라게 만든다.
     */
    var sfx = (function () {
        var actx = null, muted = false, bus = null;

        function ac() {
            if (!actx) {
                var C = window.AudioContext || window.webkitAudioContext;
                if (!C) { return null; }
                actx = new C();
            }
            if (actx.state === 'suspended') { actx.resume(); }
            return actx;
        }

        /** BGM 전용 버스. 이거 하나만 줄이면 음악이 통째로 멎는다. */
        function music() {
            var a = ac(); if (!a) { return null; }
            if (!bus) {
                bus = a.createGain();
                bus.gain.setValueAtTime(1, a.currentTime);
                bus.connect(a.destination);
            }
            return bus;
        }

        /*
         * 음 하나. 시작할 때 반드시 짧은 어택을 준다 —
         * 최대 볼륨에서 바로 시작하면 매 음마다 딱딱 하는 클릭 잡음이 난다.
         * 싸구려로 들리는 소리의 대부분이 이것 때문이다.
         */
        function voice(freq, dur, type, vol, slideTo, delay, toMusic) {
            if (muted) { return; }
            var a = ac(); if (!a) { return; }
            var out = toMusic ? music() : a.destination;
            if (!out) { return; }
            var t0 = a.currentTime + (delay || 0);
            var o = a.createOscillator(), gn = a.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, t0);
            if (slideTo) { o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur); }
            gn.gain.setValueAtTime(0.0001, t0);
            gn.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + Math.min(0.012, dur * 0.3));
            gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            o.connect(gn); gn.connect(out);
            o.start(t0); o.stop(t0 + dur + 0.02);
        }

        function tone(f, d, ty, v, s, dl) { voice(f, d, ty, v, s, dl, false); }
        function mtone(f, d, ty, v, s, dl) { voice(f, d, ty, v, s, dl, true); }

        function noise(dur, vol, cut, delay, sweepTo) {
            if (muted) { return; }
            var a = ac(); if (!a) { return; }
            var t0 = a.currentTime + (delay || 0);
            var n = Math.max(1, Math.floor(a.sampleRate * dur));
            var buf = a.createBuffer(1, n, a.sampleRate);
            var d = buf.getChannelData(0);
            for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n); }
            var src = a.createBufferSource(), gn = a.createGain(), f = a.createBiquadFilter();
            src.buffer = buf;
            f.type = sweepTo ? 'bandpass' : 'lowpass';
            f.frequency.setValueAtTime(cut || 2600, t0);
            if (sweepTo) { f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur); }
            gn.gain.setValueAtTime(0.0001, t0);
            gn.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.006);
            gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            src.connect(f); f.connect(gn); gn.connect(a.destination);
            src.start(t0);
        }

        function semi(base, n) { return base * Math.pow(2, n / 12); }

        return {
            /** 판 시작 — 풍선과 펌프를 건네받는다 */
            handOver: function () {
                var a = ac();
                if (a && bus) { bus.gain.cancelScheduledValues(a.currentTime);
                                bus.gain.setValueAtTime(1, a.currentTime); }
                tone(330, 0.14, 'triangle', 0.05);
                tone(440, 0.16, 'triangle', 0.05, null, 0.1);
                noise(0.12, 0.06, 1200, 0.22);
            },

            /*
             * BGM 한 음(8분음표). 서커스 갈롭.
             *   짝수 칸 — 웅 (베이스)
             *   홀수 칸 — 빠 (화음 스탭)
             *   그 위에 멜로디가 항상 얹힌다
             *
             * full 이 커지면 템포(호출 간격)뿐 아니라 음정도 최대 2반음 올라간다.
             * 신나던 곡이 조금씩 높고 조급해진다 — 이게 "기괴해진다" 의 정체다.
             */
            note: function (n, full, rate) {
                var k = ((n % 16) + 16) % 16;
                var ci = Math.floor(k / 4);
                var up = Math.pow(2, full * 2 / 12);
                var dur = Math.min(0.17, 0.52 / Math.max(1, rate));

                if (k % 2 === 0) {
                    // 웅 — 베이스. A1 을 기준으로 화음 근음을 따라간다
                    var bf = semi(55, CHORD_ROOT[ci]) * up;
                    mtone(bf, dur * 1.15, 'triangle', 0.090, bf * 0.82);
                    mtone(bf * 2, dur * 0.45, 'sine', 0.030);
                } else {
                    // 빠 — 화음 스탭. 짧고 톡톡 끊는다
                    var ct = CHORD_TONES[ci];
                    for (var i = 0; i < ct.length; i++) {
                        mtone(semi(220, ct[i]) * up, dur * 0.42, 'square', 0.020);
                    }
                }

                // 멜로디 — 두 음을 살짝 어긋나게 겹쳐 아코디언처럼 떨리게
                var mf = semi(440, MEL[k]) * up;
                mtone(mf, dur * 0.86, 'square', 0.040 + full * 0.018);
                mtone(mf * 1.005, dur * 0.86, 'square', 0.018 + full * 0.014);

                // 부풀수록 트라이톤이 낀다. 신나던 곡이 불길해진다
                if (full > 0.45 && k % 8 === 6) {
                    mtone(semi(mf, 6), dur * 0.6, 'sawtooth', 0.014 + full * 0.016);
                }
                // 막판에는 고음 심벌이 얹힌다
                if (full > 0.75 && k % 4 === 0) {
                    noise(0.09, 0.05 * full, 9000);
                }
            },

            /**
             * 펌프질 — 슈슉. 짧고 명쾌해야 손맛이 산다.
             * 팽팽할수록 바람 넣기가 힘들어져 낮고 길어진다.
             */
            pump: function (full, stroke, perTurn) {
                var eff = 1 - full * 0.35;
                noise(0.15 / eff, 0.30, 4200 * eff, 0, 800 * eff);   // 슈슉
                tone(200 * eff, 0.09, 'square', 0.10, 95);            // 손잡이가 바닥에 닿는다
                noise(0.05, 0.16, 1100, 0.13 / eff);                  // 칙
                if (stroke === perTurn - 1) { tone(300, 0.08, 'triangle', 0.05, 380, 0.02); }
            },

            /**
             * 펌프질 직후 — 풍선이 부르르 떤다.
             * 팽팽할수록 고무 소리가 높고 불쾌해진다. 두 음을 어긋나게 겹쳐 맥놀이를 만든다.
             */
            creak: function (full, last) {
                var d = last ? 0.9 : 0.55;
                var f0 = 420 + full * 1200;
                tone(f0, d, 'sawtooth', 0.038 + full * 0.045, f0 * 1.45, 0.02);
                tone(f0 * 1.012, d, 'sawtooth', 0.028 + full * 0.035, f0 * 1.46, 0.02);
                noise(d, 0.035 + full * 0.03, 900, 0.02, 4200);
            },

            /** 한 차례를 넘겼다 — 풍선이 팽팽한 채로 멈춘다 */
            hold: function () {
                noise(0.22, 0.10, 1400, 0, 420);          // 프슈— 바람이 잦아든다
                noise(0.5, 0.07, 780, 0.46);              // 후우— 내쉬는 숨
                tone(523, 0.12, 'triangle', 0.07, null, 0.50);
                tone(784, 0.16, 'triangle', 0.06, null, 0.58);
                tone(1046, 0.26, 'sine', 0.05, null, 0.66);
            },

            /**
             * 터지기 직전 — BGM 을 뚝 끊는다.
             * 0.22초 완전한 정적. 여기서 사람들이 제일 크게 놀란다.
             */
            stopMusic: function () {
                var a = ac(); if (!a || !bus) { return; }
                bus.gain.cancelScheduledValues(a.currentTime);
                bus.gain.setValueAtTime(bus.gain.value, a.currentTime);
                bus.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.03);
            },

            /** 펑. 쏟아지고, 잠시 뒤 놀리는 자막이 뜬다 */
            burst: function () {
                noise(0.12, 0.50, 7000);
                tone(90, 0.28, 'square', 0.16, 44);
                noise(1.1, 0.32, 3600, 0.06);             // 쏟아지는 물
                noise(0.7, 0.16, 1200, 0.3);
                // "응 너야~ ㅋㅋ" — 김빠지는 하강 3음
                tone(392, 0.16, 'sawtooth', 0.075, 370, 0.62);
                tone(330, 0.16, 'sawtooth', 0.075, 310, 0.78);
                tone(262, 0.34, 'sawtooth', 0.085, 190, 0.94);
            },

            wake: function () { ac(); music(); },
            setMuted: function (m) { muted = m; },
            isMuted: function () { return muted; }
        };
    })();

    // ── HUD ─────────────────────────────────────────────────
    function syncHud() {
        var risk = shownRisk();
        var ph = state.phase;
        var me = state.turn, meC = COLORS[me % COLORS.length];

        el.dangerTag.textContent = dangerLabel(risk);
        el.dangerTag.style.color = dangerColor(risk);
        el.dangerTag.style.borderColor = dangerColor(risk);

        var beat = (1 / beatRate()).toFixed(2) + 's';
        el.dangerTag.style.animationDuration = beat;
        el.stage.style.animationDuration = beat;

        /*
         * 몇 번째 펌프질인지, 몇 번 남았는지 화면에 쓰지 않는다.
         * 세면 알 수 있는 걸 세게 만들면 사람은 계산을 하고, 계산은 긴장을 걷어간다 (규격 8-3).
         * 진행 상황은 풍선 크기가 이미 다 말해준다.
         */
        var title = '', sub = '', c = meC;
        if (ph === 'intro') {
            title = '풍선을 건네받습니다';
            sub = '언젠가는 터집니다';
            c = 'var(--bw-text)';
        } else if (ph === 'ready') {
            title = (me + 1) + '번 차례';
            sub = '한 번 시작하면 못 멈춥니다';
        } else if (ph === 'pump') {
            title = (me + 1) + '번 차례';
            sub = '치이익—';
        } else if (ph === 'tense') {
            title = (me + 1) + '번 차례';
            sub = '어느 쪽일까요';
            c = 'var(--bw-text)';
        } else if (ph === 'swell') {
            title = '어어—';
            sub = '…';
            c = 'var(--bw-text)';
        } else if (ph === 'safe') {
            title = (me + 1) + '번, 넘겼습니다';
            sub = '휴— 다음 사람에게 넘어갑니다';
        } else if (ph === 'burst' || ph === 'over') {
            title = (me + 1) + '번 물벼락!';
            sub = '응 너야~ ㅋㅋ 벌칙 확정';
        }
        el.turn.textContent = title;
        el.turn.style.color = c;
        el.sub.textContent = sub;

        var ready = ph === 'ready';
        el.go.disabled = !ready;
        el.go.textContent = ready ? (me + 1) + '번 — 펌프질' : '…';
        el.go.style.borderColor = ready ? meC : '';
        el.go.style.color = ready ? meC : '';
        el.go.classList.toggle('is-hot', ready && risk >= 0.40);

        el.stage.classList.toggle('is-tight', risk >= 0.40);
        el.stage.classList.toggle('is-locked', ph === 'pump' || ph === 'tense');

        // 박자가 멈춘 구간에서는 화면 깜빡임도 같이 멈춘다 (규격 8-4)
        var hushed = !musicOn();
        el.stage.classList.toggle('is-hushed', hushed);
        el.dangerTag.classList.toggle('is-hushed', hushed);
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
            if (!btn || btn.disabled) { return; }
            btn.parentElement.querySelectorAll('button').forEach(function (b) { b.classList.remove('is-active'); });
            btn.classList.add('is-active');
        });

        el.start.addEventListener('click', function () {
            var p = parseInt(el.setup.querySelector('[data-players].is-active').getAttribute('data-players'), 10);
            el.setup.hidden = true;
            el.start.hidden = true;
            el.play.hidden = false;
            sfx.wake();
            startGame(p);
            startLoop();
            scrollIntoView(el.play);
        });

        el.go.addEventListener('click', startTurn);

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
            LAPS: LAPS,
            TARGET_PUMPS: TARGET_PUMPS,
            pumpsPerTurn: pumpsPerTurn,
            totalPumps: totalPumps,
            newBalloon: newBalloon,
            pump: pump,
            remainingOf: remainingOf,
            fullness: fullness,
            chanceLeft: chanceLeft,
            turnRisk: turnRisk,
            dangerLabel: dangerLabel,
            pulseRate: pulseRate,
            simulate: simulate
        };
        return;
    }

    // ── 공유 ────────────────────────────────────────────────
    var SHARE_URL = 'https://game.binaryworld.kr/roulette';
    var SHARE_TITLE = '물풍선 룰렛';
    var SHARE_DESC = '돌아가며 펌프질. 풍선이 커질수록 조마조마합니다. 터뜨린 사람이 물벼락!';

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
                imageUrl: 'https://game.binaryworld.kr/img/roulette.png',
                link: { mobileWebUrl: SHARE_URL, webUrl: SHARE_URL }
            }
        });
    };

    document.addEventListener('DOMContentLoaded', function () {
        canvas = document.getElementById('roulette-canvas');
        if (!canvas) { return; }
        ctx = canvas.getContext('2d');
        reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        el.setup = document.getElementById('roulette-setup');
        el.start = document.getElementById('roulette-start');
        el.play = document.getElementById('roulette-play');
        el.stage = document.getElementById('roulette-stage');
        el.dangerTag = document.getElementById('roulette-danger');
        el.turn = document.getElementById('roulette-turn');
        el.sub = document.getElementById('roulette-sub');
        el.go = document.getElementById('roulette-go');
        el.mute = document.getElementById('roulette-mute');
        el.result = document.getElementById('roulette-result');
        el.resultTitle = document.getElementById('roulette-result-title');
        el.resultDetail = document.getElementById('roulette-result-detail');
        el.again = document.getElementById('roulette-again');
        el.setupAgain = document.getElementById('roulette-setup-again');

        bind();
        resize();
        setupKakaoShareButton();
    });
})();
