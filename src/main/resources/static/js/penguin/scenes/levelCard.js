/* 레벨 안내 카드. 지도에서 레벨을 눌렀을 때와 판 시작 전에 같은 카드를 씀 */
import * as C from '../core/config.js';
import { unlocksFor } from '../core/sim.js';
import { save, medalOf } from '../meta/save.js';
import { T, fmt, mmss } from '../meta/i18n.js';
import { P, css, INK } from '../art/palette.js';
import { button, text, panel, dim, openHelp } from './ui.js';
import { openDex, info } from './dex.js';

export const MEDAL_COLOR = { gold: 0xffc21a, silver: 0xb9c6d8, bronze: 0xe0925f };
export const medalName = m => T['medal' + m[0].toUpperCase() + m.slice(1)];

const fit = (img, size) => img.setScale(Math.min(1, size / Math.max(img.width, img.height)));

/** 앞 레벨 최고 기록 메달에 따라 이번 판 시작 코인 보너스. 없으면 null */
export function startBonus(idx) {
  if (idx <= 0) return null;
  const prev = C.LEVELS[idx - 1], medal = medalOf(idx - 1, save.best[idx - 1], prev.par);
  const rate = medal && C.MEDAL_BONUS[medal];
  return rate ? { medal, coins: Math.round(C.LEVELS[idx].money * rate / 10) * 10 } : null;
}

/**
 * buttons: [{ label, onClick, primary }] 한 줄로 나란히. o.back 이 있으면 아래에 돌아가기 버튼.
 * 닫는 함수를 돌려줌
 */
export function levelCard(scene, idx, buttons, o = {}) {
  const W = scene.W, H = scene.H, L = C.LEVELS[idx];
  const d = 302, pw = Math.min(480, W - 32), inner = pw - 56;
  const items = [];
  const add = obj => { items.push(obj); return obj; };
  const rows = [];
  const row = (h, draw) => rows.push({ h, draw });
  const label = (y, str) => add(text(scene, W / 2, y, str, { size: 14, color: '#7a879c', stroke: false }).setDepth(d));

  // 그림을 누르면 이름·설명 말풍선
  let tipObjs = null;
  const clearTip = () => { if (tipObjs) tipObjs.forEach(o => o.destroy()); tipObjs = null; };
  const showTip = (x, y, kind, k) => {
    clearTip();
    const o = info(kind, k);
    const t = text(scene, 0, 0, `${o.name}\n${o.desc}`, { size: 15, color: '#ffffff', stroke: false, wrap: Math.min(300, inner) }).setDepth(d + 11);
    const tx = Math.max(W / 2 - pw / 2 + t.width / 2 + 12, Math.min(W / 2 + pw / 2 - t.width / 2 - 12, x));
    t.setPosition(tx, y - 34 - t.height / 2);
    const g = scene.add.graphics().setDepth(d + 10);
    g.fillStyle(INK, 0.94); g.fillRoundedRect(tx - t.width / 2 - 12, t.y - t.height / 2 - 8, t.width + 24, t.height + 16, 12);
    tipObjs = [g, t];
    items.push(g, t);
    scene.time.delayedCall(3200, () => { if (tipObjs && tipObjs[1] === t) clearTip(); });
  };
  const tappable = (img, kind, k) => img.setInteractive({ useHandCursor: true }).on('pointerup', () => showTip(img.x, img.y - img.displayHeight / 2, kind, k));

  row(48, y => add(text(scene, W / 2, y + 22, fmt(T.levelName, idx + 1, T.worlds[L.world]), { size: 30, color: css(P.uiDark), stroke: false }).setDepth(d)));
  const best = save.best[idx];
  if (best != null) row(28, y => add(text(scene, W / 2, y + 12, fmt(T.best, mmss(best)) + ' · ' + medalName(medalOf(idx, best, L.par)), { size: 17, color: '#4b5870', stroke: false }).setDepth(d)));
  row(L.boss ? 56 : 36, y => add(text(scene, W / 2, y + (L.boss ? 26 : 16), L.boss ? T.goalBoss : T.goal, { size: 18, color: css(P.uiDark), stroke: false, wrap: inner }).setDepth(d)));
  if (L.trait) {
    const tr = T.traits[L.trait];
    row(58, y => {
      const g = add(scene.add.graphics().setDepth(d));
      g.fillStyle(0xfff3c4, 1); g.fillRoundedRect(W / 2 - inner / 2, y + 4, inner, 50, 12);
      add(text(scene, W / 2, y + 18, `${T.traitTitle} · ${tr[0]}`, { size: 16, color: '#b36b00', stroke: false }).setDepth(d));
      add(text(scene, W / 2, y + 40, tr[1], { size: 14, color: '#4b5870', stroke: false, wrap: inner - 16 }).setDepth(d));
    });
  }
  const bonus = o.bonus !== false && startBonus(idx);
  if (bonus) row(26, y => add(text(scene, W / 2, y + 12, fmt(T.bonusLine, medalName(bonus.medal), bonus.coins), { size: 15, color: '#c77d00', stroke: false, wrap: inner }).setDepth(d)));

  // 이번 판 천적 (보스 포함)
  const kinds = [...(L.pred ? L.pred.kinds : [])];
  if (L.boss) kinds.push(L.boss);
  row(24, y => label(y + 12, T.predTitle));
  if (kinds.length) {
    row(94, y => {
      const step = Math.min(120, inner / kinds.length);
      kinds.forEach((k, i) => {
        const x = W / 2 + (i - (kinds.length - 1) / 2) * step, boss = !!C.PREDATORS[k].boss;
        tappable(add(fit(scene.add.image(x, y + 36, k === 'skua' ? 'pr-skua-a' : `pr-${k}`), boss ? 68 : 58).setDepth(d)), 'pred', k);
        add(text(scene, x, y + 82, (boss ? T.boss + ' ' : '') + T.predNames[k], { size: 14, color: boss ? '#c0392b' : '#4b5870', stroke: false }).setDepth(d));
      });
    });
  } else row(30, y => add(text(scene, W / 2, y + 14, T.noPred, { size: 16, color: '#4b5870', stroke: false }).setDepth(d)));

  // 같이 하는 펭귄·친구. 바로 앞 레벨에서 나온 건 노란 동그라미로 표시
  const u = unlocksFor(idx);
  const who = [...[...u.species].map(k => ['penguin', k]), ...u.pets.map(k => ['pet', k])];
  const icons = who.map(([kind, k]) => kind === 'pet' ? `pet-${k}` : k === 'gentoo' ? 'pg-gentoo-2-a' : `pg-${k}-a`);
  if (icons.length > 1) {
    const h = idx > 0 ? C.HATCH[idx - 1] : null;
    const newest = h ? (h.type === 'pet' ? `pet-${h.key}` : `pg-${h.key}-a`) : null;
    const per = Math.min(icons.length, 8), size = Math.min(50, inner / per), lines = Math.ceil(icons.length / per);
    row(24, y => label(y + 12, T.friendsTitle + ' · ' + T.tapIcon));
    row(lines * size + 8, y => icons.forEach((key, i) => {
      const r = Math.floor(i / per), c = i % per, n = Math.min(per, icons.length - r * per);
      const x = W / 2 + (c - (n - 1) / 2) * size, cy = y + 4 + size / 2 + r * size;
      if (key === newest) add(scene.add.circle(x, cy, size / 2 - 1, 0xffe680, 1).setDepth(d));
      tappable(add(fit(scene.add.image(x, cy, key), size - 8).setDepth(d)), ...who[i]);
    }));
  }

  // 메달 기준 + 실패 조건
  row(10, () => {});
  for (const [m, sec] of [['gold', L.par], ['silver', L.par * 1.5]]) {
    row(28, y => {
      const t = add(text(scene, 0, y + 14, `${medalName(m)}  ${fmt(T.medalWithin, mmss(sec))}`, { size: 18, ox: 0, color: css(P.uiDark), stroke: false }).setDepth(d));
      const x0 = W / 2 - (t.width + 26) / 2;
      t.x = x0 + 26;
      const g = add(scene.add.graphics().setDepth(d));
      g.fillStyle(INK, 1); g.fillCircle(x0 + 9, y + 14, 10);
      g.fillStyle(MEDAL_COLOR[m], 1); g.fillCircle(x0 + 9, y + 14, 8);
    });
  }
  row(26, y => add(text(scene, W / 2, y + 13, T.medalNote, { size: 14, color: '#6b778c', stroke: false, wrap: inner }).setDepth(d)));
  row(30, y => add(text(scene, W / 2, y + 15, T.failNote, { size: 15, color: '#c0392b', stroke: false, wrap: inner }).setDepth(d)));

  // 버튼
  row(86, y => {
    const n = buttons.length, bw = (pw - 60 - (n - 1) * 12) / n;
    buttons.forEach((b, i) => add(button(scene, W / 2 - (pw - 60) / 2 + bw / 2 + i * (bw + 12), y + 44, b.label, b.onClick,
      { primary: b.primary, w: bw, h: 62, size: n > 1 ? 22 : 28, depth: d })));
  });
  // 맨 아래 줄: 도감 · (돌아가기) · 게임 방법. 위쪽 모서리는 폰에서 HTML 전체화면 버튼과 겹쳐서 아래에 둠
  row(62, y => {
    const bw = (pw - 60 - 24) / 3;
    add(button(scene, W / 2 - bw - 12, y + 32, T.dex, () => openDex(scene.textures), { w: bw, h: 46, size: 17, depth: d }));
    if (o.back) add(button(scene, W / 2, y + 32, T.back, o.back, { w: bw, h: 46, size: 17, depth: d }));
    add(button(scene, W / 2 + bw + 12, y + 32, T.help, () => openHelp(scene.textures), { w: bw, h: 46, size: 17, depth: d }));
  });

  const ph = 30 + rows.reduce((s, r) => s + r.h, 0);
  // 화면(작은 폰은 논리 세로 760)보다 길면 가운데 기준으로 통째로 줄임
  const k = Math.min(1, (H - 16) / ph);
  const top = k < 1 ? H / 2 - ph / 2 : Math.max(12, H / 2 - ph / 2);
  add(dim(scene, W, H, 0.55, 300));
  add(panel(scene, W / 2, top + ph / 2, pw, ph).setDepth(301));
  let y = top + 14;
  for (const r of rows) { r.draw(y); y += r.h; }
  if (k < 1) for (const obj of items) {
    obj.x = W / 2 + (obj.x - W / 2) * k; obj.y = H / 2 + (obj.y - H / 2) * k;
    obj.setScale(obj.scaleX * k, obj.scaleY * k);
  }

  return () => items.forEach(obj => obj.destroy());
}
