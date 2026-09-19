/* input.js — 키/포인터 입력을 하나의 "탭"으로 통합하고, 이벤트 발생 시각을 오디오 시계로 변환.
 * 핸들러가 늦게 돌아도(메인 스레드 바쁨) 실제 눌린 순간을 쓴다:
 *   audioTime = ctx.currentTime − (performance.now() − event.timeStamp)/1000
 */
export const HIT_KEYS = ['Space', 'Enter', 'KeyF', 'KeyJ', 'KeyD', 'KeyK'];

export function eventToAudioTime(audio, e) {
  const now = audio.now();
  if (!e || typeof e.timeStamp !== 'number' || typeof performance === 'undefined') return now;
  const age = (performance.now() - e.timeStamp) / 1000;
  if (!(age >= 0) || age > 0.25) return now;     // 이상값이면 무시
  return now - age;
}

export class Input {
  constructor(audio, target = document, scope = null) {
    this.audio = audio; this.target = target;
    this.scope = scope;     // 포인터 탭을 이 요소 안에서만 받는다 (페이지의 방명록·헤더 클릭이 타격이 되지 않게)
    this.onTap = null;      // (audioTime, event)
    this.onEscape = null;
    this.enabled = true;
    // 주의: 비활성 상태에선 이벤트를 절대 건드리지 않는다. pointerdown 을 preventDefault 하면
    // 브라우저가 호환 mouse 이벤트를 안 만들고, Phaser 는 mouse/touch 이벤트로 버튼을 처리하므로 버튼이 죽는다.
    this._key = e => {
      if (e.repeat) return;
      if (e.code === 'Escape') { if (this.enabled && this.onEscape) this.onEscape(); return; }
      if (!this.enabled || !this.onTap || !HIT_KEYS.includes(e.code)) return;
      if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
      e.preventDefault(); this._fire(e);
    };
    this._ptr = e => {
      if (!this.enabled || !this.onTap) return;
      if (e.target && e.target.closest && e.target.closest('button,a,input')) return;
      if (this.scope && !this.scope.contains(e.target)) return;
      e.preventDefault(); this._fire(e);
    };
  }
  attach() {
    this.target.addEventListener('keydown', this._key);
    this.target.addEventListener('pointerdown', this._ptr);
  }
  detach() {
    this.target.removeEventListener('keydown', this._key);
    this.target.removeEventListener('pointerdown', this._ptr);
  }
  _fire(e) {
    if (!this.enabled || !this.onTap) return;
    this.onTap(eventToAudioTime(this.audio, e), e);
  }
}
