/* 밸런스 숫자는 전부 여기. 시간 단위는 초, 거리 단위는 논리 px.
 * 시뮬레이션(sim.js)과 화면(scenes)이 같이 읽고, 밸런스 테스트(scratch)도 이 파일만 바꿔가며 돌림.
 */

export const FOOD_PRICE = 5;
export const FOOD_SINK = 70;              // 먹이 가라앉는 속도
export const FOOD_FLOOR_LIFE = 2.5;       // 바닥에 닿고 사라지기까지
export const FOOD_COUNT_MAX = 10;         // 동시에 떠 있을 수 있는 먹이 최대
export const FOOD_COUNT_PRICE = 200;

// 먹이 등급. nutrition 은 성장치, satiety 는 배부름 추가 시간
export const FOOD = [
  { key: 'krill', nutrition: 1, satiety: 0 },
  { key: 'shrimp', nutrition: 2, satiety: 4, price: 250 },
  { key: 'mackerel', nutrition: 3, satiety: 8, price: 1200, unlock: 5 }
];

// 눈덩이(무기). 탭 한 번 피해량
export const WEAPON = [
  { dmg: 1 },
  { dmg: 1.6, price: 250 },
  { dmg: 2.4, price: 700 },
  { dmg: 3.4, price: 1600 },
  { dmg: 4.8, price: 3500 },
  { dmg: 6.6, price: 7000 },
  { dmg: 9, price: 13000 }
];

// 배고픔: seek 부터 먹이를 찾고, starve 부터 파랗게 질리고, die 에 죽음
export const HUNGER = { seek: 9, babySeek: 4.5, starve: 18, die: 27 };

// 게임 계산은 200마리도 한 프레임 0.02ms. 폰은 어른 60마리쯤이면 물이 꽉 차서 넓은 화면까지 채우게 100
export const MAX_PENGUINS = 100;
export const EMPEROR_LAY_CAP = 20;      // 젠투가 이만큼 있으면 황제펭귄이 알을 안 낳음

export const COIN = {
  silver: { value: 15, sink: 42 },
  gold: { value: 35, sink: 42 },
  pearl: { value: 150, sink: 36 },
  diamond: { value: 400, sink: 32 },
  chest: { value: 0, sink: 55 }       // 천적 보상, 값은 천적마다
};
export const COIN_FLOOR_LIFE = 6;       // 바닥에 닿고 사라지기까지

/* 펭귄 종류. r 은 충돌 반경.
 * 젠투는 먹어서 자람: 아기(0) → 꼬마(1) → 어른(2). growth 는 단계별 필요 성장치 누계.
 */
export const SPECIES = {
  gentoo: { price: 100, speed: 62, r: [22, 30, 38], growth: [0, 2, 6], drop: [null, 'silver', 'gold'], dropEvery: 10 },
  chinstrap: { price: 700, speed: 115, r: 33, collector: true, unlock: 2 },
  emperor: { price: 1500, speed: 50, r: 49, drop: 'pearl', dropEvery: 18, layEvery: 45, unlock: 4 },
  macaroni: { price: 2500, speed: 95, r: 36, drop: 'silver', dropEvery: 11, fighter: true, dmg: 1.2, hitEvery: 0.6, unlock: 6 },
  rainbow: { price: 7000, speed: 62, r: 39, drop: 'diamond', dropEvery: 21, unlock: 10 }
};
export const SHOP_SPECIES = ['gentoo', 'chinstrap', 'emperor', 'macaroni', 'rainbow'];

// 천적. reward 는 쓰러뜨리면 떨구는 보물상자 값
/* 체력: 2026-09-24 사용자 피드백 "너무 쉽게 죽음" → 일반 약 1.5배, 보스 약 1.65배.
 * 움직임: skua 는 수면 위를 돌다 급강하(dive), seal 은 지그재그(zigzag), shark 는 빙빙 돌다 겨냥 → 직선 돌격(charge).
 * aimFor 는 돌진 전 빨간 예고선 시간. rageAt 대 맞으면 잠깐 화나서 빨라지고 안 밀림 */
export const PREDATORS = {
  skua: { hp: 10, speed: 105, r: 39, reward: 150, dive: [2.2, 3.4], diveMul: 2.3 },
  seal: { hp: 27, speed: 88, r: 52, reward: 350, zigzag: 70, rageAt: 6 },
  shark: { hp: 52, speed: 104, r: 60, reward: 700, chargeEvery: 3.4, aimFor: 0.6, chargeFor: 0.8, chargeMul: 3.2, rageAt: 7 },
  bossSeal: { hp: 140, speed: 80, r: 62, boss: true, dashEvery: 4.5, dashFor: 0.9, dashMul: 2.8, aimFor: 0.5, bounce: true, rageAt: 9 },
  bossBear: { hp: 250, speed: 74, r: 68, boss: true, guardEvery: 5, guardFor: 1.8, throwEvery: 5.5, freeze: 2, rageAt: 10 },
  bossOrca: { hp: 380, speed: 96, r: 72, boss: true, dashEvery: 3.6, dashFor: 1.0, dashMul: 3.0, summonAt: 0.5, diveEvery: 8, diveFor: 2.2, rageAt: 12 }
};
export const PREDATOR_WARN = 3;         // 등장 예고
// 눈덩이에 맞으면 밀리는 세기. 연달아 맞을수록 덜 밀림 (예전엔 일반 160·보스 60 이라 톡톡만 해도 계속 밀려났음)
export const KNOCK = { normal: 55, boss: 18, combo: 0.6, window: 0.8 };
export const RAGE = { for: 1.4, mul: 1.7 };

/* 친구(펫). 레벨을 깨면 알에서 나와서 다음 레벨부터 계속 같이 다님 */
export const PETS = {
  crab: {},                               // 바닥에 떨어진 코인 줍기
  otter: { every: 11 },                   // 제일 배고픈 펭귄 위에 공짜 먹이
  puffer: { every: 5, stun: 1.6 },        // 천적 기절
  whale: { every: 32, coins: 6 },         // 은화 뿜기
  clam: { every: 26 },                    // 진주 만들기
  octopus: { slow: 0.65 },                // 먹물로 천적 느리게
  dolphin: { every: 40 },                 // 잡아먹히기 직전 한 마리 구하기
  seahorse: { luck: 0.15 },               // 코인 두 배 확률
  jelly: { every: 1.4, dmg: 1 },          // 천적 감전
  starfish: { after: 2.2 }                // 오래 떠 있는 코인 자동 수거
};

/* 레벨을 깨면 황금알에서 나오는 것. 레벨 번호(1~15) 순서 */
export const HATCH = [
  { type: 'pet', key: 'crab' },
  { type: 'species', key: 'chinstrap' },
  { type: 'pet', key: 'otter' },
  { type: 'species', key: 'emperor' },
  { type: 'pet', key: 'puffer' },
  { type: 'species', key: 'macaroni' },
  { type: 'pet', key: 'whale' },
  { type: 'pet', key: 'clam' },
  { type: 'pet', key: 'octopus' },
  { type: 'species', key: 'rainbow' },
  { type: 'pet', key: 'dolphin' },
  { type: 'pet', key: 'seahorse' },
  { type: 'pet', key: 'jelly' },
  { type: 'pet', key: 'starfish' },
  { type: 'trophy', key: 'trophy' }
];

/* 레벨. eggs 는 황금알 조각 세 개 값. 보스 레벨은 조각 두 개를 사면 보스가 오고, 쓰러뜨리면 마지막 조각을 떨굼.
 * trait 은 판 특징(TRAITS). pred.first 첫 침입 시각, pred.every 다음 침입까지 [최소, 최대], pred.kinds 나올 수 있는 천적.
 * par 는 금메달 기준 시간(초). 은메달은 1.5배, 그 뒤로는 동메달.
 * 2026-09-24 판 길이 단축 + 판 특징·이벤트·새 천적·체력 상향 반영: 봇 합계 약 90분 (사람 약 1.9시간).
 * 조각 값은 봇 조정. 첫 조각 ≥ 펭귄 3마리 값, 일반 판끼리 (코인값 배율 감안) 오름차순. par 는 판별 봇 시간 올림
 */
export const LEVELS = [
  { world: 0, money: 250, start: 2, eggs: [300, 600, 900], pred: null, par: 210 },
  { world: 0, money: 300, start: 3, eggs: [350, 700, 1050], pred: { first: 150, every: [110, 150], kinds: ['skua'] }, par: 210 },
  { world: 0, money: 300, start: 3, eggs: [400, 800, 1200], pred: { first: 120, every: [95, 130], kinds: ['skua', 'seal'] }, trait: 'current', par: 270 },
  { world: 0, money: 350, start: 3, eggs: [450, 950, 1400], pred: { first: 110, every: [90, 120], kinds: ['skua', 'seal'] }, trait: 'feast', par: 240 },
  { world: 0, money: 350, start: 3, eggs: [500, 950, 0], pred: { first: 100, every: [90, 120], kinds: ['skua', 'seal'] }, boss: 'bossSeal', par: 270 },
  { world: 1, money: 400, start: 4, eggs: [650, 1350, 2000], pred: { first: 100, every: [85, 115], kinds: ['seal'] }, trait: 'lucky', par: 330 },
  { world: 1, money: 400, start: 4, eggs: [800, 1600, 2400], pred: { first: 95, every: [80, 110], kinds: ['seal', 'skua'] }, trait: 'rapid', par: 360 },
  { world: 1, money: 450, start: 4, eggs: [1650, 3200, 4850], pred: { first: 90, every: [80, 105], kinds: ['seal', 'shark'] }, trait: 'goldTide', par: 390 },
  { world: 1, money: 450, start: 4, eggs: [1150, 2350, 3550], pred: { first: 90, every: [75, 100], kinds: ['seal', 'shark'] }, trait: 'horde', par: 420 },
  { world: 1, money: 500, start: 4, eggs: [1250, 2450, 0], pred: { first: 90, every: [75, 100], kinds: ['seal', 'shark'] }, boss: 'bossBear', par: 360 },
  { world: 2, money: 500, start: 5, eggs: [2250, 4500, 6800], pred: { first: 85, every: [70, 95], kinds: ['shark', 'seal'] }, trait: 'night', par: 420 },
  { world: 2, money: 550, start: 5, eggs: [2100, 4150, 6250], pred: { first: 85, every: [70, 95], kinds: ['shark', 'seal'] }, trait: 'current', par: 480 },
  { world: 2, money: 550, start: 5, eggs: [4850, 9650, 14500], pred: { first: 80, every: [65, 90], kinds: ['shark', 'seal', 'skua'] }, trait: 'goldTide', par: 450 },
  { world: 2, money: 600, start: 5, eggs: [3300, 6650, 9950], pred: { first: 80, every: [60, 85], kinds: ['shark', 'seal'] }, trait: 'horde', par: 660 },
  { world: 2, money: 600, start: 5, eggs: [3500, 7000, 0], pred: { first: 80, every: [60, 85], kinds: ['shark', 'seal'] }, boss: 'bossOrca', par: 600 }
];

// 상점에서 더 사는 해달 (Lv3 클리어 후). 한 마리가 펭귄 1~2마리 먹이를 챙김
export const OTTER_PRICES = [600, 900, 1300, 1800];

/* 판 특징. 레벨마다 규칙 하나를 비틂 (좋은 점과 나쁜 점을 같이) */
export const TRAITS = {
  current: { drift: 38 },                         // 해류: 먹이·코인이 옆으로 흘러감
  feast: { hunger: 1.3, drop: 0.8 },              // 폭식: 빨리 배고픔, 대신 코인 자주
  lucky: { luck: 0.2 },                           // 행운의 날: 코인 20% 확률로 두 배
  rapid: { sink: 1.7, value: 1.15 },              // 급류: 먹이가 빨리 가라앉음, 대신 코인 조금 비쌈
  goldTide: { value: 1.5, floorLife: 3 },         // 황금 조류: 코인 1.5배, 대신 바닥에서 3초면 사라짐
  night: { value: 1.3, dark: 0.55 },              // 한밤: 어두움, 대신 코인 1.3배
  horde: { pair: true, every: 1.35, reward: 1.5 } // 떼거리: 천적이 둘씩, 대신 덜 자주·보상 1.5배
};

/* 깜짝 이벤트 (Lv2 부터, 천적·보스 없을 때). rain 코인 비 / chest 떠내려오는 보물상자 / krill 황금 크릴 */
export const EVENTS = { first: [40, 60], every: [55, 85], rainFor: 6, rainEvery: 0.3, chestFloat: 6, chest: 0.5 };

// 메달 보너스: 앞 레벨 최고 기록이 금/은이면 이번 판 시작 코인을 레벨 기본값의 이 비율만큼 더 줌
export const MEDAL_BONUS = { gold: 0.5, silver: 0.25 };

// 테스트용 시작 코인. 0 이면 레벨 기본값. ★ 배포 전 반드시 0
export const TEST_MONEY = 0;

// 천적 체력·보상은 레벨이 오를수록 조금씩 강해짐
export function predScale(levelIdx) { return 1 + levelIdx * 0.06; }
