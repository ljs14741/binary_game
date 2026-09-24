/* 진행 저장 (localStorage). 로그인이 없으니 이 브라우저에만 남음.
 * 나중에 로그인·서버 동기화를 붙일 때는 이 파일의 load/persist 만 바꾸면 됨.
 */
const KEY = 'pf.v1';
export const save = {
  cleared: 0,          // 깬 레벨 수 (0 이면 Lv1 만 열림)
  best: {},            // 레벨 번호(0부터) → 가장 빠른 클리어 초
  totalTime: 0,        // 클리어한 판들의 시간 합
  vol: null,           // { music, sfx } 0~1. null 이면 기본값 (core/audio.js DEFAULT_VOL)
  seenTutorial: false,
  seenPets: [],        // 이름표를 이미 보여준 친구
  snap: null           // 하던 판 (레벨 중간 이어하기)
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(save, JSON.parse(raw));
  } catch (e) { /* 사생활 보호 모드 등: 저장 없이 진행 */ }
  return save;
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* 무시 */ }
}

/** 클리어 기록. 새 기록이면 true */
export function recordClear(level, sec) {
  const prev = save.best[level];
  const isNew = prev == null || sec < prev;
  if (isNew) save.best[level] = Math.round(sec);
  if (prev == null) save.totalTime += Math.round(sec);
  save.cleared = Math.max(save.cleared, level + 1);
  if (save.snap && save.snap.level === level) save.snap = null;
  persist();
  return isNew;
}

export function medalOf(level, sec, par) {
  if (sec == null) return null;
  if (sec <= par) return 'gold';
  if (sec <= par * 1.5) return 'silver';
  return 'bronze';
}
