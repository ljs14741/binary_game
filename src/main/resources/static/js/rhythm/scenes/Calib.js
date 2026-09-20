import Phaser from 'phaser';
import { FONT, P, css } from '../art/palette.js';
import { AudioEngine as audio } from '../core/audio.js';
import { Calibration } from '../core/calibration.js';
import { settings, saveCalib } from '../meta/settings.js';
import { input } from '../core/inputSingleton.js';
import { button } from './ui.js';
import { setupCamera } from '../art/dpr.js';
import { T, fmt } from '../meta/i18n.js';

export class Calib extends Phaser.Scene {
  constructor() { super('Calib'); }
  create() {
    const { W, H } = setupCamera(this);
    this._starting = false;
    this.add.rectangle(W / 2, H / 2, W, H, 0x2b2733);
    const t = (y, str, size, color = '#fff') => this.add.text(W / 2, y, str, { fontFamily: FONT, fontSize: size + 'px', fontStyle: '800', color, align: 'center', wordWrap: { width: W - 60 } }).setOrigin(0.5);
    t(110, T.calibTitle, 40, css(P.accent));
    t(180, T.calibDesc, 18, '#ddd');
    this.circle = this.add.circle(W / 2, 400, 70, P.accent).setStrokeStyle(6, P.uiDark);
    this.status = t(520, T.calibIdle, 22);
    this.result = t(580, '', 18, '#ddd');
    this.current = t(H - 40, currentLabel(), 16, '#bbb');

    this.calib = new Calibration(audio);
    this.calib.onTick = (i, pre) => {
      this.tweens.killTweensOf(this.circle); this.circle.setScale(1.15);
      this.tweens.add({ targets: this.circle, scale: 1, duration: 250 });
      if (pre) this.status.setText(fmt(T.calibPre, i + 1));
    };
    this.calib.onTap = (n, need) => {
      this.circle.setFillStyle(0xff5c7a); this.time.delayedCall(120, () => this.circle.setFillStyle(P.accent));
      this.status.setText(`${n} / ${need}`);
    };
    this.calib.onDone = v => {
      if (v == null) { this.status.setText(T.calibFew); return; }
      const ms = Math.round(v * 1000);
      this.status.setText(T.calibDone);
      this.result.setText(fmt(T.calibResult, (ms > 0 ? '+' : '') + ms) + '\n' + (Math.abs(ms) < 25 ? T.calibNone : ms > 0 ? T.calibLate : T.calibEarly));
      this.saveBtn.bg.setVisible(true); this.saveBtn.txt.setVisible(true); this.saveBtn.shadow.setVisible(true);
    };

    button(this, W / 2, 680, T.calibStart, () => this.calib.start(), { primary: true, w: 260 });
    this.saveBtn = button(this, W / 2, 760, T.calibSave, () => { saveCalib(this.calib.value); this.current.setText(currentLabel()); this.scene.start('Title'); }, { w: 260 });
    this.saveBtn.bg.setVisible(false); this.saveBtn.txt.setVisible(false); this.saveBtn.shadow.setVisible(false);
    button(this, W / 2 - 80, 840, T.calibReset, () => { saveCalib(null); this.current.setText(currentLabel()); }, { w: 140, h: 52, size: 18 });
    button(this, W / 2 + 80, 840, T.back, () => this.scene.start('Title'), { w: 140, h: 52, size: 18 });

    input.enabled = true;
    input.onTap = t => this.calib.tap(t);
    this.events.once('shutdown', () => { input.enabled = false; input.onTap = null; this.calib.active = false; });
  }
  update() { this.calib.update(); }
}
function currentLabel() { return fmt(T.calibCurrent, settings.calibOffset == null ? T.auto : Math.round(settings.calibOffset * 1000) + 'ms'); }
