/*
 * 사다리타기 워터슬라이드 — 워터슬라이드
 *
 * 설계 메모 (docs/plans/ladder.md)
 *  - 물이 미끄럼틀을 타고 내려간다. 점이 선을 따라가는 것보다 훨씬 잘 읽힌다.
 *  - 갈림길에서 물이 잠깐 망설였다가 한쪽으로 쏠린다. 뜸 들이기가 공짜로 생긴다.
 *  - 카메라가 물을 따라 내려간다. 아래가 안 보여서 긴장이 살고, 화면도 크게 쓸 수 있다.
 *  - 꽝 위치는 처음부터 공개한다. 어디로 가면 안 되는지 알아야 감정이 생긴다.
 *  - 점선 아래 "운명의 구간"만 숨긴다. 위쪽까지 숨겼더니 볼 게 없어서 무감각했다.
 *
 * 도착 현황은 캔버스 밖 HUD로 따로 뺐다. 카메라가 내려가면 도착 풀이 화면 밖으로 나가서
 * "어디가 꽝이었지?"를 알 수 없었기 때문이다. HUD는 항상 보인다.
 *
 * 운명의 구간은 참가자가 들어올 때 정해진다. 다만 두 사람이 같은 도착점에 가면
 * 복불복이 성립하지 않으므로 "남은 도착점 중에서만" 뽑는다. 진짜 랜덤이면서 1:1이 유지된다.
 *
 * 움직임은 경로 전체를 하나의 폴리라인으로 만들어 길이를 따라 보간한다.
 * 줄마다 타이머를 새로 시작하면 줄 경계에서 속도가 끊긴다(버벅임).
 *
 * Phaser를 쓰지 않는다. 물리가 없고 선과 원만 그리면 된다.
 */
(function () {
    'use strict';

    // ── 설정값 ──────────────────────────────────────────────
    var TOTAL_ROWS = 16;          // 인원과 무관하게 사다리 길이를 일정하게 유지한다
    var MIN_UPPER_ROWS = 6;
    var RUNG_DENSITY = 0.30;
    var ROW_H = 62;
    var PAD_TOP = 40;
    var POOL_H = 92;
    var DWELL_UPPER = 80;         // 위쪽 갈림길에서 망설이는 시간(ms). 길면 속도감이 죽는다
    var DWELL_ZONE = 140;         // 운명의 구간 중간. 여기서 오래 끌면 답답하다
    var DWELL_FINAL = 560;        // 마지막 줄에서 트는 순간. 여기가 제일 조여야 한다
    var HOLD_MS = 820;

    var COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#c084fc'];

    /*
     * 하강 속도(px/초).
     * 점선부터 끝까지 계속 느리게 했더니 구간이 길어서 답답했다.
     * 운명의 구간 안에서도 앞부분은 적당히 흘러가고, 마지막 두 줄에서만 확 조인다.
     */
    function speedAt(ratio, rowsLeft) {
        if (rowsLeft <= 1) { return 150; }
        if (rowsLeft <= 2) { return 250; }
        if (rowsLeft <= 4) { return 430; }
        if (ratio < 0.35) { return 1150; }
        if (ratio < 0.70) { return 780; }
        return 560;
    }

    // ── 상태 ────────────────────────────────────────────────
    var state = {
        players: 4, bombs: 1, cols: 4,
        zoneRows: 4, upperRows: 12, totalRows: 16,
        upperRungs: [], zoneRungs: [],
        bombSlots: [], usedCols: [], takenSlots: [],
        slotOwner: {},            // 도착점 -> 출발 번호. 도착한 뒤에만 채운다 (미리 채우면 결과가 새어나간다)
        paths: [], current: null,
        phase: 'setup', losers: []
    };

    var canvas, ctx, dpr = 1, view = { w: 320, h: 420 };
    var camY = 0;
    var el = {}, bgm = null;
    var flowPhase = 0, confetti = [], shake = 0;

    // ── 사다리 생성 ─────────────────────────────────────────
    function makeUpperRungs(cols, rows) {
        var out = [];
        for (var r = 0; r < rows; r++) {
            var row = [];
            for (var c = 0; c < cols - 1; c++) {
                if (row.length && row[row.length - 1] === c - 1) { continue; }
                if (Math.random() < RUNG_DENSITY) { row.push(c); }
            }
            out.push(row);
        }
        return out;
    }

    function touchesAny(row, c) {
        for (var i = 0; i < row.length; i++) {
            if (Math.abs(row[i] - c) < 2) { return true; }
        }
        return false;
    }

    // from 에서 to 까지 rows 줄에 걸쳐 한 칸씩 움직이는 계획을 만든다.
    function movesFor(from, to, rows) {
        var need = to - from;
        var moves = new Array(rows).fill(0);
        var dir = need > 0 ? 1 : -1;
        var slots = [];
        for (var i = 0; i < rows; i++) { slots.push(i); }
        shuffle(slots);
        for (var k = 0; k < Math.abs(need); k++) { moves[slots[k]] = dir; }
        return moves;
    }

    /*
     * 운명의 구간 가로줄.
     *
     * fakeCol 을 주면 마지막 줄 직전까지 그 자리에 가 있다가 마지막 줄에서 한 칸 튼다.
     * 안전한 자리로 들어갈 것처럼 굴다가 꽝으로 새는(또는 그 반대) 장면이 여기서 나온다.
     * |fakeCol - to| 는 항상 1이라 마지막 이동은 한 칸이다.
     */
    function makeZoneRungs(from, to, zoneRows, cols, fakeCol) {
        var moves;
        if (fakeCol === null || fakeCol === undefined) {
            moves = movesFor(from, to, zoneRows);
        } else {
            moves = movesFor(from, fakeCol, zoneRows - 1);
            moves.push(to - fakeCol);
        }

        var rungs = [], col = from;
        for (var r = 0; r < zoneRows; r++) {
            var row = [], prev = col;   // 판정 기준은 이 줄에 들어올 때의 열이다
            if (moves[r] === 1) { row.push(prev); col = prev + 1; }
            else if (moves[r] === -1) { row.push(prev - 1); col = prev - 1; }

            // 장식용. prev / prev-1 자리에 놓으면 물이 엉뚱한 쪽으로 샌다
            for (var c = 0; c < cols - 1; c++) {
                if (c === prev || c === prev - 1) { continue; }
                if (touchesAny(row, c)) { continue; }
                if (Math.random() < 0.16) { row.push(c); }
            }
            row.sort(function (a, b) { return a - b; });
            rungs.push(row);
        }
        return rungs;
    }

    function shuffle(a) {
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function rungsAt(row) {
        return row < state.upperRows ? state.upperRungs[row] : (state.zoneRungs[row - state.upperRows] || []);
    }

    function walkRow(col, row) {
        var rs = rungsAt(row);
        if (rs.indexOf(col) >= 0) { return col + 1; }
        if (rs.indexOf(col - 1) >= 0) { return col - 1; }
        return col;
    }

    // ── 좌표 ────────────────────────────────────────────────
    function worldH() { return PAD_TOP + state.totalRows * ROW_H + POOL_H; }
    function padX() { return Math.max(26, view.w * 0.09); }
    function colGap() { return (view.w - padX() * 2) / Math.max(1, state.cols - 1); }
    function colX(c) { return padX() + c * colGap(); }
    function rowY(r) { return PAD_TOP + r * ROW_H; }

    // ── 판 시작 ─────────────────────────────────────────────
    function startGame(players, bombs) {
        state.players = players;
        state.bombs = Math.min(bombs, players - 1);
        state.cols = players;
        // 운명의 구간은 "도착점 옆 칸까지 이동 + 마지막에 한 칸 틀기"가 가능해야 한다.
        // 최악의 경우 끝에서 끝까지 옮겨야 하므로 열 수만큼은 필요하다.
        state.zoneRows = Math.max(4, players);
        state.upperRows = Math.max(MIN_UPPER_ROWS, TOTAL_ROWS - state.zoneRows);
        state.totalRows = state.upperRows + state.zoneRows;
        state.upperRungs = makeUpperRungs(state.cols, state.upperRows);
        state.zoneRungs = [];
        state.usedCols = [];
        state.takenSlots = [];
        state.slotOwner = {};
        state.paths = [];
        state.losers = [];
        state.current = null;
        state.phase = 'ready';

        var slots = [];
        for (var i = 0; i < state.cols; i++) { slots.push(i); }
        state.bombSlots = shuffle(slots.slice()).slice(0, state.bombs);

        camY = 0;
        confetti = [];
        resize();
        renderColumnButtons();
        renderSlots();
        setStatus('출발할 번호를 고르세요');
    }

    // ── 경로를 폴리라인으로 ─────────────────────────────────
    function buildPath(startCol) {
        var pts = [{ x: colX(startCol), y: rowY(0), row: 0, col: startCol }];
        var col = startCol;
        for (var r = 0; r < state.totalRows; r++) {
            var next = walkRow(col, r);
            var y = rowY(r + 1);
            pts.push({ x: colX(col), y: y, row: r + 1, col: col });
            if (next !== col) { pts.push({ x: colX(next), y: y, row: r + 1, col: next }); }
            col = next;
        }
        pts.push({ x: colX(col), y: rowY(state.totalRows) + POOL_H * 0.45, row: state.totalRows, col: col });

        var segs = [], total = 0;
        for (var i = 1; i < pts.length; i++) {
            var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
            var len = Math.hypot(dx, dy);
            segs.push({ a: pts[i - 1], b: pts[i], len: len, start: total, horizontal: Math.abs(dy) < 0.5 });
            total += len;
        }
        return { pts: pts, segs: segs, total: total, endCol: col };
    }

    function pointAt(path, dist) {
        for (var i = 0; i < path.segs.length; i++) {
            var s = path.segs[i];
            if (dist <= s.start + s.len || i === path.segs.length - 1) {
                var t = s.len === 0 ? 1 : Math.min(1, (dist - s.start) / s.len);
                return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t, seg: i, row: s.b.row };
            }
        }
        var last = path.pts[path.pts.length - 1];
        return { x: last.x, y: last.y, seg: path.segs.length - 1, row: last.row };
    }

    /*
     * 마지막 줄 직전에 머물 자리를 고른다.
     * 도착점 바로 옆 칸 중에서, 성격이 반대인 쪽(꽝 옆의 안전, 안전 옆의 꽝)을 우선한다.
     * 안전한 데로 들어갈 것처럼 굴다가 꽝으로 새는 장면이 여기서 만들어진다.
     */
    function pickFake(to) {
        var cands = [];
        if (to - 1 >= 0) { cands.push(to - 1); }
        if (to + 1 < state.cols) { cands.push(to + 1); }
        if (!cands.length) { return null; }

        var toIsBomb = state.bombSlots.indexOf(to) >= 0;
        var contrast = cands.filter(function (c) {
            return (state.bombSlots.indexOf(c) >= 0) !== toIsBomb;
        });
        var pool = contrast.length ? contrast : cands;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // ── 한 명 내려가기 ──────────────────────────────────────
    function descend(startCol) {
        if (state.phase !== 'ready') { return; }
        if (state.usedCols.indexOf(startCol) >= 0) { return; }

        var col = startCol;
        for (var r = 0; r < state.upperRows; r++) { col = walkRow(col, r); }
        var free = [];
        for (var i = 0; i < state.cols; i++) {
            if (state.takenSlots.indexOf(i) < 0) { free.push(i); }
        }
        var target = free[Math.floor(Math.random() * free.length)];

        // 대체로 막판에 한 번 튼다. 항상 틀면 눈치채므로 가끔은 그냥 들어간다.
        var fake = Math.random() < 0.75 ? pickFake(target) : null;
        state.zoneRungs = makeZoneRungs(col, target, state.zoneRows, state.cols, fake);

        var path = buildPath(startCol);
        state.usedCols.push(startCol);
        state.takenSlots.push(target);
        state.phase = 'descending';
        state.current = {
            col: startCol,
            color: COLORS[startCol % COLORS.length],
            path: path,
            slot: path.endCol,
            hit: state.bombSlots.indexOf(path.endCol) >= 0,
            dist: 0, seg: 0, dwell: 0, revealed: 0, splash: []
        };

        setStatus('내려가는 중…');
        el.skip.hidden = false;
        renderColumnButtons();
        startBgm();
    }

    // ── 메인 루프 (항상 돌면서 물 흐름을 애니메이션한다) ────
    var raf = null, lastTime = 0, skipping = false, running = false;

    function loop(now) {
        var dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;
        flowPhase += dt * 90;

        if (state.phase === 'descending') { update(dt); }
        if (shake > 0) { shake = Math.max(0, shake - dt * 1000); }
        stepConfetti(dt);
        draw();

        raf = requestAnimationFrame(loop);
    }

    function startLoop() {
        if (running) { return; }
        running = true;
        lastTime = performance.now();
        raf = requestAnimationFrame(loop);
    }

    function stopLoop() {
        running = false;
        cancelAnimationFrame(raf);
    }

    function update(dt) {
        var cur = state.current;
        if (!cur) { return; }

        var p = pointAt(cur.path, cur.dist);

        if (cur.dwell > 0) {
            cur.dwell -= dt * 1000;
        } else {
            var ratio = (p.y - PAD_TOP) / (state.totalRows * ROW_H);
            cur.dist += (skipping ? 5200 : speedAt(ratio, state.totalRows - p.row)) * dt;

            var np = pointAt(cur.path, cur.dist);
            if (np.seg !== cur.seg) {
                var seg = cur.path.segs[np.seg];
                if (seg && seg.horizontal && !skipping) {
                    var isLast = np.row >= state.totalRows;
                    cur.dwell = isLast ? DWELL_FINAL : (np.row > state.upperRows ? DWELL_ZONE : DWELL_UPPER);
                    if (isLast) { sfx.heartbeat(); } else { sfx.split(); }
                    addSplash(cur, np.x, np.y);
                }
                cur.seg = np.seg;
            }
            cur.revealed = Math.max(cur.revealed, np.row);
            p = np;
        }

        camY += (clamp(p.y - view.h * 0.45, 0, Math.max(0, worldH() - view.h)) - camY) * Math.min(1, dt * 9);
        stepSplash(cur, dt);

        if (cur.dist >= cur.path.total) { finishDescent(); }
    }

    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

    function addSplash(cur, x, y) {
        for (var i = 0; i < 8; i++) {
            cur.splash.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 110,
                vy: -Math.random() * 80 - 10,
                life: 0.5 + Math.random() * 0.3
            });
        }
    }

    function stepSplash(cur, dt) {
        for (var i = cur.splash.length - 1; i >= 0; i--) {
            var s = cur.splash[i];
            s.life -= dt;
            if (s.life <= 0) { cur.splash.splice(i, 1); continue; }
            s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 280 * dt;
        }
    }

    function finishDescent() {
        var cur = state.current;
        cur.dist = cur.path.total;
        cur.revealed = state.totalRows;
        el.skip.hidden = true;
        state.phase = 'holding';
        setStatus('…');
        el.stage.classList.add('is-holding');

        setTimeout(function () {
            el.stage.classList.remove('is-holding');
            state.paths.push(cur);
            state.slotOwner[cur.slot] = cur.col + 1;   // 여기서야 공개한다
            renderSlots();

            if (cur.hit) {
                state.losers.push(cur.col + 1);
                sfx.boom();
                shake = 380;
                burstConfetti();
                showResult(true, '🎉 ' + (cur.col + 1) + '번 당첨!', '축하합니다. 벌칙 확정입니다.');
            } else {
                sfx.relief();
                showResult(false, (cur.col + 1) + '번 안전', '휴… 살았습니다.');
            }
        }, skipping ? 200 : HOLD_MS);
    }

    function showResult(hit, title, detail) {
        var done = state.losers.length >= state.bombs || state.usedCols.length >= state.cols;
        el.resultTitle.textContent = title;
        el.resultDetail.textContent = detail;
        el.result.classList.toggle('is-bad', hit);
        el.result.hidden = false;

        if (done) {
            state.phase = 'over';
            el.resultNext.hidden = true;
            el.resultRestart.hidden = false;
            el.resultSetup.hidden = false;
            el.resultDetail.textContent = '걸린 사람: ' +
                (state.losers.length ? state.losers.join(', ') + '번' : '없음');
        } else {
            // 결과 카드가 떠 있는 동안 다음 사람을 못 고르게 막는다
            state.phase = 'result';
            el.resultNext.hidden = false;
            el.resultRestart.hidden = true;
            el.resultSetup.hidden = true;
        }
    }

    function nextTurn() {
        el.result.hidden = true;
        state.current = null;
        state.zoneRungs = [];
        state.phase = 'ready';
        renderColumnButtons();
        var left = state.cols - state.usedCols.length;
        var chance = Math.round((state.bombs - state.losers.length) / left * 100);
        setStatus('남은 사람 ' + left + '명 · 걸릴 확률 ' + chance + '%');
    }

    // 설정 화면으로 되돌린다. 다시하기만 있고 인원을 못 바꾸는 게 답답했다.
    function backToSetup() {
        el.result.hidden = true;
        el.play.hidden = true;
        el.setup.hidden = false;
        el.start.hidden = false;
        state.phase = 'setup';
        state.current = null;
        confetti = [];
        if (bgm) { bgm.pause(); }
    }

    // ── 축하 연출 ───────────────────────────────────────────
    function burstConfetti() {
        for (var i = 0; i < 90; i++) {
            confetti.push({
                x: view.w * (0.2 + Math.random() * 0.6),
                y: view.h * 0.3 + Math.random() * 40,
                vx: (Math.random() - 0.5) * 320,
                vy: -Math.random() * 340 - 60,
                w: 4 + Math.random() * 5,
                h: 7 + Math.random() * 7,
                rot: Math.random() * Math.PI,
                vr: (Math.random() - 0.5) * 12,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                life: 1.6 + Math.random() * 0.9
            });
        }
    }

    function stepConfetti(dt) {
        for (var i = confetti.length - 1; i >= 0; i--) {
            var c = confetti[i];
            c.life -= dt;
            if (c.life <= 0) { confetti.splice(i, 1); continue; }
            c.x += c.vx * dt; c.y += c.vy * dt;
            c.vy += 520 * dt; c.vx *= 0.995;
            c.rot += c.vr * dt;
        }
    }

    // ── 그리기 ──────────────────────────────────────────────
    function resize() {
        if (!canvas) { return; }
        var rect = canvas.parentElement.getBoundingClientRect();
        dpr = Math.min(2, window.devicePixelRatio || 1);
        view.w = Math.max(260, rect.width);
        view.h = Math.max(340, Math.min(window.innerHeight * 0.6, 600));
        canvas.width = Math.round(view.w * dpr);
        canvas.height = Math.round(view.h * dpr);
        canvas.style.width = view.w + 'px';
        canvas.style.height = view.h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function theme() {
        var light = document.documentElement.getAttribute('data-theme') === 'light';
        return light
            ? { bg1: '#eef4fb', bg2: '#dbe6f2', chute: '#b9c7d8', chuteIn: '#ffffff', flow: '#7fb6e6', zone: '#8aa0b8', pool: '#cfe0f0' }
            : { bg1: '#101720', bg2: '#0a0e14', chute: '#2b3644', chuteIn: '#3c4a5c', flow: '#5c7d9c', zone: '#5b6675', pool: '#18222e' };
    }

    function draw() {
        if (!ctx) { return; }
        var t = theme();
        var g = ctx.createLinearGradient(0, 0, 0, view.h);
        g.addColorStop(0, t.bg1); g.addColorStop(1, t.bg2);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, view.w, view.h);

        ctx.save();
        var sx = shake > 0 ? (Math.random() - 0.5) * (shake / 40) : 0;
        var sy = shake > 0 ? (Math.random() - 0.5) * (shake / 40) : 0;
        ctx.translate(sx, -camY + sy);

        drawChutes(t);
        drawZoneBand(t);

        for (var i = 0; i < state.paths.length; i++) {
            drawStream(state.paths[i], state.paths[i].path.total, 0.26, false);
        }
        if (state.current) {
            drawStream(state.current, state.current.dist, 1, true);
            drawDrop(state.current);
            drawSplash(state.current);
        }

        drawPools(t);
        ctx.restore();

        drawConfetti();
        drawEdgeFade(t);
    }

    function drawChutes(t) {
        var gap = colGap();
        var wide = Math.max(9, Math.min(16, gap * 0.3));
        ctx.lineCap = 'round';

        var lines = [];
        for (var c = 0; c < state.cols; c++) {
            lines.push([colX(c), rowY(0), colX(c), rowY(state.totalRows)]);
        }
        for (var r = 0; r < state.totalRows; r++) {
            if (r >= state.upperRows) {
                // 운명의 구간만 숨긴다. 위쪽은 처음부터 보여야 예측이 생긴다.
                var cur = state.current;
                if (!cur || cur.revealed < r + 1) { continue; }
            }
            var rs = rungsAt(r);
            for (var i = 0; i < rs.length; i++) {
                lines.push([colX(rs[i]), rowY(r + 1), colX(rs[i] + 1), rowY(r + 1)]);
            }
        }

        for (var k = 0; k < lines.length; k++) { stroke(lines[k], t.chute, wide); }
        for (k = 0; k < lines.length; k++) { stroke(lines[k], t.chuteIn, wide * 0.45); }

        // 흐르는 줄무늬. 미끄럼틀 전체에 물이 졸졸 흐르는 느낌을 준다.
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([9, 17]);
        ctx.lineDashOffset = -flowPhase;
        for (k = 0; k < lines.length; k++) { stroke(lines[k], t.flow, wide * 0.3); }
        ctx.restore();
    }

    function stroke(l, color, w) {
        ctx.strokeStyle = color; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(l[2], l[3]); ctx.stroke();
    }

    function drawZoneBand(t) {
        var y = rowY(state.upperRows);
        ctx.save();
        ctx.setLineDash([6, 7]);
        ctx.strokeStyle = t.zone; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(view.w - 8, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = t.zone;
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('여기서부터는 안 보입니다', 10, y - 5);
        ctx.restore();
    }

    function drawStream(cur, upto, alpha, animated) {
        var path = cur.path;
        var w = Math.max(6, Math.min(12, colGap() * 0.2));

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = cur.color;
        ctx.lineWidth = w;
        traceStream(path, upto);
        ctx.stroke();

        if (animated) {
            // 안쪽에 밝은 줄무늬가 흘러가면 '흐르는 물'로 읽힌다
            ctx.globalAlpha = alpha * 0.85;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = w * 0.34;
            ctx.setLineDash([7, 15]);
            ctx.lineDashOffset = -flowPhase * 2.4;
            traceStream(path, upto);
            ctx.stroke();
        }
        ctx.restore();
    }

    function traceStream(path, upto) {
        ctx.beginPath();
        ctx.moveTo(path.pts[0].x, path.pts[0].y);
        for (var i = 0; i < path.segs.length; i++) {
            var s = path.segs[i];
            if (upto >= s.start + s.len) { ctx.lineTo(s.b.x, s.b.y); }
            else {
                var t = s.len === 0 ? 0 : Math.max(0, (upto - s.start) / s.len);
                ctx.lineTo(s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t);
                break;
            }
        }
    }

    function drawDrop(cur) {
        var p = pointAt(cur.path, cur.dist);
        var r = Math.max(8, Math.min(14, colGap() * 0.24));
        var wob = cur.dwell > 0 ? Math.sin(performance.now() / 34) * 2.4 : 0;

        ctx.save();
        ctx.shadowColor = cur.color; ctx.shadowBlur = 16;
        ctx.fillStyle = cur.color;
        ctx.beginPath();
        ctx.ellipse(p.x + wob, p.y, r, r * 1.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.beginPath();
        ctx.arc(p.x + wob - r * 0.28, p.y - r * 0.3, r * 0.26, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawSplash(cur) {
        ctx.fillStyle = cur.color;
        for (var i = 0; i < cur.splash.length; i++) {
            var s = cur.splash[i];
            ctx.globalAlpha = Math.max(0, s.life);
            ctx.beginPath(); ctx.arc(s.x, s.y, 2.4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // 도착 풀. 이모지는 글꼴에 따라 잘려서 직접 그린다.
    function drawPools(t) {
        var y = rowY(state.totalRows) + 34;
        var r = Math.max(15, Math.min(26, colGap() * 0.38));
        for (var c = 0; c < state.cols; c++) {
            var x = colX(c);
            var bomb = state.bombSlots.indexOf(c) >= 0;
            ctx.globalAlpha = state.slotOwner[c] ? 0.4 : 1;   // 아직 안 간 자리를 흐리면 결과가 새어나간다
            ctx.fillStyle = t.pool;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = bomb ? '#fb7185' : '#34d399';
            ctx.lineWidth = 2.5; ctx.stroke();
            if (bomb) { drawBomb(x, y, r * 0.52); } else { drawSmile(x, y, r * 0.52); }
            ctx.globalAlpha = 1;
        }
    }

    function drawBomb(x, y, r) {
        ctx.fillStyle = '#fb7185';
        ctx.beginPath(); ctx.arc(x, y + r * 0.18, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + r * 0.5, y - r * 0.6);
        ctx.quadraticCurveTo(x + r * 1.3, y - r * 1.3, x + r * 0.6, y - r * 1.7);
        ctx.stroke();
    }

    function drawSmile(x, y, r) {
        ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#34d399';
        ctx.beginPath(); ctx.arc(x - r * 0.38, y - r * 0.25, r * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + r * 0.38, y - r * 0.25, r * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y + r * 0.08, r * 0.52, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
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

    function drawEdgeFade(t) {
        var top = ctx.createLinearGradient(0, 0, 0, 34);
        top.addColorStop(0, t.bg1); top.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = top; ctx.fillRect(0, 0, view.w, 34);
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
        function beep(freq, dur, type, vol) {
            if (muted) { return; }
            var a = ac(); if (!a) { return; }
            var o = a.createOscillator(), gn = a.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, a.currentTime);
            gn.gain.setValueAtTime(vol || 0.06, a.currentTime);
            gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
            o.connect(gn); gn.connect(a.destination);
            o.start(); o.stop(a.currentTime + dur);
        }
        function noise(dur, vol) {
            if (muted) { return; }
            var a = ac(); if (!a) { return; }
            var n = Math.floor(a.sampleRate * dur);
            var buf = a.createBuffer(1, n, a.sampleRate);
            var d = buf.getChannelData(0);
            for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n); }
            var src = a.createBufferSource(), gn = a.createGain();
            src.buffer = buf;
            gn.gain.setValueAtTime(vol || 0.2, a.currentTime);
            src.connect(gn); gn.connect(a.destination);
            src.start();
        }
        return {
            split: function () { noise(0.1, 0.08); },
            heartbeat: function () {
                beep(70, 0.18, 'sine', 0.16);
                setTimeout(function () { beep(62, 0.22, 'sine', 0.13); }, 260);
            },
            boom: function () { noise(0.5, 0.3); beep(90, 0.5, 'sawtooth', 0.18); },
            relief: function () { beep(520, 0.16, 'sine', 0.07); setTimeout(function () { beep(780, 0.22, 'sine', 0.06); }, 110); },
            setMuted: function (m) { muted = m; },
            isMuted: function () { return muted; }
        };
    })();

    // BGM은 핀볼룰렛과 같은 곡을 참조만 한다. 파일을 복사하면 750KB가 중복된다.
    function startBgm() {
        if (!bgm || sfx.isMuted() || !bgm.paused) { return; }
        var p = bgm.play();
        if (p && p.catch) { p.catch(function () { /* 자동재생 차단은 무시 */ }); }
    }

    // ── UI ──────────────────────────────────────────────────
    function setStatus(text) { el.status.textContent = text; }

    function renderColumnButtons() {
        var html = '';
        for (var c = 0; c < state.cols; c++) {
            var used = state.usedCols.indexOf(c) >= 0;
            html += '<button type="button" class="bw-ladder-col' + (used ? ' is-used' : '') +
                '" data-col="' + c + '"' + (used ? ' disabled' : '') +
                ' style="--col-color:' + COLORS[c % COLORS.length] + '">' + (c + 1) + '</button>';
        }
        el.cols.innerHTML = html;
    }

    // 도착 현황. 카메라가 내려가면 도착 풀이 화면 밖으로 나가므로 여기 항상 띄운다.
    function renderSlots() {
        var html = '';
        for (var c = 0; c < state.cols; c++) {
            var bomb = state.bombSlots.indexOf(c) >= 0;
            var owner = state.slotOwner[c];
            var cls = 'bw-ladder-slot' + (bomb ? ' is-bomb' : '') + (owner ? ' is-taken' : '');
            var color = owner ? COLORS[(owner - 1) % COLORS.length] : 'transparent';
            html += '<div class="' + cls + '" style="--col-color:' + color + '">' +
                '<span class="bw-ladder-slot-tag">' + (bomb ? '꽝' : '안전') + '</span>' +
                '<span class="bw-ladder-slot-who">' + (owner ? owner + '번' : '—') + '</span>' +
                '</div>';
        }
        el.slots.innerHTML = html;
    }

    function bind() {
        el.cols.addEventListener('click', function (e) {
            var btn = e.target.closest('.bw-ladder-col');
            if (!btn || btn.disabled) { return; }
            descend(parseInt(btn.getAttribute('data-col'), 10));
        });

        el.setup.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-players],[data-bombs]');
            if (!btn) { return; }
            btn.parentElement.querySelectorAll('button').forEach(function (b) { b.classList.remove('is-active'); });
            btn.classList.add('is-active');
        });

        el.start.addEventListener('click', function () {
            var p = parseInt(el.setup.querySelector('[data-players].is-active').getAttribute('data-players'), 10);
            var b = parseInt(el.setup.querySelector('[data-bombs].is-active').getAttribute('data-bombs'), 10);
            el.setup.hidden = true;
            el.start.hidden = true;
            el.play.hidden = false;
            startGame(p, b);
            startLoop();
        });

        el.skip.addEventListener('click', function () { skipping = true; });
        el.resultNext.addEventListener('click', function () { skipping = false; nextTurn(); });
        el.resultRestart.addEventListener('click', function () {
            skipping = false;
            el.result.hidden = true;
            startGame(state.players, state.bombs);
        });
        el.resultSetup.addEventListener('click', backToSetup);

        el.mute.addEventListener('click', function () {
            var m = !sfx.isMuted();
            sfx.setMuted(m);
            if (bgm) { if (m) { bgm.pause(); } else { startBgm(); } }
            el.mute.textContent = m ? '소리 꺼짐' : '소리 켜짐';
            el.mute.setAttribute('aria-pressed', String(!m));
        });

        window.addEventListener('resize', function () { resize(); });
        document.addEventListener('bw:theme-change', function () { draw(); });

        // 배경 탭에서 애니메이션을 돌릴 이유가 없다
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { stopLoop(); }
            else if (state.phase !== 'setup') { startLoop(); }
        });
    }

    // 사다리 생성 로직만 떼어 검증할 수 있게 열어둔다. 브라우저에서는 module 이 없어 무시된다.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            makeUpperRungs: makeUpperRungs,
            makeZoneRungs: makeZoneRungs,
            touchesAny: touchesAny
        };
        return;
    }

    document.addEventListener('DOMContentLoaded', function () {
        canvas = document.getElementById('ladder-canvas');
        if (!canvas) { return; }
        ctx = canvas.getContext('2d');

        el.setup = document.getElementById('ladder-setup');
        el.start = document.getElementById('ladder-start');
        el.play = document.getElementById('ladder-play');
        el.cols = document.getElementById('ladder-cols');
        el.slots = document.getElementById('ladder-slots');
        el.status = document.getElementById('ladder-status');
        el.stage = document.getElementById('ladder-stage');
        el.skip = document.getElementById('ladder-skip');
        el.mute = document.getElementById('ladder-mute');
        el.result = document.getElementById('ladder-result');
        el.resultTitle = document.getElementById('ladder-result-title');
        el.resultDetail = document.getElementById('ladder-result-detail');
        el.resultNext = document.getElementById('ladder-next');
        el.resultRestart = document.getElementById('ladder-restart');
        el.resultSetup = document.getElementById('ladder-setup-again');

        bgm = document.getElementById('ladder-bgm');
        if (bgm) { bgm.volume = 0.35; }

        bind();
        resize();
    });
})();
