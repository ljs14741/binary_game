/* 수조 배경: 하늘·빙붕·물·빛줄기·바닥. 화면 크기가 바뀌면 통째로 다시 그림 */
import Phaser from 'phaser';
import { INK } from '../art/palette.js';
import { PS } from '../art/dpr.js';

export function drawWater(scene, W, H, world, top, floor, o = {}) {
  const layer = scene.add.container(0, 0).setDepth(o.depth != null ? o.depth : 0);
  const g = scene.add.graphics();
  layer.add(g);

  // 하늘
  g.fillStyle(world.sky, 1); g.fillRect(-4, -4, W + 8, top + 8);
  // 물 (위는 밝고 아래로 깊게)
  g.fillGradientStyle(world.top, world.top, world.mid, world.mid, 1);
  g.fillRect(-4, top, W + 8, (floor - top) * 0.55);
  g.fillGradientStyle(world.mid, world.mid, world.deep, world.deep, 1);
  g.fillRect(-4, top + (floor - top) * 0.55 - 1, W + 8, (floor - top) * 0.45 + 2);
  g.fillStyle(world.deep, 1); g.fillRect(-4, floor, W + 8, H - floor + 8);

  // 빙붕 (양옆 얼음 절벽 + 고드름)
  const rnd = new Phaser.Math.RandomDataGenerator(['penguin' + world.top]);
  const shelf = (x0, x1, h) => {
    g.fillStyle(INK, 1); g.fillRoundedRect(x0 - 3, top - h - 3, x1 - x0 + 6, h + 10, 14);
    g.fillStyle(world.ice, 1); g.fillRoundedRect(x0, top - h, x1 - x0, h + 6, 12);
    g.fillStyle(world.iceLo, 1); g.fillRect(x0 + 4, top - 8, x1 - x0 - 8, 12);
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(x0 + 6, top - h + 4, (x1 - x0) * 0.6, 6, 3);
    for (let x = x0 + 12; x < x1 - 10; x += rnd.between(16, 30)) {
      const len = rnd.between(10, 26);
      g.fillStyle(world.iceLo, 0.95); g.fillTriangle(x - 6, top + 2, x + 6, top + 2, x, top + len);
    }
  };
  shelf(-20, Math.min(W * 0.28, 220), 30);
  shelf(W - Math.min(W * 0.24, 190), W + 20, 22);

  // 수면
  g.fillStyle(0xffffff, 0.55);
  for (let x = -10; x < W + 20; x += 28) g.fillEllipse(x, top + 1, 34, 7);
  g.fillStyle(0xffffff, 0.18); g.fillRect(-4, top + 4, W + 8, 5);

  // 빛줄기
  const rays = scene.add.graphics();
  layer.add(rays);
  for (let i = 0; i < Math.max(3, Math.round(W / 160)); i++) {
    const x = rnd.between(40, W - 40), w1 = rnd.between(30, 70), w2 = w1 * 2.6, skew = rnd.between(-80, 80);
    rays.fillStyle(0xffffff, 0.07);
    rays.fillPoints([{ x: x - w1 / 2, y: top }, { x: x + w1 / 2, y: top }, { x: x + w2 / 2 + skew, y: floor }, { x: x - w2 / 2 + skew, y: floor }], true);
  }
  scene.tweens.add({ targets: rays, alpha: { from: 0.6, to: 1 }, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

  // 바닥: 모래 언덕 + 돌 + 얼음 결정
  const f = scene.add.graphics();
  layer.add(f);
  f.fillStyle(INK, 1);
  f.fillPoints(hill(W, floor - 3, 16, rnd, 0).concat([{ x: W + 10, y: H + 10 }, { x: -10, y: H + 10 }]), true);
  f.fillStyle(world.floorLo, 1);
  f.fillPoints(hill(W, floor, 16, rnd, 0).concat([{ x: W + 10, y: H + 10 }, { x: -10, y: H + 10 }]), true);
  f.fillStyle(world.floor, 1);
  f.fillPoints(hill(W, floor + 7, 10, rnd, 1).concat([{ x: W + 10, y: H + 10 }, { x: -10, y: H + 10 }]), true);
  for (let i = 0; i < Math.round(W / 70); i++) {
    const x = rnd.between(10, W - 10), r = rnd.between(6, 14);
    f.fillStyle(INK, 1); f.fillEllipse(x, floor + 6, r * 2 + 5, r + 5);
    f.fillStyle(world.floorLo, 1); f.fillEllipse(x, floor + 5, r * 2, r);
    f.fillStyle(0xffffff, 0.35); f.fillEllipse(x - r * 0.3, floor + 2, r * 0.8, r * 0.3);
  }
  // 얼음 결정 (월드마다 색)
  for (let i = 0; i < Math.round(W / 180); i++) {
    const x = rnd.between(30, W - 30), h = rnd.between(22, 44);
    f.fillStyle(INK, 1); f.fillTriangle(x - 12, floor + 8, x + 12, floor + 8, x, floor - h - 4);
    f.fillStyle(world.ice, 0.95); f.fillTriangle(x - 9, floor + 6, x + 9, floor + 6, x, floor - h);
    f.fillStyle(0xffffff, 0.8); f.fillTriangle(x - 5, floor + 4, x - 1, floor + 4, x - 1, floor - h * 0.7);
  }

  // 떠오르는 물방울
  if (!o.noBubbles) {
    const em = scene.add.particles(0, 0, 'bubble', {
      x: { min: 10, max: W - 10 }, y: floor,
      speedY: { min: -70, max: -35 }, speedX: { min: -8, max: 8 },
      scale: { min: 0.35 * PS, max: 0.9 * PS }, alpha: { start: 0.8, end: 0 },
      lifespan: { min: 5000, max: 9000 }, frequency: 700, quantity: 1
    });
    em.addDeathZone({ type: 'onLeave', source: new Phaser.Geom.Rectangle(-20, top + 6, W + 40, floor - top + 40) });
    layer.add(em);
  }
  return layer;
}

function hill(W, y, amp, rnd, phase) {
  const pts = [{ x: -10, y }];
  const a = rnd.realInRange(0.008, 0.016), b = rnd.realInRange(0, 6);
  for (let x = 0; x <= W + 10; x += 20) pts.push({ x, y: y - Math.sin(x * a + b + phase) * amp * 0.5 - Math.sin(x * a * 2.3 + b) * amp * 0.25 });
  return pts;
}
