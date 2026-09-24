/* 효과음·배경음. 파일 없이 Web Audio 로 합성함.
 * 브라우저 정책상 첫 터치 뒤에만 소리가 남 → unlock() 을 첫 입력에서 부름.
 */
const PENTA = [0, 2, 4, 7, 9];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
/* 음량. 설정 창 슬라이더(0~1) × 최대값 = 버스 게인.
 * 2026-09-24 측정: 예전(배경 0.2·효과 0.8)은 배경 -44.5dB·효과 -32dB 로 너무 작았음 → 최대값을 크게 잡고 압축기로 찢어짐만 막음 */
const MUSIC_MAX = 2.2, SFX_MAX = 2.4;
// 배경음은 효과음보다 조금 작게 (코인·타격 소리가 묻히지 않게)
export const DEFAULT_VOL = { music: 0.55, sfx: 0.9 };

/* 월드별 곡. 16마디(8분음표 8칸 × 16) = A 8마디 + B 8마디. chords 는 조성 기준 반음 간격.
 * 멜로디는 마디마다 모티프(화음 음 번호, -1 쉼)를 골라 화음을 따라가게 해서 어느 화음에서도 어울림 */
const M = {
  a: [0, 1, 2, -1, 1, -1, 0, -1], b: [2, -1, 1, 2, 3, -1, 2, -1], c: [3, 2, 1, -1, 2, 1, 0, -1], d: [0, -1, -1, 1, 2, -1, -1, -1],
  e: [1, 2, 3, 4, 3, 2, 1, -1], f: [4, -1, 3, -1, 2, -1, 1, -1], g: [2, 2, -1, 3, -1, 1, 0, -1], h: [0, -1, -1, -1, -1, -1, -1, -1]
};
const FORM = ['a', 'b', 'a', 'c', 'a', 'b', 'e', 'd', 'f', 'g', 'f', 'c', 'e', 'f', 'g', 'h'];
const FORM2 = ['b', 'a', 'e', 'c', 'b', 'a', 'g', 'd', 'e', 'g', 'f', 'c', 'f', 'e', 'g', 'h'];   // 두 번째 바퀴 변주
const SONGS = [
  { // 얼음 연못: 밝은 마림바 + 뮤직박스, 통통 베이스
    key: 60, bpm: 112, lead: 'triangle', leadDur: 1.3, leadGain: 0.12, box: true, pad: 'sine', bassType: 'triangle', bassGain: 0.2,
    chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14], [5, 9, 12], [7, 11, 14],
      [5, 9, 12], [7, 11, 14], [4, 7, 11], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7], [0, 4, 7]],
    bass: [0, -1, 7, -1, 0, -1, 7, 12], kick: [0, 4], snare: [2, 6]
  },
  { // 빙하 동굴: 반짝이는 벨, 신비로운 단조
    key: 57, bpm: 104, lead: 'sine', leadDur: 2.6, leadGain: 0.12, fifth: true, pad: 'triangle', bassType: 'sine', bassGain: 0.22,
    chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17], [0, 3, 7], [8, 12, 15], [7, 11, 14], [7, 11, 14],
      [5, 8, 12], [0, 3, 7], [8, 12, 15], [10, 14, 17], [5, 8, 12], [7, 11, 14], [0, 3, 7], [0, 3, 7]],
    bass: [0, -1, -1, 12, 7, -1, -1, -1], kick: [0], snare: [6]
  },
  { // 깊은 바다: 부드러운 신스, 베이스 그루브
    key: 62, bpm: 116, lead: 'square', leadLp: 1700, leadDur: 1.2, leadGain: 0.06, pad: 'sawtooth', padLp: 900, bassType: 'sawtooth', bassLp: 420, bassGain: 0.13,
    chords: [[0, 3, 7, 10], [5, 8, 12, 15], [0, 3, 7, 10], [7, 11, 14], [0, 3, 7, 10], [5, 8, 12, 15], [8, 12, 15], [7, 11, 14],
      [8, 12, 15], [10, 14, 17], [3, 7, 10], [0, 3, 7, 10], [5, 8, 12, 15], [7, 11, 14], [0, 3, 7, 10], [0, 3, 7, 10]],
    bass: [0, -1, 0, 12, -1, 7, -1, 10], kick: [0, 3, 4], snare: [2, 6]
  }
];

export const Sound = {
  ctx: null, master: null, sfx: null, music: null, vol: { ...DEFAULT_VOL }, _noise: null, _last: {},
  _mode: null, _step: 0, _next: 0, _timer: null,
  world: 0,          // 월드별 곡
  intensity: 1,      // 0 멜로디만 · 1 +베이스 · 2 +드럼 · 3 +아르페지오 (판이 커질수록)
  push: false,       // 마지막 조각 앞: 살짝 빨라짐

  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    // 압축기는 소리를 줄이는 게 아니라 큰 소리가 겹칠 때 찢어지지 않게 잡는 용도
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 1; this.master.connect(comp);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.vol.sfx * SFX_MAX; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.vol.music * MUSIC_MAX; this.music.connect(this.master);
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return ctx;
  },

  unlock() {
    const ctx = this.init();
    if (!ctx) return Promise.resolve();
    return ctx.state !== 'running' ? ctx.resume().catch(() => {}) : Promise.resolve();
  },

  get ready() { return this.ctx && this.ctx.state === 'running'; },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  /** kind: 'music' | 'sfx', v: 0~1 (0 이면 꺼짐) */
  setVolume(kind, v) {
    this.vol[kind] = Math.max(0, Math.min(1, v));
    const bus = kind === 'music' ? this.music : this.sfx;
    if (bus) bus.gain.setTargetAtTime(this.vol[kind] * (kind === 'music' ? MUSIC_MAX : SFX_MAX), this.now(), 0.03);
  },
  setWorld(w) { if (this.world !== w) { this.world = w; this._step = 0; } },

  // 같은 소리가 한 프레임에 몰리면 시끄러움
  gate(name, ms) {
    const t = performance.now();
    if (this._last[name] && t - this._last[name] < ms) return false;
    this._last[name] = t;
    return true;
  },

  tone(o) {
    if (!this.ready) return;
    const ctx = this.ctx, t = o.t != null ? o.t : ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.slide || o.dur));
    const a = o.attack || 0.004, peak = o.gain || 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.bus || this.sfx);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  },

  noise(o) {
    if (!this.ready) return;
    const ctx = this.ctx, t = o.t != null ? o.t : ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this._noise;
    const f = ctx.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freq2) f.frequency.exponentialRampToValueAtTime(o.freq2, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || this.sfx);
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.02);
  },

  /* ---------- 효과음 ---------- */
  plop() { if (!this.gate('plop', 40)) return; this.tone({ f: 900, f2: 300, dur: 0.12, type: 'sine', gain: 0.25 }); this.noise({ dur: 0.08, gain: 0.08, freq: 2500, q: 2 }); },
  gulp() { if (!this.gate('gulp', 50)) return; this.tone({ f: 260, f2: 520, dur: 0.1, type: 'triangle', gain: 0.22 }); },
  coinDrop() { if (!this.gate('drop', 60)) return; this.tone({ f: 1400, dur: 0.05, type: 'sine', gain: 0.05 }); },
  coin(kind) {
    if (!this.gate('coin', 35)) return;
    const base = { silver: 1320, gold: 1568, pearl: 1760, diamond: 2093, chest: 1047, egg: 1047 }[kind] || 1320;
    const t = this.now();
    this.tone({ t, f: base, dur: 0.08, type: 'square', gain: 0.07, lp: 5000 });
    this.tone({ t: t + 0.06, f: base * 1.5, dur: 0.16, type: 'square', gain: 0.07, lp: 5000 });
    if (kind === 'diamond' || kind === 'chest') this.tone({ t: t + 0.12, f: base * 2, dur: 0.2, type: 'triangle', gain: 0.1 });
  },
  buy() { const t = this.now(); [0, 0.07, 0.14].forEach((d, i) => this.tone({ t: t + d, f: [784, 988, 1319][i], dur: 0.12, type: 'triangle', gain: 0.16 })); },
  no() { if (!this.gate('no', 150)) return; this.tone({ f: 220, f2: 160, dur: 0.14, type: 'square', gain: 0.07, lp: 1200 }); },
  grow() { const t = this.now(); [0, 0.06, 0.12, 0.18].forEach((d, i) => this.tone({ t: t + d, f: midi(76 + [0, 4, 7, 12][i]), dur: 0.14, type: 'triangle', gain: 0.13 })); },
  splash() { if (!this.gate('splash', 80)) return; this.noise({ dur: 0.35, gain: 0.25, filter: 'lowpass', freq: 3000, freq2: 400 }); },
  throwSnow() { if (!this.gate('throw', 30)) return; this.noise({ dur: 0.07, gain: 0.12, freq: 1800, freq2: 3500, q: 1.5 }); },
  hit() { if (!this.gate('hit', 30)) return; this.tone({ f: 180, f2: 70, dur: 0.12, type: 'sine', gain: 0.4 }); this.noise({ dur: 0.08, gain: 0.25, freq: 1200, q: 0.8 }); },
  block() { if (!this.gate('block', 60)) return; this.tone({ f: 1200, f2: 900, dur: 0.1, type: 'square', gain: 0.07, lp: 3000 }); },
  warn() { const t = this.now(); for (let i = 0; i < 3; i++) { this.tone({ t: t + i * 0.32, f: 880, f2: 660, dur: 0.26, type: 'sawtooth', gain: 0.08, lp: 2000 }); } },
  roar() { this.noise({ dur: 1.1, gain: 0.45, filter: 'lowpass', freq: 600, freq2: 120 }); this.tone({ f: 110, f2: 55, dur: 1.0, type: 'sawtooth', gain: 0.18, lp: 400 }); },
  chomp() { this.tone({ f: 140, f2: 60, dur: 0.18, type: 'square', gain: 0.18, lp: 700 }); this.noise({ dur: 0.1, gain: 0.2, freq: 700 }); },
  sad() { const t = this.now(); this.tone({ t, f: 660, f2: 440, dur: 0.35, type: 'triangle', gain: 0.12 }); this.tone({ t: t + 0.3, f: 494, f2: 330, dur: 0.45, type: 'triangle', gain: 0.1 }); },
  predDie() { const t = this.now(); this.tone({ t, f: 520, f2: 1600, dur: 0.25, type: 'triangle', gain: 0.18 }); this.noise({ t, dur: 0.3, gain: 0.2, freq: 3000, freq2: 800 }); },
  zap() { if (!this.gate('zap', 100)) return; this.noise({ dur: 0.15, gain: 0.14, filter: 'highpass', freq: 3000 }); this.tone({ f: 1800, f2: 600, dur: 0.12, type: 'sawtooth', gain: 0.06 }); },
  puff() { this.tone({ f: 300, f2: 900, dur: 0.2, type: 'sine', gain: 0.2 }); },
  hatch() { const t = this.now(); this.noise({ t, dur: 0.1, gain: 0.2, freq: 2500 }); [0, 0.08, 0.16].forEach((d, i) => this.tone({ t: t + 0.1 + d, f: midi(79 + [0, 5, 9][i]), dur: 0.14, type: 'sine', gain: 0.14 })); },
  egg() { const t = this.now(); [0, 0.1, 0.2, 0.3].forEach((d, i) => this.tone({ t: t + d, f: midi(72 + [0, 4, 7, 12][i]), dur: 0.22, type: 'triangle', gain: 0.16 })); },
  fanfare() {
    const t = this.now();
    const notes = [72, 76, 79, 84, 79, 84];
    const at = [0, 0.12, 0.24, 0.36, 0.56, 0.68];
    notes.forEach((n, i) => { this.tone({ t: t + at[i], f: midi(n), dur: i === 5 ? 0.9 : 0.2, type: 'square', gain: 0.08, lp: 3500 }); this.tone({ t: t + at[i], f: midi(n - 12), dur: i === 5 ? 0.9 : 0.2, type: 'triangle', gain: 0.1 }); });
  },
  lose() { const t = this.now(); [72, 67, 63, 60].forEach((n, i) => this.tone({ t: t + i * 0.28, f: midi(n), dur: 0.4, type: 'triangle', gain: 0.14 })); },
  growl() { this.tone({ f: 160, f2: 90, dur: 0.35, type: 'sawtooth', gain: 0.12, lp: 600 }); this.noise({ dur: 0.3, gain: 0.15, filter: 'lowpass', freq: 500 }); },
  swoop() { if (!this.gate('swoop', 400)) return; this.noise({ dur: 0.4, gain: 0.12, freq: 900, freq2: 3200, q: 1.2 }); },
  aim() { if (!this.gate('aim', 300)) return; this.tone({ f: 1320, dur: 0.08, type: 'square', gain: 0.05, lp: 3000 }); this.tone({ t: this.now() + 0.14, f: 1320, dur: 0.08, type: 'square', gain: 0.05, lp: 3000 }); },
  freeze() { const t = this.now(); [0, 0.05, 0.1].forEach((d, i) => this.tone({ t: t + d, f: [2093, 2637, 3136][i], dur: 0.12, type: 'sine', gain: 0.08 })); },
  click() { if (!this.gate('click', 40)) return; this.tone({ f: 1000, dur: 0.04, type: 'square', gain: 0.05, lp: 3000 }); },

  /* ---------- 배경음 ----------
   * calm: 월드별 16마디 곡 + 판 크기에 따라 악기가 늘어남. danger: 단조로 빠르게, boss: 낮은 베이스 추가.
   * 0.35초 앞까지 미리 예약. 화면이 밀려 예약을 놓치면 그 칸은 건너뛰고 박자는 유지 */
  bgm(mode) {
    if (this._mode === mode) return;
    this._mode = mode;
    if (!mode) { clearInterval(this._timer); this._timer = null; return; }
    if (!this._timer) {
      this._next = 0;
      this._timer = setInterval(() => this._tick(), 50);
    }
  },

  _tick() {
    if (!this.ready || !this._mode) return;
    const S = SONGS[this.world] || SONGS[0];
    const bpm = this._mode === 'calm' ? S.bpm + (this.push ? 8 : 0) : this._mode === 'danger' ? 132 : 140;
    const stepDur = 60 / bpm / 2;
    const now = this.ctx.currentTime;
    if (this._next < now - 1) this._next = now + 0.05;
    while (this._next < now) { this._next += stepDur; this._step++; }
    while (this._next < now + 0.35) {
      this._play(this._step, this._next, stepDur);
      this._step++;
      this._next += stepDur;
    }
  },

  _play(step, t, sd) {
    if (this._mode === 'calm') return this._calm(step, t, sd);
    const bus = this.music;
    const bar = Math.floor(step / 8) % 4, s = step % 8;
    const roots = this._mode === 'boss' ? [45, 45, 44, 43] : [57, 53, 55, 52];
    const r = roots[bar];
    this.tone({ t, f: midi(r - 12), dur: sd * 0.9, type: 'sawtooth', gain: s % 2 ? 0.1 : 0.16, lp: 500, bus });
    if (s === 0 || s === 4) this.noise({ t, dur: 0.12, gain: 0.25, filter: 'lowpass', freq: 200, bus });
    if (s === 2 || s === 6) this.noise({ t, dur: 0.1, gain: 0.12, freq: 1800, bus });
    if (s % 2 === 1) this.noise({ t, dur: 0.03, gain: 0.05, filter: 'highpass', freq: 8000, bus });
    if (s === 0 || s === 3 || s === 6) this.tone({ t, f: midi(r + 12 + [0, 3, 7][s / 3 | 0]), dur: sd, type: 'square', gain: 0.04, lp: 2500, bus });
  },

  _calm(step, t, sd) {
    const bus = this.music, S = SONGS[this.world] || SONGS[0], I = this.intensity;
    const bar = Math.floor(step / 8) % 16, s = step % 8, loop = Math.floor(step / 128);
    const ch = S.chords[bar], root = S.key + ch[0];
    // 화음 깔개 (마디 첫 박)
    if (s === 0) ch.forEach(o => this.tone({ t, f: midi(S.key + o), dur: sd * 7.6, type: S.pad, lp: S.padLp, gain: 0.03, attack: 0.12, bus }));
    // 베이스
    if (I >= 1 && S.bass[s] >= 0) this.tone({ t, f: midi(root - 24 + S.bass[s]), dur: sd * 1.1, type: S.bassType, lp: S.bassLp, gain: S.bassGain, bus });
    // 드럼
    if (I >= 2) {
      if (S.kick.includes(s)) this.tone({ t, f: 150, f2: 45, dur: 0.14, type: 'sine', gain: 0.32, bus });
      if (S.snare.includes(s)) this.noise({ t, dur: 0.1, gain: 0.11, freq: 1800, bus });
      if (s % 2 === 1) this.noise({ t, dur: 0.03, gain: 0.035, filter: 'highpass', freq: 8000, bus });
    }
    // 멜로디: 두 번째 바퀴는 다른 모티프 순서, 네 번째마다 B 앞부분을 한 옥타브 위로
    const motif = M[(loop % 2 ? FORM2 : FORM)[bar]], m = motif[s];
    if (m >= 0) {
      const tones = [...ch, ...ch.map(o => o + 12)];
      const n = S.key + 12 + tones[Math.min(m, tones.length - 1)] + (loop % 4 === 3 && bar >= 8 && bar < 12 ? 12 : 0);
      this.tone({ t, f: midi(n), dur: sd * S.leadDur, type: S.lead, lp: S.leadLp, gain: S.leadGain, bus });
      if (S.box && s % 2 === 0) this.tone({ t, f: midi(n + 12), dur: sd * 0.7, type: 'sine', gain: 0.035, bus });
      if (S.fifth) this.tone({ t, f: midi(n + 7), dur: sd * S.leadDur, type: 'sine', gain: 0.03, bus });
    }
    // 아르페지오 (판이 한창일 때)
    if (I >= 3) this.tone({ t, f: midi(S.key + 24 + ch[s % ch.length]), dur: sd * 0.6, type: 'sine', gain: 0.03, bus });
  }
};
