import Phaser from 'phaser';
import { bakeAll } from '../art/textures.js';
import { setupCamera } from '../art/dpr.js';
import { WORLDS, P, css } from '../art/palette.js';
import { Sound } from '../core/audio.js';
import { save, persist } from '../meta/save.js';
import { T } from '../meta/i18n.js';
import { drawWater } from './water.js';
import { button, text, openHelp, sheetOpen, openSound } from './ui.js';
import { openDex } from './dex.js';
import * as C from '../core/config.js';

export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() { bakeAll(this); this.scene.start('Title'); }
}

export class Title extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    // 씬 인스턴스는 재사용됨 → 지난번 잠금을 풀어야 다시 들어온 뒤에도 버튼이 먹힘
    this._going = false;
    const { W, H } = setupCamera(this);
    const top = 330, floor = H - 70;
    Sound.setWorld(0); Sound.intensity = 2; Sound.push = false;
    drawWater(this, W, H, WORLDS[0], top, floor);
    document.getElementById('btn-pause').style.display = 'none';

    // 제목
    const t1 = text(this, W / 2, 128, T.title, { size: 78, color: '#ffffff', thick: 14 });
    const t2 = text(this, W / 2, 200, T.subtitle, { size: 30, color: css(P.accent), thick: 8 });
    text(this, W / 2, 252, T.tagline, { size: 19, color: '#ffffff', thick: 5 });
    this.tweens.add({ targets: t1, y: 120, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: t2, angle: { from: -2, to: 2 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // 헤엄치는 펭귄들 (그냥 구경용)
    const kinds = ['gentoo-2', 'gentoo-0', 'emperor', 'gentoo-1', 'macaroni', 'rainbow', 'chinstrap'];
    this.swimmers = kinds.map((k, i) => {
      const y = top + 80 + (i * 97) % (floor - top - 200);
      const img = this.add.image(Phaser.Math.Between(40, W - 40), y, `pg-${k}-a`).setDepth(5);
      img.kind = k; img.dir = i % 2 ? 1 : -1; img.speed = Phaser.Math.Between(40, 80); img.base = y; img.ph = i;
      return img;
    });
    // 얼음 위에 서 있는 펭귄
    const st = this.add.image(Math.min(W * 0.14, 110), top - 24, 'pg-gentoo-2-a').setDepth(6);
    this.tweens.add({ targets: st, y: top - 34, duration: 380, yoyo: true, repeat: -1, repeatDelay: 1200, ease: 'Quad.out' });

    const allDone = save.cleared >= C.LEVELS.length && !save.snap;
    const label = save.cleared === 0 && !save.snap ? T.start : allDone ? T.map : T.continue;
    button(this, W / 2, H - 250, label, () => this.go(), { primary: true, w: 340, h: 76, size: 30, depth: 50 });
    button(this, W / 2 - 170, H - 160, T.sound, () => openSound(), { w: 156, h: 56, size: 19, depth: 50 });
    button(this, W / 2, H - 160, T.help, () => openHelp(this.textures), { w: 156, h: 56, size: 19, depth: 50 });
    button(this, W / 2 + 170, H - 160, T.dex, () => openDex(this.textures), { w: 156, h: 56, size: 19, depth: 50 });

    this.input.keyboard.on('keydown-SPACE', () => this.go());
    this.input.keyboard.on('keydown-ENTER', () => this.go());
    this.input.once('pointerdown', () => Sound.unlock().then(() => Sound.bgm('calm')));
    if (Sound.ready) Sound.bgm('calm');
  }

  go() {
    if (this._going || sheetOpen()) return;
    this._going = true;
    Sound.unlock().then(() => Sound.bgm('calm'));
    // 처음 온 사람은 지도 없이 바로 Lv1. 그 뒤로는 지도를 열면서 할 차례인 레벨 카드를 바로 띄움
    if (save.cleared === 0 && !save.snap) this.scene.start('Tank', { level: 0 });
    else if (save.cleared >= C.LEVELS.length && !save.snap) this.scene.start('Map');
    else this.scene.start('Map', { open: save.snap ? save.snap.level : save.cleared });
  }

  update(time, delta) {
    const { W } = { W: this.scale.width / this.cameras.main.zoom };
    for (const s of this.swimmers) {
      s.x += s.dir * s.speed * delta / 1000;
      if (s.x > W + 60) s.x = -60;
      if (s.x < -60) s.x = W + 60;
      s.y = s.base + Math.sin(time / 700 + s.ph) * 14;
      s.setScale(s.dir, 1);
      s.rotation = Math.cos(time / 700 + s.ph) * 0.12 * s.dir;
      s.setTexture(`pg-${s.kind}-${Math.floor(time / 220 + s.ph) % 2 ? 'a' : 'b'}`);
    }
  }
}
