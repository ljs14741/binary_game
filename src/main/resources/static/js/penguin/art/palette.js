/* 색과 선 굵기는 여기서만. 스타일: 플랫 + 진한 남색 외곽선 + 볼터치 */
export const INK = 0x1d2638;
export const LINE = 3;

export const P = {
  navy: 0x232a3f, navyHi: 0x39435f,
  belly: 0xffffff, bellyShade: 0xe3ecf5,
  beak: 0xff8a3d, beakLo: 0xe0652a, feet: 0xffa24a,
  cheek: 0xff9eb5,
  babyGray: 0x9aa6b5, babyHi: 0xc4ceda, babyDark: 0x6f7b8c,
  emperorBack: 0x33405a, emperorGold: 0xffc53d, emperorChest: 0xfff1b8,
  crest: 0xffd23f, crestLo: 0xff9d1c,

  water1: 0x7fd3f5, water2: 0x2f8fd0, water3: 0x145a9e,
  ice: 0xeaf7ff, iceShade: 0xb9ddf2, snow: 0xffffff,
  sand: 0xcfe3ee, sandLo: 0x9fc2d6,

  gold: 0xffc21a, goldHi: 0xffe680, goldLo: 0xd68f00,
  silver: 0xd5dde6, silverHi: 0xffffff, silverLo: 0x9aa6b5,
  pearl: 0xfff4fa, pearlLo: 0xf3c6dc,
  diamond: 0x7ef0ff, diamondLo: 0x2cb7d9,
  wood: 0xa8683a, woodLo: 0x7a4623,

  ui: 0xffffff, uiDark: 0x1d2638, accent: 0xffb400, good: 0x3cc47c, bad: 0xff5c7a, muted: 0x8a97ab
};

export const FONT = "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
export const css = n => '#' + n.toString(16).padStart(6, '0');

/** 세계(월드)별 물 색 */
export const WORLDS = [
  { top: 0x9be3fb, mid: 0x3aa5e0, deep: 0x1a6fb8, floor: 0xd6ecf5, floorLo: 0xa8cfe2, ice: 0xf2fbff, iceLo: 0xbfe3f5, sky: 0xcdefff },
  { top: 0x8fe6e0, mid: 0x2f9fb3, deep: 0x1c5f86, floor: 0xcfe0ee, floorLo: 0x98b8d6, ice: 0xe6f6ff, iceLo: 0xa6c8e8, sky: 0xb9d3ff },
  { top: 0x5fb8e8, mid: 0x1f6fb3, deep: 0x0d3a73, floor: 0x9ab7cc, floorLo: 0x6a8aa6, ice: 0xdaeefc, iceLo: 0x93b9d9, sky: 0x8fb3e8 }
];
