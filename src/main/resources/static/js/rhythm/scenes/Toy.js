/* 그냥 부숴! (장난감 모드) — 판정 없음. 탭할 때마다 부순다. 대상이 끝없이 이어진다 (벽 → 창문 → 판자 → 굴뚝 → … 5번째마다 왕벽).
 * 연타가 이어지면 콤보 단계(열기)가 올라 BGM 이 빨라지고 배경·소리·파편이 세진다. 손을 떼면 식는다.
 * 위쪽엔 짧은 미션이 하나씩. 그만두면(✕·Esc) 기록 화면(ToyEnd).
 */
import Phaser from 'phaser';
import { T, fmt } from '../meta/i18n.js';
import { AudioEngine as audio, chordFor } from '../core/audio.js';
import { input } from '../core/inputSingleton.js';
import { toyRecord, saveToyRecord } from '../meta/settings.js';
import { Bot } from '../engine/Bot.js';
import { Breakable, settleDebris, MAX_DYNAMIC } from '../engine/Breakable.js';
import { CameraFx } from '../engine/CameraFx.js';
import { Feedback } from '../engine/Feedback.js';
import { BRICK_W, BRICK_H, GLASS_W, GLASS_H, CHIM_W, CHIM_H, PLANK_W, PLANK_H } from '../art/textures.js';
import { DPR, logical, hud } from '../art/dpr.js';
import { keyHint } from './keys.js';
import { FONT, P, css } from '../art/palette.js';

const KINDS = [
  { id: 'wall',    make: (s, left, F) => new Breakable(s, 'wall', { left, bottom: F, cols: 5, count: 30, pieceW: BRICK_W, pieceH: BRICK_H, keys: ['brick-a', 'brick-b', 'brick-c'], material: 'brick' }) },
  { id: 'window',  make: (s, left, F) => { const b = new Breakable(s, 'window', { left, bottom: F - 120, cols: 4, count: 16, pieceW: GLASS_W, pieceH: GLASS_H, keys: ['glass-a', 'glass-b'], stagger: false, material: 'glass', spread: 1.4 }); const f = s.add.image(left + 2 * GLASS_W, (F - 120) - b.rows * GLASS_H / 2, 'window-frame').setDepth(5); f.setScale((4 * GLASS_W + 24) / f.width, (b.rows * GLASS_H + 24) / f.height); b.deco = f; return b; } },
  { id: 'plank',   make: (s, left, F) => new Breakable(s, 'plank', { left, bottom: F, cols: 1, count: 10, pieceW: PLANK_W, pieceH: PLANK_H, keys: ['plank-a', 'plank-b'], stagger: false, material: 'wood', spread: 1.1 }) },
  { id: 'chimney', make: (s, left, F) => new Breakable(s, 'chimney', { left, bottom: F, cols: 3, count: 27, pieceW: CHIM_W, pieceH: CHIM_H, keys: ['chim-a', 'chim-b', 'chim-c'], material: 'brick', spread: 0.9 }) }
];
// 왕벽: 크고 단단함. 부수면 크게 터짐
const BOSS = { id: 'boss', make: (s, left, F) => new Breakable(s, 'boss', { left, bottom: F, cols: 7, count: 84, pieceW: BRICK_W, pieceH: BRICK_H, keys: ['brick-c', 'brick-a', 'brick-b'], material: 'brick', spread: 1.2 }) };
const GAP = 520;
// 콤보 단계: 문턱 콤보, BGM 템포, 배경 색
const LEVELS = [
  { at: 0,   bpm: 120, tint: 0xc9b6d8 },
  { at: 25,  bpm: 132, tint: 0xd9b3c6 },
  { at: 60,  bpm: 146, tint: 0xe8b08e },
  { at: 120, bpm: 160, tint: 0xffc070 }
];
const IDLE = 1.3;   // 이 시간(초) 안 치면 콤보 끊김
// 미션. 끝까지 가면 콤보·개수를 올려 가며 계속
const MISSIONS = [
  { type: 'objects', n: 1 }, { type: 'combo', n: 25 }, { type: 'fast', n: 6 }, { type: 'objects', n: 3 },
  { type: 'combo', n: 60 }, { type: 'boss', n: 1 }, { type: 'fast', n: 4 }, { type: 'combo', n: 120 }
];
function missionAt(i) {
  if (i < MISSIONS.length) return MISSIONS[i];
  const k = i - MISSIONS.length;
  return k % 2 ? { type: 'objects', n: 5 } : { type: 'combo', n: 150 + 50 * (k >> 1) };
}

export class Toy extends Phaser.Scene {
  constructor() { super('Toy'); }

  create() {
    this.debris = []; this.taps = 0; this.kindIdx = 0; this.nextLeft = 560; this.queue = []; this.done = [];
    this.combo = 0; this.maxCombo = 0; this.level = 0; this.score = 0; this.objects = 0; this.lastTap = 0;
    this.missionIdx = 0; this.cleared = 0; this.beatBest = false;
    this.matter.world.setGravity(0, 1.6);
    // 배경: 예전엔 200000px 짜리 tileSprite 하나였는데 모바일에서 메모리 초과로 페이지가 죽었다.
    // 화면보다 조금 큰 배경만 만들고 update() 에서 카메라를 따라다니게 한다 (무늬는 월드에 고정된 것처럼 흘린다).
    this.floorY = 760; this.worldWidth = 200000;
    this.roomWall = this.add.tileSprite(0, this.floorY / 2 - 300, 2400, this.floorY + 800, 'wallpaper').setDepth(0).setTint(LEVELS[0].tint).setTileScale(1 / DPR);
    this.roomFloor = this.add.tileSprite(0, this.floorY + 140, 2400, 280, 'floor').setDepth(1).setTileScale(1 / DPR);
    this.roomLine = this.add.rectangle(0, this.floorY, 2400, 6, P.floorLine).setDepth(2);
    this.matter.add.rectangle(100000, this.floorY + 40, 200000, 80, { isStatic: true, friction: 0.8 });
    this.cameras.main.setBounds(-200, -400, 200400, this.floorY + 600);
    this.fx = new Feedback(this);
    this.camFx = new CameraFx(this);
    this.bot = new Bot(this, 400, this.floorY).setDepth(12);
    for (let i = 0; i < 3; i++) this.spawn();
    this.current = this.queue[0]; this.currentSince = this.time.now / 1000;
    this.cameras.main.setZoom(DPR).centerOn(this.current.left + 60, this.floorY - 300);
    this.cameras.main.preRender();  // worldView 를 즉시 갱신해 첫 프레임부터 배경이 제자리에 오게
    this.syncRoom();
    this.fx.setBanner(T.toyBanner, css(P.accent));
    this.time.delayedCall(1500, () => { if (this.fx.banner.text === T.toyBanner) this.fx.setBanner(''); });

    // 미션 줄은 진행 막대 바로 밑, 배너는 그 아래로 내림
    const { W } = logical(this);
    const m = hud(this, W / 2, 78);
    this.fx.banner.y = hud(this, 0, 160).y;
    this.missionTxt = this.add.text(m.x, m.y, '', { fontFamily: FONT, fontSize: '17px', fontStyle: '800', color: '#fff', stroke: css(P.uiDark), strokeThickness: 5 })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(50);
    this.startMission(0);

    // 조작법 안내. 판정 없는 모드라 처음 잠깐만 띄우고 사라진다 (제목·스테이지와 같은 그림).
    {
      const { W, H } = logical(this);
      const p = hud(this, W / 2, H - 130);
      this.keyHintUi = keyHint(this, p.x, p.y, { scale: 0.9 }).setScrollFactor(0).setDepth(60).setAlpha(0);
      this.tweens.add({ targets: this.keyHintUi, alpha: 1, duration: 300, delay: 300 });
      this.time.delayedCall(4500, () => {
        if (!this.keyHintUi) return;
        const k = this.keyHintUi; this.keyHintUi = null;
        this.tweens.add({ targets: k, alpha: 0, y: k.y + 20, duration: 500, onComplete: () => k.destroy() });
      });
    }

    input.enabled = true;
    input.onTap = () => this.onTap();
    input.onEscape = () => this.quit();
    this.pauseBtn = document.getElementById('btn-pause');
    this._onQuit = () => this.quit();
    this.pauseBtn.style.display = 'block';
    this.pauseBtn.textContent = '✕';
    this.pauseBtn.addEventListener('click', this._onQuit);
    // 탭을 닫아도 기록은 남게
    this._onHide = () => this.saveRun();
    window.addEventListener('pagehide', this._onHide);
    this.events.once('shutdown', () => {
      this.saveRun();
      input.enabled = false; input.onTap = null; input.onEscape = null;
      this.pauseBtn.style.display = 'none'; this.pauseBtn.textContent = 'II';
      this.pauseBtn.removeEventListener('click', this._onQuit);
      window.removeEventListener('pagehide', this._onHide);
      audio.stopLoop();
    });
    this.events.on('resume', () => { input.enabled = true; this.lastTap = 0; audio.startLoop(LEVELS[this.level].bpm); });
    audio.unlock().then(() => audio.startLoop(LEVELS[0].bpm));
  }

  spawn() {
    const n = this.kindIdx++;
    const k = n % 5 === 4 ? BOSS : KINDS[(n - Math.floor(n / 5)) % KINDS.length];
    const b = k.make(this, this.nextLeft, this.floorY);
    this.nextLeft += b.width + GAP;
    this.queue.push(b);
  }

  onTap() {
    const t = this.current; if (!t) return;
    const now = this.time.now / 1000;
    if (this.combo && now - this.lastTap > IDLE) this.breakCombo();
    this.lastTap = now;
    this.taps++; this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    if (!this.beatBest && toyRecord.combo >= 20 && this.combo === toyRecord.combo + 1) { this.beatBest = true; this.fx.popup(T.newRecord, 'perfect'); }
    let lv = this.level;
    while (lv + 1 < LEVELS.length && this.combo >= LEVELS[lv + 1].at) lv++;
    if (lv !== this.level) this.setLevel(lv);

    const m = t.markPoint(this.taps);
    const power = 1.2 + this.level * 0.1;
    this.bot.swing(power); this.bot.setFace(this.level >= 3 ? 'proud' : 'happy', 0.4);
    t.smash(m.x, m.y, (t.material === 'wood' ? 2 : 3) + (this.level >= 2 ? 1 : 0), power, 1);
    // 콤보 단계마다 음이 한 옥타브씩 밝아짐 (마지막 단계는 두 배)
    const chord = chordFor(Math.floor(this.taps / 8), 0);
    const pitch = chord.hook[this.taps % 4] * (this.level >= 3 ? 2 : this.level >= 1 ? 1.5 : 1);
    audio.hit(audio.now(), { power: Math.min(power, 1.4), material: t.material, perfect: true, pitch });
    this.fx.burst(m.x, m.y, 'perfect');
    if (this.level >= 2) this.fx.chips.explode(4 * this.level, m.x, m.y);
    this.camFx.impact(this.taps % 4 === 0 ? 'perfect' : 'good');
    this.fx.setCombo(this.combo);
    this.score += 1 + this.level;
    this.fx.setScore(this.score);
    if (t.remaining === 0) this.advance();
    this.checkMission();
  }

  setLevel(lv) {
    const up = lv > this.level;
    this.level = lv;
    const L = LEVELS[lv];
    this.roomWall.setTint(L.tint);
    audio.stopLoop(); audio.startLoop(L.bpm);
    this.fx.combo.setColor(lv >= 3 ? '#ff5c7a' : css(P.accent));
    if (up) {
      this.fx.setBanner(T['toyLv' + lv], lv >= 3 ? '#ff5c7a' : css(P.accent));
      this.camFx.flash(120);
      this.time.delayedCall(1100, () => { if (this.fx.banner.text === T['toyLv' + lv]) this.fx.setBanner(''); });
    }
  }

  breakCombo() {
    if (this.combo >= 10) this.fx.popup(fmt(T.toyComboEnd, this.combo), 'whiff');
    this.combo = 0;
    this.fx.setCombo(0);
    if (this.level) this.setLevel(0);
  }

  advance() {
    const done = this.queue.shift();
    this.objects++;
    if (done.id === 'boss') {
      this.fx.setBanner(T.toyBossDown, css(P.accent));
      this.time.delayedCall(1200, () => { if (this.fx.banner.text === T.toyBossDown) this.fx.setBanner(''); });
      this.camFx.hitStop(90); this.camFx.shake(0.014, 350); this.camFx.flash(160);
      this.score += 100; this.fx.setScore(this.score);
      this.bossDown = true;
    }
    this.fastDone = this.time.now / 1000 - this.currentSince;
    if (done.deco) this.tweens.add({ targets: done.deco, alpha: 0, duration: 600 });
    // 멀리 지나간 대상은 치워서 오래 놀아도 가볍게
    this.done.push(done);
    if (this.done.length > 2) this.done.shift().destroy();
    this.spawn();
    this.current = this.queue[0];
    this.currentSince = this.time.now / 1000;
    const t = this.current;
    this.tweens.add({ targets: this.bot, x: t.left - 160, duration: 600, ease: 'Sine.inOut' });
    this.camFx.panTo(t.left + 60, this.floorY - 300, 600);
    this.bot.setFace('proud', 0.8);
    if (t.id === 'boss') {
      this.time.delayedCall(450, () => { this.fx.setBanner(T.toyBoss, '#ff5c7a'); this.camFx.shake(0.008, 300); });
      this.time.delayedCall(1800, () => { if (this.fx.banner.text === T.toyBoss) this.fx.setBanner(''); });
    }
  }

  /* ---------- 미션 ---------- */
  startMission(i) {
    this.missionIdx = i;
    this.mission = missionAt(i);
    this.missionBase = this.objects;
    this.bossDown = false; this.fastDone = null;
    this.updateMissionText();
  }

  missionProgress() {
    const m = this.mission;
    if (m.type === 'combo') return Math.min(1, this.combo / m.n);
    if (m.type === 'objects') return Math.min(1, (this.objects - this.missionBase) / m.n);
    if (m.type === 'boss') return this.bossDown ? 1 : 0;
    return this.fastDone != null && this.fastDone <= m.n ? 1 : 0;
  }

  updateMissionText() {
    const m = this.mission;
    const what = m.type === 'combo' ? fmt(T.toyMisCombo, m.n)
      : m.type === 'objects' ? fmt(T.toyMisObjects, m.n) + `  ${this.objects - this.missionBase}/${m.n}`
      : m.type === 'boss' ? T.toyMisBoss : fmt(T.toyMisFast, m.n);
    const s = fmt(T.toyMission, this.missionIdx + 1, what);
    if (this.missionTxt.text !== s) this.missionTxt.setText(s);
    this.fx.setProgress(this.missionProgress());
  }

  checkMission() {
    if (this.missionProgress() >= 1) {
      this.cleared++;
      this.score += 50 * (this.missionIdx + 1);
      this.fx.setScore(this.score);
      this.fx.popup(T.toyClear, 'good');
      audio.fanfare(audio.now() + 0.05, true);
      this.tweens.add({ targets: this.missionTxt, scale: 1.25, duration: 120, yoyo: true });
      this.startMission(this.missionIdx + 1);
    } else {
      if (this.mission.type === 'fast') this.fastDone = null;
      this.updateMissionText();
    }
  }

  trimDebris() { while (this.debris.length > MAX_DYNAMIC) { const b = this.debris.shift(); if (b.body && b.scene) b.setStatic(true); } }

  syncRoom() {
    const wv = this.cameras.main.worldView;
    const cx = wv.centerX;
    for (const bg of [this.roomWall, this.roomFloor]) {
      bg.x = cx;
      // 무늬가 스프라이트를 따라오지 않고 월드에 박혀 있게: 왼쪽 끝 월드좌표만큼 텍셀을 앞당긴다 (tileScale = 1/DPR).
      bg.tilePositionX = (cx - bg.width / 2) * DPR;
    }
    this.roomLine.x = cx;
  }

  update(time, delta) {
    settleDebris(this, Math.min(delta / 1000, 0.05));
    this.trimDebris();
    this.syncRoom();
    this.bot.update();
    if (this.combo && time / 1000 - this.lastTap > IDLE) this.breakCombo();
    // 콤보 미션은 끊기면 진행 막대도 같이 내려감
    if (this.mission && this.mission.type === 'combo') this.fx.setProgress(this.missionProgress());
    const t = this.current;
    if (t && t.material !== 'wood') {
      const want = Math.max(t.left - 160, t.frontX() - 160);
      if (Math.abs(want - this.bot.x) > 24 && !this._stepping) {
        this._stepping = true;
        this.tweens.add({ targets: this.bot, x: want, duration: 260, ease: 'Sine.inOut', onComplete: () => { this._stepping = false; } });
      }
    }
  }

  // 여러 번 불려도 부순 개수는 새로 늘어난 만큼만 더함
  saveRun() {
    if (!this.taps) return;
    saveToyRecord({ combo: this.maxCombo, missions: this.cleared, objects: this.objects - (this.savedObjects || 0) });
    this.savedObjects = this.objects;
  }

  // 그만두기: 기록 화면을 띄우고 멈춤. 거기서 계속하면 이어서
  quit() {
    // 기록 화면에서 ✕ 한 번 더 = 나가기
    if (this.scene.isPaused()) { this.scene.stop('ToyEnd'); this.scene.start('WorldMap'); return; }
    if (!this.taps) { this.scene.start('WorldMap'); return; }
    const prevBest = toyRecord.combo;
    input.enabled = false;
    audio.stopLoop();
    this.breakCombo();
    this.scene.pause();
    this.scene.launch('ToyEnd', { combo: this.maxCombo, objects: this.objects, cleared: this.cleared, score: this.score, isNew: this.maxCombo > prevBest, best: Math.max(prevBest, this.maxCombo) });
  }
}
