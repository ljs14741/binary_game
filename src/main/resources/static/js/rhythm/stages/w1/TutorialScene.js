/* 연습 — 첫 곡 전에 한 번. 호루라기 듣기 → 따라 치기를 3단계로 짧게.
 * 틀리면 같은 단계를 다시 (최대 TRIES 번, 그 뒤엔 그냥 넘어감). 목숨·점수·기록 없음.
 * 화면 아래 큰 키캡이 신호·칠 자리에 맞춰 눌려서 "언제, 무슨 키"를 보여 줌. 점은 칠 횟수.
 */
import { StageScene } from '../../engine/StageScene.js';
import { Wall } from '../../engine/Breakable.js';
import { Bot } from '../../engine/Bot.js';
import { buildRoom } from '../common.js';
import { T } from '../../meta/i18n.js';
import { AudioEngine as audio } from '../../core/audio.js';
import { input } from '../../core/inputSingleton.js';
import { settings, saveTutorialDone } from '../../meta/settings.js';
import { logical, hud } from '../../art/dpr.js';
import { FONT, P, css } from '../../art/palette.js';

const LESSONS = [
  { beats: [0, 2], tip: 'tut1' },
  { beats: [0, 1, 2, 3], tip: 'tut2' },
  { beats: [0, 1, 2, 2.5], tip: 'tut3' }
];
const BPM = 96, TRIES = 3;
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

function lessonChart(i, first) {
  return {
    id: 'tutorial', title: 'tutorial', bpm: BPM, beatsPerBar: 4, introBars: first ? 2 : 1, outroBars: 0.5,
    material: 'brick', lives: 0, windows: { perfect: 0.07, good: 0.14, miss: 0.2 },
    patterns: [{ beats: LESSONS[i].beats, target: 'wall' }]
  };
}

export class TutorialScene extends StageScene {
  constructor() { super('Tutorial'); }
  init(data) {
    this.then = (data && data.then) || 'WorldMap';
    this.lesson = 0; this.tries = 0; this.practice = true;
    super.init({ chart: lessonChart(0, true) });
  }

  buildWorld() {
    buildRoom(this, 1800, 760);
    this.targets = { wall: new Wall(this, 'wall', 560, this.floorY, 6, 60) };
    this.bot = new Bot(this, 400, this.floorY).setDepth(12);
  }

  create() {
    super.create();
    for (const o of [this.fx.score, this.fx.progress, this.fx.progressBg]) o.setVisible(false);
    const { W, H } = logical(this);
    const c = hud(this, W / 2, 200);
    this.caption = this.add.text(c.x, c.y, T[LESSONS[0].tip], { fontFamily: FONT, fontSize: '22px', fontStyle: '800', color: '#fff', stroke: css(P.uiDark), strokeThickness: 6, align: 'center', wordWrap: { width: W - 60 }, lineSpacing: 4 })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(55);
    // 큰 키캡: 신호(하늘색)·칠 자리(노랑)에 맞춰 눌림
    const g = hud(this, W / 2, H - 150);
    this.guide = this.add.container(g.x, g.y).setScrollFactor(0).setDepth(60);
    const w = TOUCH ? 200 : 240;
    this.guideShadow = this.add.rectangle(0, 6, w, 70, 0xbbbbbb).setStrokeStyle(4, P.uiDark);
    this.guideCap = this.add.rectangle(0, 0, w, 70, 0xffffff).setStrokeStyle(4, P.uiDark);
    this.guideTxt = this.add.text(0, 0, TOUCH ? T.tutTouchKey : 'SPACE', { fontFamily: FONT, fontSize: '26px', fontStyle: '900', color: css(P.uiDark) }).setOrigin(0.5);
    this.guide.add([this.guideShadow, this.guideCap, this.guideTxt]);
    this.dots = [];
    this.pressedUntil = 0;
    this.buildDots();
    this.wireSkip();
  }

  buildDots() {
    for (const d of this.dots) d.destroy();
    const { W, H } = logical(this);
    const n = this.conductor.notes.length;
    this.dots = this.conductor.notes.map((_, i) => {
      const p = hud(this, W / 2 + (i - (n - 1) / 2) * 34, H - 88);
      return this.add.circle(p.x, p.y, 11, 0x000000, 0.35).setStrokeStyle(3, 0xffffff, 0.8).setScrollFactor(0).setDepth(60);
    });
  }

  wireSkip() {
    this.skipBtn = document.getElementById('btn-skip');
    if (!this.skipBtn) return;
    this._onSkip = () => this.done();
    this.skipBtn.style.display = 'block';
    this.skipBtn.addEventListener('click', this._onSkip);
    this.events.once('shutdown', () => { this.skipBtn.style.display = 'none'; this.skipBtn.removeEventListener('click', this._onSkip); });
  }

  onCue(cue, hitTime) {
    super.onCue(cue, hitTime);
    const i = this.conductor.cues.indexOf(cue);
    const delayMs = Math.max(0, (hitTime - audio.now()) * 1000);
    this.time.delayedCall(delayMs, () => { if (this.dots[i]) this.dots[i].setFillStyle(0x8fd3ff, 1); });
  }

  onPhase(ph) {
    if (ph.name === 'outro') { this.judgeLesson(); return; }
    super.onPhase(ph);
    if (ph.name === 'call') this.setCaption(T.tutListen);
    else if (ph.name === 'response') {
      this.setCaption(TOUCH ? T.tutGoTouch : T.tutGoKey);
      for (const d of this.dots) d.setFillStyle(0x000000, 0.35);
    }
  }

  onTap(rawT) {
    if (this.finished || this.paused) return;
    super.onTap(rawT);
    this.pressedUntil = this.time.now + 90;
    this.paintDots();
  }
  onAutoMiss(n) { super.onAutoMiss(n); this.paintDots(); }

  paintDots() {
    this.conductor.notes.forEach((n, i) => {
      if (!n.judged || !this.dots[i]) return;
      this.dots[i].setFillStyle(n.result === 'miss' ? P.miss : P.good, 1);
    });
  }

  setCaption(s) {
    if (this.caption.text === s) return;
    this.caption.setText(s).setAlpha(0);
    this.tweens.add({ targets: this.caption, alpha: 1, duration: 200 });
  }

  // 레슨 끝: 다 맞히면 다음, 아니면 이유를 알려 주고 한 번 더
  judgeLesson() {
    this.judge.flush(); this.paintDots();
    const notes = this.conductor.notes;
    const hit = notes.filter(n => n.result !== 'miss').length;
    this.tries++;
    const pass = hit === notes.length;
    if (pass || this.tries >= TRIES) {
      this.fx.setBanner(pass ? T.tutGood : T.tutOk, css(P.good));
      this.bot.setFace('happy', 1.2);
      this.lesson++; this.tries = 0;
      this.setCaption('');
      if (this.lesson >= LESSONS.length) { this.setCaption(T.tutDone); this.time.delayedCall(1400, () => this.done()); return; }
    } else {
      const misses = notes.filter(n => n.result === 'miss');
      const early = misses.filter(n => n.delta != null && n.delta < 0).length;
      const late = misses.filter(n => n.delta != null && n.delta > 0).length;
      const tip = early > late ? T.tutEarly : late > early ? T.tutLate : T.tutNoTap;
      this.fx.setBanner(T.tutAgain, css(P.accent));
      this.setCaption(tip);
      this.bot.setFace('ouch', 1);
    }
    this.conductor.stop();
    this.time.delayedCall(1300, () => this.nextRun());
  }

  nextRun() {
    if (this.finished) return;
    for (const m of this.marks.values()) m.destroy();
    this.marks.clear();
    this.chart = lessonChart(this.lesson, false);
    this.setupRun();
    this.buildDots();
    if (this.tries === 0) this.setCaption(T[LESSONS[this.lesson].tip]);
    this.fx.setBanner(T.ready);
    this.conductor.start(0.3);
  }

  update(time, delta) {
    super.update(time, delta);
    if (!this.guide || this.paused) return;
    const now = audio.now() - this.visualOffset;
    let near = Infinity, cue = false;
    for (const c of this.conductor.cues) { const d = Math.abs(now - c.time); if (d < near) { near = d; cue = true; } }
    for (const n of this.conductor.notes) { const d = Math.abs(now - n.time); if (d < near) { near = d; cue = false; } }
    const on = near < 0.08 || this.time.now < this.pressedUntil;
    this.guideCap.setFillStyle(on ? (cue && near < 0.08 ? 0x8fd3ff : P.accent) : 0xffffff);
    this.guideCap.y = this.guideTxt.y = on ? 5 : 0;
  }

  // 연습 모드는 끝나도 결과 화면 없이 다음으로
  finish() {}

  done() {
    if (this.finished) return;
    this.finished = true;
    this.conductor.stop();
    input.enabled = false;
    saveTutorialDone();
    settings.inputOffset = settings.calibOffset != null ? settings.calibOffset : audio.latency();
    this.scene.start(this.then);
  }
}
