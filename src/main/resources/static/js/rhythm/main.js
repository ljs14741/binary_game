import Phaser from 'phaser';
import { Boot } from './scenes/Boot.js';
import { Title } from './scenes/Title.js';
import { Result } from './scenes/Result.js';
import { Calib } from './scenes/Calib.js';
import { WallScene } from './stages/w1/WallScene.js';
import { WindowScene } from './stages/w1/WindowScene.js';
import { ChimneyScene } from './stages/w1/ChimneyScene.js';
import { NailsScene } from './stages/w1/NailsScene.js';
import { RemixScene } from './stages/w1/RemixScene.js';
import { WorldMap } from './scenes/WorldMap.js';
import { Toy } from './scenes/Toy.js';
import { ToyEnd } from './scenes/ToyEnd.js';
import { TutorialScene } from './stages/w1/TutorialScene.js';
import { loadSettings, settings } from './meta/settings.js';
import { AudioEngine as audio } from './core/audio.js';
import './core/inputSingleton.js';
import { DPR, BASE_H } from './art/dpr.js';
import { HIT_KEYS } from './core/input.js';

import './art/phaserPatches.js';

loadSettings();
audio.muted = settings.muted;

// 게임은 페이지 안의 #bw-rhythm-stage 박스에 들어간다 (공통 헤더·푸터·광고 자리와 같이 산다).
// 원본은 창 전체 기준이었는데, 여기서는 그 박스의 비율로 가로 폭을 정한다.
const stageBox = document.getElementById('bw-rhythm-stage');

// 세로 960 고정, 가로는 박스 비율에 맞춰 540(폰 세로) ~ 1440(PC 와이드). FIT 이라 박스 높이를 꽉 채운다.
function designWidth() {
  const r = stageBox.getBoundingClientRect();
  const a = r.width / Math.max(1, r.height);
  return Phaser.Math.Clamp(Math.round(960 * a / 2) * 2, 540, 1440);
}
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: designWidth() * DPR, height: BASE_H * DPR,
  backgroundColor: '#1c1a24',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'matter', matter: { gravity: { x: 0, y: 1.6 }, debug: false } },
  audio: { noAudio: true },
  render: { antialias: true, roundPixels: false },
  scene: [Boot, Title, WorldMap, Calib, TutorialScene, WallScene, WindowScene, ChimneyScene, NailsScene, RemixScene, Toy, ToyEnd, Result]
});

// 박스 크기/회전이 바뀌면 가로 폭을 다시 정하고, 메뉴 화면이면 다시 배치
let lastW = game.scale.width / DPR;
function onResize() {
  const w = designWidth();
  if (Math.abs(w - lastW) < 40) return;
  lastW = w;
  // resize() 는 FIT 의 표시 비율(displaySize.aspectRatio)을 안 건드려서 캔버스가 옛 비율로 눌린다. setGameSize() 는 건드린다.
  game.scale.setGameSize(w * DPR, BASE_H * DPR);
  for (const key of ['Title', 'WorldMap', 'Calib', 'Result', 'ToyEnd']) {
    const sc = game.scene.getScene(key);
    if (sc && sc.scene.isActive()) sc.scene.restart(sc.scene.settings.data);
  }
}
window.addEventListener('resize', onResize);
if (window.ResizeObserver) new ResizeObserver(onResize).observe(stageBox);

// 전체화면은 페이지 전체가 아니라 게임 박스만 키운다. iOS Safari 는 미지원 → 버튼 숨김
const fullBtn = document.getElementById('btn-full');
const root = stageBox;
const canFull = !!(root.requestFullscreen || root.webkitRequestFullscreen);
if (!canFull) fullBtn.classList.add('hidden');
fullBtn.addEventListener('click', () => {
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else (root.requestFullscreen || root.webkitRequestFullscreen).call(root).catch(() => {});
});
document.addEventListener('fullscreenchange', () => { fullBtn.textContent = document.fullscreenElement ? '✕' : '⛶'; });
// 스페이스가 페이지를 스크롤하지 않게 한다.
// 원본은 게임이 페이지 전체라 상관없었는데, 여기서는 헤더·설명·방명록이 같이 있어서
// 시범이 나오는 동안(입력 비활성) 스페이스를 누르면 페이지가 내려가 버렸다.
// 규칙: 마지막으로 만진 곳이 게임 박스면 타격 키는 게임이 갖는다. 밖을 만지면 다시 페이지 것이다.
let gameFocused = false;
document.addEventListener('pointerdown', e => {
  gameFocused = stageBox.contains(e.target);
  // 게임 박스를 누르면 방명록 입력칸 등에서 포커스를 거둬 키가 게임으로 오게 한다
  if (gameFocused && document.activeElement && document.activeElement.blur) document.activeElement.blur();
}, { capture: true, passive: true });
document.addEventListener('keydown', e => {
  if (!gameFocused || e.repeat) return;
  if (e.target && e.target.closest && e.target.closest('input,textarea,select,button,a,[contenteditable]')) return;
  if (HIT_KEYS.includes(e.code)) e.preventDefault();
}, { capture: true });
