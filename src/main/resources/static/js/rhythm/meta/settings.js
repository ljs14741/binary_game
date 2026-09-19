/* 설정 + 기록 (localStorage). 배포 없이 로컬에서만 쓰므로 단순하게. */
const LS = 'kb.';
export const settings = { calibOffset: null, muted: false, hard: false, inputOffset: 0 };
export const records = {};   // stageId → { score, medal, accuracy }

function get(k) { try { return localStorage.getItem(LS + k); } catch (e) { return null; } }
function set(k, v) { try { localStorage.setItem(LS + k, v); } catch (e) { /* ignore */ } }

export function loadSettings() {
  const o = get('offset'); if (o !== null && o !== '') settings.calibOffset = parseFloat(o);
  settings.muted = get('muted') === '1';
  settings.hard = get('hard') === '1';
  try { Object.assign(records, JSON.parse(get('records') || '{}')); } catch (e) { /* ignore */ }
}
export function saveCalib(v) { settings.calibOffset = v; set('offset', v == null ? '' : String(v)); }
export function saveHard(h) { settings.hard = h; set('hard', h ? '1' : '0'); }
export function saveMuted(m) { settings.muted = m; set('muted', m ? '1' : '0'); }
export function saveRecord(stageId, sum) {
  const prev = records[stageId];
  const isNew = !prev || sum.score > prev.score;
  if (isNew) { records[stageId] = { score: sum.score, medal: sum.medal, accuracy: sum.accuracy }; set('records', JSON.stringify(records)); }
  return isNew;
}
