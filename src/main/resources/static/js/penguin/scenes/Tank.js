/* 수조 한 판. 규칙은 core/sim.js 가 돌리고, 여기는 그리기·입력·연출·상점만 함 */
import Phaser from 'phaser';
import { Sim } from '../core/sim.js';
import * as C from '../core/config.js';
import { Sound } from '../core/audio.js';
import { save, persist, recordClear, medalOf } from '../meta/save.js';
import { T, fmt, mmss, num } from '../meta/i18n.js';
import { setupCamera, PS } from '../art/dpr.js';
import { P, WORLDS, css, INK } from '../art/palette.js';
import { penguinKey, FOOD_KEYS } from '../art/textures.js';
import { drawWater } from './water.js';
import { button, text, panel, dim, hudReserve } from './ui.js';
import { levelCard, startBonus, medalName } from './levelCard.js';

const SHOP = ['gentoo', 'chinstrap', 'emperor', 'macaroni', 'rainbow', 'food', 'foodCount', 'weapon', 'otter'];
const MEDAL_COLOR = { gold: 0xffc21a, silver: 0xd5dde6, bronze: 0xe0925f };

export class Tank extends Phaser.Scene {
  constructor() { super('Tank'); }

  init(data) {
    this.levelIdx = data.level || 0;
    this.resume = !!data.resume && save.snap && save.snap.level === this.levelIdx;
    this.fromCard = !!data.fromCard;
  }

  create() {
    const { W, H } = setupCamera(this);
    this.W = W; this.H = H;
    this.L = C.LEVELS[this.levelIdx];
    this.world = WORLDS[this.L.world];
    this.ended = false;
    this.paused = false;
    this.frameNo = 0;
    // 씬 인스턴스는 판마다 재사용됨 → 지난 판의 참조를 비움
    this.bannerObjs = null; this.toastObjs = null; this.pointer = null;
    this.tutCoinShown = false; this.downInWater = false;
    this.tweens.resumeAll(); this.time.paused = false;
    this.views = { pen: new Map(), food: new Map(), coin: new Map(), pred: new Map(), pet: new Map(), egg: new Map(), proj: new Map() };
    this.statics = [];
    this.toldItem = new Set();
    this.hintT = 0;

    this.layout();
    const bounds = this.bounds();
    this.bonus = this.resume ? null : startBonus(this.levelIdx);
    this.sim = this.resume ? Sim.restore(save.snap, { bounds }) : new Sim(this.levelIdx, { bounds, bonus: this.bonus ? this.bonus.coins : 0 });
    this.petSaid = {};
    this.buildStatic();

    this.input.on('pointerdown', (p, over) => this.onDown(p, over));
    this.input.on('pointermove', p => { if (p.isDown && !this.ended && this.downInWater) this.sim.sweep(p.worldX, p.worldY); });
    this.input.on('pointerup', () => { this.downInWater = false; });
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());

    this.time.addEvent({ delay: 8000, loop: true, callback: () => this.snapshot() });
    this._onHide = () => { if (document.hidden) this.snapshot(); };
    document.addEventListener('visibilitychange', this._onHide);
    this.events.once('shutdown', () => { document.removeEventListener('visibilitychange', this._onHide); this.showPauseUi(false); });

    document.getElementById('btn-pause').style.display = 'block';
    Sound.setWorld(this.L.world); Sound.intensity = 0; Sound.push = false;
    Sound.bgm('calm');

    this.tut = this.levelIdx === 0 && !this.resume ? 0 : -1;
    // 지도 카드를 거치지 않고 들어온 판(첫 판·다음 레벨)은 멈춘 채 같은 카드를 먼저 보여줌
    this.intro = !this.resume && !this.fromCard;
    if (this.intro) this.showIntro();
    else this.startPlay(this.resume ? (this.L.boss ? T.goalBoss : T.goal) : null);
    // 처음 뜬 천적 설명은 한 번만
    this.seenPredHint = !!save.seenPredHint;
  }

  /* ---------------- 배치 ---------------- */
  layout() {
    const W = this.W, H = this.H;
    this.wide = W >= 900;
    this.hudH = 84;
    this.waterTop = 104;
    this.slotH = 80;
    this.rows = this.wide ? 1 : 2;
    this.shopH = this.rows * this.slotH + (this.rows - 1) * 8 + 22;
    this.floorY = H - this.shopH - 18;
  }
  bounds() { return { left: 6, right: this.W - 6, top: this.waterTop + 8, bottom: this.floorY - 4 }; }

  relayout() {
    const { W, H } = setupCamera(this);
    this.W = W; this.H = H;
    this.layout();
    this.sim.setBounds(this.bounds());
    for (const o of this.statics) o.destroy();
    this.statics = [];
    this.buildStatic();
    if (this.intro) { this.introClose(); this.showIntro(); }
  }

  showIntro() {
    this.paused = true;
    document.getElementById('btn-pause').style.display = 'none';
    this.introClose = levelCard(this, this.levelIdx, [{ label: T.go, primary: true, onClick: () => {
      this.introClose();
      this.intro = false;
      this.paused = false;
      document.getElementById('btn-pause').style.display = 'block';
      this.startPlay();
    } }]);
  }

  /** 판 시작 연출: 레벨 이름 + (보너스) + 새 친구 소개. 이어하기면 목표만 다시 알려줌 */
  startPlay(sub) {
    const b = this.bonus;
    const tr = this.L.trait ? T.traits[this.L.trait] : null;
    this.banner(fmt(T.levelName, this.levelIdx + 1, T.worlds[this.L.world]), {
      sub: sub || [tr ? `${T.traitTitle}: ${tr[0]} — ${tr[1]}` : this.L.boss ? T.goalBoss : T.goal, b ? fmt(T.bonusBanner, medalName(b.medal), b.coins) : ''].filter(Boolean).join('\n'), hold: tr ? 2800 : 1800
    });
    // 처음 만나는 친구만 이름표 (후반엔 친구가 10마리라 전부 띄우면 화면을 덮음)
    const seen = save.seenPets || [];
    this.tagPets = new Set(this.sim.petKeys.filter(k => !seen.includes(k)));
    if (this.tagPets.size) { save.seenPets = [...new Set([...seen, ...this.sim.petKeys])]; persist(); }
    const h = this.levelIdx > 0 && !this.resume ? C.HATCH[this.levelIdx - 1] : null;
    if (h) this.time.delayedCall(2400, () => { if (!this.ended) this.toast(fmt(T.newFriendToast, T.reward[h.key][0], T.reward[h.key][1]), 4200); });
  }

  /** 친구가 능력을 쓸 때 한마디. 판마다 친구별 3번까지만 (자주 쓰는 친구가 화면을 덮지 않게) */
  petSay(kind, x, y) {
    const n = this.petSaid[kind] || 0;
    if (n >= 3 || !T.petSay[kind]) return;
    this.petSaid[kind] = n + 1;
    this.floatText(x, y - 34, T.petSay[kind], '#fff3a0', 15);
  }

  buildStatic() {
    const W = this.W, H = this.H;
    this.statics.push(drawWater(this, W, H, this.world, this.waterTop, this.floorY));
    const dark = this.sim.trait.dark;
    if (dark) this.statics.push(this.add.rectangle(W / 2, (this.waterTop + this.floorY) / 2, W, this.floorY - this.waterTop + 40, 0x020814, dark).setDepth(21));
    this.buildHud();
    this.buildShop();
  }

  keep(o) { this.statics.push(o); return o; }

  /* ---------------- 상단 HUD ---------------- */
  buildHud() {
    const W = this.W;
    const g = this.keep(this.add.graphics().setDepth(100));
    // 돈
    g.fillStyle(INK, 0.85); g.fillRoundedRect(12, 12, 176, 46, 23);
    g.fillStyle(0xffffff, 0.12); g.fillRoundedRect(16, 15, 168, 16, 8);
    this.coinIcon = this.keep(this.add.image(36, 35, 'coin-gold').setDepth(101).setScale(0.85));
    this.moneyText = this.keep(text(this, 56, 36, num(this.sim.money), { size: 26, ox: 0, color: '#ffe680', thick: 0, stroke: false }).setDepth(101));
    this.lastMoney = -1;
    // 레벨 · 흐른 시간 · 지금 깨면 받는 메달과 그 마감 시간 (시간 제한은 없음)
    g.fillStyle(INK, 0.85); g.fillRoundedRect(12, 64, 176, 30, 15);
    this.lvText = this.keep(text(this, 24, 79, fmt(T.level, this.levelIdx + 1), { size: 14, ox: 0, color: '#b9c9e6', thick: 0, stroke: false }).setDepth(101));
    this.timeText = this.keep(text(this, 66, 79, '0:00', { size: 18, ox: 0, color: '#ffffff', thick: 0, stroke: false }).setDepth(101));
    this.medalDot = this.keep(this.add.graphics().setDepth(101));
    this.medalText = this.keep(text(this, 140, 79, '', { size: 14, ox: 0, color: '#ffffff', thick: 0, stroke: false }).setDepth(101));
    this.medalTier = null;

    // 황금알 (오른쪽 위, 일시정지 버튼 왼쪽)
    // 오른쪽 위 HTML 버튼 자리를 비움. 좁아서 돈 칸과 겹치면 돈 칸 바로 옆에
    const ex = Math.max(196 + 85, W - hudReserve(this).w - 92), ey = 42;
    const eb = this.keep(this.add.container(ex, ey).setDepth(101));
    const bg = this.add.graphics();
    eb.add(bg);
    const eggDim = this.add.image(-58, 0, 'egg-big').setScale(0.3).setTintFill(0x5b6b8c).setAlpha(0.9);
    const eggFill = this.add.image(-58, 0, 'egg-big').setScale(0.3);
    const eggLines = this.add.graphics();
    const l1 = text(this, 18, -12, T.eggButton, { size: 13, color: '#ffffff', thick: 0, stroke: false });
    const l2 = text(this, 18, 11, '', { size: 20, color: '#ffe680', thick: 0, stroke: false });
    eb.add([eggDim, eggFill, eggLines, l1, l2]);
    eb.setSize(170, 70).setInteractive({ useHandCursor: true });
    eb.on('pointerdown', () => { eb.setScale(0.95); Sound.unlock(); });
    eb.on('pointerout', () => eb.setScale(1));
    eb.on('pointerup', () => { eb.setScale(1); this.tryBuy('egg', eb); });
    this.egg = { box: eb, bg, fill: eggFill, lines: eggLines, l2, sig: '' };

    // 보스 체력바
    this.bossBar = this.keep(this.add.graphics().setDepth(102));
    this.bossName = this.keep(text(this, W / 2, this.hudH + 20, '', { size: 16, color: '#ffffff', thick: 4 }).setDepth(103));
  }

  updateHud() {
    const s = this.sim;
    if (Math.floor(s.money) !== this.lastMoney) {
      this.lastMoney = Math.floor(s.money);
      this.moneyText.setText(num(s.money));
    }
    this.timeText.setText(mmss(s.t));
    // 판이 커질수록 음악도: 펭귄 5·10마리, 황금알 조각마다 악기가 늘고 마지막 조각 앞에선 살짝 빨라짐
    const pc = s.penguins.length;
    Sound.intensity = Math.min(3, (pc >= 5 ? 1 : 0) + (pc >= 10 ? 1 : 0) + s.eggs);
    Sound.push = s.eggs >= 2 && !this.L.boss;
    const par = this.L.par;
    const tier = s.t <= par ? 'gold' : s.t <= par * 1.5 ? 'silver' : 'bronze';
    if (tier !== this.medalTier) {
      if (this.medalTier === 'gold') this.toast(fmt(T.goldPassed, mmss(par * 1.5)), 2600);
      else if (this.medalTier === 'silver') this.toast(T.silverPassed, 2600);
      this.medalTier = tier;
      this.medalDot.clear();
      this.medalDot.fillStyle(0x000000, 0.4); this.medalDot.fillCircle(128, 79, 8);
      this.medalDot.fillStyle(MEDAL_COLOR[tier], 1); this.medalDot.fillCircle(128, 79, 6.5);
      this.medalText.setText(tier === 'gold' ? mmss(par) : tier === 'silver' ? mmss(par * 1.5) : T.medalBronze).setColor(css(MEDAL_COLOR[tier]));
    }

    // 황금알 칸
    const st = s.shopState('egg');
    const sig = st + s.eggs + s.price('egg');
    if (sig !== this.egg.sig) {
      this.egg.sig = sig;
      const { bg, fill, lines, l2 } = this.egg;
      bg.clear();
      const ok = st === 'ok';
      bg.fillStyle(INK, 0.9); bg.fillRoundedRect(-85, -32, 170, 64, 20);
      bg.fillStyle(ok ? P.accent : 0x3a4660, ok ? 1 : 0.9); bg.fillRoundedRect(-82, -29, 164, 58, 18);
      if (ok) { bg.fillStyle(0xffffff, 0.3); bg.fillRoundedRect(-76, -25, 152, 16, 8); }
      const f = s.eggs / 3, fr = fill.frame;
      fill.setCrop(0, fr.realHeight * (1 - f), fr.realWidth, fr.realHeight * f);
      lines.clear(); lines.lineStyle(2, INK, 0.7);
      for (let i = 1; i < 3; i++) { const y = 22 - i * 14.6; lines.beginPath(); lines.moveTo(-73, y); lines.lineTo(-43, y); lines.strokePath(); }
      l2.setText(st === 'boss' ? T.eggBoss : st === 'max' ? T.clear : `${num(s.price('egg'))}`).setColor(ok ? css(P.uiDark) : '#ffe680');
      this.egg.box.list[4].setColor(ok ? css(P.uiDark) : '#ffffff').setText(`${T.eggButton} ${s.eggs}/3`);
      l2.setFontSize(st === 'boss' ? 13 : 20);
      if (ok && !this.egg.pulse) this.egg.pulse = this.tweens.add({ targets: this.egg.box, scale: 1.06, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      if (!ok && this.egg.pulse) { this.egg.pulse.stop(); this.egg.pulse = null; this.egg.box.setScale(1); }
    }

    // 보스 체력
    const boss = s.preds.find(p => C.PREDATORS[p.kind].boss);
    this.bossBar.clear();
    if (boss) {
      const w = Math.min(420, this.W * 0.6), x = (this.W - w) / 2, y = this.hudH + 34;
      this.bossBar.fillStyle(INK, 0.9); this.bossBar.fillRoundedRect(x - 4, y - 4, w + 8, 20, 10);
      this.bossBar.fillStyle(0x552233, 1); this.bossBar.fillRoundedRect(x, y, w, 12, 6);
      this.bossBar.fillStyle(boss.guardT > 0 ? 0x9fb8d9 : P.bad, 1); this.bossBar.fillRoundedRect(x, y, Math.max(0, w * boss.hp / boss.max), 12, 6);
      this.bossName.setText(T.predNames[boss.kind]).setVisible(true);
    } else this.bossName.setVisible(false);
  }

  /* ---------------- 하단 상점 ---------------- */
  buildShop() {
    const W = this.W, H = this.H;
    const top = H - this.shopH;
    const g = this.keep(this.add.graphics().setDepth(99));
    g.fillStyle(INK, 1); g.fillRoundedRect(4, top - 4, W - 8, this.shopH, 22);
    g.fillStyle(0x2a3654, 1); g.fillRoundedRect(8, top, W - 16, this.shopH - 8, 20);
    const per = Math.ceil(SHOP.length / this.rows), gap = 8;
    const sw = (W - 24 - gap * (per - 1)) / per, sh = this.slotH;
    this.slots = SHOP.map((item, i) => {
      const row = Math.floor(i / per), col = i % per;
      const x = 12 + col * (sw + gap) + sw / 2, y = top + 8 + row * (sh + gap) + sh / 2;
      const c = this.keep(this.add.container(x, y).setDepth(100));
      const bg = this.add.graphics();
      const icon = this.add.image(0, -15, 'dot');
      const big = this.rows > 1;   // 폰: 칸이 좁고 화면이 축소되니 글씨를 키움
      const name = text(this, 0, big ? 14 : 13, '', { size: big ? 14 : 12, color: '#ffffff', thick: 3 });
      const price = text(this, 0, big ? 31 : 29, '', { size: big ? 17 : 15, color: '#ffe680', thick: 3 });
      const lock = this.add.image(sw / 2 - 16, -sh / 2 + 16, 'lock').setScale(0.8);
      c.add([bg, icon, name, price, lock]);
      c.setSize(sw, sh).setInteractive({ useHandCursor: true });
      // 꾹 누르면(0.4초) 사지 않고 설명만
      const cancel = () => { if (c.holdT) { c.holdT.remove(); c.holdT = null; } };
      c.on('pointerdown', () => {
        c.setScale(0.94); Sound.unlock(); c.held = false; cancel();
        c.holdT = this.time.delayedCall(400, () => { c.holdT = null; c.held = true; c.setScale(1); this.itemInfo(item); });
      });
      c.on('pointerout', () => { c.setScale(1); cancel(); });
      c.on('pointerup', () => { c.setScale(1); cancel(); if (c.held) { c.held = false; return; } this.tryBuy(item, c); });
      return { item, c, bg, icon, name, price, lock, sw, sh, sig: '' };
    });
  }

  slotView(item) {
    const s = this.sim;
    const st = s.shopState(item);
    let icon, name = T.shop[item], price = num(s.price(item)), iconScale = 1;
    if (C.SPECIES[item]) { icon = item === 'gentoo' ? 'pg-gentoo-2-a' : `pg-${item}-a`; }
    if (item === 'food') { const n = Math.min(s.foodTier + 1, C.FOOD.length - 1); icon = FOOD_KEYS[n]; name = st === 'max' ? T.foodNames[s.foodTier] : fmt(T.nextFood, T.foodNames[n]); iconScale = 1.3; }
    if (item === 'foodCount') { icon = 'food-krill'; name = `${T.shop.foodCount} (${s.foodMax})`; iconScale = 1.3; }
    if (item === 'weapon') { icon = 'snowball'; name = `${T.shop.weapon} Lv${s.weapon + 1}`; iconScale = 0.9; }
    if (item === 'otter') { icon = 'pet-otter'; name = `${T.shop.otter} (${s.otterBuys})`; }
    if (st === 'locked') price = fmt(T.unlockAfter, this.unlockLevel(item));
    if (st === 'max') price = T.max;
    if (st === 'full') price = T.full;
    return { st, icon, name, price, iconScale };
  }

  unlockLevel(item) {
    if (C.SPECIES[item]) return C.SPECIES[item].unlock;
    if (item === 'food') return C.FOOD[this.sim.foodTier + 1].unlock;
    if (item === 'otter') return C.HATCH.findIndex(h => h.key === 'otter') + 1;
    return 0;
  }

  updateShop() {
    for (const sl of this.slots) {
      const v = this.slotView(sl.item);
      const sig = v.st + v.icon + v.name + v.price;
      if (sig === sl.sig) continue;
      sl.sig = sig;
      const { bg, icon, name, price, lock, sw, sh } = sl;
      const ok = v.st === 'ok';
      bg.clear();
      bg.fillStyle(INK, 1); bg.fillRoundedRect(-sw / 2, -sh / 2, sw, sh, 14);
      bg.fillStyle(v.st === 'locked' ? 0x3b4459 : ok ? 0x4d77c9 : 0x3a4d78, 1); bg.fillRoundedRect(-sw / 2 + 3, -sh / 2 + 3, sw - 6, sh - 6, 12);
      if (ok) { bg.fillStyle(0xffffff, 0.2); bg.fillRoundedRect(-sw / 2 + 7, -sh / 2 + 6, sw - 14, 12, 6); }
      icon.setTexture(v.icon);
      icon.setScale(Math.min(44 / icon.height, (sw - 16) / icon.width, Math.max(1, v.iconScale)));
      icon.setAlpha(v.st === 'locked' ? 0.35 : ok ? 1 : 0.6).setTint(v.st === 'locked' ? 0x222222 : 0xffffff);
      name.setText(v.name).setAlpha(v.st === 'locked' ? 0.6 : 1);
      const big = this.rows > 1;
      price.setText(v.price).setColor(v.st === 'poor' ? '#ff9aa9' : v.st === 'locked' ? '#b8c2d6' : '#ffe680').setFontSize(v.st === 'locked' ? (big ? 13 : 12) : (big ? 17 : 15));
      lock.setVisible(v.st === 'locked');
    }
  }

  tryBuy(item, view) {
    if (this.ended || this.paused) return;
    const st = this.sim.shopState(item);
    if (st === 'ok') {
      this.sim.buy(item);
      if (view) this.tweens.add({ targets: view, scale: { from: 1.15, to: 1 }, duration: 220, ease: 'Back.out' });
      if (!this.toldItem.has(item) && T.shopDesc[item] && item !== 'gentoo') { this.toldItem.add(item); this.toast(T.shopDesc[item]); }
      return;
    }
    Sound.no();
    if (view) this.tweens.add({ targets: view, x: view.x + 5, duration: 45, yoyo: true, repeat: 2 });
    // 못 사는 칸은 누를 때마다 뭐 하는 건지 + 왜 못 사는지
    this.itemInfo(item, st === 'poor' ? T.poor : st === 'locked' ? fmt(T.unlockAfter, this.unlockLevel(item)) : st === 'boss' ? T.goalBoss : st === 'full' ? T.full : st === 'max' ? T.max : '');
  }

  itemInfo(item, why = '') {
    if (!T.shopDesc[item]) { if (why) this.toast(why); return; }
    const name = T.reward[item] ? T.reward[item][0] : T.shop[item];
    this.toast([`${name} · ${T.shopDesc[item] || ''}`, why].filter(Boolean).join('\n'), 2800);
  }

  /* ---------------- 입력 ---------------- */
  onDown(p, over) {
    Sound.unlock();
    if (this.ended || this.paused || over.length) return;
    const x = p.worldX, y = p.worldY;
    if (y < this.waterTop - 30 || y > this.floorY + 10) return;
    this.downInWater = true;
    const r = this.sim.tap(x, y);
    if (r === 'hit' || r === 'miss') this.throwFx(x, y, r === 'hit');
    else if (r === 'none') this.ripple(x, y, 0.5);
  }

  /* ---------------- 매 프레임 ---------------- */
  update(time, delta) {
    if (this.paused) return;
    const dt = Math.min(delta, 100) / 1000;
    this.sim.update(dt);
    for (const e of this.sim.drain()) this.onEvent(e);
    this.frameNo++;
    this.syncAll(time);
    if (!this.ended) { this.updateHud(); this.updateShop(); this.updateHints(dt); }
  }

  syncList(list, map, create, upd) {
    const f = this.frameNo;
    for (const e of list) {
      let v = map.get(e.id);
      if (!v) { v = create(e); map.set(e.id, v); }
      v._f = f;
      upd(v, e);
    }
    for (const [id, v] of map) if (v._f !== f) { map.delete(id); this.fadeOut(v); }
  }

  fadeOut(v) {
    const objs = v.parts || [v.img];
    this.tweens.add({ targets: objs, alpha: 0, duration: 300, onComplete: () => objs.forEach(o => o.destroy()) });
  }

  syncAll(time) {
    const s = this.sim;
    // 먹이
    this.syncList(s.foods, this.views.food, f => {
      const img = this.add.image(f.x, f.y, FOOD_KEYS[f.golden ? 0 : f.tier]).setDepth(f.golden ? 23 : 10);
      if (!f.golden) return { img };
      img.setTint(0xffd23f).setScale(1.5);
      const glow = this.add.image(f.x, f.y, 'glow').setDepth(22).setScale(0.8).setTint(0xffd23f);
      return { img, glow, parts: [img, glow] };
    }, (v, f) => {
      if (v.glow) v.glow.setPosition(f.x, f.y).setRotation(time / 700);
      v.img.setPosition(f.x, f.y).setRotation(Math.sin(time / 300 + f.id) * 0.4);
      if (f.floorT > C.FOOD_FLOOR_LIFE - 1) v.img.setAlpha(Math.max(0, (C.FOOD_FLOOR_LIFE - f.floorT)));
    });
    // 코인
    this.syncList(s.coins, this.views.coin, c => {
      const img = this.add.image(c.x, c.y, `coin-${c.type}`).setDepth(c.type === 'egg' ? 28 : 22).setScale(0.2);
      this.tweens.add({ targets: img, scale: 1, duration: 260, ease: 'Back.out' });
      const v = { img, parts: [img] };
      if (c.lucky || c.type === 'egg' || c.type === 'diamond') {
        v.glow = this.add.image(c.x, c.y, 'glow').setDepth(21).setScale(c.type === 'egg' ? 1 : 0.6).setTint(c.lucky ? 0xffe066 : c.type === 'egg' ? 0xffd23f : 0x9ff5ff);
        v.parts.push(v.glow);
      }
      return v;
    }, (v, c) => {
      v.img.setPosition(c.x, c.y + Math.sin(time / 260 + c.id) * (c.groundT < 0 ? 1.5 : 0));
      if (c.type === 'silver' || c.type === 'gold') v.img.scaleX = v.img.scaleY * (0.55 + 0.45 * Math.abs(Math.cos(time / 260 + c.id)));
      if (v.glow) { v.glow.setPosition(c.x, c.y).setRotation(time / 800); }
      const left = s.coinLife() - c.groundT;
      v.img.setAlpha(c.groundT > 0 && left < 2 && c.type !== 'egg' ? (Math.floor(time / 120) % 2 ? 0.35 : 1) : 1);
    });
    // 황제펭귄 알
    this.syncList(s.layEggs, this.views.egg, e => ({ img: this.add.image(e.x, e.y, 'pg-egg').setDepth(12) }), (v, e) => {
      v.img.setPosition(e.x, e.y).setRotation(e.hatchT < 1.5 ? Math.sin(time / 40) * 0.25 : 0);
    });
    // 친구들
    this.syncList(s.pets, this.views.pet, p => {
      const img = this.add.image(p.x, p.y, `pet-${p.kind}`).setDepth(p.floor ? 14 : 18);
      // 판 시작 몇 초 동안 머리 위 이름표 (새로 온 친구는 더 오래)
      const tag = text(this, p.x, p.y, `${T.reward[p.kind][0]}\n${T.petShort[p.kind]}`, { size: 13, color: '#ffffff', thick: 4 }).setDepth(47).setVisible(false);
      return { img, tag, parts: [img, tag] };
    }, (v, p) => {
      let y = p.y;
      if (p.kind === 'otter') y += Math.sin(time / 500) * 3;
      else if (!p.floor) y += Math.sin(time / 600 + p.id) * 5;
      v.img.setPosition(p.x, y);
      const showTag = !!this.tagPets && this.tagPets.has(p.kind) && s.t < 10;
      v.tag.setVisible(showTag);
      if (showTag) {
        // 수면에 붙은 친구(해달)는 위에 자리가 없어서 아래에 담
        const above = y - v.img.displayHeight / 2 - 22;
        v.tag.setPosition(Phaser.Math.Clamp(p.x, 70, this.W - 70), above > this.waterTop + 20 ? above : y + v.img.displayHeight / 2 + 22);
      }
      const sx = (p.kind === 'crab' || p.kind === 'clam' || p.kind === 'starfish') ? 1 : p.face;
      const pulse = v.pulse || 0;
      v.img.setScale(sx * (1 + pulse * 0.6), 1 + pulse * 0.6);
      if (v.pulse > 0) v.pulse = Math.max(0, v.pulse - 0.03);
      if (p.kind === 'crab') v.img.setRotation(Math.sin(time / 90) * (Math.abs(p.vx) > 1 ? 0.12 : 0));
      if (p.kind === 'clam') v.img.setTexture(v.openT > time ? 'pet-clam-open' : 'pet-clam');
      if (p.kind === 'jelly') v.img.setScale(1, 1 + Math.sin(time / 300) * 0.08);
      if (p.kind === 'starfish') v.img.setRotation(Math.sin(time / 1200) * 0.2);
    });
    // 펭귄
    this.syncList(s.penguins, this.views.pen, p => this.makePenguin(p), (v, p) => this.updPenguin(v, p, time));
    // 천적
    this.syncList(s.preds, this.views.pred, p => this.makePred(p), (v, p) => this.updPred(v, p, time));
    // 북극곰 얼음덩이
    this.syncList(s.projs, this.views.proj, pj => ({ img: this.add.image(pj.x, pj.y, 'snowball').setDepth(33).setTint(0xaee6ff).setScale(1.25) }), (v, pj) => {
      v.img.setPosition(pj.x, pj.y).setRotation(time / 90);
    });
  }

  makePenguin(p) {
    const img = this.add.image(p.x, p.y, penguinKey(p, false)).setDepth(20);
    const bubble = this.add.image(p.x, p.y, 'dot').setDepth(45).setScale(2).setVisible(false);
    const food = this.add.image(p.x, p.y, 'food-krill').setDepth(46).setVisible(false).setScale(0.6);
    return { img, bubble, food, parts: [img, bubble, food], pulse: 0, stage: p.stage, kind: p.kind };
  }

  updPenguin(v, p, time) {
    const s = C.SPECIES[p.kind];
    if (v.stage !== p.stage) { v.stage = p.stage; v.pulse = 1; }
    const speed = Math.hypot(p.vx, p.vy);
    const flap = Math.floor(time / (speed > 70 ? 110 : 240) + p.id) % 2 === 1;
    v.img.setTexture(penguinKey(p, flap));
    const starving = p.hunger >= C.HUNGER.starve;
    const shake = starving ? Math.sin(time / 30) * 1.5 : 0;
    const bob = Math.sin(time / 400 + p.id) * 2;
    v.img.setPosition(p.x + shake, p.y + bob);
    v.img.setRotation(Phaser.Math.Clamp(p.vy / (s.speed * 1.6), -0.5, 0.5) * p.face);
    v.pulse = Math.max(0, v.pulse - 0.04);
    const pu = Math.sin(v.pulse * Math.PI) * 0.25;
    v.img.setScale(p.face * (1 + pu), 1 - pu * 0.6);
    // 배고픔: 파랗게 질리고 말풍선
    if (p.frozenT > 0) v.img.setTint(0x9fe3ff);
    else if (starving) v.img.setTint(0x9ab8ff);
    else if (p.hunger >= this.sim.seekAt(p)) v.img.setTint(0xdfe9ff);
    else v.img.clearTint();
    const hungry = p.hunger >= this.sim.seekAt(p) && !p.entering;
    v.bubble.setVisible(hungry); v.food.setVisible(hungry);
    if (hungry) {
      const r = this.sim.radius(p);
      const bx = p.x + p.face * r * 0.9, by = p.y - r - 14 + Math.sin(time / 200) * 2;
      v.bubble.setPosition(bx, by).setTint(starving ? 0xffb3bf : 0xffffff);
      v.food.setPosition(bx, by).setTexture(FOOD_KEYS[this.sim.foodTier]);
    }
  }

  makePred(p) {
    const key = p.kind === 'skua' ? 'pr-skua-a' : `pr-${p.kind}`;
    const img = this.add.image(p.x, p.y, key).setDepth(30);
    const bar = this.add.graphics().setDepth(31);
    const stars = [0, 1, 2].map(() => this.add.image(0, 0, 'spark').setDepth(32).setScale(0.6).setTint(0xfff27a).setVisible(false));
    return { img, bar, stars, parts: [img, bar, ...stars], lastHp: -1, flash: 0 };
  }

  updPred(v, p, time) {
    const def = C.PREDATORS[p.kind];
    if (p.kind === 'skua') v.img.setTexture(Math.floor(time / 130) % 2 ? 'pr-skua-a' : 'pr-skua-b');
    if (p.kind === 'bossBear') v.img.setTexture(p.guardT > 0 ? 'pr-bossBear-guard' : 'pr-bossBear');
    const wig = Math.sin(time / (p.dashT > 0 ? 60 : 160)) * 0.06;
    v.img.setPosition(p.x, p.y).setScale(p.face * (1 + (p.dashT > 0 ? 0.08 : 0)), 1 + wig);
    v.img.setRotation(Phaser.Math.Clamp(p.vy / 300, -0.3, 0.3) * p.face);
    if (v.flash > 0) { v.flash--; v.img.setTintFill(0xffffff); }
    else if (p.guardT > 0) v.img.setTint(0xcfe0ff);
    else if (p.stunT > 0) v.img.setTint(0xfff7a0);
    else if (p.rageT > 0) v.img.setTint(Math.floor(time / 90) % 2 ? 0xff7a7a : 0xffb0b0);
    else v.img.clearTint();
    // 범고래 잠수: 흐릿하게 (공격 안 먹힘)
    v.img.setAlpha(p.divedT > 0 ? 0.28 : 1);
    // 체력바 (보스는 위쪽 큰 바)
    v.bar.clear();
    // 돌진 예고선: 겨냥하는 동안 빨간 선이 점점 진해짐
    if (p.aimT > 0) {
      const k = 1 - p.aimT / (p.aimFor || 0.6);
      const dx = p.aimX - p.x, dy = p.aimY - p.y, len = Math.hypot(dx, dy) || 1, far = 520;
      v.bar.lineStyle(6 + k * 6, 0xff3355, 0.25 + k * 0.5);
      v.bar.beginPath(); v.bar.moveTo(p.x, p.y); v.bar.lineTo(p.x + dx / len * far, p.y + dy / len * far); v.bar.strokePath();
    }
    if (!def.boss) {
      const w = def.r * 1.6, x = p.x - w / 2, y = p.y - def.r - 16;
      v.bar.fillStyle(INK, 0.9); v.bar.fillRoundedRect(x - 2, y - 2, w + 4, 10, 5);
      v.bar.fillStyle(P.bad, 1); v.bar.fillRoundedRect(x, y, Math.max(0, w * p.hp / p.max), 6, 3);
    }
    const stun = p.stunT > 0;
    v.stars.forEach((st, i) => {
      st.setVisible(stun);
      if (stun) { const a = time / 200 + i * 2.1; st.setPosition(p.x + Math.cos(a) * def.r * 0.6, p.y - def.r * 0.7 + Math.sin(a) * 6); }
    });
  }

  /* ---------------- 사건 → 연출 ---------------- */
  onEvent(e) {
    const s = this.sim;
    switch (e.type) {
      case 'food':
        if (!e.free) { this.ripple(e.x, e.y, 0.7); Sound.plop(); }
        if (this.tut === 0) this.nextTut();
        break;
      case 'foodFull': this.toast(fmt(T.foodFull, s.foodMax), 1200); Sound.no(); break;
      case 'poor': this.toast(T.poor, 1200); Sound.no(); break;
      case 'eat': {
        const v = this.views.pen.get(e.id);
        if (v) v.pulse = Math.max(v.pulse, 0.6);
        this.burst(e.x, e.y, 5, 0xffc2cf, 0.35, 60);
        Sound.gulp();
        break;
      }
      case 'grow': {
        this.burst(e.x, e.y, e.golden ? 26 : 12, e.golden ? 0xffd23f : 0xfff3a0, e.golden ? 0.9 : 0.6, 120, 'spark');
        this.floatText(e.x, e.y - 40, e.golden ? T.goldenGrow : T.grow[e.stage], '#fff3a0', 18);
        Sound.grow();
        break;
      }
      case 'coinDrop': Sound.coinDrop(); if (this.tut === 1 && !this.tutCoinShown) this.showTutCoin(e); break;
      case 'collect': {
        if (e.by === 'crab') this.petSay('crab', e.x, e.y);
        else if (e.by === 'star') this.petSay('starfish', e.x, e.y);
        if (e.lucky && s.hasPet('seahorse')) this.petSay('seahorse', e.x, e.y - 20);
        const v = this.views.coin.get(e.id);
        if (v) { this.views.coin.delete(e.id); this.flyToMoney(v); }
        this.floatText(e.x, e.y - 16, `+${num(e.value)}`, e.lucky ? '#ffe066' : '#ffffff', e.value >= 150 ? 22 : 17);
        Sound.coin(e.coin);
        if (this.tut === 1) this.nextTut();
        break;
      }
      case 'eggPiece': {
        if (!e.bought) {
          const v = this.views.coin.get(e.id);
          if (v) {
            this.views.coin.delete(e.id);
            if (v.glow) v.glow.destroy();
            this.tweens.add({ targets: v.img, x: this.egg.box.x - 58, y: this.egg.box.y, scale: 1.4, duration: 500, ease: 'Quad.in', onComplete: () => v.img.destroy() });
          }
        }
        this.egg.sig = '';
        this.tweens.add({ targets: this.egg.box, scale: { from: 1.35, to: 1 }, duration: 500, ease: 'Back.out' });
        this.burst(this.egg.box.x - 58, this.egg.box.y, 16, 0xffd23f, 0.7, 140, 'spark');
        Sound.egg();
        if (this.tut === 3) this.nextTut();
        break;
      }
      case 'starved': {
        const v = this.views.pen.get(e.id);
        if (v) { this.views.pen.delete(e.id); this.ghost(v); }
        this.floatText(e.x, e.y - 30, T.starved, '#c9d8ff', 16);
        Sound.sad();
        break;
      }
      case 'eaten': {
        const v = this.views.pen.get(e.id);
        const pv = this.views.pred.get(e.predId);
        if (v) {
          this.views.pen.delete(e.id);
          v.bubble.destroy(); v.food.destroy();
          this.tweens.add({ targets: v.img, x: pv ? pv.img.x : e.x, y: pv ? pv.img.y : e.y, scale: 0.1, alpha: 0, duration: 220, onComplete: () => v.img.destroy() });
        }
        if (pv) this.tweens.add({ targets: pv.img, scaleY: 1.25, duration: 90, yoyo: true });
        this.floatText(e.x, e.y - 30, T.eaten, '#ff9aa9', 18);
        this.cameras.main.shake(140, 0.006);
        Sound.chomp();
        break;
      }
      case 'rescue': {
        const dol = this.views.pet.get(s.pet('dolphin').id);
        if (dol) this.tweens.add({ targets: dol.img, x: { from: e.from.x, to: e.x }, y: { from: e.from.y, to: e.y }, duration: 380, ease: 'Quad.out' });
        this.floatText(e.x, e.y - 40, T.rescue, '#aee6ff', 18);
        this.burst(e.x, e.y, 10, 0xaee6ff, 0.5, 100);
        Sound.puff();
        break;
      }
      case 'warn':
        this.banner(fmt(T.warn, T.predNames[e.kind]), { color: '#ff8a9a', hold: 1400, small: true });
        this.vignette(0xff3355, 3);
        Sound.warn();
        break;
      case 'predIn': case 'bossIn':
        Sound.splash();
        Sound.bgm(e.type === 'bossIn' ? 'boss' : 'danger');
        if (e.type === 'bossIn') { this.cameras.main.shake(500, 0.012); Sound.roar(); }
        if (!this.seenPredHint) { this.seenPredHint = true; save.seenPredHint = true; persist(); this.toast(T.hintPred, 3200); }
        break;
      case 'bossWarn':
        this.banner(fmt(T.bossWarn, T.predNames[e.kind]), { color: '#ff6b81', hold: 2000 });
        this.vignette(0xff1133, 5);
        Sound.warn();
        break;
      case 'hit': {
        const v = this.views.pred.get(e.id);
        if (v) v.flash = 3;
        if (e.by === 'tap') Sound.hit();
        break;
      }
      case 'blocked':
        this.floatText(e.x, e.y - 20, T.blocked, '#cfe0ff', 18);
        Sound.block();
        break;
      case 'predDie': {
        const v = this.views.pred.get(e.id);
        if (v) {
          this.views.pred.delete(e.id);
          v.bar.destroy(); v.stars.forEach(o => o.destroy());
          this.tweens.add({ targets: v.img, angle: 540 * (Math.random() < 0.5 ? 1 : -1), scale: 0.1, alpha: 0, duration: 600, ease: 'Quad.in', onComplete: () => v.img.destroy() });
        }
        this.burst(e.x, e.y, e.boss ? 40 : 18, 0xffffff, e.boss ? 1.2 : 0.7, e.boss ? 260 : 160, 'spark');
        if (e.boss) this.cameras.main.shake(400, 0.01);
        Sound.predDie();
        if (!s.preds.length) Sound.bgm('calm');
        break;
      }
      case 'predFlee': {
        const v = this.views.pred.get(e.id);
        if (v) { this.views.pred.delete(e.id); v.bar.destroy(); v.stars.forEach(o => o.destroy()); this.tweens.add({ targets: v.img, x: e.x < this.W / 2 ? -200 : this.W + 200, alpha: 0, duration: 700, onComplete: () => v.img.destroy() }); }
        break;
      }
      case 'summon': this.toast(T.summon, 1600); break;
      case 'dash': Sound.splash(); break;
      case 'spawn': this.ripple(e.x, this.waterTop + 4, 1.2); Sound.splash(); if (this.tut === 2 && e.kind === 'gentoo') this.nextTut(); break;
      case 'buy': Sound.buy(); break;
      case 'lay': this.burst(e.x, e.y, 6, 0xffffff, 0.4, 60); break;
      case 'hatch': this.burst(e.x, e.y, 12, 0xfff8ea, 0.5, 100, 'spark'); this.floatText(e.x, e.y - 30, T.hatch, '#fff8ea', 15); Sound.hatch(); break;
      case 'clam': { const v = this.views.pet.get(e.id); if (v) { v.openT = this.time.now + 900; this.petSay('clam', v.img.x, v.img.y); } break; }
      case 'otterFeed': this.ripple(e.x, e.y + 10, 0.8, 0xfff3a0); this.petSay('otter', e.x, e.y + 40); break;
      case 'spout': {
        const em = this.add.particles(e.x + 10, e.y - 16, 'bubble', { speedY: { min: -260, max: -140 }, speedX: { min: -40, max: 40 }, lifespan: 700, scale: { start: PS, end: 0.2 * PS }, quantity: 14, emitting: false }).setDepth(19);
        em.explode(14); this.time.delayedCall(900, () => em.destroy());
        const v = this.views.pet.get(e.id); if (v) v.pulse = 0.5;
        this.petSay('whale', e.x, e.y);
        break;
      }
      case 'puff': {
        const v = this.views.pet.get(e.id); if (v) v.pulse = 1;
        this.ripple(e.x, e.y, 1.5, 0xfff27a);
        this.petSay('puffer', e.x, e.y);
        Sound.puff();
        break;
      }
      case 'zap': this.lightning(e.x, e.y, e.tx, e.ty); this.petSay('jelly', e.x, e.y); Sound.zap(); break;
      case 'rage': {
        this.floatText(e.x, e.y - 60, T.rage, '#ff6b81', 20);
        const v = this.views.pred.get(e.id);
        if (v) this.tweens.add({ targets: v.img, scaleY: 1.25, duration: 90, yoyo: true, repeat: 1 });
        Sound.growl();
        break;
      }
      case 'dodge': this.floatText(e.x, e.y - 20, T.dodge, '#cfe0ff', 17); Sound.block(); break;
      case 'dive': this.ripple(e.x, e.y, 2, 0x9fd8ff); Sound.splash(); break;
      case 'surface': this.ripple(e.x, e.y, 2.4); this.burst(e.x, e.y, 14, 0xdff3ff, 0.6, 160); Sound.splash(); this.cameras.main.shake(160, 0.006); break;
      case 'swoop': Sound.swoop(); break;
      case 'bounce': this.cameras.main.shake(120, 0.008); this.burst(e.x, e.y, 8, 0xffffff, 0.5, 120); Sound.hit(); break;
      case 'aim': Sound.aim(); break;
      case 'throw': Sound.throwSnow(); break;
      case 'freeze': this.floatText(e.x, e.y - 34, T.frozen, '#9fe3ff', 17); this.burst(e.x, e.y, 10, 0xcff4ff, 0.5, 90, 'spark'); Sound.freeze(); break;
      case 'projBreak': this.burst(e.x, e.y, 12, 0xcff4ff, 0.6, 140, 'spark'); Sound.hit(); break;
      case 'petIn': this.ripple(e.x, e.y, 1.4, 0xfff3a0); Sound.splash(); break;
      case 'event':
        this.banner(T.events[e.kind], { color: '#ffe680', hold: 1600, small: true });
        this.vignette(0xffd23f, 2);
        Sound.egg();
        break;
      case 'clear': this.onClear(); break;
      case 'lose': this.onLose(); break;
    }
  }

  /* ---------------- 작은 연출 ---------------- */
  ripple(x, y, s = 1, color = 0xffffff) {
    const c = this.add.circle(x, y, 10, color, 0).setStrokeStyle(3, color, 0.8).setDepth(40);
    this.tweens.add({ targets: c, scale: 3 * s, alpha: 0, duration: 420, onComplete: () => c.destroy() });
  }

  burst(x, y, n, tint, scale, speed, key = 'dot') {
    const em = this.add.particles(x, y, key, { speed: { min: speed * 0.4, max: speed }, lifespan: { min: 350, max: 700 }, scale: { start: scale * PS, end: 0 }, tint, quantity: n, emitting: false, rotate: { min: 0, max: 360 } }).setDepth(41);
    em.explode(n);
    this.time.delayedCall(800, () => em.destroy());
  }

  throwFx(x, y, hit) {
    const sb = this.add.image(this.W / 2, this.H - this.shopH - 10, 'snowball').setDepth(42).setScale(0.6);
    this.tweens.add({ targets: sb, x, y, scale: 0.9, duration: 90, onComplete: () => { sb.destroy(); this.burst(x, y, hit ? 10 : 5, 0xffffff, hit ? 0.6 : 0.35, hit ? 160 : 80); } });
    Sound.throwSnow();
  }

  floatText(x, y, str, color = '#ffffff', size = 18) {
    const t = text(this, x, y, str, { size, color, thick: 4 }).setDepth(60);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 1000, ease: 'Quad.out', onComplete: () => t.destroy() });
  }

  flyToMoney(v) {
    const target = { x: this.coinIcon.x, y: this.coinIcon.y };
    if (v.glow) v.glow.destroy();
    this.tweens.add({
      targets: v.img, x: target.x, y: target.y, scale: 0.5, duration: 380, ease: 'Quad.in',
      onComplete: () => { v.img.destroy(); this.tweens.add({ targets: this.coinIcon, scale: { from: 1.1, to: 0.85 }, duration: 150 }); }
    });
  }

  ghost(v) {
    v.bubble.destroy(); v.food.destroy();
    v.img.clearTint().setTint(0xd8e4ff);
    this.tweens.add({ targets: v.img, y: v.img.y - 120, alpha: 0, angle: 0, duration: 1600, ease: 'Sine.in', onComplete: () => v.img.destroy() });
  }

  lightning(x1, y1, x2, y2) {
    const g = this.add.graphics().setDepth(43);
    g.lineStyle(4, 0xfff27a, 1);
    g.beginPath(); g.moveTo(x1, y1);
    for (let i = 1; i < 6; i++) g.lineTo(x1 + (x2 - x1) * i / 6 + Phaser.Math.Between(-12, 12), y1 + (y2 - y1) * i / 6 + Phaser.Math.Between(-12, 12));
    g.lineTo(x2, y2); g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
  }

  vignette(color, times) {
    const r = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H).setStrokeStyle(40, color, 0.5).setDepth(90).setFillStyle(0, 0);
    this.tweens.add({ targets: r, alpha: { from: 1, to: 0.1 }, duration: 380, yoyo: true, repeat: times - 1, onComplete: () => r.destroy() });
  }

  banner(str, o = {}) {
    if (this.bannerObjs) this.bannerObjs.forEach(x => x.destroy());
    const y = this.waterTop + (this.floorY - this.waterTop) * 0.34;
    const t = text(this, this.W / 2, y, str, { size: o.small ? 30 : 38, color: o.color || '#ffffff', thick: 9 }).setDepth(150);
    const objs = [t];
    if (o.sub) objs.push(text(this, this.W / 2, y + 46, o.sub, { size: 17, thick: 5, wrap: this.W - 60 }).setDepth(150));
    this.bannerObjs = objs;
    this.tweens.add({
      targets: objs, scale: { from: 0.4, to: 1 }, alpha: { from: 0, to: 1 }, duration: 280, ease: 'Back.out',
      hold: o.hold || 1500, yoyo: true,
      onComplete: () => { objs.forEach(x => x.destroy()); if (this.bannerObjs === objs) this.bannerObjs = null; }
    });
  }

  toast(str, ms = 2000) {
    const fs = this.rows > 1 ? 18 : 16;
    if (this.toastObjs) this.toastObjs.forEach(o => o.destroy());
    const y = this.H - this.shopH - 40;
    const t = text(this, this.W / 2, y, str, { size: fs, thick: 0, stroke: false, wrap: this.W - 80 }).setDepth(160);
    const g = this.add.graphics().setDepth(159);
    g.fillStyle(INK, 0.88); g.fillRoundedRect(this.W / 2 - t.width / 2 - 16, y - t.height / 2 - 9, t.width + 32, t.height + 18, 16);
    const objs = [g, t];
    this.toastObjs = objs;
    this.tweens.add({ targets: objs, alpha: 0, delay: ms, duration: 300, onComplete: () => { objs.forEach(o => o.destroy()); if (this.toastObjs === objs) this.toastObjs = null; } });
  }

  /* ---------------- 안내 (Lv1 튜토리얼 + 배고픔 알림) ---------------- */
  nextTut() {
    this.tut++;
    this.clearPointer();
    if (this.tut >= 4) { this.tut = -1; save.seenTutorial = true; persist(); }
  }

  showTutCoin(e) {
    this.tutCoinShown = true;
    this.time.delayedCall(500, () => { if (this.tut === 1) this.pointAt(e.x, e.y - 18, T.hint2, e.id); });
  }

  pointAt(x, y, str, followCoin, up) {
    this.clearPointer();
    const arrow = this.add.container(x, y).setDepth(170);
    const g = this.add.graphics();
    g.fillStyle(INK, 1); g.fillTriangle(-16, -34, 16, -34, 0, -2);
    g.fillStyle(P.accent, 1); g.fillTriangle(-11, -31, 11, -31, 0, -7);
    if (up) g.setRotation(Math.PI);
    arrow.add(g);
    const t = text(this, Phaser.Math.Clamp(x, 140, this.W - 140), up ? y + 70 : y - 64, str, { size: 18, color: '#ffffff', thick: 5, wrap: 260 }).setDepth(170);
    const tw = this.tweens.add({ targets: g, y: up ? 12 : -12, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.pointer = { arrow, t, tw, followCoin };
  }

  clearPointer() {
    if (!this.pointer) return;
    this.pointer.tw.stop(); this.pointer.arrow.destroy(); this.pointer.t.destroy();
    this.pointer = null;
  }

  updateHints(dt) {
    const s = this.sim;
    if (this.tut === 0 && !this.pointer && s.t > 2.5) {
      const p = s.penguins.find(q => !q.entering) || s.penguins[0];
      if (p) this.pointAt(p.x, p.y - 40, T.hint1);
    }
    if (this.tut === 0 && this.pointer) {
      const p = s.penguins[0];
      if (p) { this.pointer.arrow.setPosition(p.x, p.y - 40); this.pointer.t.setPosition(Phaser.Math.Clamp(p.x, 140, this.W - 140), Math.max(this.waterTop + 30, p.y - 104)); }
    }
    if (this.tut === 1 && this.pointer && this.pointer.followCoin) {
      const c = s.coins.find(q => q.id === this.pointer.followCoin);
      if (c) { this.pointer.arrow.setPosition(c.x, c.y - 18); this.pointer.t.setPosition(Phaser.Math.Clamp(c.x, 140, this.W - 140), c.y - 82); }
      else { this.clearPointer(); this.tutCoinShown = false; }
    }
    if (this.tut === 2 && !this.pointer && s.money >= C.SPECIES.gentoo.price + 40) {
      const sl = this.slots[0];
      this.pointAt(sl.c.x, sl.c.y - sl.sh / 2 + 4, T.hint3);
    }
    if (this.tut === 3 && !this.pointer && s.shopState('egg') === 'ok') {
      this.pointAt(this.egg.box.x, this.egg.box.y + 40, T.hint4, null, true);
      this.pointer.t.x = Phaser.Math.Clamp(this.egg.box.x, 140, this.W - 140);
    }
    // 굶주리는 펭귄이 있으면 가끔 알려줌
    this.hintT -= dt;
    if (this.hintT <= 0 && this.tut < 0 && s.penguins.some(p => p.hunger >= C.HUNGER.starve) && s.playerFoodCount() === 0 && !s.preds.length) {
      this.hintT = 14;
      this.toast(T.hintHungry, 1800);
    }
  }

  /* ---------------- 저장·일시정지 ---------------- */
  snapshot() {
    if (this.ended || this.intro || !this.sim) return;
    save.snap = this.sim.serialize();
    persist();
  }

  togglePause(force) {
    if (this.ended || this.intro) return;
    const on = force != null ? force : !this.paused;
    this.paused = on;
    if (on) { this.snapshot(); this.tweens.pauseAll(); this.time.paused = true; Sound.bgm(null); }
    else { this.tweens.resumeAll(); this.time.paused = false; Sound.bgm(this.sim.boss === 'here' ? 'boss' : this.sim.preds.length ? 'danger' : 'calm'); }
    this.showPauseUi(on);
  }

  showPauseUi(on) {
    const ov = document.getElementById('pause-overlay');
    if (ov) ov.style.display = on ? 'flex' : 'none';
  }

  quitToMap() {
    this.snapshot();
    this.paused = false;
    this.tweens.resumeAll(); this.time.paused = false;
    this.scene.start('Map');
  }

  restartLevel() {
    save.snap = null; persist();
    this.paused = false;
    this.tweens.resumeAll(); this.time.paused = false;
    this.scene.restart({ level: this.levelIdx, fromCard: true });
  }

  /* ---------------- 끝 ---------------- */
  endCommon() {
    this.updateHud();
    this.ended = true;
    this.clearPointer();
    document.getElementById('btn-pause').style.display = 'none';
    Sound.bgm(null);
  }

  onClear() {
    if (this.ended) return;
    this.endCommon();
    const t = this.sim.t;
    const isNew = recordClear(this.levelIdx, t);
    Sound.fanfare();
    this.time.delayedCall(900, () => this.showHatch(t, isNew));
  }

  showHatch(t, isNew) {
    const W = this.W, H = this.H, d = 310;
    dim(this, W, H, 0.72, 300);
    const cy = H * 0.3;
    const rays = this.add.graphics().setDepth(d).setPosition(W / 2, cy).setAlpha(0);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; rays.fillStyle(0xfff3a0, 0.25); rays.fillTriangle(0, 0, Math.cos(a - 0.12) * 420, Math.sin(a - 0.12) * 420, Math.cos(a + 0.12) * 420, Math.sin(a + 0.12) * 420); }
    const egg = this.add.container(W / 2, cy).setDepth(d + 1).setScale(0);
    egg.add(this.add.image(0, 0, 'egg-big'));
    const crack = this.add.graphics();
    egg.add(crack);
    this.tweens.add({ targets: egg, scale: 1.1, duration: 500, ease: 'Back.out' });
    text(this, W / 2, cy - 130, T.hatchTitle, { size: 30, color: '#ffe680', thick: 8 }).setDepth(d + 3);
    // 흔들흔들 → 쩍
    const wob = this.tweens.add({ targets: egg, angle: { from: -8, to: 8 }, duration: 110, yoyo: true, repeat: 5, delay: 550 });
    this.time.delayedCall(700, () => { Sound.hatch(); crack.lineStyle(4, INK, 1); crack.beginPath(); crack.moveTo(-52, 4); for (let i = 1; i <= 7; i++) crack.lineTo(-52 + i * 15, 4 + (i % 2 ? -12 : 8)); crack.strokePath(); });
    this.time.delayedCall(1900, () => {
      wob.stop(); egg.destroy();
      const top = this.add.image(W / 2, cy, 'egg-big').setDepth(d + 1).setScale(1.1);
      const bot = this.add.image(W / 2, cy, 'egg-big').setDepth(d + 1).setScale(1.1);
      const fr = top.frame;
      top.setCrop(0, 0, fr.realWidth, fr.realHeight * 0.5);
      bot.setCrop(0, fr.realHeight * 0.5, fr.realWidth, fr.realHeight * 0.5);
      this.tweens.add({ targets: top, y: cy - 160, angle: -40, alpha: 0, duration: 700, ease: 'Quad.out' });
      this.tweens.add({ targets: bot, y: cy + 200, angle: 25, alpha: 0, duration: 700, ease: 'Quad.in' });
      this.burst(W / 2, cy, 40, 0xffe680, 1, 300, 'spark');
      Sound.egg();
      const h = C.HATCH[this.levelIdx];
      const key = h.type === 'pet' ? `pet-${h.key}` : h.type === 'species' ? `pg-${h.key}-a` : 'pg-gentoo-2-a';
      const rw = this.add.image(W / 2, cy, key).setDepth(d + 2).setScale(0);
      if (h.type === 'trophy') { rw.setTint(0xffd54a); this.add.image(W / 2, cy - 70, 'spark').setDepth(d + 3).setScale(2).setTint(0xffffff); }
      const big = Math.min(2.6, 150 / Math.max(rw.width, rw.height));
      this.tweens.add({ targets: rw, scale: big, duration: 500, ease: 'Back.out' });
      this.tweens.add({ targets: rw, y: cy - 8, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 500 });
      this.tweens.add({ targets: rays, alpha: 1, angle: 360, duration: 12000, repeat: -1 });
      const info = T.reward[h.key];
      text(this, W / 2, cy + 110, info[0], { size: 28, color: '#ffffff', thick: 7 }).setDepth(d + 3);
      text(this, W / 2, cy + 148, info[1], { size: 17, color: '#dfe9ff', thick: 4, wrap: W - 60 }).setDepth(d + 3);
      if (h.type !== 'trophy') text(this, W / 2, cy + 178, `${T.unlocked} · ${T.dexRegistered}`, { size: 14, color: '#aab8d0', thick: 3 }).setDepth(d + 3);
      this.time.delayedCall(600, () => this.showResult(t, isNew));
    });
  }

  showResult(t, isNew) {
    const W = this.W, H = this.H, d = 320;
    const last = this.levelIdx === C.LEVELS.length - 1;
    const py = H * 0.66, pw = Math.min(440, W - 40), ph = last ? 250 : 200;
    panel(this, W / 2, py, pw, ph).setDepth(d);
    const medal = medalOf(this.levelIdx, t, this.L.par);
    const mx = W / 2 - pw / 2 + 64;
    const mg = this.add.graphics().setDepth(d + 1);
    mg.fillStyle(0xd0463b, 1); mg.fillTriangle(mx - 18, py - 60, mx - 4, py - 60, mx - 18, py - 20); mg.fillTriangle(mx + 18, py - 60, mx + 4, py - 60, mx + 18, py - 20);
    mg.fillStyle(INK, 1); mg.fillCircle(mx, py - 12, 34);
    mg.fillStyle(MEDAL_COLOR[medal], 1); mg.fillCircle(mx, py - 12, 30);
    mg.fillStyle(0xffffff, 0.45); mg.fillEllipse(mx - 9, py - 22, 22, 10);
    const tx = mx + 56;
    text(this, tx, py - 50, T.clear, { size: 30, ox: 0, color: css(P.uiDark), stroke: false }).setDepth(d + 1);
    text(this, tx, py - 14, fmt(T.clearTime, mmss(t)), { size: 19, ox: 0, color: '#4b5870', stroke: false }).setDepth(d + 1);
    text(this, tx, py + 14, T['medal' + medal[0].toUpperCase() + medal.slice(1)] + (isNew ? `  · ${T.newRecord}` : ''), { size: 17, ox: 0, color: isNew ? '#e0762a' : '#7a879c', stroke: false }).setDepth(d + 1);
    if (last) {
      text(this, W / 2, py + 48, T.ending, { size: 22, color: '#e0762a', stroke: false }).setDepth(d + 1);
      text(this, W / 2, py + 76, fmt(T.totalTime, mmss(save.totalTime)), { size: 15, color: '#7a879c', stroke: false }).setDepth(d + 1);
    }
    const by = py + ph / 2 + 50;
    if (!last) {
      button(this, W / 2 - pw / 4 - 4, by, T.map, () => this.scene.start('Map'), { w: pw / 2 - 16, h: 60, depth: d + 2 });
      button(this, W / 2 + pw / 4 + 4, by, T.next, () => this.scene.start('Tank', { level: this.levelIdx + 1 }), { primary: true, w: pw / 2 - 16, h: 60, depth: d + 2 });
    } else {
      button(this, W / 2, by, T.map, () => this.scene.start('Map'), { primary: true, w: pw - 60, h: 60, depth: d + 2 });
    }
  }

  onLose() {
    if (this.ended) return;
    this.endCommon();
    save.snap = null; persist();
    Sound.lose();
    const W = this.W, H = this.H, d = 310;
    this.time.delayedCall(800, () => {
      dim(this, W, H, 0.7, 300);
      const img = this.add.image(W / 2, H * 0.36, 'pg-gentoo-2-a').setDepth(d).setScale(2).setTint(0x9aa6c0);
      this.tweens.add({ targets: img, angle: { from: -6, to: 6 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      text(this, W / 2, H * 0.52, T.lose, { size: 28, thick: 7 }).setDepth(d);
      text(this, W / 2, H * 0.52 + 42, T.loseSub, { size: 16, color: '#dfe9ff', thick: 4, wrap: W - 60 }).setDepth(d);
      const pw = Math.min(440, W - 40);
      button(this, W / 2 - pw / 4 - 4, H * 0.7, T.map, () => this.scene.start('Map'), { w: pw / 2 - 16, h: 60, depth: d + 1 });
      button(this, W / 2 + pw / 4 + 4, H * 0.7, T.retry, () => this.scene.restart({ level: this.levelIdx, fromCard: true }), { primary: true, w: pw / 2 - 16, h: 60, depth: d + 1 });
    });
  }
}
