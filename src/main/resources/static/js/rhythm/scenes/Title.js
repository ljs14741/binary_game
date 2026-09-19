import Phaser from 'phaser';
import { FONT, P, css } from '../art/palette.js';
import { AudioEngine as audio } from '../core/audio.js';
import { settings, saveMuted } from '../meta/settings.js';
import { input } from '../core/inputSingleton.js';
import { Bot } from '../engine/Bot.js';
import { button } from './ui.js';
import { BRAND, SUBTITLE, HERO } from '../meta/brand.js';
import { setupCamera, DPR } from '../art/dpr.js';

export class Title extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    const { W, H } = setupCamera(this);
    this._starting = false;
    input.enabled = false;
    this.add.tileSprite(W / 2, H / 2, W, H, 'wallpaper').setTint(0x8f83a3).setTileScale(1 / DPR);
    this.add.tileSprite(W / 2, H * 0.60 + 22, W, 44, 'floor').setTileScale(1 / DPR);
    this.add.text(W / 2, 150, `${BRAND}\n${SUBTITLE}`, { fontFamily: FONT, fontSize: '64px', fontStyle: '900', color: css(P.accent), stroke: css(P.uiDark), strokeThickness: 12, align: 'center', lineSpacing: -8 }).setOrigin(0.5);
    this.add.text(W / 2, 250, '리듬을 듣고, 똑같이 뿌셔!', { fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: '#fff', stroke: css(P.uiDark), strokeThickness: 5 }).setOrigin(0.5);

    const bot = new Bot(this, W / 2 - 30, H * 0.60);
    this.bot = bot;
    this.time.addEvent({ delay: 1400, loop: true, callback: () => { bot.swing(1); bot.setFace('happy', 0.5); } });


    button(this, W / 2, H - 280, '시작하기', () => this.start(), { primary: true, w: 360, h: 72, size: 26 });
    button(this, W / 2 - 95, H - 200, '타이밍 보정', () => { audio.unlock(); audio.stopLoop(); this.scene.start('Calib'); }, { w: 170, h: 56, size: 20 });
    this.muteBtn = button(this, W / 2 + 95, H - 200, muteLabel(), () => { saveMuted(!settings.muted); audio.setMuted(settings.muted); audio.unlock(); this.muteBtn.setLabel(muteLabel()); }, { w: 170, h: 56, size: 20 });
    this.add.text(W / 2, H - 40, 'PC: 스페이스바 · 모바일: 화면 터치', { fontFamily: FONT, fontSize: '16px', color: '#fff', stroke: css(P.uiDark), strokeThickness: 4 }).setOrigin(0.5);

    // 브라우저 정책: 첫 제스처 전엔 소리를 못 낸다. 이미 열려 있으면 바로, 아니면 첫 터치/키에 BGM 시작.
    const bgm = () => audio.unlock().then(() => { if (this.scene.isActive()) audio.startLoop(120); });
    if (audio.ctx && audio.ctx.state === 'running') bgm();
    else { this.input.once('pointerdown', bgm); this.input.keyboard.once('keydown', bgm); }
    this.hint = this.add.text(W / 2, 300, '화면을 터치하면 음악이 시작돼요', { fontFamily: FONT, fontSize: '16px', color: '#fff', stroke: css(P.uiDark), strokeThickness: 4 }).setOrigin(0.5).setAlpha(audio.ctx ? 0 : 0.8);
    this.input.once('pointerdown', () => this.hint.setAlpha(0));
    this.input.keyboard.on('keydown-SPACE', () => this.start());
    this.input.keyboard.on('keydown-ENTER', () => this.start());
  }
  start() {
    if (this._starting) return; this._starting = true;
    audio.unlock().then(() => this.scene.start('WorldMap'));
  }
}
function muteLabel() { return settings.muted ? '소리 끔' : '소리 켬'; }
export function medalName(m) { return m === 'gold' ? '금메달' : m === 'silver' ? '은메달' : m === 'bronze' ? '동메달' : '메달 없음'; }
