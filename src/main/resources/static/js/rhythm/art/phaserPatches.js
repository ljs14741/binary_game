/* Phaser 런타임 패치: 고해상도 텍스처의 논리 크기, 텍스트 기본 해상도. main.js 와 헤드리스 테스트가 함께 쓴다. */
import Phaser from 'phaser';
import { DPR } from './dpr.js';

// 고해상도 텍스처(source.resolution = DPR)를 쓰는 이미지의 논리 크기 보정
for (const Cls of [Phaser.GameObjects.Image, Phaser.GameObjects.Sprite, Phaser.Physics.Matter.Image, Phaser.Physics.Matter.Sprite]) {
  const orig = Cls.prototype.setSizeToFrame;
  Cls.prototype.setSizeToFrame = function (frame) {
    orig.call(this, frame);
    const f = frame === undefined || frame === true ? this.frame : frame;
    const r = (f && f.source && f.source.resolution) || 1;
    if (r !== 1) { this.width = f.realWidth / r; this.height = f.realHeight / r; if (this.input) { this.input.hitArea.width = this.width; this.input.hitArea.height = this.height; } }
    return this;
  };
}
// 모든 텍스트를 DPR 해상도로 렌더
{
  const origText = Phaser.GameObjects.GameObjectFactory.prototype.text;
  Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, t, style) { return origText.call(this, x, y, t, Object.assign({ resolution: DPR }, style || {})); };
}

