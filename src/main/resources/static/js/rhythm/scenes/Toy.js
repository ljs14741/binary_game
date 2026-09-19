/* 그냥 부숴! (장난감 모드) — 판정 없음. 탭할 때마다 부순다. 대상이 끝없이 이어진다 (벽 → 창문 → 판자 → 굴뚝 → 벽 …).
 * 그만두기는 우상단 일시정지 버튼.
 */
import Phaser from 'phaser';
import { AudioEngine as audio, chordFor } from '../core/audio.js';
import { input } from '../core/inputSingleton.js';
import { Bot } from '../engine/Bot.js';
import { Breakable, settleDebris, MAX_DYNAMIC } from '../engine/Breakable.js';
import { CameraFx } from '../engine/CameraFx.js';
import { Feedback } from '../engine/Feedback.js';
import { BRICK_W, BRICK_H, GLASS_W, GLASS_H, CHIM_W, CHIM_H, PLANK_W, PLANK_H } from '../art/textures.js';
import { DPR, logical, hud } from '../art/dpr.js';
import { keyHint } from './keys.js';
import { P, css } from '../art/palette.js';

const KINDS = [
  { id: 'wall',    make: (s, left, F) => new Breakable(s, 'wall', { left, bottom: F, cols: 5, count: 30, pieceW: BRICK_W, pieceH: BRICK_H, keys: ['brick-a', 'brick-b', 'brick-c'], material: 'brick' }) },
  { id: 'window',  make: (s, left, F) => { const b = new Breakable(s, 'window', { left, bottom: F - 120, cols: 4, count: 16, pieceW: GLASS_W, pieceH: GLASS_H, keys: ['glass-a', 'glass-b'], stagger: false, material: 'glass', spread: 1.4 }); const f = s.add.image(left + 2 * GLASS_W, (F - 120) - b.rows * GLASS_H / 2, 'window-frame').setDepth(5); f.setScale((4 * GLASS_W + 24) / f.width, (b.rows * GLASS_H + 24) / f.height); b.deco = f; return b; } },
  { id: 'plank',   make: (s, left, F) => new Breakable(s, 'plank', { left, bottom: F, cols: 1, count: 10, pieceW: PLANK_W, pieceH: PLANK_H, keys: ['plank-a', 'plank-b'], stagger: false, material: 'wood', spread: 1.1 }) },
  { id: 'chimney', make: (s, left, F) => new Breakable(s, 'chimney', { left, bottom: F, cols: 3, count: 27, pieceW: CHIM_W, pieceH: CHIM_H, keys: ['chim-a', 'chim-b', 'chim-c'], material: 'brick', spread: 0.9 }) }
];
const GAP = 520;

export class Toy extends Phaser.Scene {
  constructor() { super('Toy'); }

  create() {
    this.debris = []; this.taps = 0; this.kindIdx = 0; this.nextLeft = 560; this.queue = [];
    this.matter.world.setGravity(0, 1.6);
    // 배경: 예전엔 200000px 짜리 tileSprite 하나였는데 모바일에서 메모리 초과로 페이지가 죽었다.
    // 화면보다 조금 큰 배경만 만들고 update() 에서 카메라를 따라다니게 한다 (무늬는 월드에 고정된 것처럼 흘린다).
    this.floorY = 760; this.worldWidth = 200000;
    this.roomWall = this.add.tileSprite(0, this.floorY / 2 - 300, 2400, this.floorY + 800, 'wallpaper').setDepth(0).setTint(0xc9b6d8).setTileScale(1 / DPR);
    this.roomFloor = this.add.tileSprite(0, this.floorY + 140, 2400, 280, 'floor').setDepth(1).setTileScale(1 / DPR);
    this.roomLine = this.add.rectangle(0, this.floorY, 2400, 6, P.floorLine).setDepth(2);
    this.matter.add.rectangle(100000, this.floorY + 40, 200000, 80, { isStatic: true, friction: 0.8 });
    this.cameras.main.setBounds(-200, -400, 200400, this.floorY + 600);
    this.fx = new Feedback(this);
    this.fx.progressBg.setVisible(false); this.fx.progress.setVisible(false);
    this.camFx = new CameraFx(this);
    this.bot = new Bot(this, 400, this.floorY).setDepth(12);
    for (let i = 0; i < 3; i++) this.spawn();
    this.current = this.queue[0];
    this.cameras.main.setZoom(DPR).centerOn(this.current.left + 60, this.floorY - 300);
    this.cameras.main.preRender();  // worldView 를 즉시 갱신해 첫 프레임부터 배경이 제자리에 오게
    this.syncRoom();
    this.fx.setBanner('마음껏 부숴!', css(P.accent));
    this.time.delayedCall(1500, () => this.fx.setBanner(''));

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
    this.events.once('shutdown', () => {
      input.enabled = false; input.onTap = null; input.onEscape = null;
      this.pauseBtn.style.display = 'none'; this.pauseBtn.textContent = 'II';
      this.pauseBtn.removeEventListener('click', this._onQuit);
      audio.stopLoop();
    });
    audio.unlock().then(() => audio.startLoop(120));
  }

  spawn() {
    const k = KINDS[this.kindIdx++ % KINDS.length];
    const b = k.make(this, this.nextLeft, this.floorY);
    this.nextLeft += b.width + GAP;
    this.queue.push(b);
  }

  onTap() {
    const t = this.current; if (!t) return;
    this.taps++;
    const m = t.markPoint(this.taps);
    const power = 1.2;
    this.bot.swing(power); this.bot.setFace('happy', 0.4);
    t.smash(m.x, m.y, t.material === 'wood' ? 2 : 3, power, 1);
    const chord = chordFor(Math.floor(this.taps / 8), 0);
    audio.hit(audio.now(), { power, material: t.material, perfect: true, pitch: chord.hook[this.taps % 4] });
    this.fx.burst(m.x, m.y, 'perfect');
    this.camFx.impact(this.taps % 4 === 0 ? 'perfect' : 'good');
    this.fx.setCombo(this.taps);
    this.fx.setScore(this.taps);
    if (t.remaining === 0) this.advance();
  }

  advance() {
    const done = this.queue.shift();
    if (done && done.deco) this.tweens.add({ targets: done.deco, alpha: 0, duration: 600 });
    this.spawn();
    this.current = this.queue[0];
    const t = this.current;
    this.tweens.add({ targets: this.bot, x: t.left - 160, duration: 600, ease: 'Sine.inOut' });
    this.camFx.panTo(t.left + 60, this.floorY - 300, 600);
    this.bot.setFace('proud', 0.8);
  }

  trimDebris() { while (this.debris.length > MAX_DYNAMIC) { const b = this.debris.shift(); if (b.body) b.setStatic(true); } }

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
    const t = this.current;
    if (t && t.material !== 'wood') {
      const want = Math.max(t.left - 160, t.frontX() - 160);
      if (Math.abs(want - this.bot.x) > 24 && !this._stepping) {
        this._stepping = true;
        this.tweens.add({ targets: this.bot, x: want, duration: 260, ease: 'Sine.inOut', onComplete: () => { this._stepping = false; } });
      }
    }
  }

  quit() { this.scene.start('WorldMap'); }
}
