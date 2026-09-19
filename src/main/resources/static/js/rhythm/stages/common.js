/* 스테이지 공통: 하드 변형 채보, 실내 배경 */
import { settings } from '../meta/settings.js';
import { P } from '../art/palette.js';
import { DPR } from '../art/dpr.js';

export function chartFor(base) {
  return settings.hard && base.hard
    ? { ...base, ...base.hard, id: base.id + '-hard', baseId: base.id, hardMode: true }
    : { ...base, baseId: base.id, hardMode: false };
}

// 벽지 + 바닥. floorY 아래로 바닥, 위로 벽지.
export function buildRoom(scene, worldWidth, floorY, tint = 0xb9aecb) {
  scene.floorY = floorY; scene.worldWidth = worldWidth;
  scene.add.tileSprite(worldWidth / 2, floorY / 2 - 300, worldWidth + 800, floorY + 800, 'wallpaper').setDepth(0).setTint(tint).setTileScale(1 / DPR);
  scene.add.tileSprite(worldWidth / 2, floorY + 140, worldWidth + 800, 280, 'floor').setDepth(1).setTileScale(1 / DPR);
  scene.add.rectangle(worldWidth / 2, floorY, worldWidth + 800, 6, P.floorLine).setDepth(2);
}
