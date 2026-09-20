/* 이름은 여기서만 바꾼다. (사용자 결정 2026-09-18: 뿌셔뿌셔 리듬게임)
 * 값은 언어별로 i18n.js(T) 에서 온다 — 한국어 원본은 messages.properties 의 rhythm.js.brand 등. */
import { T } from './i18n.js';
export const BRAND = T.brand;
export const SUBTITLE = T.subtitle;
export const TITLE = `${BRAND} ${SUBTITLE}`;
export const SEO_TITLE = `${BRAND} 리듬게임 - 박자에 맞춰 다 부수는 무료 웹게임`;
export const SEO_DESC = '리듬을 듣고 똑같이 따라 쳐서 벽, 창문, 굴뚝을 다 부수는 무료 리듬게임. 설치 없이 PC와 모바일 브라우저에서 바로 플레이.';
// 로봇 이름. Beat(박자) = Bit(이진수) — 리듬게임이면서 바이너리월드라 둘 다 걸린다 (사용자 결정 2026-09-19).
// 화면 문구에서 로봇을 부를 땐 반드시 이 상수를 쓴다. 옛 "반장"(시범 보이는 공사장 반장)은 없앴다.
export const HERO = T.hero;
export const TOY_MODE = T.toyMode;  // 판정 없는 모드 (사용자 결정 2026-09-19. 처음엔 '그냥 뿌셔!')
