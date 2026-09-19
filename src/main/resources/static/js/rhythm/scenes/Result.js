import Phaser from 'phaser';
import { FONT, P, css } from '../art/palette.js';
import { button } from './ui.js';
import { setupCamera } from '../art/dpr.js';
import { medalName } from './Title.js';
import { nextStage, isUnlocked } from '../stages/index.js';
import { records } from '../meta/settings.js';
import { HERO } from '../meta/brand.js';

const MSG = { S: `완벽하게 뿌셨다! ${HERO}가 신났어요`, A: '거의 완벽! 벽이 남아나질 않네', B: '리듬감 있네요! 조금만 더!', C: '벽이 반쯤 남았어요. 다시!', D: `${HERO}가 한숨을 쉬어요…` };
const MEDAL_COLOR = { gold: '#ffb400', silver: '#c9ced9', bronze: '#c77b45' };

export class Result extends Phaser.Scene {
  constructor() { super('Result'); }
  create(data) {
    const s = data.summary; const { W, H } = setupCamera(this);
    // 위쪽은 비워서 잔해가 보이게, 아래 절반에 카드
    const top = H * 0.42;
    this.add.rectangle(W / 2, top + (H - top) / 2, W, H - top, 0x1c1a24, 0.86).setDepth(0);
    this.add.rectangle(W / 2, top, W, 6, P.accent);
    const t = (y, str, size, color = '#fff', style = '800') => this.add.text(W / 2, y, str, { fontFamily: FONT, fontSize: size + 'px', fontStyle: style, color, align: 'center' }).setOrigin(0.5);

    if (s.failed) {
      t(top + 40, '목숨을 다 잃었어요', 26, '#ff5c7a');
      const x = t(top + 118, '실패', 90, '#ff5c7a', '900');
      x.setScale(0); this.tweens.add({ targets: x, scale: 1, duration: 500, ease: 'Back.out' });
      t(top + 200, `${s.perfect + s.good + s.miss}번째에서 멈췄어요. 뿌신 비율 ${Math.round(s.demolished * 100)}%\n다시 도전!`, 18);
      t(top + 300, `PERFECT ${s.perfect} · GOOD ${s.good} · MISS ${s.miss}`, 17, '#ddd');
      button(this, W / 2, H - 120, '다시 도전', () => this.retry(data.stageKey), { primary: true, w: 300, h: 64 });
      button(this, W / 2, H - 48, '월드맵', () => this.home(data.stageKey), { w: 300, h: 56, size: 20 });
      this.shownAt = this.time.now;
      this.input.keyboard.on('keydown-SPACE', () => { if (this.time.now - this.shownAt > 800) this.retry(data.stageKey); });
      return;
    }
    t(top + 40, s.medal ? medalName(s.medal) : '메달 없음', 26, MEDAL_COLOR[s.medal] || '#9a9aa8');
    const rank = t(top + 118, s.rank, 110, s.rank === 'S' ? '#ffb400' : s.rank === 'A' ? '#ff5c7a' : s.rank === 'B' ? '#3cb371' : '#8fd3ff', '900');
    rank.setScale(0); this.tweens.add({ targets: rank, scale: 1, duration: 500, ease: 'Back.out' });
    t(top + 200, MSG[s.rank] + (s.allPerfect ? '\nALL PERFECT!' : ''), 18);
    const score = t(top + 250, '0', 40, '#fff', '900');
    this.tweens.addCounter({ from: 0, to: s.score, duration: 900, ease: 'Cubic.out', onUpdate: tw => score.setText(Math.round(tw.getValue()).toLocaleString() + '점') });
    t(top + 300, `PERFECT ${s.perfect} · GOOD ${s.good} · MISS ${s.miss}${s.whiffs ? ` · 헛스윙 ${s.whiffs}` : ''}`, 17, '#ddd');
    t(top + 328, `정확도 ${Math.round(s.accuracy * 100)}% · 최대 ${s.maxCombo}콤보 · 뿌신 비율 ${Math.round(s.demolished * 100)}%`, 17, '#ddd');
    if (s.isNew) t(top + 360, '새 기록!', 20, '#ffb400');

    const nx = nextStage(data.stageId);
    const canNext = nx && isUnlocked(nx, records);
    if (canNext) {
      button(this, W / 2, H - 150, `다음: ${nx.label} ${nx.chart.title}`, () => this.go(data.stageKey, nx.key), { primary: true, w: 300, h: 60, size: 20 });
      button(this, W / 2 - 78, H - 80, '다시하기', () => this.retry(data.stageKey), { w: 148, h: 52, size: 18 });
      button(this, W / 2 + 78, H - 80, '월드맵', () => this.home(data.stageKey), { w: 148, h: 52, size: 18 });
    } else {
      button(this, W / 2, H - 120, '다시하기', () => this.retry(data.stageKey), { primary: true, w: 300, h: 64 });
      button(this, W / 2, H - 48, '월드맵', () => this.home(data.stageKey), { w: 300, h: 56, size: 20 });
    }
    this.shownAt = this.time.now;
    this.input.keyboard.on('keydown-SPACE', () => { if (this.time.now - this.shownAt > 1200) { if (canNext) this.go(data.stageKey, nx.key); else this.retry(data.stageKey); } });
  }
  retry(stageKey) { this.scene.stop(stageKey); this.scene.stop(); this.scene.start(stageKey); }
  home(stageKey) { this.scene.stop(stageKey); this.scene.stop(); this.scene.start('WorldMap'); }
  go(stageKey, nextKey) { this.scene.stop(stageKey); this.scene.stop(); this.scene.start(nextKey); }
}
