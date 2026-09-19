/* 스테이지 1-2 창문 깨기 — 창문 3개, 유리 조각은 가볍게 멀리 튄다. 카메라 좌우 팬. */
import { StageScene } from '../../engine/StageScene.js';
import { Breakable } from '../../engine/Breakable.js';
import { Bot } from '../../engine/Bot.js';
import { GLASS_W, GLASS_H } from '../../art/textures.js';
import { chartFor, buildRoom } from '../common.js';
import base from '../../charts/w1/window.js';

const COLS = 4;

export class WindowScene extends StageScene {
  constructor() { super('W1Window'); }
  init() { super.init({ chart: chartFor(base) }); }

  buildWorld() {
    buildRoom(this, 2400, 760, 0xa8c4d6);
    const counts = {};
    for (const p of this.chart.patterns) counts[p.target] = (counts[p.target] || 0) + p.beats.length;
    this.targets = {};
    let left = 560;
    for (const id of ['win-a', 'win-b', 'win-c']) {
      const count = Math.max(COLS * 3, (counts[id] || 0) * 3);
      const rows = Math.ceil(count / COLS);
      const sillY = this.floorY - 120;                       // 창턱 높이
      const frameImg = this.add.image(left + COLS * GLASS_W / 2, sillY - rows * GLASS_H / 2, 'window-frame').setDepth(5); frameImg.setScale((COLS * GLASS_W + 24) / frameImg.width, (rows * GLASS_H + 24) / frameImg.height);
      this.targets[id] = new Breakable(this, id, { left, bottom: sillY, cols: COLS, count, pieceW: GLASS_W, pieceH: GLASS_H, keys: ['glass-a', 'glass-b'], stagger: false, material: 'glass', spread: 1.4 });
      left += 640;
    }
    this.bot = new Bot(this, 400, this.floorY).setDepth(12);
  }
  layoutFor(t) { return { botX: t.left - 150, botY: this.floorY, camX: t.left + 40, camY: this.floorY - 320, zoom: 1 }; }
  followFor(t) { return { x: Math.max(t.left - 150, t.frontX() - 150), y: this.floorY }; }
}
