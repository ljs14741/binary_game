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
  chinstrap: { size: 60, body: 0x3a4459, hi: 0x5f6c88, belly: 0xffffff, face: 0xffffff, strap: true, bag: true, eye: 0.09, beak: 0x2b2f3d, beakLen: 0.15, flipper: 0x2a3244 },
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
  if (o.strap) {
    // 턱끈펭귄: 머리 꼭대기만 검고 얼굴 전체가 하얌 + 굵은 턱끈
    ell(gr, cx + rx * 0.28, cy - ry * 0.4, rx * 0.74, ry * 0.42, o.face);
    gr.lineStyle(Math.max(2.4, S * 0.05), INK);
    gr.beginPath(); gr.arc(cx + rx * 0.36, cy - ry * 0.66, rx * 0.62, 0.3, 2.45); gr.strokePath();
  } else if (o.face) ell(gr, cx + rx * 0.4, cy - ry * 0.46, rx * 0.55, ry * 0.36, o.face);
  if (o.patch) { ell(gr, cx + rx * 0.02, cy - ry * 0.46, rx * 0.22, ry * 0.15, o.patch, 1, 0.9); ell(gr, cx + rx * 0.25, cy - ry * 0.22, rx * 0.3, ry * 0.1, o.patch, 0.7, 0.2); }
  if (o.brow) ell(gr, cx + rx * 0.28, cy - ry * 0.72, rx * 0.42, ry * 0.11, 0xffffff, 1, -0.25);
  // 코인 가방 (코인 줍는 펭귄 표시)
  if (o.bag) {
    const bw = S * 0.34, bh = S * 0.25, bx = cx + rx * 0.05, by = cy + ry * 0.3;
    gr.lineStyle(Math.max(4, S * 0.075), INK); gr.beginPath(); gr.moveTo(cx - rx * 0.7, cy - ry * 0.5); gr.lineTo(bx + bw * 0.5, by + 2); gr.strokePath();
    gr.lineStyle(Math.max(2.2, S * 0.042), 0xb06a2c); gr.beginPath(); gr.moveTo(cx - rx * 0.7, cy - ry * 0.5); gr.lineTo(bx + bw * 0.5, by + 2); gr.strokePath();
    gr.fillStyle(INK); gr.fillRoundedRect(bx - 2.5, by - 2.5, bw + 5, bh + 5, 6);
    gr.fillStyle(0xc9843f); gr.fillRoundedRect(bx, by, bw, bh, 4);
    gr.fillStyle(0xa0632b); gr.fillRoundedRect(bx, by, bw, bh * 0.4, { tl: 4, tr: 4, bl: 0, br: 0 });
    const cr = S * 0.065;
    gr.fillStyle(INK); gr.fillCircle(bx + bw / 2, by + bh * 0.62, cr + 1.5);
    gr.fillStyle(P.gold); gr.fillCircle(bx + bw / 2, by + bh * 0.62, cr);
    gr.fillStyle(P.goldHi); gr.fillCircle(bx + bw / 2 - cr * 0.3, by + bh * 0.62 - cr * 0.3, cr * 0.35);
  }

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
// 조절점을 부드럽게 잇는 곡선 (캣멀롬)
function spline(ctrl, n = 6, closed = true) {
  const m = ctrl.length, out = [];
  const at = i => closed ? ctrl[(i + m) % m] : ctrl[Math.max(0, Math.min(m - 1, i))];
  for (let i = 0; i < (closed ? m : m - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = j => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
      out.push({ x: f(0), y: f(1) });
    }
  }
  if (!closed) out.push({ x: ctrl[m - 1][0], y: ctrl[m - 1][1] });
  return out;
}
// 외곽선 있는 곡선 도형
function shape(gr, ctrl, color, line = LINE, alpha = 1) {
  const pts = spline(ctrl);
  if (line) { gr.lineStyle(line * 2, INK); gr.strokePoints(pts, true, true); }
  gr.fillStyle(color, alpha); gr.fillPoints(pts, true);
}
function curve(gr, ctrl, width, color, alpha = 1) { gr.lineStyle(width, color, alpha); gr.strokePoints(spline(ctrl, 6, false), false); }
// (x0,y0)→(x1,y1) 을 따라 이빨 n개. dir 1 = 아래로, -1 = 위로
function teeth(gr, x0, y0, x1, y1, n, len, dir = 1) {
  gr.fillStyle(0xffffff);
  const step = 1 / n;
  for (let i = 0; i < n; i++) {
    const a = i * step, b = (i + 1) * step, m = (a + b) / 2;
    gr.fillTriangle(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b, x0 + (x1 - x0) * m, y0 + (y1 - y0) * m + len * dir);
  }
}
// 벌린 입 (안쪽 빨강 + 위아래 이빨)
function jaws(gr, poly, up, lo) {
  shape(gr, poly, 0x8c2a3f, 2);
  teeth(gr, ...up);
  if (lo) teeth(gr, ...lo);
}
// 눈꺼풀을 반쯤 내려 째려보는 눈 (범고래)
function lid(gr, x, y, r, color) {
  gr.fillStyle(color);
  gr.fillPoints(ellPts(x, y, r + 1.6, r + 1.6).filter(p => p.y < y - r * 0.15), true);
  gr.lineStyle(2.5, INK); gr.beginPath(); gr.moveTo(x - r * 1.2, y - r * 0.15); gr.lineTo(x + r * 1.2, y - r * 0.15); gr.strokePath();
}

function skua(scene, key, up) {
  const w = 120, h = 100, gr = g(scene), cx = 56, cy = 58;
  const brown = 0x7a5a44, dark = 0x5a4131, lite = 0xcdb094;
  const wingUp = [[6, -6], [-6, -26], [-26, -44], [-46, -54], [-38, -36], [-22, -16], [-8, -2]];
  const wingDn = [[6, -4], [-8, 10], [-26, 26], [-48, 36], [-38, 20], [-22, 4], [-8, -8]];
  const wing = (pts, dx, dy, col) => shape(gr, pts.map(([x, y]) => [cx + x + dx, cy + y + dy]), col);
  // 먼 쪽 날개
  wing(up ? wingUp : wingDn, 10, up ? 4 : -2, dark);
  // 꼬리
  shape(gr, [[cx - 24, cy - 4], [cx - 44, cy - 10], [cx - 48, cy], [cx - 44, cy + 8], [cx - 24, cy + 6]], dark);
  // 몸·배
  shape(gr, [[cx + 22, cy - 10], [cx + 6, cy - 16], [cx - 18, cy - 12], [cx - 32, cy], [cx - 18, cy + 13], [cx + 8, cy + 15], [cx + 24, cy + 6]], brown);
  shape(gr, [[cx + 18, cy + 4], [cx + 4, cy + 12], [cx - 16, cy + 10], [cx - 8, cy + 4], [cx + 8, cy + 2]], lite, 0);
  // 머리 + 갈고리 부리
  blob(gr, cx + 28, cy - 12, 15, 13.5, brown);
  ell(gr, cx + 22, cy - 20, 8, 4, 0xffffff, 0.22, -0.4);
  shape(gr, [[cx + 40, cy - 17], [cx + 56, cy - 14], [cx + 62, cy - 8], [cx + 57, cy - 6], [cx + 40, cy - 8]], 0x2e2d33, 2);
  eye(gr, cx + 32, cy - 16, 5.5, true);
  // 가까운 날개 + 끝의 흰 무늬 (도둑갈매기 표시)
  const near = up ? wingUp : wingDn;
  wing(near, 0, 0, brown);
  const [tx, ty] = near[3];
  ell(gr, cx + tx * 0.62, cy + ty * 0.62, 7, 3.5, 0xffffff, 0.95, Math.atan2(ty, tx));
  bake(gr, key, w, h);
}

// 표범물범: 펭귄을 실제로 사냥하는 물범. 길쭉한 몸, 크게 찢어진 입, 얼룩무늬
function leopardSeal(scene, key) {
  const w = 170, h = 92, gr = g(scene);
  const back = 0x59657a, dark = 0x434f64, belly = 0xcbd4df;
  shape(gr, [[26, 46], [10, 30], [3, 33], [8, 46], [3, 60], [10, 64], [26, 52]], dark);
  shape(gr, [[163, 47], [155, 34], [136, 26], [114, 29], [88, 31], [58, 36], [34, 42], [22, 47], [34, 56], [62, 64], [96, 68], [126, 64], [148, 58]], back);
  shape(gr, [[150, 53], [128, 60], [98, 65], [64, 62], [38, 55], [30, 50], [56, 53], [92, 56], [124, 53]], belly, 0);
  for (const [x, y, r] of [[48, 43, 3.2], [66, 38, 2.6], [82, 36, 3], [100, 34, 2.4], [60, 46, 2], [114, 33, 2.2], [36, 46, 2]]) ell(gr, x, y, r * 1.3, r, 0x8592a8, 0.9);
  for (const [x, y, r] of [[60, 58, 3.4], [78, 61, 2.8], [96, 60, 3.2], [114, 58, 2.6], [130, 56, 2.4], [46, 54, 2.2], [88, 64, 2]]) ell(gr, x, y, r * 1.2, r, 0x39435a, 0.85);
  ell(gr, 98, 35, 34, 3.5, 0xffffff, 0.2, -0.03);
  jaws(gr, [[162, 47], [146, 47], [128, 44], [133, 52], [148, 56], [158, 52]], [158, 47.5, 134, 45.5, 5, 4.5, 1], [155, 53, 139, 52, 3, 3.5, -1]);
  ell(gr, 146, 53, 6, 2, 0xe0607a);
  curve(gr, [[163, 46], [146, 46.5], [126, 42]], 3, INK);
  ell(gr, 157, 38, 2.2, 1.5, INK);
  eye(gr, 136, 35, 6, true);
  shape(gr, [[112, 58], [100, 76], [89, 85], [85, 80], [95, 64], [103, 56]], dark);
  bake(gr, key, w, h);
}

function shark(scene, key) {
  const w = 186, h = 104, gr = g(scene);
  const back = 0x5d7995, fin = 0x4a6482, belly = 0xf1f5fa;
  shape(gr, [[48, 50], [26, 28], [12, 9], [22, 13], [44, 42]], fin);
  shape(gr, [[48, 56], [28, 72], [15, 86], [26, 82], [46, 62]], fin);
  shape(gr, [[92, 40], [104, 16], [112, 4], [118, 8], [118, 24], [126, 40]], fin);
  shape(gr, [[60, 45], [58, 34], [66, 37], [72, 45]], fin);
  shape(gr, [[66, 62], [62, 74], [74, 65]], fin);
  shape(gr, [[178, 58], [166, 44], [140, 36], [108, 34], [78, 38], [52, 46], [38, 54], [52, 62], [82, 70], [118, 72], [150, 68], [170, 63]], back);
  shape(gr, [[170, 61], [150, 66], [118, 70], [84, 68], [56, 61], [48, 56], [80, 58], [118, 59], [150, 57]], belly, 0);
  ell(gr, 110, 40, 36, 3.5, 0xffffff, 0.22);
  for (const x of [128, 134, 140]) curve(gr, [[x, 46], [x - 3, 53], [x, 60]], 2.2, 0x3f5570);
  for (const [x, y] of [[86, 44], [92, 43], [98, 43]]) curve(gr, [[x, y], [x + 5, y + 8]], 2, 0xdfe8f2, 0.8);
  jaws(gr, [[173, 60], [158, 62], [144, 59], [150, 67], [164, 69], [170, 65]], [170, 60.5, 148, 60, 5, 4.5, 1], [166, 67, 152, 67, 3, 3.5, -1]);
  ell(gr, 172, 50, 2, 1.3, INK);
  eye(gr, 154, 46, 5.5, true);
  shape(gr, [[122, 64], [108, 84], [96, 96], [93, 90], [103, 74], [111, 62]], fin);
  bake(gr, key, w, h);
}

// 대왕 바다코끼리 (Lv5 보스): 왕관 + 긴 엄니 + 콧수염
function walrus(scene, key) {
  const w = 250, h = 160, gr = g(scene);
  const skin = 0xb98166, dark = 0x93604a, lite = 0xdcae92, fold = 0x8a5641;
  shape(gr, [[48, 108], [20, 94], [9, 100], [22, 113], [9, 126], [20, 133], [50, 120]], dark);
  shape(gr, [[40, 112], [60, 84], [96, 66], [140, 60], [176, 64], [200, 82], [206, 110], [190, 132], [150, 142], [100, 142], [62, 134]], skin);
  shape(gr, [[62, 128], [100, 138], [150, 138], [184, 128], [168, 124], [130, 128], [92, 126]], lite, 0, 0.85);
  for (let i = 0; i < 3; i++) curve(gr, [[152 - i * 18, 68 + i * 2], [146 - i * 18, 96], [152 - i * 18, 124]], 3, fold, 0.75);
  for (const [x, y] of [[80, 92], [104, 100], [70, 110], [120, 84], [96, 116]]) ell(gr, x, y, 2.2, 2, fold, 0.6);
  ell(gr, 110, 76, 38, 6, 0xffffff, 0.22, -0.15);
  // 머리
  shape(gr, [[168, 72], [180, 46], [204, 34], [228, 42], [238, 64], [234, 90], [214, 104], [186, 100], [170, 88]], skin);
  ell(gr, 196, 44, 16, 6, 0xffffff, 0.22, -0.3);
  // 엄니 (콧수염 밑에서 나옴)
  shape(gr, [[201, 96], [212, 96], [210, 128], [206, 148], [202, 130]], 0xfff4dc, 2.5);
  shape(gr, [[219, 94], [230, 94], [229, 126], [227, 146], [222, 126]], 0xfff4dc, 2.5);
  curve(gr, [[209, 104], [207, 128]], 2, 0xe6d3b0);
  curve(gr, [[227, 102], [226, 126]], 2, 0xe6d3b0);
  // 콧수염 패드 + 수염
  blob(gr, 206, 90, 16, 12, lite);
  blob(gr, 224, 86, 16, 12, lite);
  for (const [x, y] of [[200, 88], [206, 94], [212, 88], [220, 84], [226, 90], [232, 84]]) ell(gr, x, y, 1.6, 1.6, fold);
  for (const dy of [-4, 2, 8]) curve(gr, [[236, 86 + dy * 0.5], [246, 84 + dy]], 1.8, INK, 0.8);
  ell(gr, 232, 74, 3, 2, INK); ell(gr, 222, 76, 2.6, 1.8, INK);
  // 눈 + 흉터
  eye(gr, 212, 56, 6.5, true);
  eye(gr, 192, 58, 5, true);
  gr.lineStyle(3, 0xfff1e6, 0.9); gr.beginPath(); gr.moveTo(206, 42); gr.lineTo(220, 68); gr.strokePath();
  // 왕관
  const px = 186, py = 20, cw = 40;
  gr.fillStyle(INK); gr.fillRect(px - 2, py - 2, cw + 4, 16);
  gr.fillStyle(P.gold); gr.fillRect(px, py, cw, 12);
  for (let i = 0; i < 3; i++) tri(gr, [px + i * cw / 3, py + 1, px + (i + 0.5) * cw / 3, py - 12, px + (i + 1) * cw / 3, py + 1], P.gold, 2);
  gr.fillStyle(P.goldHi); gr.fillRect(px + 2, py + 2, cw - 4, 3);
  ell(gr, px + cw / 2, py + 7, 3.5, 3.5, P.bad);
  // 앞지느러미
  shape(gr, [[168, 120], [160, 144], [150, 152], [146, 146], [154, 128], [160, 116]], dark);
  bake(gr, key, w, h);
}

// 북극곰 (Lv10 보스): 얼음 왕관, 헤엄치는 다리. guard = 앞발로 얼굴 가리기
function bear(scene, key, guard) {
  const w = 250, h = 186, gr = g(scene);
  const fur = 0xf6f2ea, shade = 0xdcd2c0, pad = 0x4b3f3c;
  shape(gr, [[40, 120], [30, 150], [42, 162], [62, 158], [64, 126]], shade);
  shape(gr, [[132, 128], [128, 156], [140, 168], [160, 164], [158, 130]], shade);
  shape(gr, [[20, 104], [34, 72], [70, 56], [118, 52], [156, 58], [176, 76], [178, 112], [160, 136], [110, 146], [60, 142], [28, 128]], fur);
  shape(gr, [[40, 130], [80, 140], [130, 140], [166, 126], [150, 122], [100, 130], [60, 126]], shade, 0, 0.9);
  for (const [x, y] of [[50, 76], [74, 64], [98, 60], [122, 60], [60, 96], [90, 90], [120, 96]]) curve(gr, [[x, y], [x + 5, y + 6], [x + 3, y + 12]], 2.2, shade);
  ell(gr, 90, 66, 40, 6, 0xffffff, 0.8, -0.05);
  shape(gr, [[58, 124], [52, 156], [66, 170], [88, 166], [84, 128]], fur);
  ell(gr, 72, 165, 10, 3.5, pad);
  if (!guard) { shape(gr, [[150, 116], [166, 146], [186, 158], [198, 150], [178, 120]], fur); ell(gr, 190, 153, 8, 4, pad, 1, 0.6); }
  // 귀·머리
  blob(gr, 166, 36, 9, 9, fur); ell(gr, 166, 36, 4.5, 4.5, shade);
  blob(gr, 210, 30, 9, 9, fur); ell(gr, 210, 30, 4.5, 4.5, shade);
  shape(gr, [[150, 66], [158, 42], [186, 28], [214, 32], [230, 48], [244, 64], [240, 80], [214, 88], [180, 90], [156, 84]], fur);
  ell(gr, 226, 72, 15, 9, shade, 0.7);
  blob(gr, 240, 63, 6, 5, pad, 0, 2); ell(gr, 238, 61, 2, 1.4, 0xffffff, 0.8);
  curve(gr, [[238, 76], [228, 83], [214, 80]], 3, INK);
  tri(gr, [224, 81, 228, 81, 226, 87], 0xffffff, 0);
  // 얼음 왕관
  for (const [bx, tip, bw] of [[176, 12, 10], [190, 3, 12], [204, 12, 10]]) {
    shape(gr, [[bx - bw / 2, 32], [bx, tip], [bx + bw / 2, 32]], 0xbfeeff, 2);
    tri(gr, [bx - 1, tip + 6, bx + 2, 28, bx - 3, 28], 0xffffff, 0);
  }
  if (guard) {
    for (const [px, py, rw, rh] of [[204, 54, 22, 26], [230, 66, 20, 24]]) {
      blob(gr, px, py, rw, rh, fur);
      ell(gr, px, py + 6, rw * 0.45, rh * 0.32, pad);
      for (let i = 0; i < 3; i++) ell(gr, px - rw * 0.45 + i * rw * 0.45, py - rh * 0.4, 3.6, 3.6, pad);
    }
  } else {
    eye(gr, 206, 50, 7, true);
    eye(gr, 186, 52, 5.5, true);
    gr.lineStyle(3, 0xd89a9a, 0.9); gr.beginPath(); gr.moveTo(198, 38); gr.lineTo(214, 62); gr.strokePath();
  }
  bake(gr, key, w, h);
}

// 범고래 (Lv15 보스): 눈 뒤 흰 무늬, 회색 안장 무늬, 높은 등지느러미, 째려보는 눈
function orca(scene, key) {
  const w = 290, h = 156, gr = g(scene);
  const body = 0x1c2232, fin = 0x161b28;
  shape(gr, [[62, 86], [40, 68], [14, 56], [11, 62], [30, 76], [50, 90]], fin);
  shape(gr, [[62, 92], [40, 108], [14, 120], [11, 114], [30, 100], [50, 90]], fin);
  shape(gr, [[150, 62], [158, 34], [168, 7], [176, 9], [180, 36], [194, 60]], fin);
  shape(gr, [[280, 94], [268, 76], [242, 62], [206, 56], [166, 56], [124, 62], [88, 72], [60, 84], [56, 90], [62, 96], [88, 106], [132, 116], [192, 118], [240, 112], [268, 104]], body);
  shape(gr, [[272, 99], [252, 107], [214, 113], [172, 114], [132, 110], [110, 102], [96, 88], [118, 91], [140, 100], [180, 104], [222, 102], [258, 97]], 0xffffff, 0);
  ell(gr, 152, 64, 24, 6, 0xaab6c6, 0.95, -0.1);
  ell(gr, 204, 63, 40, 4, 0x4a5570, 0.9, 0.05);
  ell(gr, 226, 74, 17, 7.5, 0xffffff, 1, -0.2);
  jaws(gr, [[280, 95], [262, 98], [246, 96], [252, 104], [268, 105], [277, 100]], [277, 95.5, 250, 96.5, 6, 4.5, 1], [270, 103, 256, 103, 3, 3.5, -1]);
  eye(gr, 246, 85, 5, true);
  lid(gr, 246, 85, 5, body);
  for (const [x, y] of [[120, 76], [128, 72], [136, 70]]) curve(gr, [[x, y], [x + 6, y + 10]], 2, 0x5a6680, 0.9);
  shape(gr, [[214, 108], [206, 132], [196, 142], [188, 138], [194, 116], [200, 106]], fin);
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
  leopardSeal(scene, 'pr-seal');
  shark(scene, 'pr-shark');
  K = 1;
  walrus(scene, 'pr-bossSeal');
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
