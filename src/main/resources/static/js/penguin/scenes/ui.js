/* 캔버스 안 버튼·패널·글자 도우미 */
import Phaser from 'phaser';
import { FONT, P, css } from '../art/palette.js';
import { Sound } from '../core/audio.js';
import { DPR } from '../art/dpr.js';

export function text(scene, x, y, str, o = {}) {
  return scene.add.text(x, y, str, {
    fontFamily: FONT, fontSize: (o.size || 20) + 'px', fontStyle: o.weight || '800',
    color: o.color || '#ffffff', stroke: o.stroke === false ? undefined : (o.stroke || css(P.uiDark)),
    strokeThickness: o.stroke === false ? 0 : (o.thick != null ? o.thick : Math.max(3, (o.size || 20) * 0.22)),
    align: o.align || 'center', lineSpacing: o.lineSpacing || 2,
    wordWrap: o.wrap ? { width: o.wrap, useAdvancedWrap: true } : undefined
  }).setOrigin(o.ox != null ? o.ox : 0.5, o.oy != null ? o.oy : 0.5);
}

/** 눌리는 느낌 있는 둥근 버튼 */
export function button(scene, x, y, label, onClick, o = {}) {
  const w = o.w || 260, h = o.h || 64, r = o.r || Math.min(20, h / 2.6);
  const color = o.color != null ? o.color : (o.primary ? P.accent : 0xffffff);
  const c = scene.add.container(x, y).setDepth(o.depth || 100);
  const g = scene.add.graphics();
  const draw = pressed => {
    const dy = pressed ? 4 : 0;
    g.clear();
    g.fillStyle(P.uiDark, 1); g.fillRoundedRect(-w / 2 - 3, -h / 2 + 3, w + 6, h + 6, r + 2);
    g.fillStyle(Phaser.Display.Color.IntegerToColor(color).darken(25).color, 1); g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, r);
    g.fillStyle(color, 1); g.fillRoundedRect(-w / 2, -h / 2 + dy, w, h, r);
    g.fillStyle(0xffffff, 0.35); g.fillRoundedRect(-w / 2 + 8, -h / 2 + 5 + dy, w - 16, h * 0.26, r * 0.6);
  };
  draw(false);
  const t = text(scene, 0, 0, label, { size: o.size || 24, color: o.textColor || css(P.uiDark), stroke: false });
  c.add([g, t]);
  if (o.icon) {
    const ic = scene.add.image(-w / 2 + (o.iconX || 34), 0, o.icon).setScale(o.iconScale || 0.8);
    c.add(ic); t.x += (o.iconX || 34) / 2;
  }
  c.setSize(w + 6, h + 10);
  c.setInteractive({ useHandCursor: true });
  let down = false;
  c.on('pointerdown', () => { down = true; draw(true); t.y = 4; Sound.unlock(); });
  c.on('pointerout', () => { down = false; draw(false); t.y = 0; });
  c.on('pointerup', () => { if (!down) return; down = false; draw(false); t.y = 0; Sound.click(); onClick(); });
  c.setLabel = s => t.setText(s);
  c.label = t;
  return c;
}

/** 반투명 둥근 판 */
export function panel(scene, x, y, w, h, o = {}) {
  const g = scene.add.graphics();
  g.fillStyle(P.uiDark, o.shadow != null ? o.shadow : 0.35); g.fillRoundedRect(x - w / 2 + 4, y - h / 2 + 8, w, h, o.r || 24);
  g.fillStyle(o.color != null ? o.color : 0xffffff, o.alpha != null ? o.alpha : 1); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, o.r || 24);
  if (o.border !== false) { g.lineStyle(4, P.uiDark, 1); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, o.r || 24); }
  return g;
}

/** 화면 전체를 어둡게 덮고 뒤쪽 입력을 막음 */
export function dim(scene, W, H, alpha = 0.6, depth = 300) {
  const r = scene.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0x0b1020, alpha).setDepth(depth).setInteractive();
  return r;
}

/** 게임 방법 창 (HTML #help-overlay). 그림은 게임 텍스처를 그대로 가져다 씀 */
export function openHelp(textures) {
  const ov = document.getElementById('help-overlay');
  if (!ov) return;
  ov.querySelectorAll('img[data-tex]').forEach(img => {
    if (!img.getAttribute('src') && textures.exists(img.dataset.tex)) img.src = textures.getBase64(img.dataset.tex);
  });
  ov.style.display = 'flex';
  const body = ov.querySelector('.help-body');
  if (body) body.scrollTop = 0;
}

/** 게임 방법·도감 창 중 하나라도 떠 있으면 true (그동안 키보드로 씬이 넘어가지 않게) */
export const sheetOpen = () => [...document.querySelectorAll('.bw-sheet')].some(el => el.style.display === 'flex');

/** 오른쪽 위 HTML 버튼(일시정지·전체화면)이 캔버스에서 차지하는 폭·높이(논리 px).
 * 폰은 게임이 축소돼 같은 44px 버튼이 논리 좌표로 훨씬 넓음 → 고정값으로 두면 황금알 버튼이 가려짐 */
export function hudReserve(scene) {
  const stage = document.getElementById('bw-penguin-stage'), full = document.getElementById('btn-full');
  const cr = scene.game.canvas.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  if (!cr.width) return { w: 150, h: 60 };
  const k = (scene.scale.width / DPR) / cr.width;
  // penguin.css: 일시정지 right 12, 전체화면 right 64, 둘 다 폭·높이 44, top 10
  const span = (full && !full.classList.contains('hidden') ? 108 : 56) + 8;
  return { w: Math.max(0, span - (sr.right - cr.right)) * k, h: Math.max(0, 60 - (cr.top - sr.top)) * k };
}
