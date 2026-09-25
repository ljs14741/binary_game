/* 월드맵 — 스테이지 카드 목록: 메달, 최고점, 잠금. 하드 토글, 보정, 소리, 연습.
 * 다음에 할 카드에 테두리가 깜빡임. 키보드는 ↑↓ 로 고르고 스페이스·엔터로 시작. */
import Phaser from 'phaser';
import { FONT, P, css } from '../art/palette.js';
import { AudioEngine as audio } from '../core/audio.js';
import { settings, records, toyRecord, saveMuted, saveHard } from '../meta/settings.js';
import { input } from '../core/inputSingleton.js';
import { STAGES, isUnlocked } from '../stages/index.js';
import { button } from './ui.js';
import { TOY_MODE } from '../meta/brand.js';
import { setupCamera, DPR } from '../art/dpr.js';
import { T, fmt } from '../meta/i18n.js';

export class WorldMap extends Phaser.Scene {
  constructor() { super('WorldMap'); }
  create() {
    const { W, H } = setupCamera(this);
    this._starting = false;
    input.enabled = false;
    this.add.tileSprite(W / 2, H / 2, W, H, 'wallpaper').setTint(0x6f6580).setTileScale(1 / DPR);
    this.add.text(W / 2, 60, T.world1, { fontFamily: FONT, fontSize: '34px', fontStyle: '900', color: css(P.accent), stroke: css(P.uiDark), strokeThickness: 8 }).setOrigin(0.5);
    const medals = STAGES.filter(s => !s.remix).filter(s => { const r = records[s.id] || records[s.id + '-hard']; return r && r.medal; }).length;
    this.add.text(W / 2, 100, fmt(T.medals, medals, STAGES.length - 1, settings.hard ? T.hard : T.normal), { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: '#fff', stroke: css(P.uiDark), strokeThickness: 4 }).setOrigin(0.5);

    const cardW = Math.min(W - 40, 460), cardH = 84, gap = 10, top = 130;
    this.cards = [];   // 키보드로 고를 수 있는 카드: { y, go }
    // 맨 위: 장난감 모드 (누구나)
    {
      const y = top + cardH / 2;
      const bg = this.add.rectangle(W / 2, y, cardW, cardH, 0xfff1c9, 0.95).setStrokeStyle(4, P.uiDark);
      this.add.text(W / 2 - cardW / 2 + 18, y - 16, TOY_MODE, { fontFamily: FONT, fontSize: '22px', fontStyle: '900', color: css(P.uiDark) }).setOrigin(0, 0.5);
      this.add.text(W / 2 - cardW / 2 + 18, y + 16, T.toyDesc + (toyRecord.combo ? ` · ${fmt(T.toyBest, toyRecord.combo)}` : ''), { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#5a5566' }).setOrigin(0, 0.5);
      this.add.image(W / 2 + cardW / 2 - 40, y, 'megaphone').setScale(0.7);
      const go = () => { if (this._starting) return; this._starting = true; audio.unlock().then(() => { audio.stopLoop(); this.scene.start('Toy'); }); };
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => bg.setFillStyle(0xffe08a));
      bg.on('pointerup', go);
      bg.on('pointerout', () => bg.setFillStyle(0xfff1c9, 0.95));
      this.cards.push({ y, go });
    }
    let pick = -1;   // 추천 카드: 아직 메달 없는 첫 열린 스테이지
    STAGES.forEach((s, i) => {
      const y = top + (i + 1) * (cardH + gap) + cardH / 2;
      const unlocked = isUnlocked(s, records);
      const rec = records[settings.hard ? s.id + '-hard' : s.id];
      const bg = this.add.rectangle(W / 2, y, cardW, cardH, unlocked ? 0xffffff : 0x8d8798, unlocked ? 0.92 : 0.6).setStrokeStyle(4, P.uiDark);
      this.add.text(W / 2 - cardW / 2 + 18, y - 18, `${s.label}  ${s.title}`, { fontFamily: FONT, fontSize: '22px', fontStyle: '900', color: css(P.uiDark) }).setOrigin(0, 0.5);
      this.add.text(W / 2 - cardW / 2 + 18, y + 16, unlocked ? `${s.learn} · BPM ${settings.hard && s.chart.hard ? s.chart.hard.bpm : s.chart.bpm}${rec ? ` · ${fmt(T.best, rec.score.toLocaleString())}` : ''}` : (s.unlock.prev ? T.lockPrev : T.lockAll),
        { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#5a5566' }).setOrigin(0, 0.5);
      if (unlocked) {
        this.add.image(W / 2 + cardW / 2 - 40, y, rec && rec.medal ? 'medal-' + rec.medal : 'medal-none');
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => bg.setFillStyle(0xfff1c9));
        bg.on('pointerup', () => this.start(s));
        bg.on('pointerout', () => bg.setFillStyle(0xffffff, 0.92));
        if (pick < 0 && !(rec && rec.medal)) pick = this.cards.length;
        this.cards.push({ y, go: () => this.start(s) });
      } else {
        this.add.image(W / 2 + cardW / 2 - 40, y, 'lock').setAlpha(0.8);
      }
    });

    const by = top + (STAGES.length + 1) * (cardH + gap) + 26;
    this.hardBtn = button(this, W / 2, by, hardLabel(), () => { saveHard(!settings.hard); this.scene.restart(); }, { w: cardW, h: 50, size: 17 });
    button(this, W / 2 - cardW / 4 - 4, by + 62, T.calib, () => { audio.unlock(); audio.stopLoop(); this.scene.start('Calib'); }, { w: cardW / 2 - 8, h: 48, size: 17 });
    this.muteBtn = button(this, W / 2 + cardW / 4 + 4, by + 62, settings.muted ? T.soundOff : T.soundOn, () => { saveMuted(!settings.muted); audio.setMuted(settings.muted); this.muteBtn.setLabel(settings.muted ? T.soundOff : T.soundOn); }, { w: cardW / 2 - 8, h: 48, size: 17 });
    button(this, W / 2 - cardW / 4 - 4, by + 118, T.toTitle, () => this.scene.start('Title'), { w: cardW / 2 - 8, h: 42, size: 15 });
    button(this, W / 2 + cardW / 4 + 4, by + 118, T.practice, () => this.start(null, 'Tutorial'), { w: cardW / 2 - 8, h: 42, size: 15 });

    // 선택 테두리
    this.sel = pick < 0 ? 1 : pick;
    this.selBox = this.add.rectangle(W / 2, 0, cardW + 10, cardH + 10).setStrokeStyle(5, P.accent).setDepth(5);
    this.tweens.add({ targets: this.selBox, alpha: 0.35, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.moveSel(0);
    const shownAt = this.time.now;
    const kb = this.input.keyboard;
    kb.on('keydown-UP', () => this.moveSel(-1)); kb.on('keydown-W', () => this.moveSel(-1));
    kb.on('keydown-DOWN', () => this.moveSel(1)); kb.on('keydown-S', () => this.moveSel(1));
    const enter = e => { if (!e.repeat && this.time.now - shownAt > 300) this.cards[this.sel].go(); };
    kb.on('keydown-SPACE', enter); kb.on('keydown-ENTER', enter);

    if (audio.ctx && audio.ctx.state === 'running') audio.startLoop(120);
  }
  moveSel(d) {
    this.sel = Phaser.Math.Clamp(this.sel + d, 0, this.cards.length - 1);
    this.selBox.y = this.cards[this.sel].y;
  }
  // 처음 1-1 을 누르면 연습부터 (하드모드는 제외). key 를 주면 그 씬으로 (연습 버튼)
  start(s, key) {
    if (this._starting) return; this._starting = true;
    let to = key || s.key, then = 'WorldMap';
    if (s && s.id === 'w1-wall' && !settings.tutDone && !settings.hard) { to = 'Tutorial'; then = s.key; }
    audio.unlock().then(() => {
      audio.stopLoop();
      settings.inputOffset = settings.calibOffset != null ? settings.calibOffset : audio.latency();
      this.scene.start(to, { then });
    });
  }
}
function hardLabel() { return settings.hard ? T.hardOn : T.hardOff; }
