/* CameraFx.js — 히트스톱, 줌 펀치, 흔들림, 팬. 손맛의 절반. */
import { DPR } from '../art/dpr.js';
export class CameraFx {
  constructor(scene) { this.scene = scene; this.cam = scene.cameras.main; this.baseZoom = DPR; this._stopUntil = 0; }

  // 물리·트윈을 잠깐 멈춘다 (오디오 시계는 계속 간다)
  hitStop(ms = 50) {
    const s = this.scene;
    if (s.matter) s.matter.world.pause();
    s.tweens.timeScale = 0.001;
    this._stopUntil = s.time.now + ms;
    s.time.delayedCall(ms, () => { if (s.matter) s.matter.world.resume(); s.tweens.timeScale = 1; });
  }

  punch(amount = 0.05, ms = 120) {
    const c = this.cam; const s = this.scene;
    s.tweens.killTweensOf(c);
    c.setZoom(this.baseZoom * (1 + amount));
    s.tweens.add({ targets: c, zoom: this.baseZoom, duration: ms, ease: 'Sine.out' });
  }

  shake(power = 0.006, ms = 120) { this.cam.shake(ms, power); }

  flash(ms = 80) { this.cam.flash(ms, 255, 255, 255, false); }

  panTo(x, y, ms = 600) { this.cam.pan(x, y, ms, 'Sine.easeInOut'); }

  impact(kind) {
    if (kind === 'perfect') { this.hitStop(55); this.punch(0.06, 140); this.shake(0.008, 140); this.flash(60); }
    else if (kind === 'good') { this.hitStop(25); this.punch(0.03, 110); this.shake(0.004, 100); }
    else if (kind === 'miss') { this.shake(0.003, 80); }
    else if (kind === 'free') { this.punch(0.02, 100); this.shake(0.003, 80); }
  }
}
