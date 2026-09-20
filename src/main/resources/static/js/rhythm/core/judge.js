/* judge.js — 판정 / 점수 / 콤보 / 랭크
 * 창(초): perfect ±0.05, good ±0.11, miss ±0.16 (대칭).
 * |d| ≤ miss 안의 탭은 가장 가까운 노트를 소모한다. 노트 시각 + miss 가 지나면 자동 MISS.
 * MISS의 방향은 delta 부호로 구분한다 (delta < 0 이르게, > 0 늦게, null 자동).
 */
import { T } from '../meta/i18n.js';
export const WINDOWS = { perfect: 0.05, good: 0.11, miss: 0.16 };

export class Judge {
  constructor(notes, windows = WINDOWS, lives = 0) {
    this.notes = notes;               // 시간순 정렬 가정
    this.w = { ...windows };
    this.lives = lives; this.maxLives = lives;   // 0 이면 목숨 없음
    this.failed = false;
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.counts = { perfect: 0, good: 0, miss: 0 };
    this.whiffs = 0;
    this.onMiss = null;
  }

  get total() { return this.notes.length; }

  hit(t) {
    let best = null, bestD = Infinity;
    for (const n of this.notes) {
      if (n.judged) continue;
      const d = t - n.time;
      if (d < -this.w.miss) break;
      const a = Math.abs(d);
      if (a <= this.w.miss && a < bestD) { best = n; bestD = a; }
    }
    if (!best) return null;
    best.judged = true;
    best.delta = t - best.time;
    best.result = bestD <= this.w.perfect ? 'perfect' : bestD <= this.w.good ? 'good' : 'miss';
    this._apply(best.result);
    return best;
  }

  update(t) {
    for (const n of this.notes) {
      if (n.judged) continue;
      if (t <= n.time + this.w.miss) break;
      n.judged = true; n.result = 'miss'; n.delta = null;
      this._apply('miss');
      if (this.onMiss) this.onMiss(n);
    }
  }

  // 게임 종료 시 남은 노트 정리
  flush() { this.update(Infinity); }

  whiff() { this.whiffs++; this.combo = 0; }

  _apply(r) {
    this.counts[r]++;
    if (r === 'miss') {
      this.combo = 0;
      if (this.maxLives > 0 && this.lives > 0) { this.lives--; if (this.lives === 0) this.failed = true; }
      return;
    }
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    const base = r === 'perfect' ? 100 : 50;
    this.score += Math.round(base * (1 + Math.min(this.combo, 20) * 0.05));
  }

  accuracy() {
    if (!this.total) return 0;
    return (this.counts.perfect + this.counts.good * 0.5) / this.total;
  }

  rank() {
    const a = this.accuracy();
    if (a >= 0.95) return 'S';
    if (a >= 0.85) return 'A';
    if (a >= 0.70) return 'B';
    if (a >= 0.50) return 'C';
    return 'D';
  }

  medal() {
    const a = this.accuracy();
    return a >= 0.95 ? 'gold' : a >= 0.85 ? 'silver' : a >= 0.70 ? 'bronze' : null;
  }

  summary() {
    return {
      score: this.score,
      perfect: this.counts.perfect, good: this.counts.good, miss: this.counts.miss,
      whiffs: this.whiffs, total: this.total, maxCombo: this.maxCombo,
      lives: this.lives, maxLives: this.maxLives, failed: this.failed,
      accuracy: this.accuracy(), rank: this.rank(), medal: this.medal(),
      allPerfect: this.counts.perfect === this.total && this.total > 0
    };
  }
}

// 판정 결과 → 화면 라벨
export function labelFor(note) {
  if (!note) return null;
  if (note.result === 'perfect') return 'PERFECT';
  if (note.result === 'good') return note.delta < 0 ? T.goodEarly : T.goodLate;
  if (note.delta == null) return 'MISS';
  return note.delta < 0 ? T.tooEarly : T.tooLate;
}
