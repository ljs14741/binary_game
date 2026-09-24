/* 펭귄 도감 (HTML #dex-overlay). 수치는 config 에서 읽어 밸런스를 바꿔도 설명이 맞게 함 */
import * as C from '../core/config.js';
import { save } from '../meta/save.js';
import { T, fmt, num } from '../meta/i18n.js';

const D = T.dexText;
const PRED_KEYS = ['skua', 'seal', 'shark', 'bossSeal', 'bossBear', 'bossOrca'];
export const PET_KEYS = C.HATCH.filter(h => h.type === 'pet').map(h => h.key);

// 이 레벨을 깨면 황금알에서 나옴 / 이 레벨에서 처음 나옴 (1부터)
const hatchLevel = k => C.HATCH.findIndex(h => h.key === k) + 1;
const predFirst = k => C.LEVELS.findIndex(L => L.boss === k || (L.pred && L.pred.kinds.includes(k))) + 1;

const TEX = {
  penguin: k => k === 'gentoo' ? 'pg-gentoo-2-a' : `pg-${k}-a`,
  pet: k => `pet-${k}`,
  pred: k => k === 'skua' ? 'pr-skua-a' : `pr-${k}`
};

const isOpen = {
  penguin: k => !C.SPECIES[k].unlock || save.cleared >= C.SPECIES[k].unlock,
  pet: k => save.cleared >= hatchLevel(k),
  pred: k => save.cleared + 1 >= predFirst(k)
};

function petArgs(k) {
  const d = C.PETS[k];
  switch (k) {
    case 'puffer': return [d.every, d.stun];
    case 'whale': return [d.every, d.coins];
    case 'octopus': return [Math.round((1 - d.slow) * 100)];
    case 'seahorse': return [Math.round(d.luck * 100)];
    case 'starfish': return [Math.round(d.after)];
    default: return [d.every];
  }
}

export function predDesc(k) {
  const d = C.PREDATORS[k];
  return fmt(T.predDesc[k], d.dashEvery || d.guardEvery || '');
}

/** 도감 한 칸 정보. 레벨 카드의 그림 설명에도 씀 */
export function info(kind, k) {
  if (kind === 'penguin') {
    const s = C.SPECIES[k];
    return {
      name: T.reward[k] ? T.reward[k][0] : T.shop[k], desc: D.penguin[k],
      meta: fmt(D.price, num(s.price)) + ' · ' + (s.unlock ? fmt(D.shopAfter, s.unlock) : D.fromStart),
      lock: s.unlock ? fmt(D.unlockAt, s.unlock) : ''
    };
  }
  if (kind === 'pet') {
    const lv = hatchLevel(k);
    return { name: T.reward[k][0], desc: fmt(D.petDetail[k], ...petArgs(k)), meta: fmt(D.reward, lv), lock: fmt(D.unlockAt, lv) };
  }
  const d = C.PREDATORS[k], lv = predFirst(k);
  return {
    name: T.predNames[k], desc: predDesc(k),
    meta: fmt(D.hp, d.hp) + ' · ' + (d.boss ? fmt(D.bossAt, lv) : fmt(D.from, lv)),
    lock: fmt(D.meetAt, lv)
  };
}

// 판 특징 그림 (게임 텍스처 재활용)
const TRAIT_TEX = { current: 'pet-seahorse', feast: 'food-mackerel', lucky: 'coin-diamond', rapid: 'food-shrimp', goldTide: 'coin-gold', night: 'coin-pearl', horde: 'pr-shark' };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const srcCache = {};
const src = (textures, key) => srcCache[key] || (srcCache[key] = textures.exists(key) ? textures.getBase64(key) : '');

function row(img, name, meta, desc, locked) {
  return `<li class="dex-item${locked ? ' locked' : ''}"><img src="${img}" alt=""><div><b>${esc(name)}</b>` +
    `<small>${esc(meta)}</small>${desc ? `<p>${esc(desc)}</p>` : ''}</div></li>`;
}

function listHtml(textures, kind, keys) {
  return '<ul>' + keys.map(k => {
    const o = info(kind, k), open = isOpen[kind](k);
    return row(src(textures, TEX[kind](k)), open ? o.name : D.locked, open ? o.meta : o.lock, open ? o.desc : '', !open);
  }).join('') + '</ul>';
}

function itemsHtml(textures) {
  const F = C.FOOD, I = D.items;
  const args = {
    krill: [C.FOOD_PRICE], shrimp: [num(F[1].price), F[1].nutrition, F[1].satiety], mackerel: [num(F[2].price), F[2].nutrition, F[2].satiety, F[2].unlock],
    foodCount: [C.FOOD_COUNT_MAX, num(C.FOOD_COUNT_PRICE)], weapon: [C.WEAPON.length],
    silver: [C.COIN.silver.value], gold: [C.COIN.gold.value], pearl: [C.COIN.pearl.value], diamond: [C.COIN.diamond.value], chest: [], egg: [],
    otter: [C.HATCH.findIndex(h => h.key === 'otter') + 1, C.OTTER_PRICES.length]
  };
  const tex = { krill: 'food-krill', shrimp: 'food-shrimp', mackerel: 'food-mackerel', foodCount: 'food-krill', weapon: 'snowball', silver: 'coin-silver', gold: 'coin-gold', pearl: 'coin-pearl', diamond: 'coin-diamond', chest: 'coin-chest', egg: 'coin-egg', otter: 'pet-otter' };
  return `<p class="dex-note">${esc(D.itemNote)}</p><ul>` +
    Object.keys(I).map(k => row(src(textures, tex[k]), I[k][0], '', fmt(I[k][1], ...args[k]), false)).join('') + '</ul>' +
    `<p class="dex-note">${esc(D.traitNote)}</p><ul>` +
    Object.keys(T.traits).map(k => {
      const lv = C.LEVELS.map((L, i) => L.trait === k ? 'Lv' + (i + 1) : null).filter(Boolean).join('·');
      return row(src(textures, TRAIT_TEX[k]), T.traits[k][0], lv, T.traits[k][1], false);
    }).join('') + '</ul>';
}

function bodyHtml(textures, tab) {
  if (tab === 'penguin') return listHtml(textures, 'penguin', C.SHOP_SPECIES);
  if (tab === 'pet') return listHtml(textures, 'pet', PET_KEYS);
  if (tab === 'pred') return `<p class="dex-note">${esc(D.predNote)}</p><p class="dex-note">${esc(D.bossNote)}</p>` + listHtml(textures, 'pred', PRED_KEYS);
  return itemsHtml(textures);
}

export function openDex(textures, tab = 'penguin') {
  const ov = document.getElementById('dex-overlay');
  if (!ov) return;
  const got = C.SHOP_SPECIES.filter(isOpen.penguin).length + PET_KEYS.filter(isOpen.pet).length;
  ov.querySelector('.dex-count').textContent = fmt(D.count, got, C.SHOP_SPECIES.length + PET_KEYS.length);
  const tabs = ov.querySelector('.dex-tabs'), body = ov.querySelector('.dex-body');
  const render = t => {
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    body.innerHTML = bodyHtml(textures, t);
    body.scrollTop = 0;
  };
  tabs.innerHTML = Object.entries(D.tabs).map(([k, v]) => `<button type="button" role="tab" data-tab="${k}">${esc(v)}</button>`).join('');
  tabs.onclick = e => { const b = e.target.closest('button[data-tab]'); if (b) render(b.dataset.tab); };
  render(tab);
  ov.style.display = 'flex';
}
