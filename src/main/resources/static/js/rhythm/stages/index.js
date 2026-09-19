/* 스테이지 레지스트리. 순서대로 잠금 해제된다.
 * unlock: 이 스테이지를 열려면 필요한 것. { prev: 'id' } = 앞 스테이지 동메달 이상, { all: [...] } = 전부 메달
 */
import wall from '../charts/w1/wall.js';
import window_ from '../charts/w1/window.js';
import chimney from '../charts/w1/chimney.js';
import nails from '../charts/w1/nails.js';
import remix from '../charts/w1/remix.js';

export const STAGES = [
  { id: 'w1-wall',    key: 'W1Wall',    chart: wall,    label: '1-1', learn: '기본 4비트',      unlock: null },
  { id: 'w1-window',  key: 'W1Window',  chart: window_, label: '1-2', learn: '더블 "촥촥"',     unlock: { prev: 'w1-wall' } },
  { id: 'w1-chimney', key: 'W1Chimney', chart: chimney, label: '1-3', learn: '엇박',           unlock: { prev: 'w1-window' } },
  { id: 'w1-nails',   key: 'W1Nails',   chart: nails,   label: '1-4', learn: '8분 연타',        unlock: { prev: 'w1-chimney' } },
  { id: 'w1-remix',   key: 'W1Remix',   chart: remix,   label: '1-R', learn: '전부 섞어서',      unlock: { all: ['w1-wall', 'w1-window', 'w1-chimney', 'w1-nails'] }, remix: true }
];

export function stageById(id) { return STAGES.find(s => s.id === id); }
export function nextStage(id) { const i = STAGES.findIndex(s => s.id === id); return i >= 0 ? STAGES[i + 1] || null : null; }

// records: { [chartId]: { medal } }. 노멀 기록 기준으로 해제 (하드 기록도 인정)
export function isUnlocked(stage, records) {
  const has = id => { const r = records[id] || records[id + '-hard']; return !!(r && r.medal); };
  if (!stage.unlock) return true;
  if (stage.unlock.prev) return has(stage.unlock.prev);
  if (stage.unlock.all) return stage.unlock.all.every(has);
  return true;
}
