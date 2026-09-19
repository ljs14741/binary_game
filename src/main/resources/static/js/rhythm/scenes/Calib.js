import Phaser from 'phaser';
import { FONT, P, css } from '../art/palette.js';
import { AudioEngine as audio } from '../core/audio.js';
import { Calibration } from '../core/calibration.js';
import { settings, saveCalib } from '../meta/settings.js';
import { input } from '../core/inputSingleton.js';
import { button } from './ui.js';
import { setupCamera } from '../art/dpr.js';

export class Calib extends Phaser.Scene {
  constructor() { super('Calib'); }
  create() {
    const { W, H } = setupCamera(this);
    this._starting = false;
    this.add.rectangle(W / 2, H / 2, W, H, 0x2b2733);
    const t = (y, str, size, color = '#fff') => this.add.text(W / 2, y, str, { fontFamily: FONT, fontSize: size + 'px', fontStyle: '800', color, align: 'center', wordWrap: { width: W - 60 } }).setOrigin(0.5);
    t(110, '타이밍 보정', 40, css(P.accent));
    t(180, '블루투스 이어폰처럼 소리가 늦게 들릴 때 한 번만.\n1초 간격 틱 소리에 맞춰 8번 탭(스페이스)하세요.', 18, '#ddd');
    this.circle = this.add.circle(W / 2, 400, 70, P.accent).setStrokeStyle(6, P.uiDark);
    this.status = t(520, '시작을 누르면 예비 박자 4번 후 측정', 22);
    this.result = t(580, '', 18, '#ddd');
    this.current = t(H - 40, currentLabel(), 16, '#bbb');

    this.calib = new Calibration(audio);
    this.calib.onTick = (i, pre) => {
      this.tweens.killTweensOf(this.circle); this.circle.setScale(1.15);
      this.tweens.add({ targets: this.circle, scale: 1, duration: 250 });
      if (pre) this.status.setText('예비 박자 ' + (i + 1));
    };
    this.calib.onTap = (n, need) => {
      this.circle.setFillStyle(0xff5c7a); this.time.delayedCall(120, () => this.circle.setFillStyle(P.accent));
      this.status.setText(`${n} / ${need}`);
    };
    this.calib.onDone = v => {
      if (v == null) { this.status.setText('탭이 부족해요. 다시 시도!'); return; }
      const ms = Math.round(v * 1000);
      this.status.setText('측정 완료!');
      this.result.setText(`측정된 지연: ${ms > 0 ? '+' : ''}${ms}ms\n` + (Math.abs(ms) < 25 ? '거의 없음. 저장 안 해도 돼요' : ms > 0 ? '탭이 소리보다 늦게 들어와요. 저장하면 보정됩니다' : '탭이 소리보다 빨라요. 저장하면 보정됩니다'));
      this.saveBtn.bg.setVisible(true); this.saveBtn.txt.setVisible(true); this.saveBtn.shadow.setVisible(true);
    };

    button(this, W / 2, 680, '시작', () => this.calib.start(), { primary: true, w: 260 });
    this.saveBtn = button(this, W / 2, 760, '이 값으로 저장', () => { saveCalib(this.calib.value); this.current.setText(currentLabel()); this.scene.start('Title'); }, { w: 260 });
    this.saveBtn.bg.setVisible(false); this.saveBtn.txt.setVisible(false); this.saveBtn.shadow.setVisible(false);
    button(this, W / 2 - 80, 840, '초기화', () => { saveCalib(null); this.current.setText(currentLabel()); }, { w: 140, h: 52, size: 18 });
    button(this, W / 2 + 80, 840, '돌아가기', () => this.scene.start('Title'), { w: 140, h: 52, size: 18 });

    input.enabled = true;
    input.onTap = t => this.calib.tap(t);
    this.events.once('shutdown', () => { input.enabled = false; input.onTap = null; this.calib.active = false; });
  }
  update() { this.calib.update(); }
}
function currentLabel() { return '현재 보정값: ' + (settings.calibOffset == null ? '자동' : Math.round(settings.calibOffset * 1000) + 'ms'); }
