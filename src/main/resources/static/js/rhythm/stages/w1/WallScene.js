/* 스테이지 1-1 벽 부수기 — 벽 3면, 카메라는 target 이 바뀔 때 옆으로 이동 */
import { StageScene } from '../../engine/StageScene.js';
import { Wall } from '../../engine/Breakable.js';
import { Bot } from '../../engine/Bot.js';
import { chartFor, buildRoom } from '../common.js';
import base from '../../charts/w1/wall.js';

const COLS = 6;

export class WallScene extends StageScene {
  constructor() { super('W1Wall'); }
  init() { super.init({ chart: chartFor(base) }); }

  buildWorld() {
    buildRoom(this, 2600, 760);
    const counts = {};
    for (const p of this.chart.patterns) counts[p.target] = (counts[p.target] || 0) + p.beats.length;
    this.targets = {};
    let left = 560;
    for (const id of ['wall-a', 'wall-b', 'wall-c']) {
      this.targets[id] = new Wall(this, id, left, this.floorY, COLS, Math.max(COLS * 5, (counts[id] || 0) * 3));
      left += 680;
    }
    this.bot = new Bot(this, 400, this.floorY).setDepth(12);
  }
}
