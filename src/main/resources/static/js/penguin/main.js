import Phaser from 'phaser';
import './art/phaserPatches.js';
import { DPR, BASE_H } from './art/dpr.js';
import { Boot, Title } from './scenes/Title.js';
import { MapScene } from './scenes/Map.js';
import { Tank } from './scenes/Tank.js';
import { Sound } from './core/audio.js';
import { loadSave, save } from './meta/save.js';
import { openHelp } from './scenes/ui.js';
import { openDex } from './scenes/dex.js';
import { openSound } from './scenes/ui.js';

loadSave();
// 예전 저장(소리 끔/배경음 끔)은 음량 0 으로 옮김
if (!save.vol && (save.muted || save.musicOff)) save.vol = { music: 0, sfx: save.muted ? 0 : Sound.vol.sfx };
if (save.vol) Object.assign(Sound.vol, save.vol);

// 게임은 페이지 안의 #bw-penguin-stage 박스에 들어감 (공통 헤더·푸터·광고와 같이 삶).
// 논리 세로는 기본 960. 박스가 작은 폰은 960 이면 절반 이하로 축소돼 글씨가 안 읽혀서,
// 화면 배율 0.6 이 되게 세로를 줄임 (최소 760). 가로는 박스 비율에 맞춰 540 ~ 1440
const stageBox = document.getElementById('bw-penguin-stage');
function designSize() {
  const r = stageBox.getBoundingClientRect();
  const h = Phaser.Math.Clamp(Math.round(r.height / 0.6 / 2) * 2, 760, BASE_H);
  const a = r.width / Math.max(1, r.height);
  return { w: Phaser.Math.Clamp(Math.round(h * a / 2) * 2, 540, 1440), h };
}
const size0 = designSize();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: size0.w * DPR, height: size0.h * DPR,
  backgroundColor: '#1a4f8f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  audio: { noAudio: true },
  render: { antialias: true, roundPixels: false },
  input: { activePointers: 3 },
  scene: [Boot, Title, MapScene, Tank]
});
window.__penguinGame = game;

// 박스 크기가 바뀌면 가로 폭을 다시 정함. 메뉴는 다시 그리고, 판 중이면 배치만 다시 함
let lastW = size0.w, lastH = size0.h;
function onResize() {
  const { w, h } = designSize();
  // 사파리 주소창이 접혔다 펴질 때마다 다시 그리지 않게 조금 바뀐 건 무시
  if (Math.abs(w - lastW) < 40 && Math.abs(h - lastH) < 40) return;
  lastW = w; lastH = h;
  game.scale.setGameSize(w * DPR, h * DPR);
  for (const key of ['Title', 'Map']) {
    const sc = game.scene.getScene(key);
    if (sc && sc.scene.isActive()) sc.scene.restart(sc.scene.settings.data);
  }
  const tank = game.scene.getScene('Tank');
  if (tank && tank.scene.isActive()) tank.relayout();
}
window.addEventListener('resize', onResize);
if (window.ResizeObserver) new ResizeObserver(onResize).observe(stageBox);

// 전체화면은 게임 박스만. iOS 사파리는 미지원이라 버튼 숨김
const fullBtn = document.getElementById('btn-full');
const canFull = !!(stageBox.requestFullscreen || stageBox.webkitRequestFullscreen);
if (!canFull) fullBtn.classList.add('hidden');
fullBtn.addEventListener('click', () => {
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else {
    const r = (stageBox.requestFullscreen || stageBox.webkitRequestFullscreen).call(stageBox);
    if (r && r.catch) r.catch(() => {});
  }
});
document.addEventListener('fullscreenchange', () => { fullBtn.textContent = document.fullscreenElement ? '✕' : '⛶'; });

// 일시정지 (DOM 버튼 → 수조 씬)
const tank = () => { const t = game.scene.getScene('Tank'); return t && t.scene.isActive() ? t : null; };
document.getElementById('btn-pause').addEventListener('click', () => { const t = tank(); if (t) t.togglePause(true); });
document.getElementById('btn-resume').addEventListener('click', () => { const t = tank(); if (t) t.togglePause(false); });
document.getElementById('btn-restart').addEventListener('click', () => { const t = tank(); if (t) { document.getElementById('pause-overlay').style.display = 'none'; t.restartLevel(); } });
document.getElementById('btn-quit').addEventListener('click', () => { const t = tank(); if (t) { document.getElementById('pause-overlay').style.display = 'none'; t.quitToMap(); } });
document.getElementById('btn-help').addEventListener('click', () => openHelp(game.textures));
document.getElementById('btn-help-close').addEventListener('click', () => { document.getElementById('help-overlay').style.display = 'none'; });
document.getElementById('btn-dex').addEventListener('click', () => openDex(game.textures));
document.getElementById('btn-sound').addEventListener('click', () => openSound());
document.getElementById('btn-dex-close').addEventListener('click', () => { document.getElementById('dex-overlay').style.display = 'none'; });
document.getElementById('btn-sound-close').addEventListener('click', () => { document.getElementById('sound-overlay').style.display = 'none'; });
// 게임 방법·도감 창이 떠 있으면 ESC 는 창만 닫음 (Phaser 키 처리보다 먼저 받음)
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.bw-sheet')].filter(el => el.style.display === 'flex').pop();
  if (open) { open.style.display = 'none'; e.stopImmediatePropagation(); }
}, true);

// 게임 박스를 누르면 입력칸 포커스를 거둬서 ESC 등이 게임으로 오게 함
document.addEventListener('pointerdown', e => {
  if (stageBox.contains(e.target) && document.activeElement && document.activeElement.blur) document.activeElement.blur();
}, { capture: true, passive: true });
