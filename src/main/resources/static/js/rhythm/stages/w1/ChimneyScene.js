/* 스테이지 1-3 굴뚝 무너뜨리기 — 굴뚝 하나를 위에서부터. 봇은 리프트를 타고 내려오고 카메라가 따라간다. */
import { StageScene } from '../../engine/StageScene.js';
import { Breakable } from '../../engine/Breakable.js';
import { Bot } from '../../engine/Bot.js';
import { CHIM_W, CHIM_H } from '../../art/textures.js';
import { chartFor, buildRoom } from '../common.js';
import base from '../../charts/w1/chimney.js';

const COLS = 3;

export class ChimneyScene extends StageScene {
  constructor() { super('W1Chimney'); }
  init() { super.init({ chart: chartFor(base) }); }

  buildWorld() {
    buildRoom(this, 1400, 900, 0x8fa3b8);
    const notes = this.chart.patterns.reduce((a, p) => a + p.beats.length, 0);
    const count = Math.max(COLS * 10, notes * 3);
    this.targets = { chimney: new Breakable(this, 'chimney', { left: 700, bottom: this.floorY, cols: COLS, count, pieceW: CHIM_W, pieceH: CHIM_H, keys: ['chim-a', 'chim-b', 'chim-c'], fromTop: true, material: 'brick', spread: 0.9 }) };
    this.lift = this.add.image(0, 0, 'lift').setDepth(9);
    this.bot = new Bot(this, 400, this.floorY).setDepth(12);
    this.cameras.main.setBounds(-200, -3000, 1800, this.floorY + 3600);
  }
  liftY(t) { return t.topY() + 70; }          // 봇 발 위치: 남은 꼭대기보다 살짝 아래
  layoutFor(t) { const y = this.liftY(t); return { botX: t.left - 150, botY: y, camX: t.left + 20, camY: y - 200, zoom: 1 }; }
  followFor(t) { const y = this.liftY(t); return { x: t.left - 150, y, camX: t.left + 20, camY: y - 200 }; }
  update(time, delta) {
    super.update(time, delta);
    if (this.lift && this.bot) this.lift.setPosition(this.bot.x, this.bot.y + 12);
  }
}
