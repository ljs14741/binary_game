/* keys.js — 조작법 안내. 키캡 그림 한 줄 + 설명 한 줄.
 *
 * 처음엔 제목 화면 맨 아래에 "PC: 스페이스바 · 모바일: 화면 터치" 한 줄뿐이었다.
 * 그래서 D F J K 로도 칠 수 있다는 걸 나중에야 알았다는 말이 나왔다 (사용자, 2026-09-19).
 * 빠른 구간은 양손으로 번갈아 치는 게 훨씬 편해서, 이걸 아느냐 모르느냐가 게임 체감을 가른다.
 * 제목 화면과 스테이지 시작 부분 양쪽에서 이 그림을 쓴다.
 *
 * 좌표는 논리 좌표. HUD(scrollFactor 0) 로 쓰려면 호출 쪽이 hud() 로 변환한 좌표를 넘긴다. */
import { FONT, P, css } from '../art/palette.js';
import { T } from '../meta/i18n.js';

const CAP_H = 44, GAP = 8, R = 8;

// 키캡 하나. 흰 바탕 + 잉크 외곽선 + 아래 그림자 (ui.js 버튼과 같은 문법)
function cap(scene, c, x, y, label, w) {
  const sh = scene.add.rectangle(x, y + 4, w, CAP_H, 0xbbbbbb).setStrokeStyle(3, P.uiDark);
  const bg = scene.add.rectangle(x, y, w, CAP_H, 0xffffff).setStrokeStyle(3, P.uiDark);
  const t = scene.add.text(x, y, label, { fontFamily: FONT, fontSize: '18px', fontStyle: '800', color: css(P.uiDark) }).setOrigin(0.5);
  c.add([sh, bg, t]);
  return w;
}

/**
 * 키 안내 컨테이너를 만든다. 가운데 정렬.
 *   [SPACE]  [D][F][J][K]   또는 화면 터치
 *   양손으로 번갈아 치면 빠른 구간이 편해요
 * @param {object} o  { touch: 터치 안내 포함 여부(기본 true), tip: 두 번째 줄 문구(기본 있음), scale }
 */
export function keyHint(scene, x, y, o = {}) {
  const c = scene.add.container(x, y);
  const items = [['SPACE', 110], ['D', 48], ['F', 48], ['J', 48], ['K', 48]];
  const total = items.reduce((s, [, w]) => s + w, 0) + GAP * (items.length - 1) + GAP * 2;   // SPACE 와 DFJK 사이 한 칸 더
  let cx = -total / 2;
  items.forEach(([label, w], i) => {
    if (i === 1) cx += GAP * 2;
    cap(scene, c, cx + w / 2, 0, label, w);
    cx += w + GAP;
  });
  if (o.touch !== false) {
    c.add(scene.add.text(0, CAP_H / 2 + 22, T.keysTouch, { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#fff', stroke: css(P.uiDark), strokeThickness: 4 }).setOrigin(0.5));
  }
  if (o.tip !== false) {
    c.add(scene.add.text(0, CAP_H / 2 + 46, T.keysTip, { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: css(P.accent), stroke: css(P.uiDark), strokeThickness: 4 }).setOrigin(0.5));
  }
  if (o.scale) c.setScale(o.scale);
  return c;
}
