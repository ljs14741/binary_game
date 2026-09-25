/* 장난감 모드 기록 화면. Toy 를 멈춘 채 위에 뜬다. 계속하면 이어서 부숨 */
import Phaser from 'phaser';
import { FONT, P, css } from '../art/palette.js';
import { button } from './ui.js';
import { setupCamera } from '../art/dpr.js';
import { T, fmt } from '../meta/i18n.js';
import { TOY_MODE } from '../meta/brand.js';
import { shareText } from '../meta/share.js';

export class ToyEnd extends Phaser.Scene {
  constructor() { super('ToyEnd'); }
  create(d) {
    const { W, H } = setupCamera(this);
    this.add.rectangle(W / 2, H / 2, W, H, 0x1c1a24, 0.82);
    const t = (y, str, size, color = '#fff', style = '800') => this.add.text(W / 2, y, str, { fontFamily: FONT, fontSize: size + 'px', fontStyle: style, color, align: 'center', stroke: css(P.uiDark), strokeThickness: 5 }).setOrigin(0.5);
    t(220, TOY_MODE, 26, css(P.accent), '900');
    const big = t(330, fmt(T.toyEndCombo, d.combo), 64, '#fff', '900');
    big.setScale(0); this.tweens.add({ targets: big, scale: 1, duration: 450, ease: 'Back.out' });
    t(405, d.isNew ? T.newRecord : fmt(T.toyEndBest, d.best), 22, d.isNew ? css(P.accent) : '#ddd');
    t(460, fmt(T.toyEndStats, d.objects, d.cleared), 18, '#ddd');
    this.toast = t(520, '', 16, '#8fd3ff');
    button(this, W / 2, H - 260, T.toyKeep, () => this.keep(), { primary: true, w: 300, h: 64 });
    button(this, W / 2 - 78, H - 180, T.share, () => this.share(d), { w: 148, h: 52, size: 18 });
    button(this, W / 2 + 78, H - 180, T.worldMap, () => { this.scene.stop('Toy'); this.scene.start('WorldMap'); }, { w: 148, h: 52, size: 18 });
    this.shownAt = this.time.now;
    this.input.keyboard.on('keydown-SPACE', () => { if (this.time.now - this.shownAt > 600) this.keep(); });
    this.input.keyboard.on('keydown-ESC', () => { this.scene.stop('Toy'); this.scene.start('WorldMap'); });
  }
  keep() { this.scene.stop(); this.scene.resume('Toy'); }
  share(d) {
    shareText(fmt(T.shareToy, TOY_MODE, d.combo, d.objects)).then(r => { if (r === 'copied') this.toast.setText(T.copied); });
  }
}
