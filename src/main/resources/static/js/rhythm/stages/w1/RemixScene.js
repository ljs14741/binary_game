/* 리믹스 — 벽·창문·굴뚝·판자를 한 현장에 가로로 배치. 패턴마다 target 이 바뀌며 카메라가 현장을 가로지른다. */
import { StageScene } from '../../engine/StageScene.js';
import { Breakable } from '../../engine/Breakable.js';
import { Bot } from '../../engine/Bot.js';
import { BRICK_W, BRICK_H, GLASS_W, GLASS_H, CHIM_W, CHIM_H, PLANK_W, PLANK_H } from '../../art/textures.js';
import { chartFor, buildRoom } from '../common.js';
import base from '../../charts/w1/remix.js';

export class RemixScene extends StageScene {
  constructor() { super('W1Remix'); }
  init() { super.init({ chart: chartFor(base) }); }

  buildWorld() {
    buildRoom(this, 3400, 800, 0xb0a6c4);
    const counts = {};
    for (const p of this.chart.patterns) counts[p.target] = (counts[p.target] || 0) + p.beats.length;
    const F = this.floorY;
    this.targets = {
      wall: new Breakable(this, 'wall', { left: 560, bottom: F, cols: 6, count: Math.max(30, counts.wall * 3), pieceW: BRICK_W, pieceH: BRICK_H, keys: ['brick-a', 'brick-b', 'brick-c'], material: 'brick' }),
      window: new Breakable(this, 'window', { left: 1300, bottom: F - 120, cols: 4, count: Math.max(12, counts.window * 3), pieceW: GLASS_W, pieceH: GLASS_H, keys: ['glass-a', 'glass-b'], stagger: false, material: 'glass', spread: 1.4 }),
      chimney: new Breakable(this, 'chimney', { left: 2000, bottom: F, cols: 3, count: Math.max(24, counts.chimney * 3), pieceW: CHIM_W, pieceH: CHIM_H, keys: ['chim-a', 'chim-b', 'chim-c'], fromTop: true, material: 'brick', spread: 0.9 }),
      plank: new Breakable(this, 'plank', { left: 2600, bottom: F, cols: 1, count: Math.max(6, counts.plank * 2), pieceW: PLANK_W, pieceH: PLANK_H, keys: ['plank-a', 'plank-b'], stagger: false, material: 'wood', spread: 1.1 })
    };
    const w = this.targets.window;
    const frameImg = this.add.image(w.left + 4 * GLASS_W / 2, (F - 120) - w.rows * GLASS_H / 2, 'window-frame').setDepth(5); frameImg.setScale((4 * GLASS_W + 24) / frameImg.width, (w.rows * GLASS_H + 24) / frameImg.height);
    this.lift = this.add.image(0, 0, 'lift').setDepth(9).setVisible(false);
    this.bot = new Bot(this, 400, F).setDepth(12);
    this.cameras.main.setBounds(-200, -3000, 3800, F + 3600);
  }
  layoutFor(t) {
    if (t.id === 'chimney') { const y = t.topY() + 70; return { botX: t.left - 150, botY: y, camX: t.left + 20, camY: y - 200, zoom: 1 }; }
    if (t.id === 'plank') return { botX: t.left - 150, botY: this.floorY, camX: t.left + 20, camY: this.floorY - 260, zoom: 1.15 };
    return { botX: t.left - 160, botY: this.floorY, camX: t.left + 60, camY: this.floorY - 300, zoom: 1 };
  }
  followFor(t) {
    if (t.id === 'chimney') { const y = t.topY() + 70; return { x: t.left - 150, y, camX: t.left + 20, camY: y - 200 }; }
    if (t.id === 'plank') return { x: t.left - 150, y: this.floorY };
    return { x: Math.max(t.left - 160, t.frontX() - 160), y: this.floorY };
  }
  update(time, delta) {
    super.update(time, delta);
    if (!this.lift || !this.bot) return;
    const onLift = this.currentTarget === 'chimney';
    this.lift.setVisible(onLift);
    if (onLift) this.lift.setPosition(this.bot.x, this.bot.y + 12);
  }
}
