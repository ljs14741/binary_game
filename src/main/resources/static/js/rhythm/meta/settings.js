/* 설정 + 기록 (localStorage). 배포 없이 로컬에서만 쓰므로 단순하게. */
const LS = 'kb.';
export const settings = { calibOffset: null, muted: false, hard: false, inputOffset: 0, plays: 0, tutDone: false };
export const records = {};   // stageId → { score, medal, accuracy, combo }
// 장난감 모드 기록: 최고 콤보, 한 판 최다 미션, 누적 부순 것
export const toyRecord = { combo: 0, missions: 0, objects: 0 };

function get(k) { try { return localStorage.getItem(LS + k); } catch (e) { return null; } }
function set(k, v) { try { localStorage.setItem(LS + k, v); } catch (e) { /* ignore */ } }

export function loadSettings() {
  const o = get('offset'); if (o !== null && o !== '') settings.calibOffset = parseFloat(o);
  settings.muted = get('muted') === '1';
  settings.hard = get('hard') === '1';
  settings.plays = parseInt(get('plays') || '0', 10) || 0;
  try { Object.assign(records, JSON.parse(get('records') || '{}')); } catch (e) { /* ignore */ }
  // 이미 곡을 깬 적 있으면 연습은 건너뜀
  settings.tutDone = get('tut') === '1' || Object.keys(records).length > 0;
  try { Object.assign(toyRecord, JSON.parse(get('toy') || '{}')); } catch (e) { /* ignore */ }
}
export function saveTutorialDone() { settings.tutDone = true; set('tut', '1'); }
export function saveToyRecord(r) {
  toyRecord.combo = Math.max(toyRecord.combo, r.combo);
  toyRecord.missions = Math.max(toyRecord.missions || 0, r.missions);
  toyRecord.objects += r.objects;
  set('toy', JSON.stringify(toyRecord));
}
export function saveCalib(v) { settings.calibOffset = v; set('offset', v == null ? '' : String(v)); }
export function saveHard(h) { settings.hard = h; set('hard', h ? '1' : '0'); }
/** 스테이지 시작 횟수. 처음 몇 판에만 조작법 안내를 띄운다 (keys.js) */
export function countPlay() { settings.plays += 1; set('plays', String(settings.plays)); return settings.plays; }
export function saveMuted(m) { settings.muted = m; set('muted', m ? '1' : '0'); }
const MEDAL_RANK = { gold: 3, silver: 2, bronze: 1 };
// 점수·메달·정확도를 따로 최고값으로 남김 (점수는 낮아도 메달이 오르면 해제돼야 함)
export function saveRecord(stageId, sum) {
  const prev = records[stageId];
  const isNew = !prev || sum.score > prev.score;
  const better = (a, b) => (MEDAL_RANK[a] || 0) >= (MEDAL_RANK[b] || 0) ? a : b;
  records[stageId] = prev
    ? { score: Math.max(prev.score, sum.score), medal: better(sum.medal, prev.medal) || null, accuracy: Math.max(prev.accuracy || 0, sum.accuracy), combo: Math.max(prev.combo || 0, sum.maxCombo) }
    : { score: sum.score, medal: sum.medal, accuracy: sum.accuracy, combo: sum.maxCombo };
  set('records', JSON.stringify(records));
  return isNew;
}
