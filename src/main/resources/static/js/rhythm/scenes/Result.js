import Phaser from 'phaser';
import { FONT, P, css } from '../art/palette.js';
import { button } from './ui.js';
import { setupCamera } from '../art/dpr.js';
import { medalName } from './Title.js';
import { nextStage, isUnlocked, stageById } from '../stages/index.js';
import { records } from '../meta/settings.js';
import { HERO } from '../meta/brand.js';
import { T, fmt } from '../meta/i18n.js';
import { shareText } from '../meta/share.js';

const MSG = { S: fmt(T.msgS, HERO), A: T.msgA, B: T.msgB, C: T.msgC, D: fmt(T.msgD, HERO) };
const MEDAL_COLOR = { gold: '#ffb400', silver: '#c9ced9', bronze: '#c77b45' };
// 다음 메달 문턱 (judge.medal 과 같은 값)
const NEXT_MEDAL = [[0.70, 'bronze'], [0.85, 'silver'], [0.95, 'gold']];

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
      t(top + 40, T.livesLost, 26, '#ff5c7a');
      const x = t(top + 118, T.fail, 90, '#ff5c7a', '900');
      x.setScale(0); this.tweens.add({ targets: x, scale: 1, duration: 500, ease: 'Back.out' });
      t(top + 200, fmt(T.stoppedAt, s.perfect + s.good + s.miss, Math.round(s.demolished * 100)), 18);
      t(top + 300, `PERFECT ${s.perfect} · GOOD ${s.good} · MISS ${s.miss}`, 17, '#ddd');
      button(this, W / 2, H - 120, T.retry, () => this.retry(data.stageKey), { primary: true, w: 300, h: 64 });
      button(this, W / 2, H - 48, T.worldMap, () => this.home(data.stageKey), { w: 300, h: 56, size: 20 });
      this.shownAt = this.time.now;
      this.input.keyboard.on('keydown-SPACE', () => { if (this.time.now - this.shownAt > 800) this.retry(data.stageKey); });
      return;
    }
    t(top + 40, s.medal ? medalName(s.medal) : T.medalNone, 26, MEDAL_COLOR[s.medal] || '#9a9aa8');
    const rank = t(top + 118, s.rank, 110, s.rank === 'S' ? '#ffb400' : s.rank === 'A' ? '#ff5c7a' : s.rank === 'B' ? '#3cb371' : '#8fd3ff', '900');
    rank.setScale(0); this.tweens.add({ targets: rank, scale: 1, duration: 500, ease: 'Back.out' });
    t(top + 200, MSG[s.rank] + (s.allPerfect ? '\nALL PERFECT!' : ''), 18);
    const score = t(top + 250, '0', 40, '#fff', '900');
    this.tweens.addCounter({ from: 0, to: s.score, duration: 900, ease: 'Cubic.out', onUpdate: tw => score.setText(fmt(T.points, Math.round(tw.getValue()).toLocaleString())) });
    t(top + 300, `PERFECT ${s.perfect} · GOOD ${s.good} · MISS ${s.miss}${s.whiffs ? ` · ${fmt(T.whiffs, s.whiffs)}` : ''}`, 17, '#ddd');
    t(top + 328, fmt(T.stats, Math.round(s.accuracy * 100), s.maxCombo, Math.round(s.demolished * 100)), 17, '#ddd');
    // 기록 한 줄: 새 기록이면 얼마나 올랐는지, 아니면 내 최고. 뒤에 다음 메달까지 남은 정확도
    const prev = s.prev;
    const rec = s.isNew ? (prev ? `${T.newRecord} +${(s.score - prev.score).toLocaleString()}` : T.newRecord) : fmt(T.bestIs, prev.score.toLocaleString());
    const nm = NEXT_MEDAL.find(([a]) => s.accuracy < a);
    const goal = nm ? fmt(T.toMedal, medalName(nm[1]), Math.ceil((nm[0] - s.accuracy) * 100)) : '';
    t(top + 360, rec + (goal ? '  ·  ' + goal : ''), 18, s.isNew ? '#ffb400' : '#ddd');
    this.toast = t(top + 388, '', 15, '#8fd3ff', '700');

    const nx = nextStage(data.stageId);
    const canNext = nx && isUnlocked(nx, records);
    const shareBtn = (x, w) => button(this, x, H - 80, T.share, () => this.share(data, s), { w, h: 52, size: 18 });
    if (canNext) {
      button(this, W / 2, H - 150, fmt(T.next, nx.label, nx.title), () => this.go(data.stageKey, nx.key), { primary: true, w: 300, h: 60, size: 20 });
      button(this, W / 2 - 158, H - 80, T.again, () => this.retry(data.stageKey), { w: 150, h: 52, size: 18 });
      shareBtn(W / 2, 150);
      button(this, W / 2 + 158, H - 80, T.worldMap, () => this.home(data.stageKey), { w: 150, h: 52, size: 18 });
    } else {
      button(this, W / 2, H - 150, T.again, () => this.retry(data.stageKey), { primary: true, w: 300, h: 60 });
      shareBtn(W / 2 - 78, 148);
      button(this, W / 2 + 78, H - 80, T.worldMap, () => this.home(data.stageKey), { w: 148, h: 52, size: 18 });
    }
    this.shownAt = this.time.now;
    this.input.keyboard.on('keydown-SPACE', () => { if (this.time.now - this.shownAt > 1200) { if (canNext) this.go(data.stageKey, nx.key); else this.retry(data.stageKey); } });
  }
  share(data, s) {
    const st = stageById(data.stageId);
    const name = st ? `${st.label} ${st.title}${data.chart.hardMode ? ' (' + T.hard + ')' : ''}` : '';
    shareText(fmt(T.shareStage, name, s.rank, s.score.toLocaleString())).then(r => { if (r === 'copied') this.toast.setText(T.copied); });
  }
  retry(stageKey) { this.scene.stop(stageKey); this.scene.stop(); this.scene.start(stageKey); }
  home(stageKey) { this.scene.stop(stageKey); this.scene.stop(); this.scene.start('WorldMap'); }
  go(stageKey, nextKey) { this.scene.stop(stageKey); this.scene.stop(); this.scene.start(nextKey); }
}
