/* Feedback.js — 판정 팝업(풀), 콤보, 배너, 점수, 진행바, 파티클. 전부 화면 고정(scrollFactor 0)이거나 이미터.
 * DOM 사용 금지, 이모지 금지.
 */
import Phaser from 'phaser';
import { FONT, P, css } from '../art/palette.js';
import { DPR, logical, hud } from '../art/dpr.js';

const COLORS = { perfect: css(P.perfect), good: css(P.good), miss: css(P.miss), whiff: css(P.whiff), free: '#ffffff' };

export class Feedback {
  constructor(scene) {
    this.scene = scene;
    const { W } = logical(scene);
    this.W = W;
    const H = (lx, ly) => hud(scene, lx, ly);
    this.pool = [];
    for (let i = 0; i < 4; i++) {
      const t = scene.add.text(H(W / 2, 300).x, H(0, 300).y, '', { fontFamily: FONT, fontSize: '44px', fontStyle: '900', color: '#fff', stroke: css(P.uiDark), strokeThickness: 8 })
        .setOrigin(0.5).setScrollFactor(0).setDepth(50).setVisible(false);
      this.pool.push(t);
    }
    this.poolIdx = 0;
    this.combo = scene.add.text(H(W / 2, 640).x, H(0, 640).y, '', { fontFamily: FONT, fontSize: '40px', fontStyle: '900', color: css(P.accent), stroke: css(P.uiDark), strokeThickness: 6, align: 'center' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(50).setAlpha(0);
    this.banner = scene.add.text(H(W / 2, 130).x, H(0, 130).y, '', { fontFamily: FONT, fontSize: '40px', fontStyle: '900', color: '#fff', stroke: css(P.uiDark), strokeThickness: 8 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(50);
    this.score = scene.add.text(H(16, 18).x, H(16, 18).y, '0', { fontFamily: FONT, fontSize: '28px', fontStyle: '900', color: '#fff', stroke: css(P.uiDark), strokeThickness: 6 })
      .setScrollFactor(0).setDepth(50);
    this.lifeIcons = [];
    this.progressBg = scene.add.rectangle(H(W / 2, 64).x, H(0, 64).y, W - 32, 8, 0x000000, 0.35).setScrollFactor(0).setDepth(50);
    this.progress = scene.add.rectangle(H(16, 64).x, H(0, 64).y, 0, 8, P.accent).setOrigin(0, 0.5).setScrollFactor(0).setDepth(50);

    this.dust = scene.add.particles(0, 0, 'dust', {
      speed: { min: 40, max: 180 }, angle: { min: 200, max: 340 }, gravityY: 300,
      scale: { start: 0.9 / DPR, end: 0 }, alpha: { start: 0.7, end: 0 }, lifespan: { min: 350, max: 700 },
      tint: P.dust, emitting: false
    }).setDepth(30);
    this.chips = scene.add.particles(0, 0, 'chip', {
      speed: { min: 150, max: 420 }, angle: { min: 180, max: 360 }, gravityY: 1200,
      rotate: { min: 0, max: 360 }, scale: { min: 0.6 / DPR, max: 1.3 / DPR }, lifespan: { min: 400, max: 900 },
      emitting: false
    }).setDepth(30);
  }

  setLives(n, max) {
    while (this.lifeIcons.length < max) {
      const i = this.lifeIcons.length;
      const p = hud(this.scene, this.W - 40 - i * 48, 100);
      this.lifeIcons.push(this.scene.add.image(p.x, p.y, 'life').setScrollFactor(0).setDepth(50));
    }
    this.lifeIcons.forEach((ic, i) => {
      const on = i < n;
      if (ic.__on === on) return;
      ic.__on = on;
      if (!on) { ic.setTint(P.miss); this.scene.tweens.add({ targets: ic, scale: 0.6, alpha: 0.25, angle: -25, duration: 300, ease: 'Back.in' }); }
      else { ic.clearTint().setScale(1).setAlpha(1).setAngle(0); }
    });
  }

  popup(text, kind) {
    const t = this.pool[this.poolIdx++ % this.pool.length];
    this.scene.tweens.killTweensOf(t);
    t.setText(text).setColor(COLORS[kind] || '#fff').setVisible(true).setAlpha(1).setScale(0.5)
      .setPosition(hud(this.scene, this.W / 2 + Phaser.Math.Between(-12, 12), 300).x, hud(this.scene, 0, 300).y);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 110, ease: 'Back.out' });
    this.scene.tweens.add({ targets: t, y: hud(this.scene, 0, 240).y, alpha: 0, delay: 250, duration: 420, ease: 'Sine.in', onComplete: () => t.setVisible(false) });
  }

  setCombo(n) {
    if (n < 2) { this.combo.setAlpha(0); return; }
    this.combo.setText(n + '\nCOMBO').setAlpha(1).setScale(1.25);
    this.scene.tweens.add({ targets: this.combo, scale: 1, duration: 140, ease: 'Sine.out' });
  }

  setBanner(text, color = '#fff') {
    if (this.banner.text === text) return;
    this.banner.setText(text).setColor(color).setScale(0.6).setAlpha(0);
    this.scene.tweens.add({ targets: this.banner, scale: 1, alpha: 1, duration: 200, ease: 'Back.out' });
  }

  setScore(v) {
    const s = String(v);
    if (this.score.text === s) return;
    this.score.setText(s).setScale(1.2);
    this.scene.tweens.add({ targets: this.score, scale: 1, duration: 150 });
  }

  setProgress(k) { this.progress.width = (this.W - 32) * Phaser.Math.Clamp(k, 0, 1); }

  burst(x, y, kind) {
    const n = kind === 'perfect' ? 14 : kind === 'good' ? 8 : kind === 'miss' ? 3 : 5;
    this.dust.explode(n, x, y);
    if (kind === 'perfect' || kind === 'good') this.chips.explode(kind === 'perfect' ? 10 : 5, x, y);
  }
}
