import Phaser from 'phaser';
import { setupCamera } from '../art/dpr.js';
import { WORLDS, P, css, INK } from '../art/palette.js';
import * as C from '../core/config.js';
import { Sound } from '../core/audio.js';
import { save, persist, medalOf } from '../meta/save.js';
import { T } from '../meta/i18n.js';
import { button, text } from './ui.js';
import { levelCard } from './levelCard.js';
import { openDex } from './dex.js';

const MEDAL_COLOR = { gold: 0xffc21a, silver: 0xb9c6d8, bronze: 0xe0925f };

export class MapScene extends Phaser.Scene {
  constructor() { super('Map'); }

  create() {
    const { W, H } = setupCamera(this);
    this.W = W; this.H = H;
    document.getElementById('btn-pause').style.display = 'none';
    Sound.setWorld(Math.min(2, Math.floor(Math.min(save.cleared, C.LEVELS.length - 1) / 5))); Sound.intensity = 1; Sound.push = false;
    Sound.bgm('calm');

    const g = this.add.graphics();
    g.fillGradientStyle(0xcdefff, 0xcdefff, 0x1a4f8f, 0x1a4f8f, 1); g.fillRect(0, 0, W, H);

    // 오른쪽 위는 전체화면 버튼(HTML) 자리라 버튼은 왼쪽에. 폰에선 그 자리가 넓어 큰 제목은 뺌
    button(this, 72, 44, T.back, () => this.scene.start('Title'), { w: 116, h: 44, size: 17 });
    button(this, 72 + 124, 44, T.dex, () => openDex(this.textures), { w: 116, h: 44, size: 17 });
    text(this, W / 2, 88, T.mapHint, { size: 17, color: '#ffffff', thick: 4 });

    const bandTop = 104, bandH = (H - bandTop - 16) / 3;
    const nodes = [];
    for (let w = 0; w < 3; w++) {
      const wy = bandTop + w * bandH, world = WORLDS[w];
      const bg = this.add.graphics();
      bg.fillStyle(INK, 1); bg.fillRoundedRect(10, wy + 4, W - 20, bandH - 12, 26);
      bg.fillGradientStyle(world.top, world.top, world.deep, world.deep, 1); bg.fillRect(14, wy + 8, W - 28, bandH - 20);
      bg.fillStyle(world.ice, 1); bg.fillRoundedRect(14, wy + 8, W - 28, 34, { tl: 22, tr: 22, bl: 0, br: 0 });
      text(this, 34, wy + 26, T.worlds[w], { size: 20, ox: 0, color: css(P.uiDark), stroke: false });
      for (let i = 0; i < 5; i++) {
        const idx = w * 5 + i;
        const col = w % 2 === 0 ? i : 4 - i;
        const x = 72 + col * (W - 144) / 4;
        const y = wy + 52 + (bandH - 70) / 2 + (col % 2 ? 26 : -18);
        nodes.push({ idx, x, y });
      }
    }
    // 길
    const path = this.add.graphics();
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const done = i + 1 <= save.cleared;
      const len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.floor(len / 18);
      for (let k = 1; k < n; k++) {
        path.fillStyle(done ? 0xffffff : 0x0b1a33, done ? 0.95 : 0.35);
        path.fillCircle(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, 4);
      }
    }
    for (const n of nodes) this.node(n);
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('Title'));

    // 이어하던 판이 있으면 바로 카드를 띄움
    if (this.scene.settings.data && this.scene.settings.data.open != null) this.card(this.scene.settings.data.open);
  }

  node({ idx, x, y }) {
    const L = C.LEVELS[idx];
    const open = idx <= save.cleared;
    const best = save.best[idx];
    const medal = medalOf(idx, best, L.par);
    const boss = !!L.boss;
    const r = boss ? 44 : 34;
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const fill = !open ? 0x7d8aa0 : medal ? MEDAL_COLOR[medal] : 0xffffff;
    g.fillStyle(0x0b1a33, 0.35); g.fillCircle(3, 7, r + 3);
    g.fillStyle(INK, 1); g.fillCircle(0, 0, r + 4);
    g.fillStyle(fill, 1); g.fillCircle(0, 0, r);
    g.fillStyle(0xffffff, 0.35); g.fillEllipse(-r * 0.3, -r * 0.45, r * 0.9, r * 0.4);
    c.add(g);
    if (boss) {
      const ic = this.add.image(0, 2, `pr-${L.boss}`).setScale((r * 1.7) / (L.boss === 'bossOrca' ? 270 : L.boss === 'bossBear' ? 230 : 232));
      if (!open) ic.setTint(0x444c5c);
      c.add(ic);
      c.add(text(this, 0, r + 14, T.boss, { size: 14, color: '#ffdd55', thick: 4 }));
    } else {
      c.add(text(this, 0, 1, String(idx + 1), { size: 28, color: open ? css(P.uiDark) : '#dfe6f0', stroke: false }));
    }
    if (!open) c.add(this.add.image(r * 0.6, -r * 0.6, 'lock').setScale(0.9));
    if (medal) {
      const b = this.add.graphics();
      b.fillStyle(INK, 1); b.fillCircle(r * 0.72, -r * 0.72, 13);
      b.fillStyle(MEDAL_COLOR[medal], 1); b.fillCircle(r * 0.72, -r * 0.72, 10);
      c.add(b);
      c.add(this.add.image(r * 0.72, -r * 0.72, 'spark').setScale(0.55));
    }
    if (open && idx === save.cleared && idx < C.LEVELS.length) {
      // 다음 판: 펭귄이 위에서 콩콩
      const pg = this.add.image(0, -r - 24, 'pg-gentoo-2-a').setScale(0.7);
      c.add(pg);
      this.tweens.add({ targets: pg, y: -r - 36, duration: 320, yoyo: true, repeat: -1, repeatDelay: 500, ease: 'Quad.out' });
      this.tweens.add({ targets: g, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      // 이어하기 배지가 있으면 그게 안내 역할을 함
      if (!(save.snap && save.snap.level === idx)) {
        const tag = text(this, 0, r + (boss ? 38 : 20), T.nextHere, { size: 15, color: '#ffe680', thick: 5 });
        c.add(tag);
        this.tweens.add({ targets: tag, scale: 1.12, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    }
    if (save.snap && save.snap.level === idx) {
      const b = this.add.graphics(); b.fillStyle(P.good, 1); b.fillRoundedRect(-34, r - 6, 68, 20, 10); c.add(b);
      c.add(text(this, 0, r + 4, T.resume, { size: 12, stroke: false }));
    }
    c.setSize(r * 2 + 16, r * 2 + 16).setInteractive({ useHandCursor: open });
    c.on('pointerup', () => { if (open) { Sound.click(); this.card(idx); } else { Sound.no(); this.tweens.add({ targets: c, x: x + 6, duration: 50, yoyo: true, repeat: 2 }); } });
  }

  card(idx) {
    const play = () => { if (save.snap) { save.snap = null; persist(); } this.scene.start('Tank', { level: idx, fromCard: true }); };
    const buttons = save.snap && save.snap.level === idx
      ? [{ label: T.resume, primary: true, onClick: () => this.scene.start('Tank', { level: idx, resume: true }) }, { label: T.restart, onClick: play }]
      : [{ label: T.play, primary: true, onClick: play }];
    const close = levelCard(this, idx, buttons, { back: () => close() });
  }
}
