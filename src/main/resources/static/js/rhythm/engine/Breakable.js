/* Breakable.js — 부술 수 있는 조각 격자 (벽돌 벽, 유리창, 굴뚝, 판자 더미).
 * 정적 이미지 격자 → 타격 시 근처 조각을 Matter 바디로 바꿔 날리고, 멈추면 정적으로 굳힌다(잔해가 남는다).
 * opts: { left, bottom, cols, count, pieceW, pieceH, keys[], stagger, fromTop, material, spread }
 *  - fromTop: 분필 표시를 위에서부터(굴뚝). 아니면 앞면(왼쪽 열)부터.
 *  - spread: 조각이 날아가는 세기 배수 (유리 파편은 가볍게 멀리)
 */
import Phaser from 'phaser';

export const MAX_DYNAMIC = 40;

export class Breakable {
  constructor(scene, id, o) {
    this.scene = scene; this.id = id;
    this.left = o.left; this.bottom = o.bottom; this.cols = o.cols;
    this.pw = o.pieceW; this.ph = o.pieceH; this.keys = o.keys;
    this.fromTop = !!o.fromTop; this.material = o.material || 'brick'; this.spread = o.spread || 1;
    this.stagger = o.stagger !== false;
    this.rows = Math.ceil(o.count / this.cols);
    this.bricks = [];
    for (let r = 0; r < this.rows; r++) {
      const shift = this.stagger && r % 2 ? this.pw / 2 : 0;
      const inRow = Math.min(this.cols, o.count - r * this.cols);
      for (let c = 0; c < inRow; c++) {
        const x = this.left + c * this.pw + this.pw / 2 + shift;
        const y = this.bottom - r * this.ph - this.ph / 2;
        const img = scene.add.image(x, y, this.keys[(r * 7 + c * 3) % this.keys.length]).setDepth(10);
        this.bricks.push({ img, x, y, r, c, alive: true, key: img.texture.key });
      }
    }
    this.total = this.bricks.length;
  }

  get remaining() { return this.bricks.filter(b => b.alive).length; }
  get width() { return this.cols * this.pw + (this.stagger ? this.pw / 2 : 0); }
  get top() { return this.bottom - this.rows * this.ph; }
  alive() { return this.bricks.filter(b => b.alive); }
  // 남은 조각의 앞면 x / 윗면 y (봇·카메라가 따라갈 기준)
  frontX() { const a = this.alive(); return a.length ? Math.min(...a.map(q => q.x)) - this.pw / 2 : this.left; }
  topY() { const a = this.alive(); return a.length ? Math.min(...a.map(q => q.y)) - this.ph / 2 : this.bottom; }

  // k번째 큐의 분필 표시 위치
  markPoint(k) {
    const a = this.alive();
    if (!a.length) return { x: this.left + this.pw, y: this.bottom - this.rows * this.ph / 2 };
    if (this.fromTop) {
      const topRow = Math.max(...a.map(b => b.r));
      const pool = a.filter(b => b.r >= topRow - 1);
      return pool[(k * 2) % pool.length];
    }
    const front = a.filter(b => b.c <= 1);
    const pool = front.length ? front : a;
    const rowsAlive = [...new Set(pool.map(b => b.r))].sort((x, y) => y - x);
    const r = rowsAlive[(k * 3) % rowsAlive.length];
    return pool.find(q => q.r === r) || pool[0];
  }

  // (x,y) 근처 조각 n개를 날린다. 실제 날린 수 반환.
  smash(x, y, n, power = 1, dir = 1) {
    if (n <= 0) return 0;
    const picked = this.alive()
      .sort((a, b) => Phaser.Math.Distance.Between(a.x, a.y, x, y) - Phaser.Math.Distance.Between(b.x, b.y, x, y))
      .slice(0, n);
    const s = this.scene;
    for (const b of picked) {
      b.alive = false;
      b.img.destroy();
      const body = s.matter.add.image(b.x, b.y, b.key, null, { chamfer: { radius: 3 }, friction: 0.6, frictionAir: this.material === 'glass' ? 0.03 : 0.01, restitution: this.material === 'glass' ? 0.3 : 0.15, density: 0.002 });
      body.setDepth(11);
      const ang = this.fromTop ? Phaser.Math.FloatBetween(-1.3, -0.4) : Phaser.Math.FloatBetween(-0.9, -0.2);
      const sp = (7 + Math.random() * 5) * power * this.spread;
      body.setVelocity(Math.cos(ang) * sp * dir, Math.sin(ang) * sp);
      body.setAngularVelocity(Phaser.Math.FloatBetween(-0.3, 0.3) * power);
      body.__born = s.time.now; body.__still = 0;
      s.debris.push(body);
    }
    s.trimDebris();
    return picked.length;
  }
}

// 하위 호환: 벽돌 벽
export const BRICK_W = 56, BRICK_H = 32;
export class Wall extends Breakable {
  constructor(scene, id, left, bottom, cols, count) {
    super(scene, id, { left, bottom, cols, count, pieceW: BRICK_W, pieceH: BRICK_H, keys: ['brick-a', 'brick-b', 'brick-c'], material: 'brick' });
  }
}

// 매 프레임: 멈춘 잔해를 정적으로 굳힌다
export function settleDebris(scene, dt) {
  const list = scene.debris;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    if (!b.body) { list.splice(i, 1); continue; }
    const v = b.body.velocity;
    const slow = Math.abs(v.x) + Math.abs(v.y) < 0.35;
    b.__still = slow ? b.__still + dt : 0;
    if (b.__still > 0.4 || scene.time.now - b.__born > 4000) { b.setStatic(true); list.splice(i, 1); }
  }
}
