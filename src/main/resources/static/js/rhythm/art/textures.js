/* 코드로 그려서 텍스처로 굽는다. 나중에 PNG로 바꾸려면 같은 키로 로드만 하면 된다.
 * 모든 텍스처 키와 크기는 여기서만 정의한다.
 */
import { INK, LINE, P } from './palette.js';
import { DPR } from './dpr.js';

export const BRICK_W = 56, BRICK_H = 32;
export const GLASS_W = 44, GLASS_H = 44, CHIM_W = 40, CHIM_H = 26, PLANK_W = 150, PLANK_H = 26;

function g(scene) { return scene.make.graphics({ x: 0, y: 0, add: false }); }
function bake(gr, key, w, h) {
  gr.setScale(DPR);
  gr.generateTexture(key, Math.round(w * DPR), Math.round(h * DPR));
  gr.scene.textures.get(key).source[0].resolution = DPR;   // 렌더러가 1/DPR 로 그려 논리 크기 유지
  gr.destroy();
}

function brick(scene, key, tint) {
  const gr = g(scene), w = BRICK_W, h = BRICK_H;
  gr.fillStyle(INK); gr.fillRoundedRect(0, 0, w, h, 5);
  gr.fillStyle(tint); gr.fillRoundedRect(LINE / 2, LINE / 2, w - LINE, h - LINE, 4);
  gr.fillStyle(P.brickHi, 0.55); gr.fillRoundedRect(LINE, LINE, w - LINE * 2, 6, 3);
  gr.fillStyle(P.brickLo, 0.5); gr.fillRoundedRect(LINE, h - LINE - 6, w - LINE * 2, 6, 3);
  bake(gr, key, w, h);
}

function chip(scene) {
  const gr = g(scene);
  gr.fillStyle(P.brick); gr.fillRect(0, 0, 10, 8);
  gr.fillStyle(P.brickHi, 0.6); gr.fillRect(0, 0, 10, 3);
  bake(gr, 'chip', 10, 8);
  const d = g(scene);
  d.fillStyle(0xffffff, 1); d.fillCircle(16, 16, 16);
  bake(d, 'dust', 32, 32);
}

function bot(scene) {
  // 몸통 100x90
  let gr = g(scene);
  gr.fillStyle(INK); gr.fillRoundedRect(0, 0, 100, 90, 18);
  gr.fillStyle(P.bot); gr.fillRoundedRect(LINE / 2, LINE / 2, 100 - LINE, 90 - LINE, 16);
  gr.fillStyle(P.botHi, 0.6); gr.fillRoundedRect(10, 8, 80, 14, 7);
  gr.fillStyle(P.botLo); gr.fillRoundedRect(LINE / 2, 62, 100 - LINE, 12, 4);
  gr.fillStyle(INK); gr.fillRoundedRect(38, 60, 24, 16, 4);
  gr.fillStyle(P.hammerHi); gr.fillRoundedRect(42, 64, 16, 8, 2);
  bake(gr, 'bot-body', 100, 90);
  // 머리 110x84 (LED 패널 포함)
  gr = g(scene);
  gr.fillStyle(INK); gr.fillRoundedRect(0, 0, 110, 84, 20);
  gr.fillStyle(P.bot); gr.fillRoundedRect(LINE / 2, LINE / 2, 110 - LINE, 84 - LINE, 18);
  gr.fillStyle(INK); gr.fillRoundedRect(14, 20, 82, 50, 10);
  gr.fillStyle(P.led); gr.fillRoundedRect(17, 23, 76, 44, 8);
  bake(gr, 'bot-head', 110, 84);
  // 안전모 124x50
  gr = g(scene);
  gr.fillStyle(INK); gr.fillRoundedRect(0, 26, 124, 22, 10);
  gr.fillStyle(INK); gr.fillEllipse(62, 30, 100, 60);
  gr.fillStyle(P.helmet); gr.fillEllipse(62, 30, 100 - LINE * 2, 60 - LINE * 2);
  gr.fillStyle(P.helmetLo); gr.fillRoundedRect(LINE, 30, 124 - LINE * 2, 14, 6);
  gr.fillStyle(0xffffff, 0.5); gr.fillEllipse(42, 16, 30, 12);
  bake(gr, 'bot-helmet', 124, 50);
  // 다리 2개 (한 텍스처) 90x30
  gr = g(scene);
  for (const x of [8, 52]) { gr.fillStyle(INK); gr.fillRoundedRect(x, 0, 30, 30, 8); gr.fillStyle(P.botLo); gr.fillRoundedRect(x + LINE / 2, LINE / 2, 30 - LINE, 30 - LINE, 6); }
  bake(gr, 'bot-legs', 90, 30);
  // 팔 + 해머 (원점: 어깨 = (20, 20)). 220x140
  gr = g(scene);
  gr.lineStyle(22, INK); gr.beginPath(); gr.moveTo(20, 20); gr.lineTo(150, 40); gr.strokePath();
  gr.lineStyle(14, P.bot); gr.beginPath(); gr.moveTo(20, 20); gr.lineTo(150, 40); gr.strokePath();
  gr.fillStyle(INK); gr.fillCircle(20, 20, 14); gr.fillStyle(P.botLo); gr.fillCircle(20, 20, 9);
  gr.lineStyle(16, INK); gr.beginPath(); gr.moveTo(150, 40); gr.lineTo(150, 130); gr.strokePath();
  gr.lineStyle(9, P.handle); gr.beginPath(); gr.moveTo(150, 44); gr.lineTo(150, 128); gr.strokePath();
  gr.fillStyle(INK); gr.fillRoundedRect(112, 92, 100, 46, 10);
  gr.fillStyle(P.hammerHead); gr.fillRoundedRect(112 + LINE / 2, 92 + LINE / 2, 100 - LINE, 46 - LINE, 8);
  gr.fillStyle(P.hammerHi, 0.7); gr.fillRoundedRect(118, 96, 88, 10, 5);
  gr.fillStyle(P.hammerLo, 0.7); gr.fillRoundedRect(118, 124, 88, 9, 4);
  bake(gr, 'bot-arm', 220, 140);
  // LED 얼굴들 76x44, 6x4 도트 매트릭스
  const faces = {
    idle:  ['......', '.o..o.', '......', '.oooo.'],
    focus: ['......', 'oo..oo', '......', '..oo..'],
    happy: ['......', 'o.o.o.', '......', 'o....o'],
    ouch:  ['o....o', '.o..o.', '......', '.oooo.'],
    dizzy: ['o.o.o.', '.o.o.o', '......', '.o.o..'],
    proud: ['......', '.o..o.', '......', 'oooooo']
  };
  faces.happy = ['......', '.o..o.', '......', 'o....o'];
  for (const [name, rows] of Object.entries(faces)) {
    gr = g(scene);
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      gr.fillStyle(ch === 'o' ? P.ledOn : P.ledOff, ch === 'o' ? 1 : 0.5);
      gr.fillRoundedRect(4 + c * 12, 4 + r * 10, 8, 7, 2);
    }));
    bake(gr, 'face-' + name, 76, 44);
  }
}

function environment(scene) {
  // 벽지 타일 128x128 (세로 줄무늬 + 얼룩)
  let gr = g(scene);
  gr.fillStyle(P.wallpaper); gr.fillRect(0, 0, 128, 128);
  gr.fillStyle(P.wallpaperStripe, 0.5); for (let x = 0; x < 128; x += 32) gr.fillRect(x, 0, 12, 128);
  gr.fillStyle(P.wallpaperDark, 0.5); gr.fillEllipse(96, 100, 60, 30); gr.fillEllipse(30, 30, 40, 26);
  bake(gr, 'wallpaper', 128, 128);
  // 바닥 판자 타일 128x64
  gr = g(scene);
  gr.fillStyle(P.floor); gr.fillRect(0, 0, 128, 64);
  gr.fillStyle(P.floorDark, 0.6); gr.fillRect(0, 30, 128, 4); gr.fillRect(64, 0, 4, 32); gr.fillRect(20, 32, 4, 32);
  gr.fillStyle(P.floorLine, 0.5); gr.fillRect(0, 0, 128, 3); gr.fillRect(0, 61, 128, 3);
  bake(gr, 'floor', 128, 64);
  // 분필 X 표시 48x48
  gr = g(scene);
  gr.lineStyle(7, P.chalk, 1); gr.beginPath(); gr.moveTo(8, 8); gr.lineTo(40, 40); gr.moveTo(40, 8); gr.lineTo(8, 40); gr.strokePath();
  bake(gr, 'chalk', 48, 48);
  // 확성기 아이콘 64x64 (시범 소리가 나오는 곳 표시)
  gr = g(scene);
  gr.fillStyle(INK); gr.fillRoundedRect(4, 22, 24, 20, 4); gr.fillTriangle(24, 12, 24, 52, 56, 60); gr.fillTriangle(24, 12, 56, 4, 56, 60);
  gr.fillStyle(P.accent); gr.fillRoundedRect(7, 25, 18, 14, 3); gr.fillTriangle(27, 16, 27, 48, 52, 55); gr.fillTriangle(27, 16, 52, 9, 52, 55);
  gr.fillStyle(0xffffff, 0.5); gr.fillTriangle(29, 18, 29, 30, 48, 14);
  bake(gr, 'megaphone', 64, 64);
  // 목숨 아이콘: 하트 40x36. (처음엔 안전모였는데 공사장 세계관을 걷어내면서 바꿨다.
  // 원 두 개 + 아래로 향한 삼각형 = 하트. 잉크 외곽선은 같은 도형을 LINE 만큼 크게 먼저 깐다.)
  gr = g(scene);
  const heart = (cx, cy, r, col) => {
    gr.fillStyle(col);
    gr.fillCircle(cx - r * 0.5, cy - r * 0.35, r * 0.55);
    gr.fillCircle(cx + r * 0.5, cy - r * 0.35, r * 0.55);
    gr.fillTriangle(cx - r * 1.02, cy - r * 0.2, cx + r * 1.02, cy - r * 0.2, cx, cy + r * 0.85);
  };
  heart(20, 18, 17, INK);
  heart(20, 18, 17 - LINE * 0.9, P.miss);
  gr.fillStyle(0xffffff, 0.55); gr.fillEllipse(13, 11, 8, 5);
  bake(gr, 'life', 40, 36);
  // 흰 원(링/버튼용) 64x64, 흰 사각 8x8
  gr = g(scene); gr.lineStyle(6, 0xffffff, 1); gr.strokeCircle(32, 32, 28); bake(gr, 'ring', 64, 64);
  gr = g(scene); gr.fillStyle(0xffffff); gr.fillRect(0, 0, 8, 8); bake(gr, 'px', 8, 8);
}

function extras(scene) {
  // 유리 조각 44x44
  for (const [key, tint] of [['glass-a', 0xbfe9ff], ['glass-b', 0xa9dcf5]]) {
    const gr = g(scene);
    gr.fillStyle(0x5a7d96); gr.fillRoundedRect(0, 0, GLASS_W, GLASS_H, 3);
    gr.fillStyle(tint, 0.9); gr.fillRoundedRect(3, 3, GLASS_W - 6, GLASS_H - 6, 2);
    gr.fillStyle(0xffffff, 0.55); gr.fillTriangle(6, 30, 30, 6, 38, 6); gr.fillTriangle(6, 38, 6, 30, 14, 38);
    bake(gr, key, GLASS_W, GLASS_H);
  }
  // 굴뚝 벽돌 40x26 (어두운 적갈색)
  for (const [key, tint] of [['chim-a', 0x9a4a3a], ['chim-b', 0x8a4034], ['chim-c', 0xa8563f]]) {
    const gr = g(scene);
    gr.fillStyle(INK); gr.fillRoundedRect(0, 0, CHIM_W, CHIM_H, 4);
    gr.fillStyle(tint); gr.fillRoundedRect(LINE / 2, LINE / 2, CHIM_W - LINE, CHIM_H - LINE, 3);
    gr.fillStyle(0xffffff, 0.15); gr.fillRoundedRect(LINE, LINE, CHIM_W - LINE * 2, 5, 2);
    bake(gr, key, CHIM_W, CHIM_H);
  }
  // 판자 150x26 (못 2개)
  for (const [key, tint] of [['plank-a', 0xb98a5a], ['plank-b', 0xa87a4c]]) {
    const gr = g(scene);
    gr.fillStyle(INK); gr.fillRoundedRect(0, 0, PLANK_W, PLANK_H, 5);
    gr.fillStyle(tint); gr.fillRoundedRect(LINE / 2, LINE / 2, PLANK_W - LINE, PLANK_H - LINE, 4);
    gr.fillStyle(0x000000, 0.12); gr.fillRect(LINE, PLANK_H / 2, PLANK_W - LINE * 2, 3); gr.fillRect(40, LINE, 3, PLANK_H - LINE * 2);
    gr.fillStyle(P.hammerLo); for (const x of [22, PLANK_W - 22]) gr.fillCircle(x, PLANK_H / 2, 4);
    gr.fillStyle(P.hammerHi); for (const x of [21, PLANK_W - 23]) gr.fillCircle(x, PLANK_H / 2 - 1, 2);
    bake(gr, key, PLANK_W, PLANK_H);
  }
  // 창틀(장식) 200x220
  let gr = g(scene);
  gr.fillStyle(0x3a2f2a); gr.fillRoundedRect(0, 0, 200, 220, 8);
  gr.fillStyle(0x201a17); gr.fillRoundedRect(10, 10, 180, 200, 4);
  bake(gr, 'window-frame', 200, 220);
  // 메달 40x40
  for (const [key, col, hi] of [['medal-gold', 0xffb400, 0xffe28a], ['medal-silver', 0xc9ced9, 0xf0f2f6], ['medal-bronze', 0xc77b45, 0xe6a97c], ['medal-none', 0x3a3644, 0x4a4656]]) {
    gr = g(scene);
    gr.fillStyle(INK); gr.fillCircle(20, 20, 20);
    gr.fillStyle(col); gr.fillCircle(20, 20, 16);
    gr.fillStyle(hi, 0.7); gr.fillCircle(15, 14, 6);
    bake(gr, key, 40, 40);
  }
  // 자물쇠 36x44
  gr = g(scene);
  gr.lineStyle(6, 0x8a8a98); gr.strokeCircle(18, 14, 9);
  gr.fillStyle(INK); gr.fillRoundedRect(2, 16, 32, 26, 6);
  gr.fillStyle(0x8a8a98); gr.fillRoundedRect(5, 19, 26, 20, 4);
  gr.fillStyle(INK); gr.fillCircle(18, 28, 3);
  bake(gr, 'lock', 36, 44);
  // 리프트(굴뚝용 발판) 160x24
  gr = g(scene);
  gr.fillStyle(INK); gr.fillRoundedRect(0, 0, 160, 24, 6);
  gr.fillStyle(P.accent); gr.fillRoundedRect(LINE / 2, LINE / 2, 160 - LINE, 24 - LINE, 4);
  gr.fillStyle(INK, 0.35); for (let x = 12; x < 160; x += 24) gr.fillRect(x, 6, 6, 12);
  bake(gr, 'lift', 160, 24);
}

export function bakeAll(scene) {
  extras(scene);
  brick(scene, 'brick-a', P.brick);
  brick(scene, 'brick-b', 0xcf6048);
  brick(scene, 'brick-c', 0xe07358);
  chip(scene);
  bot(scene);
  environment(scene);
}
