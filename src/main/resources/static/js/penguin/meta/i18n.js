/* 화면 문구. 템플릿이 window.PENGUIN_I18N 을 넘기면 그걸 쓰고, 없으면 아래 한국어 기본값.
 * 영어·일본어판을 열 때는 messages*.properties 에 penguin.js.* 키를 만들어 템플릿에서 넘기면 됨 (리듬게임과 같은 방식).
 */
export const T = Object.assign({
  title: '펭귄 키우기',
  subtitle: '남극 수족관',
  tagline: '크릴 주고, 코인 줍고, 천적은 눈덩이로!',
  start: '시작하기',
  soundOn: '소리 켬', soundOff: '소리 끔', musicOff: '배경음 끔',
  map: '지도', back: '돌아가기',
  continue: '이어서 하기',
  help: '게임 방법',
  dex: '도감',
  mapHint: '동그라미를 눌러서 레벨을 골라요',
  nextHere: '눌러서 시작!',

  worlds: ['얼음 연못', '빙하 동굴', '깊은 바다'],
  level: 'Lv{0}',
  levelName: 'Lv{0} · {1}',
  boss: '보스',
  play: '시작', resume: '이어하기', restart: '처음부터',
  best: '최고 기록 {0}',
  goal: '황금알 조각 3개를 모으면 클리어!',
  goalBoss: '조각 2개를 사면 보스가 와요. 쓰러뜨리면 마지막 조각!',
  newFriend: '새로 나온 것',
  lockedLevel: '앞 레벨을 깨면 열려요',
  medalGold: '금메달', medalSilver: '은메달', medalBronze: '동메달',
  medalWithin: '{0} 안에 클리어',
  medalNote: '시간 제한은 없어요 · 빨리 깰수록 좋은 메달 (그 뒤는 동메달)',
  failNote: '실패: 펭귄이 모두 떠나고 코인도 없을 때',
  predTitle: '이번 판 천적',
  noPred: '천적이 안 와요 · 펭귄 키우기에 집중!',
  friendsTitle: '함께하는 펭귄·친구',
  tapIcon: '그림을 누르면 설명',
  go: '시작!',
  traitTitle: '이번 판 특징',
  traits: {
    current: ['해류', '먹이와 코인이 옆으로 흘렀다 돌아와요'],
    feast: ['폭식', '펭귄이 빨리 배고파져요. 대신 코인을 더 자주 떨궈요'],
    lucky: ['행운의 날', '코인이 20% 확률로 두 배!'],
    rapid: ['급류', '먹이가 빨리 가라앉아요. 대신 코인값이 조금 올라요'],
    goldTide: ['황금 조류', '코인값 1.5배! 대신 바닥에서 금방 사라져요'],
    night: ['한밤', '어두워서 펭귄이 잘 안 보여요. 대신 코인값 1.3배'],
    horde: ['떼거리', '천적이 둘씩 와요. 대신 덜 자주 오고 보물상자가 커요']
  },
  events: { rain: '코인 비가 쏟아져요!', chest: '보물상자가 떠내려와요! 톡!', krill: '황금 크릴! 먹으면 바로 어른' },
  rage: '화났다!', dodge: '잠수 중!', frozen: '얼었다!', goldenGrow: '황금 크릴로 쑥!',
  bonusLine: '앞 레벨 {0} 보너스 +{1}코인으로 시작!',
  bonusBanner: '{0} 보너스 +{1}코인',
  goldPassed: '금메달 시간이 지났어요 · 은메달은 {0}까지',
  silverPassed: '은메달 시간도 지났어요 · 끝까지 깨면 동메달!',

  // 상점
  shop: {
    gentoo: '젠투펭귄', chinstrap: '턱끈펭귄', emperor: '황제펭귄', macaroni: '마카로니', rainbow: '무지개펭귄',
    food: '먹이', foodCount: '먹이 +1', weapon: '눈덩이', otter: '해달 +1'
  },
  shopDesc: {
    gentoo: '크릴 먹고 쑥쑥 자라 은화·금화를 떨궈요',
    chinstrap: '떨어진 코인을 대신 주워 와요',
    emperor: '진주를 떨구고 가끔 알을 낳아요',
    macaroni: '천적에게 박치기! 같이 싸워요',
    rainbow: '다이아몬드를 떨궈요',
    food: '먹이 등급 올리기 (크릴 → 새우 → 고등어). 좋은 먹이일수록 빨리 크고 오래 배불러요',
    foodCount: '물에 한 번에 떠 있을 수 있는 먹이 수가 늘어요',
    weapon: '천적을 톡 누를 때 던지는 눈덩이가 세져요',
    otter: '배고픈 펭귄에게 공짜 먹이를 주는 해달을 한 마리 더'
  },
  foodNames: ['크릴', '새우', '고등어'],
  nextFood: '먹이→{0}',
  unlockAfter: 'Lv{0} 클리어',
  max: 'MAX', full: '가득',
  eggButton: '황금알 조각',
  eggBoss: '보스를 물리쳐!',

  // 판 안
  hint1: '물을 톡! 눌러서 크릴을 떨어뜨려요',
  hint2: '떨어진 코인을 눌러서 주워요',
  hint3: '펭귄을 더 사면 코인이 더 많이 나와요',
  hint4: '황금알 조각 3개를 사면 클리어!',
  hintHungry: '배고픈 펭귄이 있어요! 먹이를 주세요',
  hintPred: '천적을 톡톡 눌러서 눈덩이를 던져요',
  warn: '{0} 접근 중!',
  bossWarn: '보스 {0} 등장!',
  predNames: { skua: '도둑갈매기', seal: '얼룩물범', shark: '상어', bossSeal: '대왕물범', bossBear: '북극곰', bossOrca: '범고래' },
  blocked: '막았다!',
  grow: ['', '꼬마가 됐어요!', '어른이 됐어요!'],
  starved: '배고파서 떠났어요',
  eaten: '잡아먹혔어요!',
  rescue: '돌고래가 구했어요!',
  foodFull: '먹이는 한 번에 {0}개까지 · 상점 "먹이 +1"로 늘려요',
  poor: '코인이 모자라요',
  hatch: '알에서 아기 펭귄이!',
  summon: '범고래가 물범을 불렀어요!',
  paused: '일시정지',

  // 결과
  clear: '클리어!',
  clearTime: '걸린 시간 {0}',
  newRecord: '새 기록!',
  hatchTitle: '황금알이 깨졌어요!',
  unlocked: '다음 레벨부터 함께해요',
  next: '다음 레벨',
  retry: '다시하기',
  lose: '펭귄이 모두 떠났어요…',
  loseSub: '먹이를 자주 주고, 천적은 빨리 쫓아내요',
  ending: '모든 친구를 모았어요!',
  endingSub: '남극 최고의 펭귄 사육사 인증! 🏆',
  totalTime: '총 플레이 {0}',
  stats: '처치 {0} · 떠난 펭귄 {1}',

  // 친구 이름표(판 시작 때 머리 위)와 능력 쓸 때 한마디
  petShort: {
    crab: '코인 줍기', otter: '공짜 먹이', puffer: '천적 기절', whale: '은화 뿜기', clam: '진주 만들기',
    octopus: '천적 느리게', dolphin: '펭귄 구출', seahorse: '코인 2배 행운', jelly: '천적 감전', starfish: '코인 자동 수거'
  },
  petSay: {
    crab: '게돌이가 주웠어요', otter: '모찌가 먹이를 줬어요!', puffer: '뽀글이: 기절!', whale: '뿜뿜이: 은화 뿜!',
    clam: '진주조개: 진주!', seahorse: '행운이: 코인 2배!', jelly: '찌릿이: 찌릿!', starfish: '별이가 모았어요'
  },
  newFriendToast: '새 친구 {0}! {1}',
  dexRegistered: '도감에 등록!',

  // 천적 설명 (도감·레벨 카드)
  predDesc: {
    skua: '수면 위를 빙빙 돌다가 급강하해서 펭귄을 채 가요. 내려올 때를 노려 톡!',
    seal: '지그재그로 헤엄쳐서 맞히기 까다로워요. 여러 대 맞으면 화나서 잠깐 빨라져요.',
    shark: '펭귄 둘레를 돌다가 빨간 선으로 겨냥하고 직선으로 돌격해요. 선 위의 펭귄이 위험!',
    bossSeal: '왕관 쓴 대왕물범. {0}초마다 겨냥해서 돌진하고, 벽에 부딪히면 튕겨 나와요.',
    bossBear: '{0}초마다 앞발로 얼굴을 가려요 (공격 무효). 얼음덩이를 던져 펭귄을 얼리니 날아오는 얼음을 톡 깨세요.',
    bossOrca: '잠수하면 공격이 안 먹히고, 떠오르며 돌진해요. 체력이 절반이 되면 물범 2마리를 불러요.'
  },

  // 도감
  dexText: {
    tabs: { penguin: '펭귄', pet: '친구', pred: '천적·보스', item: '아이템' },
    count: '모은 펭귄·친구 {0} / {1}',
    locked: '???',
    unlockAt: 'Lv{0} 클리어하면 만나요',
    meetAt: 'Lv{0}에서 만나요',
    price: '{0}코인',
    fromStart: '처음부터 상점에',
    shopAfter: 'Lv{0} 클리어 후 상점에',
    reward: 'Lv{0} 클리어 보상',
    hp: '체력 {0}',
    from: 'Lv{0}부터',
    bossAt: 'Lv{0} 보스',
    predNote: '천적은 오기 3초 전에 경고가 떠요. 눈덩이를 여러 대 맞으면 화나서 잠깐 빨라지고 안 밀려요. 레벨이 오를수록 조금씩 세지고, Lv11부터는 둘이 같이 올 때도 있어요.',
    bossNote: '보스는 황금알 조각 2개를 사는 순간 와요. 쓰러뜨리면 마지막 조각을 떨궈요.',
    traitNote: '판 특징 — Lv3부터 레벨마다 규칙이 하나씩 달라져요. 가끔 코인 비·보물상자·황금 크릴 같은 깜짝 이벤트도 터져요.',
    itemNote: '상점 칸을 꾹 누르면 설명만 볼 수 있어요. 업그레이드는 판마다 처음부터예요.',
    penguin: {
      gentoo: '먹이를 먹고 아기 → 꼬마 → 어른으로 자라요. 꼬마는 은화, 어른은 금화를 떨궈요.',
      chinstrap: '떨어진 코인을 대신 주워 와요. 바쁠 때 든든해요.',
      emperor: '진주를 떨구고, 가끔 알을 낳아 아기 젠투가 태어나요.',
      macaroni: '천적이 오면 박치기로 같이 싸워요. 은화도 떨궈요.',
      rainbow: '비싼 다이아몬드를 떨궈요.'
    },
    petDetail: {
      crab: '바닥에 떨어진 코인을 알아서 주워요.',
      otter: '{0}초마다 제일 배고픈 펭귄 위에 먹이를 떨궈요. 천적이 있으면 쉬어요.',
      puffer: '천적이 오면 {0}초마다 부풀어서 {1}초 동안 기절시켜요.',
      whale: '{0}초마다 은화 {1}개를 뿜어요.',
      clam: '{0}초마다 진주를 만들어요.',
      octopus: '먹물로 천적을 {0}% 느리게 해요.',
      dolphin: '천적에게 잡아먹히기 직전 펭귄을 구해줘요 ({0}초마다).',
      seahorse: '코인이 {0}% 확률로 두 배가 돼요.',
      jelly: '천적을 {0}초마다 찌릿 감전시켜요.',
      starfish: '{0}초 넘게 떠 있는 코인을 알아서 모아요.'
    },
    items: {
      krill: ['크릴', '기본 먹이. 물을 누를 때마다 {0}코인'],
      shrimp: ['새우', '먹이 등급 2단계 ({0}코인). 크릴보다 {1}배 빨리 크고 {2}초 더 배불러요'],
      mackerel: ['고등어', '먹이 등급 3단계 ({0}코인, Lv{3} 클리어 후). {1}배 빨리 크고 {2}초 더 배불러요'],
      foodCount: ['먹이 +1', '물에 한 번에 떠 있을 수 있는 먹이 수. 처음 1개 → 최대 {0}개 (하나 늘릴 때마다 {1}코인)'],
      weapon: ['눈덩이', '천적을 누를 때 던지는 눈덩이. 업그레이드하면 한 번에 더 세게 때려요 (최대 {0}단계)'],
      silver: ['은화', '꼬마 펭귄·마카로니·아기고래가 떨궈요 ({0}코인)'],
      gold: ['금화', '어른 젠투펭귄이 떨궈요 ({0}코인)'],
      pearl: ['진주', '황제펭귄·진주조개가 떨궈요 ({0}코인)'],
      diamond: ['다이아몬드', '무지개펭귄이 떨궈요 ({0}코인)'],
      chest: ['보물상자', '천적을 쓰러뜨리면 나와요. 센 천적일수록 많이 들어 있어요'],
      egg: ['황금알 조각', '3개 모으면 레벨 클리어! 조각마다 값이 올라가요'],
      otter: ['해달 +1', 'Lv{0} 클리어 후 상점에서 해달을 더 살 수 있어요. 한 마리가 펭귄 1~2마리 먹이를 챙겨요 (최대 {1}마리 더)']
    }
  },

  // 보상 이름·설명
  reward: {
    crab: ['소라게 게돌이', '바닥에 떨어진 코인을 주워요'],
    chinstrap: ['턱끈펭귄', '상점에서 살 수 있어요 · 코인을 대신 주워요'],
    otter: ['해달 모찌', '배고픈 펭귄에게 공짜 먹이를 던져줘요'],
    emperor: ['황제펭귄', '상점에서 살 수 있어요 · 진주를 떨구고 알을 낳아요'],
    puffer: ['복어 뽀글이', '천적을 빵빵! 잠깐 기절시켜요'],
    macaroni: ['마카로니펭귄', '상점에서 살 수 있어요 · 천적과 같이 싸워요'],
    whale: ['아기고래 뿜뿜이', '가끔 은화를 뿜어요'],
    clam: ['진주조개', '진주를 만들어요'],
    octopus: ['문어 먹물이', '먹물로 천적을 느리게 해요'],
    rainbow: ['무지개펭귄', '상점에서 살 수 있어요 · 다이아몬드를 떨궈요'],
    dolphin: ['돌고래 돌돌이', '잡아먹히기 직전 펭귄을 구해줘요'],
    seahorse: ['해마 행운이', '가끔 코인이 두 배!'],
    jelly: ['해파리 찌릿이', '천적을 찌릿! 감전시켜요'],
    starfish: ['불가사리 별이', '오래 떠 있는 코인을 알아서 모아요'],
    trophy: ['황금 펭귄 트로피', '모든 레벨 클리어!']
  }
}, (typeof window !== 'undefined' && window.PENGUIN_I18N) || {});

export function fmt(t, ...v) { return String(t).replace(/\{(\d)\}/g, (_, i) => String(v[i])); }
export function mmss(sec) { sec = Math.max(0, Math.floor(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; }
export function num(n) { return Math.floor(n).toLocaleString('ko-KR'); }
