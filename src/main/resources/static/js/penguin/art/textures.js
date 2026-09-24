/* 모든 그림을 코드로 그려서 텍스처로 구움 (리듬게임과 같은 방식, 이미지 요청 없음).
 * 오른쪽을 보는 모습으로 그리고, 화면에서 scaleX 를 뒤집어 왼쪽을 보게 함.
 * 키와 크기는 여기서만 정의함.
 */
import { INK, LINE, P } from './palette.js';
import { DPR } from './dpr.js';

// 판 안에서 움직이는 것들(펭귄·일반 천적·친구·코인·먹이)은 폰에서 작아 보여서 크게 구움. 보스·UI 는 그대로
export const AS = 1.3;
let K = 1;
function g(scene) { return scene.make.graphics({ x: 0, y: 0, add: false }); }
function bake(gr, key, w, h) {
  gr.setScale(DPR * K);
  gr.generateTexture(key, Math.ceil(w * DPR * K), Math.ceil(h * DPR * K));
  gr.scene.textures.get(key).source[0].resolution = DPR;
  gr.destroy();
}

function ellPts(cx, cy, rx, ry, ang = 0, n = 30) {
  const c = Math.cos(ang), s = Math.sin(ang), pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2, x = Math.cos(t) * rx, y = Math.sin(t) * ry;
    pts.push({ x: cx + x * c - y * s, y: cy + x * s + y * c });
  }
  return pts;
}
// 외곽선 있는 타원
function blob(gr, cx, cy, rx, ry, color, ang = 0, line = LINE) {
  if (line) { gr.fillStyle(INK); gr.fillPoints(ellPts(cx, cy, rx + line, ry + line, ang), true); }
  gr.fillStyle(color); gr.fillPoints(ellPts(cx, cy, rx, ry, ang), true);
}
function ell(gr, cx, cy, rx, ry, color, alpha = 1, ang = 0) { gr.fillStyle(color, alpha); gr.fillPoints(ellPts(cx, cy, rx, ry, ang), true); }
// 한쪽 끝을 축으로 돌린 타원 (지느러미·날개)
function limb(gr, px, py, rx, ry, ang, color, line = LINE) {
  const cx = px - Math.sin(ang) * ry, cy = py + Math.cos(ang) * ry;
  blob(gr, cx, cy, rx, ry, color, ang, line);
}
function tri(gr, pts, color, line = LINE) {
  if (line) {
    // 삼각형 외곽선: 무게중심에서 바깥으로 살짝 키운 걸 먼저
    const mx = (pts[0] + pts[2] + pts[4]) / 3, my = (pts[1] + pts[3] + pts[5]) / 3;
    const big = pts.map((v, i) => i % 2 === 0 ? v + Math.sign(v - mx) * line * 1.2 : v + Math.sign(v - my) * line * 1.2);
    gr.fillStyle(INK); gr.fillTriangle(...big);
  }
  gr.fillStyle(color); gr.fillTriangle(...pts);
}
function eye(gr, x, y, r, angry) {
  gr.fillStyle(INK); gr.fillCircle(x, y, r + 1.4);
  gr.fillStyle(0xffffff); gr.fillCircle(x, y, r);
  gr.fillStyle(0x10131c); gr.fillCircle(x + r * 0.25, y + r * 0.08, r * 0.66);
  gr.fillStyle(0xffffff); gr.fillCircle(x + r * 0.46, y - r * 0.3, r * 0.28); gr.fillCircle(x - r * 0.05, y + r * 0.35, r * 0.12);
  if (angry) {
    gr.lineStyle(Math.max(2.5, r * 0.45), INK);
    gr.beginPath(); gr.moveTo(x - r * 1.2, y - r * 1.5); gr.lineTo(x + r * 1.1, y - r * 0.75); gr.strokePath();
  }
}
// 가로 띠로 칠한 타원 (무지개펭귄)
function bandBody(gr, cx, cy, rx, ry, colors) {
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const y0 = cy - ry + 2 * ry * i / n, y1 = Math.min(cy + ry, cy - ry + 2 * ry * (i + 1) / n + 0.8);
    const pts = [], steps = 10;
    for (let k = 0; k <= steps; k++) { const y = y0 + (y1 - y0) * k / steps; pts.push({ x: cx + rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)), y }); }
    for (let k = steps; k >= 0; k--) { const y = y0 + (y1 - y0) * k / steps; pts.push({ x: cx - rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)), y }); }
    gr.fillStyle(colors[i]); gr.fillPoints(pts, true);
  }
}
function star(gr, cx, cy, r1, r2, n, color, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / n; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
  gr.fillStyle(color); gr.fillPoints(pts, true);
}

/* ---------------- 펭귄 ---------------- */
export const PENGUIN_LOOK = {
  'gentoo-0': { size: 40, body: P.babyGray, hi: P.babyHi, belly: 0xf4f7fb, face: 0xf4f7fb, fluff: 3, eye: 0.12, beak: P.beakLo, beakLen: 0.12, rx: 0.4, ry: 0.42, flipper: P.babyDark },
  'gentoo-1': { size: 52, body: 0x57637a, hi: 0x8793a8, belly: 0xffffff, brow: true, fluff: 2, eye: 0.1, beak: P.beak, beakLen: 0.14, flipper: 0x46506a },
  'gentoo-2': { size: 64, body: P.navy, hi: P.navyHi, belly: 0xffffff, brow: true, eye: 0.088, beak: P.beak, beakLen: 0.17, flipper: 0x1a2033 },
  chinstrap: { size: 58, body: 0x2c3345, hi: 0x4a5572, belly: 0xffffff, face: 0xffffff, strap: true, eye: 0.09, beak: 0x2b2f3d, beakLen: 0.15, flipper: 0x1f2535 },
  emperor: { size: 88, body: P.emperorBack, hi: 0x55648a, belly: 0xffffff, chest: P.emperorChest, patch: P.emperorGold, eye: 0.075, beak: 0x333a4e, beakStripe: P.beak, beakLen: 0.2, rx: 0.34, ry: 0.46, flipper: 0x252f45 },
  macaroni: { size: 64, body: 0x262b3a, hi: 0x434a60, belly: 0xffffff, crest: true, eye: 0.09, beak: 0xe0502a, beakLen: 0.17, beakThick: 1.35, flipper: 0x1b1f2b },
  rainbow: { size: 66, bands: [0xff8fa3, 0xffb86b, 0xffe66b, 0x8fe8a4, 0x7fcfff, 0xb49bff], hi: 0xffffff, belly: 0xffffff, eye: 0.09, beak: P.gold, beakLen: 0.16, flipper: 0xb49bff, sparkle: true }
};

function penguin(scene, key, o, flap) {
  const S = o.size, w = Math.ceil(S * 1.3), h = Math.ceil(S * 1.2);
  const cx = w * 0.45, cy = h * 0.55;
  const rx = S * (o.rx || 0.36), ry = S * (o.ry || 0.44);
  const gr = g(scene);
  const bodyColor = o.bands ? o.bands[0] : o.body;

  // 발 (몸 뒤)
  blob(gr, cx - S * 0.05, cy + ry * 0.92, S * 0.1, S * 0.045, P.feet, 0.25);
  blob(gr, cx + S * 0.14, cy + ry * 0.9, S * 0.1, S * 0.045, P.feet, -0.15);
  // 솜털 (아기·꼬마)
  for (let i = 0; i < (o.fluff || 0); i++) blob(gr, cx - rx * 0.25 + i * rx * 0.28, cy - ry * 0.95 + (i % 2) * 2, S * 0.07, S * 0.08, bodyColor, -0.4 + i * 0.4);
  // 몸
  gr.fillStyle(INK); gr.fillPoints(ellPts(cx, cy, rx + LINE, ry + LINE), true);
  if (o.bands) bandBody(gr, cx, cy, rx, ry, o.bands);
  else { gr.fillStyle(o.body); gr.fillPoints(ellPts(cx, cy, rx, ry), true); }
  ell(gr, cx - rx * 0.38, cy - ry * 0.38, rx * 0.32, ry * 0.26, o.hi, 0.45, -0.5);
  // 배
  ell(gr, cx + rx * 0.24, cy + ry * 0.16, rx * 0.64, ry * 0.74, o.belly);
  ell(gr, cx + rx * 0.02, cy + ry * 0.4, rx * 0.34, ry * 0.3, P.bellyShade, 0.6);
  if (o.chest) ell(gr, cx + rx * 0.34, cy - ry * 0.14, rx * 0.5, ry * 0.3, o.chest);
  if (o.face) ell(gr, cx + rx * 0.4, cy - ry * 0.46, rx * 0.55, ry * 0.36, o.face);
  if (o.strap) {
    gr.lineStyle(Math.max(1.6, S * 0.03), INK);
    gr.beginPath(); gr.arc(cx + rx * 0.42, cy - ry * 0.62, rx * 0.5, 0.35, 2.3); gr.strokePath();
  }
  if (o.patch) { ell(gr, cx + rx * 0.02, cy - ry * 0.46, rx * 0.22, ry * 0.15, o.patch, 1, 0.9); ell(gr, cx + rx * 0.25, cy - ry * 0.22, rx * 0.3, ry * 0.1, o.patch, 0.7, 0.2); }
  if (o.brow) ell(gr, cx + rx * 0.3, cy - ry * 0.7, rx * 0.34, ry * 0.085, 0xffffff, 1, -0.25);

  // 눈·볼
  const er = S * o.eye, ex = cx + rx * 0.44, ey = cy - ry * 0.42;
  eye(gr, ex, ey, er);
  ell(gr, ex + er * 0.1, ey + er * 1.95, er * 0.95, er * 0.5, P.cheek, 0.75);

  // 부리
  const bx = cx + rx * 0.84, by = cy - ry * 0.34, bl = S * o.beakLen, bt = S * 0.055 * (o.beakThick || 1);
  tri(gr, [bx - S * 0.03, by - bt, bx + bl, by + S * 0.01, bx - S * 0.03, by + bt], o.beak);
  if (o.beakStripe) { gr.fillStyle(o.beakStripe); gr.fillTriangle(bx - S * 0.02, by - bt * 0.3, bx + bl * 0.55, by + S * 0.005, bx - S * 0.02, by + bt * 0.55); }

  // 볏 (마카로니)
  if (o.crest) {
    for (let i = 0; i < 3; i++) limb(gr, cx + rx * 0.3 - i * rx * 0.12, cy - ry * 0.62, S * 0.035, S * 0.17, 2.3 + i * 0.28, i === 1 ? P.crestLo : P.crest, 2);
    ell(gr, cx + rx * 0.32, cy - ry * 0.62, rx * 0.26, ry * 0.05, P.crest, 1, -0.2);
  }
  if (o.sparkle) { star(gr, cx - rx * 0.1, cy - ry * 0.98, S * 0.07, S * 0.025, 4, 0xffffff); star(gr, cx + rx * 0.2, cy - ry * 1.05, S * 0.04, S * 0.015, 4, 0xfff3a0); }

  // 지느러미
  limb(gr, cx - rx * 0.1, cy - ry * 0.1, S * 0.06, S * 0.2, flap ? 1.05 : 0.35, o.flipper);
  bake(gr, key, w, h);
}

/* ---------------- 천적 ---------------- */
function skua(scene, key, up) {
  const w = 104, h = 76, gr = g(scene), cx = 50, cy = 44;
  tri(gr, [cx - 34, cy - 4, cx - 54, cy - 14, cx - 50, cy + 8], 0x6b5140);
  if (!up) limb(gr, cx - 4, cy - 2, 12, 30, 1.9, 0x6b5140);
  blob(gr, cx, cy, 34, 20, 0x8b6b52);
  ell(gr, cx + 6, cy + 7, 22, 10, 0xc7a98c);
  blob(gr, cx + 30, cy - 12, 17, 15, 0x8b6b52);
  tri(gr, [cx + 42, cy - 17, cx + 60, cy - 8, cx + 42, cy - 5], 0x3b3a40);
  tri(gr, [cx + 55, cy - 10, cx + 60, cy - 8, cx + 56, cy - 3], 0x3b3a40, 0);
  eye(gr, cx + 34, cy - 16, 5.5, true);
  limb(gr, cx - 2, cy - 6, 11, 32, up ? 2.6 : 1.2, 0x7a5c46);
  bake(gr, key, w, h);
}

function seal(scene, key, o) {
  const s = o.s || 1, w = 160 * s, h = 84 * s, gr = g(scene), cx = 74 * s, cy = 46 * s;
  tri(gr, [cx - 58 * s, cy, cx - 82 * s, cy - 18 * s, cx - 80 * s, cy + 16 * s], o.dark);
  blob(gr, cx - 8 * s, cy, 64 * s, 25 * s, o.body);
  ell(gr, cx - 4 * s, cy + 12 * s, 50 * s, 10 * s, o.belly);
  for (const [dx, dy, r] of [[-40, -8, 5], [-22, -14, 4], [-8, -6, 3.5], [-50, 4, 3.5], [10, -14, 4]]) ell(gr, cx + dx * s, cy + dy * s, r * s, r * 0.8 * s, o.spot, 0.9);
  blob(gr, cx + 50 * s, cy - 6 * s, 30 * s, 24 * s, o.body);
  // 입: 크게 웃는 이빨
  gr.fillStyle(INK); gr.fillTriangle(cx + 50 * s, cy + 2 * s, cx + 82 * s, cy - 2 * s, cx + 78 * s, cy + 12 * s);
  gr.fillStyle(0xffffff);
  for (let i = 0; i < 4; i++) gr.fillTriangle(cx + (56 + i * 6) * s, cy + 1 * s, cx + (61 + i * 6) * s, cy + 0.5 * s, cx + (58.5 + i * 6) * s, cy + 6 * s);
  ell(gr, cx + 78 * s, cy - 12 * s, 4 * s, 3 * s, INK);
  eye(gr, cx + 58 * s, cy - 16 * s, 6.5 * s, true);
  limb(gr, cx + 20 * s, cy + 12 * s, 8 * s, 20 * s, 0.6, o.dark);
  if (o.crown) {
    const px = cx + 38 * s, py = cy - 34 * s;
    gr.fillStyle(INK); gr.fillRect(px - 2, py - 2, 34 * s + 4, 14 * s + 4);
    gr.fillStyle(P.gold); gr.fillRect(px, py, 34 * s, 14 * s);
    for (let i = 0; i < 3; i++) { tri(gr, [px + i * 11 * s, py + 1, px + (5.5 + i * 11) * s, py - 11 * s, px + (11 + i * 11) * s, py + 1], P.gold, 2); }
    ell(gr, px + 17 * s, py + 7 * s, 3.5 * s, 3.5 * s, P.bad);
  }
  if (o.scar) { gr.lineStyle(3, 0xffffff, 0.8); gr.beginPath(); gr.moveTo(cx + 48 * s, cy - 26 * s); gr.lineTo(cx + 64 * s, cy - 8 * s); gr.strokePath(); }
  bake(gr, key, w, h);
}

function shark(scene, key) {
  const w = 176, h = 96, gr = g(scene), cx = 84, cy = 54;
  tri(gr, [cx - 60, cy, cx - 88, cy - 28, cx - 84, cy + 24], 0x6d8096);
  tri(gr, [cx - 6, cy - 22, cx + 16, cy - 50, cx + 22, cy - 22], 0x6d8096);
  blob(gr, cx, cy, 72, 26, 0x7f93a8);
  ell(gr, cx + 8, cy + 12, 58, 12, 0xeef3f8);
  gr.fillStyle(INK); gr.fillTriangle(cx + 38, cy + 4, cx + 74, cy + 2, cx + 66, cy + 14);
  gr.fillStyle(0xffffff); for (let i = 0; i < 5; i++) gr.fillTriangle(cx + 42 + i * 6, cy + 3.5, cx + 47 + i * 6, cy + 3, cx + 44.5 + i * 6, cy + 8);
  for (let i = 0; i < 3; i++) { gr.lineStyle(2, 0x51637a); gr.beginPath(); gr.moveTo(cx + 18 + i * 6, cy - 8); gr.lineTo(cx + 15 + i * 6, cy + 6); gr.strokePath(); }
  eye(gr, cx + 50, cy - 10, 5.5, true);
  limb(gr, cx + 6, cy + 10, 8, 20, 0.7, 0x6d8096);
  bake(gr, key, w, h);
}

function bear(scene, key, guard) {
  const w = 230, h = 170, gr = g(scene), cx = 100, cy = 96;
  blob(gr, cx - 20, cy + 10, 82, 50, 0xf4f1ea);
  ell(gr, cx - 40, cy - 12, 50, 18, 0xffffff, 0.8);
  blob(gr, cx + 58, cy - 26, 44, 40, 0xf4f1ea);
  blob(gr, cx + 36, cy - 62, 12, 12, 0xf4f1ea); ell(gr, cx + 36, cy - 62, 6, 6, 0xdcd4c4);
  blob(gr, cx + 74, cy - 64, 12, 12, 0xf4f1ea); ell(gr, cx + 74, cy - 64, 6, 6, 0xdcd4c4);
  blob(gr, cx + 90, cy - 14, 22, 16, 0xe9e2d3);
  ell(gr, cx + 108, cy - 20, 8, 6, INK);
  gr.lineStyle(3, INK); gr.beginPath(); gr.arc(cx + 94, cy - 4, 10, 0.2, 2.6); gr.strokePath();
  eye(gr, cx + 70, cy - 38, 7.5, true);
  eye(gr, cx + 48, cy - 36, 6, true);
  limb(gr, cx + 20, cy + 30, 18, 28, 0.3, 0xefe9dc);
  if (guard) {
    // 앞발로 얼굴 가리기
    for (const [px, py] of [[cx + 60, cy - 60], [cx + 96, cy - 50]]) {
      blob(gr, px, py + 18, 22, 26, 0xefe9dc);
      ell(gr, px, py + 24, 10, 9, 0x5a4a44); for (let i = 0; i < 3; i++) ell(gr, px - 10 + i * 10, py + 6, 4, 4, 0x5a4a44);
    }
  } else limb(gr, cx + 64, cy + 8, 18, 30, -0.3, 0xefe9dc);
  bake(gr, key, w, h);
}

function orca(scene, key) {
  const w = 270, h = 140, gr = g(scene), cx = 128, cy = 80;
  tri(gr, [cx - 96, cy, cx - 132, cy - 36, cx - 126, cy + 32], 0x1c2230);
  tri(gr, [cx - 20, cy - 34, cx + 4, cy - 76, cx + 18, cy - 34], 0x1c2230);
  blob(gr, cx, cy, 112, 40, 0x1f2535);
  ell(gr, cx + 20, cy + 20, 86, 16, 0xffffff);
  ell(gr, cx - 40, cy - 6, 26, 10, 0xd9e2ec, 0.9, -0.2);
  ell(gr, cx + 62, cy - 16, 18, 8, 0xffffff, 1, -0.15);
  gr.fillStyle(INK); gr.fillTriangle(cx + 70, cy + 6, cx + 112, cy + 2, cx + 102, cy + 18);
  gr.fillStyle(0xffffff); for (let i = 0; i < 5; i++) gr.fillTriangle(cx + 74 + i * 7, cy + 5.5, cx + 80 + i * 7, cy + 5, cx + 77 + i * 7, cy + 11);
  eye(gr, cx + 80, cy - 10, 5, true);
  limb(gr, cx + 20, cy + 22, 12, 30, 0.7, 0x1c2230);
  bake(gr, key, w, h);
}

/* ---------------- 친구들 ---------------- */
function crab(scene) {
  const w = 60, h = 44, gr = g(scene), cx = 30, cy = 28;
  for (let i = 0; i < 3; i++) { gr.lineStyle(3, INK); gr.beginPath(); gr.moveTo(cx - 8 - i * 5, cy + 6); gr.lineTo(cx - 16 - i * 5, cy + 14); gr.moveTo(cx + 8 + i * 5, cy + 6); gr.lineTo(cx + 16 + i * 5, cy + 14); gr.strokePath(); }
  blob(gr, cx - 20, cy - 8, 8, 7, 0xff6b5b); blob(gr, cx + 20, cy - 8, 8, 7, 0xff6b5b);
  blob(gr, cx, cy, 18, 12, 0xff6b5b);
  ell(gr, cx, cy - 4, 12, 4, 0xff9b8f, 0.8);
  gr.lineStyle(3, INK); gr.beginPath(); gr.moveTo(cx - 5, cy - 10); gr.lineTo(cx - 6, cy - 18); gr.moveTo(cx + 5, cy - 10); gr.lineTo(cx + 6, cy - 18); gr.strokePath();
  eye(gr, cx - 6, cy - 20, 4); eye(gr, cx + 6, cy - 20, 4);
  bake(gr, 'pet-crab', w, h);
}
function otter(scene) {
  const w = 84, h = 46, gr = g(scene), cx = 40, cy = 26;
  blob(gr, cx - 30, cy + 4, 14, 6, 0x7a5236, 0.3);
  blob(gr, cx, cy, 30, 14, 0x9b6a45);
  ell(gr, cx + 2, cy - 2, 20, 8, 0xe8cfa8);
  blob(gr, cx + 30, cy - 4, 14, 13, 0x9b6a45);
  ell(gr, cx + 34, cy - 1, 9, 7, 0xe8cfa8);
  ell(gr, cx + 40, cy - 3, 3, 2.5, INK);
  eye(gr, cx + 31, cy - 9, 3.2);
  blob(gr, cx + 4, cy - 12, 8, 6, 0xb99bd8);
  blob(gr, cx - 4, cy - 10, 4, 5, 0x9b6a45); blob(gr, cx + 12, cy - 10, 4, 5, 0x9b6a45);
  bake(gr, 'pet-otter', w, h);
}
function puffer(scene) {
  const w = 60, h = 60, gr = g(scene), cx = 30, cy = 30;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; tri(gr, [cx + Math.cos(a - 0.18) * 17, cy + Math.sin(a - 0.18) * 17, cx + Math.cos(a) * 27, cy + Math.sin(a) * 27, cx + Math.cos(a + 0.18) * 17, cy + Math.sin(a + 0.18) * 17], 0xf0b02a, 2); }
  blob(gr, cx, cy, 20, 19, 0xffd54a);
  ell(gr, cx + 2, cy + 7, 13, 8, 0xfff2b8);
  eye(gr, cx + 9, cy - 5, 4.5);
  ell(gr, cx + 17, cy + 4, 3, 2.5, 0xff7a6b);
  ell(gr, cx + 9, cy + 3, 4, 2.2, P.cheek, 0.8);
  bake(gr, 'pet-puffer', w, h);
}
function whale(scene) {
  const w = 104, h = 64, gr = g(scene), cx = 50, cy = 36;
  tri(gr, [cx - 36, cy - 2, cx - 52, cy - 18, cx - 50, cy + 10], 0x4b78d6);
  blob(gr, cx, cy, 38, 22, 0x5a8ce6);
  ell(gr, cx + 6, cy + 10, 28, 9, 0xcfe3ff);
  ell(gr, cx - 12, cy - 10, 14, 6, 0x8fb4f5, 0.8);
  eye(gr, cx + 22, cy - 4, 4.2);
  ell(gr, cx + 24, cy + 5, 4, 2.4, P.cheek, 0.8);
  gr.lineStyle(2.5, INK); gr.beginPath(); gr.arc(cx + 30, cy + 2, 5, 0.3, 2.4); gr.strokePath();
  limb(gr, cx + 4, cy + 10, 6, 12, 0.6, 0x4b78d6);
  bake(gr, 'pet-whale', w, h);
}
function clam(scene, key, open) {
  const w = 60, h = 48, gr = g(scene), cx = 30, cy = 30;
  blob(gr, cx, cy + 6, 24, 10, 0x9a73e6);
  if (open) {
    ell(gr, cx, cy + 2, 12, 7, 0xffd6ea);
    blob(gr, cx, cy - 1, 7, 7, P.pearl, 0, 2); ell(gr, cx - 2, cy - 3, 2.5, 2.5, 0xffffff);
    blob(gr, cx, cy - 12, 24, 10, 0xb28cff, 0);
  } else blob(gr, cx, cy - 1, 24, 11, 0xb28cff);
  for (let i = -2; i <= 2; i++) { gr.lineStyle(1.5, 0x8a64d6); gr.beginPath(); gr.moveTo(cx + i * 7, cy + (open ? -18 : -9)); gr.lineTo(cx + i * 9, cy + (open ? -6 : 4)); gr.strokePath(); }
  bake(gr, key, w, h);
}
function octopus(scene) {
  const w = 64, h = 66, gr = g(scene), cx = 32, cy = 26;
  for (let i = 0; i < 5; i++) { const x = cx - 18 + i * 9; gr.lineStyle(7 + 2, INK); gr.beginPath(); gr.moveTo(x, cy + 10); gr.lineTo(x + (i % 2 ? 4 : -4), cy + 26); gr.lineTo(x + (i % 2 ? -2 : 3), cy + 36); gr.strokePath(); }
  for (let i = 0; i < 5; i++) { const x = cx - 18 + i * 9; gr.lineStyle(7, 0xff7fb0); gr.beginPath(); gr.moveTo(x, cy + 10); gr.lineTo(x + (i % 2 ? 4 : -4), cy + 26); gr.lineTo(x + (i % 2 ? -2 : 3), cy + 36); gr.strokePath(); }
  blob(gr, cx, cy, 22, 20, 0xff7fb0);
  ell(gr, cx - 7, cy - 8, 8, 6, 0xffb3d1, 0.9);
  eye(gr, cx - 7, cy + 2, 4); eye(gr, cx + 7, cy + 2, 4);
  ell(gr, cx, cy + 11, 3, 2, INK);
  bake(gr, 'pet-octopus', w, h);
}
function dolphin(scene) {
  const w = 110, h = 58, gr = g(scene), cx = 52, cy = 32;
  tri(gr, [cx - 40, cy, cx - 56, cy - 14, cx - 54, cy + 12], 0x6fb1f0);
  tri(gr, [cx - 6, cy - 14, cx + 4, cy - 30, cx + 12, cy - 14], 0x6fb1f0);
  blob(gr, cx, cy, 42, 17, 0x8fc7ff);
  ell(gr, cx + 6, cy + 8, 32, 7, 0xe8f4ff);
  blob(gr, cx + 44, cy + 2, 12, 5, 0x8fc7ff, 0.1);
  eye(gr, cx + 26, cy - 4, 4);
  gr.lineStyle(2.5, INK); gr.beginPath(); gr.arc(cx + 38, cy, 7, 0.4, 1.9); gr.strokePath();
  limb(gr, cx + 6, cy + 8, 5, 12, 0.7, 0x6fb1f0);
  bake(gr, 'pet-dolphin', w, h);
}
function seahorse(scene) {
  const w = 46, h = 70, gr = g(scene), cx = 22;
  gr.lineStyle(11, INK); gr.beginPath(); gr.arc(cx - 2, 54, 7, -0.5, 3.6); gr.strokePath();
  gr.lineStyle(7, 0xffa64d); gr.beginPath(); gr.arc(cx - 2, 54, 7, -0.5, 3.6); gr.strokePath();
  blob(gr, cx + 2, 36, 10, 16, 0xffa64d);
  ell(gr, cx + 6, 38, 5, 11, 0xffd29a);
  blob(gr, cx + 2, 16, 10, 10, 0xffa64d);
  blob(gr, cx + 14, 18, 8, 3.5, 0xffa64d, 0.2);
  tri(gr, [cx - 4, 8, cx - 2, 0, cx + 3, 7], 0xff8a2a, 2);
  eye(gr, cx + 4, 14, 3.4);
  bake(gr, 'pet-seahorse', w, h);
}
function jelly(scene) {
  const w = 52, h = 70, gr = g(scene), cx = 26, cy = 22;
  for (let i = 0; i < 4; i++) { gr.lineStyle(3, 0xff9ad5, 0.9); gr.beginPath(); const x = cx - 12 + i * 8; gr.moveTo(x, cy + 8); gr.lineTo(x + 4, cy + 22); gr.lineTo(x - 3, cy + 34); gr.lineTo(x + 2, cy + 44); gr.strokePath(); }
  gr.fillStyle(INK); gr.fillPoints(ellPts(cx, cy, 21, 18).filter(p => p.y <= cy + 2), true);
  gr.fillStyle(0xffb3e6); gr.fillPoints(ellPts(cx, cy, 18, 15).filter(p => p.y <= cy + 1), true);
  ell(gr, cx - 6, cy - 6, 6, 4, 0xffffff, 0.7);
  eye(gr, cx - 6, cy - 2, 3); eye(gr, cx + 6, cy - 2, 3);
  bake(gr, 'pet-jelly', w, h);
}
function starfish(scene, key, color, lo) {
  const w = 50, h = 50, gr = g(scene), cx = 25, cy = 26;
  const pts = [];
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 22, a = -Math.PI / 2 + i * Math.PI / 5; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
  const big = pts.map(p => ({ x: cx + (p.x - cx) * 1.14, y: cy + (p.y - cy) * 1.14 }));
  gr.fillStyle(INK); gr.fillPoints(big, true);
  gr.fillStyle(color); gr.fillPoints(pts, true);
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; ell(gr, cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 2, 2, lo); }
  eye(gr, cx - 4, cy - 1, 2.6); eye(gr, cx + 4, cy - 1, 2.6);
  bake(gr, key, w, h);
}

/* ---------------- 먹이·코인·기타 ---------------- */
function krill(scene) {
  const gr = g(scene);
  gr.lineStyle(8, INK); gr.beginPath(); gr.arc(12, 6, 8, 0.4, 2.8); gr.strokePath();
  gr.lineStyle(5, 0xff8fa3); gr.beginPath(); gr.arc(12, 6, 8, 0.4, 2.8); gr.strokePath();
  ell(gr, 18, 10, 1.6, 1.6, INK);
  bake(gr, 'food-krill', 24, 18);
  const s = g(scene);
  s.lineStyle(10, INK); s.beginPath(); s.arc(14, 6, 10, 0.3, 2.7); s.strokePath();
  s.lineStyle(7, 0xff9447); s.beginPath(); s.arc(14, 6, 10, 0.3, 2.7); s.strokePath();
  tri(s, [3, 9, 0, 16, 7, 14], 0xff9447, 2);
  ell(s, 22, 12, 1.8, 1.8, INK);
  bake(s, 'food-shrimp', 28, 20);
  const f = g(scene);
  tri(f, [6, 10, 0, 3, 0, 17], 0x5f86c2, 2);
  blob(f, 18, 10, 13, 6.5, 0x7fa3d9, 0, 2);
  ell(f, 19, 13, 9, 2.5, 0xe8f0fa);
  for (let i = 0; i < 3; i++) { f.lineStyle(1.5, 0x3d5d94); f.beginPath(); f.moveTo(12 + i * 4, 5); f.lineTo(14 + i * 4, 9); f.strokePath(); }
  ell(f, 26, 8, 1.6, 1.6, INK);
  bake(f, 'food-mackerel', 34, 20);
}

function coin(scene, key, c, hi, lo, mark) {
  const w = 30, h = 30, gr = g(scene), cx = 15, cy = 15;
  gr.fillStyle(INK); gr.fillCircle(cx, cy, 13.5);
  gr.fillStyle(lo); gr.fillCircle(cx, cy, 11);
  gr.fillStyle(c); gr.fillCircle(cx - 0.8, cy - 0.8, 9.6);
  gr.lineStyle(1.5, lo); gr.strokeCircle(cx - 0.8, cy - 0.8, 7);
  star(gr, cx - 0.8, cy - 0.8, 5, 2.2, mark, lo);
  ell(gr, cx - 4, cy - 5, 3, 2, hi, 0.9, -0.6);
  bake(gr, key, w, h);
}
function pearl(scene) {
  const gr = g(scene);
  gr.fillStyle(INK); gr.fillCircle(13, 13, 12);
  gr.fillStyle(P.pearlLo); gr.fillCircle(13, 13, 9.6);
  gr.fillStyle(P.pearl); gr.fillCircle(12, 12, 8);
  ell(gr, 9, 9, 3, 2.2, 0xffffff, 1, -0.6);
  bake(gr, 'coin-pearl', 26, 26);
}
function diamond(scene) {
  const gr = g(scene), cx = 16;
  const outer = [{ x: cx - 13, y: 11 }, { x: cx - 7, y: 3 }, { x: cx + 7, y: 3 }, { x: cx + 13, y: 11 }, { x: cx, y: 29 }];
  gr.fillStyle(INK); gr.fillPoints(outer.map(p => ({ x: cx + (p.x - cx) * 1.2, y: 16 + (p.y - 16) * 1.2 })), true);
  gr.fillStyle(P.diamondLo); gr.fillPoints(outer, true);
  gr.fillStyle(P.diamond); gr.fillPoints([{ x: cx - 7, y: 3 }, { x: cx + 7, y: 3 }, { x: cx + 13, y: 11 }, { x: cx, y: 27 }, { x: cx - 13, y: 11 }].map((p, i) => i === 3 ? p : { x: p.x * 0.85 + cx * 0.15, y: p.y }), true);
  gr.fillStyle(0xffffff, 0.8); gr.fillTriangle(cx - 6, 5, cx - 1, 5, cx - 7, 11);
  bake(gr, 'coin-diamond', 32, 34);
}
function chest(scene) {
  const w = 48, h = 42, gr = g(scene);
  gr.fillStyle(INK); gr.fillRoundedRect(3, 14, 42, 26, 5);
  gr.fillStyle(P.wood); gr.fillRoundedRect(6, 17, 36, 20, 3);
  gr.fillStyle(INK); gr.fillRoundedRect(2, 4, 44, 16, 8);
  gr.fillStyle(P.woodLo); gr.fillRoundedRect(5, 7, 38, 11, 6);
  gr.fillStyle(P.gold); gr.fillRect(8, 16, 32, 4); gr.fillRect(21, 4, 6, 33);
  gr.fillStyle(INK); gr.fillRoundedRect(19, 18, 10, 10, 2); gr.fillStyle(P.goldHi); gr.fillRoundedRect(21, 20, 6, 6, 1);
  star(gr, 40, 7, 5, 2, 4, 0xffffff);
  bake(gr, 'coin-chest', w, h);
}
function goldEgg(scene, key, w, h, col = { lo: P.goldLo, main: P.gold, hi: P.goldHi, deco: true }) {
  const gr = g(scene), cx = w / 2, cy = h * 0.54, rx = w * 0.4, ry = h * 0.44;
  // 달걀 모양: 위가 좁음
  const pts = [];
  for (let i = 0; i < 40; i++) { const t = i / 40 * Math.PI * 2, y = Math.sin(t); pts.push({ x: cx + Math.cos(t) * rx * (y < 0 ? 0.82 + 0.18 * (1 + y) : 1), y: cy + y * ry }); }
  gr.fillStyle(INK); gr.fillPoints(pts.map(p => ({ x: cx + (p.x - cx) * (1 + 6 / w), y: cy + (p.y - cy) * (1 + 6 / h) })), true);
  gr.fillStyle(col.lo); gr.fillPoints(pts, true);
  gr.fillStyle(col.main); gr.fillPoints(pts.map(p => ({ x: cx - w * 0.03 + (p.x - cx) * 0.9, y: cy - h * 0.03 + (p.y - cy) * 0.9 })), true);
  ell(gr, cx - rx * 0.4, cy - ry * 0.45, rx * 0.22, ry * 0.18, col.hi, 0.95, -0.5);
  if (!col.deco) { bake(gr, key, w, h); return; }
  // 무늬
  gr.lineStyle(Math.max(2, w * 0.04), P.goldLo);
  gr.beginPath(); gr.moveTo(cx - rx * 0.9, cy + ry * 0.12);
  for (let i = 1; i <= 6; i++) gr.lineTo(cx - rx * 0.9 + i * rx * 0.3, cy + ry * (i % 2 ? 0.0 : 0.12));
  gr.strokePath();
  star(gr, cx + rx * 0.45, cy - ry * 0.55, w * 0.1, w * 0.035, 4, 0xffffff);
  bake(gr, key, w, h);
}
function smallThings(scene) {
  let gr = g(scene); gr.fillStyle(0xffffff); gr.fillCircle(8, 8, 8); bake(gr, 'dot', 16, 16);
  gr = g(scene); gr.lineStyle(2, 0xffffff, 0.9); gr.strokeCircle(9, 9, 7); gr.fillStyle(0xffffff, 0.25); gr.fillCircle(9, 9, 6); gr.fillStyle(0xffffff, 0.9); gr.fillCircle(6.5, 6.5, 2); bake(gr, 'bubble', 18, 18);
  gr = g(scene); star(gr, 12, 12, 11, 3.2, 4, 0xffffff); bake(gr, 'spark', 24, 24);
  gr = g(scene); gr.fillStyle(INK); gr.fillCircle(15, 15, 13); gr.fillStyle(0xdfeefa); gr.fillCircle(15, 15, 10.5); gr.fillStyle(0xffffff); gr.fillCircle(13, 13, 8.5); ell(gr, 10, 10, 3, 2, 0xffffff); bake(gr, 'snowball', 30, 30);
  gr = g(scene); gr.fillStyle(INK); gr.fillRoundedRect(3, 10, 18, 14, 3); gr.lineStyle(3.5, INK); gr.beginPath(); gr.arc(12, 10, 6, Math.PI, 0); gr.strokePath(); gr.fillStyle(0xffd23f); gr.fillRoundedRect(5.5, 12.5, 13, 9, 2); bake(gr, 'lock', 24, 26);
  gr = g(scene); ell(gr, 16, 16, 16, 16, 0xffffff, 1); bake(gr, 'puff', 32, 32);
  // 물음표 알 (아직 모르는 보상)
  gr = g(scene); gr.fillStyle(0xffffff, 0.18); gr.fillCircle(40, 40, 38); bake(gr, 'glow', 80, 80);
}

export function bakeAll(scene) {
  K = AS;
  for (const [name, look] of Object.entries(PENGUIN_LOOK)) {
    penguin(scene, `pg-${name}-a`, look, false);
    penguin(scene, `pg-${name}-b`, look, true);
  }
  skua(scene, 'pr-skua-a', false); skua(scene, 'pr-skua-b', true);
  seal(scene, 'pr-seal', { body: 0x98a3b3, dark: 0x7a8597, belly: 0xd9e1ea, spot: 0x5c6677 });
  shark(scene, 'pr-shark');
  K = 1;
  seal(scene, 'pr-bossSeal', { s: 1.45, body: 0x7d8799, dark: 0x5f6979, belly: 0xc9d2de, spot: 0x444d5c, crown: true, scar: true });
  bear(scene, 'pr-bossBear', false); bear(scene, 'pr-bossBear-guard', true);
  orca(scene, 'pr-bossOrca');
  K = AS;
  crab(scene); otter(scene); puffer(scene); whale(scene); clam(scene, 'pet-clam', false); clam(scene, 'pet-clam-open', true);
  octopus(scene); dolphin(scene); seahorse(scene); jelly(scene);
  starfish(scene, 'pet-starfish', 0xffc93c, 0xe09a00);
  krill(scene);
  coin(scene, 'coin-silver', P.silver, P.silverHi, P.silverLo, 4);
  coin(scene, 'coin-gold', P.gold, P.goldHi, P.goldLo, 5);
  pearl(scene); diamond(scene); chest(scene);
  goldEgg(scene, 'coin-egg', 34, 42);
  goldEgg(scene, 'pg-egg', 22, 28, { lo: 0xd9cdb8, main: 0xfff8ea, hi: 0xffffff, deco: false });
  K = 1;
  goldEgg(scene, 'egg-big', 120, 148);
  smallThings(scene);
}

// 화면에서 쓰는 텍스처 이름
export function penguinKey(p, flap) {
  const name = p.kind === 'gentoo' ? `gentoo-${p.stage}` : p.kind;
  return `pg-${name}-${flap ? 'b' : 'a'}`;
}
export const FOOD_KEYS = ['food-krill', 'food-shrimp', 'food-mackerel'];
