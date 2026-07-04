'use strict';

// ============================================================
// horserace.js – 말달리자  |  Phaser 3 웹 경마 게임
// Binary World (game.binaryworld.kr)
// ============================================================

// ============================================================
// 다국어 지원 (i18n) – Internationalization
// 브라우저 언어 감지: ko / ja 외엔 모두 en 폴백
// ============================================================
const _navLang = (typeof navigator !== 'undefined' && navigator.language)
    ? navigator.language.toLowerCase() : '';
const currentLang = _navLang.startsWith('ko') ? 'ko' : _navLang.startsWith('ja') ? 'ja' : 'en';

const I18N = {
    ko: {
        // SetupScene
        title:           '🏇 말달리자',
        subtitle:        '참가자 이름을  쉼표( , )  또는  줄바꿈으로 구분하여 입력하세요',
        placeholder:     '예시:\n홍길동, 김철수, 이영희\n또는 한 줄에 한 명씩 입력',
        countSuffix:     '명 입력됨',
        countMin:        ' (최소 2명)',
        countMax:        ' (최대 30명 초과!)',
        countOk:         ' ✓',
        modeLabel:       '게임 모드 선택',
        modeWinner:      '🏆 1등 우승 뽑기',
        modeLoser:       '💣 꼴찌 벌칙 뽑기',
        startBtn:        '🏁  경주 시작!',
        msgMin:          '최소 2명 이상 입력해주세요!',
        msgMax:          '최대 30명까지 가능합니다!',
        footerPromo:     '내기 · 추첨 · 이벤트에 딱!  사다리타기 · 룰렛 · 핀볼 대신 말달리자 🐎',
        defaultNames:    ['참가자1', '참가자2'],
        // In-game UI (Phaser)
        fsExitLabel:     '⛶ 닫기(전체화면 종료)',
        leaderboard:     '🏆 실시간 순위',
        rankPrefix:      '',
        rankSuffix:      '위',
        finalSpurt:      '🔥 마지막 스퍼트! 🔥',
        carrotEat:       '🥕 냠냠!',
        rockHit:         '🪨 쿵!',
        puddleHit:       '💧 첨벙!',
        resultWin:       '🎉  우승!  🎉',
        resultLose:      '💣  당첨(벌칙)!  💣',
        btnRestart:      '🔄 같은 참가자로 재시작',
        btnNewSetup:     '✏️ 새로 설정',
        // HTML DOM
        bgmOn:           '🔊 BGM 켜짐',
        bgmOff:          '🔇 BGM 꺼짐',
        domHomeBtn:      '🏠 홈으로 돌아가기',
        domFsExitBtn:    '✕ 나가기',
        domMobileFsBtn:  '✕ 전체화면 종료',
        domVolumeLabel:  '볼륨:',
        domFsToggle:     '⛶ 전체화면',
        domFsToggleExit: '⛶ 전체화면 종료',
        domFsToggleTip:  '전체화면 전환',
        domFsExitTip:    '전체화면 나가기',
        domDescH2_1:     '방법',
        domDescH2_2:     '특징',
        domDescStep1:    '참가자 이름을 <strong>쉼표 또는 줄바꿈</strong>으로 구분해 입력 (2~30명)',
        domDescStep2:    '<strong>1등 우승 뽑기</strong> / <strong>꼴찌 벌칙 뽑기</strong> 중 선택 후 <strong>경주 시작!</strong>',
        domDescStep3:    '시작 시 말마다 등급 랜덤: 🏇 일반 / 🦄 레어 / 🐉 에픽',
        domDescStep4:    '🥕 당근은 먹고, 🪨 돌·💧 웅덩이는 피하기. 결승선 통과한 말의 주인이 우승(또는 꼴찌)',
        domDescFeat1:    '벌칙·당번·커피 뽑기 등 <strong>뽑기·추첨용</strong> (사다리·룰렛 대신)',
        domDescFeat2:    '<strong>역전 요소</strong> – 꼴찌 부스터, 막판 스퍼트, 1~3위만 걸리는 선두 억까',
        domDescFeat3:    '말마다 고유 색상으로 순위 한눈에 구분, 최대 30명 참가',
        mobileFsBlockTitle:   '모바일 전체화면 안내',
        mobileFsBlockMessage: '모바일 기기에서는 전체화면 모드에서\n일부 기기에서 터치 또는 화면 레이아웃 문제가 발생할 수 있습니다.\n\n화면이 조금 작더라도 기본 보기(전체화면 아님)를 권장합니다.\n\n※ 효과음을 위해 BGM을 켜고 플레이하는 것을 추천합니다!',
        mobileFsBlockOk:      '알겠어요',
    },
    en: {
        title:           '🏇 Let\'s Race!',
        subtitle:        'Enter names separated by comma ( , ) or newline',
        placeholder:     'Example:\nAlice, Bob, Charlie\nor one name per line',
        countSuffix:     ' entered',
        countMin:        ' (min. 2)',
        countMax:        ' (over 30 max!)',
        countOk:         ' ✓',
        modeLabel:       'Select Game Mode',
        modeWinner:      '🏆 Pick the Winner',
        modeLoser:       '💣 Pick the Loser',
        startBtn:        '🏁  Start Race!',
        msgMin:          'Please enter at least 2 participants!',
        msgMax:          'Maximum 30 participants allowed!',
        footerPromo:     'Perfect for bets, draws & events! Instead of ladder, roulette, or pinball 🐎',
        defaultNames:    ['Player 1', 'Player 2'],
        fsExitLabel:     '⛶ Close (Exit Fullscreen)',
        leaderboard:     '🏆 Live Rankings',
        rankPrefix:      '#',
        rankSuffix:      '',
        finalSpurt:      '🔥 Final Spurt! 🔥',
        carrotEat:       '🥕 Munch!',
        rockHit:         '🪨 Bang!',
        puddleHit:       '💧 Splash!',
        resultWin:       '🎉  Winner!  🎉',
        resultLose:      '💣  Last Place!  💣',
        btnRestart:      '🔄 Restart (Same Players)',
        btnNewSetup:     '✏️ New Setup',
        bgmOn:           '🔊 BGM On',
        bgmOff:          '🔇 BGM Off',
        domHomeBtn:      '🏠 Back to Home',
        domFsExitBtn:    '✕ Exit',
        domMobileFsBtn:  '✕ Exit Fullscreen',
        domVolumeLabel:  'Vol:',
        domFsToggle:     '⛶ Fullscreen',
        domFsToggleExit: '⛶ Exit Fullscreen',
        domFsToggleTip:  'Toggle Fullscreen',
        domFsExitTip:    'Exit Fullscreen',
        domDescH2_1:     'How to Play',
        domDescH2_2:     'Features',
        domDescStep1:    'Enter names separated by <strong>comma or newline</strong> (2–30 players)',
        domDescStep2:    'Choose <strong>Pick the Winner</strong> or <strong>Pick the Loser</strong>, then click <strong>Start Race!</strong>',
        domDescStep3:    'Each horse gets a random tier at start: 🏇 Common / 🦄 Rare / 🐉 Epic',
        domDescStep4:    '🥕 Eat carrots, avoid 🪨 rocks & 💧 puddles. The owner of the first (or last) horse to finish wins!',
        domDescFeat1:    'Great for penalty draws, chore picks, coffee bets — <strong>random picker</strong> (instead of ladder or roulette)',
        domDescFeat2:    '<strong>Comeback mechanics</strong> — last-place boost, final spurt, leader stumble penalty',
        domDescFeat3:    'Each horse has a unique color for easy rank tracking, up to 30 players',
        mobileFsBlockTitle:   'Fullscreen on Mobile',
        mobileFsBlockMessage: 'On some mobile devices, fullscreen mode may cause touch or layout issues.\n\nWe recommend using the normal view (non-fullscreen) even if the screen is a bit smaller.\n\n※ For the best experience, please turn BGM on when you play!',
        mobileFsBlockOk:      'OK',
    },
    ja: {
        title:           '🏇 馬を走らせよう！',
        subtitle:        '参加者名をカンマ（，）または改行で区切って入力してください',
        placeholder:     '例：\n田中, 鈴木, 佐藤\nまたは1行に1名ずつ入力',
        countSuffix:     '名入力済み',
        countMin:        '（最低2名）',
        countMax:        '（最大30名超過！）',
        countOk:         ' ✓',
        modeLabel:       'ゲームモードを選択',
        modeWinner:      '🏆 1位優勝を決める',
        modeLoser:       '💣 最下位罰ゲーム',
        startBtn:        '🏁  レーススタート！',
        msgMin:          '最低2名以上入力してください！',
        msgMax:          '最大30名まで参加できます！',
        footerPromo:     '内輪の賭け・抽選・イベントにぴったり！ラダー・ルーレット・ピンボールの代わりに 🐎',
        defaultNames:    ['プレイヤー1', 'プレイヤー2'],
        fsExitLabel:     '⛶ 閉じる（全画面終了）',
        leaderboard:     '🏆 リアルタイム順位',
        rankPrefix:      '',
        rankSuffix:      '位',
        finalSpurt:      '🔥 ラストスパート！ 🔥',
        carrotEat:       '🥕 パクッ！',
        rockHit:         '🪨 ドン！',
        puddleHit:       '💧 ザブン！',
        resultWin:       '🎉  優勝！  🎉',
        resultLose:      '💣  最下位（罰ゲーム）！  💣',
        btnRestart:      '🔄 同じメンバーで再スタート',
        btnNewSetup:     '✏️ 新しく設定',
        bgmOn:           '🔊 BGM オン',
        bgmOff:          '🔇 BGM オフ',
        domHomeBtn:      '🏠 ホームへ戻る',
        domFsExitBtn:    '✕ 閉じる',
        domMobileFsBtn:  '✕ 全画面終了',
        domVolumeLabel:  '音量:',
        domFsToggle:     '⛶ 全画面',
        domFsToggleExit: '⛶ 全画面終了',
        domFsToggleTip:  '全画面切り替え',
        domFsExitTip:    '全画面を閉じる',
        domDescH2_1:     '遊び方',
        domDescH2_2:     '特徴',
        domDescStep1:    '参加者名を<strong>カンマまたは改行</strong>で区切って入力（2〜30名）',
        domDescStep2:    '<strong>1位優勝</strong>または<strong>最下位罰ゲーム</strong>を選んで<strong>レーススタート！</strong>をクリック',
        domDescStep3:    'スタート時に馬ごとにティアがランダム決定：🏇 コモン / 🦄 レア / 🐉 エピック',
        domDescStep4:    '🥕 にんじんを食べ、🪨 岩・💧 水たまりを避けよう。ゴールを通過した馬のオーナーが優勝（または罰ゲーム）',
        domDescFeat1:    '罰ゲーム・当番・コーヒー争奪など<strong>抽選・くじ引き用途</strong>に最適（はしご・ルーレットの代替）',
        domDescFeat2:    '<strong>逆転要素あり</strong> — 最下位ブースター・ラストスパート・先頭馬への横やり',
        domDescFeat3:    '馬ごとに固有カラーで順位が一目でわかる、最大30名参加可能',
        mobileFsBlockTitle:   'モバイル全画面について',
        mobileFsBlockMessage: '一部のモバイル端末では、全画面モードでタッチやレイアウトの不具合が発生する場合があります。\n\n画面が少し小さくても、通常表示（非全画面）でのご利用をおすすめします。\n\n※ 効果音を楽しむため、BGMをオンにして遊ぶことをおすすめします！',
        mobileFsBlockOk:      'OK',
    },
};

const HR_W      = 1000;
const HR_H      = 720;
const TRACK_LEN = 10000;
const FINISH_X  = 9500;
const MM_H      = 28;

const HORSE_COLORS = [
    0xFF6B6B, 0x4ECDC4, 0xFFD700, 0x45B7D1, 0xFF8C00,
    0xDDA0DD, 0x98D8C8, 0x90EE90, 0xFF69B4, 0x7B68EE,
    0x20B2AA, 0xFF4500, 0x9370DB, 0x3CB371, 0xFF6347,
    0x4169E1, 0xDC143C, 0x00FA9A, 0xFF1493, 0x1E90FF,
    0x32CD32, 0x8A2BE2, 0x00FF7F, 0xFF7F50, 0x6495ED,
    0x40E0D0, 0xF0E68C, 0xADFF2F, 0xFF00FF, 0x00BFFF,
];

// 6명 이하일 때 색 겹침 없이 서로 다른 색 부류에서 한 개씩 뽑기 위한 그룹
const HORSE_COLOR_FAMILIES = [
    [0xFF6B6B, 0xDC143C, 0xFF6347, 0xFF4500],           // 빨강
    [0xFF8C00, 0xFF7F50],                             // 주황
    [0xFFD700, 0xF0E68C, 0xADFF2F],                   // 노랑/금
    [0x90EE90, 0x3CB371, 0x32CD32, 0x00FA9A, 0x00FF7F], // 초록
    [0x4ECDC4, 0x45B7D1, 0x20B2AA, 0x40E0D0, 0x00BFFF], // 시안/하늘
    [0x4169E1, 0x7B68EE, 0x1E90FF, 0x6495ED],         // 파랑
    [0xDDA0DD, 0x9370DB, 0x8A2BE2],                   // 보라
    [0xFF69B4, 0xFF1493, 0xFF00FF],                   // 분홍/마젠타
];

function pickDistinctColorsForCount(n) {
    if (n <= 0) return [];
    if (n <= HORSE_COLOR_FAMILIES.length) {
        const order = Phaser.Utils.Array.Shuffle([...Array(HORSE_COLOR_FAMILIES.length).keys()]);
        const out = [];
        for (let i = 0; i < n; i++) {
            const fam = HORSE_COLOR_FAMILIES[order[i]];
            out.push(fam[Phaser.Math.Between(0, fam.length - 1)]);
        }
        return out;
    }
    return Phaser.Utils.Array.Shuffle([...HORSE_COLORS]);
}

// 말 등급 (뽑기): 일반 대다수, 레어 5%, 에픽 1~2% (잭팟 느낌)
const TIER_COMMON = 'common';
const TIER_RARE   = 'rare';
const TIER_EPIC   = 'epic';
const TIER_DEF = [
    { tier: TIER_COMMON, prob: 0.94, emoji: '🏇', speedBonus: 0,   boosterMul: 1.0, trail: null, dodgeMul: 1.0 },
    { tier: TIER_RARE,   prob: 0.05, emoji: '🦄', speedBonus: 0.1, boosterMul: 1.5, trail: '✨', dodgeMul: 1.0 },
    { tier: TIER_EPIC,   prob: 0.01, emoji: '🐉', speedBonus: 0.2, boosterMul: 1.0, trail: '🔥', dodgeMul: 0.35 },
];
function pickTier() {
    const r = Math.random();
    let acc = 0;
    for (const d of TIER_DEF) {
        acc += d.prob;
        if (r < acc) return d;
    }
    return TIER_DEF[0];
}

// 장애물 정의 (가중치 랜덤)
const OBSTACLE_DEF = [
    { type: 'rock',   emoji: '🪨', weight: 3 },
    { type: 'puddle', emoji: '💧', weight: 3 },
    { type: 'carrot', emoji: '🥕', weight: 4 },
];

function pickObstacleDef() {
    const total = OBSTACLE_DEF.reduce((s, d) => s + d.weight, 0);
    let r = Math.random() * total;
    for (const d of OBSTACLE_DEF) { r -= d.weight; if (r <= 0) return d; }
    return OBSTACLE_DEF[0];
}

// 효과음 키 (카메라 시점일 때만 재생)
const SFX_ROCK      = 'sfx_rock';
const SFX_PUDDLE    = 'sfx_puddle';
const SFX_CARROT    = 'sfx_carrot';
const SFX_JUMP      = 'sfx_jump';
const SFX_COUNTDOWN = 'sfx_countdown';
const SFX_FINISH    = 'sfx_finish';
const SFX_FANFARE   = 'sfx_fanfare';
const BGM_KEY       = 'bgm';

// ============================================================
// PreloadScene – BGM·효과음 로드 (Phaser Sound Manager 사용, 모바일/iOS 볼륨 대응)
// ============================================================
class PreloadScene extends Phaser.Scene {
    constructor() { super({ key: 'PreloadScene' }); }
    preload() {
        this.load.audio(BGM_KEY,       '/assets/horseRace/audio/bgm.mp3');
        this.load.audio(SFX_ROCK,      '/assets/horseRace/rock.mp3');
        this.load.audio(SFX_PUDDLE,    '/assets/horseRace/puddle.mp3');
        this.load.audio(SFX_CARROT,    '/assets/horseRace/carrot.mp3');
        this.load.audio(SFX_JUMP,      '/assets/horseRace/jump.mp3');
        this.load.audio(SFX_COUNTDOWN, '/assets/horseRace/countdown.mp3');
        this.load.audio(SFX_FINISH,    '/assets/horseRace/finish.mp3');
        this.load.audio(SFX_FANFARE,   '/assets/horseRace/fanfare.mp3');
    }
    create() {
        this.scene.start('SetupScene');
    }
}

// ============================================================
// SetupScene – 참가자 설정 화면
// ============================================================
class SetupScene extends Phaser.Scene {
    constructor() { super({ key: 'SetupScene' }); }

    create() {
        const W = this.scale.width, H = this.scale.height;
        const cx = W / 2;
        const MARGIN_TOP = 52;
        const MARGIN_SIDE = 20;

        this.cameras.main.setBackgroundColor('#060614');

        // 배경 그라디언트 (여백 고려)
        this.add.graphics()
            .fillGradientStyle(0x0b0b20, 0x0b0b20, 0x141432, 0x141432, 1)
            .fillRect(0, 0, W, H);

        // 별
        for (let i = 0; i < 130; i++) {
            this.add.circle(
                Phaser.Math.Between(MARGIN_SIDE, W - MARGIN_SIDE),
                Phaser.Math.Between(MARGIN_TOP, Math.floor(H * 0.72)),
                Math.random() * 1.4 + 0.2,
                0xffffff,
                Math.random() * 0.55 + 0.25
            );
        }

        // 타이틀 (캔버스 상단에 안 짤리도록 여백 확보) + 가독성 그림자
        const titleY = MARGIN_TOP + 28;
        const textShadow = { offsetX: 1, offsetY: 1, color: '#000000', blur: 4, fill: true };
        this.add.text(cx, titleY, I18N[currentLang].title, {
            fontFamily: '"Orbitron","Pretendard",Arial',
            fontSize: '44px', color: '#FFD700',
            stroke: '#2a1500', strokeThickness: 6,
            shadow: { offsetX: 1, offsetY: 1, color: '#000000', blur: 4, fill: true },
        }).setOrigin(0.5);

        this.add.text(cx, titleY + 58, I18N[currentLang].subtitle, {
            fontFamily: '"Pretendard",Arial', fontSize: '18px', color: '#EEEEEE', fontStyle: 'bold',
            shadow: textShadow,
        }).setOrigin(0.5);

        // CSS 미디어 쿼리와 동일한 기준(viewport 너비)으로 layoutOffset 계산
        const vw = window.innerWidth || W;
        const layoutOffset = vw < 386 ? 180 : (vw <= 640 ? 90 : 0);
        this._modeLabelY = titleY + 228 + layoutOffset;
        this._startBtnY = this._modeLabelY + 130;

        // 순수 HTML 오버레이 방식 – Phaser DOM 미사용 (모바일 호환성)
        const overlay = document.getElementById('hr-setup-overlay');
        if (overlay) overlay.classList.add('active');
        const phEl = document.getElementById('hrNamesInput');
        if (phEl) phEl.placeholder = I18N[currentLang].placeholder;

        // Phaser 이벤트로 shutdown 훅 등록 (씬 전환 시 오버레이 확실히 숨김)
        this.events.once('shutdown', () => {
            if (overlay) overlay.classList.remove('active');
            const ta = document.getElementById('hrNamesInput');
            if (ta && this._taInputHandler) {
                ta.removeEventListener('input', this._taInputHandler);
                this._taInputHandler = null;
            }
        });

        // "몇명 입력됨" → 내기·추첨 문구 바로 위, 글자 크기 키움
        const FOOT_H = 36;
        this.countText = this.add.text(cx, H - FOOT_H - 22, `0${I18N[currentLang].countSuffix}`, {
            fontFamily: '"Pretendard",Arial', fontSize: '21px', color: '#8888aa',
            shadow: textShadow,
        }).setOrigin(0.5);

        const taEl = document.getElementById('hrNamesInput');
        if (taEl) {
            this._taInputHandler = () => this._updateCount(taEl.value);
            taEl.addEventListener('input', this._taInputHandler);
            const last = this.registry.get('lastNames');
            if (last && last.length) { taEl.value = last.join('\n'); this._updateCount(taEl.value); }
        }

        // 모드 선택 라벨 (닉네임 입력 아래, 버튼 위에 배치)
        this.add.text(cx, this._modeLabelY, I18N[currentLang].modeLabel, {
            fontFamily: '"Pretendard",Arial', fontSize: '14px', color: '#b0b0dd', fontStyle: 'bold',
            shadow: textShadow,
        }).setOrigin(0.5);

        // 모드 토글 버튼 생성 (닉네임 입력·라벨 아래에 고정 배치)
        this.gameMode = this.registry.get('gameMode') || 'winner';
        this._createModeButtons();

        // 시작 버튼 (모드 버튼 아래에 배치)
        const startBg  = this.add.graphics();
        const SBY = this._startBtnY;
        const SBX = cx - 132, SBW = 264, SBH = 50;
        const drawStartBtn = (c) => {
            startBg.clear();
            startBg.fillStyle(c, 1);
            startBg.fillRoundedRect(SBX, SBY, SBW, SBH, 12);
        };
        drawStartBtn(0xFFD700);
        this.add.text(cx, SBY + SBH / 2, I18N[currentLang].startBtn, {
            fontFamily: '"Orbitron",Arial',
            fontSize: '23px',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
            shadow: textShadow,
        }).setOrigin(0.5);
        this.add.rectangle(cx, SBY + SBH / 2, SBW, SBH)
            .setInteractive({ useHandCursor: true })
            .on('pointerover',  () => drawStartBtn(0xFFA500))
            .on('pointerout',   () => drawStartBtn(0xFFD700))
            .on('pointerdown',  () => {
                const ta    = document.getElementById('hrNamesInput');
                const names = this._parseNames(ta ? ta.value : '');
                if (names.length < 2)  return this._showMsg(I18N[currentLang].msgMin);
                if (names.length > 30) return this._showMsg(I18N[currentLang].msgMax);
                // 게임 시작 즉시 오버레이 숨기기 (씬 전환 전에 반드시 처리)
                const ov = document.getElementById('hr-setup-overlay');
                if (ov) ov.classList.remove('active');
                this.registry.set('lastNames', names);
                this.registry.set('gameMode', this.gameMode);
                this.scene.start('GameScene', { names, mode: this.gameMode });
            });

        // 오류 메시지 (몇명입력됨 위쪽에 표시) + 가독성 그림자
        this.msgText = this.add.text(cx, H - FOOT_H - 48, '', {
            fontFamily: '"Pretendard",Arial', fontSize: '14px', color: '#FF6B6B',
            shadow: textShadow,
        }).setOrigin(0.5);

        // 하단 바 (여백 확보)
        this.add.graphics().fillStyle(0x1a1a3a, 0.55).fillRect(0, H - FOOT_H, W, FOOT_H);
        this.add.text(cx, H - FOOT_H / 2, I18N[currentLang].footerPromo, {
            fontFamily: '"Pretendard",Arial', fontSize: '13px', color: '#ffffff',
            shadow: textShadow,
        }).setOrigin(0.5);


        // BGM: Phaser Sound Manager 사용 (모바일/iOS에서 볼륨 슬라이더 정상 동작)
        if (!this.game.bgmSound) {
            this.game.bgmSound = this.sound.add(BGM_KEY, { loop: true });
        }
        let vol = this.registry.get('bgmVolume');
        if (vol === undefined) {
            const volEl = document.getElementById('volumeControl');
            vol = volEl ? Number(volEl.value) / 100 : 0.3;
            this.registry.set('bgmVolume', vol);
        }
        this.game.bgmSound.volume = vol;
        // BGM/효과음 통합: 레지스트리 값에 맞춰 mute 동기화 (SetupScene 진입 시점에 한 번)
        const bgmOn = this.registry.get('bgmOn') !== false; // undefined 또는 true이면 켜짐
        this.sound.mute = !bgmOn;
        if (bgmOn) { try { if (!this.game.bgmSound.isPlaying) this.game.bgmSound.play(); } catch (e) {} }

        // 전체화면 시 씬 내부 '닫기' 버튼 (모바일에서 HTML 버튼이 보이지 않을 때 대비)
        this._createFullscreenExitButton();
    }

    _createFullscreenExitButton() {
        const camW = this.cameras.main.width;
        const btnW = 140, btnH = 40;
        const bx = camW - btnW / 2 - 16;
        const by = 36;
        const bg = this.add.graphics().setScrollFactor(0).setDepth(9999);
        const drawBg = (c) => {
            bg.clear();
            bg.fillStyle(c, 0.95);
            bg.fillRoundedRect(bx - btnW / 2, by - btnH / 2, btnW, btnH, 8);
            bg.lineStyle(2, 0xFFD700, 1);
            bg.strokeRoundedRect(bx - btnW / 2, by - btnH / 2, btnW, btnH, 8);
        };
        drawBg(0x1a1a3a);
        const lbl = this.add.text(bx, by, I18N[currentLang].fsExitLabel, {
            fontFamily: '"Pretendard",Arial', fontSize: '13px', color: '#FFD700',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10000);
        const hit = this.add.rectangle(bx, by, btnW, btnH).setScrollFactor(0).setDepth(10001)
            .setInteractive({ useHandCursor: true })
            .on('pointerover', () => drawBg(0x2a2a5a))
            .on('pointerout', () => drawBg(0x1a1a3a))
            .on('pointerdown', () => { if (this.scale.isFullscreen) this.scale.stopFullscreen(); });
        this._fsExitContainer = [bg, lbl, hit];
        this._fsExitContainer.forEach(o => o.setVisible(false));
        this._onFsEnter = () => this._fsExitContainer.forEach(o => o.setVisible(true));
        this._onFsLeave = () => this._fsExitContainer.forEach(o => o.setVisible(false));
        this.scale.on('enterfullscreen', this._onFsEnter);
        this.scale.on('leavefullscreen', this._onFsLeave);
    }

    _createModeButtons() {
        const BW = 226, BH = 52, GAP = 18;
        const cx = this.scale.width / 2;
        const x1 = cx - BW - GAP / 2;
        const x2 = cx + GAP / 2;
        const modeLabelY = this._modeLabelY !== undefined ? this._modeLabelY : (52 + 28) + 228;
        const BY = modeLabelY + 36;  // "게임 모드 선택" 라벨 바로 아래

        this._modePos = { x1, x2, y: BY, w: BW, h: BH };
        this.modeBtnGfx = this.add.graphics();

        const lblShadow = { offsetX: 1, offsetY: 1, color: '#000000', blur: 4, fill: true };
        this.modeLbl1 = this.add.text(x1 + BW / 2, BY + BH / 2, I18N[currentLang].modeWinner, {
            fontFamily: '"Pretendard",Arial',
            fontSize: '18px',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
            shadow: lblShadow,
        }).setOrigin(0.5);
        this.modeLbl2 = this.add.text(x2 + BW / 2, BY + BH / 2, I18N[currentLang].modeLoser, {
            fontFamily: '"Pretendard",Arial',
            fontSize: '18px',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
            shadow: lblShadow,
        }).setOrigin(0.5);

        this.add.rectangle(x1 + BW / 2, BY + BH / 2, BW, BH)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => { this.gameMode = 'winner'; this._refreshModeButtons(); });
        this.add.rectangle(x2 + BW / 2, BY + BH / 2, BW, BH)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => { this.gameMode = 'loser';  this._refreshModeButtons(); });

        this._refreshModeButtons();
    }

    _refreshModeButtons() {
        const { x1, x2, y, w, h } = this._modePos;
        const isWinner = this.gameMode === 'winner';
        const g = this.modeBtnGfx;
        g.clear();

        // 모드 선택 영역 배경 (버튼이 잘 보이도록)
        const pad = 14;
        g.fillStyle(0x0f0f28, 0.92);
        g.fillRoundedRect(x1 - pad, y - pad, (x2 - x1) + w + pad * 2, h + pad * 2, 16);
        g.lineStyle(1.5, 0x4a4a88, 0.9);
        g.strokeRoundedRect(x1 - pad, y - pad, (x2 - x1) + w + pad * 2, h + pad * 2, 16);

        // 선택됐을 때: 금색/빨강. 비선택: 어두운 배경 + 밝은 테두리·글자로 구분
        g.fillStyle(isWinner ? 0xFFD700 : 0x252550, 1);
        g.fillRoundedRect(x1, y, w, h, 12);
        g.lineStyle(2.5, isWinner ? 0xFFD700 : 0x6a6acc, 1);
        g.strokeRoundedRect(x1, y, w, h, 12);

        g.fillStyle(!isWinner ? 0xFF4444 : 0x352828, 1);
        g.fillRoundedRect(x2, y, w, h, 12);
        g.lineStyle(2.5, !isWinner ? 0xFF6666 : 0xaa5555, 1);
        g.strokeRoundedRect(x2, y, w, h, 12);

        // 선택된 쪽은 흰색으로 해서 금/빨강 배경에서 잘 보이게
        this.modeLbl1.setColor(isWinner ? '#ffffff' : '#c8c8ee');
        this.modeLbl2.setColor(!isWinner ? '#ffffff' : '#e8c0c0');
    }

    _parseNames(text) {
        if (!text || typeof text !== 'string') return [];
        return text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split(/[\n,]+/)
            .map(n => n.trim())
            .filter(n => n.length > 0);
    }
    _updateCount(val) {
        const n = this._parseNames(val).length;
        const col = (n > 0 && n < 2) || n > 30 ? '#FF4444' : n >= 2 ? '#00FF88' : '#8888aa';
        const sfx = (n > 0 && n < 2) ? I18N[currentLang].countMin : n > 30 ? I18N[currentLang].countMax : n >= 2 ? I18N[currentLang].countOk : '';
        this.countText.setText(`${n}${I18N[currentLang].countSuffix}${sfx}`).setColor(col);
    }
    _showMsg(msg) {
        // 기존 하단 빨간 안내 문구는 PC에서도 계속 사용
        this.msgText.setText(msg).setColor('#FF6B6B');
        this.time.delayedCall(3000, () => this.msgText.setText(''));

        // 모바일·PC 공통: 화면 중앙에 짧게 뜨는 모달 형태 경고
        if (this._errModal && this._errModal.active) {
            this._errModal.destroy();
            this._errModal = null;
        }

        const W = this.scale.width;
        const H = this.scale.height;
        const modal = this.add.container(0, 0);

        const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65);
        dim.setInteractive({ useHandCursor: true });

        const panelW = Math.min(520, W - 60);
        const panelH = 170;
        const panel = this.add.rectangle(W / 2, H / 2, panelW, panelH, 0x1a0b2a, 0.96);
        panel.setStrokeStyle(2, 0xFF6666, 1);

        const textStyle = {
            fontFamily: '"Pretendard",Arial',
            fontSize: '22px',
            color: '#ff8888',
            align: 'center',
            wordWrap: { width: panelW - 40, useAdvancedWrap: true }
        };
        const label = this.add.text(W / 2, H / 2 - 18, msg, textStyle).setOrigin(0.5);

        const btnW = 120;
        const btnH = 40;
        const btnY = H / 2 + panelH / 2 - 32;
        const btnBg = this.add.rectangle(W / 2, btnY, btnW, btnH, 0xFF6666, 1);
        btnBg.setStrokeStyle(1.5, 0xffffff, 0.9);
        const btnLabel = this.add.text(W / 2, btnY, '확인', {
            fontFamily: '"Pretendard",Arial',
            fontSize: '18px',
            color: '#ffffff'
        }).setOrigin(0.5);
        btnBg.setInteractive({ useHandCursor: true });

        const closeModal = () => {
            if (modal && modal.active) {
                modal.destroy();
                this._errModal = null;
            }
        };
        dim.on('pointerdown', closeModal);
        btnBg.on('pointerdown', closeModal);

        modal.add([dim, panel, label, btnBg, btnLabel]);
        modal.setDepth(100);
        this._errModal = modal;

        // 자동으로도 사라지도록 3초 타이머
        this.time.delayedCall(3000, closeModal);
    }

    shutdown() {
        // events.once('shutdown') 훅이 주 경로, 여기는 안전망
        const overlay = document.getElementById('hr-setup-overlay');
        if (overlay) overlay.classList.remove('active');
        if (this._onFsEnter) this.scale.off('enterfullscreen', this._onFsEnter);
        if (this._onFsLeave) this.scale.off('leavefullscreen', this._onFsLeave);
    }
}

// ============================================================
// GameScene – 경마 메인 씬
// ============================================================
class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    init(data) {
        this.names       = data.names || I18N[currentLang].defaultNames;
        this.mode        = data.mode  || 'winner';   // 'winner' | 'loser'
        this.numHorses   = this.names.length;
        this.raceStarted = false;
        this.raceFinished= false;
        this.winner      = null;
        this.finishOrder = 0;
        this.allFinished = 0;
        this.finalLapTriggered = false;
        this.finalLapUntil     = 0;
    }

    shutdown() {
        // 재시작/씬 전환 시 밀려 있던 효과음·예약된 콜백이 한꺼번에 터지는 것 방지
        this.sound.stopAll();
        this.tweens.killAll();
        if (this.time && typeof this.time.removeAllEvents === 'function') this.time.removeAllEvents();
        if (this._onFsEnter) this.scale.off('enterfullscreen', this._onFsEnter);
        if (this._onFsLeave) this.scale.off('leavefullscreen', this._onFsLeave);
    }

    create() {
        const W = this.scale.width, H = this.scale.height;
        const cx = W / 2, cy = H / 2;

        // 모바일 포함 효과음 잘 들리도록 마스터 볼륨 확보
        this.sound.volume = 1;

        // ── 레이아웃 계산 ─────────────────────────────────────
        const MARGIN_TOP = 44;
        const MARGIN_BOT = MM_H + 12;
        const TRACK_TOP  = MARGIN_TOP;
        const TRACK_H    = H - MARGIN_TOP - MARGIN_BOT;
        const LANE_H     = TRACK_H / this.numHorses;
        // TODO: 말 이미지 교체 부분 ─────────────────────────────
        // 현재 🏇 이모지 텍스트를 사용합니다.
        // 실제 Sprite로 교체 시 HORSE_FONT 대신 Sprite.width/height를 사용하세요.
        // this.add.sprite(x, y, 'horse_texture').setDepth(10);
        const HORSE_FONT = Phaser.Math.Clamp(Math.floor(LANE_H * 0.78), 10, 44);
        const FONT_SZ    = this.numHorses <= 10
            ? Phaser.Math.Clamp(Math.floor(LANE_H * 0.52), 12, 22)
            : Phaser.Math.Clamp(Math.floor(LANE_H * 0.42), 7, 14);
        this.layout = { TRACK_TOP, TRACK_H, LANE_H, HORSE_FONT, FONT_SZ };

        // ── 카메라 경계 ──────────────────────────────────────
        this.cameras.main.setBounds(0, 0, TRACK_LEN + 600, HR_H);

        // ── Parallax 배경 레이어 (scrollFactor=0, 매 프레임 재드로우) ──
        this.skyGfx  = this.add.graphics().setScrollFactor(0).setDepth(0);
        this.mtGfx   = this.add.graphics().setScrollFactor(0).setDepth(1);
        this.hillGfx = this.add.graphics().setScrollFactor(0).setDepth(2);
        this.treeGfx = this.add.graphics().setScrollFactor(0).setDepth(3);

        // 하늘은 정적으로 1번만 그림
        this.skyGfx.fillGradientStyle(0x07071a, 0x07071a, 0x101038, 0x101038, 1);
        this.skyGfx.fillRect(0, 0, W, H);
        for (let i = 0; i < 80; i++) {
            this.skyGfx.fillStyle(0xffffff, Math.random() * 0.5 + 0.2);
            this.skyGfx.fillCircle(
                Phaser.Math.Between(0, HR_W),
                Phaser.Math.Between(0, Math.floor(TRACK_TOP * 0.85)),
                Math.random() + 0.4
            );
        }

        this._drawTrack();
        this._drawFinishLine();

        // ── 장애물 생성 ──────────────────────────────────────
        this.obstacleGroup = [];
        this._generateObstacles();

        // ── 말 데이터 & 렌더 오브젝트 ───────────────────────
        this.nameGfx     = this.add.graphics().setDepth(9);  // 이름 배경 + 그림자 (매 프레임 재드로우)
        this.horses      = [];
        this.horseEmojis = [];   // 🏇 Text 오브젝트
        this.nameLabels  = [];
        this.statusIcons = [];

        // 등급별 고유 색상: 일반만 랜덤, 레어/에픽은 고정 (오라·이름표에 사용)
        const TIER_COLOR_RARE = 0x8A2BE2;   // 보라 (신비로운)
        const TIER_COLOR_EPIC = 0xFFD700;   // 황금 (압도적)
        // 6명 이하: 색 겹침 없이 서로 다른 색 부류에서 1개씩. 7명 이상: 30색 셔플.
        const palette = pickDistinctColorsForCount(this.numHorses);
        const isSmallRace = this.numHorses <= 6;

        for (let i = 0; i < this.numHorses; i++) {
            const laneY = TRACK_TOP + i * LANE_H + LANE_H / 2;
            const tierDef = pickTier();
            const color = tierDef.tier === TIER_EPIC ? TIER_COLOR_EPIC
                : tierDef.tier === TIER_RARE ? TIER_COLOR_RARE
                    : (isSmallRace ? palette[i] : palette[i % palette.length]);
            const baseSpeed = Phaser.Math.FloatBetween(5.2, 6.8) + tierDef.speedBonus;

            this.horses.push({
                idx:               i,
                name:              this.names[i],
                color,
                tier:              tierDef.tier,
                emoji:             tierDef.emoji,
                trailParticle:     tierDef.trail,
                boosterChanceMul:  tierDef.boosterMul,
                dodgeMul:          tierDef.dodgeMul,
                x:                 120,
                baseY:             laneY,
                y:                 laneY,
                speed:             0,
                baseSpeed,
                rank:              i + 1,
                finished:          false,
                finishOrder:       -1,
                isBoosting:        false,
                boostFrames:       0,
                isStumbling:       false,
                stumbleFrames:     0,
                isSpinning:        false,
                spinFrames:        0,
                rotation:          0,
                scaleBonus:        1.0,
                isDodging:         false,
                dodgeTargetY:      laneY,
                obstacleDecisions: new Map(),
            });

            // 등급별 이모지 텍스트 (TODO: 말 이미지 교체 부분 – Sprite로 대체 가능)
            this.horseEmojis.push(
                this.add.text(120, laneY, tierDef.emoji, { fontSize: `${HORSE_FONT}px` })
                    .setOrigin(0.5).setDepth(10)
            );

            this.nameLabels.push(
                this.add.text(0, 0, this.names[i], {
                    fontFamily: '"Pretendard",Arial,sans-serif',
                    fontSize: `${FONT_SZ}px`,
                    color: '#ffffff',
                    stroke: '#000000', strokeThickness: 2,
                }).setOrigin(0.5).setDepth(11)
            );

            this.statusIcons.push(
                this.add.text(0, 0, '', {
                    fontSize: `${Phaser.Math.Clamp(FONT_SZ + 5, 11, 22)}px`,
                }).setDepth(12)
            );
        }

        // ── 순위표 (우측 상단, 상대 좌표 사용) ─────────────────
        this._createLeaderboard();

        // ── 모드 표시 라벨 ───────────────────────────────────
        const modeLabel = this.mode === 'winner' ? I18N[currentLang].modeWinner : I18N[currentLang].modeLoser;
        const modeColor = this.mode === 'winner' ? '#FFD700' : '#FF6666';
        this.add.text(16, 8, modeLabel, {
            fontFamily: '"Pretendard",Arial', fontSize: '12px',
            color: modeColor, stroke: '#000', strokeThickness: 2,
        }).setScrollFactor(0).setDepth(52);

        // ── 미니맵 (하단, 안전 여백) ─────────────────────────
        this._createMinimap();

        // ── 마지막 스퍼트 연출용 오버레이 (숨김) ─────────────
        const cw = this.cameras.main.width, ch = this.cameras.main.height;
        this.finalLapOverlay = this.add.rectangle(cw / 2, ch / 2, cw + 200, ch + 200, 0xFF0000, 0)
            .setScrollFactor(0).setDepth(88).setVisible(false);

        // 슬로우모션 연출용 오버레이 & 텍스트 (꼴찌 뽑기: 마지막 말이 결승선 직전일 때)
        this.slowMoOverlay = this.add.rectangle(cw / 2, ch / 2, cw + 200, ch + 200, 0x000033, 0)
            .setScrollFactor(0).setDepth(89).setVisible(false);
        this.slowMoText = this.add.text(cw / 2, ch * 0.28, '🐢  S · L · O · W', {
            fontFamily: '"Orbitron","Pretendard",Arial',
            fontSize: '40px',
            color: '#00EEFF',
            stroke: '#003355',
            strokeThickness: 7,
            shadow: { offsetX: 0, offsetY: 0, color: '#0088FF', blur: 22, fill: true },
        }).setOrigin(0.5).setScrollFactor(0).setDepth(96).setAlpha(0).setVisible(false);

        // 전체화면 시 씬 내부 '닫기' 버튼 (모바일에서 HTML 버튼이 보이지 않을 때 대비)
        this._createFullscreenExitButton();

        // ── 카운트다운 ──────────────────────────────────────
        this.time.delayedCall(400, () => this._showCountdown());
    }

    _createFullscreenExitButton() {
        const camW = this.cameras.main.width;
        const btnW = 140, btnH = 40;
        const bx = camW - btnW / 2 - 16;
        const by = 36;
        const bg = this.add.graphics().setScrollFactor(0).setDepth(9999);
        const drawBg = (c) => {
            bg.clear();
            bg.fillStyle(c, 0.95);
            bg.fillRoundedRect(bx - btnW / 2, by - btnH / 2, btnW, btnH, 8);
            bg.lineStyle(2, 0xFFD700, 1);
            bg.strokeRoundedRect(bx - btnW / 2, by - btnH / 2, btnW, btnH, 8);
        };
        drawBg(0x1a1a3a);
        const lbl = this.add.text(bx, by, I18N[currentLang].fsExitLabel, {
            fontFamily: '"Pretendard",Arial', fontSize: '13px', color: '#FFD700',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10000);
        const hit = this.add.rectangle(bx, by, btnW, btnH).setScrollFactor(0).setDepth(10001)
            .setInteractive({ useHandCursor: true })
            .on('pointerover', () => drawBg(0x2a2a5a))
            .on('pointerout', () => drawBg(0x1a1a3a))
            .on('pointerdown', () => { if (this.scale.isFullscreen) this.scale.stopFullscreen(); });
        this._fsExitContainer = [bg, lbl, hit];
        this._fsExitContainer.forEach(o => o.setVisible(false));
        this._onFsEnter = () => this._fsExitContainer.forEach(o => o.setVisible(true));
        this._onFsLeave = () => this._fsExitContainer.forEach(o => o.setVisible(false));
        this.scale.on('enterfullscreen', this._onFsEnter);
        this.scale.on('leavefullscreen', this._onFsLeave);
    }

    // ── Track ─────────────────────────────────────────────────
    _drawTrack() {
        const { TRACK_TOP, LANE_H } = this.layout;
        const gfx = this.add.graphics().setDepth(4);

        for (let i = 0; i < this.numHorses; i++) {
            gfx.fillStyle(i % 2 === 0 ? 0x3c7828 : 0x326420, 1);
            gfx.fillRect(0, TRACK_TOP + i * LANE_H, TRACK_LEN + 600, LANE_H);
        }
        gfx.lineStyle(1, 0xffffff, 0.10);
        for (let i = 1; i < this.numHorses; i++) {
            gfx.lineBetween(0, TRACK_TOP + i * LANE_H, TRACK_LEN + 600, TRACK_TOP + i * LANE_H);
        }
        const trackBot = TRACK_TOP + LANE_H * this.numHorses;
        gfx.lineStyle(2.5, 0xffffff, 0.55);
        gfx.lineBetween(0, TRACK_TOP, TRACK_LEN + 600, TRACK_TOP);
        gfx.lineBetween(0, trackBot, TRACK_LEN + 600, trackBot);
        gfx.fillStyle(0xffffff, 0.60);
        for (let x = 0; x <= TRACK_LEN + 600; x += 90) gfx.fillRect(x, TRACK_TOP - 12, 3, 10);
        gfx.fillRect(0, TRACK_TOP - 6, TRACK_LEN + 600, 2.5);
        gfx.lineStyle(1, 0xffffff, 0.18);
        for (let x = 1000; x < TRACK_LEN; x += 1000) {
            gfx.lineBetween(x, TRACK_TOP, x, trackBot);
            this.add.text(x, TRACK_TOP - 16, `${x / 100}m`, {
                fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontFamily: 'Arial',
            }).setOrigin(0.5, 1).setDepth(5);
        }
    }

    _drawFinishLine() {
        const { TRACK_TOP, LANE_H } = this.layout;
        const gfx    = this.add.graphics().setDepth(6);
        const trackH = LANE_H * this.numHorses;
        const cSz    = Phaser.Math.Clamp(Math.floor(LANE_H * 0.65), 12, 26);

        for (let row = 0; row * cSz < trackH; row++) {
            for (let col = 0; col < 2; col++) {
                gfx.fillStyle((row + col) % 2 === 0 ? 0xffffff : 0x111111, 1);
                gfx.fillRect(FINISH_X + col * cSz, TRACK_TOP + row * cSz, cSz, cSz);
            }
        }
        gfx.fillStyle(0xFF2222, 1);
        gfx.fillRect(FINISH_X - 7,          TRACK_TOP - 58, 10, trackH + 68);
        gfx.fillRect(FINISH_X + cSz * 2 - 3, TRACK_TOP - 58, 10, trackH + 68);
        gfx.fillStyle(0x111111, 0.88);
        gfx.fillRoundedRect(FINISH_X - 24, TRACK_TOP - 56, 118, 28, 6);
        this.add.text(FINISH_X + 27, TRACK_TOP - 42, '🏁 FINISH', {
            fontFamily: '"Orbitron",Arial', fontSize: '13px',
            color: '#FFD700', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(7);
    }

    // ── Obstacles ─────────────────────────────────────────────
    _generateObstacles() {
        const { TRACK_TOP, LANE_H } = this.layout;
        const count      = Phaser.Math.Clamp(this.numHorses * 5, 20, 90);
        const obsFontSz  = Phaser.Math.Clamp(Math.floor(LANE_H * 0.50), 10, 28);

        for (let i = 0; i < count; i++) {
            const x       = Phaser.Math.Between(500, FINISH_X - 400);
            const laneIdx = Phaser.Math.Between(0, this.numHorses - 1);
            const y       = TRACK_TOP + laneIdx * LANE_H + LANE_H / 2;
            const def     = pickObstacleDef();

            const txt = this.add.text(x, y, def.emoji, { fontSize: `${obsFontSz}px` })
                .setOrigin(0.5).setDepth(7.5);

            // 살랑이는 애니메이션
            this.tweens.add({
                targets: txt, y: y - 4, yoyo: true, repeat: -1,
                duration: 750 + Math.random() * 500, ease: 'Sine.easeInOut',
                delay: Math.random() * 600,
            });

            this.obstacleGroup.push({ id: i, x, y, laneIdx, type: def.type, textObj: txt, collected: false });
        }
    }

    // ── Leaderboard: 참가자 수에 맞춰 전원 표시, 짤림 방지 ─
    _createLeaderboard() {
        const camW = this.cameras.main.width;
        const camH = this.cameras.main.height;
        const LBW  = 178;
        const LBX  = camW - LBW - 20;
        const LBY  = 14;  // 상단 여백 (1~4위 짤림 방지)
        const HEADER_H = 28;

        // 미니맵 위까지 여유 공간 확보 (하단 30위 짤림 방지)
        const mmTop = camH - MM_H - 8;
        const LBH   = mmTop - LBY - 16;
        const ROW_H = Math.max(12, Math.floor((LBH - HEADER_H) / this.numHorses));

        const bg = this.add.graphics().setScrollFactor(0).setDepth(50);
        bg.fillStyle(0x05050e, 0.30);
        bg.fillRoundedRect(LBX, LBY, LBW, LBH, 10);
        bg.lineStyle(1.5, 0xFFD700, 0.65);
        bg.strokeRoundedRect(LBX, LBY, LBW, LBH, 10);
        this.lbBg = bg;

        this.lbTitle = this.add.text(LBX + LBW / 2, LBY + 12, I18N[currentLang].leaderboard, {
            fontSize: '11px', fontFamily: '"Pretendard",Arial',
            color: '#FFD700', fontStyle: 'bold',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(51);

        this.lbTexts = [];
        const lbFontSz = this.numHorses <= 10
            ? Phaser.Math.Clamp(ROW_H - 2, 14, 18)
            : Math.max(8, Math.min(11, ROW_H - 3));
        let y0 = LBY + HEADER_H;
        for (let i = 0; i < this.numHorses; i++) {
            this.lbTexts.push(
                this.add.text(LBX + 10, y0 + i * ROW_H + ROW_H / 2, `${I18N[currentLang].rankPrefix}${i + 1}${I18N[currentLang].rankSuffix}  -`, {
                    fontSize: `${lbFontSz}px`, fontFamily: '"Pretendard",Arial', color: '#cccccc',
                }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(51)
            );
        }
        this.lbFontSz = lbFontSz;

        this.lbRowH = ROW_H;
        this.lbX = LBX;
        this.lbY = LBY;
        this.lbW = LBW;
        this.lbH = LBH;
    }

    // ── Minimap (하단, 상대 좌표) ─────────────────────────────
    _createMinimap() {
        const camW = this.cameras.main.width, camH = this.cameras.main.height;
        const MMX = 2, MMY = camH - MM_H - 5, MMW = camW - 4;

        const bg = this.add.graphics().setScrollFactor(0).setDepth(50);
        bg.fillStyle(0x05050e, 0.82);
        bg.fillRoundedRect(MMX, MMY, MMW, MM_H, 5);
        bg.lineStyle(1, 0xFFD700, 0.35);
        bg.strokeRoundedRect(MMX, MMY, MMW, MM_H, 5);
        // 결승선 마커
        const flPct = FINISH_X / TRACK_LEN;
        bg.fillStyle(0xFF3333, 0.85);
        bg.fillRect(MMX + 30 + (MMW - 36) * flPct, MMY, 2, MM_H);

        this.add.text(MMX + 8, MMY + MM_H / 2, 'MAP', {
            fontSize: '8px', color: 'rgba(255,255,255,0.3)', fontFamily: 'Arial',
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(51);

        const dotR = Phaser.Math.Clamp(5 - Math.floor(this.numHorses / 8), 2, 5);
        this.mmDots = this.horses.map(h =>
            this.add.circle(MMX + 30, MMY + MM_H / 2, dotR, h.color)
                .setScrollFactor(0).setDepth(52)
        );
        this.mmX = MMX; this.mmY = MMY; this.mmW = MMW;
    }

    // ── Countdown ─────────────────────────────────────────────
    _showCountdown() {
        const cx = this.cameras.main.centerX, cy = this.cameras.main.centerY;
        const cd = this.add.text(cx, cy, '', {
            fontFamily: '"Orbitron",Arial', fontSize: '110px',
            color: '#FFD700', stroke: '#000', strokeThickness: 8,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(100);

        let n = 3;
        const tick = () => {
            if (n > 0) {
                if (n === 3) this.sound.play(SFX_COUNTDOWN);  // 카운트다운 효과음 한 번만
                cd.setText(`${n}`).setAlpha(1).setScale(1.6).setColor('#FFD700');
                this.tweens.add({ targets: cd, scaleX: 0.75, scaleY: 0.75, alpha: 0.25, duration: 880, ease: 'Power2' });
                n--;
                this.time.delayedCall(1000, tick);
            } else {
                cd.setText('GO! 🏁').setColor('#00FF88').setAlpha(1).setScale(2.2);
                this.tweens.add({
                    targets: cd, scaleX: 0.2, scaleY: 0.2, alpha: 0, duration: 700, ease: 'Power2',
                    onComplete: () => cd.destroy(),
                });
                this.raceStarted = true;
            }
        };
        tick();
    }

    // ── Parallax (매 프레임 scrollFactor=0 레이어 재드로우) ───
    _updateParallax(camX) {
        const baseY = this.layout.TRACK_TOP - 2;
        const viewW = this.cameras.main.width;

        this.mtGfx.clear();
        this.mtGfx.fillStyle(0x1c2845, 1);
        const mtOff = camX * 0.11, mtP = 480;
        for (let x = Math.floor(mtOff / mtP) * mtP - mtP; x < mtOff + viewW + mtP; x += mtP) {
            const sx = x - mtOff, seed = Math.abs(Math.floor(x / mtP)) % 11;
            this.mtGfx.fillTriangle(sx, baseY, sx + mtP / 2, baseY - 80 - seed * 12, sx + mtP, baseY);
        }

        this.hillGfx.clear();
        this.hillGfx.fillStyle(0x1a4a2a, 1);
        const hiOff = camX * 0.27, hiP = 320;
        for (let x = Math.floor(hiOff / hiP) * hiP - hiP; x < hiOff + viewW + hiP; x += hiP) {
            const sx = x - hiOff, seed = Math.abs(Math.floor(x / hiP)) % 9;
            this.hillGfx.fillTriangle(sx, baseY + 4, sx + hiP / 2, baseY + 4 - 38 - seed * 9, sx + hiP, baseY + 4);
        }

        this.treeGfx.clear();
        const trOff = camX * 0.46, trP = 110;
        for (let x = Math.floor(trOff / trP) * trP - trP; x < trOff + viewW + trP; x += trP) {
            const sx = x - trOff, seed = Math.abs(Math.floor(x / trP)) % 7;
            const h = 30 + seed * 7, w = 16;
            this.treeGfx.fillStyle(0x1a5e2a, 1);
            this.treeGfx.fillTriangle(sx + w / 2, baseY - h, sx, baseY, sx + w, baseY);
            this.treeGfx.fillStyle(0x228c3c, 1);
            this.treeGfx.fillTriangle(sx + w / 2, baseY - h - 10, sx + 3, baseY - h * 0.35, sx + w - 3, baseY - h * 0.35);
        }
    }

    // ── Main Update ───────────────────────────────────────────
    update(time, delta) {
        if (!this.raceStarted || this.raceFinished) return;
        let dt = Math.min(delta / 16.667, 3.0);

        this._updateParallax(this.cameras.main.scrollX);

        // 순위 계산
        const sortedByX = [...this.horses].sort((a, b) => b.x - a.x);
        sortedByX.forEach((h, i) => { if (!h.finished) h.rank = i + 1; });

        const activeCount = this.horses.filter(h => !h.finished).length;

        // 마지막 스퍼트: 선두가 결승 1000px 전이면 한 번만 팝업 + 붉은 점멸 + 막판 부스터 구간 시작
        if (!this.raceFinished && !this.finalLapTriggered && sortedByX[0] && !sortedByX[0].finished && sortedByX[0].x >= FINISH_X - 1000) {
            this._triggerFinalLap(time);
        }

        // ── 슬로우모션: 꼴찌 뽑기 모드에서 1등 말이 결승선에 근접할 때 발동 ──────
        // 마지막 1마리만 남으면 꼴찌가 확정된 상태이므로 슬로우 해제
        if (this.mode === 'loser' && activeCount > 1) {
            const leadHorse = sortedByX[0];
            if (leadHorse) {
                const distToFinish = Math.max(0, FINISH_X - leadHorse.x);
                const SLOW_START = 800;   // 값을 줄일수록 1등이 결승선에 더 가까워졌을 때 슬로우 시작
                if (distToFinish <= SLOW_START) {
                    const t = distToFinish / SLOW_START;    // 1.0(멀) → 0.0(결승 바로 앞)
                    dt *= Phaser.Math.Linear(0.32, 1.0, t); // 첫 인자↑ = 덜 느림 (예: 0.25~0.45)
                    const intensity = 1.0 - t;              // 0.0 → 1.0
                    this.slowMoOverlay.setVisible(true).setAlpha(intensity * 0.28);
                    this.slowMoText.setVisible(true).setAlpha(intensity * 0.90);
                } else {
                    this.slowMoOverlay.setVisible(false);
                    this.slowMoText.setVisible(false);
                }
            }
        } else {
            if (this.slowMoOverlay.visible) this.slowMoOverlay.setVisible(false);
            if (this.slowMoText.visible)    this.slowMoText.setVisible(false);
        }

        // 말 업데이트 & 그리기
        this.nameGfx.clear();
        for (const horse of this.horses) {
            if (!horse.finished) {
                this._updateHorse(horse, activeCount, dt, time);
                this._checkObstacles(horse);
            }
            this._drawHorseVisuals(horse);
        }

        // 레어/에픽 달리기 트레일 파티클 (✨ / 🔥)
        for (const horse of this.horses) {
            if (!horse.finished && horse.trailParticle && Math.random() < 0.22) {
                this._spawnTrailParticle(horse);
            }
        }

        // 카메라
        this._updateCamera(sortedByX);

        // UI (순위는 완주 순·현재 위치 반영)
        this._updateLeaderboard(this._getRankDisplayOrder());
        this._updateMinimap();
    }

    // ── Camera Follow: 선두 추적, 화면 우측(0.65)에 두어 후발 추격전이 잘 보이게 ─
    _updateCamera(sortedByX) {
        const targetHorse = sortedByX[0];
        const viewW       = this.cameras.main.width;
        const offset      = 0.65;
        const targetX     = Phaser.Math.Clamp(targetHorse.x - viewW * offset, 0, TRACK_LEN - viewW + 300);
        this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, targetX, 0.07);
    }

    _triggerFinalLap(time) {
        this.finalLapTriggered = true;
        this.finalLapUntil    = time + 3000;

        const cx = this.cameras.main.centerX, cy = this.cameras.main.centerY;

        const popup = this.add.text(cx, cy, I18N[currentLang].finalSpurt, {
            fontFamily: '"Orbitron","Pretendard",Arial',
            fontSize: '52px',
            color: '#FFDD00',
            stroke: '#CC0000',
            strokeThickness: 8,
            shadow: { offsetX: 0, offsetY: 0, color: '#FF4400', blur: 20, fill: true },
        }).setOrigin(0.5).setScrollFactor(0).setDepth(95).setAlpha(0).setScale(0.5);

        this.tweens.add({
            targets: popup,
            alpha: 1,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: 280,
            ease: 'Back.easeOut',
        });
        this.tweens.add({
            targets: popup,
            alpha: 0,
            scaleX: 1.35,
            scaleY: 1.35,
            duration: 600,
            delay: 1400,
            ease: 'Power2',
            onComplete: () => popup.destroy(),
        });

        this.finalLapOverlay.setVisible(true).setAlpha(0);
        const doFlash = (count) => {
            if (count <= 0) {
                this.finalLapOverlay.setAlpha(0).setVisible(false);
                return;
            }
            this.tweens.add({
                targets: this.finalLapOverlay,
                alpha: 0.4,
                duration: 100,
                yoyo: true,
                hold: 60,
                onComplete: () => {
                    this.finalLapOverlay.setAlpha(0);
                    this.time.delayedCall(80, () => doFlash(count - 1));
                },
            });
        };
        doFlash(3);
    }

    // ── Horse Physics ─────────────────────────────────────────
    _updateHorse(horse, activeCount, dt, time) {
        // Y 회피 복귀
        if (horse.isDodging) {
            horse.y = Phaser.Math.Linear(horse.y, horse.dodgeTargetY, 0.08);
            if (Math.abs(horse.y - horse.dodgeTargetY) < 1.5) {
                if (Math.abs(horse.dodgeTargetY - horse.baseY) > 2) {
                    horse.dodgeTargetY = horse.baseY;   // 제자리로 복귀
                } else {
                    horse.y = horse.baseY;
                    horse.isDodging = false;
                }
            }
        }

        // 스케일 서서히 복귀 (당근 효과)
        if (horse.scaleBonus > 1.0) {
            horse.scaleBonus = Math.max(1.0, horse.scaleBonus - 0.006 * dt);
        }

        // 회전 (돌멩이 충돌 스핀)
        if (horse.isSpinning) {
            horse.spinFrames -= dt;
            horse.rotation   += dt * 0.22;
            if (horse.spinFrames <= 0) { horse.isSpinning = false; horse.rotation = 0; }
        }

        // 속도 계산
        let spd = horse.baseSpeed + Phaser.Math.FloatBetween(-0.45, 0.75);

        if (horse.isBoosting) {
            horse.boostFrames -= dt;
            spd *= 2.2;  // 선두 독주 완화: 3.0 → 2.2
            if (horse.boostFrames <= 0) {
                horse.isBoosting = false;
                horse.consecutiveBoosts = 0; // 연속 부스터 카운트 리셋
            }
        }
        if (horse.isStumbling) {
            horse.stumbleFrames -= dt;
            spd *= 0.5;
            if (horse.stumbleFrames <= 0) horse.isStumbling = false;
        }
        if (horse.isSpinning) spd *= 0.15;

        // 상태 아이콘 업데이트 (스핀 > 부스터 > 걸림 우선순위)
        if      (horse.isSpinning)  this.statusIcons[horse.idx].setText('💫');
        else if (horse.isBoosting)  this.statusIcons[horse.idx].setText('🔥');
        else if (horse.isStumbling) this.statusIcons[horse.idx].setText('❗');
        else                        this.statusIcons[horse.idx].setText('');

        // ★ Rubber-banding: 꼴찌 그룹 부스터 (레어 1.5배, 막판 스퍼트 시 하위권 대폭 상승)
        if (!horse.isBoosting && !horse.isStumbling && activeCount >= 3) {
            const chance = 0.009 * (horse.boosterChanceMul || 1.0);
            const inBack = horse.rank > activeCount * 0.72;
            const finalLapActive = this.finalLapUntil && time < this.finalLapUntil;
            const inBackFinal = horse.rank > activeCount * 0.6;
            const finalChance = 0.048;
            if (finalLapActive && inBackFinal && Math.random() < finalChance) {
                this._triggerBoost(horse);
            } else if (inBack && Math.random() < chance) {
                this._triggerBoost(horse);
            }
        }

        // ★ 선두 그룹(1~3위) '파란 등껍질' 억까: 트랙 절반 넘은 뒤 랜덤 발 꼬임 (1등 > 2등 > 3등 확률)
        if (!horse.isStumbling && !horse.isBoosting && !horse.isSpinning && horse.rank <= 3 && horse.x > TRACK_LEN * 0.5 && activeCount >= 2) {
            const nearFinish = horse.x > FINISH_X * 0.55;
            const stumbleChance = horse.rank === 1 ? (nearFinish ? 0.0042 : 0.0014)
                : horse.rank === 2 ? (nearFinish ? 0.0030 : 0.0010)
                    : (nearFinish ? 0.0020 : 0.0007);
            if (Math.random() < stumbleChance) {
                this._triggerStumble(horse);
            }
        }

        spd = Math.max(0.3, spd);
        horse.speed = spd;
        horse.x    += spd * dt;

        // 결승선 통과
        if (horse.x >= FINISH_X) {
            horse.x          = FINISH_X;
            horse.finished   = true;
            horse.finishOrder = ++this.finishOrder;
            this.allFinished++;
            this._onHorseFinish(horse);
        }
    }

    // ── Obstacle Collision ────────────────────────────────────
    _checkObstacles(horse) {
        const { LANE_H, TRACK_TOP } = this.layout;

        for (const obs of this.obstacleGroup) {
            if (obs.collected) continue;

            const xDist = obs.x - horse.x;
            if (xDist < -30 || xDist > 200) continue;    // X 범위 필터 (성능)

            const yDist    = Math.abs(horse.y - obs.y);
            const decision = horse.obstacleDecisions.get(obs.id);

            // 1. 미결정 & 감지 구역 → 회피/충돌 결정 (당근은 무조건 먹음, 선두 1~3위는 나쁜 장애물 회피 불가)
            if (!decision && xDist > -20 && xDist < 190 && yDist < LANE_H * 0.60 && !horse.isDodging) {
                let dodgeChance;
                if (obs.type === 'carrot') {
                    dodgeChance = 0;
                } else {
                    const isLeaderPenalty = horse.x > TRACK_LEN * 0.5 && horse.rank <= 3;
                    const baseDodge = isLeaderPenalty ? 0 : 0.48;
                    dodgeChance = baseDodge * (horse.dodgeMul !== undefined ? horse.dodgeMul : 1.0);
                }
                if (Math.random() < dodgeChance) {
                    horse.obstacleDecisions.set(obs.id, 'dodge');
                    horse.isDodging = true;
                    const cam = this.cameras.main;
                    const inViewForJump = (horse.x >= cam.scrollX && horse.x <= cam.scrollX + cam.width);
                    if (inViewForJump) {
                        this.sound.play(SFX_JUMP);
                    }
                    const dir = horse.y <= obs.y ? -1 : 1;
                    horse.dodgeTargetY = Phaser.Math.Clamp(
                        horse.baseY + dir * LANE_H * 0.32,
                        TRACK_TOP + LANE_H * 0.18,
                        TRACK_TOP + LANE_H * this.numHorses - LANE_H * 0.18
                    );
                } else {
                    horse.obstacleDecisions.set(obs.id, 'collide');
                }
            }

            // 2. 충돌 결정 & 밀착 → 효과 적용
            if (horse.obstacleDecisions.get(obs.id) === 'collide'
                    && xDist > -25 && xDist < 42 && yDist < LANE_H * 0.45) {
                obs.collected = true;
                this._applyObstacleEffect(horse, obs);
            }
        }
    }

    _applyObstacleEffect(horse, obs) {
        // 카메라 시점에 있을 때만 효과음 재생 (사람이 보는 화면 안에서만)
        const cam = this.cameras.main;
        const inView = (horse.x >= cam.scrollX && horse.x <= cam.scrollX + cam.width);
        if (inView) {
            if (obs.type === 'rock')   this.sound.play(SFX_ROCK);
            if (obs.type === 'puddle') this.sound.play(SFX_PUDDLE);
            if (obs.type === 'carrot') this.sound.play(SFX_CARROT);
        }

        // 장애물 소멸 애니메이션
        this.tweens.add({
            targets: obs.textObj, scaleX: 2.2, scaleY: 2.2, alpha: 0, duration: 380,
            onComplete: () => obs.textObj.setVisible(false),
        });

        if (obs.type === 'carrot') {
            // 🥕 당근: 1등이면 부스터(속도) 없음 — 크기 확대만. 2등 이하는 부스터 + 크기 확대
            if (horse.rank !== 1) this._triggerBoost(horse);
            horse.scaleBonus = 1.45;
            this._spawnPopupText(horse.x, horse.y, I18N[currentLang].carrotEat, '#FF8800');

        } else if (obs.type === 'rock') {
            // 🪨 돌멩이: 스핀 + 밀려남 + 걸림
            horse.isSpinning    = true;
            horse.spinFrames    = 55;
            horse.isStumbling   = true;
            horse.stumbleFrames = 90;
            horse.x             = Math.max(120, horse.x - 65);
            this.cameras.main.shake(260, 0.006);
            this._spawnPopupText(horse.x, horse.y, I18N[currentLang].rockHit, '#FF4444');

        } else if (obs.type === 'puddle') {
            // 💧 웅덩이: 걸림
            this._triggerStumble(horse);
            this._spawnPopupText(horse.x, horse.y, I18N[currentLang].puddleHit, '#4488FF');
        }
    }

    _spawnPopupText(x, y, text, color) {
        const t = this.add.text(x, y - 20, text, {
            fontFamily: '"Pretendard",Arial', fontSize: '17px',
            color, stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(15);
        this.tweens.add({
            targets: t, y: y - 72, alpha: 0, duration: 1200, ease: 'Power1',
            onComplete: () => t.destroy(),
        });
    }

    // ── Horse Render (이모지 + 그림자 + 이름 배경) ────────────
    // TODO: 말 이미지 교체 부분 ──────────────────────────────────
    // 이 함수를 제거하고 horseEmojis 대신 Sprite를 사용하세요:
    //   horse.sprite.setPosition(horse.x, horse.y);
    //   horse.sprite.setRotation(horse.rotation);
    //   horse.sprite.setScale(horse.scaleBonus);
    // ────────────────────────────────────────────────────────────
    _drawHorseVisuals(horse) {
        const { HORSE_FONT, FONT_SZ } = this.layout;
        const ht = this.horseEmojis[horse.idx];
        const nl = this.nameLabels[horse.idx];
        const si = this.statusIcons[horse.idx];
        const g  = this.nameGfx;

        // 이모지 위치 & 변환 (등급별 이모지 유지)
        ht.setPosition(horse.x, horse.y);
        ht.setRotation(horse.rotation);
        ht.setScale(horse.scaleBonus * (horse.isBoosting ? 1.08 : 1.0));
        ht.setAlpha(horse.finished ? 0.5 : 1.0);
        if (horse.emoji) ht.setText(horse.emoji);
        // 이모지(기본 말 이미지는 원본 색 유지)
        ht.clearTint();

        // 고유 색상 오라 (이모지 뒤쪽 은은한 원형 글로우)
        const auraR = HORSE_FONT * 0.72;
        g.fillStyle(horse.color, 0.3);
        g.fillCircle(horse.x, horse.y, auraR);

        // 바닥 그림자 (ellipse)
        g.fillStyle(0x000000, 0.24);
        g.fillEllipse(horse.x + 2, horse.y + HORSE_FONT * 0.50, HORSE_FONT * 0.88, HORSE_FONT * 0.20);

        // 이름 라벨 배경: 텍스트 실제 width + 좌우 12px 패딩 (width 미갱신 시 폴백)
        const nm = String(horse.name || '').trim() || '?';
        nl.setFontSize(`${FONT_SZ}px`);
        nl.setText(nm);
        const PADDING = 14;
        const w = nl.width || 0;
        const charW = FONT_SZ * 0.72;
        const fallbackW = nm.length * charW + PADDING;
        const lblW = Math.max(w + PADDING, fallbackW, 42);
        const lblH = FONT_SZ + 7;
        const lx   = horse.x;
        const ly   = horse.y - HORSE_FONT * 0.62;

        // 등급별 이름표: 오라와 동일한 고정 색상을 테두리에 적용
        const isRare = horse.tier === TIER_RARE;
        const isEpic = horse.tier === TIER_EPIC;
        if (isEpic) {
            g.fillStyle(0x2a0a3a, 0.92);
            g.fillRoundedRect(lx - lblW / 2, ly - lblH, lblW, lblH, 4);
            g.lineStyle(2.5, horse.color, 1.0);
            g.strokeRoundedRect(lx - lblW / 2, ly - lblH, lblW, lblH, 4);
        } else if (isRare) {
            g.fillStyle(0x2a2810, 0.92);
            g.fillRoundedRect(lx - lblW / 2, ly - lblH, lblW, lblH, 4);
            g.lineStyle(2.5, horse.color, 1.0);
            g.strokeRoundedRect(lx - lblW / 2, ly - lblH, lblW, lblH, 4);
        } else {
            g.fillStyle(0x000000, 0.78);
            g.fillRoundedRect(lx - lblW / 2, ly - lblH, lblW, lblH, 4);
            g.lineStyle(2, horse.color, 1.0);
            g.strokeRoundedRect(lx - lblW / 2, ly - lblH, lblW, lblH, 4);
        }

        nl.setPosition(lx, ly - lblH / 2).setOrigin(0.5);
        const nameColor = '#' + ((horse.color & 0xFFFFFF).toString(16).padStart(6, '0')).toUpperCase();
        nl.setColor(horse.isBoosting ? '#FFD700' : nameColor);

        // 부스터 발광 링 (말 고유 색상 톤)
        if (horse.isBoosting) {
            g.lineStyle(2.5, horse.color, 0.85);
            g.strokeCircle(horse.x, horse.y, HORSE_FONT * 0.60);
        }

        // 상태 아이콘 위치
        si.setPosition(horse.x + HORSE_FONT * 0.56, horse.y - HORSE_FONT * 0.50);
    }

    // ── Effects ───────────────────────────────────────────────
    _triggerBoost(horse) {
        // 1등일 때는 부스터 없음 (혼자 앞서가서 다른 말이 안 보이는 것 방지, 순위 바뀌면 다시 가능)
        if (horse.rank === 1) return;
        // 연속 부스터 3개 방지: 이미 2번 연속이면 이번 부스터는 스킵
        const consecutive = (horse.consecutiveBoosts || 0) + 1;
        if (consecutive > 2) return;
        horse.consecutiveBoosts = consecutive;
        horse.isBoosting  = true;
        horse.boostFrames = Phaser.Math.Between(48, 100);  // 선두 독주 완화: 지속시간 단축
        this._spawnBoostFx(horse);
    }
    _triggerStumble(horse) {
        horse.isStumbling   = true;
        horse.stumbleFrames = Phaser.Math.Between(35, 75);
        this._spawnStumbleFx(horse);
    }

    _spawnBoostFx(horse) {
        const { HORSE_FONT } = this.layout;
        const base = horse.color;
        const r = (base >> 16) & 0xFF, g = (base >> 8) & 0xFF, b = base & 0xFF;
        const bright = 0xFFDD88;
        const cols = [
            base,
            (Math.min(255, r + 40) << 16) | (Math.min(255, g + 40) << 8) | Math.min(255, b + 40),
            (Math.min(255, r + 80) << 16) | (Math.min(255, g + 80) << 8) | Math.min(255, b + 80),
            bright,
        ];
        for (let i = 0; i < 10; i++) {
            const px  = horse.x - HORSE_FONT * 0.35 + Phaser.Math.Between(-6, 6);
            const py  = horse.y + Phaser.Math.Between(-Math.floor(HORSE_FONT / 4), Math.floor(HORSE_FONT / 4));
            const col = cols[Math.floor(Math.random() * cols.length)];
            const p   = this.add.circle(px, py, Phaser.Math.Between(4, 11), col).setDepth(9);
            this.tweens.add({
                targets: p,
                x: px - Phaser.Math.Between(28, 80),
                y: py + Phaser.Math.Between(-20, 24),
                alpha: 0, scaleX: 0, scaleY: 0,
                duration: Phaser.Math.Between(280, 560),
                onComplete: () => p.destroy(),
            });
        }
    }

    _spawnStumbleFx(horse) {
        const { HORSE_FONT } = this.layout;
        const col = horse.color;
        for (let i = 0; i < 7; i++) {
            const px = horse.x + Phaser.Math.Between(-12, 24);
            const py = horse.y + Phaser.Math.Between(-Math.floor(HORSE_FONT / 2), 4);
            const p  = this.add.ellipse(px, py, 5, 8, col, 0.9).setDepth(9);
            this.tweens.add({
                targets: p, y: py + 22, alpha: 0, duration: 500, ease: 'Sine.easeIn',
                onComplete: () => p.destroy(),
            });
        }
    }

    _spawnTrailParticle(horse) {
        const { HORSE_FONT } = this.layout;
        const emoji = horse.trailParticle || '✨';
        const px = horse.x - HORSE_FONT * 0.5 + Phaser.Math.Between(-8, 8);
        const py = horse.y + Phaser.Math.Between(-4, 4);
        const t = this.add.text(px, py, emoji, { fontSize: `${Math.max(12, Math.floor(HORSE_FONT * 0.35))}px` })
            .setOrigin(0.5).setDepth(8.5).setAlpha(0.9);
        this.tweens.add({
            targets: t,
            x: px - Phaser.Math.Between(18, 45),
            y: py + Phaser.Math.Between(-8, 8),
            alpha: 0,
            duration: 400,
            ease: 'Power1',
            onComplete: () => t.destroy(),
        });
    }

    // ── Race Finish ───────────────────────────────────────────
    _onHorseFinish(horse) {
        const cam = this.cameras.main;
        const inView = (horse.x >= cam.scrollX && horse.x <= cam.scrollX + cam.width);
        if (inView) {
            this.sound.play(SFX_FINISH);
        }
        if (this.mode === 'winner' && horse.finishOrder === 1) {
            // 1등 우승 모드: 첫 번째 통과자가 우승
            this.winner = horse;
            this._onRaceFinish();
        } else if (this.mode === 'loser' && this.allFinished >= this.numHorses) {
            // 꼴찌 벌칙 모드: 마지막 통과자가 벌칙
            this.winner = horse;
            this._onRaceFinish();
        }
    }

    _onRaceFinish() {
        this.raceFinished = true;
        const viewW = this.cameras.main.width;

        // 슬로우모션 UI 즉시 숨김
        if (this.slowMoOverlay) this.slowMoOverlay.setVisible(false);
        if (this.slowMoText)    this.slowMoText.setVisible(false);

        // 나머지 말들 슬로우모션
        for (const h of this.horses) { if (!h.finished) h.baseSpeed *= 0.22; }

        const targetX = Phaser.Math.Clamp(this.winner.x - viewW / 2, 0, TRACK_LEN - viewW + 300);
        this.tweens.add({
            targets: this.cameras.main, scrollX: targetX, duration: 1100, ease: 'Power2',
            onComplete: () => {
                this._launchConfetti();
                this.time.delayedCall(350, () => {
                    this.sound.play(SFX_FANFARE);  // 우승/꼴찌 패널 뜰 때 fanfare (finish와 겹치지 않게)
                    this._showResultPanel(this.winner);
                });
            },
        });
    }

    _launchConfetti() {
        const viewW = this.cameras.main.width, viewH = this.cameras.main.height;

        // 꼴찌 모드는 붉은 계열 색상으로 장난스러운 연출
        const cols = this.mode === 'loser'
            ? [0xFF4444, 0xFF7777, 0xCC0000, 0xFF2222, 0xFFAAAA, 0x880000, 0xFF6666]
            : [0xFF6B6B, 0x4ECDC4, 0xFFD700, 0x45B7D1, 0xFF8C00, 0x7B68EE, 0x90EE90];

        for (let burst = 0; burst < 7; burst++) {
            this.time.delayedCall(burst * 260, () => {
                for (let i = 0; i < 28; i++) {
                    const cx  = Phaser.Math.Between(40, viewW - 40);
                    const col = cols[Math.floor(Math.random() * cols.length)];
                    const p   = this.add.rectangle(
                        cx, -18, Phaser.Math.Between(6, 14), Phaser.Math.Between(4, 9), col
                    ).setScrollFactor(0).setDepth(200);
                    this.tweens.add({
                        targets: p,
                        x: cx + Phaser.Math.Between(-130, 130), y: viewH + 60,
                        angle: Phaser.Math.Between(-540, 540),
                        alpha: { from: 1, to: 0.35 },
                        duration: Phaser.Math.Between(2000, 4200), ease: 'Sine.easeIn',
                        onComplete: () => p.destroy(),
                    });
                }
            });
        }
    }

    _showResultPanel(subject) {
        const cx = this.cameras.main.centerX, cy = this.cameras.main.centerY;
        const viewW = this.cameras.main.width, viewH = this.cameras.main.height;
        const pw = 590, ph = 330;
        const isWinner   = this.mode === 'winner';
        const accentHex  = isWinner ? 0xFFD700 : 0xFF4444;
        const accentStr  = isWinner ? '#FFD700' : '#FF4444';

        this._elevateLeaderboardForResult();
        this._updateLeaderboard(this._getRankDisplayOrder());

        // 어두운 오버레이
        this.add.rectangle(cx, cy, viewW, viewH, 0x000000, 0.70)
            .setScrollFactor(0).setDepth(150);

        // 패널 배경
        const panBg = this.add.graphics().setScrollFactor(0).setDepth(151);
        panBg.fillStyle(0x0a0a26, 1);
        panBg.fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 22);
        panBg.lineStyle(2.5, accentHex, 1);
        panBg.strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 22);

        // 아이콘 팝업
        const icon = this.add.text(cx, cy - 122, isWinner ? '🏆' : '💣', { fontSize: '66px' })
            .setOrigin(0.5).setScrollFactor(0).setDepth(152).setScale(0);
        this.tweens.add({ targets: icon, scaleX: 1, scaleY: 1, duration: 520, ease: 'Back.easeOut' });

        // 결과 라벨
        const lbl = isWinner ? I18N[currentLang].resultWin : I18N[currentLang].resultLose;
        const mainLbl = this.add.text(cx, cy - 44, lbl, {
            fontFamily: '"Orbitron",Arial', fontSize: '31px',
            color: accentStr, stroke: '#000', strokeThickness: 5,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(152).setScale(0);
        this.tweens.add({ targets: mainLbl, scaleX: 1, scaleY: 1, delay: 220, duration: 500, ease: 'Back.easeOut' });

        // 참가자 이름 페이드인
        const fsz   = Math.min(50, Math.max(24, Math.floor(360 / Math.max(1, subject.name.length))));
        const nameT = this.add.text(cx, cy + 20, subject.name, {
            fontFamily: '"Orbitron","Pretendard",Arial',
            fontSize: `${fsz}px`, color: '#ffffff',
            stroke: accentStr, strokeThickness: 4,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(152).setAlpha(0);
        this.tweens.add({ targets: nameT, alpha: 1, y: cy + 14, delay: 420, duration: 650, ease: 'Power2' });

        // 구분선
        this.add.graphics().setScrollFactor(0).setDepth(152)
            .lineStyle(1, accentHex, 0.35)
            .lineBetween(cx - 215, cy + 60, cx + 215, cy + 60);

        // 버튼
        const btnY = cy + 112;
        this._makeBtn(cx - 148, btnY, I18N[currentLang].btnRestart, 0x4ECDC4, 0x30a898, () => {
            this.scene.restart({ names: this.names, mode: this.mode });
        });
        this._makeBtn(cx + 118, btnY, I18N[currentLang].btnNewSetup, 0xFFD700, 0xFFA500, () => {
            this.scene.start('SetupScene');
        });
    }

    _makeBtn(x, y, label, colNormal, colHover, onClick) {
        const bw = 210, bh = 46;
        const bg = this.add.graphics().setScrollFactor(0).setDepth(153);
        const draw = (c) => { bg.clear(); bg.fillStyle(c, 1); bg.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 10); };
        draw(colNormal);
        this.add.text(x, y, label, {
            fontFamily: '"Pretendard",Arial', fontSize: '14px', color: '#111111', fontStyle: 'bold',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(154);
        this.add.rectangle(x, y, bw, bh)
            .setScrollFactor(0).setDepth(155)
            .setInteractive({ useHandCursor: true })
            .on('pointerover',  () => draw(colHover))
            .on('pointerout',   () => draw(colNormal))
            .on('pointerdown',  onClick);
    }

    // 완주자는 도착 순서, 주행 중은 x 기준 (결승선 동일 x에서도 순위가 맞음)
    _getRankDisplayOrder() {
        return [...this.horses].sort((a, b) => {
            if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
            if (a.finished && !b.finished) return -1;
            if (!a.finished && b.finished) return 1;
            return b.x - a.x;
        });
    }

    _redrawLeaderboardBg(alpha) {
        if (!this.lbBg) return;
        const { lbX: x, lbY: y, lbW: w, lbH: h } = this;
        this.lbBg.clear();
        this.lbBg.fillStyle(0x05050e, alpha);
        this.lbBg.fillRoundedRect(x, y, w, h, 10);
        this.lbBg.lineStyle(1.5, 0xFFD700, 0.65);
        this.lbBg.strokeRoundedRect(x, y, w, h, 10);
    }

    // 결과 패널·딤 위에 순위표가 보이도록 (컨페티 depth 200보다 위)
    _elevateLeaderboardForResult() {
        const d = 220;
        if (this.lbBg) {
            this.lbBg.setDepth(d);
            this._redrawLeaderboardBg(0.82);
        }
        if (this.lbTitle) this.lbTitle.setDepth(d + 1);
        if (this.lbTexts) {
            for (const t of this.lbTexts) t.setDepth(d + 1);
        }
    }

    // ── UI Update: 참가자 전원 순위표 ───────────────────────────
    _updateLeaderboard(sortedByX) {
        const n = sortedByX.length;

        const maxLen = this.numHorses <= 10 ? 8 : this.numHorses <= 20 ? 6 : 5;

        for (let i = 0; i < n && i < this.lbTexts.length; i++) {
            const h   = sortedByX[i];
            const nm  = h.name.length > maxLen ? h.name.slice(0, maxLen - 1) + '…' : h.name;
            const sfx = h.isSpinning ? ' 💫' : h.isBoosting ? ' 🔥' : h.isStumbling ? ' 💦' : '';
            // 닉네임·아이콘 모두 말 고유 색상 유지 (아이템에 따라 색 바꾸지 않음)
            const horseColorCss = '#' + ((h.color & 0xFFFFFF).toString(16).padStart(6, '0')).toUpperCase();
            const col = h.finished ? '#FFD700' : horseColorCss;
            this.lbTexts[i].setText(`${I18N[currentLang].rankPrefix}${i + 1}${I18N[currentLang].rankSuffix}  ${nm}${sfx}`).setColor(col);
        }
    }

    _updateMinimap() {
        const usable = this.mmW - 36;
        for (let i = 0; i < this.horses.length; i++) {
            const pct = Math.min(1, this.horses[i].x / TRACK_LEN);
            this.mmDots[i].x = this.mmX + 30 + usable * pct;
        }
    }
}

// ============================================================
// Phaser 게임 인스턴스
// ============================================================
const horseRaceConfig = {
    type:            Phaser.AUTO,
    width:           HR_W,
    height:          HR_H,
    parent:          'game-container',
    backgroundColor: '#060614',
    scale: {
        mode:       Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [PreloadScene, SetupScene, GameScene],
};

const horseRaceGame = new Phaser.Game(horseRaceConfig);

// ============================================================
// 외부 UI (BGM 토글·볼륨은 Phaser Sound로 제어, 전체화면)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const bgmToggle  = document.getElementById('bgmToggle');
    const volumeCtrl = document.getElementById('volumeControl');
    const fsToggle   = document.getElementById('fsToggle');
    const fullscreenWrap = document.getElementById('horserace-fullscreen-wrap');
    const mobileFsExitBar = document.getElementById('hr-mobile-fs-exit');
    let hrMobileFsBlocked = false;

    // ── i18n: html lang 동적 설정 + HTML DOM 텍스트 교체 ──────
    document.documentElement.setAttribute('lang', currentLang);
    const _L = I18N[currentLang];
    const _setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const _setTxt  = (id, txt)  => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    _setTxt('hr-desc-h2-1',    _L.domDescH2_1);
    _setTxt('hr-desc-h2-2',    _L.domDescH2_2);
    _setHTML('hr-desc-step-1', _L.domDescStep1);
    _setHTML('hr-desc-step-2', _L.domDescStep2);
    _setHTML('hr-desc-step-3', _L.domDescStep3);
    _setHTML('hr-desc-step-4', _L.domDescStep4);
    _setHTML('hr-desc-feat-1', _L.domDescFeat1);
    _setHTML('hr-desc-feat-2', _L.domDescFeat2);
    _setHTML('hr-desc-feat-3', _L.domDescFeat3);
    _setTxt('hrFsExitBtn',       _L.domFsExitBtn);
    _setTxt('hrMobileFsExitBtn', _L.domMobileFsBtn);
    const _volLabel = document.querySelector('label[for="volumeControl"]');
    if (_volLabel) _volLabel.textContent = _L.domVolumeLabel;
    const _backBtn = document.querySelector('.back-btn');
    if (_backBtn) _backBtn.textContent = _L.domHomeBtn;
    if (fsToggle) {
        fsToggle.textContent = _L.domFsToggle;
        fsToggle.setAttribute('title', _L.domFsToggleTip);
    }
    if (bgmToggle) bgmToggle.textContent = _L.bgmOn;
    // bgmOn 레지스트리 명시적 초기화 (미설정 시 true로 켜진 상태로 시작)
    if (horseRaceGame.registry.get('bgmOn') === undefined) {
        horseRaceGame.registry.set('bgmOn', true);
    }
    // ─────────────────────────────────────────────────────────
    const isMobileDevice = () => {
        if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
    };
    const _isMobile = isMobileDevice();
    if (fullscreenWrap && _isMobile) {
        fullscreenWrap.classList.add('hr-mobile-device');
        // 모바일: 레이아웃 확정 후 입력 좌표계 동기화 (버튼 터치 히트 보정)
        const syncMobileInput = () => {
            if (horseRaceGame && horseRaceGame.scale) {
                if (typeof horseRaceGame.scale.updateBounds === 'function') horseRaceGame.scale.updateBounds();
                horseRaceGame.scale.refresh();
            }
        };
        setTimeout(syncMobileInput, 100);
        setTimeout(syncMobileInput, 400);
    }

    // ── 모바일: 전체화면 비권장 안내 모달 + 버튼 비활성화 ─────
    if (_isMobile) {
        hrMobileFsBlocked = true;
        if (fsToggle) fsToggle.style.display = 'none';
        const overlay = document.createElement('div');
        overlay.id = 'hr-mobile-fs-block';
        overlay.style.position = 'fixed';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.zIndex = '99999';
        overlay.style.background = 'rgba(0,0,0,0.78)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '16px';
        overlay.style.boxSizing = 'border-box';
        const box = document.createElement('div');
        box.style.maxWidth = '420px';
        box.style.width = '100%';
        box.style.background = 'rgba(10,10,30,0.96)';
        box.style.border = '1px solid rgba(255,215,0,0.6)';
        box.style.borderRadius = '10px';
        box.style.padding = '18px 20px 16px';
        box.style.color = '#dddddd';
        box.style.fontFamily = '\"Pretendard\", system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        box.style.fontSize = '13px';
        box.style.lineHeight = '1.6';
        const titleEl = document.createElement('div');
        titleEl.textContent = _L.mobileFsBlockTitle;
        titleEl.style.fontSize = '14px';
        titleEl.style.fontWeight = '700';
        titleEl.style.color = '#FFD700';
        titleEl.style.marginBottom = '8px';
        const msgEl = document.createElement('div');
        msgEl.textContent = _L.mobileFsBlockMessage;
        msgEl.style.whiteSpace = 'pre-line';
        msgEl.style.marginBottom = '14px';
        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.justifyContent = 'flex-end';
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.textContent = _L.mobileFsBlockOk;
        okBtn.style.minWidth = '84px';
        okBtn.style.padding = '8px 14px';
        okBtn.style.borderRadius = '6px';
        okBtn.style.border = '1px solid rgba(255,215,0,0.8)';
        okBtn.style.background = 'rgba(255,215,0,0.15)';
        okBtn.style.color = '#FFD700';
        okBtn.style.fontSize = '13px';
        okBtn.style.fontWeight = '600';
        okBtn.style.cursor = 'pointer';
        okBtn.style.webkitTapHighlightColor = 'transparent';
        okBtn.addEventListener('click', () => {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        });
        btnWrap.appendChild(okBtn);
        box.appendChild(titleEl);
        box.appendChild(msgEl);
        box.appendChild(btnWrap);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    // 모바일: 사용자 상호작용 시 AudioContext 잠금 해제 후 BGM 재생 시도 (자동재생 차단 대응)
    let audioJustUnlocked = false;
    const unlockAudio = () => {
        if (horseRaceGame.sound && horseRaceGame.sound.context && horseRaceGame.sound.context.state === 'suspended') {
            horseRaceGame.sound.context.resume();
        }
        const s = horseRaceGame.bgmSound;
        if (s && horseRaceGame.registry.get('bgmOn', true)) {
            try { s.play(); } catch (e) {}
            audioJustUnlocked = true;
            setTimeout(() => { audioJustUnlocked = false; }, 100);
        }
    };
    document.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
    document.addEventListener('click', unlockAudio, { once: true, capture: true }); // capture로 BGM 버튼 클릭보다 먼저 실행

    if (bgmToggle) {
        function updateBgmUI() {
            const on = horseRaceGame.registry.get('bgmOn', true);
            bgmToggle.textContent = on ? I18N[currentLang].bgmOn : I18N[currentLang].bgmOff;
        }
        updateBgmUI();

        bgmToggle.addEventListener('click', () => {
            if (audioJustUnlocked) return; // 첫 클릭은 잠금 해제만, 토글 무시
            const on = !horseRaceGame.registry.get('bgmOn', true);
            horseRaceGame.registry.set('bgmOn', on);
            bgmToggle.textContent = on ? I18N[currentLang].bgmOn : I18N[currentLang].bgmOff;
            if (horseRaceGame.sound) horseRaceGame.sound.mute = !on;
            const s = horseRaceGame.bgmSound;
            if (s) {
                if (on) {
                    if (horseRaceGame.sound.context && horseRaceGame.sound.context.state === 'suspended') {
                        horseRaceGame.sound.context.resume();
                    }
                    try { s.play(); } catch (e) {}
                } else {
                    s.pause();
                }
            }
        });
    }
    if (volumeCtrl) {
        const applyVolume = () => {
            const v = volumeCtrl.value / 100;
            horseRaceGame.registry.set('bgmVolume', v);
            if (horseRaceGame.bgmSound) horseRaceGame.bgmSound.volume = v;
        };
        applyVolume();
        volumeCtrl.addEventListener('input', applyVolume);
        volumeCtrl.addEventListener('change', applyVolume);
        volumeCtrl.addEventListener('touchend', applyVolume);
    }
    // 전체화면: Phaser 네이티브 API 사용, iOS 등 미지원 시 CSS 폴백
    const gameContainer = document.getElementById('game-container');

    const isFullscreen = () => {
        const doc = document;
        return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
    };
    const exitFullscreen = () => {
        const doc = document;
        if (doc.exitFullscreen) doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen();
        else if (doc.msExitFullscreen) doc.msExitFullscreen();
    };
    const hrFsExitBtn = document.getElementById('hrFsExitBtn');
    const updateFullscreenButton = () => {
        const fs = isFullscreen();
        if (fsToggle) {
            fsToggle.textContent = fs ? I18N[currentLang].domFsToggleExit : I18N[currentLang].domFsToggle;
            fsToggle.setAttribute('title', fs ? I18N[currentLang].domFsExitTip : I18N[currentLang].domFsToggleTip);
        }
        if (fullscreenWrap) {
            if (fs) fullscreenWrap.classList.add('hr-fullscreen-active');
            else fullscreenWrap.classList.remove('hr-fullscreen-active');
        }
        if (mobileFsExitBar) {
            const active = fullscreenWrap && fullscreenWrap.classList.contains('hr-fullscreen-active');
            if (active && isMobileDevice()) {
                mobileFsExitBar.style.display = 'flex';
            } else {
                mobileFsExitBar.style.display = 'none';
            }
        }
        fixFullscreenDomOverlay();
    };

    if (fullscreenWrap && horseRaceGame.scale) {
        horseRaceGame.scale.fullscreenTarget = fullscreenWrap;
    }
    const forceFullscreenFill = () => {
        if (!gameContainer || !isFullscreen()) return;
        // 모바일 기기에서는 Phaser의 FIT 스케일에만 맡기고, 추가 CSS 스케일은 건너뛰어 터치 좌표를 맞춘다.
        if (fullscreenWrap && fullscreenWrap.classList.contains('hr-mobile-device')) {
            fixFullscreenDomOverlay();
            return;
        }
        gameContainer.style.position = 'absolute';
        gameContainer.style.top = '0';
        gameContainer.style.left = '0';
        gameContainer.style.right = '0';
        gameContainer.style.bottom = '0';
        gameContainer.style.width = '100vw';
        gameContainer.style.height = '100vh';
        gameContainer.style.display = 'flex';
        gameContainer.style.alignItems = 'center';
        gameContainer.style.justifyContent = 'center';
        const wrapper = gameContainer.querySelector(':scope > div:not(#hr-setup-overlay)');
        if (wrapper) {
            wrapper.style.position = 'absolute';
            wrapper.style.top = '0';
            wrapper.style.left = '0';
            wrapper.style.right = '0';
            wrapper.style.bottom = '0';
            wrapper.style.width = '100%';
            wrapper.style.height = '100%';
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.justifyContent = 'center';
        }
        const canvas = gameContainer.querySelector('canvas');
        if (canvas) {
            canvas.style.width = '100vw';
            canvas.style.height = '100vh';
            canvas.style.maxWidth = '100vw';
            canvas.style.maxHeight = '100vh';
            canvas.style.objectFit = 'contain';
            canvas.style.objectPosition = 'center center';
        }
        fixFullscreenDomOverlay();
    };
    const fixFullscreenDomOverlay = () => {
        const overlay = document.getElementById('hr-setup-overlay');
        if (!overlay) return;
        const active = isFullscreen() || (fullscreenWrap && fullscreenWrap.classList.contains('hr-fullscreen-active'));
        if (active) {
            const scW = window.innerWidth, scH = window.innerHeight;
            const scale = Math.min(scW / HR_W, scH / HR_H);
            const contentW = HR_W * scale;
            const contentH = HR_H * scale;
            const offsetX = (scW - contentW) / 2;
            const offsetY = (scH - contentH) / 2;
            overlay.style.position  = 'absolute';
            overlay.style.width     = (HR_W * 0.58 * scale) + 'px';
            overlay.style.height    = (HR_H * 0.18 * scale) + 'px';
            overlay.style.top       = (offsetY + HR_H * 0.21 * scale) + 'px';
            overlay.style.left      = (offsetX + contentW / 2) + 'px';
            overlay.style.transform = 'translateX(-50%)';
        } else {
            overlay.style.position  = '';
            overlay.style.width     = '';
            overlay.style.height    = '';
            overlay.style.top       = '';
            overlay.style.left      = '';
            overlay.style.transform = '';
        }
    };
    const refreshScaleOnFullscreen = () => {
        if (!gameContainer || !horseRaceGame.scale) return;
        const doRefresh = () => {
            forceFullscreenFill();
            if (horseRaceGame.scale) horseRaceGame.scale.refresh();
            forceFullscreenFill();
        };
        requestAnimationFrame(() => {
            doRefresh();
            requestAnimationFrame(() => doRefresh());
            setTimeout(doRefresh, 50);
            setTimeout(doRefresh, 150);
            setTimeout(doRefresh, 400);
        });
    };
    horseRaceGame.scale.on('enterfullscreen', () => {
        updateFullscreenButton();
        refreshScaleOnFullscreen();
    });
    horseRaceGame.scale.on('fullscreenfailed', () => {
        if (gameContainer) gameContainer.classList.add('fullscreen-fallback');
        if (fullscreenWrap) fullscreenWrap.classList.add('hr-fullscreen-active');
        updateFullscreenButton();
    });
    horseRaceGame.scale.on('fullscreenunsupported', () => {
        if (gameContainer) gameContainer.classList.add('fullscreen-fallback');
        if (fullscreenWrap) fullscreenWrap.classList.add('hr-fullscreen-active');
        updateFullscreenButton();
    });
    const clearFullscreenStyles = () => {
        if (!gameContainer) return;
        gameContainer.classList.remove('fullscreen-fallback');
        gameContainer.style.width = '';
        gameContainer.style.height = '';
        gameContainer.style.position = '';
        gameContainer.style.top = '';
        gameContainer.style.left = '';
        gameContainer.style.right = '';
        gameContainer.style.bottom = '';
        gameContainer.style.display = '';
        gameContainer.style.alignItems = '';
        gameContainer.style.justifyContent = '';
        const wrapper = gameContainer.querySelector(':scope > div:not(#hr-setup-overlay)');
        if (wrapper) {
            wrapper.style.position = '';
            wrapper.style.top = '';
            wrapper.style.left = '';
            wrapper.style.right = '';
            wrapper.style.bottom = '';
            wrapper.style.width = '';
            wrapper.style.height = '';
            wrapper.style.display = '';
            wrapper.style.alignItems = '';
            wrapper.style.justifyContent = '';
        }
        const canvas = gameContainer.querySelector('canvas');
        if (canvas) {
            canvas.style.width = '';
            canvas.style.height = '';
            canvas.style.maxWidth = '';
            canvas.style.maxHeight = '';
            canvas.style.objectFit = '';
            canvas.style.objectPosition = '';
        }
        fixFullscreenDomOverlay();
    };
    horseRaceGame.scale.on('leavefullscreen', () => {
        clearFullscreenStyles();
        updateFullscreenButton();
    });
    const onFullscreenChange = () => {
        updateFullscreenButton();
        if (!isFullscreen()) {
            clearFullscreenStyles();
        } else {
            refreshScaleOnFullscreen();
        }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
    document.addEventListener('MSFullscreenChange', onFullscreenChange);

    if (fsToggle) {
        fsToggle.addEventListener('click', () => {
            // 모바일에서는 전체화면 진입 자체를 막는다 (DOMContentLoaded 상단에서 버튼도 숨김)
            if (typeof isMobileDevice === 'function' && isMobileDevice()) {
                return;
            }
            if (gameContainer && gameContainer.classList.contains('fullscreen-fallback')) {
                gameContainer.classList.remove('fullscreen-fallback');
                updateFullscreenButton();
            } else if (isFullscreen()) {
                exitFullscreen();
            } else {
                horseRaceGame.scale.toggleFullscreen();
            }
        });
    }
    if (hrFsExitBtn) {
        hrFsExitBtn.addEventListener('click', () => {
            if (isFullscreen()) exitFullscreen();
            if (gameContainer && gameContainer.classList.contains('fullscreen-fallback')) {
                gameContainer.classList.remove('fullscreen-fallback');
                updateFullscreenButton();
            }
        });
    }
    const hrMobileFsExitBtn = document.getElementById('hrMobileFsExitBtn');
    if (hrMobileFsExitBtn) {
        hrMobileFsExitBtn.addEventListener('click', () => {
            if (isFullscreen()) exitFullscreen();
            if (gameContainer && gameContainer.classList.contains('fullscreen-fallback')) {
                gameContainer.classList.remove('fullscreen-fallback');
                updateFullscreenButton();
            }
        });
    }

    // 창 크기/회전 시 캔버스·입력 좌표계 동기화 (모바일 터치 히트박스 정렬)
    const refreshScale = () => {
        if (!horseRaceGame.scale) return;
        if (typeof horseRaceGame.scale.updateBounds === 'function') horseRaceGame.scale.updateBounds();
        horseRaceGame.scale.refresh();
    };
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(refreshScale, 50);
    });
    window.addEventListener('orientationchange', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(refreshScale, 150);
    });

});
