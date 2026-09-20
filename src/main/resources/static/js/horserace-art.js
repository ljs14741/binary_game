/**
 * 말달리자 — 그림 모듈.
 *
 * 장애물(바위·웅덩이·당근)과 상태 아이콘(부스터·어지럼·걸림)을 OS 이모지 대신 Canvas 2D 로 그려
 * Phaser 텍스처로 등록한다. 🪨(유니코드 13, 2020년)는 업데이트 안 된 윈도우에서 □ 로 깨졌다.
 * 말 자체는 이모지(🏇🦄🐉)를 그대로 쓴다 — 코드로 그려 봤더니 이모지보다 못생겨서 되돌렸다(2026-09-20).
 *
 * horserace.html 에서 horserace.js 보다 먼저 로드된다. 전역 HorseRaceArt 하나만 내보낸다.
 */
const HorseRaceArt = (() => {
    const ICON_SZ = 48;
    const OBS_SZ  = 64;

    // ── 상태 아이콘 ─────────────────────────────────────────
    function drawFlame(ctx, cx, cy, h) {
        const w = h * 0.62;
        const tongue = (color, k) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(cx, cy - h * 0.5 * k);
            ctx.bezierCurveTo(cx + w * 0.6 * k, cy - h * 0.1 * k, cx + w * 0.5 * k, cy + h * 0.45 * k, cx, cy + h * 0.5 * k);
            ctx.bezierCurveTo(cx - w * 0.5 * k, cy + h * 0.45 * k, cx - w * 0.6 * k, cy - h * 0.1 * k, cx, cy - h * 0.5 * k);
            ctx.fill();
        };
        tongue('#ff5a1f', 1);
        tongue('#ffb300', 0.62);
        tongue('#fff3a0', 0.3);
    }

    function drawStar5(ctx, cx, cy, r, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a  = -Math.PI / 2 + i * Math.PI / 5;
            const rr = i % 2 === 0 ? r : r * 0.45;
            ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
    }

    function drawIconDizzy(ctx) {
        // 머리 위를 도는 별 셋
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(24, 26, 18, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
        drawStar5(ctx,  8, 24, 7, '#ffd23f');
        drawStar5(ctx, 26, 15, 8, '#ffe066');
        drawStar5(ctx, 41, 26, 7, '#ffd23f');
    }

    function drawIconAlert(ctx) {
        ctx.fillStyle = '#e53935';
        ctx.beginPath(); ctx.arc(24, 24, 20, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(20.5, 10, 7, 18, 3) : ctx.rect(20.5, 10, 7, 18); ctx.fill();
        ctx.beginPath(); ctx.arc(24, 34.5, 3.6, 0, Math.PI * 2); ctx.fill();
    }

    // ── 장애물 ───────────────────────────────────────────────────
    function drawRock(ctx) {
        ctx.lineJoin = 'round';
        ctx.fillStyle = '#7d7f8c';
        ctx.beginPath();
        ctx.moveTo(8, 50); ctx.lineTo(14, 26); ctx.lineTo(30, 12); ctx.lineTo(50, 18);
        ctx.lineTo(58, 38); ctx.lineTo(52, 54); ctx.lineTo(18, 56); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#a6a8b6';                    // 밝은 면
        ctx.beginPath();
        ctx.moveTo(14, 26); ctx.lineTo(30, 12); ctx.lineTo(50, 18); ctx.lineTo(36, 32); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#585a66';                    // 어두운 면
        ctx.beginPath();
        ctx.moveTo(36, 32); ctx.lineTo(58, 38); ctx.lineTo(52, 54); ctx.lineTo(30, 52); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#33343c';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(8, 50); ctx.lineTo(14, 26); ctx.lineTo(30, 12); ctx.lineTo(50, 18);
        ctx.lineTo(58, 38); ctx.lineTo(52, 54); ctx.lineTo(18, 56); ctx.closePath();
        ctx.stroke();
    }

    function drawPuddle(ctx) {
        ctx.fillStyle = 'rgba(56,132,255,0.85)';
        ctx.beginPath();
        ctx.ellipse(32, 38, 29, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(190,225,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(32, 38, 22, 9, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(32, 38, 12, 4, 0, 0, Math.PI * 2); ctx.stroke();
        // 튀는 물방울
        ctx.fillStyle = '#7cc0ff';
        ctx.beginPath(); ctx.moveTo(22, 20); ctx.quadraticCurveTo(28, 14, 27, 24); ctx.quadraticCurveTo(24, 28, 22, 20); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 18, 3, 0, Math.PI * 2); ctx.fill();
    }

    function drawCarrot(ctx) {
        ctx.lineJoin = 'round';
        ctx.fillStyle = '#ff8a1f';                    // 몸통: 오른쪽 위 잎, 왼쪽 아래 뾰족
        ctx.beginPath();
        ctx.moveTo(42, 18);
        ctx.quadraticCurveTo(54, 30, 38, 42);
        ctx.quadraticCurveTo(24, 54, 8, 58);
        ctx.quadraticCurveTo(14, 40, 26, 26);
        ctx.quadraticCurveTo(34, 16, 42, 18);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#d96a00';                  // 마디 줄
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, 30); ctx.lineTo(38, 36);
        ctx.moveTo(22, 40); ctx.lineTo(30, 46);
        ctx.stroke();
        ctx.fillStyle = '#3ec46d';                    // 잎
        for (const [dx, dy] of [[-4, -2], [6, -8], [14, -2]]) {
            ctx.beginPath();
            ctx.ellipse(46 + dx, 14 + dy, 5, 11, (dx - 4) * 0.08, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── 텍스처 등록 ───────────────────────────────────────────────
    function canvasTexture(scene, key, w, h, draw) {
        if (scene.textures.exists(key)) return;
        const tex = scene.textures.createCanvas(key, w, h);
        draw(tex.context);
        tex.refresh();
    }

    /** 씬 하나에서 한 번 부르면 게임 전체에서 쓸 수 있다 (텍스처·애니메이션은 게임 단위). */
    function build(scene) {
        canvasTexture(scene, 'hr_ic_boost',   ICON_SZ, ICON_SZ, ctx => drawFlame(ctx, 24, 26, 42));
        canvasTexture(scene, 'hr_ic_dizzy',   ICON_SZ, ICON_SZ, drawIconDizzy);
        canvasTexture(scene, 'hr_ic_alert',   ICON_SZ, ICON_SZ, drawIconAlert);
        canvasTexture(scene, 'hr_obs_rock',   OBS_SZ, OBS_SZ, drawRock);
        canvasTexture(scene, 'hr_obs_puddle', OBS_SZ, OBS_SZ, drawPuddle);
        canvasTexture(scene, 'hr_obs_carrot', OBS_SZ, OBS_SZ, drawCarrot);
    }

    return { build, ICON_SZ, OBS_SZ };
})();
