/*
 * 블라인드 사다리타기 — 워터슬라이드
 *
 * 설계 메모 (docs/plans/ladder.md)
 *  - 물이 미끄럼틀을 타고 내려가는 모양이다. 점이 선을 따라가는 것보다 훨씬 잘 읽힌다.
 *  - 갈림길에서 물이 잠깐 망설였다가 한쪽으로 쏠린다. 뜸 들이기가 공짜로 생긴다.
 *  - 카메라가 물을 따라 내려간다. 아래가 안 보여서 긴장이 살고, 화면도 크게 쓸 수 있다.
 *  - 꽝(폭탄) 위치는 처음부터 공개한다. 어디로 가면 안 되는지 알아야 감정이 생긴다.
 *  - 점선 아래 "운명의 구간"만 숨긴다. 위쪽까지 다 숨겼더니 볼 게 없어서 무감각했다.
 *
 * 운명의 구간은 참가자가 들어올 때 정해진다. 다만 두 사람이 같은 도착점에 가면
 * 복불복이 성립하지 않으므로 "남은 도착점 중에서만" 뽑는다. 진짜 랜덤이면서 1:1이 유지된다.
 *
 * 움직임은 경로 전체를 하나의 폴리라인으로 만들어 길이를 따라 보간한다.
 * 예전에는 줄마다 타이머를 새로 시작해서 줄 경계마다 속도가 끊겼다(버벅임).
 *
 * Phaser를 쓰지 않는다. 물리가 없고 선과 원만 그리면 된다.
 */
(function () {
    'use strict';

    // ── 설정값 ──────────────────────────────────────────────
    var UPPER_ROWS = 12;
    var RUNG_DENSITY = 0.30;
    var ROW_H = 62;               // 한 줄의 세로 길이(월드 좌표). 카메라가 따라가므로 넉넉히 준다
    var PAD_TOP = 40;
    var POOL_H = 92;              // 맨 아래 도착 풀 영역
    var JUNCTION_DWELL = 240;     // 갈림길에서 망설이는 시간(ms)
    var HOLD_MS = 1100;           // 도착 직전 정지

    var COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#c084fc'];

    // 아래로 갈수록 느려진다. 월드 y 비율(0~1)을 받아 px/초를 돌려준다.
    function speedAt(ratio, inZone) {
        if (inZone) { return 165; }
        if (ratio < 0.35) { return 900; }
        if (ratio < 0.70) { return 520; }
        return 340;
    }

    // ── 상태 ────────────────────────────────────────────────
    var state = {
        players: 4, bombs: 1, cols: 4,
        zoneRows: 3, totalRows: 15,
        upperRungs: [], zoneRungs: [],
        bombSlots: [], usedCols: [], takenSlots: [],
        paths: [], current: null,
        phase: 'setup', losers: []
    };

    var canvas, ctx, dpr = 1, view = { w: 320, h: 420 };
    var camY = 0, camTarget = 0;
    var el = {}, bgm = null;

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

    // from 에서 to 로 가는 경로를 zoneRows 줄에 흩뿌린다.
    function makeZoneRungs(from, to, zoneRows, cols) {
        var need = to - from;
        var moves = new Array(zoneRows).fill(0);
        var dir = need > 0 ? 1 : -1;
        var slots = [];
        for (var i = 0; i < zoneRows; i++) { slots.push(i); }
        shuffle(slots);
        for (var k = 0; k < Math.abs(need); k++) { moves[slots[k]] = dir; }

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
        return row < UPPER_ROWS ? state.upperRungs[row] : (state.zoneRungs[row - UPPER_ROWS] || []);
    }

    function walkRow(col, row) {
        var rs = rungsAt(row);
        if (rs.indexOf(col) >= 0) { return col + 1; }
        if (rs.indexOf(col - 1) >= 0) { return col - 1; }
        return col;
    }

    // ── 좌표 ────────────────────────────────────────────────
    function worldH() { return PAD_TOP + state.totalRows * ROW_H + POOL_H; }
    function colX(c) {
        var padX = Math.max(26, view.w * 0.09);
        var gap = (view.w - padX * 2) / Math.max(1, state.cols - 1);
        return padX + c * gap;
    }
    function colGap() {
        var padX = Math.max(26, view.w * 0.09);
        return (view.w - padX * 2) / Math.max(1, state.cols - 1);
    }
    function rowY(r) { return PAD_TOP + r * ROW_H; }

    // ── 판 시작 ─────────────────────────────────────────────
    function startGame(players, bombs) {
        state.players = players;
        state.bombs = Math.min(bombs, players - 1);
        state.cols = players;
        state.zoneRows = Math.max(3, players - 1);
        state.totalRows = UPPER_ROWS + state.zoneRows;
        state.upperRungs = makeUpperRungs(state.cols, UPPER_ROWS);
        state.zoneRungs = [];
        state.usedCols = [];
        state.takenSlots = [];
        state.paths = [];
        state.losers = [];
        state.current = null;
        state.phase = 'ready';

        var slots = [];
        for (var i = 0; i < state.cols; i++) { slots.push(i); }
        state.bombSlots = shuffle(slots.slice()).slice(0, state.bombs);

        camY = 0; camTarget = 0;
        resize();
        renderColumnButtons();
        setStatus('출발할 번호를 고르세요');
        draw();
    }

    // ── 경로를 폴리라인으로 만든다 ──────────────────────────
    function buildPath(startCol) {
        var pts = [{ x: colX(startCol), y: rowY(0), row: 0, col: startCol }];
        var col = startCol;
        for (var r = 0; r < state.totalRows; r++) {
            var next = walkRow(col, r);
            var y = rowY(r + 1);
            pts.push({ x: colX(col), y: y, row: r + 1, col: col });          // 내려온다
            if (next !== col) {
                pts.push({ x: colX(next), y: y, row: r + 1, col: next });    // 갈림길에서 옮긴다
            }
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
                return {
                    x: s.a.x + (s.b.x - s.a.x) * t,
                    y: s.a.y + (s.b.y - s.a.y) * t,
                    seg: i, row: s.b.row
                };
            }
        }
        var last = path.pts[path.pts.length - 1];
        return { x: last.x, y: last.y, seg: path.segs.length - 1, row: last.row };
    }

    // ── 한 명 내려가기 ──────────────────────────────────────
    function descend(startCol) {
        if (state.phase !== 'ready') { return; }
        if (state.usedCols.indexOf(startCol) >= 0) { return; }

        // 운명의 구간을 이번 차례용으로 다시 섞는다. 남은 도착점 중에서만 뽑는다.
        var col = startCol;
        for (var r = 0; r < UPPER_ROWS; r++) { col = walkRow(col, r); }
        var free = [];
        for (var i = 0; i < state.cols; i++) {
            if (state.takenSlots.indexOf(i) < 0) { free.push(i); }
        }
        var target = free[Math.floor(Math.random() * free.length)];
        state.zoneRungs = makeZoneRungs(col, target, state.zoneRows, state.cols);

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
        animate();
    }

    // ── 애니메이션 ──────────────────────────────────────────
    var raf = null, lastTime = 0, skipping = false;

    function animate() {
        skipping = false;
        lastTime = performance.now();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
    }

    function tick(now) {
        var cur = state.current;
        if (!cur) { return; }
        var dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        var p = pointAt(cur.path, cur.dist);
        var ratio = (p.y - PAD_TOP) / (state.totalRows * ROW_H);
        var inZone = p.row > UPPER_ROWS;

        if (cur.dwell > 0) {
            cur.dwell -= dt * 1000;
        } else {
            var sp = skipping ? 4200 : speedAt(ratio, inZone);
            cur.dist += sp * dt;

            var np = pointAt(cur.path, cur.dist);
            // 갈림길(가로 구간)에 막 들어섰으면 잠깐 망설인다
            if (np.seg !== cur.seg) {
                var seg = cur.path.segs[np.seg];
                if (seg && seg.horizontal && !skipping) {
                    cur.dwell = JUNCTION_DWELL;
                    sfx.split();
                    addSplash(cur, np.x, np.y);
                }
                cur.seg = np.seg;
            }
            cur.revealed = Math.max(cur.revealed, np.row);
            p = np;
        }

        // 카메라. 물을 화면 45% 지점에 두고 따라간다
        camTarget = clamp(p.y - view.h * 0.45, 0, Math.max(0, worldH() - view.h));
        camY += (camTarget - camY) * Math.min(1, dt * 9);

        stepSplash(cur, dt);
        draw();

        if (cur.dist >= cur.path.total) { finishDescent(); return; }
        raf = requestAnimationFrame(tick);
    }

    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

    function addSplash(cur, x, y) {
        for (var i = 0; i < 7; i++) {
            cur.splash.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 90,
                vy: -Math.random() * 70 - 10,
                life: 0.5 + Math.random() * 0.3
            });
        }
    }

    function stepSplash(cur, dt) {
        for (var i = cur.splash.length - 1; i >= 0; i--) {
            var s = cur.splash[i];
            s.life -= dt;
            if (s.life <= 0) { cur.splash.splice(i, 1); continue; }
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vy += 260 * dt;
        }
    }

    function finishDescent() {
        var cur = state.current;
        cur.dist = cur.path.total;
        cur.revealed = state.totalRows;
        el.skip.hidden = true;
        state.phase = 'result';
        setStatus('…');
        el.stage.classList.add('is-holding');
        draw();

        var hold = skipping ? 200 : HOLD_MS;
        if (!skipping) { sfx.heartbeat(); }

        setTimeout(function () {
            el.stage.classList.remove('is-holding');
            state.paths.push(cur);
            if (cur.hit) {
                state.losers.push(cur.col + 1);
                sfx.boom();
                addSplash(cur, colX(cur.slot), rowY(state.totalRows) + 30);
                showResult(true, (cur.col + 1) + '번 당첨!', '벌칙 확정입니다.');
            } else {
                sfx.relief();
                showResult(false, (cur.col + 1) + '번 안전', '휴… 살았습니다.');
            }
            draw();
        }, hold);
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
            el.resultDetail.textContent = '걸린 사람: ' +
                (state.losers.length ? state.losers.join(', ') + '번' : '없음');
        } else {
            // 결과 카드가 떠 있는 동안 다음 사람을 못 고르게 막는다
            state.phase = 'result';
            el.resultNext.hidden = false;
            el.resultRestart.hidden = true;
        }
    }

    function nextTurn() {
        el.result.hidden = true;
        state.current = null;
        state.zoneRungs = [];
        state.phase = 'ready';
        camTarget = 0;
        smoothCamHome();
        renderColumnButtons();
        var left = state.cols - state.usedCols.length;
        var chance = Math.round((state.bombs - state.losers.length) / left * 100);
        setStatus('남은 사람 ' + left + '명 · 걸릴 확률 ' + chance + '%');
    }

    function smoothCamHome() {
        cancelAnimationFrame(raf);
        var t0 = performance.now();
        (function step(now) {
            var dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
            camY += (0 - camY) * Math.min(1, dt * 8);
            draw();
            if (Math.abs(camY) > 0.6) { raf = requestAnimationFrame(step); }
            else { camY = 0; draw(); }
        })(t0);
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
            ? { bg1: '#eef4fb', bg2: '#dbe6f2', chute: '#b9c7d8', chuteIn: '#ffffff', zone: '#8aa0b8', text: '#1b2028', pool: '#cfe0f0' }
            : { bg1: '#101720', bg2: '#0a0e14', chute: '#2b3644', chuteIn: '#3c4a5c', zone: '#5b6675', text: '#e8ecf1', pool: '#18222e' };
    }

    function draw() {
        if (!ctx) { return; }
        var t = theme();
        var g = ctx.createLinearGradient(0, 0, 0, view.h);
        g.addColorStop(0, t.bg1); g.addColorStop(1, t.bg2);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, view.w, view.h);

        ctx.save();
        ctx.translate(0, -camY);

        drawChutes(t);
        drawZoneBand(t);

        for (var i = 0; i < state.paths.length; i++) {
            drawStream(state.paths[i], state.paths[i].path.total, 0.28);
        }
        if (state.current) {
            drawStream(state.current, state.current.dist, 1);
            drawDrop(state.current);
            drawSplash(state.current);
        }

        drawPools(t);
        ctx.restore();
        drawEdgeFade(t);
    }

    // 세로 미끄럼틀 + 드러난 갈림길
    function drawChutes(t) {
        var gap = colGap();
        var wide = Math.max(9, Math.min(16, gap * 0.3));

        ctx.lineCap = 'round';
        for (var c = 0; c < state.cols; c++) {
            line(colX(c), rowY(0), colX(c), rowY(state.totalRows), t.chute, wide);
            line(colX(c), rowY(0), colX(c), rowY(state.totalRows), t.chuteIn, wide * 0.45);
        }

        for (var r = 0; r < state.totalRows; r++) {
            // 운명의 구간만 숨긴다. 위쪽은 처음부터 보여야 예측이 생긴다.
            if (r >= UPPER_ROWS) {
                var cur = state.current;
                if (!cur || cur.revealed < r + 1) { continue; }
            }
            var rs = rungsAt(r);
            for (var i = 0; i < rs.length; i++) {
                var y = rowY(r + 1);
                line(colX(rs[i]), y, colX(rs[i] + 1), y, t.chute, wide);
                line(colX(rs[i]), y, colX(rs[i] + 1), y, t.chuteIn, wide * 0.45);
            }
        }
    }

    function line(x1, y1, x2, y2, color, w) {
        ctx.strokeStyle = color; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    function drawZoneBand(t) {
        var y = rowY(UPPER_ROWS);
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

    // 지나온 물줄기
    function drawStream(cur, upto, alpha) {
        var path = cur.path;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = cur.color;
        ctx.lineWidth = Math.max(5, Math.min(10, colGap() * 0.18));
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
        ctx.stroke();
        ctx.restore();
    }

    function drawDrop(cur) {
        var p = pointAt(cur.path, cur.dist);
        var r = Math.max(8, Math.min(14, colGap() * 0.24));
        var wob = cur.dwell > 0 ? Math.sin(performance.now() / 40) * 2 : 0;

        ctx.save();
        ctx.shadowColor = cur.color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = cur.color;
        ctx.beginPath();
        ctx.ellipse(p.x + wob, p.y, r, r * 1.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.arc(p.x + wob - r * 0.28, p.y - r * 0.3, r * 0.26, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawSplash(cur) {
        ctx.fillStyle = cur.color;
        for (var i = 0; i < cur.splash.length; i++) {
            var s = cur.splash[i];
            ctx.globalAlpha = Math.max(0, s.life);
            ctx.beginPath();
            ctx.arc(s.x, s.y, 2.4, 0, Math.PI * 2);
            ctx.fill();
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
            var taken = state.takenSlots.indexOf(c) >= 0;

            ctx.globalAlpha = taken ? 0.35 : 1;
            ctx.fillStyle = t.pool;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = bomb ? '#fb7185' : '#34d399';
            ctx.lineWidth = 2.5;
            ctx.stroke();

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

    // 위아래 가장자리를 살짝 흐리면 카메라가 움직이는 느낌이 산다
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
            split: function () { noise(0.13, 0.09); },
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
        if (!bgm || sfx.isMuted()) { return; }
        if (!bgm.paused) { return; }
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
        });

        el.skip.addEventListener('click', function () { skipping = true; });
        el.resultNext.addEventListener('click', nextTurn);
        el.resultRestart.addEventListener('click', function () {
            el.result.hidden = true;
            startGame(state.players, state.bombs);
        });

        el.mute.addEventListener('click', function () {
            var m = !sfx.isMuted();
            sfx.setMuted(m);
            if (bgm) { if (m) { bgm.pause(); } else { startBgm(); } }
            el.mute.textContent = m ? '소리 꺼짐' : '소리 켜짐';
            el.mute.setAttribute('aria-pressed', String(!m));
        });

        window.addEventListener('resize', function () { resize(); draw(); });
        document.addEventListener('bw:theme-change', function () { draw(); });
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
        el.status = document.getElementById('ladder-status');
        el.stage = document.getElementById('ladder-stage');
        el.skip = document.getElementById('ladder-skip');
        el.mute = document.getElementById('ladder-mute');
        el.result = document.getElementById('ladder-result');
        el.resultTitle = document.getElementById('ladder-result-title');
        el.resultDetail = document.getElementById('ladder-result-detail');
        el.resultNext = document.getElementById('ladder-next');
        el.resultRestart = document.getElementById('ladder-restart');

        bgm = document.getElementById('ladder-bgm');
        if (bgm) { bgm.volume = 0.35; }

        bind();
        resize();
    });
})();
