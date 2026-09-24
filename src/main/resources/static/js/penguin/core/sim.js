/* 수조 한 판의 규칙. Phaser 를 모름 — 화면(scenes/Tank.js)은 이 상태를 그리기만 하고,
 * 밸런스 테스트는 Node 에서 이 클래스를 그대로 돌림.
 * 일어난 일은 events 에 쌓이고 화면이 매 프레임 꺼내 효과음·연출로 씀.
 */
import * as C from './config.js';

const d2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 이 레벨에서 쓸 수 있는 것들. 앞 레벨들의 황금알 보상을 모음 */
export function unlocksFor(levelIdx) {
  const species = new Set(['gentoo']);
  const pets = [];
  for (let i = 0; i < levelIdx; i++) {
    const h = C.HATCH[i];
    if (h.type === 'species') species.add(h.key);
    if (h.type === 'pet') pets.push(h.key);
  }
  return { species, pets };
}

export class Sim {
  constructor(levelIdx, o = {}) {
    this.level = levelIdx;
    this.L = C.LEVELS[levelIdx];
    this.b = Object.assign({ left: 0, right: 540, top: 120, bottom: 760 }, o.bounds);
    this.rng = o.rng || Math.random;
    const u = unlocksFor(levelIdx);
    this.species = u.species;
    this.petKeys = u.pets;
    this.nextId = 1;
    this.events = [];

    this.t = 0;
    this.money = (C.TEST_MONEY || this.L.money) + (o.bonus || 0);
    this.eggs = 0;
    this.foodTier = 0;
    this.foodMax = 1;
    this.weapon = 0;
    this.penguins = [];
    this.foods = [];
    this.coins = [];
    this.preds = [];
    this.pets = [];
    this.layEggs = [];
    this.over = null;               // 'clear' | 'lose'
    this.kills = 0;
    this.lost = 0;
    this.earned = 0;

    this.trait = C.TRAITS[this.L.trait] || {};
    this.otterBuys = 0;
    this.projs = [];                // 북극곰 얼음덩이
    this.rainT = 0; this.rainAcc = 0;
    this.nextEvent = this.rand(...C.EVENTS.first);

    this.nextAttack = this.L.pred ? this.L.pred.first : Infinity;
    this.warned = false;
    this.boss = 'none';             // none → coming → here → down
    this.bossT = 0;

    for (let i = 0; i < this.L.start; i++) this.addPenguin('gentoo', true);
    for (const k of this.petKeys) this.addPet(k);
  }

  /* ---------- 공용 ---------- */
  emit(type, o) { this.events.push(Object.assign({ type }, o)); }
  drain() { const e = this.events; this.events = []; return e; }
  rand(a, b) { return a + (b - a) * this.rng(); }
  hasPet(k) { return this.petKeys.includes(k); }
  pet(k) { return this.pets.find(p => p.kind === k); }

  setBounds(b) {
    this.b = Object.assign({}, this.b, b);
    const { left, right, top, bottom } = this.b;
    for (const p of this.penguins) { p.x = clamp(p.x, left + 10, right - 10); p.y = clamp(p.y, top + 10, bottom - 10); p.tx = clamp(p.tx, left + 30, right - 30); p.ty = clamp(p.ty, top + 30, bottom - 30); }
    for (const f of this.foods) f.x = clamp(f.x, left + 8, right - 8);
    for (const c of this.coins) { c.x = clamp(c.x, left + 12, right - 12); if (c.y > bottom) c.y = bottom; }
    for (const p of this.pets) { p.x = clamp(p.x, left + 20, right - 20); if (p.floor) p.y = bottom - p.floor; }
    for (const e of this.layEggs) { e.x = clamp(e.x, left + 12, right - 12); if (e.y > bottom - 12) e.y = bottom - 12; }
  }

  radius(p) {
    const s = C.SPECIES[p.kind];
    return Array.isArray(s.r) ? s.r[p.stage] : s.r;
  }

  countKind(k) { let n = 0; for (const p of this.penguins) if (p.kind === k) n++; return k === 'gentoo' ? n + this.layEggs.length : n; }

  /** 먹이를 찾기 시작하는 배고픔. 아기는 빨리 자라야 해서 더 자주 먹음 */
  seekAt(p) { return p.kind === 'gentoo' && p.stage === 0 ? C.HUNGER.babySeek : C.HUNGER.seek; }

  get penguinCount() { return this.penguins.length + this.layEggs.length; }
  playerFoodCount() { let n = 0; for (const f of this.foods) if (!f.free) n++; return n; }

  addPenguin(kind, initial, at) {
    const { left, right, top, bottom } = this.b;
    const s = C.SPECIES[kind];
    const p = {
      id: this.nextId++, kind,
      x: at ? at.x : this.rand(left + 60, right - 60),
      y: at ? at.y : (initial ? this.rand(top + 80, bottom - 120) : top - 30),
      vx: 0, vy: initial ? 0 : 120,
      tx: 0, ty: 0, retarget: 0,
      hunger: initial ? this.rand(0, 3) : 0,
      growth: 0, stage: kind === 'gentoo' ? 0 : 2,
      dropT: (s.dropEvery || 10) * this.rand(0.5, 1),
      layT: s.layEvery ? s.layEvery * this.rand(0.6, 1) : 0,
      hitT: 0, face: this.rng() < 0.5 ? -1 : 1, entering: !initial && !at
    };
    this.pickWander(p);
    this.penguins.push(p);
    return p;
  }

  addPet(kind) {
    const { left, right, top, bottom } = this.b;
    const p = { id: this.nextId++, kind, x: this.rand(left + 60, right - 60), y: this.rand(top + 80, bottom - 120), vx: 0, vy: 0, tx: 0, ty: 0, retarget: 0, cd: 0, face: 1 };
    const def = C.PETS[kind];
    if (kind === 'crab' || kind === 'clam' || kind === 'starfish') { p.floor = kind === 'crab' ? 21 : 18; p.y = bottom - p.floor; }
    if (kind === 'otter') p.y = top + 18;
    if (kind === 'clam') p.x = this.rand(left + 40, left + (right - left) * 0.35);
    if (kind === 'starfish') p.x = this.rand(left + (right - left) * 0.65, right - 40);
    p.cd = def.every ? def.every * this.rand(0.4, 0.8) : 0;
    this.pets.push(p);
    return p;
  }

  pickWander(p, lowBias) {
    const { left, right, top, bottom } = this.b;
    p.tx = this.rand(left + 40, right - 40);
    p.ty = lowBias ? this.rand((top + bottom) / 2, bottom - 40) : this.rand(top + 40, bottom - 40);
    p.retarget = this.rand(2.5, 5.5);
  }

  steer(o, tx, ty, speed, dt, turn = 3) {
    const dx = tx - o.x, dy = ty - o.y;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dt * turn);
    o.vx += (dx / len * speed - o.vx) * k;
    o.vy += (dy / len * speed - o.vy) * k;
    return len;
  }

  spawnCoin(type, x, y, value, o = {}) {
    const def = C.COIN[type];
    let v = value != null ? value : Math.round(def.value * (this.trait.value || 1));
    let lucky = false;
    const luck = (this.hasPet('seahorse') ? C.PETS.seahorse.luck : 0) + (this.trait.luck || 0);
    if (o.canLuck && luck && this.rng() < luck) { v *= 2; lucky = true; }
    const c = { id: this.nextId++, type, x, y, value: v, age: 0, groundT: -1, lucky, vx: o.vx || 0, vy: o.vy || 0, floatT: o.floatT || 0 };
    this.coins.push(c);
    this.emit('coinDrop', { id: c.id, x, y, coin: type, lucky });
    return c;
  }

  collect(c, by) {
    const i = this.coins.indexOf(c);
    if (i < 0) return;
    this.coins.splice(i, 1);
    if (c.type === 'egg') {
      this.eggs = Math.min(3, this.eggs + 1);
      this.emit('eggPiece', { id: c.id, x: c.x, y: c.y, eggs: this.eggs });
      if (this.eggs >= 3) this.win();
      return;
    }
    this.money += c.value;
    this.earned += c.value;
    this.emit('collect', { id: c.id, x: c.x, y: c.y, value: c.value, coin: c.type, by, lucky: c.lucky });
  }

  win() {
    if (this.over) return;
    this.over = 'clear';
    this.emit('clear', { t: this.t });
  }

  /* ---------- 플레이어 입력 ---------- */
  weaponDmg() { return C.WEAPON[this.weapon].dmg; }

  /** 탭 한 번. 천적 > 코인 > 먹이 순서로 판정 */
  tap(x, y) {
    if (this.over) return 'none';
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pj = this.projs[i];
      if (d2(x, y, pj.x, pj.y) < 44 * 44) { this.projs.splice(i, 1); this.emit('projBreak', { id: pj.id, x: pj.x, y: pj.y }); return 'hit'; }
    }
    let best = null, bd = Infinity;
    for (const pr of this.preds) {
      const r = C.PREDATORS[pr.kind].r * 1.2 + 14;
      const d = d2(x, y, pr.x, pr.y);
      if (d < r * r && d < bd) { best = pr; bd = d; }
    }
    if (best) { this.hitPred(best, this.weaponDmg(), x, y, 'tap'); return 'hit'; }
    if (this.grabCoin(x, y, 44)) return 'coin';
    if (this.preds.length) { this.emit('miss', { x, y }); return 'miss'; }
    const { left, right, top, bottom } = this.b;
    if (y < top - 20 || y > bottom || x < left || x > right) return 'none';
    if (this.playerFoodCount() >= this.foodMax) { this.emit('foodFull', { x, y }); return 'full'; }
    if (this.money < C.FOOD_PRICE) { this.emit('poor', { x, y }); return 'poor'; }
    this.money -= C.FOOD_PRICE;
    this.dropFood(clamp(x, left + 8, right - 8), clamp(y, top + 2, bottom - 20), false);
    return 'food';
  }

  /** 누른 채로 문지르면 코인만 주움 (모바일 편의) */
  sweep(x, y) {
    if (this.over) return false;
    return this.grabCoin(x, y, 38);
  }

  grabCoin(x, y, r) {
    let best = null, bd = r * r;
    for (const c of this.coins) {
      const d = d2(x, y, c.x, c.y);
      if (d < bd) { best = c; bd = d; }
    }
    if (best) { this.collect(best, 'tap'); return true; }
    return false;
  }

  dropFood(x, y, free, golden) {
    const f = { id: this.nextId++, x, y, tier: this.foodTier, floorT: -1, free, golden: !!golden };
    this.foods.push(f);
    this.emit('food', { id: f.id, x, y, free });
    return f;
  }

  /* ---------- 상점 ---------- */
  /** 상점 칸 상태: ok | poor | locked | max | full | boss */
  shopState(item) {
    const lvl = this.level;
    if (C.SPECIES[item]) {
      const s = C.SPECIES[item];
      if (!this.species.has(item)) return 'locked';
      if (this.penguinCount >= C.MAX_PENGUINS) return 'full';
      return this.money >= s.price ? 'ok' : 'poor';
    }
    const price = this.price(item);
    if (item === 'food') {
      const next = C.FOOD[this.foodTier + 1];
      if (!next) return 'max';
      if (next.unlock && lvl < next.unlock) return 'locked';
    }
    if (item === 'foodCount' && this.foodMax >= C.FOOD_COUNT_MAX) return 'max';
    if (item === 'otter') {
      if (!this.hasPet('otter')) return 'locked';
      if (this.otterBuys >= C.OTTER_PRICES.length) return 'max';
    }
    if (item === 'weapon' && !C.WEAPON[this.weapon + 1]) return 'max';
    if (item === 'egg') {
      if (this.eggs >= 3) return 'max';
      if (this.L.boss && this.eggs >= 2) return 'boss';
    }
    return this.money >= price ? 'ok' : 'poor';
  }

  price(item) {
    if (C.SPECIES[item]) return C.SPECIES[item].price;
    if (item === 'food') { const n = C.FOOD[this.foodTier + 1]; return n ? n.price : 0; }
    if (item === 'foodCount') return C.FOOD_COUNT_PRICE;
    if (item === 'weapon') { const n = C.WEAPON[this.weapon + 1]; return n ? n.price : 0; }
    if (item === 'egg') return this.L.eggs[this.eggs] || 0;
    if (item === 'otter') return C.OTTER_PRICES[this.otterBuys] || 0;
    return 0;
  }

  buy(item) {
    if (this.over || this.shopState(item) !== 'ok') return false;
    const price = this.price(item);
    this.money -= price;
    if (C.SPECIES[item]) {
      const p = this.addPenguin(item, false);
      this.emit('spawn', { id: p.id, kind: item, x: p.x });
    } else if (item === 'food') this.foodTier++;
    else if (item === 'foodCount') this.foodMax++;
    else if (item === 'weapon') this.weapon++;
    else if (item === 'otter') { this.otterBuys++; const p = this.addPet('otter'); this.emit('petIn', { id: p.id, kind: 'otter', x: p.x, y: p.y }); }
    else if (item === 'egg') {
      this.eggs++;
      this.emit('eggPiece', { eggs: this.eggs, bought: true });
      if (this.eggs >= 3) this.win();
      else if (this.L.boss && this.eggs === 2) { this.boss = 'coming'; this.bossT = C.PREDATOR_WARN + 1; this.emit('bossWarn', { kind: this.L.boss }); }
    }
    this.emit('buy', { item, price });
    return true;
  }

  /* ---------- 시간 흐름 ---------- */
  update(dt) {
    if (this.over) { this.updateCoins(dt); return; }
    // 탭을 떠났다 돌아오면 dt 가 커짐. 잘게 나눠서 순간이동·관통을 막음
    let left = Math.min(dt, 0.5);
    while (left > 0) {
      const s = Math.min(left, 1 / 30);
      this.step(s);
      left -= s;
      if (this.over) break;
    }
  }

  step(dt) {
    this.t += dt;
    this.updateFoods(dt);
    this.updateCoins(dt);
    this.updatePenguins(dt);
    this.updateLayEggs(dt);
    this.updateAttacks(dt);
    this.updatePreds(dt);
    this.updateProjs(dt);
    this.updateEvents(dt);
    this.updatePets(dt);
    this.checkLose();
  }

  updateFoods(dt) {
    const { bottom } = this.b;
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      if (f.floorT < 0) {
        f.y += C.FOOD_SINK * (this.trait.sink || 1) * dt;
        f.x += (Math.sin((this.t + f.id) * 3) * 6 + this.drift()) * dt;
        f.x = clamp(f.x, this.b.left + 8, this.b.right - 8);
        if (f.y >= bottom - 8) { f.y = bottom - 8; f.floorT = 0; }
      } else {
        f.floorT += dt;
        if (f.floorT > C.FOOD_FLOOR_LIFE * (f.golden ? 4 : 1)) { this.foods.splice(i, 1); this.emit('foodGone', { id: f.id, x: f.x, y: f.y }); }
      }
    }
  }

  updateCoins(dt) {
    const { bottom, left, right } = this.b;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      if (c.floatT > 0) {
        // 떠내려오는 보물상자: 수면 가까이를 가로질러 흘러감
        c.floatT -= dt;
        c.x += c.vx * dt; c.y += Math.sin(c.age * 3) * 8 * dt;
        if (c.x < left - 60 || c.x > right + 60) { this.coins.splice(i, 1); this.emit('coinGone', { id: c.id, x: c.x, y: c.y }); }
        continue;
      }
      if (c.groundT < 0) {
        const sink = C.COIN[c.type] ? C.COIN[c.type].sink : 40;
        if (c.vy < sink) c.vy = Math.min(sink, c.vy + 200 * dt);
        c.vx *= Math.max(0, 1 - dt * 2);
        c.y += c.vy * dt;
        c.x = clamp(c.x + (c.vx + this.drift()) * dt, left + 12, right - 12);
        if (c.y >= bottom - 13) { c.y = bottom - 13; c.groundT = 0; c.vx = 0; }
      } else if (c.type !== 'egg') {
        c.groundT += dt;
        if (c.groundT > this.coinLife()) { this.coins.splice(i, 1); this.emit('coinGone', { id: c.id, x: c.x, y: c.y }); }
      }
    }
  }

  nearestPred(x, y) {
    let best = null, bd = Infinity;
    for (const pr of this.preds) { const d = d2(x, y, pr.x, pr.y); if (d < bd) { bd = d; best = pr; } }
    return best ? { pr: best, d: Math.sqrt(bd) } : null;
  }

  updatePenguins(dt) {
    const { left, right, top, bottom } = this.b;
    for (let i = this.penguins.length - 1; i >= 0; i--) {
      const p = this.penguins[i];
      const s = C.SPECIES[p.kind];
      const r = this.radius(p);

      if (p.entering) {
        // 위에서 풍덩
        p.vy = Math.max(p.vy - 160 * dt, 20);
        p.y += p.vy * dt;
        if (p.y > top + 40) p.entering = false;
        continue;
      }

      p.hunger += dt * (this.trait.hunger || 1);
      if (p.hunger >= C.HUNGER.die) {
        this.penguins.splice(i, 1);
        this.lost++;
        this.emit('starved', { id: p.id, x: p.x, y: p.y, kind: p.kind, stage: p.stage });
        continue;
      }

      // 북극곰 얼음에 맞으면 잠깐 꽁꽁 (못 움직이고 못 먹음)
      if (p.frozenT > 0) { p.frozenT -= dt; p.vx = 0; p.vy = 0; continue; }

      const near = this.preds.length ? this.nearestPred(p.x, p.y) : null;
      let speed = s.speed, turn = 3;
      p.mode = 'wander';

      if (near && s.fighter) {
        p.mode = 'fight';
        speed *= 1.35;
        this.steer(p, near.pr.x, near.pr.y, speed, dt, 5);
        p.hitT -= dt;
        if (near.d < r + C.PREDATORS[near.pr.kind].r * 0.8 && p.hitT <= 0) {
          p.hitT = s.hitEvery;
          this.hitPred(near.pr, s.dmg, p.x, p.y, 'macaroni');
        }
      } else if (near && near.d < 250) {
        p.mode = 'flee';
        const dx = p.x - near.pr.x, dy = p.y - near.pr.y, len = Math.hypot(dx, dy) || 1;
        let tx = p.x + dx / len * 200, ty = p.y + dy / len * 200;
        // 벽에 몰리면 옆으로 빠짐
        if (tx < left + 40 || tx > right - 40) ty += (ty < (top + bottom) / 2 ? 160 : -160);
        if (ty < top + 40 || ty > bottom - 40) tx += (tx < (left + right) / 2 ? 160 : -160);
        speed *= 1.55; turn = 4;
        this.steer(p, tx, ty, speed, dt, turn);
      } else if (p.hunger >= this.seekAt(p) && this.foods.length) {
        p.mode = 'seek';
        let best = null, bd = Infinity;
        for (const f of this.foods) { const d = d2(p.x, p.y, f.x, f.y); if (d < bd) { bd = d; best = f; } }
        speed *= p.hunger >= C.HUNGER.starve ? 1.7 : 1.45;
        this.steer(p, best.x, best.y, speed, dt, 5);
      } else if (s.collector && this.coins.length) {
        p.mode = 'collect';
        let best = null, bd = Infinity;
        for (const c of this.coins) { if (c.type === 'egg') continue; const d = d2(p.x, p.y, c.x, c.y); if (d < bd) { bd = d; best = c; } }
        if (best) {
          this.steer(p, best.x, best.y, speed, dt, 4);
          if (bd < (r + 16) * (r + 16)) this.collect(best, 'chinstrap');
        } else this.wander(p, speed, dt);
      } else {
        this.wander(p, p.hunger >= C.HUNGER.starve ? speed * 0.7 : speed, dt);
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < left + r) { p.x = left + r; p.vx = Math.abs(p.vx) * 0.5; }
      if (p.x > right - r) { p.x = right - r; p.vx = -Math.abs(p.vx) * 0.5; }
      if (p.y < top + r * 0.6) { p.y = top + r * 0.6; p.vy = Math.abs(p.vy) * 0.5; }
      if (p.y > bottom - r) { p.y = bottom - r; p.vy = -Math.abs(p.vy) * 0.5; }
      if (Math.abs(p.vx) > 6) p.face = p.vx > 0 ? 1 : -1;

      // 먹기: 완전히 배부를 땐 안 먹음
      if (p.hunger > 2.5) {
        for (let j = this.foods.length - 1; j >= 0; j--) {
          const f = this.foods[j];
          if (d2(p.x, p.y, f.x, f.y) < (r + 10) * (r + 10)) {
            this.foods.splice(j, 1);
            const food = C.FOOD[f.tier];
            p.hunger = -food.satiety;
            this.emit('eat', { id: p.id, x: f.x, y: f.y, foodId: f.id });
            // 황금 크릴: 먹으면 바로 어른
            if (f.golden && p.kind === 'gentoo' && p.stage < 2) {
              p.stage = 2; p.growth = s.growth[2];
              p.dropT = s.dropEvery * 0.3;
              this.emit('grow', { id: p.id, x: p.x, y: p.y, stage: 2, golden: true });
              break;
            }
            if (p.kind === 'gentoo' && p.stage < 2) {
              p.growth += food.nutrition;
              const need = s.growth[p.stage + 1];
              if (p.growth >= need) {
                p.stage++;
                p.dropT = s.dropEvery * this.rand(0.4, 0.8);
                this.emit('grow', { id: p.id, x: p.x, y: p.y, stage: p.stage });
              }
            }
            break;
          }
        }
      }

      // 코인 떨구기. 굶주리면 멈춤
      const drop = Array.isArray(s.drop) ? s.drop[p.stage] : s.drop;
      if (drop && p.hunger < C.HUNGER.starve) {
        p.dropT -= dt;
        if (p.dropT <= 0) {
          p.dropT = s.dropEvery * (this.trait.drop || 1) * this.rand(0.85, 1.15);
          this.spawnCoin(drop, p.x, p.y + r * 0.5, null, { canLuck: true });
          this.emit('poop', { id: p.id });
        }
      }

      // 황제펭귄은 알을 낳음
      if (s.layEvery && p.hunger < C.HUNGER.starve) {
        p.layT -= dt;
        if (p.layT <= 0) {
          p.layT = s.layEvery * this.rand(0.9, 1.1);
          // 젠투가 넉넉하면 안 낳음 — 먹이 주기가 감당 안 됨
          if (this.penguinCount < C.MAX_PENGUINS && this.countKind('gentoo') < C.EMPEROR_LAY_CAP) {
            const e = { id: this.nextId++, x: p.x, y: p.y + r * 0.6, vy: 30, hatchT: 4, landed: false };
            this.layEggs.push(e);
            this.emit('lay', { id: e.id, x: e.x, y: e.y });
          }
        }
      }
    }
  }

  wander(p, speed, dt) {
    p.retarget -= dt;
    const len = this.steer(p, p.tx, p.ty, speed, dt, 2);
    if (len < 30 || p.retarget <= 0) this.pickWander(p);
  }

  updateLayEggs(dt) {
    const { bottom } = this.b;
    for (let i = this.layEggs.length - 1; i >= 0; i--) {
      const e = this.layEggs[i];
      if (!e.landed) {
        e.y += e.vy * dt;
        e.vy = Math.min(90, e.vy + 60 * dt);
        if (e.y >= bottom - 16) { e.y = bottom - 16; e.landed = true; }
      }
      e.hatchT -= dt;
      if (e.hatchT <= 0) {
        this.layEggs.splice(i, 1);
        const p = this.addPenguin('gentoo', false, { x: e.x, y: e.y - 10 });
        p.vy = -60;
        this.emit('hatch', { id: p.id, eggId: e.id, x: e.x, y: e.y });
      }
    }
  }

  /* ---------- 천적 ---------- */
  updateAttacks(dt) {
    if (this.boss === 'coming') {
      this.bossT -= dt;
      if (this.bossT <= 0) {
        this.boss = 'here';
        const pr = this.spawnPred(this.L.boss);
        this.emit('bossIn', { id: pr.id, kind: pr.kind });
      }
      return;
    }
    if (this.boss === 'here' || !this.L.pred || this.preds.length) return;
    this.nextAttack -= dt;
    if (!this.warned && this.nextAttack <= C.PREDATOR_WARN) {
      this.warned = true;
      this.pendingKind = this.L.pred.kinds[Math.floor(this.rng() * this.L.pred.kinds.length)];
      this.emit('warn', { kind: this.pendingKind });
    }
    if (this.nextAttack <= 0) {
      const kind = this.pendingKind || this.L.pred.kinds[0];
      const pr = this.spawnPred(kind);
      // 후반엔 가끔 둘이 같이 옴
      if (this.trait.pair || (this.level >= 10 && this.rng() < 0.3)) this.spawnPred(this.L.pred.kinds[Math.floor(this.rng() * this.L.pred.kinds.length)]);
      this.emit('predIn', { id: pr.id, kind });
      const [a, b] = this.L.pred.every;
      this.nextAttack = this.rand(a, b) * (this.trait.every || 1);
      this.warned = false;
    }
  }

  spawnPred(kind) {
    const def = C.PREDATORS[kind];
    const { left, right, top, bottom } = this.b;
    const scale = C.predScale(this.level);
    const fromLeft = this.rng() < 0.5;
    const flying = kind === 'skua';
    const hp = Math.round(def.hp * (def.boss ? 1 : scale));
    const pr = {
      id: this.nextId++, kind, hp, max: hp,
      x: fromLeft ? left - def.r * 1.5 : right + def.r * 1.5,
      y: flying ? top - 40 : this.rand(top + 80, bottom - 80),
      vx: 0, vy: 0, face: fromLeft ? 1 : -1,
      eatCd: 1.2, stunT: 0, dashT: 0, dashCd: def.dashEvery || 0,
      guardT: 0, guardCd: def.guardEvery || 0, summoned: false,
      entering: true, retarget: 0, target: null, kbx: 0, kby: 0,
      mode: 'hunt', modeT: def.dive ? this.rand(...def.dive) : def.chargeEvery ? def.chargeEvery * this.rand(0.6, 1) : 0,
      aimT: 0, aimX: 0, aimY: 0, chargeT: 0, rageT: 0, rageHits: 0, combo: 0, comboT: 0,
      throwCd: def.throwEvery ? def.throwEvery * 0.6 : 0, diveCd: def.diveEvery ? def.diveEvery * 0.7 : 0, divedT: 0,
      reward: def.reward ? Math.round(def.reward * scale * (this.trait.reward || 1)) : 0
    };
    this.preds.push(pr);
    return pr;
  }

  hitPred(pr, dmg, x, y, by) {
    if (pr.hp <= 0) return;
    if (pr.guardT > 0) { this.emit('blocked', { id: pr.id, x, y }); return; }
    if (pr.divedT > 0) { this.emit('dodge', { id: pr.id, x, y }); return; }
    const def = C.PREDATORS[pr.kind];
    pr.hp -= dmg;
    // 연달아 맞을수록 덜 밀리고, 화났거나 돌격 중이면 안 밀림
    if (pr.comboT <= 0) pr.combo = 0;
    pr.combo++; pr.comboT = C.KNOCK.window;
    const dx = pr.x - x, dy = pr.y - y, len = Math.hypot(dx, dy) || 1;
    const push = pr.rageT > 0 || pr.chargeT > 0 || pr.dashT > 0 ? 0 : (def.boss ? C.KNOCK.boss : C.KNOCK.normal) / (1 + (pr.combo - 1) * C.KNOCK.combo);
    pr.kbx += dx / len * push; pr.kby += dy / len * push;
    this.emit('hit', { id: pr.id, x, y, by, dmg });
    if (def.rageAt && by === 'tap' && pr.hp > 0 && pr.rageT <= 0 && ++pr.rageHits >= def.rageAt) {
      pr.rageHits = 0; pr.rageT = C.RAGE.for;
      this.emit('rage', { id: pr.id, x: pr.x, y: pr.y });
    }
    if (pr.hp <= 0) this.killPred(pr);
  }

  killPred(pr) {
    const i = this.preds.indexOf(pr);
    if (i < 0) return;
    this.preds.splice(i, 1);
    this.kills++;
    const def = C.PREDATORS[pr.kind];
    this.emit('predDie', { id: pr.id, x: pr.x, y: pr.y, kind: pr.kind, boss: !!def.boss });
    const { left, right, top, bottom } = this.b;
    const x = clamp(pr.x, left + 30, right - 30), y = clamp(pr.y, top + 20, bottom - 30);
    if (def.boss) {
      this.boss = 'down';
      // 졸개가 남아 있으면 같이 도망
      for (const o of this.preds.slice()) { this.preds.splice(this.preds.indexOf(o), 1); this.emit('predFlee', { id: o.id, x: o.x, y: o.y }); }
      this.spawnCoin('egg', x, y, 0, { vy: -80 });
      for (let k = 0; k < 6; k++) this.spawnCoin('gold', x, y, null, { vx: this.rand(-140, 140), vy: this.rand(-180, -60) });
    } else if (pr.reward) {
      this.spawnCoin('chest', x, y, pr.reward, { vy: -60 });
    }
  }

  updatePreds(dt) {
    const { left, right, top, bottom } = this.b;
    const slow = this.hasPet('octopus') ? C.PETS.octopus.slow : 1;
    for (let i = this.preds.length - 1; i >= 0; i--) {
      const pr = this.preds[i];
      if (!pr) continue;
      const def = C.PREDATORS[pr.kind];
      pr.eatCd -= dt;
      pr.guardT = Math.max(0, pr.guardT - dt);
      pr.comboT -= dt;
      if (pr.rageT > 0) pr.rageT -= dt;

      // 넉백
      pr.x += pr.kbx * dt; pr.y += pr.kby * dt;
      const kd = Math.max(0, 1 - dt * 6); pr.kbx *= kd; pr.kby *= kd;

      // 기절하면 겨냥·돌격도 취소
      if (pr.stunT > 0) { pr.stunT -= dt; pr.vx *= 0.9; pr.vy *= 0.9; pr.aimT = 0; pr.chargeT = 0; this.clampPred(pr, def); continue; }

      if (def.dashEvery && pr.divedT <= 0) {
        pr.dashCd -= dt;
        if (pr.dashT > 0) { pr.dashT -= dt; if (pr.dashT <= 0) pr.straight = false; }
        else if (pr.aimT <= 0 && pr.dashCd <= 0 && !pr.entering && pr.target) {
          pr.dashCd = def.dashEvery;
          if (def.aimFor) this.startAim(pr, def.aimFor);
          else { pr.dashT = def.dashFor; this.emit('dash', { id: pr.id }); }
        }
      }
      if (def.guardEvery && !pr.entering) {
        pr.guardCd -= dt;
        if (pr.guardCd <= 0) { pr.guardT = def.guardFor; pr.guardCd = def.guardEvery; this.emit('guard', { id: pr.id }); }
      }
      if (def.summonAt && !pr.summoned && pr.hp < pr.max * def.summonAt) {
        pr.summoned = true;
        for (let k = 0; k < 2; k++) { const s = this.spawnPred('seal'); s.reward = 0; }
        this.emit('summon', { id: pr.id });
      }
      // 북극곰: 얼음덩이를 던져 펭귄을 잠깐 얼림 (톡 눌러 깰 수 있음)
      if (def.throwEvery && !pr.entering && pr.guardT <= 0) {
        pr.throwCd -= dt;
        if (pr.throwCd <= 0 && this.penguins.length) {
          pr.throwCd = def.throwEvery;
          const p = this.penguins[Math.floor(this.rng() * this.penguins.length)];
          const dx = p.x - pr.x, dy = p.y - pr.y, len = Math.hypot(dx, dy) || 1;
          this.projs.push({ id: this.nextId++, x: pr.x, y: pr.y - def.r * 0.3, vx: dx / len * 240, vy: dy / len * 240, t: 0, freeze: def.freeze });
          this.emit('throw', { id: pr.id });
        }
      }
      // 범고래: 잠수(공격 안 먹힘) → 떠오르며 돌진
      if (def.diveEvery && !pr.entering) {
        if (pr.divedT > 0) {
          pr.divedT -= dt;
          if (pr.divedT <= 0) { pr.dashT = def.dashFor; pr.dashCd = def.dashEvery; this.emit('surface', { id: pr.id, x: pr.x, y: pr.y }); }
        } else if (pr.dashT <= 0 && (pr.diveCd -= dt) <= 0) {
          pr.diveCd = def.diveEvery; pr.divedT = def.diveFor;
          this.emit('dive', { id: pr.id, x: pr.x, y: pr.y });
        }
      }

      // 목표: 가까운 펭귄. 아기·꼬마는 더 노림. 급강하 중엔 안 바꿈
      pr.retarget -= dt;
      if (!pr.target || !this.penguins.includes(pr.target) || (pr.retarget <= 0 && pr.mode !== 'dive')) {
        pr.retarget = 0.6;
        let best = null, bd = Infinity;
        for (const p of this.penguins) {
          if (p.entering) continue;
          const d = Math.sqrt(d2(pr.x, pr.y, p.x, p.y)) - (p.stage === 0 ? 140 : p.stage === 1 ? 60 : 0);
          if (d < bd) { bd = d; best = p; }
        }
        pr.target = best;
      }

      const speed = def.speed * slow * (pr.rageT > 0 ? C.RAGE.mul : 1) * (pr.dashT > 0 ? def.dashMul : 1) * (pr.guardT > 0 ? 0.35 : 1) * (pr.divedT > 0 ? 1.15 : 1);
      const straight = pr.chargeT > 0 || (pr.dashT > 0 && pr.straight);

      if (pr.aimT > 0) {
        // 겨냥: 거의 멈춰서 빨간 예고선. 끝나면 그 방향으로 일직선
        pr.aimT -= dt; pr.vx *= 0.85; pr.vy *= 0.85;
        if (pr.aimT <= 0) {
          const dx = pr.aimX - pr.x, dy = pr.aimY - pr.y, len = Math.hypot(dx, dy) || 1;
          const mul = def.chargeEvery ? def.chargeMul : def.dashMul;
          pr.cvx = dx / len * def.speed * slow * mul; pr.cvy = dy / len * def.speed * slow * mul;
          if (def.chargeEvery) pr.chargeT = def.chargeFor; else { pr.dashT = def.dashFor; pr.straight = true; }
          this.emit('dash', { id: pr.id });
        }
      } else if (straight) {
        pr.vx = pr.cvx; pr.vy = pr.cvy;
        if (pr.chargeT > 0 && (pr.chargeT -= dt) <= 0) pr.modeT = def.chargeEvery * this.rand(0.8, 1.2);
      } else if (def.dive) {
        // 갈매기: 수면 위를 돌다가 급강하 → 다시 날아오름
        if (pr.mode === 'dive') {
          pr.modeT -= dt;
          if (pr.target) this.steer(pr, pr.target.x, pr.target.y, speed * def.diveMul, dt, 7);
          if (pr.modeT <= 0 || !pr.target) pr.mode = 'rise';
        } else if (pr.mode === 'rise') {
          this.steer(pr, pr.x + pr.face * 80, top - 20, speed * 1.3, dt, 4);
          if (pr.y < top + 10) { pr.mode = 'hover'; pr.modeT = this.rand(...def.dive); }
        } else {
          pr.mode = 'hover';
          const tx = pr.target ? pr.target.x : (left + right) / 2;
          this.steer(pr, tx + Math.sin(this.t * 1.3 + pr.id) * 120, top - 10, speed * 0.9, dt, 2.5);
          pr.modeT -= dt;
          if (pr.modeT <= 0 && pr.target && !pr.entering) { pr.mode = 'dive'; pr.modeT = 1.5; this.emit('swoop', { id: pr.id }); }
        }
      } else if (def.chargeEvery) {
        // 상어: 목표 둘레를 빙빙 → 겨냥 → 돌격
        if (pr.target) {
          const ang = Math.atan2(pr.y - pr.target.y, pr.x - pr.target.x) + 0.9;
          this.steer(pr, pr.target.x + Math.cos(ang) * 170, pr.target.y + Math.sin(ang) * 170, speed, dt, 2.5);
        } else this.predWander(pr, speed, dt);
        pr.modeT -= dt;
        if (pr.modeT <= 0 && pr.target && !pr.entering) this.startAim(pr, def.aimFor);
      } else if (pr.target) {
        this.steer(pr, pr.target.x, pr.target.y, speed, dt, pr.dashT > 0 || pr.rageT > 0 ? 6 : 2.2);
      } else this.predWander(pr, speed, dt);

      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      // 물범: 지그재그
      if (def.zigzag && !straight) {
        const len = Math.hypot(pr.vx, pr.vy) || 1, w = Math.sin(this.t * 3.4 + pr.id) * def.zigzag * dt * (pr.rageT > 0 ? 0.3 : 1);
        pr.x += -pr.vy / len * w; pr.y += pr.vx / len * w;
      }
      if (Math.abs(pr.vx) > 8) pr.face = pr.vx > 0 ? 1 : -1;
      if (pr.entering && pr.x > left + def.r && pr.x < right - def.r && pr.y > (def.dive ? top - 60 : top)) pr.entering = false;
      const bx = pr.x, by = pr.y;
      this.clampPred(pr, def);
      // 대왕물범: 돌진하다 벽에 부딪히면 튕김
      if (straight && def.bounce && (pr.x !== bx || pr.y !== by)) {
        if (pr.x !== bx) pr.cvx = -pr.cvx;
        if (pr.y !== by) pr.cvy = -pr.cvy;
        this.emit('bounce', { id: pr.id, x: pr.x, y: pr.y });
      }

      // 잡아먹기. 돌격·급강하·돌진 중엔 길에 걸린 펭귄 아무나
      if (pr.eatCd <= 0 && pr.divedT <= 0) {
        let p = null;
        const reach = q => def.r * 0.7 + this.radius(q) * 0.7;
        if (straight || pr.mode === 'dive' || pr.dashT > 0) {
          for (const q of this.penguins) if (!q.entering && d2(pr.x, pr.y, q.x, q.y) < reach(q) ** 2) { p = q; break; }
        } else if (pr.target && d2(pr.x, pr.y, pr.target.x, pr.target.y) < reach(pr.target) ** 2) p = pr.target;
        if (p) {
          pr.eatCd = def.boss ? 1.4 : 1.1;
          if (pr.mode === 'dive') pr.mode = 'rise';
          const dol = this.hasPet('dolphin') ? this.pet('dolphin') : null;
          if (dol && dol.cd <= 0) {
            dol.cd = C.PETS.dolphin.every;
            const toRight = pr.x < (left + right) / 2;
            p.x = toRight ? right - 60 : left + 60; p.y = clamp(p.y, top + 60, bottom - 60);
            p.vx = 0; p.vy = 0;
            pr.eatCd = 2;
            this.emit('rescue', { id: p.id, x: p.x, y: p.y, from: { x: pr.x, y: pr.y } });
          } else {
            const j = this.penguins.indexOf(p);
            if (j >= 0) this.penguins.splice(j, 1);
            this.lost++;
            if (pr.target === p) pr.target = null;
            this.emit('eaten', { id: p.id, predId: pr.id, x: p.x, y: p.y, kind: p.kind, stage: p.stage });
          }
        }
      }
    }
  }

  startAim(pr, t) {
    if (!pr.target) return;
    pr.aimT = t; pr.aimFor = t;
    // 겨냥 시작 때 자리를 찍음 → 펭귄이 도망치면 빗나갈 수 있음
    pr.aimX = pr.target.x; pr.aimY = pr.target.y;
    this.emit('aim', { id: pr.id });
  }

  predWander(pr, speed, dt) {
    const { left, right, top, bottom } = this.b;
    if (!pr.wx || pr.retarget < 0.05) { pr.wx = this.rand(left + 60, right - 60); pr.wy = this.rand(top + 60, bottom - 60); }
    this.steer(pr, pr.wx, pr.wy, speed * 0.6, dt, 1.5);
  }

  updateProjs(dt) {
    const { left, right, top, bottom } = this.b;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pj = this.projs[i];
      pj.t += dt; pj.x += pj.vx * dt; pj.y += pj.vy * dt;
      let hit = null;
      for (const p of this.penguins) if (!p.entering && !(p.frozenT > 0) && d2(pj.x, pj.y, p.x, p.y) < (this.radius(p) + 14) ** 2) { hit = p; break; }
      if (hit) {
        hit.frozenT = pj.freeze;
        this.projs.splice(i, 1);
        this.emit('freeze', { id: hit.id, projId: pj.id, x: hit.x, y: hit.y });
      } else if (pj.t > 3 || pj.x < left - 40 || pj.x > right + 40 || pj.y < top - 60 || pj.y > bottom + 20) {
        this.projs.splice(i, 1);
        this.emit('projGone', { id: pj.id });
      }
    }
  }

  /* ---------- 깜짝 이벤트 ---------- */
  updateEvents(dt) {
    const E = C.EVENTS, { left, right, top } = this.b;
    if (this.rainT > 0) {
      this.rainT -= dt; this.rainAcc += dt;
      while (this.rainAcc >= E.rainEvery) {
        this.rainAcc -= E.rainEvery;
        const r = this.rng(), w = this.L.world;
        const type = w === 0 ? (r < 0.7 ? 'silver' : 'gold') : w === 1 ? (r < 0.75 ? 'gold' : 'pearl') : (r < 0.6 ? 'gold' : r < 0.95 ? 'pearl' : 'diamond');
        this.spawnCoin(type, this.rand(left + 30, right - 30), top + 5, null, { vy: 20, canLuck: true });
      }
    }
    if (this.level === 0 || this.boss !== 'none' || this.over) return;
    this.nextEvent -= dt;
    if (this.nextEvent > 0 || this.preds.length || this.rainT > 0) return;
    this.nextEvent = this.rand(...E.every);
    const kinds = ['rain', 'chest', 'krill'];
    const kind = kinds[Math.floor(this.rng() * kinds.length)];
    if (kind === 'rain') { this.rainT = E.rainFor; this.rainAcc = 0; }
    else if (kind === 'chest') {
      const fromLeft = this.rng() < 0.5;
      const c = this.spawnCoin('chest', fromLeft ? left - 40 : right + 40, top + 40, Math.round(this.L.eggs[0] * E.chest), { floatT: 99 });
      c.vx = (fromLeft ? 1 : -1) * (right - left + 120) / E.chestFloat;
    } else this.dropFood(this.rand(left + 60, right - 60), top + 4, true, true);
    this.emit('event', { kind });
  }

  /** 해류: 먹이·코인이 옆으로 천천히 흘렀다 돌아옴 */
  drift() { return this.trait.drift ? this.trait.drift * Math.sin(this.t * 0.45) : 0; }
  coinLife() { return this.trait.floorLife || C.COIN_FLOOR_LIFE; }

  clampPred(pr, def) {
    if (pr.entering) return;
    const { left, right, top, bottom } = this.b;
    const r = def.r * 0.8;
    const minY = pr.kind === 'skua' ? top - 20 : top + r * 0.5;
    pr.x = clamp(pr.x, left + r, right - r);
    pr.y = clamp(pr.y, minY, bottom - r * 0.8);
  }

  /* ---------- 친구들 ---------- */
  updatePets(dt) {
    const { left, right, top, bottom } = this.b;
    const claimed = new Set();      // 해달이 여럿이면 서로 다른 펭귄을 챙김
    for (const p of this.pets) {
      const def = C.PETS[p.kind];
      if (p.cd > 0) p.cd -= dt;
      switch (p.kind) {
        case 'crab': {
          p.y = bottom - p.floor;
          let best = null, bd = Infinity;
          for (const c of this.coins) { if (c.y < bottom - 110) continue; const d = Math.abs(c.x - p.x) + (bottom - c.y) * 0.5; if (d < bd) { bd = d; best = c; } }
          const tx = best ? best.x : (p.tx || (p.tx = this.rand(left + 30, right - 30)));
          const dx = tx - p.x;
          p.vx = Math.abs(dx) > 4 ? Math.sign(dx) * 75 : 0;
          if (!best && Math.abs(dx) < 6) p.tx = this.rand(left + 30, right - 30);
          p.x = clamp(p.x + p.vx * dt, left + 20, right - 20);
          if (best && Math.abs(best.x - p.x) < 32 && best.y > bottom - 56) this.collect(best, 'crab');
          break;
        }
        case 'otter': {
          p.y = top + 18;
          let hungry = null;
          for (const q of this.penguins) if (!claimed.has(q) && q.hunger >= this.seekAt(q) && (!hungry || q.hunger > hungry.hunger)) hungry = q;
          if (hungry) claimed.add(hungry);
          const tx = hungry ? hungry.x : (p.tx || (p.tx = this.rand(left + 40, right - 40)));
          const dx = tx - p.x;
          p.vx += ((Math.abs(dx) > 5 ? Math.sign(dx) * 90 : 0) - p.vx) * Math.min(1, dt * 3);
          if (!hungry && Math.abs(dx) < 8) p.tx = this.rand(left + 40, right - 40);
          p.x = clamp(p.x + p.vx * dt, left + 30, right - 30);
          if (Math.abs(p.vx) > 5) p.face = p.vx > 0 ? 1 : -1;
          if (p.cd <= 0 && hungry && !this.preds.length) {
            p.cd = def.every;
            this.dropFood(p.x, top + 30, true);
            this.emit('otterFeed', { x: p.x, y: top + 20 });
          }
          break;
        }
        case 'clam': {
          p.y = bottom - p.floor;
          if (p.cd <= 0) { p.cd = def.every; this.spawnCoin('pearl', p.x, p.y - 16, null, { vy: -120 }); this.emit('clam', { id: p.id }); }
          break;
        }
        case 'starfish': {
          p.y = bottom - p.floor;
          for (const c of this.coins.slice()) if (c.age > def.after && c.type !== 'egg' && !(c.floatT > 0)) this.collect(c, 'star');
          break;
        }
        case 'whale': {
          this.floatAround(p, dt, 45, true);
          if (p.cd <= 0) {
            p.cd = def.every;
            for (let k = 0; k < def.coins; k++) this.spawnCoin('silver', p.x, p.y - 10, null, { vx: this.rand(-160, 160), vy: this.rand(-260, -120), canLuck: true });
            this.emit('spout', { id: p.id, x: p.x, y: p.y });
          }
          break;
        }
        case 'puffer': {
          this.floatAround(p, dt, 55);
          if (p.cd <= 0 && this.preds.length) {
            const n = this.nearestPred(p.x, p.y);
            p.cd = def.every;
            n.pr.stunT = def.stun;
            this.emit('puff', { id: p.id, predId: n.pr.id, x: p.x, y: p.y });
          }
          break;
        }
        case 'jelly': {
          this.floatAround(p, dt, 25);
          if (p.cd <= 0 && this.preds.length) {
            const n = this.nearestPred(p.x, p.y);
            p.cd = def.every;
            this.emit('zap', { id: p.id, predId: n.pr.id, x: p.x, y: p.y, tx: n.pr.x, ty: n.pr.y });
            this.hitPred(n.pr, def.dmg, p.x, p.y, 'jelly');
          }
          break;
        }
        default:
          this.floatAround(p, dt, p.kind === 'dolphin' ? 80 : 35, p.kind === 'octopus');
      }
    }
  }

  floatAround(p, dt, speed, low) {
    p.retarget -= dt;
    const len = this.steer(p, p.tx || p.x, p.ty || p.y, speed, dt, 1.5);
    if (len < 20 || p.retarget <= 0) this.pickWander(p, low);
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (Math.abs(p.vx) > 5) p.face = p.vx > 0 ? 1 : -1;
  }

  checkLose() {
    if (this.penguins.length || this.layEggs.length) return;
    if (this.hasPet('clam') || this.hasPet('whale')) return;
    let pot = this.money;
    for (const c of this.coins) pot += c.value;
    if (pot < C.SPECIES.gentoo.price) {
      this.over = 'lose';
      this.emit('lose', {});
    }
  }

  /* ---------- 이어하기 ---------- */
  serialize() {
    const keep = ['level', 't', 'money', 'eggs', 'foodTier', 'foodMax', 'weapon', 'otterBuys', 'kills', 'lost', 'earned', 'nextAttack', 'nextEvent', 'nextId', 'boss', 'bossT'];
    const o = {};
    for (const k of keep) o[k] = this[k];
    o.penguins = this.penguins.map(p => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, hunger: p.hunger, growth: p.growth, stage: p.stage, dropT: p.dropT, layT: p.layT }));
    o.coins = this.coins.filter(c => c.type === 'egg').map(c => ({ id: c.id, x: c.x, y: c.y }));
    o.layEggs = this.layEggs.map(e => ({ id: e.id, x: e.x, y: e.y, hatchT: e.hatchT }));
    return o;
  }

  static restore(o, opts = {}) {
    const s = new Sim(o.level, opts);
    s.penguins = []; s.coins = []; s.layEggs = [];
    for (const k of ['t', 'money', 'eggs', 'foodTier', 'foodMax', 'weapon', 'kills', 'lost', 'earned', 'nextAttack', 'nextEvent', 'nextId', 'boss', 'bossT']) if (o[k] != null) s[k] = o[k];
    for (let k = 0; k < (o.otterBuys || 0); k++) { s.otterBuys++; s.addPet('otter'); }
    // 보스가 오던 중이거나 싸우던 중이었으면 다시 예고부터
    if (s.boss === 'here' || s.boss === 'coming') { s.boss = 'coming'; s.bossT = C.PREDATOR_WARN + 1; }
    if (!isFinite(s.nextAttack) && s.L.pred) s.nextAttack = s.L.pred.first;
    s.nextAttack = Math.max(s.nextAttack, 20);
    s.nextId = Math.max(s.nextId, 1000);
    for (const q of o.penguins || []) {
      const p = s.addPenguin(q.kind, true, { x: q.x, y: q.y });
      Object.assign(p, { hunger: Math.min(q.hunger, C.HUNGER.seek), growth: q.growth, stage: q.stage, dropT: q.dropT, layT: q.layT });
    }
    for (const c of o.coins || []) s.spawnCoin('egg', c.x, c.y, 0);
    for (const e of o.layEggs || []) s.layEggs.push({ id: s.nextId++, x: e.x, y: e.y, vy: 0, hatchT: e.hatchT, landed: false });
    s.events = [];
    if (s.boss === 'coming') s.emit('bossWarn', { kind: s.L.boss });
    return s;
  }
}
