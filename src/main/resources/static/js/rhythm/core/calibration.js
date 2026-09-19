/* calibration.js — 입력 지연 보정
 * 60BPM 틱(1초 간격) 4번 예비 후 8번 탭 → (탭 시각 − 틱 시각) 중앙값.
 * 간격이 1초라 ±500ms 까지의 지연을 잘못 배정 없이 잰다 (블루투스 200~300ms 포함).
 */
export class Calibration {
  constructor(audio, ui = {}) {
    this.audio = audio; this.ui = ui;
    this.active = false; this.value = null;
    this.spb = 1.0; this.pre = 4; this.need = 8;
    this.onTick = null; this.onTap = null; this.onDone = null;
  }

  start() {
    if (this.active) return Promise.resolve();
    return this.audio.unlock().then(() => {
      const a = this.audio;
      this.t0 = a.now() + 0.8;
      this.ticks = [];
      const total = this.pre + this.need;
      for (let i = 0; i < total; i++) {
        const t = this.t0 + i * this.spb;
        this.ticks.push(t);
        a.tick(t, i >= this.pre && (i - this.pre) % 4 === 0);
      }
      this.taps = []; this.lastTick = -1; this.active = true;
      this.value = null;
    });
  }

  tap(now = this.audio.now()) {
    if (!this.active) return false;
    if (now < this.t0 + (this.pre - 0.5) * this.spb) return false;
    const i = Math.round((now - this.t0) / this.spb);
    if (i < this.pre || i >= this.ticks.length) return false;
    this.taps.push(now - this.ticks[i]);
    if (this.onTap) this.onTap(this.taps.length, this.need);
    if (this.taps.length >= this.need) this.finish();
    return true;
  }

  // 매 프레임 호출
  update(now = this.audio.now()) {
    if (!this.active) return;
    const i = Math.floor((now - this.t0) / this.spb);
    if (i !== this.lastTick && i >= 0 && i < this.ticks.length) {
      this.lastTick = i;
      if (this.onTick) this.onTick(i, i < this.pre);
    }
    if (now > this.t0 + (this.ticks.length + 1) * this.spb) {
      if (this.taps.length >= 3) this.finish();
      else { this.active = false; if (this.onDone) this.onDone(null); }
    }
  }

  finish() {
    this.active = false;
    const s = this.taps.slice().sort((a, b) => a - b);
    const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    this.value = m;
    if (this.onDone) this.onDone(m);
  }
}
