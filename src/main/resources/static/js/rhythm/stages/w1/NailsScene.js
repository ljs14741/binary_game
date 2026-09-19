/* 스테이지 1-4 판자 뜯기 — 판자 더미 3개, 클로즈업 줌, 8분 연타. 나무 재질. */
import { StageScene } from '../../engine/StageScene.js';
import { Breakable } from '../../engine/Breakable.js';
import { Bot } from '../../engine/Bot.js';
import { PLANK_W, PLANK_H } from '../../art/textures.js';
import { chartFor, buildRoom } from '../common.js';
import base from '../../charts/w1/nails.js';

export class NailsScene extends StageScene {
  constructor() { super('W1Nails'); }
  init() { super.init({ chart: chartFor(base) }); }

  buildWorld() {
    buildRoom(this, 2400, 760, 0xcbb08e);
    const counts = {};
    for (const p of this.chart.patterns) counts[p.target] = (counts[p.target] || 0) + p.beats.length;
    this.targets = {};
    let left = 560;
    for (const id of ['plank-a', 'plank-b', 'plank-c']) {
      const count = Math.max(6, (counts[id] || 0) * 2);      // 판자는 크니까 타격당 2장
      this.targets[id] = new Breakable(this, id, { left, bottom: this.floorY, cols: 1, count, pieceW: PLANK_W, pieceH: PLANK_H, keys: ['plank-a', 'plank-b'], stagger: false, material: 'wood', spread: 1.1 });
      left += 620;
    }
    this.bot = new Bot(this, 400, this.floorY).setDepth(12);
  }
  layoutFor(t) { return { botX: t.left - 150, botY: this.floorY, camX: t.left + 20, camY: this.floorY - 230, zoom: 1.25 }; }
  followFor(t) { return { x: t.left - 150, y: this.floorY }; }
}
