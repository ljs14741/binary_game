/* conductor.js — 박자 시계 + 스케줄러
 * 채보(beat 단위) → 오디오 시계 절대시각. setInterval 룩어헤드로 음악/시범(cue)을 미리 예약.
 * 페이즈: pre → intro → (call → response)×N → outro
 * 채보 v2: patterns[i] = { beats:[...], target?, camera? }  (v1 배열 형식도 허용)
 */
export class Conductor {
  constructor(audio, chart) {
    this.audio = audio;
    this.chart = chart;
    this.spb = 60 / chart.bpm;
    this.bpb = chart.beatsPerBar || 4;
    this.lookahead = 0.15;
    this.timerMs = 25;
    this.onCue = null;    // (cue, hitTime)  시범 타격
    this.onBeat = null;   // (beatIndex)
    this.onPhase = null;  // ({name, pattern?, bar?})
    this.running = false;
    this.build();
  }

  build() {
    const ch = this.chart, bpb = this.bpb, intro = ch.introBars;
    this.cues = []; this.notes = []; this.patterns = [];
    ch.patterns.forEach((raw, i) => {
      const pat = Array.isArray(raw) ? { beats: raw } : raw;
      this.patterns.push(pat);
      const callBar = intro + i * 2, respBar = callBar + 1;
      pat.beats.forEach(b => {
        this.cues.push({ beat: callBar * bpb + b, pattern: i, time: 0, fired: false, scheduled: false });
        this.notes.push({ beat: respBar * bpb + b, pattern: i, target: pat.target, time: 0, judged: false, result: null, delta: 0 });
      });
    });
    this.patternBars = ch.patterns.length * 2;
    this.totalBars = intro + this.patternBars + (ch.outroBars || 1);
    this.totalBeats = this.totalBars * bpb;
  }

  start(delay = 0.2) {
    this.startTime = this.audio.now() + delay;
    for (const c of this.cues) c.time = this.beatToTime(c.beat);
    for (const n of this.notes) n.time = this.beatToTime(n.beat);
    this.stepIdx = 0;
    this.lastBeatInt = -999;
    this.lastPhaseKey = '';
    this.running = true;
    this.scheduleAhead();
    this._timer = setInterval(() => this.scheduleAhead(), this.timerMs);
  }

  stop() {
    this.running = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  beatToTime(b) { return this.startTime + b * this.spb; }
  now() { return this.audio.now(); }
  beat() { return (this.now() - this.startTime) / this.spb; }
  finished() { return this.beat() >= this.totalBeats; }

  phaseAtBeat(b) {
    const bpb = this.bpb, intro = this.chart.introBars;
    if (b < 0) return { name: 'pre' };
    const bar = Math.floor(b / bpb);
    if (bar < intro) return { name: 'intro', bar };
    const idx = bar - intro;
    if (idx >= this.patternBars) return { name: 'outro' };
    return { name: idx % 2 === 0 ? 'call' : 'response', pattern: Math.floor(idx / 2) };
  }

  scheduleAhead() {
    if (!this.running) return;
    const until = this.now() + this.lookahead;
    const intro = this.chart.introBars;
    while (this.stepIdx * 0.5 < this.totalBeats) {
      const beat = this.stepIdx * 0.5;
      const t = this.beatToTime(beat);
      if (t > until) break;
      const bar = Math.floor(beat / this.bpb);
      const ph = this.phaseAtBeat(beat);
      this.audio.musicStep(this.stepIdx, t, { bar, countIn: bar === intro - 1, outro: bar >= intro + this.patternBars, phase: ph.name, pattern: ph.pattern, patterns: this.chart.patterns.length });
      this.stepIdx++;
    }
    for (const c of this.cues) {
      if (c.scheduled) continue;
      if (c.time > until) break;
      c.scheduled = true;
      this.audio.cue(c.time);
    }
  }

  // 매 프레임 호출. visualOffset: 시각 신호를 "귀에 들리는 시각"에 맞추기 위한 지연(초)
  update(visualOffset = 0, leadIn = 0.09) {
    const now = this.now() - visualOffset;
    for (const c of this.cues) {
      if (c.fired) continue;
      if (now < c.time - leadIn) break;
      c.fired = true;
      if (this.onCue) this.onCue(c, c.time + visualOffset);
    }
    const b = (now - this.startTime) / this.spb;
    const bi = Math.floor(b);
    if (bi !== this.lastBeatInt) {
      this.lastBeatInt = bi;
      if (this.onBeat) this.onBeat(bi);
    }
    const ph = this.phaseAtBeat(b);
    const key = ph.name + ':' + (ph.pattern != null ? ph.pattern : (ph.bar != null ? ph.bar : ''));
    if (key !== this.lastPhaseKey) {
      this.lastPhaseKey = key;
      if (this.onPhase) this.onPhase(ph);
    }
  }
}
