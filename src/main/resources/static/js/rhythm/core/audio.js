/* audio.js — Web Audio 엔진
 * 시계(now)는 AudioContext.currentTime. 합성음(기존)과 샘플 파일 재생을 모두 지원한다.
 * 샘플이 로드돼 있으면 hit()/cue()는 샘플을, 없으면 합성음을 쓴다.
 */
const CHORDS = [
  { root: 65.41, notes: [261.63, 329.63, 392.00], hook: [523.25, 587.33, 659.25, 783.99] }, // C
  { root: 55.00, notes: [220.00, 261.63, 329.63], hook: [440.00, 523.25, 587.33, 659.25] }, // Am
  { root: 43.65, notes: [174.61, 220.00, 261.63], hook: [349.23, 440.00, 523.25, 587.33] }, // F
  { root: 49.00, notes: [196.00, 246.94, 293.66], hook: [392.00, 493.88, 587.33, 783.99] }  // G
];
const BASS_PAT = { 0: 1, 0.5: 2, 1.5: 1, 2: 2, 2.5: 1, 3: 1.5, 3.5: 2 };
// 코치 마디 훅 (8분음표 위치 → hook 인덱스, 없으면 쉼). 2가지 프레이즈를 패턴마다 번갈아.
const HOOK_A = { 0: 0, 0.5: 1, 1: 2, 2: 3, 2.5: 2, 3: 1 };
const HOOK_B = { 0: 2, 1: 3, 1.5: 2, 2: 1, 3: 0, 3.5: 1 };
export function chordFor(pattern, bar) { return CHORDS[(pattern != null ? pattern : bar) % 4]; }
const rnd = (a, b) => a + Math.random() * (b - a);

export const AudioEngine = {
  ctx: null, master: null, sfxBus: null, musicBus: null, muted: false, _noise: null,
  samples: new Map(),

  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 20; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.15;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 1; this.master.connect(comp);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 1.0; this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.5; this.musicBus.connect(this.master);
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return ctx;
  },

  unlock() {
    const ctx = this.init();
    const p = ctx.state !== 'running' ? ctx.resume() : Promise.resolve();
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination); src.start(0);
    } catch (e) { /* ignore */ }
    return p;
  },

  now() { return this.ctx ? this.ctx.currentTime : 0; },
  latency() { const c = this.ctx; return c ? (c.baseLatency || 0) + (c.outputLatency || 0) : 0; },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.now(), 0.01); },
  suspend() { return this.ctx ? this.ctx.suspend() : Promise.resolve(); },
  resume() { return this.ctx ? this.ctx.resume() : Promise.resolve(); },

  /* ---------- 샘플 ---------- */
  async load(name, url) {
    const ctx = this.init();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`sample ${name}: HTTP ${res.status}`);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    this.samples.set(name, buf);
    return buf;
  },
  async loadAll(map) {
    const results = await Promise.allSettled(Object.entries(map).map(([n, u]) => this.load(n, u)));
    return results.filter(r => r.status === 'rejected').map(r => r.reason && r.reason.message);
  },
  has(name) { return this.samples.has(name); },
  // {t, gain?, rate?, bus?}
  play(name, o = {}) {
    const buf = this.samples.get(name); const ctx = this.ctx;
    if (!buf || !ctx) return false;
    const t = o.t == null ? this.now() : o.t;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = o.rate || 1;
    const g = ctx.createGain(); g.gain.value = o.gain == null ? 1 : o.gain;
    src.connect(g); g.connect(o.bus || this.sfxBus);
    src.start(t);
    return true;
  },

  /* ---------- 합성 프리미티브 ---------- */
  _env(t, peak, attack, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  },
  tone(o) {
    const ctx = this.ctx; if (!ctx) return;
    const t = o.t;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freq2) osc.frequency.exponentialRampToValueAtTime(o.freq2, t + (o.slide || o.dur));
    const g = this._env(t, o.gain, o.attack || 0.002, o.dur);
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); f.connect(g); }
    else osc.connect(g);
    g.connect(o.bus || this.sfxBus);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  },
  noise(o) {
    const ctx = this.ctx; if (!ctx) return;
    const t = o.t;
    const src = ctx.createBufferSource();
    src.buffer = this._noise; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq, t);
    if (o.freq2) f.frequency.exponentialRampToValueAtTime(o.freq2, t + o.dur);
    f.Q.value = o.q || 1;
    const g = this._env(t, o.gain, o.attack || 0.001, o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || this.sfxBus);
    src.start(t, Math.random() * 1.5); src.stop(t + o.dur + 0.05);
  },

  /* ---------- 게임 효과음 ---------- */
  // 플레이어 해머 타격. material: 'brick' | 'wood' | 'glass' | 'metal' (샘플 이름 접두)
  hit(t, o = {}) {
    if (t == null) t = this.now();
    const pw = o.power == null ? 1 : o.power;
    const mat = o.material || 'brick';
    const played = this.play(`hit-${mat}`, { t, gain: pw, rate: rnd(0.94, 1.06) });
    if (!played) {
      if (mat === 'glass') {          // 쨍그랑: 고음 노이즈 + 짧은 금속 배음
        this.noise({ t, dur: 0.16, gain: 0.55 * pw, type: 'highpass', freq: 3200, q: 0.6 });
        this.noise({ t, dur: 0.05, gain: 0.5 * pw, type: 'bandpass', freq: rnd(5000, 7000), q: 3 });
        [2637, 3520, 4186].forEach((f, i) => this.tone({ t: t + i * 0.012, freq: f * rnd(0.97, 1.03), dur: 0.14, gain: 0.07 * pw, type: 'sine' }));
      } else if (mat === 'wood') {    // 퉁: 중음 노이즈 + 짧은 저음, 튀는 배음 없음
        this.tone({ t, freq: rnd(180, 220), freq2: 90, slide: 0.05, dur: 0.1, type: 'triangle', gain: 0.7 * pw });
        this.noise({ t, dur: 0.06, gain: 0.55 * pw, type: 'bandpass', freq: rnd(500, 800), freq2: 250, q: 1.2 });
        this.noise({ t, dur: 0.02, gain: 0.2 * pw, type: 'highpass', freq: 2500, q: 0.7 });
      } else if (mat === 'metal') {    // 깡: 긴 배음
        this.tone({ t, freq: rnd(900, 1100), freq2: 700, slide: 0.2, dur: 0.35, type: 'square', gain: 0.18 * pw, lp: 5000 });
        this.noise({ t, dur: 0.05, gain: 0.4 * pw, type: 'highpass', freq: 4000, q: 0.7 });
      } else {                        // 벽돌: 저음 충격 + 돌 부서짐
        this.tone({ t, freq: rnd(120, 150), freq2: 40, slide: 0.07, dur: 0.16, type: 'sine', gain: 0.9 * pw });
        this.noise({ t, dur: 0.09, gain: 0.7 * pw, type: 'bandpass', freq: rnd(900, 1400), freq2: 300, q: 0.8 });
        this.noise({ t, dur: 0.03, gain: 0.3 * pw, type: 'highpass', freq: 3000, q: 0.7 });
      }
    }
    if (o.pitch) {   // 타격이 음악이 된다: 코드 톤 "땅"
      this.tone({ t, freq: o.pitch, dur: 0.22, gain: o.perfect ? 0.22 : 0.12, type: 'triangle', lp: 4000 });
      this.tone({ t, freq: o.pitch * 2, dur: 0.12, gain: o.perfect ? 0.08 : 0.03, type: 'sine' });
    }
    if (o.perfect) this.tone({ t: t + 0.02, freq: 2093, dur: 0.1, gain: 0.06, type: 'sine' });
  },
  // 시범(cue): 호루라기 "삑". 드럼·멜로디와 겹치지 않는 고음역, 짧고 또렷하게.
  cue(t) {
    if (t == null) t = this.now();
    if (this.play('cue', { t, gain: 0.9 })) return;
    this.tone({ t, freq: 2100, freq2: 2400, slide: 0.03, dur: 0.11, type: 'square', gain: 0.16, lp: 6000, attack: 0.004 });
    this.tone({ t: t + 0.005, freq: 2650, freq2: 2350, slide: 0.09, dur: 0.1, type: 'sine', gain: 0.12 });
    this.noise({ t, dur: 0.04, gain: 0.12, type: 'bandpass', freq: 2400, q: 4 });
  },
  miss(t) { if (t == null) t = this.now(); this.tone({ t, freq: 220, freq2: 110, slide: 0.15, dur: 0.18, type: 'triangle', gain: 0.3 }); },
  whiff(t) { if (t == null) t = this.now(); this.noise({ t, dur: 0.12, gain: 0.25, type: 'bandpass', freq: 900, freq2: 2500, q: 2 }); },
  tick(t, accent) { this.tone({ t, freq: accent ? 1760 : 1175, dur: 0.06, type: 'square', gain: 0.12, lp: 4000 }); },

  /* ---------- 드럼 / 베이스 (합성 BGM) ---------- */
  kick(t) {
    this.tone({ t, freq: 150, freq2: 42, slide: 0.08, dur: 0.22, type: 'sine', gain: 0.9, bus: this.musicBus });
    this.noise({ t, dur: 0.02, gain: 0.15, type: 'lowpass', freq: 800, bus: this.musicBus });
  },
  hat(t, open) { this.noise({ t, dur: open ? 0.12 : 0.04, gain: open ? 0.18 : 0.13, type: 'highpass', freq: 7500, q: 0.5, bus: this.musicBus }); },
  snare(t) {
    this.noise({ t, dur: 0.14, gain: 0.35, type: 'bandpass', freq: 1800, q: 0.5, bus: this.musicBus });
    this.tone({ t, freq: 190, freq2: 120, slide: 0.05, dur: 0.09, type: 'triangle', gain: 0.3, bus: this.musicBus });
  },
  bass(t, freq, dur) { this.tone({ t, freq, dur, type: 'sawtooth', gain: 0.22, lp: 500, attack: 0.005, bus: this.musicBus }); },
  stab(t, freqs, dur) { freqs.forEach(f => this.tone({ t, freq: f, dur: dur || 0.16, type: 'triangle', gain: 0.07, lp: 3000, bus: this.musicBus })); },

  pad(t, freqs, dur) { freqs.forEach(f => this.tone({ t, freq: f, dur, type: 'sawtooth', gain: 0.035, lp: 900, attack: 0.08, bus: this.musicBus })); },
  pluck(t, freq, dur) { this.tone({ t, freq, dur: dur || 0.18, type: 'square', gain: 0.07, lp: 2200, attack: 0.003, bus: this.musicBus }); },
  roll(t, n, spacing) { for (let i = 0; i < n; i++) this.noise({ t: t + i * spacing, dur: 0.06, gain: 0.18 + 0.05 * i, type: 'bandpass', freq: 1800, q: 0.6, bus: this.musicBus }); },

  // 8분음표 스텝 하나를 스케줄 (Conductor 가 호출)
  // info: { bar, countIn, outro, phase: 'intro'|'call'|'response'|'outro', pattern, patterns }
  musicStep(step, t, info) {
    const bib = (step / 2) % 4;
    const ph = info.phase, pi = info.pattern || 0, total = info.patterns || 16;
    const chord = chordFor(info.pattern, info.bar);
    const late = pi >= total * 0.5, climax = pi >= total * 0.75;
    if (info.outro) {
      if (bib === 0) { this.kick(t); this.snare(t); this.stab(t, [523.25, 659.25, 783.99], 0.8); this.bass(t, 65.41, 0.8); this.pluck(t, 1046.5, 0.5); }
      return;
    }
    // 반주 덕킹: 코치 구간은 반주를 낮춰 호루라기가 또렷하게, 내 차례·인트로는 원래대로
    if (bib === 0 && this.musicBus) this.musicBus.gain.setTargetAtTime(ph === 'call' ? 0.22 : 0.5, t, 0.04);
    // 드럼: 코치 구간엔 킥·스네어 없음 (신호와 헷갈리지 않게). 내 차례엔 박자 기준으로 돌아온다.
    if (ph !== 'call') {
      if (bib === 0 || bib === 2 || (climax && bib === 1.5)) this.kick(t);
      if (bib === 1 || bib === 3) this.snare(t);
    }
    if (ph === 'call') { if (bib % 1 === 0.5) this.hat(t, false); }           // 코치: 하이햇 엇박만 (신호는 정박·엇박 어디든 올 수 있으니 아주 작게)
    else if (ph === 'response') { this.hat(t, bib === 3.5); if (late && bib % 1 === 0.5) this.hat(t, false); }
    else { this.hat(t, bib === 3.5); if (late && bib % 1 === 0.5) this.hat(t, false); }
    if (ph === 'call' && bib === 3.5) this.roll(t, 3, 0.083);                  // "네 차례" 예고 필
    // 베이스: 코치 구간은 마디 첫 박만, 그 외 8분
    const bm = BASS_PAT[bib];
    if (bm && (ph !== 'call' || bib === 0)) this.bass(t, chord.root * bm, bm === 2 ? 0.15 : 0.22);
    // 패드: 마디 첫 박에 코드 (항상)
    if (bib === 0) this.pad(t, chord.notes, ph === 'response' ? 1.9 : 1.6);
    // 훅 멜로디: 인트로·내 차례(플레이어 타격 사이를 채우는 얇은 훅은 생략) → 인트로만
    if (ph === 'intro') {
      const hook = pi % 2 ? HOOK_B : HOOK_A;
      const idx = hook[bib];
      if (idx != null) this.pluck(t, chord.hook[idx] * (climax ? 2 : 1), 0.16);
      if (bib === 1 || bib === 3) this.stab(t, chord.notes);
    }
    if (info.countIn && Number.isInteger(bib)) this.tick(t, bib === 3);
  },

  /* ---------- 타이틀 루프 (Conductor 없이 자체 스케줄) ---------- */
  startLoop(bpm = 120) {
    if (this._loop || !this.ctx) return;
    const spb = 60 / bpm; let step = 0; let t0 = this.now() + 0.1;
    const tickFn = () => {
      const until = this.now() + 0.2;
      while (t0 + step * spb * 0.5 <= until) {
        const t = t0 + step * spb * 0.5, bib = (step / 2) % 4, bar = Math.floor(step / 8);
        const chord = CHORDS[bar % 4];
        if (bib === 0 || bib === 2.5) this.kick(t);
        if (bib === 1 || bib === 3) this.snare(t);
        this.hat(t, bib === 3.5);
        if (bib === 0) this.pad(t, chord.notes, 1.8);
        const bm = BASS_PAT[bib]; if (bm) this.bass(t, chord.root * bm, 0.18);
        if (bar % 2 === 1) { const idx = HOOK_A[bib]; if (idx != null) this.pluck(t, chord.hook[idx], 0.15); }
        step++;
      }
    };
    tickFn();
    this._loop = setInterval(tickFn, 50);
  },
  stopLoop() { if (this._loop) { clearInterval(this._loop); this._loop = null; } },

  fanfare(t, good) {
    if (good) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone({ t: t + i * 0.09, freq: f, dur: 0.35, type: 'triangle', gain: 0.18 }));
      this.tone({ t: t + 0.36, freq: 1318.5, dur: 0.7, type: 'triangle', gain: 0.15 });
    } else {
      this.tone({ t, freq: 392, dur: 0.3, type: 'triangle', gain: 0.18 });
      this.tone({ t: t + 0.3, freq: 311.13, freq2: 233.08, slide: 0.5, dur: 0.6, type: 'triangle', gain: 0.18 });
    }
  }
};
