/* 아트 규칙 한 장. 모든 그림은 여기 색과 선 굵기만 쓴다.
 * 스타일: 플랫 + 2톤 명암 + 진한 외곽선. (Kenney 류 무료 에셋과 같은 계열)
 */
export const INK = 0x2b2733;          // 외곽선
export const LINE = 4;                // 외곽선 굵기(px, 텍스처 기준)
export const P = {
  bg1: 0x3b3550, bg2: 0x22202c,       // 실내 어둠
  wallpaper: 0x6b5f7a, wallpaperDark: 0x574c66, wallpaperStripe: 0x7d7190,
  floor: 0x8a5a3c, floorDark: 0x6e4630, floorLine: 0x4f3222,
  brick: 0xd9694f, brickHi: 0xf0876c, brickLo: 0xb04f3a, mortar: 0xe8d9c8,
  bot: 0xffb400, botHi: 0xffd45c, botLo: 0xd18f00,
  helmet: 0xfff1c9, helmetLo: 0xd9c9a0,
  led: 0x1a1720, ledOn: 0x5cf0ff, ledOff: 0x26313a,
  hammerHead: 0x8f96a3, hammerHi: 0xc3c9d4, hammerLo: 0x5f6673, handle: 0x9c6b3f,
  chalk: 0xfff7d6, chalkBad: 0xff5c7a,
  dust: 0xc9b8a8, ring: 0xffffff,
  ui: 0xffffff, uiDark: 0x2b2733, accent: 0xffb400, good: 0x3cb371, perfect: 0xffb400, miss: 0xff5c7a, whiff: 0x9a9aa8
};
export const FONT = "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
export const css = n => '#' + n.toString(16).padStart(6, '0');
