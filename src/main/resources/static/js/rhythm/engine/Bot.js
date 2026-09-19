/* Bot.js — 주인공 로봇 (이름은 meta/brand.js HERO). 파츠 컨테이너 + 팔 회전 스윙 + LED 표정. */
import Phaser from 'phaser';

const IDLE = -70, WIND = -110, CONTACT = 25;

export class Bot extends Phaser.GameObjects.Container {
  constructor(scene, x, y) {
    super(scene, x, y);   // (x, y) = 발바닥 중심
    this.legs = scene.add.image(0, -14, 'bot-legs');
    this.body_ = scene.add.image(0, -70, 'bot-body');
    this.arm = scene.add.image(28, -92, 'bot-arm').setOrigin(20 / 220, 20 / 140).setAngle(IDLE);
    this.head = scene.add.image(0, -145, 'bot-head');
    this.face = scene.add.image(0, -145, 'face-idle');
    this.helmet = scene.add.image(-2, -190, 'bot-helmet');
    this.add([this.legs, this.body_, this.arm, this.head, this.face, this.helmet]);
    scene.add.existing(this);
    this.faceUntil = 0; this.bob = 0;
    this._breath = scene.tweens.add({ targets: [this.head, this.face, this.helmet], y: '-=3', duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  // 해머가 닿는 월드 좌표 (팔 각도 CONTACT 기준)
  contactPoint() { return { x: this.x + 150, y: this.y - 70 }; }

  setFace(name, dur = 0.5) {
    this.face.setTexture('face-' + name);
    this.faceUntil = this.scene.time.now + dur * 1000;
  }

  // 즉시 타격 포즈 → 되돌아옴. power 로 반동 크기.
  swing(power = 1) {
    const s = this.scene;
    s.tweens.killTweensOf(this.arm);
    this.arm.setAngle(CONTACT + 6 * power);
    s.tweens.add({ targets: this.arm, angle: IDLE, duration: 260, ease: 'Back.out' });
    s.tweens.killTweensOf(this.body_);
    this.body_.setScale(1.08 * power ** 0.3, 0.92);
    s.tweens.add({ targets: this.body_, scaleX: 1, scaleY: 1, duration: 220, ease: 'Elastic.out' });
  }

  // 헛스윙: 크게 휘두르고 휘청
  stumble() {
    const s = this.scene;
    s.tweens.killTweensOf(this.arm);
    this.arm.setAngle(CONTACT + 40);
    s.tweens.add({ targets: this.arm, angle: IDLE, duration: 420, ease: 'Sine.out' });
    s.tweens.add({ targets: this, angle: 8, duration: 90, yoyo: true, ease: 'Sine.inOut' });
  }

  // 시범 듣는 중: 팔을 살짝 들어 준비
  listen() {
    this.scene.tweens.add({ targets: this.arm, angle: WIND, duration: 150, ease: 'Sine.out' });
  }

  // 비트마다 살짝 들썩
  beat() {
    const s = this.scene;
    s.tweens.killTweensOf(this.legs);
    this.legs.setScale(1, 0.85);
    s.tweens.add({ targets: this.legs, scaleY: 1, duration: 160, ease: 'Sine.out' });
  }

  update() {
    if (this.faceUntil && this.scene.time.now > this.faceUntil) { this.faceUntil = 0; this.face.setTexture('face-idle'); }
  }
}
