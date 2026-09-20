/* 화면 문구 (i18n).
 *
 * 템플릿(rhythm.html)이 messages*.properties 에서 읽어 window.RHYTHM_I18N 으로 넘긴다.
 * 없으면(단독 테스트 등) 아래 한국어 기본값. 문구를 고칠 땐 이 파일이 아니라 properties 를 고친다.
 * 언어는 주소가 정한다 (/rhythm 한국어, /en/rhythm, /ja/rhythm). 브라우저 언어는 안 본다.
 *
 * 다른 게임(경마·핀볼 등)은 파일 하나라 T 를 파일 위에 두면 됐지만, 여기는 ES 모듈이 30개라
 * 이 모듈 하나를 각 씬이 import 한다. brand.js 의 BRAND·HERO 도 여기서 읽는다.
 */
export const T = Object.assign({
  // 이름 (brand.js 가 다시 내보낸다)
  brand: '뿌셔뿌셔',
  subtitle: '리듬게임',
  hero: '비트',
  toyMode: '스트레스 뿌셔뿌셔!',
  // Title
  tagline: '리듬을 듣고, 똑같이 뿌셔!',
  start: '시작하기',
  calib: '타이밍 보정',
  soundOn: '소리 켬',
  soundOff: '소리 끔',
  touchHint: '화면을 터치하면 음악이 시작돼요',
  medalGold: '금메달', medalSilver: '은메달', medalBronze: '동메달', medalNone: '메달 없음',
  // keys
  keysTouch: '아무 키나 · 또는 화면 터치',
  keysTip: '빠른 구간은 D F · J K 양손으로 번갈아',
  // WorldMap
  world1: '월드 1 · 벽돌집',
  medals: '메달 {0} / {1}  ·  {2}',
  hard: '하드모드', normal: '노멀',
  toyDesc: '판정 없이 마음껏 부수기',
  best: '최고 {0}점',
  lockPrev: '앞 스테이지에서 메달을 따면 열려요',
  lockAll: '네 스테이지 모두 메달을 따면 열려요',
  hardOn: '하드모드 ON  (BPM +20% · 목숨 1개 · 힌트 없음)',
  hardOff: '하드모드 OFF',
  toTitle: '처음으로',
  // 스테이지 이름 · 배우는 것
  stageWall: '벽 부수기', stageWindow: '창문 깨기', stageChimney: '굴뚝 무너뜨리기', stageNails: '판자 뜯기', stageRemix: '리믹스: 집 한 채 통째로',
  learnWall: '기본 4비트', learnWindow: '더블 "촥촥"', learnChimney: '엇박', learnNails: '8분 연타', learnRemix: '전부 섞어서',
  // StageScene 배너·팝업
  ready: '준비!',
  listen: '잘 들어!',
  smash: '부숴!',
  allSmashed: '다 뿌셨다!',
  whiff: '헛스윙!',
  failed: '뿌셔 실패!',
  toyBanner: '마음껏 부숴!',
  goodEarly: 'GOOD ▲빠름', goodLate: 'GOOD ▼늦음', tooEarly: '너무 빨라!', tooLate: '너무 늦어!',
  // Result
  msgS: '완벽하게 뿌셨다! {0}가 신났어요', msgA: '거의 완벽! 벽이 남아나질 않네', msgB: '리듬감 있네요! 조금만 더!', msgC: '벽이 반쯤 남았어요. 다시!', msgD: '{0}가 한숨을 쉬어요…',
  livesLost: '목숨을 다 잃었어요',
  fail: '실패',
  stoppedAt: '{0}번째에서 멈췄어요. 뿌신 비율 {1}%\n다시 도전!',
  retry: '다시 도전',
  worldMap: '월드맵',
  points: '{0}점',
  whiffs: '헛스윙 {0}',
  stats: '정확도 {0}% · 최대 {1}콤보 · 뿌신 비율 {2}%',
  newRecord: '새 기록!',
  next: '다음: {0} {1}',
  again: '다시하기',
  // Calib
  calibTitle: '타이밍 보정',
  calibDesc: '블루투스 이어폰처럼 소리가 늦게 들릴 때 한 번만.\n1초 간격 틱 소리에 맞춰 8번 탭(스페이스)하세요.',
  calibIdle: '시작을 누르면 예비 박자 4번 후 측정',
  calibPre: '예비 박자 {0}',
  calibFew: '탭이 부족해요. 다시 시도!',
  calibDone: '측정 완료!',
  calibResult: '측정된 지연: {0}ms',
  calibNone: '거의 없음. 저장 안 해도 돼요',
  calibLate: '탭이 소리보다 늦게 들어와요. 저장하면 보정됩니다',
  calibEarly: '탭이 소리보다 빨라요. 저장하면 보정됩니다',
  calibStart: '시작',
  calibSave: '이 값으로 저장',
  calibReset: '초기화',
  back: '돌아가기',
  calibCurrent: '현재 보정값: {0}',
  auto: '자동',
}, (typeof window !== 'undefined' && window.RHYTHM_I18N) || {});

/** '{0} {1}' 자리에 값을 넣는다. */
export function fmt(t, ...v) { return t.replace(/\{(\d)\}/g, (_, i) => String(v[i])); }
