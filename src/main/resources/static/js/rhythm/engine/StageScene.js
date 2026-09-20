/* StageScene.js — 스테이지 공통 베이스. 채보 → Conductor → 입력 → Judge → (봇/벽/카메라/피드백).
 * 서브클래스는 buildWorld() 에서 배경·벽·봇 위치를 만들고, targetFor(id) 로 벽을 돌려준다.
 */
import Phaser from 'phaser';
import { T } from '../meta/i18n.js';
import { Conductor } from '../core/conductor.js';
import { Judge, labelFor } from '../core/judge.js';
import { AudioEngine as audio, chordFor } from '../core/audio.js';
import { settings, saveRecord, countPlay } from '../meta/settings.js';
import { input } from '../core/inputSingleton.js';
import { Bot } from './Bot.js';
import { CameraFx } from './CameraFx.js';
import { Feedback } from './Feedback.js';
import { settleDebris, MAX_DYNAMIC } from './Breakable.js';
import { P, css } from '../art/palette.js';
import { DPR, logical, hud } from '../art/dpr.js';
import { keyHint } from '../scenes/keys.js';

const SMASH = { perfect: 3, good: 2, miss: 1, whiff: 0, free: 0 };
const SMASH_BIG = { perfect: 2, good: 1, miss: 0, whiff: 0, free: 0 };   // 판자처럼 큰 조각 (조각 수 = 노트×2)

export class StageScene extends Phaser.Scene {
  init(data) { this.chart = data.chart; this.debris = []; }

  create() {
    const { W } = logical(this);
    this.matter.world.setGravity(0, 1.6);
    this.buildWorld();                        // 서브클래스: this.bot, this.floorY, this.targets 세팅
    this.matter.add.rectangle(this.worldWidth / 2, this.floorY + 40, this.worldWidth + 2000, 80, { isStatic: true, friction: 0.8 });
    this.cameras.main.setBounds(-200, -400, this.worldWidth + 400, this.floorY + 600);
    this.fx = new Feedback(this);
    this.camFx = new CameraFx(this);
    this.marks = new Map();
    this.ringG = this.add.graphics().setDepth(20);
    const mp = hud(this, W - 76, 110);
    this.megaphone = this.add.image(mp.x, mp.y, 'megaphone').setScrollFactor(0).setDepth(50).setAlpha(0.35);

    this.conductor = new Conductor(audio, this.chart);
    this.judge = new Judge(this.conductor.notes, undefined, this.chart.lives || 0);
    this.megaphoneOffset = 0;
    this.cueK = this.conductor.cues.map((c, i) => this.conductor.cues.slice(0, i).filter(q => q.pattern === c.pattern).length);
    this.conductor.onCue = (c, hitTime) => this.onCue(c, hitTime);
    this.conductor.onBeat = b => this.onBeat(b);
    this.conductor.onPhase = ph => this.onPhase(ph);
    this.judge.onMiss = n => this.onAutoMiss(n);

    this.inputOffset = settings.inputOffset;
    this.visualOffset = settings.inputOffset;
    this.finished = false; this.paused = false; this.currentTarget = null;
    this.focusTarget(this.chart.patterns[0].target, true);

    input.enabled = true;
    input.onTap = t => this.onTap(t);
    input.onEscape = () => this.togglePause();
    this.wirePauseUi();
    this.events.once('shutdown', () => this.teardown());

    this.fx.setBanner(T.ready);
    this.fx.setLives(this.judge.lives, this.judge.maxLives);
    // 처음 3판: 시범 듣는 동안 화면 아래에 조작법. 내 차례("부숴!")가 오면 걷는다.
    // 3판이면 충분히 손에 익고, 그 뒤로는 화면을 비워 둔다. 제목 화면엔 늘 있다.
    if (countPlay() <= 3) {
      const { W, H } = logical(this);
      const p = hud(this, W / 2, H - 150);
      this.keyHintUi = keyHint(this, p.x, p.y, { scale: 0.9 }).setScrollFactor(0).setDepth(60).setAlpha(0);
      this.tweens.add({ targets: this.keyHintUi, alpha: 1, duration: 300, delay: 400 });
    }
    audio.stopLoop();
    this.conductor.start(0.6);
  }

  /* ---------- 서브클래스가 채우는 것 ---------- */
  buildWorld() { throw new Error('buildWorld() 구현 필요'); }
  targetFor(id) { return this.targets[id]; }
  // 대상을 바라볼 때 봇·카메라 배치. 기본: 봇은 대상 왼쪽 바닥, 카메라는 대상 앞
  layoutFor(target) {
    return { botX: target.left - 160, botY: this.floorY, camX: target.left + 60, camY: this.floorY - 300, zoom: 1 };
  }
  // 부수는 동안 봇이 따라갈 위치 (기본: 남은 앞면으로 전진)
  followFor(target) {
    return { x: Math.max(target.left - 160, target.frontX() - 160), y: this.floorY };
  }
  // 판정당 날리는 조각 수 (재질별)
  smashFor(kind, target) { return (target.material === 'wood' ? SMASH_BIG : SMASH)[kind] || 0; }
  // 타격 재질 (리믹스는 패턴마다 다름)
  materialFor(note) {
    const pat = note ? this.conductor.patterns[note.pattern] : null;
    return (pat && pat.material) || this.chart.material;
  }

  /* ---------- 카메라/이동 ---------- */
  focusTarget(id, instant = false) {
    if (id === this.currentTarget) return;
    this.currentTarget = id;
    const L = this.layoutFor(this.targetFor(id));
    const cam = this.cameras.main;
    const z = (L.zoom || 1) * DPR;
    this.camFx.baseZoom = z;
    if (instant) { this.bot.setPosition(L.botX, L.botY); cam.setZoom(z); cam.centerOn(L.camX, L.camY); return; }
    this.tweens.add({ targets: this.bot, x: L.botX, y: L.botY, duration: 650, ease: 'Sine.inOut' });
    this.camFx.panTo(L.camX, L.camY, 650);
    if (Math.abs(cam.zoom - z) > 0.01) cam.zoomTo(z, 650, 'Sine.easeInOut');
  }

  /* ---------- Conductor 이벤트 ---------- */
  onCue(cue, hitTime) {
    const wall = this.targetFor(this.conductor.patterns[cue.pattern].target);
    const i = this.conductor.cues.indexOf(cue);
    const p = wall.markPoint(this.cueK[i]);
    const delayMs = Math.max(0, (hitTime - audio.now()) * 1000);
    this.time.delayedCall(delayMs, () => {
      if (this.finished) return;
      const m = this.add.image(p.x, p.y, 'chalk').setDepth(15).setScale(0.3).setAlpha(0);
      this.tweens.add({ targets: m, scale: 1, alpha: 1, duration: 120, ease: 'Back.out' });
      this.marks.set(i, m);
      this.megaphone.setAlpha(1).setScale(1.25);
      this.tweens.add({ targets: this.megaphone, scale: 1, alpha: 0.35, duration: 200 });
      this.fx.dust.explode(3, p.x, p.y);
    });
  }

  onBeat(b) {
    if (b < 0) return;
    this.bot.beat();
    const ph = this.conductor.phaseAtBeat(b);
    if (ph.name === 'intro' && ph.bar === this.chart.introBars - 1) this.fx.setBanner(String((b % this.conductor.bpb) + 1), css(P.accent));
  }

  onPhase(ph) {
    if (ph.name === 'call') {
      this.fx.setBanner(T.listen, '#8fd3ff');
      this.focusTarget(this.conductor.patterns[ph.pattern].target);
      this.bot.listen(); this.bot.setFace('focus', 2);
    } else if (ph.name === 'response') {
      this.fx.setBanner(T.smash, css(P.accent));
      if (this.keyHintUi) { const k = this.keyHintUi; this.keyHintUi = null; this.tweens.add({ targets: k, alpha: 0, y: k.y + 20, duration: 400, onComplete: () => k.destroy() }); }
    } else if (ph.name === 'outro') {
      this.fx.setBanner(T.allSmashed);
      this.bot.setFace(this.judge.accuracy() >= 0.7 ? 'proud' : 'ouch', 3);
    }
  }

  /* ---------- 입력/판정 ---------- */
  onTap(rawT) {
    if (this.finished || this.paused) return;
    const t = rawT - this.inputOffset;
    const now = audio.now();
    const ph = this.conductor.phaseAtBeat((t - this.conductor.startTime) / this.conductor.spb);
    const note = this.judge.hit(t);
    let kind = 'free';
    if (note) kind = note.result;
    else if (ph.name === 'response') { kind = 'whiff'; this.judge.whiff(); }

    const wall = this.targetFor(note && note.target ? note.target : this.currentTarget);
    const idx = note ? this.conductor.notes.indexOf(note) : -1;
    const mark = idx >= 0 ? this.marks.get(idx) : null;
    const p = mark ? { x: mark.x, y: mark.y } : this.bot.contactPoint();
    if (mark) { this.marks.delete(idx); mark.destroy(); }

    const power = kind === 'perfect' ? 1.3 : kind === 'good' ? 1 : 0.7;
    if (kind === 'whiff') { this.bot.stumble(); this.bot.setFace('dizzy', 0.6); audio.whiff(now); this.fx.popup(T.whiff, 'whiff'); }
    else {
      this.bot.swing(power);
      wall.smash(p.x, p.y, this.smashFor(kind, wall), power, 1);
      const pitch = note && kind !== 'miss' ? chordFor(note.pattern, 0).hook[this.cueK[idx] % 4] : null;
      audio.hit(now, { power, material: this.materialFor(note), perfect: kind === 'perfect', pitch });
      this.fx.burst(p.x, p.y, kind);
      this.camFx.impact(kind);
      if (kind === 'perfect') this.bot.setFace('happy', 0.5);
      else if (kind === 'good') this.bot.setFace('focus', 0.4);
      else if (kind === 'miss') { this.bot.setFace('ouch', 0.6); audio.miss(now); }
      const label = labelFor(note);
      if (label) this.fx.popup(label, kind);
    }
    this.fx.setCombo(this.judge.combo);
    this.fx.setScore(this.judge.score);
    this.afterMiss(kind === 'miss');
  }

  // MISS 뒤 공통: 목숨 HUD 갱신, 0이면 실패
  afterMiss(wasMiss) {
    if (!wasMiss || !this.judge.maxLives) return;
    this.fx.setLives(this.judge.lives, this.judge.maxLives);
    this.camFx.shake(0.006, 160);
    if (this.judge.failed) this.fail();
  }

  fail() {
    if (this.finished) return;
    this.finished = true;
    this.conductor.stop();
    input.enabled = false;
    for (const m of this.marks.values()) m.destroy();
    this.marks.clear();
    this.fx.setBanner(T.failed, css(P.miss));
    this.bot.setFace('dizzy', 5); this.bot.stumble();
    this.camFx.hitStop(120); this.camFx.shake(0.012, 400);
    audio.fanfare(audio.now() + 0.4, false);
    const sum = this.judge.summary();
    sum.demolished = this.demolishedRatio();
    sum.isNew = false;
    this.time.delayedCall(1100, () => this.scene.launch('Result', { summary: sum, chart: this.chart, stageKey: this.scene.key, stageId: this.chart.baseId || this.chart.id }));
  }

  demolishedRatio() {
    const walls = Object.values(this.targets);
    const remaining = walls.reduce((a, w) => a + w.remaining, 0), total = walls.reduce((a, w) => a + w.total, 0);
    return 1 - remaining / total;
  }

  onAutoMiss(n) {
    const idx = this.conductor.notes.indexOf(n);
    const mark = this.marks.get(idx);
    if (mark) {
      this.marks.delete(idx);
      mark.setTint(P.chalkBad);
      this.tweens.add({ targets: mark, alpha: 0, scale: 1.4, duration: 350, onComplete: () => mark.destroy() });
    }
    audio.miss(audio.now());
    this.fx.popup('MISS', 'miss');
    this.bot.setFace('ouch', 0.6);
    this.fx.setCombo(0);
    this.afterMiss(true);
  }

  /* ---------- 프레임 ---------- */
  update(time, delta) {
    if (this.paused || !this.conductor) return;
    const dt = Math.min(delta / 1000, 0.05);
    const now = audio.now();
    if (!this.finished) {
      this.conductor.update(this.visualOffset);
      this.judge.update(now - this.inputOffset);
    }
    settleDebris(this, dt);
    this.bot.update();
    this.followFront();
    this.drawRings(now);
    const c = this.conductor;
    this.fx.setProgress((c.beat() - this.chart.introBars * c.bpb) / (c.patternBars * c.bpb));
    if (!this.finished && c.finished()) this.finish();
  }

  followFront() {
    if (this.finished || !this.currentTarget || this._stepping) return;
    const target = this.targetFor(this.currentTarget);
    const want = this.followFor(target);
    if (Math.abs(want.x - this.bot.x) > 24 || Math.abs(want.y - this.bot.y) > 24) {
      this._stepping = true;
      this.tweens.add({ targets: this.bot, x: want.x, y: want.y, duration: 280, ease: 'Sine.inOut', onComplete: () => { this._stepping = false; } });
      this.bot.beat();
      if (want.camY != null) this.camFx.panTo(want.camX != null ? want.camX : this.cameras.main.midPoint.x, want.camY, 320);
    }
  }

  drawRings(now) {
    const g = this.ringG; g.clear();
    if (this.chart.hardMode) return;
    const appr = this.conductor.spb;
    for (const [i, m] of this.marks) {
      const n = this.conductor.notes[i];
      if (n.judged) continue;
      const d = n.time + this.visualOffset - now;
      if (d > appr || d < -0.05) continue;
      const k = Math.max(0, d / appr);
      g.lineStyle(3 + 4 * (1 - k), 0xffffff, 0.35 + 0.65 * (1 - k));
      g.strokeCircle(m.x, m.y, 26 + 70 * k);
    }
  }

  trimDebris() {
    while (this.debris.length > MAX_DYNAMIC) { const b = this.debris.shift(); if (b.body) b.setStatic(true); }
  }

  /* ---------- 종료/일시정지 ---------- */
  finish() {
    this.finished = true;
    this.conductor.stop();
    this.judge.flush();
    input.enabled = false;
    for (const m of this.marks.values()) m.destroy();
    this.marks.clear();
    const sum = this.judge.summary();
    sum.demolished = this.demolishedRatio();
    sum.isNew = saveRecord(this.chart.id, sum);
    audio.fanfare(audio.now() + 0.3, sum.accuracy >= 0.7);
    const cam = this.cameras.main;
    cam.zoomTo(0.8 * DPR, 700, 'Sine.easeInOut');
    cam.pan(cam.midPoint.x + 120, this.floorY + 190, 700, 'Sine.easeInOut');
    this.time.delayedCall(700, () => this.scene.launch('Result', { summary: sum, chart: this.chart, stageKey: this.scene.key, stageId: this.chart.baseId || this.chart.id }));
  }

  wirePauseUi() {
    this.pauseBtn = document.getElementById('btn-pause');
    this.pauseOverlay = document.getElementById('pause-overlay');
    this._onPause = () => this.togglePause();
    this._onResume = () => this.resumeGame();
    this._onQuit = () => this.quit();
    this._onVis = () => { if (document.hidden) this.pauseGame(); };
    this.pauseBtn.style.display = 'block';
    this.pauseBtn.addEventListener('click', this._onPause);
    document.getElementById('btn-resume').addEventListener('click', this._onResume);
    document.getElementById('btn-quit').addEventListener('click', this._onQuit);
    document.addEventListener('visibilitychange', this._onVis);
  }
  togglePause() { if (this.paused) this.resumeGame(); else this.pauseGame(); }
  pauseGame() {
    if (this.paused || this.finished) return;
    this.paused = true; audio.suspend();
    this.matter.world.pause(); this.tweens.pauseAll();
    this.pauseOverlay.style.display = 'flex';
  }
  resumeGame() {
    if (!this.paused) return;
    audio.resume().then(() => {
      this.paused = false; this.matter.world.resume(); this.tweens.resumeAll();
      this.pauseOverlay.style.display = 'none';
    });
  }
  quit() {
    this.conductor.stop(); audio.resume();
    this.scene.stop('Result');
    this.scene.start('WorldMap');
  }
  teardown() {
    if (this.conductor) this.conductor.stop();
    input.onTap = null; input.onEscape = null;
    this.pauseBtn.style.display = 'none'; this.pauseOverlay.style.display = 'none';
    this.pauseBtn.removeEventListener('click', this._onPause);
    document.getElementById('btn-resume').removeEventListener('click', this._onResume);
    document.getElementById('btn-quit').removeEventListener('click', this._onQuit);
    document.removeEventListener('visibilitychange', this._onVis);
  }
}
