/**
 * 무궁화 꽃이 피었습니다 — 캐릭터 그림 모듈.
 *
 * 참가자(체육복 입은 2등신 꼬마)를 Canvas 2D 로 그려 Phaser 텍스처로 쓴다.
 * 스타일: 플랫 + 2톤 명암 + 진한 외곽선 (리듬게임 아트 규칙과 같은 계열).
 * 오른쪽(술래 쪽)을 보는 3/4 측면. 한 프레임은 64×80 단위, 발끝이 (32, 78).
 *
 * mugunghwa.html 에서 mugunghwa.js 보다 먼저 로드된다. 전역 MugunghwaArt 하나만 내보낸다.
 */
const MugunghwaArt = (() => {
    const FW = 64, FH = 80;
    const FOOT_X = 32, FOOT_Y = 78;
    const INK = '#2b2733';
    const LW = 2.2;
    const SKIN = '#ffd9b8', SKIN_LO = '#f3bd94';
    const HAIRS = ['#2e2622', '#4a3326', '#1f1d24', '#6b4428', '#2e2622', '#3a2c3f'];

    // 달리기 4장 · 얼음 2장 · 들킴(제자리 허우적) 2장 · 탈락 · 결승 환호
    const FRAMES = ['run0', 'run1', 'run2', 'run3', 'frz0', 'frz1', 'pan0', 'pan1', 'dead', 'cheer'];

    // 다리: [허벅지, 정강이] 각도(수직 아래 0°, + 는 앞쪽). 팔: [윗팔, 아래팔]
    const POSES = {
        run0:  { nl: [38, 4],   fl: [-32, -72], na: [-50, 25],  fa: [40, 115],  lean: 9,  bob: 0,    face: 'run' },
        run1:  { nl: [12, -45], fl: [-4, 0],    na: [-12, 55],  fa: [14, 80],   lean: 9,  bob: -2.6, face: 'run' },
        run2:  { nl: [-32, -72], fl: [38, 4],   na: [40, 115],  fa: [-50, 25],  lean: 9,  bob: 0,    face: 'run' },
        run3:  { nl: [-4, 0],   fl: [12, -45],  na: [14, 80],   fa: [-12, 55],  lean: 9,  bob: -2.6, face: 'run' },
        frz0:  { nl: [82, 0],   fl: [-2, 0],    na: [150, 172], fa: [-62, -35], lean: -2, bob: 0,    face: 'hold' },
        frz1:  { nl: [22, 16],  fl: [-20, -14], na: [78, 70],   fa: [-80, -88], lean: 4,  bob: 0,    face: 'hold' },
        pan0:  { nl: [36, 0],   fl: [-30, -70], na: [150, 175], fa: [130, 160], lean: -7, bob: -1.5, face: 'panic' },
        pan1:  { nl: [-30, -70], fl: [36, 0],   na: [130, 160], fa: [150, 175], lean: -7, bob: 0,    face: 'panic' },
        dead:  { nl: [6, 6],    fl: [-6, -6],   na: [28, 40],   fa: [-28, -40], lean: 0,  bob: 0,    face: 'dead' },
        cheer: { nl: [14, 4],   fl: [-12, -4],  na: [152, 166], fa: [-150, -166], lean: -3, bob: -2, face: 'happy' },
    };

    function shade(hex, k) {
        const n = parseInt(hex.slice(1), 16);
        const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
        return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => c(v).toString(16).padStart(2, '0')).join('');
    }
    function mix(hex, other, t) {
        const a = parseInt(hex.slice(1), 16), b = parseInt(other.slice(1), 16);
        const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
        return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
    }
    const rad = (d) => d * Math.PI / 180;
    const dir = (deg, len) => [Math.sin(rad(deg)) * len, Math.cos(rad(deg)) * len];

    // 외곽선 있는 굵은 팔다리 (잉크 먼저, 색 위에)
    function limb(ctx, pts, w, color) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
        ctx.strokeStyle = INK; ctx.lineWidth = w + LW * 2; path(); ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = w; path(); ctx.stroke();
    }
    function blob(ctx, fill, draw) {
        ctx.beginPath(); draw(); ctx.fillStyle = fill; ctx.fill();
        ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke();
    }

    function drawLeg(ctx, hip, ang, pants, shoe) {
        const k = [hip[0] + dir(ang[0], 10)[0], hip[1] + dir(ang[0], 10)[1]];
        const f = [k[0] + dir(ang[1], 10)[0], k[1] + dir(ang[1], 10)[1]];
        limb(ctx, [hip, k, f], 6.4, pants);
        ctx.save();
        ctx.translate(f[0], f[1]);
        ctx.rotate(-rad(ang[1]));
        blob(ctx, shoe, () => ctx.ellipse(2.2, 0.6, 4.6, 2.9, 0, 0, Math.PI * 2));
        ctx.restore();
    }
    function drawArm(ctx, sh, ang, sleeve) {
        const e = [sh[0] + dir(ang[0], 8)[0], sh[1] + dir(ang[0], 8)[1]];
        const h = [e[0] + dir(ang[1], 7)[0], e[1] + dir(ang[1], 7)[1]];
        limb(ctx, [sh, e, h], 5.2, sleeve);
        blob(ctx, SKIN, () => ctx.arc(h[0], h[1], 2.9, 0, Math.PI * 2));
    }

    function drawHairBack(ctx, style, hair) {
        if (style === 1) {
            // 포니테일
            blob(ctx, hair, () => ctx.ellipse(16.5, 25, 5.5, 8.5, rad(28), 0, Math.PI * 2));
        }
        if (style === 2) {
            // 단발: 뒤쪽이 턱선까지
            blob(ctx, hair, () => {
                ctx.moveTo(18, 22);
                ctx.quadraticCurveTo(15, 36, 24, 37);
                ctx.lineTo(34, 36);
                ctx.lineTo(34, 18);
                ctx.closePath();
            });
        }
        blob(ctx, hair, () => ctx.arc(32, 21.5, 15.5, 0, Math.PI * 2));
        if (style === 1) {
            ctx.fillStyle = '#ff6fa8';
            ctx.beginPath(); ctx.arc(20.2, 19.5, 2.4, 0, Math.PI * 2); ctx.fill();
            ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke();
        }
    }

    function drawBangs(ctx, style, hair) {
        blob(ctx, hair, () => {
            ctx.moveTo(19.5, 25);
            ctx.quadraticCurveTo(21, 8, 36, 8.2);
            ctx.quadraticCurveTo(48.5, 9.5, 49.2, 21);
            if (style === 2) {
                ctx.lineTo(46, 19.5); ctx.lineTo(28, 19.5);
            } else {
                ctx.lineTo(46.5, 17.2); ctx.lineTo(44, 20.6); ctx.lineTo(40.6, 16.6);
                ctx.lineTo(37, 20.4); ctx.lineTo(33.6, 16.8); ctx.lineTo(30, 20.4);
            }
            ctx.lineTo(26, 18.6);
            ctx.lineTo(24.6, 25.5);
            ctx.closePath();
        });
        // 머리 광택
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(34, 22, 11, rad(200), rad(250)); ctx.stroke();
    }

    function eyeDot(ctx, x, y) {
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.ellipse(x, y, 1.9, 2.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x + 0.6, y - 0.9, 0.75, 0, Math.PI * 2); ctx.fill();
    }

    function drawFace(ctx, face) {
        const e1 = [34.2, 27], e2 = [42.6, 27];
        ctx.lineCap = 'round';
        // 볼터치
        ctx.fillStyle = face === 'hold' ? 'rgba(255,90,110,0.62)' : 'rgba(255,120,130,0.45)';
        const cr = face === 'hold' ? 3.1 : 2.4;
        ctx.beginPath(); ctx.ellipse(31.6, 32, cr, cr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(45.4, 32, cr * 0.8, cr * 0.62, 0, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        if (face === 'run') {
            eyeDot(ctx, e1[0], e1[1]); eyeDot(ctx, e2[0], e2[1]);
            ctx.beginPath(); ctx.arc(40.5, 32, 2.4, rad(20), rad(160)); ctx.stroke();
        } else if (face === 'hold') {
            // 숨 참기: 질끈 감은 눈 + 오므린 입
            ctx.beginPath(); ctx.moveTo(e1[0] - 2.4, e1[1] - 1.2); ctx.lineTo(e1[0] + 1.6, e1[1]); ctx.lineTo(e1[0] - 2.4, e1[1] + 1.2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(e2[0] + 2.2, e2[1] - 1.2); ctx.lineTo(e2[0] - 1.6, e2[1]); ctx.lineTo(e2[0] + 2.2, e2[1] + 1.2); ctx.stroke();
            ctx.fillStyle = INK;
            ctx.beginPath(); ctx.ellipse(39.8, 33.4, 1.3, 1.1, 0, 0, Math.PI * 2); ctx.fill();
        } else if (face === 'panic') {
            [e1, e2].forEach(([x, y]) => {
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(x, y, 3.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.fillStyle = INK;
                ctx.beginPath(); ctx.arc(x + 0.4, y + 0.2, 1.05, 0, Math.PI * 2); ctx.fill();
            });
            // 올라간 눈썹
            ctx.beginPath(); ctx.moveTo(31.4, 22.2); ctx.lineTo(35.6, 21); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(41.2, 21); ctx.lineTo(45.2, 22.2); ctx.stroke();
            ctx.fillStyle = '#5a1f2c';
            ctx.beginPath(); ctx.ellipse(39.8, 34, 2.6, 3.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#ff7a8a';
            ctx.beginPath(); ctx.ellipse(39.8, 35.6, 1.5, 1, 0, 0, Math.PI * 2); ctx.fill();
        } else if (face === 'dead') {
            [e1, e2].forEach(([x, y]) => {
                ctx.beginPath(); ctx.moveTo(x - 1.8, y - 1.8); ctx.lineTo(x + 1.8, y + 1.8);
                ctx.moveTo(x + 1.8, y - 1.8); ctx.lineTo(x - 1.8, y + 1.8); ctx.stroke();
            });
            ctx.beginPath(); ctx.moveTo(36.8, 33.6);
            ctx.quadraticCurveTo(38.3, 32, 39.8, 33.6); ctx.quadraticCurveTo(41.3, 35.2, 42.8, 33.6);
            ctx.stroke();
        } else if (face === 'happy') {
            [e1, e2].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y + 1, 2.2, rad(200), rad(340)); ctx.stroke(); });
            ctx.fillStyle = '#5a1f2c';
            ctx.beginPath(); ctx.moveTo(36.6, 31.6); ctx.quadraticCurveTo(39.8, 37.8, 43.4, 31.6); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
    }

    function drawSweat(ctx, x, y, s) {
        ctx.fillStyle = '#9fdcff';
        ctx.beginPath();
        ctx.moveTo(x, y - 3.2 * s);
        ctx.quadraticCurveTo(x + 2.4 * s, y + 0.2 * s, x, y + 1.6 * s);
        ctx.quadraticCurveTo(x - 2.4 * s, y + 0.2 * s, x, y - 3.2 * s);
        ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = INK; ctx.stroke();
    }

    // 한 포즈를 (0,0)~(64,80) 단위 좌표에 그린다
    function drawPose(ctx, poseName, look) {
        const P = POSES[poseName];
        const suit = look.color, suitLo = shade(look.color, 0.74), suitFar = shade(look.color, 0.62);
        const pantsLo = shade(look.color, 0.55);
        const shoe = '#3b3a4a';
        const hip = [32, 58 + P.bob];
        const sh = [33, 44 + P.bob];

        // 뒤쪽 팔다리
        drawLeg(ctx, [hip[0] - 1.5, hip[1]], P.fl, pantsLo, shade(shoe, 0.8));
        ctx.save();
        ctx.translate(hip[0], hip[1]); ctx.rotate(rad(P.lean)); ctx.translate(-hip[0], -hip[1]);
        drawArm(ctx, [sh[0] - 1.5, sh[1]], P.fa, suitFar);
        ctx.restore();

        drawLeg(ctx, [hip[0] + 1.2, hip[1]], P.nl, shade(look.color, 0.66), shoe);

        ctx.save();
        ctx.translate(hip[0], hip[1]); ctx.rotate(rad(P.lean)); ctx.translate(-hip[0], -hip[1]);
        // 몸통 (체육복)
        blob(ctx, suit, () => ctx.roundRect ? ctx.roundRect(22.5, 39.5 + P.bob, 19.5, 21, 7.5) : ctx.rect(22.5, 39.5 + P.bob, 19.5, 21));
        // 몸통 그늘 + 지퍼 라인
        ctx.fillStyle = suitLo;
        ctx.beginPath(); ctx.moveTo(23.8, 52 + P.bob); ctx.lineTo(40.8, 52 + P.bob); ctx.lineTo(40.8, 55 + P.bob);
        ctx.quadraticCurveTo(40.8, 59.2 + P.bob, 34.5, 59.2 + P.bob); ctx.lineTo(29.5, 59.2 + P.bob);
        ctx.quadraticCurveTo(23.8, 59.2 + P.bob, 23.8, 55 + P.bob); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(38.2, 42 + P.bob, 1.5, 16);
        // 앞팔은 몸통 앞, 머리 뒤 (만세 자세에서 얼굴을 안 가림)
        drawArm(ctx, sh, P.na, suit);
        // 머리
        ctx.save();
        ctx.translate(0, P.bob);
        drawHairBack(ctx, look.hairStyle, look.hair);
        blob(ctx, SKIN, () => ctx.arc(26.2, 28.6, 3.2, 0, Math.PI * 2));           // 귀
        blob(ctx, SKIN, () => ctx.ellipse(36.4, 26.4, 12.6, 11.8, 0, 0, Math.PI * 2));
        ctx.fillStyle = SKIN_LO;
        ctx.beginPath(); ctx.ellipse(33, 35.2, 7, 2.3, 0, 0, Math.PI); ctx.fill();
        drawBangs(ctx, look.hairStyle, look.hair);
        drawFace(ctx, P.face);
        if (P.face === 'panic') { drawSweat(ctx, 50.5, 16, 1.1); drawSweat(ctx, 19.5, 12, 0.9); }
        if (P.face === 'hold') drawSweat(ctx, 51, 20, 0.85);
        ctx.restore();
        ctx.restore();
    }

    /**
     * 한 참가자의 프레임 시트. 가로로 FRAMES 순서대로 붙인다.
     * look = { color: '#rrggbb', hair: '#rrggbb', hairStyle: 0|1|2 }, s = 단위당 픽셀
     */
    function makeSheet(look, s) {
        const c = document.createElement('canvas');
        const fw = Math.ceil(FW * s), fh = Math.ceil(FH * s);
        c.width = fw * FRAMES.length;
        c.height = fh;
        const ctx = c.getContext('2d');
        FRAMES.forEach((name, i) => {
            ctx.save();
            ctx.translate(i * fw, 0);
            ctx.scale(s, s);
            drawPose(ctx, name, look);
            ctx.restore();
        });
        return { canvas: c, fw, fh };
    }

    // 결과 카드용 한 장 (dataURL)
    function portrait(look, frame, px) {
        const c = document.createElement('canvas');
        const s = px / FH;
        c.width = Math.ceil(FW * s); c.height = Math.ceil(FH * s);
        const ctx = c.getContext('2d');
        ctx.scale(s, s);
        drawPose(ctx, frame, look);
        return c.toDataURL('image/png');
    }

    return { FW, FH, FOOT_X, FOOT_Y, FRAMES, HAIRS, shade, mix, makeSheet, portrait };
})();
