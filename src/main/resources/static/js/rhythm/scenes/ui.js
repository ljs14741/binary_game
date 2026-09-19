/* 캔버스 안 버튼 (Phaser). 우리 document 입력은 이 화면들에서 꺼져 있다. */
import { FONT, P, css } from '../art/palette.js';
export function button(scene, x, y, label, onClick, o = {}) {
  const w = o.w || 300, h = o.h || 64, primary = !!o.primary;
  const bg = scene.add.rectangle(x, y, w, h, primary ? P.accent : 0xffffff).setStrokeStyle(4, P.uiDark);
  const shadow = scene.add.rectangle(x, y + 5, w, h, primary ? 0xb07a00 : 0xbbbbbb).setStrokeStyle(4, P.uiDark);
  const txt = scene.add.text(x, y, label, { fontFamily: FONT, fontSize: (o.size || 24) + 'px', fontStyle: '800', color: css(P.uiDark) }).setOrigin(0.5);
  shadow.setDepth(100); bg.setDepth(101); txt.setDepth(102);
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerdown', () => { bg.y += 4; txt.y += 4; });
  bg.on('pointerup', () => { bg.y -= 4; txt.y -= 4; onClick(); });
  bg.on('pointerout', () => { bg.y = y; txt.y = y; });
  return { bg, txt, shadow, setLabel: s => txt.setText(s), destroy() { bg.destroy(); txt.destroy(); shadow.destroy(); } };
}
