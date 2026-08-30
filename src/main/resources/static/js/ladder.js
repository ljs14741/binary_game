/*
 * 사다리타기 — 가로줄이 숨겨진 블라인드 사다리
 *
 * 설계 메모 (docs/plans/ladder.md)
 *  1. 꽝(폭탄) 위치는 처음부터 공개한다. 안 그러면 이동에 감정이 안 붙는다.
 *  2. 가로줄은 말이 그 높이에 닿을 때만 그린다. 눈으로 미리 읽지 못하게.
 *  3. 아래로 갈수록 느려지고, 도착 직전에 완전히 멈춘다.
 *  4. 맨 아래 "운명의 구간"은 미리 정해져 있지 않다. 말이 들어올 때 뽑는다.
 *
 * 4번 때문에 1:1 대응이 깨질 뻔했다. 두 참가자가 같은 도착점에 갈 수 있기 때문이다.
 * 그래서 "남은 도착점 중에서만" 뽑는다. 진짜 랜덤이면서 1:1은 유지된다.
 * 대신 참가자마다 운명의 구간 가로줄이 달라지므로, 그 구간은 매 차례 다시 섞이는 것으로
 * 규칙을 정하고 화면에도 그렇게 안내한다.
 *
 * Phaser를 쓰지 않는다. 선과 원만 그리면 되고 물리가 없다. Canvas 2D 한 장이면 충분하다.
 */
(function () {
    'use strict';

    // ── 설정값 ──────────────────────────────────────────────
    var UPPER_ROWS = 10;          // 운명의 구간 위쪽 줄 수
    var RUNG_DENSITY = 0.30;      // 위쪽 가로줄 밀도
    var COLORS = ['#f97316', '#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#c084fc'];

    // 구간별 한 칸 이동 시간(ms). 아래로 갈수록 느려진다.
    function stepDuration(row, totalRows, zoneStart) {
        if (row >= zoneStart) { return 520; }
        var t = row / Math.max(1, zoneStart);
        if (t < 0.34) { return 130; }
        if (t < 0.7) { return 250; }
        return 380;
    }

    // ── 상태 ────────────────────────────────────────────────
    var state = {
        players: 4,
        bombs: 1,
        cols: 4,
        zoneRows: 3,
        totalRows: 13,
        upperRungs: [],     // upperRungs[row] = [왼쪽 열 번호, ...]
        zoneRungs: [],      // 이번 차례에만 쓰는 운명의 구간 가로줄
        bombSlots: [],      // 폭탄이 있는 도착점
        usedCols: [],       // 이미 내려간 출발 열
        takenSlots: [],     // 이미 찜한 도착점
        paths: [],          // {col, color, points:[{row,col}], slot, hit}
        current: null,
        phase: 'setup',     // setup | ready | descending | result | over
        losers: []
    };

    var canvas, ctx, dpr = 1;
    var el = {};

    // ── 사다리 생성 ─────────────────────────────────────────

    // 같은 줄에 가로줄을 붙여 놓으면 경로가 꼬여 보인다. 인접 배치를 금지한다.
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

    /*
     * 운명의 구간 가로줄을 만든다.
     * from 열에서 시작해 to 도착점으로 가는 경로를 zoneRows 줄 안에 흩뿌린다.
     * 한 줄에 한 칸씩만 움직이므로 zoneRows >= |to - from| 이면 항상 만들 수 있다.
     */
    function makeZoneRungs(from, to, zoneRows, cols) {
        var need = to - from;
        var moves = new Array(zoneRows).fill(0);
        var dir = need > 0 ? 1 : -1;
        var slots = [];
        for (var i = 0; i < zoneRows; i++) { slots.push(i); }
        shuffle(slots);
        for (var k = 0; k < Math.abs(need); k++) { moves[slots[k]] = dir; }

        var rungs = [];
        var col = from;
        for (var r = 0; r < zoneRows; r++) {
            var row = [];
            var prev = col;               // 이 줄에 들어올 때의 열. 판정 기준은 이쪽이다
            if (moves[r] === 1) { row.push(prev); col = prev + 1; }
            else if (moves[r] === -1) { row.push(prev - 1); col = prev - 1; }

            // 장식용 가로줄. 허전함을 더는 용도라 경로를 건드리면 안 된다.
            // prev 또는 prev-1 자리에 놓으면 말이 엉뚱한 쪽으로 새므로 제외한다.
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

    // 같은 줄에서 가로줄끼리 맞닿으면 경로가 꼬여 보인다.
    function touchesAny(row, c) {
        for (var i = 0; i < row.length; i++) {
            if (Math.abs(row[i] - c) < 2) { return true; }
        }
        return false;
    }

    function shuffle(a) {
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    // 위쪽 구간만 따라 내려간 결과 열
    function walkUpper(startCol) {
        var col = startCol;
        var pts = [{ row: 0, col: col }];
        for (var r = 0; r < UPPER_ROWS; r++) {
            var row = state.upperRungs[r];
            if (row.indexOf(col) >= 0) { col += 1; }
            else if (row.indexOf(col - 1) >= 0) { col -= 1; }
            pts.push({ row: r + 1, col: col });
        }
        return { col: col, points: pts };
    }

    function walkZone(startCol, pts) {
        var col = startCol;
        for (var r = 0; r < state.zoneRows; r++) {
            var row = state.zoneRungs[r];
            if (row.indexOf(col) >= 0) { col += 1; }
            else if (row.indexOf(col - 1) >= 0) { col -= 1; }
            pts.push({ row: UPPER_ROWS + r + 1, col: col });
        }
        return col;
    }

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

        resize();
        renderColumnButtons();
        setStatus('출발할 번호를 고르세요');
        draw();
    }

    // ── 한 명 내려가기 ──────────────────────────────────────
    function descend(startCol) {
        if (state.phase !== 'ready') { return; }
        if (state.usedCols.indexOf(startCol) >= 0) { return; }

        state.phase = 'descending';
        state.usedCols.push(startCol);
        setStatus('내려가는 중…');
        el.skip.hidden = false;
        renderColumnButtons();

        var upper = walkUpper(startCol);

        // 남은 도착점 중에서 뽑는다. 여기가 진짜로 결과가 정해지는 순간이다.
        var free = [];
        for (var i = 0; i < state.cols; i++) {
            if (state.takenSlots.indexOf(i) < 0) { free.push(i); }
        }
        var target = free[Math.floor(Math.random() * free.length)];
        state.zoneRungs = makeZoneRungs(upper.col, target, state.zoneRows, state.cols);

        var points = upper.points.slice();
        walkZone(upper.col, points);

        state.current = {
            col: startCol,
            color: COLORS[startCol % COLORS.length],
            points: points,
            slot: target,
            hit: state.bombSlots.indexOf(target) >= 0,
            step: 0,
            revealed: 0
        };
        state.takenSlots.push(target);
        animate();
    }

    // ── 애니메이션 ──────────────────────────────────────────
    var raf = null, stepStart = 0, skipping = false;

    function animate() {
        skipping = false;
        stepStart = performance.now();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
    }

    function tick(now) {
        var cur = state.current;
        if (!cur) { return; }

        var row = cur.step;
        var dur = skipping ? 24 : stepDuration(row, state.totalRows, UPPER_ROWS);
        var p = Math.min(1, (now - stepStart) / dur);
        cur.progress = p;
        // 가로줄은 말이 그 높이에 닿는 순간 드러난다. 옆으로 새기 직전이다.
        cur.revealed = row + (p > 0.7 ? 1 : 0);

        draw();

        if (p >= 1) {
            cur.step += 1;
            stepStart = now;

            if (cur.step === UPPER_ROWS && !skipping) {
                sfx.heartbeat();
            } else if (!skipping) {
                var moved = cur.points[cur.step] && cur.points[cur.step - 1] &&
                    cur.points[cur.step].col !== cur.points[cur.step - 1].col;
                if (moved) { sfx.turn(); } else { sfx.tick(); }
            }

            if (cur.step >= state.totalRows) {
                finishDescent();
                return;
            }
        }
        raf = requestAnimationFrame(tick);
    }

    // 도착 직전 뜸 들이기 → 결과
    function finishDescent() {
        var cur = state.current;
        cur.progress = 1;
        cur.revealed = state.totalRows;
        draw();

        el.skip.hidden = true;
        state.phase = 'result';
        setStatus('…');
        el.stage.classList.add('is-holding');

        var hold = skipping ? 200 : 1200;
        setTimeout(function () {
            el.stage.classList.remove('is-holding');
            state.paths.push(cur);

            if (cur.hit) {
                state.losers.push(cur.col + 1);
                sfx.boom();
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
            var names = state.losers.length ? state.losers.join(', ') + '번' : '없음';
            el.resultDetail.textContent = '걸린 사람: ' + names;
        } else {
            // 결과 카드가 떠 있는 동안에는 다음 사람을 못 고르게 막는다.
            // 출발 번호 버튼이 캔버스 밖에 있어서 오버레이로는 안 가려진다.
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
        renderColumnButtons();
        var left = state.cols - state.usedCols.length;
        var chance = Math.round((state.bombs - state.losers.length) / left * 100);
        setStatus('남은 사람 ' + left + '명 · 걸릴 확률 ' + chance + '%');
        draw();
    }

    // ── 그리기 ──────────────────────────────────────────────
    function resize() {
        if (!canvas) { return; }
        var rect = canvas.parentElement.getBoundingClientRect();
        dpr = Math.min(2, window.devicePixelRatio || 1);
        var w = Math.max(260, rect.width);
        var h = Math.max(280, Math.min(window.innerHeight * 0.55, 520));
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function geom() {
        var w = canvas.width / dpr, h = canvas.height / dpr;
        var padX = Math.max(22, w * 0.08);
        var padTop = 14, padBottom = 14;
        var colGap = (w - padX * 2) / Math.max(1, state.cols - 1);
        var rowGap = (h - padTop - padBottom) / state.totalRows;
        return {
            w: w, h: h, padX: padX, padTop: padTop, colGap: colGap, rowGap: rowGap,
            x: function (c) { return padX + c * colGap; },
            y: function (r) { return padTop + r * rowGap; }
        };
    }

    function themeColors() {
        var light = document.documentElement.getAttribute('data-theme') === 'light';
        return light
            ? { line: '#c3ccd8', zone: '#9aa6b6', text: '#1b2028' }
            : { line: '#39424f', zone: '#5b6675', text: '#e8ecf1' };
    }

    function draw() {
        if (!ctx) { return; }
        var g = geom(), t = themeColors();
        ctx.clearRect(0, 0, g.w, g.h);

        // 세로줄
        ctx.lineWidth = 2;
        ctx.strokeStyle = t.line;
        for (var c = 0; c < state.cols; c++) {
            ctx.beginPath();
            ctx.moveTo(g.x(c), g.y(0));
            ctx.lineTo(g.x(c), g.y(state.totalRows));
            ctx.stroke();
        }

        // 운명의 구간 표시 (점선)
        ctx.save();
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = t.zone;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(g.padX - 12, g.y(UPPER_ROWS));
        ctx.lineTo(g.w - g.padX + 12, g.y(UPPER_ROWS));
        ctx.stroke();
        ctx.restore();

        // 지나간 참가자들의 경로
        for (var i = 0; i < state.paths.length; i++) {
            drawPath(g, state.paths[i], state.paths[i].points.length, 1, 0.45);
        }

        // 현재 말
        var cur = state.current;
        if (cur) {
            drawRevealedRungs(g, t, cur.revealed);
            drawPath(g, cur, cur.step + 1, cur.progress || 0, 1);
        }

        drawSlots(g, t);
    }

    function drawRevealedRungs(g, t, upto) {
        ctx.strokeStyle = t.line;
        ctx.lineWidth = 2;
        for (var r = 0; r < upto && r < state.totalRows; r++) {
            var row = r < UPPER_ROWS ? state.upperRungs[r] : state.zoneRungs[r - UPPER_ROWS];
            if (!row) { continue; }
            for (var i = 0; i < row.length; i++) {
                var y = g.y(r + 1);
                ctx.beginPath();
                ctx.moveTo(g.x(row[i]), y);
                ctx.lineTo(g.x(row[i] + 1), y);
                ctx.stroke();
            }
        }
    }

    function drawPath(g, path, upto, progress, alpha) {
        var pts = path.points;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = path.color;
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(g.x(pts[0].col), g.y(0));

        // r번째 줄의 가로줄은 y(r+1) 높이에 있다. 거기까지 내려간 뒤 옆으로 옮긴다.
        var last = Math.min(upto, pts.length) - 1;
        for (var i = 1; i <= last; i++) {
            ctx.lineTo(g.x(pts[i - 1].col), g.y(i));
            ctx.lineTo(g.x(pts[i].col), g.y(i));
        }

        var hx = g.x(pts[last].col), hy = g.y(last);
        if (last + 1 < pts.length && progress < 1) {
            // 앞 75%는 내려가고, 나머지 25%에 옆으로 옮긴다
            var fromX = g.x(pts[last].col);
            var toX = g.x(pts[last + 1].col);
            var y0 = g.y(last), y1 = g.y(last + 1);
            hy = y0 + (y1 - y0) * Math.min(1, progress / 0.75);
            hx = fromX;
            ctx.lineTo(hx, hy);
            if (progress > 0.75 && toX !== fromX) {
                hx = fromX + (toX - fromX) * ((progress - 0.75) / 0.25);
                ctx.lineTo(hx, y1);
            }
        }
        ctx.stroke();
        ctx.restore();

        if (alpha === 1) {
            ctx.fillStyle = path.color;
            ctx.beginPath();
            ctx.arc(hx, hy, 7, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawSlots(g, t) {
        var y = g.y(state.totalRows) + 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = '16px system-ui, sans-serif';
        for (var c = 0; c < state.cols; c++) {
            var bomb = state.bombSlots.indexOf(c) >= 0;
            var taken = state.takenSlots.indexOf(c) >= 0;
            ctx.globalAlpha = taken ? 0.4 : 1;
            ctx.fillText(bomb ? '💣' : '😊', g.x(c), y);
            ctx.globalAlpha = 1;
        }
    }

    // ── 사운드 (Web Audio 합성. 오디오 파일을 쓰지 않아 용량이 0이다) ──
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
            tick: function () { beep(680, 0.05, 'square', 0.03); },
            turn: function () { beep(420, 0.09, 'triangle', 0.06); },
            heartbeat: function () {
                beep(70, 0.18, 'sine', 0.16);
                setTimeout(function () { beep(62, 0.22, 'sine', 0.13); }, 260);
            },
            boom: function () { noise(0.5, 0.3); beep(90, 0.5, 'sawtooth', 0.18); },
            relief: function () { beep(520, 0.16, 'sine', 0.07); setTimeout(function () { beep(780, 0.22, 'sine', 0.06); }, 110); },
            toggle: function () { muted = !muted; return muted; },
            isMuted: function () { return muted; }
        };
    })();

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
            var group = btn.parentElement;
            group.querySelectorAll('button').forEach(function (b) { b.classList.remove('is-active'); });
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
            var m = sfx.toggle();
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

        bind();
        resize();
    });
})();
