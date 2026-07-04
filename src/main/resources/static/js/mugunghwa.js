'use strict';

// ============================================================
// mugunghwa.js  |  무궁화 꽃이 피었습니다  |  Phaser 3
// Binary World  |  game.binaryworld.kr
// ============================================================

// ── 캔버스 사이즈 ──────────────────────────────────────────
const MG_W = 1000;
const MG_H  = 720;

// ── 트랙 좌표 ──────────────────────────────────────────────
const TRACK_START_X = 180;   // 시작선 X (화면 내 표시용)
const TRACK_END_X   = 890;   // 결승선 X (화면 내 표시용)
const TRACK_DISPLAY_LEN = TRACK_END_X - TRACK_START_X; // 화면에 보이는 트랙 너비(px)

// 실제 게임 진행은 progress(0~1) 기반
// progress=0 → 시작, progress=1 → 결승
// 화면상 x = TRACK_START_X + progress * TRACK_DISPLAY_LEN
// 결승까지 progress=TOTAL_PROGRESS 도달 필요
// 화면상 x = TRACK_START_X + (progress/TOTAL_PROGRESS) * TRACK_DISPLAY_LEN
const TOTAL_PROGRESS    = 1.7;   // 평균 4~5라운드 완주 목표

// ── 속도 (progress/frame, 60fps 기준) ─────────────────────
// 노래 1회(~6초, ~360frame) 동안 이동:
//   SPEED_MIN×360 = 0.21  ~  SPEED_MAX×360 = 0.49
// TOTAL_PROGRESS=1.2 → 평균 3~5라운드 완주
// 매 라운드 완전 재랜덤 → 역전 가능
const SPEED_MIN     = 0.00058;  // progress/frame (느린 라운드)
const SPEED_MAX     = 0.00135;  // progress/frame (빠른 라운드)
// RED 중 이 progress 이상 움직이면 탈락
const ELIM_MOVE_PROG = 0.006;

// ── 게임 규칙 ──────────────────────────────────────────────
const DUR_TURNING   = 150;   // 돌아보기 경고 시간 (ms) – 즉각 반응
const DUR_RED_MIN   = 700;
const DUR_RED_MAX   = 1800;
const CHAR_DELAY_MIN = 90;
const CHAR_DELAY_MAX = 230;
const REACT_MIN     = 30;    // 반응 딜레이 ms (최소)
const REACT_MAX     = 480;   // 반응 딜레이 ms (최대)
const GREEN_CYCLES_MIN = 1;  // 노래 1회 끝나면 바로 돌아봄
const GREEN_CYCLES_MAX = 1;
const GREEN_CYCLE_GAP_MIN = 400;
const GREEN_CYCLE_GAP_MAX = 800;
const DOLL_FALLBACK_MS = 7500;  // 노래 최대 길이 + 약간 버퍼 (빠른 얼음 연결)
const DOLL_HEIGHT_RATIO = 0.72;   // 트랙 높이 대비 인형 높이 비율
const DOLL_PANEL_X_RATIO = 0.48; // 오른쪽 패널 내 X 위치 (클수록 우측)

// ── 컬러 팔레트 ────────────────────────────────────────────
const MG_C = {
    accent:    0xE84393,   // 무궁화 분홍 (신호·강조에만)
    green:     0x22c55e,   // 초록불
    red:       0xef4444,   // 빨간불
    yellow:    0xfacc15,   // 노란불
    bg:        0x1a2e14,   // 잔디밭 어두운 배경
    bgLight:   0x243a1c,   // 잔디밭 밝은 부분
    track:     0xc8a86a,   // 모래/흙 트랙
    trackAlt:  0xb89458,   // 트랙 교대 색
    border:    0x6b5030,   // 경계선 (갈색)
    lane:      0xffffff,   // 레인 구분 (흰색)
    white:     0xffffff,
    jersey:    0x1b6b40,   // 체육복 초록
    panel:     0x080e06,   // 사이드 패널 배경
    panelBdr:  0x3a6028,   // 사이드 패널 테두리
    hudBg:     0x0a120a,   // HUD 배경
};

const PLAYER_COLORS = [
    0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
    0x1abc9c, 0xe67e22, 0xe91e63, 0x00bcd4, 0xffc107,
    0x8bc34a, 0xff5722, 0x673ab7, 0x03a9f4, 0x4caf50,
    0xff9800, 0x9c27b0, 0x009688, 0xf44336, 0x2196f3,
    0xcddc39, 0xff4081, 0x00e5ff, 0x76ff03, 0xffab40,
    0xea80fc, 0x40c4ff, 0xb2ff59, 0xff6d00, 0xccff90,
];

// ── 성격 타입 ──────────────────────────────────────────────
// speedMul 범위를 좁혀 매 라운드 랜덤이 역전의 주요 변수가 되도록
const PERSONALITY = [
    { type: 'bold',     label: '🔥', speedMul: 1.18, reactMul: 1.50 },
    { type: 'bold',     label: '🔥', speedMul: 1.10, reactMul: 1.35 },
    { type: 'normal',   label: '🚶', speedMul: 1.00, reactMul: 1.00 },
    { type: 'normal',   label: '🚶', speedMul: 0.96, reactMul: 0.88 },
    { type: 'cautious', label: '🐢', speedMul: 0.88, reactMul: 0.46 },
];

// ── i18n ───────────────────────────────────────────────────
const _navLang = (typeof navigator !== 'undefined' && navigator.language)
    ? navigator.language.toLowerCase() : '';
const currentLang = _navLang.startsWith('ko') ? 'ko' : _navLang.startsWith('ja') ? 'ja' : 'en';

const I18N = {
    ko: {
        title:       '🌸 무궁화 꽃이 피었습니다',
        subtitle:    '참가자 이름을  쉼표( , )  또는  줄바꿈으로 구분하여 입력하세요',
        placeholder: '예시:\n홍길동, 김철수, 이영희\n또는 한 줄에 한 명씩 입력',
        countSuffix: '명 입력됨',
        countMin:    ' (최소 2명)',
        countMax:    ' (최대 30명 초과!)',
        countOk:     ' ✓',
        modeLabel:   '게임 모드 선택',
        modeWinner:  '🏆 1등 우승 뽑기',
        modeLoser:   '💣 꼴찌 벌칙 뽑기',
        startBtn:    '🚦  게임 시작!',
        msgMin:      '최소 2명 이상 입력해주세요!',
        msgMax:      '최대 30명까지 가능합니다!',
        footerPromo: '내기 · 추첨 · 이벤트에 딱!  사다리타기 · 룰렛 · 말달리자 대신 🌸',
        bgmOn:       '🔊 BGM 켜짐',
        bgmOff:      '🔇 BGM 꺼짐',
        defaultNames:['참가자1', '참가자2'],
        btnRestart:  '🔄 같은 참가자로 재시작',
        btnNewSetup: '✏️ 새로 설정',
        labelStart:  '시작',
        labelFinish: '결승',
        labelRound:  '라운드',
        labelAlive:  '생존',
        stateGreen:  '달려!',
        stateRed:    '멈춰! 🛑',
        stateTurn:   '돌아본다!',
        stateCheck:  '확인 중...',
        msgWinner:   (n) => `🏆 ${n}  생존자!`,
        msgLoser:    (n) => `💀 ${n}  꼴찌!`,
        roundElim:   (n) => `${n}명 탈락!`,
        personalityBold:    '🔥 돌진형',
        personalityNormal:  '🚶 보통형',
        personalityCautious:'🐢 신중형',
        fakeTxt:     '속임수! 🤡',
        phrase:      '무궁화꽃이피었습니다',
        countdownGo: '출발!',
        finishReach: (n) => `${n}  결승 도착!`,
        allElim:     '전원 탈락!',
        domDescH2_1: '방법', domDescH2_2: '특징',
        domDescStep1:'참가자 이름을 <strong>쉼표 또는 줄바꿈</strong>으로 구분해 입력 (2~30명)',
        domDescStep2:'<strong>1등 우승 뽑기</strong> / <strong>꼴찌 벌칙 뽑기</strong> 중 선택 후 <strong>게임 시작!</strong>',
        domDescStep3:'🟢 초록불(달려!) 에 전력 질주, 🔴 얼음을 외치면 즉시 멈춰 — 움직이면 탈락!',
        domDescStep4:'결승선 도착(우승) 또는 첫 번째 탈락자(벌칙) 결정!',
        domDescFeat1:'벌칙·당번·커피 내기 등 <strong>뽑기·추첨용</strong> (사다리·룰렛·말달리자 대신)',
        domDescFeat2:'<strong>라운드마다 속도 랜덤</strong> – 매 라운드 참가자 전원의 속도가 크게 바뀌어 결과 예측 불가',
        domDescFeat3:'<strong>성격 랜덤</strong> – 돌진형·보통형·신중형마다 반응 다름, 최대 30명',
    },
    en: {
        title:       '🌸 Red Light, Green Light',
        subtitle:    'Enter names separated by comma ( , ) or newline',
        placeholder: 'Example:\nAlice, Bob, Charlie\nor one name per line',
        countSuffix: ' entered',
        countMin:    ' (min. 2)',
        countMax:    ' (over 30 max!)',
        countOk:     ' ✓',
        modeLabel:   'Select Game Mode',
        modeWinner:  '🏆 Pick the Winner',
        modeLoser:   '💣 Pick the Loser',
        startBtn:    '🚦  Start Game!',
        msgMin:      'Enter at least 2 names!',
        msgMax:      'Maximum 30 names allowed!',
        footerPromo: 'For bets · draws · events! Replace ladder / roulette 🌸',
        bgmOn:       '🔊 BGM On',
        bgmOff:      '🔇 BGM Off',
        defaultNames:['Player1', 'Player2'],
        btnRestart:  '🔄 Restart (same players)',
        btnNewSetup: '✏️ New setup',
        labelStart:  'START',
        labelFinish: 'FINISH',
        labelRound:  'Round',
        labelAlive:  'Alive',
        stateGreen:  'Go! 🟢',
        stateRed:    'Stop! 🛑',
        stateTurn:   'Turning!',
        stateCheck:  'Checking...',
        msgWinner:   (n) => `🏆 ${n}  Survivor!`,
        msgLoser:    (n) => `💀 ${n}  Last Place!`,
        roundElim:   (n) => `${n} eliminated!`,
        personalityBold:    '🔥 Bold',
        personalityNormal:  '🚶 Normal',
        personalityCautious:'🐢 Cautious',
        fakeTxt:     'Fake! 🤡',
        phrase:      'Green Light!',
        countdownGo: 'GO!',
        finishReach: (n) => `${n}  Finished!`,
        allElim:     'All Eliminated!',
        domDescH2_1: 'How to play', domDescH2_2: 'Features',
        domDescStep1:'Enter names separated by <strong>comma or newline</strong> (2~30)',
        domDescStep2:'Choose <strong>Winner</strong> or <strong>Loser</strong> mode, then <strong>Start!</strong>',
        domDescStep3:'🟢 Green light: run! 🔴 "Freeze!" — any movement = eliminated',
        domDescStep4:'First to the finish (winner) or first eliminated (loser) is decided!',
        domDescFeat1:'Perfect for picks: <strong>bets, duty, coffee</strong> (instead of ladder/roulette)',
        domDescFeat2:'<strong>Speed changes every round</strong> – everyone\'s speed randomizes each round, making results unpredictable',
        domDescFeat3:'<strong>Random personalities</strong> – bold/normal/cautious each react differently, up to 30 players',
    },
    ja: {
        title:       '🌸 ダルマさんがころんだ',
        subtitle:    '参加者名をカンマまたは改行で入力',
        placeholder: '例:\n太郎, 花子\nまたは1行に1名',
        countSuffix: '名入力',
        countMin:    ' (最低2名)',
        countMax:    ' (30名超過!)',
        countOk:     ' ✓',
        modeLabel:   'モード選択',
        modeWinner:  '🏆 優勝を決める',
        modeLoser:   '💣 最下位を決める',
        startBtn:    '🚦  ゲーム開始!',
        msgMin:      '2名以上入力してください!',
        msgMax:      '最大30名までです!',
        footerPromo: '賭け·抽選·イベントに! はしご·ルーレット代わりに 🌸',
        bgmOn:       '🔊 BGM オン',
        bgmOff:      '🔇 BGM オフ',
        defaultNames:['プレイヤー1', 'プレイヤー2'],
        btnRestart:  '🔄 同じメンバーで再開',
        btnNewSetup: '✏️ 新規設定',
        labelStart:  'スタート',
        labelFinish: 'ゴール',
        labelRound:  'ラウンド',
        labelAlive:  '生存',
        stateGreen:  '進め！🟢',
        stateRed:    '止まれ！🛑',
        stateTurn:   '振り向く！',
        stateCheck:  '確認中...',
        msgWinner:   (n) => `🏆 ${n}  生存者！`,
        msgLoser:    (n) => `💀 ${n}  最下位！`,
        roundElim:   (n) => `${n}名脱落！`,
        personalityBold:    '🔥 猪突型',
        personalityNormal:  '🚶 普通',
        personalityCautious:'🐢 慎重型',
        fakeTxt:     'フェイク！🤡',
        phrase:      'だ・る・ま・さ・ん・が・こ・ろ・ん・だ',
        countdownGo: 'スタート！',
        finishReach: (n) => `${n}  ゴール！`,
        allElim:     '全員脱落！',
        domDescH2_1: '遊び方', domDescH2_2: '特徴',
        domDescStep1:'参加者名を<strong>カンマまたは改行</strong>で入力 (2~30名)',
        domDescStep2:'<strong>優勝</strong>/<strong>罰ゲーム</strong>モード選択後<strong>スタート！</strong>',
        domDescStep3:'🟢 青信号(進め!) 、🔴「凍れ！」で動いたら即脱落',
        domDescStep4:'ゴール一番乗り(優勝)または最初の脱落者(罰)を決定！',
        domDescFeat1:'罰ゲーム·担当·コーヒー決めに最適 (はしご·ルーレット代わり)',
        domDescFeat2:'<strong>ラウンドごとにスピード変化</strong> – 毎ラウンド全員の速度が大きく変わり結果予測不可',
        domDescFeat3:'<strong>ランダム性格</strong> – 猪突型·普通·慎重型で反応が違う、最大30名',
    },
};

const L = () => I18N[currentLang];

// ── 색상 유틸 ──────────────────────────────────────────────
function shuffledColors(n) {
    const arr = [...PLAYER_COLORS];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, n);
}

function hexColor(num) {
    return '#' + num.toString(16).padStart(6, '0');
}

// ── 인형 스프라이트 ──────────────────────────────────────────
const IMG_DOLL         = '/img/mugunghwa';
const DOLL_BACK        = 'mg_doll_back';
const DOLL_TURN_HALF   = 'mg_doll_turn_half';
const DOLL_TURN_34     = 'mg_doll_turn_3_4';
const DOLL_FRONT       = 'mg_doll_front';
const ANIM_DOLL_TURN   = 'mg_doll_turn';

// ── 오디오 키 & 경로 ───────────────────────────────────────
const ASSET = '/assets/mugunghwa';
const BGM_KEY        = 'mg_bgm';
const SFX_COUNTDOWN  = 'mg_countdown';
const SFX_DOLL       = 'mg_doll';
const SFX_FREEZE     = 'mg_freeze';
const SFX_GUNSHOT    = 'mg_gunshot';
const SFX_ELIMINATE  = 'mg_eliminate';
const SFX_FINISH     = 'mg_finish';
const SFX_FANFARE    = 'mg_fanfare';

function playSfx(scene, key) {
    if (!scene || !scene.sound || scene.sound.mute) return;
    try { scene.sound.play(key); } catch (e) { /* ignore */ }
}

function initBgm(scene) {
    if (!scene.game.bgmSound) {
        scene.game.bgmSound = scene.sound.add(BGM_KEY, { loop: true });
    }
    let vol = scene.registry.get('bgmVolume');
    if (vol === undefined) {
        const volEl = document.getElementById('volumeControl');
        vol = volEl ? Number(volEl.value) / 100 : 0.3;
        scene.registry.set('bgmVolume', vol);
    }
    scene.game.bgmSound.volume = vol;
    const bgmOn = scene.registry.get('bgmOn', true);
    scene.sound.mute = !bgmOn;
    if (bgmOn) {
        try {
            if (!scene.game.bgmSound.isPlaying) scene.game.bgmSound.play();
        } catch (e) { /* ignore */ }
    }
}

// ============================================================
// PreloadScene – BGM·효과음 로드
// ============================================================
class PreloadScene extends Phaser.Scene {
    constructor() { super({ key: 'PreloadScene' }); }

    preload() {
        this.load.audio(BGM_KEY,       `${ASSET}/bgm.mp3`);
        this.load.audio(SFX_COUNTDOWN, `${ASSET}/countdown.mp3`);
        this.load.audio(SFX_DOLL,      `${ASSET}/mugunghwadoll.mp3`);
        this.load.audio(SFX_FREEZE,    `${ASSET}/freeze.mp3`);
        this.load.audio(SFX_GUNSHOT,   `${ASSET}/gunshot.mp3`);
        this.load.audio(SFX_ELIMINATE, `${ASSET}/eliminate.mp3`);
        this.load.audio(SFX_FINISH,    `${ASSET}/finish.mp3`);
        this.load.audio(SFX_FANFARE,   `${ASSET}/fanfare.mp3`);

        this.load.image(DOLL_BACK,      `${IMG_DOLL}/doll_back.png`);
        this.load.image(DOLL_TURN_HALF, `${IMG_DOLL}/doll_turn_half.png`);
        this.load.image(DOLL_TURN_34,   `${IMG_DOLL}/doll_turn_3_4.png`);
        this.load.image(DOLL_FRONT,     `${IMG_DOLL}/doll_front.png`);
    }

    create() {
        this.scene.start('SetupScene');
    }
}

// ============================================================
// SetupScene – 참가자 설정
// ============================================================
class SetupScene extends Phaser.Scene {
    constructor() { super({ key: 'SetupScene' }); }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const cx = W / 2;
        const MARGIN_TOP = 52;
        const MARGIN_SIDE = 20;
        const shadow = { offsetX: 1, offsetY: 1, color: '#000000', blur: 4, fill: true };

        this.cameras.main.setBackgroundColor('#0a0612');
        this.add.graphics()
            .fillGradientStyle(0x120818, 0x120818, 0x1a0a24, 0x1a0a24, 1)
            .fillRect(0, 0, W, H);

        for (let i = 0; i < 120; i++) {
            this.add.circle(
                Phaser.Math.Between(MARGIN_SIDE, W - MARGIN_SIDE),
                Phaser.Math.Between(MARGIN_TOP, Math.floor(H * 0.72)),
                Math.random() * 1.4 + 0.2,
                0xffffff,
                Math.random() * 0.45 + 0.2
            );
        }

        const titleY = MARGIN_TOP + 28;
        this.add.text(cx, titleY, L().title, {
            fontFamily: '"Orbitron","Pretendard",Arial',
            fontSize: '38px', color: hexColor(MG_C.accent),
            stroke: '#3a0820', strokeThickness: 5,
            shadow,
        }).setOrigin(0.5);

        this.add.text(cx, titleY + 58, L().subtitle, {
            fontFamily: '"Pretendard",Arial', fontSize: '18px', color: '#EEEEEE', fontStyle: 'bold',
            shadow,
        }).setOrigin(0.5);

        // CSS 미디어 쿼리와 동일한 기준(viewport 너비)으로 layoutOffset 계산
        const vw = window.innerWidth || W;
        const layoutOffset = vw < 386 ? 180 : (vw <= 640 ? 90 : 0);
        const domY = titleY + 158 + layoutOffset;
        this._modeLabelY = titleY + 228 + layoutOffset;
        this._startBtnY  = this._modeLabelY + 130;

        // 순수 HTML 오버레이 방식 – Phaser DOM 미사용 (모바일 호환성)
        const overlay = document.getElementById('mg-setup-overlay');
        if (overlay) overlay.classList.add('active');
        const phEl = document.getElementById('mgNamesInput');
        if (phEl) phEl.placeholder = L().placeholder;

        // Phaser 이벤트로 shutdown 훅 등록 (씬 전환 시 오버레이 확실히 숨김)
        this.events.once('shutdown', () => {
            if (overlay) overlay.classList.remove('active');
            const ta = document.getElementById('mgNamesInput');
            if (ta && this._taInputHandler) {
                ta.removeEventListener('input', this._taInputHandler);
                this._taInputHandler = null;
            }
        });

        const FOOT_H = 36;
        this.countText = this.add.text(cx, H - FOOT_H - 22, `0${L().countSuffix}`, {
            fontFamily: '"Pretendard",Arial', fontSize: '21px', color: '#aa88aa', shadow,
        }).setOrigin(0.5);

        const taEl = document.getElementById('mgNamesInput');
        if (taEl) {
            this._taInputHandler = () => this._updateCount(taEl.value);
            taEl.addEventListener('input', this._taInputHandler);
            const last = this.registry.get('lastNames');
            if (last && last.length) { taEl.value = last.join('\n'); this._updateCount(taEl.value); }
        }

        this.add.text(cx, this._modeLabelY, L().modeLabel, {
            fontFamily: '"Pretendard",Arial', fontSize: '14px', color: '#d0a0c0', fontStyle: 'bold', shadow,
        }).setOrigin(0.5);

        this.gameMode = this.registry.get('gameMode') || 'winner';
        this._createModeButtons();

        const startBg = this.add.graphics();
        const SBY = this._startBtnY, SBX = cx - 132, SBW = 264, SBH = 50;
        const drawStart = (c) => {
            startBg.clear();
            startBg.fillStyle(c, 1);
            startBg.fillRoundedRect(SBX, SBY, SBW, SBH, 12);
        };
        drawStart(MG_C.accent);
        this.add.text(cx, SBY + SBH / 2, L().startBtn, {
            fontFamily: '"Orbitron",Arial', fontSize: '22px', color: '#ffffff',
            fontStyle: 'bold', stroke: '#000000', strokeThickness: 4, shadow,
        }).setOrigin(0.5);
        this.add.rectangle(cx, SBY + SBH / 2, SBW, SBH)
            .setInteractive({ useHandCursor: true })
            .on('pointerover', () => drawStart(0xFF69B4))
            .on('pointerout',  () => drawStart(MG_C.accent))
            .on('pointerdown', () => {
                const ta = document.getElementById('mgNamesInput');
                const names = this._parseNames(ta ? ta.value : '');
                if (names.length < 2)  return this._showMsg(L().msgMin);
                if (names.length > 30) return this._showMsg(L().msgMax);
                // 게임 시작 즉시 오버레이 숨기기 (씬 전환 전에 반드시 처리)
                const ov = document.getElementById('mg-setup-overlay');
                if (ov) ov.classList.remove('active');
                this.registry.set('lastNames', names);
                this.registry.set('gameMode', this.gameMode);
                this.scene.start('GameScene', { names, mode: this.gameMode });
            });

        this.msgText = this.add.text(cx, H - FOOT_H - 48, '', {
            fontFamily: '"Pretendard",Arial', fontSize: '14px', color: '#FF6B6B', shadow,
        }).setOrigin(0.5);

        this.add.graphics().fillStyle(0x2a1028, 0.55).fillRect(0, H - FOOT_H, W, FOOT_H);
        this.add.text(cx, H - FOOT_H / 2, L().footerPromo, {
            fontFamily: '"Pretendard",Arial', fontSize: '13px', color: '#ffffff', shadow,
        }).setOrigin(0.5);

        initBgm(this);
    }

    shutdown() {
        // events.once('shutdown') 훅이 주 경로, 여기는 안전망
        const overlay = document.getElementById('mg-setup-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    _parseNames(raw) {
        return raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    }

    _updateCount(raw) {
        const n = this._parseNames(raw).length;
        let suffix = L().countSuffix;
        if      (n < 2)  suffix += L().countMin;
        else if (n > 30) suffix += L().countMax;
        else             suffix += L().countOk;
        this.countText.setText(`${n}${suffix}`);
        this.countText.setColor(n >= 2 && n <= 30 ? '#88ddaa' : '#aa88aa');
    }

    _showMsg(msg) {
        this.msgText.setText(msg);
        this.time.delayedCall(2500, () => { if (this.msgText) this.msgText.setText(''); });
    }

    _createModeButtons() {
        const cx = this.scale.width / 2;
        const y  = this._modeLabelY + 44;
        const bw = 200, gap = 16;
        if (this._modeBtns) this._modeBtns.forEach(o => o.destroy());
        this._modeBtns = [];
        ['winner', 'loser'].forEach((mode, i) => {
            const bx = cx + (i === 0 ? -(bw / 2 + gap / 2) : (bw / 2 + gap / 2));
            const active = this.gameMode === mode;
            const bg = this.add.graphics();
            const draw = (on) => {
                bg.clear();
                bg.fillStyle(on ? MG_C.accent : 0x2a1830, on ? 1 : 0.9);
                bg.lineStyle(2, on ? 0xFF69B4 : 0x5a3050, 1);
                bg.fillRoundedRect(bx - bw / 2, y - 22, bw, 44, 10);
                bg.strokeRoundedRect(bx - bw / 2, y - 22, bw, 44, 10);
            };
            draw(active);
            const label = mode === 'winner' ? L().modeWinner : L().modeLoser;
            const txt = this.add.text(bx, y, label, {
                fontFamily: '"Pretendard",Arial', fontSize: '14px', color: '#ffffff',
            }).setOrigin(0.5);
            const hit = this.add.rectangle(bx, y, bw, 44)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => { this.gameMode = mode; this._createModeButtons(); });
            this._modeBtns.push(bg, txt, hit);
        });
    }
}

// ============================================================
// GameScene – 메인 게임
// ============================================================
class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    init(data) {
        this.playerNames = data.names || L().defaultNames;
        this.gameMode    = data.mode  || 'winner';
        this.numPlayers  = this.playerNames.length;

        // 상태
        this.phase        = 'IDLE';
        this.roundNum     = 0;
        this.gameOver     = false;
        this.players      = [];
        this.phraseIndex  = 0;
        this.charDelay    = 0;
        this.redDuration  = 0;

        // 결승 도착 카운터 (loser 모드 – 마지막 도착자 결정용)
        this.finishCount  = 0;
        this.dollShooting = false;
        this._dollVoice   = null;
        this.greenCycleIndex  = 0;
        this.greenCyclesTotal = GREEN_CYCLES_MIN;
        this._roundEliminated = [];  // 라운드별 탈락자 추적 (실시간 탈락 포함)

        // 순위표 행 참조 – null 초기화 필수 (재시작 시 파괴된 객체 참조 방지)
        this._lbRows     = null;
        this._lbUpdateTick = 0;
    }

    shutdown() {
        this.tweens.killAll();
        if (this.time && typeof this.time.removeAllEvents === 'function') {
            this.time.removeAllEvents();
        }
        // doll 스프라이트 명시적 정리 – 파괴 전 애니메이션 리스너 제거
        if (this.dollSprite) {
            try {
                this.dollSprite.off('animationcomplete');
                this.dollSprite.anims.stop();
            } catch (e) { /* ignore */ }
            this.dollSprite = null;
        }
        // dolls voice만 명시적으로 정지 (stopAll() 사용 시 이미 정지된 사운드에서 null 에러 발생)
        if (this._dollVoice) {
            try { this._dollVoice.stop(); } catch (e) { /* ignore */ }
            this._dollVoice = null;
        }
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        // ── 레이아웃 계산 ─────────────────────────────────
        this.HUD_TOP   = 64;
        this.HUD_BOT   = 68;
        this.TRACK_TOP = this.HUD_TOP;
        this.TRACK_BOT = H - this.HUD_BOT;
        this.TRACK_H   = this.TRACK_BOT - this.TRACK_TOP;
        this.LANE_H    = this.TRACK_H / this.numPlayers;
        this.CHAR_R    = Phaser.Math.Clamp(this.LANE_H / 2 - 3, 5, 20);
        this.FONT_SZ   = Phaser.Math.Clamp(this.LANE_H * 0.42, 8, 16);

        // ── 배경 ──────────────────────────────────────────
        this._drawBackground(W, H);

        // ── 트랙 ──────────────────────────────────────────
        this._drawTrack(W, H);

        // ── 플레이어 생성 ─────────────────────────────────
        this._createPlayers();

        // ── 인형(doll) ────────────────────────────────────
        this._ensureDollAnims();
        this._createDoll();
        this.dollShooting = false;
        this._setDollBack();

        initBgm(this);
        this.sound.volume = 1;

        // ── 신호등 ────────────────────────────────────────
        this.signalGfx = this.add.graphics().setDepth(20);
        this._drawSignal('off');

        // ── HUD ───────────────────────────────────────────
        this._createHUD(W, H);

        // ── 순위표 (왼쪽 패널) ────────────────────────────
        this._createLeaderboard();

        // ── 글자 타이핑 표시 ──────────────────────────────
        this.phraseText = this.add.text(W / 2, this.HUD_TOP / 2, '', {
            fontFamily: '"Pretendard",Arial',
            fontSize: '24px', color: '#ffffff',
            stroke: '#000000', strokeThickness: 3,
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 3, fill: true },
        }).setOrigin(0.5, 0.5).setDepth(21);

        // ── 상태 라벨 (하단) ──────────────────────────────
        this.stateLabel = this.add.text(W / 2, H - this.HUD_BOT / 2, '', {
            fontFamily: '"Orbitron",Arial',
            fontSize: '20px', color: '#ffffff',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0.5).setDepth(21);

        // ── 카운트다운 시작 ───────────────────────────────
        this.time.delayedCall(400, () => this._startCountdown());
    }

    // ────────────────────────────────────────────────────────
    // 배경
    // ────────────────────────────────────────────────────────
    _drawBackground(W, H) {
        // 잔디밭 그라데이션
        this.add.graphics()
            .fillGradientStyle(0x0e1e0a, 0x0e1e0a, MG_C.bg, MG_C.bgLight, 1)
            .fillRect(0, 0, W, H)
            .setDepth(0);

        // 세로 잔디 줄무늬 (운동장 느낌)
        const sg = this.add.graphics().setDepth(0);
        const stripeW = 44;
        for (let x = 0; x < W; x += stripeW * 2) {
            sg.fillStyle(0x1f3518, 0.16);
            sg.fillRect(x, 0, stripeW, H);
        }
    }

    // ────────────────────────────────────────────────────────
    // 트랙
    // ────────────────────────────────────────────────────────
    _drawTrack(W, H) {
        const g = this.add.graphics().setDepth(1);

        // 레인별 교대 모래색
        for (let i = 0; i < this.numPlayers; i++) {
            const ty = this.TRACK_TOP + i * this.LANE_H;
            g.fillStyle(i % 2 === 0 ? MG_C.track : MG_C.trackAlt, 1);
            g.fillRect(TRACK_START_X, ty, TRACK_DISPLAY_LEN, this.LANE_H);
        }

        // 레인 구분 – 흰색 점선
        g.lineStyle(1, 0xffffff, 0.18);
        for (let i = 1; i < this.numPlayers; i++) {
            const y = this.TRACK_TOP + i * this.LANE_H;
            for (let x = TRACK_START_X + 12; x < TRACK_END_X - 8; x += 20) {
                g.lineBetween(x, y, x + 10, y);
            }
        }

        // 트랙 외곽선 (갈색)
        g.lineStyle(3, MG_C.border, 1);
        g.strokeRect(TRACK_START_X, this.TRACK_TOP, TRACK_DISPLAY_LEN, this.TRACK_H);

        // 시작선 (초록)
        g.lineStyle(4, MG_C.green, 1);
        g.lineBetween(TRACK_START_X, this.TRACK_TOP, TRACK_START_X, this.TRACK_BOT);

        // 결승선 (체크무늬)
        const dashH = 10;
        const fl = this.add.graphics().setDepth(2);
        for (let y = this.TRACK_TOP; y < this.TRACK_BOT; y += dashH) {
            const white = Math.floor((y - this.TRACK_TOP) / dashH) % 2 === 0;
            fl.fillStyle(white ? 0xffffff : 0x222222, 1);
            fl.fillRect(TRACK_END_X - 5, y, 10, Math.min(dashH, this.TRACK_BOT - y));
        }

        // 시작·결승 라벨
        const ls = { fontFamily: '"Pretendard",Arial', fontSize: '11px', color: '#ccddcc' };
        this.add.text(TRACK_START_X, this.TRACK_TOP - 14, L().labelStart,  ls).setOrigin(0.5, 1).setDepth(3);
        this.add.text(TRACK_END_X,   this.TRACK_TOP - 14, L().labelFinish, ls).setOrigin(0.5, 1).setDepth(3);

        // 왼쪽 패널 (순위표 영역)
        this.add.graphics()
            .fillStyle(MG_C.panel, 0.92)
            .fillRect(0, 0, TRACK_START_X - 1, H)
            .setDepth(1);
        this.add.graphics()
            .lineStyle(1, MG_C.panelBdr, 0.8)
            .strokeRect(0, 0, TRACK_START_X - 1, H)
            .setDepth(2);

        // 오른쪽 패널 (인형 공간)
        this.add.graphics()
            .fillStyle(MG_C.panel, 0.92)
            .fillRect(TRACK_END_X + 5, 0, W - TRACK_END_X - 5, H)
            .setDepth(1);
    }

    // ────────────────────────────────────────────────────────
    // 플레이어 생성
    // ────────────────────────────────────────────────────────
    _createPlayers() {
        const colors = shuffledColors(this.numPlayers);

        for (let i = 0; i < this.numPlayers; i++) {
            const laneY   = this.TRACK_TOP + i * this.LANE_H + this.LANE_H / 2;
            // 성격은 매번 새로 랜덤 추첨 (재시작 시 다른 결과 보장)
            const pType   = PERSONALITY[Phaser.Math.Between(0, PERSONALITY.length - 1)];
            // reactDelay 에 ±20% 개인 변동 추가 → 같은 성격도 매번 다른 반응속도
            const reactBase = Phaser.Math.Between(REACT_MIN, REACT_MAX) * pType.reactMul;
            const reactMs = reactBase * Phaser.Math.FloatBetween(0.80, 1.20);
            const color   = colors[i];
            const hexCol  = hexColor(color);

            // ── 캐릭터 치수 (레인 높이 기반 자동 조절) ──────
            const ch   = Phaser.Math.Clamp(this.LANE_H * 0.80, 12, 52);
            const cw   = ch * 0.50;
            const bh   = ch * 0.52;   // 몸통 높이
            const lhH  = ch * 0.38;   // 다리 높이
            const lw   = cw * 0.32;   // 다리 너비
            const numR = Phaser.Math.Clamp(cw * 0.36, 4, 13); // 번호 뱃지 반지름
            const legOff = cw * 0.22;

            const container = this.add.container(TRACK_START_X, laneY).setDepth(10);

            // 몸통 (체육복 초록)
            const body = this.add.rectangle(0, -lhH / 2, cw, bh, MG_C.jersey);
            body.setStrokeStyle(Math.max(1, cw * 0.07), color, 0.95);

            // 번호 뱃지 (가슴 중앙)
            const numBg = this.add.circle(0, -lhH / 2 - bh * 0.08, numR, 0xffffff);
            const numTx = this.add.text(0, -lhH / 2 - bh * 0.08, `${i + 1}`, {
                fontFamily: 'Arial', fontStyle: 'bold',
                fontSize: `${Math.max(6, numR * 1.3)}px`,
                color: '#111111',
            }).setOrigin(0.5);

            // 다리 (두 개 rect – 달리기 애니메이션용)
            const legL = this.add.rectangle(-legOff, lhH * 0.5, lw, lhH, color);
            const legR = this.add.rectangle(+legOff, lhH * 0.5, lw, lhH, color);

            // 이름 pill (레인 충분할 때 캐릭터 위에 표시)
            let namePill = null;
            if (this.LANE_H >= 22) {
                const dispName = this.numPlayers <= 10
                    ? this.playerNames[i]
                    : this.numPlayers <= 18
                        ? this.playerNames[i].slice(0, 5)
                        : this.playerNames[i].slice(0, 3);
                namePill = this.add.text(0, -(bh / 2 + lhH / 2 + 4), dispName, {
                    fontFamily: '"Pretendard",Arial',
                    fontSize: `${Math.max(7, this.FONT_SZ)}px`,
                    color: '#ffffff',
                    stroke: '#000000', strokeThickness: 2,
                    backgroundColor: hexCol + 'cc',
                    padding: { x: 4, y: 1 },
                }).setOrigin(0.5, 1);
            }

            // 탈락 ❌
            const elimMark = this.add.text(0, 0, '❌', {
                fontSize: `${Math.max(10, ch * 0.48)}px`,
            }).setOrigin(0.5).setVisible(false);

            const parts = [body, numBg, numTx, legL, legR, elimMark];
            if (namePill) parts.push(namePill);
            container.add(parts);

            this.players.push({
                idx: i, name: this.playerNames[i], color, hexCol,
                progress: 0,
                get x() { return TRACK_START_X + (this.progress / TOTAL_PROGRESS) * TRACK_DISPLAY_LEN; },
                y: laneY,
                alive: true,
                speedMul: pType.speedMul,   // 매 라운드 재랜덤 시 사용
                reactDelay: reactMs,
                personality: pType.type,
                velocity: 0,
                progressAtRed: 0,
                reactionTimer: 0,
                reacting: false,
                inPlaceRunning: false,  // 얼음에 걸려 제자리 달리기 중인 선수
                savedVelocity: 0,       // 얼음 직전 속도 저장
                finished: false,
                rank: null,
                container, body, legL, legR, elimMark,
                legFrame: -1, legH: lhH, legOff,
            });
        }
    }

    // ────────────────────────────────────────────────────────
    // 인형 그리기
    // ────────────────────────────────────────────────────────
    _getDollPos() {
        const panelW = this.scale.width - TRACK_END_X;
        return {
            x: TRACK_END_X + panelW * DOLL_PANEL_X_RATIO,
            y: this.TRACK_TOP + this.TRACK_H / 2,
        };
    }

    _ensureDollAnims() {
        // 이미 존재하면 재생성하지 않음 – remove 후 recreate 시
        // 전역 AnimationManager가 REMOVE_ANIMATION 이벤트를 emit,
        // 이미 파괴된 dollSprite의 잔존 리스너가 null 접근 오류를 일으킬 수 있음
        if (this.anims.exists(ANIM_DOLL_TURN)) return;
        // back → half(90°) → turn_3_4 → front
        this.anims.create({
            key: ANIM_DOLL_TURN,
            frames: [
                { key: DOLL_BACK },
                { key: DOLL_TURN_HALF },
                { key: DOLL_TURN_34 },
                { key: DOLL_FRONT },
            ],
            frameRate: 8,
            repeat: 0,
        });
    }

    _calcDollScale(sprite) {
        const panelW = this.scale.width - TRACK_END_X;
        const targetH  = this.TRACK_H * DOLL_HEIGHT_RATIO;
        const scaleByH = targetH / sprite.height;
        const maxW     = panelW * 0.88;
        const scaleByW = maxW / sprite.width;
        return Math.min(scaleByH, scaleByW);
    }

    _createDoll() {
        const { x, y } = this._getDollPos();
        this.dollSprite = this.add.sprite(x, y, DOLL_BACK)
            .setOrigin(0.5, 0.5)
            .setFlipX(true)
            .setDepth(20);

        this.dollSprite.setScale(this._calcDollScale(this.dollSprite));
    }

    _syncDollTransform() {
        if (!this.dollSprite) return;
        const { x, y } = this._getDollPos();
        this.dollSprite.setPosition(x, y);
        this.dollSprite.setScale(this._calcDollScale(this.dollSprite));
    }

    _setDollBack() {
        if (!this.dollSprite) return;
        this.dollSprite.anims.stop();
        this.dollSprite.clearTint();
        this.dollSprite.setTexture(DOLL_BACK);
        this._syncDollTransform();
    }

    _setDollFront() {
        if (!this.dollSprite) return;
        this.dollSprite.anims.stop();
        this.dollSprite.setTexture(DOLL_FRONT);
        this._syncDollTransform();
        if (this.dollShooting) {
            this.dollSprite.setTint(0xffaaaa);
        } else {
            this.dollSprite.clearTint();
        }
    }

    _playDollTurn(onComplete) {
        if (!this.dollSprite) {
            if (onComplete) onComplete();
            return;
        }
        this.dollSprite.clearTint();
        this._syncDollTransform();
        this.dollSprite.play(ANIM_DOLL_TURN);
        this.dollSprite.once('animationcomplete', () => {
            if (!this.dollSprite) { if (onComplete) onComplete(); return; }
            this.dollSprite.setTexture(DOLL_FRONT);
            this._syncDollTransform();
            if (onComplete) onComplete();
        });
    }

    // ────────────────────────────────────────────────────────
    // 신호등
    // ────────────────────────────────────────────────────────
    _drawSignal(state) {
        const g  = this.signalGfx;
        g.clear();
        const sx = 14, sy = this.HUD_TOP / 2;
        const r  = 9;

        // 외곽 박스
        g.fillStyle(0x222233, 1);
        g.fillRoundedRect(sx - r - 4, sy - r - 4, (r + 2) * 4 + 8, r * 2 + 8, 5);

        // 빨간 등
        g.fillStyle(state === 'red' ? MG_C.red : 0x330000, 1);
        g.fillCircle(sx, sy, r);
        if (state === 'red') {
            g.lineStyle(2, 0xff8888, 0.7);
            g.strokeCircle(sx, sy, r);
        }

        // 노란 등
        g.fillStyle(state === 'yellow' ? MG_C.yellow : 0x332200, 1);
        g.fillCircle(sx + r * 2 + 4, sy, r);

        // 초록 등
        g.fillStyle(state === 'green' ? MG_C.green : 0x003300, 1);
        g.fillCircle(sx + (r * 2 + 4) * 2, sy, r);
        if (state === 'green') {
            g.lineStyle(2, 0x88ff88, 0.7);
            g.strokeCircle(sx + (r * 2 + 4) * 2, sy, r);
        }
    }

    // ────────────────────────────────────────────────────────
    // HUD
    // ────────────────────────────────────────────────────────
    _createHUD(W, H) {
        // 상단 HUD 배경
        const topBg = this.add.graphics().setDepth(19);
        topBg.fillStyle(MG_C.hudBg, 0.82);
        topBg.fillRect(TRACK_START_X, 0, TRACK_DISPLAY_LEN + (W - TRACK_END_X), this.HUD_TOP);

        const st = { fontFamily: '"Pretendard",Arial', fontSize: '13px', color: '#ccddcc', stroke: '#000', strokeThickness: 2 };
        this.aliveText = this.add.text(W - 10, 8,  '', { ...st }).setOrigin(1, 0).setDepth(21);
        this.roundText = this.add.text(W - 10, 26, '', { ...st }).setOrigin(1, 0).setDepth(21);

        // 모드 라벨 (상단 좌측)
        const modeLabel = this.gameMode === 'winner' ? '🏆 1등 뽑기' : '💣 꼴찌 뽑기';
        const modeColor = this.gameMode === 'winner' ? '#FFD700' : '#FF6666';
        this.add.text(TRACK_START_X + 8, 8, modeLabel, {
            fontFamily: '"Pretendard",Arial', fontSize: '12px', color: modeColor,
            stroke: '#000', strokeThickness: 2,
        }).setDepth(21);

        // 하단 미니맵
        const MM_H  = this.HUD_BOT - 14;
        const MM_Y  = this.TRACK_BOT + 7;
        const MM_X0 = TRACK_START_X;
        const MM_W  = TRACK_DISPLAY_LEN;

        const mmBg = this.add.graphics().setDepth(20);
        mmBg.fillStyle(0x2a1e0e, 0.95);
        mmBg.fillRoundedRect(MM_X0 - 2, MM_Y - 2, MM_W + 4, MM_H + 4, 4);
        mmBg.lineStyle(1, MG_C.border, 0.7);
        mmBg.strokeRoundedRect(MM_X0 - 2, MM_Y - 2, MM_W + 4, MM_H + 4, 4);
        // 결승선
        mmBg.lineStyle(2, 0xffffff, 0.9);
        mmBg.lineBetween(MM_X0 + MM_W, MM_Y - 2, MM_X0 + MM_W, MM_Y + MM_H + 2);
        // MAP 라벨
        this.add.text(MM_X0 + 4, MM_Y + MM_H / 2, 'MAP', {
            fontFamily: 'Arial', fontSize: '8px', color: 'rgba(200,200,200,0.45)',
        }).setOrigin(0, 0.5).setDepth(21);

        this._progressGfx = this.add.graphics().setDepth(21);
        this._progressBarMeta = { x0: MM_X0, y0: MM_Y, w: MM_W, h: MM_H };

        this._updateHUD();
    }

    _updateHUD() {
        const alive = this.players.filter(p => p.alive && !p.finished).length;
        this.aliveText.setText(`생존: ${alive}/${this.numPlayers}`);
        this.roundText.setText(`라운드: ${this.roundNum}`);
        this._drawProgressBars();
        this._updateLeaderboard();
    }

    // 하단 미니맵 – 모든 선수를 점으로 표시
    _drawProgressBars() {
        if (!this._progressGfx || !this._progressBarMeta) return;
        const g = this._progressGfx;
        g.clear();
        const { x0, y0, w, h } = this._progressBarMeta;

        // 미니맵 바닥 트랙
        g.fillStyle(0x3a2a0e, 1);
        g.fillRect(x0, y0, w, h);

        const dotR  = Math.max(2, Math.min(5, h * 0.38));
        const dotY  = y0 + h / 2;

        this.players.forEach(p => {
            const pct = Math.min(p.progress / TOTAL_PROGRESS, 1);
            const px  = x0 + pct * w;
            const alpha = p.alive ? 1.0 : 0.28;
            g.fillStyle(p.color, alpha);

            if (p.finished) {
                // 완주 – 사각형 깃발
                g.fillRect(x0 + w - dotR * 1.4, dotY - dotR, dotR * 1.4, dotR * 2);
            } else if (!p.alive) {
                // 탈락 – 작은 × 형태 (x 교차선)
                g.fillStyle(0x888888, 0.4);
                g.fillCircle(px, dotY, dotR * 0.7);
            } else {
                g.fillCircle(Math.min(px, x0 + w - dotR), dotY, dotR);
            }
        });
    }

    // ────────────────────────────────────────────────────────
    // 순위표 (왼쪽 패널)
    // ────────────────────────────────────────────────────────
    _createLeaderboard() {
        const LBX    = 4;
        const LBY    = this.HUD_TOP + 2;
        const LBW    = TRACK_START_X - 8;
        const LBH    = this.TRACK_H - 4;
        const HDR_H  = 18;

        // 헤더
        this.add.text(LBX + LBW / 2, LBY + HDR_H / 2, '순 위', {
            fontFamily: '"Pretendard",Arial', fontSize: '10px',
            color: '#aaddaa', fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(22);

        const ROW_H  = Math.max(9, Math.floor((LBH - HDR_H) / this.numPlayers));
        const fsize  = Phaser.Math.Clamp(ROW_H, 7, 18);
        const maxNm  = this.numPlayers <= 8 ? 7 : this.numPlayers <= 15 ? 5 : 4;

        this._lbRows = [];
        for (let i = 0; i < this.numPlayers; i++) {
            const ry = LBY + HDR_H + i * ROW_H + ROW_H / 2;
            const p  = this.players[i];
            const short = p.name.length > maxNm ? p.name.slice(0, maxNm - 1) + '…' : p.name;

            const dot = this.add.circle(LBX + 6, ry, Math.min(3, ROW_H * 0.3), p.color).setDepth(22);
            const txt = this.add.text(LBX + 14, ry, `${i + 1}.${short}`, {
                fontFamily: '"Pretendard",Arial', fontSize: `${fsize}px`, color: p.hexCol,
            }).setOrigin(0, 0.5).setDepth(22);
            const icon = this.add.text(LBX + LBW - 3, ry, '', {
                fontFamily: 'Arial', fontSize: `${fsize}px`,
            }).setOrigin(1, 0.5).setDepth(22);

            this._lbRows.push({ dot, txt, icon, player: p, initName: `${i + 1}.${short}` });
        }

        this._lbMaxNm = maxNm;
        this._lbFsize = fsize;
        this._lbRowH  = ROW_H;
        this._lbHdrY  = LBY + HDR_H;
        this._lbX     = LBX;
        this._lbW     = LBW;

        // 생성 직후 즉시 올바른 형식(흰색 텍스트, "N위 이름")으로 초기화
        this._updateLeaderboard();
    }

    // 순위표 갱신 – progress 기준 정렬 후 각 행 재배치
    _updateLeaderboard() {
        if (!this._lbRows) return;

        // progress 내림차순 정렬 (완주 > 생존 > 탈락)
        const sorted = [...this.players].sort((a, b) => {
            if (a.finished && !b.finished) return -1;
            if (!a.finished && b.finished) return  1;
            if (!a.alive && b.alive)       return  1;
            if (a.alive && !b.alive)       return -1;
            return b.progress - a.progress;
        });

        sorted.forEach((p, rank) => {
            const row = this._lbRows[rank];
            if (!row) return;
            const ry = this._lbHdrY + rank * this._lbRowH + this._lbRowH / 2;

            const short = p.name.length > this._lbMaxNm
                ? p.name.slice(0, this._lbMaxNm - 1) + '…' : p.name;

            row.dot.setPosition(this._lbX + 6, ry).setFillStyle(p.color);
            const rankLabel = `${rank + 1}위 ${short}`;
            row.txt.setPosition(this._lbX + 14, ry)
                .setText(rankLabel)
                .setColor(p.finished ? '#FFD700' : '#ffffff');  // 탈락자도 흰색 유지 (❌ 아이콘으로 구분)

            const statusIcon = p.finished ? '🏁' : p.alive ? '' : '❌';
            row.icon.setPosition(this._lbX + this._lbW - 3, ry).setText(statusIcon);
        });
    }

    // ────────────────────────────────────────────────────────
    // 카운트다운
    // ────────────────────────────────────────────────────────
    _startCountdown() {
        this.phase = 'COUNTDOWN';
        let count = 3;
        const tick = () => {
            if (count <= 0) {
                this.phraseText.setText('');
                this.time.delayedCall(200, () => this._startGreenPhase());
                return;
            }
            if (count === 3) playSfx(this, SFX_COUNTDOWN);
            this.phraseText.setText(`${count}`).setFontSize('48px').setColor('#FFD700');
            this.tweens.add({
                targets: this.phraseText,
                scaleX: { from: 1.8, to: 1 }, scaleY: { from: 1.8, to: 1 },
                duration: 600, ease: 'Back.easeOut',
            });
            count--;
            this.time.delayedCall(700, tick);
        };
        tick();
    }

    // ────────────────────────────────────────────────────────
    // GREEN 단계
    // ────────────────────────────────────────────────────────
    _startGreenPhase() {
        if (this.gameOver) return;
        this._roundEliminated = [];  // 라운드 시작마다 초기화
        this.phase = 'GREEN';
        this.roundNum++;
        this._updateHUD();
        this._drawSignal('green');
        this._setDollBack();

        this.stateLabel.setText(L().stateGreen).setColor(hexColor(MG_C.green)).setFontSize('20px');
        this.phraseText.setText('').setFontSize('24px').setColor('#ffffff');

        // 매 라운드 완전 재랜덤 속도 → 역전 가능
        // ① 이번 라운드 전체 공통 속도 보정 (느린/빠른 라운드 느낌)
        const roundBump   = 1 + (this.roundNum - 1) * 0.07;
        const roundFactor = Phaser.Math.FloatBetween(0.72, 1.28); // 라운드 전체 ±28% 변동
        // ② 후반 생존자 수에 따른 가속 배수
        const aliveUnfinished = this.players.filter(p => p.alive && !p.finished);
        const lastManBoost = aliveUnfinished.length === 1 ? 2.8
                           : aliveUnfinished.length <= 3 ? 1.6
                           : 1.0;

        this.players.forEach(p => {
            if (!p.alive || p.finished) return;
            // ③ 선수별 독립 랜덤(±25%) × 성격 multiplier × 라운드 공통 변동
            //    → 누구든 빠른/느린 라운드를 뽑을 수 있어 역전 가능성 높음
            const playerRnd = Phaser.Math.FloatBetween(0.75, 1.25);
            p.velocity = Phaser.Math.FloatBetween(SPEED_MIN, SPEED_MAX)
                * p.speedMul * roundBump * roundFactor * playerRnd * lastManBoost;
            p.inPlaceRunning = false;
        });

        // 이번 초록불에서 "무궁화…" 2~3회 반복 후에야 돌아봄
        this.greenCycleIndex  = 0;
        this.greenCyclesTotal = Phaser.Math.Between(GREEN_CYCLES_MIN, GREEN_CYCLES_MAX);
        this._updateGreenCycleLabel();

        // 인형 음성 + 자막
        this._playDollPhrase();
    }

    _updateGreenCycleLabel() {
        if (!this.stateLabel || this.phase !== 'GREEN') return;
        this.stateLabel.setText(L().stateGreen).setColor(hexColor(MG_C.green)).setFontSize('20px');
    }

    _onDollPhraseComplete() {
        if (this.phase !== 'GREEN' || this.gameOver) return;

        this.greenCycleIndex++;
        if (this.greenCycleIndex < this.greenCyclesTotal) {
            // 아직 더 달려야 함 – 잠깐 쉬었다가 다음 구절
            this.phraseText.setText('…').setFontSize('28px').setColor('#aaaaaa');
            this._updateGreenCycleLabel();
            this.time.delayedCall(
                Phaser.Math.Between(GREEN_CYCLE_GAP_MIN, GREEN_CYCLE_GAP_MAX),
                () => {
                    if (this.phase === 'GREEN' && !this.gameOver) this._playDollPhrase();
                }
            );
            return;
        }

        // 2~3회 모두 끝 → 돌아보기
        this.time.delayedCall(Phaser.Math.Between(120, 400), () => {
            if (this.phase !== 'GREEN' || this.gameOver) return;
            this._startTurning();
        });
    }

    _playDollPhrase() {
        const phrase = L().phrase;
        this.phraseText.setText(phrase).setFontSize('22px').setColor('#ffffff');
        this._updateGreenCycleLabel();

        let done = false;
        const proceed = () => {
            if (done || this.phase !== 'GREEN' || this.gameOver) return;
            done = true;
            this._onDollPhraseComplete();
        };

        if (this._dollVoice) {
            try { this._dollVoice.stop(); } catch (e) { /* ignore */ }
            this._dollVoice = null;
        }

        try {
            const fallback = this.time.delayedCall(DOLL_FALLBACK_MS, proceed);
            this._dollVoice = this.sound.play(SFX_DOLL);
            if (this._dollVoice && this._dollVoice.once) {
                this._dollVoice.once('complete', () => {
                    fallback.remove(false);
                    proceed();
                });
            }
        } catch (e) {
            this._typeCharFallback(phrase, proceed);
        }
    }

    _typeCharFallback(phrase, onDone) {
        if (this.phase !== 'GREEN' || this.gameOver) return;
        let idx = 0;
        const step = () => {
            if (this.phase !== 'GREEN' || this.gameOver) return;
            if (idx < phrase.length) {
                this.phraseText.setText(phrase.slice(0, idx + 1));
                idx++;
                this.time.delayedCall(Phaser.Math.Between(CHAR_DELAY_MIN, CHAR_DELAY_MAX), step);
            } else {
                onDone();
            }
        };
        step();
    }


    // ────────────────────────────────────────────────────────
    // TURNING 단계 (경고)
    // ────────────────────────────────────────────────────────
    _startTurning() {
        if (this.gameOver) return;
        this.phase = 'TURNING';
        this._drawSignal('red');
        this.stateLabel.setText(L().stateRed).setColor(hexColor(MG_C.red)).setFontSize('22px');
        this.phraseText.setText('🛑').setColor('#ffffff');
        this.cameras.main.shake(200, 0.010);

        // 노래 끝나는 동시에 freeze 사운드 + 얼음 텍스트
        playSfx(this, SFX_FREEZE);

        // "🧊 얼음!" 대형 텍스트 팡 등장
        const iceText = this.add.text(
            this.scale.width / 2, this.scale.height / 2 - 40,
            '🧊 얼음!', {
                fontSize: '88px',
                fontFamily: 'Arial',
                color: '#aaddff',
                stroke: '#003399',
                strokeThickness: 10,
                shadow: { offsetX: 5, offsetY: 5, color: '#000055', blur: 12, fill: true }
            }
        ).setOrigin(0.5).setDepth(40).setAlpha(0);

        this.tweens.add({
            targets: iceText,
            alpha: { from: 0, to: 1 },
            scaleX: { from: 0.3, to: 1 },
            scaleY: { from: 0.3, to: 1 },
            duration: 250, ease: 'Back.Out',
            onComplete: () => {
                this.tweens.add({
                    targets: iceText, alpha: 0,
                    delay: 700, duration: 350,
                    onComplete: () => iceText.destroy()
                });
            }
        });

        // 화면 파란 플래시 (얼음 느낌)
        const flash = this.add.rectangle(
            this.scale.width / 2, this.scale.height / 2,
            this.scale.width, this.scale.height, 0x0044aa, 0.22
        ).setDepth(35);
        this.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });

        // 인형 돌아보기 애니메이션 + freeze 연출
        this._playDollTurn(() => this._startRedPhase());

        // 얼음과 동시에 전원 즉시 정지 – 반응속도 기반으로 탈락 여부만 결정
        this.players.forEach(p => {
            if (!p.alive || p.finished) return;
            p.progressAtRed = p.progress;
            p.savedVelocity = p.velocity;
            // 모든 선수 즉시 정지 (앞으로 이동 없음)
            p.velocity      = 0;
            p.reacting      = false;
            p.reactionTimer = 0;
            // 이론적 이동량: 반응 딜레이 동안 달렸을 거리 (0.5 감속 반영)
            // 이 값이 임계치 초과면 "얼음에 걸린" 상태 → 제자리 달리기 후 탈락
            const theoreticalMove = (p.reactDelay / 16.67) * p.savedVelocity * 0.5;
            p.inPlaceRunning = theoreticalMove > ELIM_MOVE_PROG;
        });
    }

    // ────────────────────────────────────────────────────────
    // RED 단계
    // ────────────────────────────────────────────────────────
    _startRedPhase() {
        if (this.gameOver) return;
        this.phase = 'RED';
        this.dollShooting = false;
        this._setDollFront();

        // 얼음에 걸린(inPlaceRunning) 선수들 순서대로 즉시 사살
        // Fix 7: 꼴지(progress 낮은 순)부터 사살 → 순위 정확, 꼴찌 뽑기 즉시 결정
        let toElim = this.players
            .filter(p => p.alive && !p.finished && p.inPlaceRunning)
            .sort((a, b) => a.progress - b.progress); // 꼴지 먼저

        // Fix 4: winner 모드에서 모두 탈락 방지 – 현재 생존자가 전부 탈락 대상이면 1위(선두)를 스페어
        if (this.gameMode === 'winner' && toElim.length > 0) {
            const aliveUnfin = this.players.filter(p => p.alive && !p.finished);
            const willSurvive = aliveUnfin.filter(p => !p.inPlaceRunning);
            if (willSurvive.length === 0) {
                // 선두(progress 최대)를 사살 목록에서 제외
                toElim = toElim.slice(0, toElim.length - 1);
            }
        }

        if (toElim.length > 0) {
            const elimStep = 300;
            toElim.forEach((p, i) => {
                this.time.delayedCall(350 + i * elimStep, () => {
                    if (p.alive && !this.gameOver) this._eliminatePlayer(p);
                });
            });
            // 모든 사살 완료 후 CHECK 단계로
            const totalWait = 350 + toElim.length * elimStep + 600;
            this.time.delayedCall(totalWait, () => {
                if (!this.gameOver) this._startCheckPhase();
            });
        } else {
            // 탈락자 없음 – 일반 RED 대기 후 CHECK
            this.redDuration = Phaser.Math.Between(DUR_RED_MIN, DUR_RED_MAX);
            // 탈락자 없는 RED 구간: 숨참기 카운트다운 연출 (~0.5초마다 점 증가)
            let dotCount = 0;
            const dotInterval = this.time.addEvent({
                delay: 480,
                repeat: Math.floor(this.redDuration / 480) - 1,
                callback: () => {
                    dotCount = (dotCount + 1) % 4;
                    const dots = '●'.repeat(dotCount + 1) + '○'.repeat(3 - dotCount);
                    if (this.stateLabel && this.stateLabel.active && this.phase === 'RED') {
                        this.stateLabel.setText(`${L().stateRed}  ${dots}`).setColor(hexColor(MG_C.red)).setFontSize('20px');
                    }
                },
            });
            this.time.delayedCall(this.redDuration, () => {
                if (dotInterval) dotInterval.remove(false);
                if (!this.gameOver) this._startCheckPhase();
            });
        }
    }

    // ────────────────────────────────────────────────────────
    // CHECK 단계 (탈락 판정)
    // ────────────────────────────────────────────────────────
    _startCheckPhase() {
        if (this.gameOver) return;
        this.phase = 'CHECK';
        this.stateLabel.setText(L().stateCheck).setColor('#aaaaaa').setFontSize('18px');

        // 탈락자는 RED 단계에서 inPlaceRunning 판정 후 이미 모두 처리됨
        // → 이 단계에서는 newEliminated는 항상 빈 배열
        const allElimThisRound = [...this._roundEliminated];
        allElimThisRound.sort((a, b) => a.progress - b.progress);

        const waitTime = allElimThisRound.length > 0 ? 300 : 350;

        if (allElimThisRound.length > 0 && this.stateLabel && this.stateLabel.active) {
            this.stateLabel.setText(L().roundElim(allElimThisRound.length)).setColor(hexColor(MG_C.red));
        }

        // loser 모드: 탈락자 중 가장 뒤에 있던 사람 = 꼴찌
        if (allElimThisRound.length > 0 && this.gameMode === 'loser') {
            if (!this.gameOver) {
                this.gameOver = true;
                this.time.delayedCall(waitTime, () => this._showResult(allElimThisRound[0], 'loser'));
            }
            return;
        }

        // 생존자 확인
        const activeCount = this.players.filter(p => p.alive && !p.finished).length;

        if (activeCount <= 0 && allElimThisRound.length > 0 && this.gameMode !== 'loser') {
            const finishers = this.players.filter(q => q.finished);
            if (finishers.length > 0 && this.gameMode === 'winner') {
                const winner = finishers.sort((a, b) => a.rank - b.rank)[0];
                this.time.delayedCall(waitTime, () => {
                    if (!this.gameOver) {
                        this.gameOver = true;
                        this._showResult(winner, 'winner');
                    }
                });
            } else {
                this.time.delayedCall(waitTime, () => {
                    if (!this.gameOver) this._showResult(null, 'allElim');
                });
            }
            return;
        }

        this.time.delayedCall(waitTime, () => {
            if (!this.gameOver) this._startGreenPhase();
        });
    }

    // ────────────────────────────────────────────────────────
    // 플레이어 탈락
    // ────────────────────────────────────────────────────────
    _drawGunFlash(targetPlayer) {
        const doll = this.dollSprite;
        if (!doll) return;
        const h    = doll.displayHeight;
        const gunX = doll.x - h * 0.20;
        const gunY = doll.y - h * 0.08;
        const g = this.add.graphics().setDepth(22);
        g.lineStyle(3, 0xffff00, 0.95);
        g.lineBetween(gunX, gunY, targetPlayer.x, targetPlayer.y);
        g.fillStyle(0xffff00, 1);
        g.fillCircle(gunX, gunY, 8);
        g.fillStyle(0xff4400, 0.7);
        g.fillCircle(gunX, gunY, 14);
        this.tweens.add({
            targets: g, alpha: 0, duration: 280,
            onComplete: () => g.destroy(),
        });
    }

    _eliminatePlayer(p) {
        // 즉시 alive=false → 업데이트 루프·CHECK 단계 재처리 방지
        p.alive    = false;
        p.velocity = 0;
        p.reacting = false;
        if (!this._roundEliminated.includes(p)) this._roundEliminated.push(p);

        // 탈락 순위 자동 부여: 현재까지 탈락한 인원 수로 역순 계산
        // (꼴지 먼저 사살이므로 먼저 죽을수록 낮은 순위)
        const deadCount = this.players.filter(q => !q.alive && !q.finished).length;
        p.rank = this.numPlayers - deadCount + 1;

        // 인형 총격
        this.dollShooting = true;
        this._setDollFront();
        playSfx(this, SFX_GUNSHOT);
        this._drawGunFlash(p);
        this.cameras.main.shake(120, 0.008);

        this.time.delayedCall(260, () => {
            playSfx(this, SFX_ELIMINATE);
            this.dollShooting = false;
            this._setDollFront();
            this._applyEliminationVisuals(p);
        });
    }

    _applyEliminationVisuals(p) {
        // alive/velocity/reacting 은 _eliminatePlayer 호출 시 이미 처리됨
        p.elimMark.setVisible(false); // 흔들리다 쓰러진 뒤에 표시

        // 총 맞은 직후 흔들리기 → 쓰러짐 → 페이드
        this.tweens.add({
            targets: p.container,
            angle: { from: -18, to: 18 },
            yoyo: true, repeat: 3, duration: 65, ease: 'Sine.InOut',
            onComplete: () => {
                // 쓰러짐
                p.elimMark.setVisible(true);
                this.tweens.add({
                    targets: p.container,
                    angle: 90, alpha: 0.20,
                    duration: 400, ease: 'Power3',
                });
                // 탈락 혈흔 파티클
                for (let k = 0; k < 6; k++) {
                    const sp = this.add.circle(
                        p.x + Phaser.Math.Between(-18, 18),
                        p.y + Phaser.Math.Between(-12, 12),
                        Phaser.Math.Between(2, 5), 0xff2222, 0.85
                    ).setDepth(15);
                    this.tweens.add({
                        targets: sp, y: sp.y + Phaser.Math.Between(10, 30),
                        alpha: 0, duration: 500, delay: k * 40,
                        onComplete: () => sp.destroy(),
                    });
                }
            },
        });

        // 탈락 이름 플래시 (크고 강렬하게)
        const W = this.scale.width;
        const flash = this.add.text(W / 2, this.scale.height * 0.44,
            `💀 ${p.name} 탈락!`, {
                fontFamily: '"Pretendard",Arial', fontSize: '30px', color: '#ff3333',
                stroke: '#000', strokeThickness: 5,
                shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 6, fill: true },
            }
        ).setOrigin(0.5).setDepth(32).setAlpha(0);
        this.tweens.add({
            targets: flash,
            alpha: { from: 0, to: 1 }, scaleX: { from: 0.6, to: 1 }, scaleY: { from: 0.6, to: 1 },
            duration: 200, ease: 'Back.Out',
            onComplete: () => this.tweens.add({
                targets: flash, alpha: 0, y: flash.y - 30,
                delay: 700, duration: 500, onComplete: () => flash.destroy(),
            }),
        });

        this._updateHUD();
    }

    // ────────────────────────────────────────────────────────
    // 플레이어 결승 도착
    // ────────────────────────────────────────────────────────
    _playerFinished(p) {
        p.finished  = true;
        p.velocity  = 0;
        p.reacting  = false;
        p.rank      = ++this.finishCount;
        playSfx(this, SFX_FINISH);

        // winner 모드: 1등 도착 시 특별 연출 후 게임 계속 진행
        if (this.gameMode === 'winner' && p.rank === 1) {
            playSfx(this, SFX_FANFARE);
            const W = this.scale.width;
            const flt = this.add.text(W / 2, this.scale.height * 0.38,
                `🏆 ${p.name}  1위!`, {
                    fontFamily: '"Orbitron","Pretendard",Arial',
                    fontSize: '36px', color: '#FFD700',
                    stroke: '#000', strokeThickness: 6,
                    shadow: { offsetX: 3, offsetY: 3, color: '#000', blur: 8, fill: true },
                }
            ).setOrigin(0.5).setDepth(35).setAlpha(0);
            this.tweens.add({
                targets: flt,
                alpha: { from: 0, to: 1 },
                scaleX: { from: 0.5, to: 1.1 }, scaleY: { from: 0.5, to: 1.1 },
                duration: 320, ease: 'Back.Out',
                onComplete: () => this.tweens.add({
                    targets: flt, alpha: 0, y: flt.y - 55,
                    delay: 2200, duration: 700,
                    onComplete: () => flt.destroy(),
                }),
            });
            this._addConfetti(W, this.scale.height);
        }

        // 남은 활성 플레이어 확인
        const stillActive = this.players.filter(q => !q.finished && q.alive);

        // winner 모드: 모든 플레이어 완주·탈락 시 전체 순위 결과 표시
        if (stillActive.length === 0 && this.gameMode === 'winner' && !this.gameOver) {
            const winner = this.players.filter(q => q.finished).sort((a, b) => a.rank - b.rank)[0];
            if (winner) {
                this.gameOver = true;
                this.time.delayedCall(600, () => this._showResult(winner, 'winner'));
                return;
            }
        }

        // loser 모드: 마지막 도착 체크
        if (stillActive.length === 0 && this.gameMode === 'loser' && !this.gameOver) {
            const last = this.players.filter(q => q.finished).sort((a, b) => b.rank - a.rank)[0];
            if (last) {
                this.gameOver = true;
                this.time.delayedCall(400, () => this._showResult(last, 'loser'));
            }
        }

        // 컨테이너 정지 자세 + 완주 하이라이트
        p.container.setAngle(0);
        p.container.setX(p.x);

        const flash = this.add.text(p.x, p.y - 10, `🏁 ${p.rank}위!`, {
            fontFamily: '"Pretendard",Arial', fontSize: '20px', color: '#FFD700',
            stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(30);
        this.tweens.add({
            targets: flash, y: p.y - 45, alpha: 0,
            duration: 1100, ease: 'Power2', onComplete: () => flash.destroy(),
        });

        this._updateHUD();
    }

    // ────────────────────────────────────────────────────────
    // 결과 화면
    // ────────────────────────────────────────────────────────
    _getFinalRanking() {
        const finished = this.players.filter(p => p.finished).sort((a, b) => a.rank - b.rank);
        const eliminated = this.players.filter(p => !p.alive && !p.finished)
            .sort((a, b) => b.progress - a.progress);
        return [...finished, ...eliminated];
    }

    _showResult(resultPlayer, type) {
        if (this.phase === 'RESULT') return;  // 이중 호출 방지
        this.gameOver = true;
        this.phase = 'RESULT';
        this.players.forEach(p => { p.velocity = 0; });

        const W = this.scale.width, H = this.scale.height;

        // 반투명 오버레이
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.80).setDepth(40);

        if (type === 'winner') {
            // ── winner 모드: 전체 순위 표시 패널 ──────────────
            const allSorted = this._getFinalRanking();
            const n         = allSorted.length;
            const listCols  = n <= 10 ? 1 : n <= 20 ? 2 : 3;
            const rowsPerCol = Math.ceil(n / listCols);
            const headerH   = 114;
            const btnH      = 68;
            const pW        = listCols === 1 ? 620 : listCols === 2 ? 820 : 960;
            const pH        = Math.min(H - 36, listCols === 1 ? 540 : 660);
            const px = W / 2, py = H / 2;
            const g  = this.add.graphics().setDepth(41);

            g.fillStyle(0x080d18, 0.97);
            g.fillRoundedRect(px - pW / 2, py - pH / 2, pW, pH, 20);
            g.lineStyle(2, 0xd4a017, 1);
            g.strokeRoundedRect(px - pW / 2, py - pH / 2, pW, pH, 20);
            g.fillStyle(0xd4a017, 1);
            g.fillRoundedRect(px - pW / 2, py - pH / 2, pW, 8, { tl: 20, tr: 20, bl: 0, br: 0 });

            // 우승자 섹션 (컴팩트 헤더)
            this.add.text(px, py - pH / 2 + 38, '🏆 최종 순위', {
                fontFamily: '"Orbitron","Pretendard",Arial',
                fontSize: '18px', color: '#c8920a',
                stroke: '#000', strokeThickness: 2,
            }).setOrigin(0.5).setDepth(42);

            this.add.text(px, py - pH / 2 + 80, resultPlayer.name, {
                fontFamily: '"Pretendard",Arial',
                fontSize: '52px', color: '#FFD700',
                stroke: '#000', strokeThickness: 5,
                fontStyle: 'bold',
            }).setOrigin(0.5).setDepth(42);

            // 구분선
            const divY = py - pH / 2 + headerH - 4;
            g.lineStyle(1, 0xd4a017, 0.35);
            g.lineBetween(px - pW / 2 + 28, divY, px + pW / 2 - 28, divY);

            // 전체 순위 리스트 (인원 많을 때 다열 배치)
            const listY0  = py - pH / 2 + headerH + 4;
            const availH  = pH - headerH - btnH - 12;
            const rowH    = Math.max(20, Math.min(48, Math.floor(availH / Math.max(rowsPerCol, 1))));
            const fz      = Math.max(14, Math.min(24, rowH - 5));
            const dotR    = Math.min(5, rowH * 0.22);
            const padX    = 22;
            const colGap  = 20;
            const colW    = (pW - padX * 2 - (listCols - 1) * colGap) / listCols;
            const maxNm   = listCols === 1 ? 12 : listCols === 2 ? 9 : 7;

            // 열 구분선
            if (listCols > 1) {
                g.lineStyle(1, 0xd4a017, 0.18);
                for (let c = 1; c < listCols; c++) {
                    const sepX = px - pW / 2 + padX + c * colW + (c - 0.5) * colGap;
                    g.lineBetween(sepX, listY0 - 2, sepX, py + pH / 2 - btnH - 8);
                }
            }

            allSorted.forEach((pl, i) => {
                const colIdx = Math.floor(i / rowsPerCol);
                const rowIdx = i % rowsPerCol;
                const lx     = px - pW / 2 + padX + colIdx * (colW + colGap);
                const ry     = listY0 + rowIdx * rowH + rowH / 2;
                const isEl   = !pl.alive;
                const rank   = pl.rank ?? (i + 1);
                const col    = rank === 1 ? '#FFD700'
                    : rank === 2 ? '#cccccc'
                    : rank === 3 ? '#cd7f32'
                    : hexColor(pl.color);
                const short  = pl.name.length > maxNm ? pl.name.slice(0, maxNm - 1) + '…' : pl.name;

                const colIcon = lx + 20;
                const colRank = lx + 54;
                const colName = lx + 118;

                this.add.circle(lx + 9, ry, dotR, pl.color, 1).setDepth(42);
                if (isEl) {
                    this.add.text(colIcon, ry, '❌', {
                        fontFamily: '"Pretendard",Arial', fontSize: `${fz}px`,
                    }).setOrigin(0, 0.5).setDepth(42);
                }
                this.add.text(colRank, ry, `${rank}위`, {
                    fontFamily: '"Pretendard",Arial', fontSize: `${fz}px`, color: col,
                    fontStyle: rank <= 3 ? 'bold' : 'normal',
                }).setOrigin(0, 0.5).setDepth(42);
                this.add.text(colName, ry, short, {
                    fontFamily: '"Pretendard",Arial', fontSize: `${fz}px`, color: col,
                }).setOrigin(0, 0.5).setDepth(42);
            });

            // 버튼 (패널 하단)
            const btnY = py + pH / 2 - 32;
            this._addResultBtn(px - 152, btnY, L().btnRestart, 0x12305a, 0x1e5096, () => {
                this.scene.start('GameScene', { names: this.playerNames, mode: this.gameMode });
            });
            this._addResultBtn(px + 152, btnY, L().btnNewSetup, 0x28124a, 0x4a248a, () => {
                this.scene.start('SetupScene');
            });

            // 컨페티 (1등 도착 시 이미 발동됐을 수 있지만 결과화면에서도 추가)
            this._addConfetti(W, H);

        } else {
            // ── loser / allElim: 기존 컴팩트 디자인 ──────────
            const pW = 560, pH = 300;
            const px  = W / 2, py = H / 2 - 20;
            const g   = this.add.graphics().setDepth(41);

            let panelCol, borderCol, stripeCol, topLabel, nameText, panelColor;

            if (type === 'loser') {
                panelCol  = 0x110308;
                borderCol = 0xcc2244;
                stripeCol = 0xcc2244;
                topLabel  = L().msgLoser(resultPlayer.name);
                nameText  = resultPlayer.name;
                panelColor = '#ff5577';
            } else {
                panelCol  = 0x0e0e1a;
                borderCol = 0x6677bb;
                stripeCol = 0x6677bb;
                topLabel  = L().allElim;
                nameText  = '—';
                panelColor = hexColor(MG_C.accent);
            }

            g.fillStyle(panelCol, 0.97);
            g.fillRoundedRect(px - pW / 2, py - pH / 2, pW, pH, 20);
            g.lineStyle(2, borderCol, 1);
            g.strokeRoundedRect(px - pW / 2, py - pH / 2, pW, pH, 20);
            g.fillStyle(stripeCol, 1);
            g.fillRoundedRect(px - pW / 2, py - pH / 2, pW, 8, { tl: 20, tr: 20, bl: 0, br: 0 });

            this.add.text(px, py - pH / 2 + 52, topLabel, {
                fontFamily: '"Orbitron","Pretendard",Arial',
                fontSize: '25px', color: panelColor,
                stroke: '#000000', strokeThickness: 4,
            }).setOrigin(0.5).setDepth(42);

            this.add.text(px, py + 18, nameText, {
                fontFamily: '"Pretendard",Arial',
                fontSize: '46px', color: '#ffffff',
                stroke: '#000000', strokeThickness: 5,
                fontStyle: 'bold',
            }).setOrigin(0.5).setDepth(42);

            if (resultPlayer) {
                this.add.circle(px, py + 86, 10, resultPlayer.color).setDepth(42);
            }

            if (type === 'loser') {
                playSfx(this, SFX_FANFARE);
                this._addLoserEffect(W, H);
            }

            this._addResultBtn(W / 2 - 152, H - 80, L().btnRestart, 0x12305a, 0x1e5096, () => {
                this.scene.start('GameScene', { names: this.playerNames, mode: this.gameMode });
            });
            this._addResultBtn(W / 2 + 152, H - 80, L().btnNewSetup, 0x28124a, 0x4a248a, () => {
                this.scene.start('SetupScene');
            });
        }
    }

    _addResultBtn(x, y, label, baseCol, hoverCol, cb) {
        const bw = 262, bh = 50;
        const bg = this.add.graphics().setDepth(43);
        const draw = (c) => {
            bg.clear();
            bg.fillStyle(c, 1);
            bg.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 13);
            bg.lineStyle(1, 0xffffff, 0.18);
            bg.strokeRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 13);
        };
        draw(baseCol);
        this.add.text(x, y, label, {
            fontFamily: '"Pretendard",Arial', fontSize: '15px', color: '#ffffff',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(44);
        this.add.rectangle(x, y, bw, bh)
            .setInteractive({ useHandCursor: true })
            .on('pointerover', () => draw(hoverCol))
            .on('pointerout',  () => draw(baseCol))
            .on('pointerdown', () => this.time.delayedCall(16, cb))  // 다음 틱에서 씬 전환 (인풋 처리 완료 후)
            .setDepth(44);
    }

    _addLoserEffect(W, H) {
        const cols = [0xcc2244, 0xff3355, 0xaa1133, 0xff6688, 0x880022];
        for (let i = 0; i < 55; i++) {
            const cx  = Phaser.Math.Between(30, W - 30);
            const r   = Phaser.Math.Between(3, 10);
            const col = cols[Phaser.Math.Between(0, cols.length - 1)];
            const c   = this.add.circle(cx, H + 20, r, col).setDepth(45);
            this.tweens.add({
                targets: c,
                x: cx + Phaser.Math.Between(-120, 120),
                y: Phaser.Math.Between(H * 0.15, H * 0.75),
                angle: Phaser.Math.Between(-400, 400),
                alpha: { from: 1, to: 0 },
                duration: Phaser.Math.Between(1400, 3200),
                ease: 'Power2',
                delay: Phaser.Math.Between(0, 900),
                onComplete: (_t, targets) => targets[0].destroy(),
            });
        }
    }

    _addConfetti(W, H) {
        const cols = [
            MG_C.accent, MG_C.green, MG_C.yellow,
            0x3498db, 0x9b59b6, 0xe74c3c, 0x00bcd4,
        ];
        for (let i = 0; i < 70; i++) {
            const cx  = Phaser.Math.Between(30, W - 30);
            const r   = Phaser.Math.Between(4, 11);
            const col = cols[Phaser.Math.Between(0, cols.length - 1)];
            const c   = this.add.circle(cx, -22, r, col).setDepth(45);
            this.tweens.add({
                targets: c,
                x: cx + Phaser.Math.Between(-140, 140),
                y: H + 60,
                angle: Phaser.Math.Between(-600, 600),
                duration: Phaser.Math.Between(1800, 3800),
                ease: 'Sine.easeIn',
                delay: Phaser.Math.Between(0, 1000),
            });
        }
    }

    // ────────────────────────────────────────────────────────
    // 업데이트 루프
    // ────────────────────────────────────────────────────────
    update(time, delta) {
        if (this.gameOver && this.phase === 'RESULT') return;

        const dt = delta / 16.67;
        this._drawProgressBars();

        // 순위표 실시간 갱신 (12프레임마다 ~200ms) – 레이스 중 선두 변화 반영
        this._lbUpdateTick = (this._lbUpdateTick || 0) + 1;
        if (this._lbUpdateTick % 12 === 0) this._updateLeaderboard();

        this.players.forEach(p => {
            if (!p.alive || p.finished) return;

            if (this.phase === 'GREEN') {
                // progress 전진
                p.progress = Math.min(p.progress + p.velocity * dt, TOTAL_PROGRESS);

                // 결승 판정
                if (p.progress >= TOTAL_PROGRESS && !this.gameOver) {
                    this._playerFinished(p);
                }

                // ── 달리기 애니메이션: 다리 교차 ────────────
                const legFrame = Math.floor(time / 105) % 2;
                if (legFrame !== p.legFrame) {
                    p.legFrame = legFrame;
                    const lh = p.legH, lo = p.legOff;
                    if (legFrame === 0) {
                        p.legL.setY(lh * 0.25).setX(-lo * 1.3);
                        p.legR.setY(lh * 0.75).setX(+lo * 0.7);
                    } else {
                        p.legL.setY(lh * 0.75).setX(-lo * 0.7);
                        p.legR.setY(lh * 0.25).setX(+lo * 1.3);
                    }
                }

                // 앞으로 살짝 기울기 (달리기 자세)
                p.container.setAngle(-7);

                // 먼지 파티클 (뒤에서 튀는 흙)
                if (Math.floor(time / 16) % 5 === (p.idx % 5)) {
                    const dustX = p.x - Phaser.Math.Between(4, 10);
                    const dustY = p.y + p.legH * 0.6;
                    const dust = this.add.circle(dustX, dustY, Phaser.Math.Between(2, 4), MG_C.track, 0.55).setDepth(8);
                    this.tweens.add({
                        targets: dust,
                        x: dustX - Phaser.Math.Between(6, 16),
                        y: dustY - Phaser.Math.Between(1, 5),
                        alpha: 0, scaleX: 2.5, scaleY: 2.5,
                        duration: 230,
                        onComplete: () => dust.destroy(),
                    });
                }

            } else if (this.phase === 'TURNING' || this.phase === 'RED') {
                // 얼음에 걸린 선수 – 제자리 달리기 (앞으로 이동 없음, 다리만 움직임)
                if (p.inPlaceRunning) {
                    const legFrame = Math.floor(time / 85) % 2;
                    if (legFrame !== p.legFrame) {
                        p.legFrame = legFrame;
                        const lh = p.legH, lo = p.legOff;
                        if (legFrame === 0) {
                            p.legL.setY(lh * 0.25).setX(-lo * 1.3);
                            p.legR.setY(lh * 0.75).setX(+lo * 0.7);
                        } else {
                            p.legL.setY(lh * 0.75).setX(-lo * 0.7);
                            p.legR.setY(lh * 0.25).setX(+lo * 1.3);
                        }
                    }
                    p.container.setAngle(-5);
                } else {
                    // 안전하게 정지한 선수 – 직립 자세
                    p.container.setAngle(0);
                    p.legL.setY(p.legH * 0.5).setX(-p.legOff);
                    p.legR.setY(p.legH * 0.5).setX(+p.legOff);
                }
            } else {
                p.container.setAngle(0);
            }

            // X 위치 동기화
            p.container.setX(p.x);
        });
    }
}

// ============================================================
// Phaser 게임 인스턴스
// ============================================================
const mugunghwaConfig = {
    type:            Phaser.AUTO,
    width:           MG_W,
    height:          MG_H,
    parent:          'game-container',
    backgroundColor: '#0e1e0a',
    scale: {
        mode:       Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [PreloadScene, SetupScene, GameScene],
};

const mugunghwaGame = new Phaser.Game(mugunghwaConfig);

// ============================================================
// 외부 UI  (BGM 토글 · 전체화면)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.setAttribute('lang', currentLang);

    // i18n – HTML 설명 텍스트 업데이트
    const _setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const _setTxt  = (id, txt)  => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const _L = L();
    _setTxt('mg-desc-h2-1',    _L.domDescH2_1);
    _setTxt('mg-desc-h2-2',    _L.domDescH2_2);
    _setHTML('mg-desc-step-1', _L.domDescStep1);
    _setHTML('mg-desc-step-2', _L.domDescStep2);
    _setHTML('mg-desc-step-3', _L.domDescStep3);
    _setHTML('mg-desc-step-4', _L.domDescStep4);
    _setHTML('mg-desc-feat-1', _L.domDescFeat1);
    _setHTML('mg-desc-feat-2', _L.domDescFeat2);
    _setHTML('mg-desc-feat-3', _L.domDescFeat3);

    const bgmToggle    = document.getElementById('bgmToggle');
    const volumeCtrl   = document.getElementById('volumeControl');
    const fsToggle     = document.getElementById('fsToggle');
    const fsExitBtn    = document.getElementById('mgFsExitBtn');
    const mobileFsBtn  = document.getElementById('mgMobileFsExitBtn');
    const fullWrap     = document.getElementById('mugunghwa-fullscreen-wrap');
    const mobileFsBar  = document.getElementById('mg-mobile-fs-exit');

    if (mugunghwaGame.registry.get('bgmOn') === undefined) {
        mugunghwaGame.registry.set('bgmOn', true);
    }

    let audioJustUnlocked = false;
    const unlockAudio = () => {
        if (mugunghwaGame.sound && mugunghwaGame.sound.context &&
            mugunghwaGame.sound.context.state === 'suspended') {
            mugunghwaGame.sound.context.resume();
        }
        const s = mugunghwaGame.bgmSound;
        if (s && mugunghwaGame.registry.get('bgmOn', true)) {
            try { if (!s.isPlaying) s.play(); } catch (e) { /* ignore */ }
            audioJustUnlocked = true;
            setTimeout(() => { audioJustUnlocked = false; }, 100);
        }
    };
    document.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
    document.addEventListener('click', unlockAudio, { once: true, capture: true });

    if (bgmToggle) {
        const updateBgmUI = () => {
            const on = mugunghwaGame.registry.get('bgmOn', true);
            bgmToggle.textContent = on ? L().bgmOn : L().bgmOff;
        };
        updateBgmUI();

        bgmToggle.addEventListener('click', () => {
            if (audioJustUnlocked) return;
            const on = !mugunghwaGame.registry.get('bgmOn', true);
            mugunghwaGame.registry.set('bgmOn', on);
            updateBgmUI();
            if (mugunghwaGame.sound) mugunghwaGame.sound.mute = !on;
            const s = mugunghwaGame.bgmSound;
            if (s) {
                if (on) {
                    if (mugunghwaGame.sound.context &&
                        mugunghwaGame.sound.context.state === 'suspended') {
                        mugunghwaGame.sound.context.resume();
                    }
                    try { s.play(); } catch (e) { /* ignore */ }
                } else {
                    s.pause();
                }
            }
        });
    }

    if (volumeCtrl) {
        const applyVolume = () => {
            const v = volumeCtrl.value / 100;
            mugunghwaGame.registry.set('bgmVolume', v);
            if (mugunghwaGame.bgmSound) mugunghwaGame.bgmSound.volume = v;
        };
        applyVolume();
        volumeCtrl.addEventListener('input', applyVolume);
        volumeCtrl.addEventListener('change', applyVolume);
        volumeCtrl.addEventListener('touchend', applyVolume);
    }

    function isMobile() { return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; }
    function isFS() { return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement); }
    function exitFullscreen() {
        const doc = document;
        if (doc.exitFullscreen) doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        else if (doc.msExitFullscreen) doc.msExitFullscreen();
    }

    const gameContainer = document.getElementById('game-container');

    if (fullWrap && mugunghwaGame.scale) {
        mugunghwaGame.scale.fullscreenTarget = fullWrap;
    }

    const resizeMgOverlay = () => {
        const overlay = document.getElementById('mg-setup-overlay');
        if (!overlay) return;
        const active = isFS() || (fullWrap && fullWrap.classList.contains('mg-fullscreen-active'));
        if (active) {
            const scW = window.innerWidth, scH = window.innerHeight;
            const scale = Math.min(scW / MG_W, scH / MG_H);
            const contentW = MG_W * scale;
            const contentH = MG_H * scale;
            const offsetX = (scW - contentW) / 2;
            const offsetY = (scH - contentH) / 2;
            overlay.style.position = 'absolute';
            overlay.style.width  = (MG_W * 0.58 * scale) + 'px';
            overlay.style.height = (MG_H * 0.18 * scale) + 'px';
            overlay.style.top    = (offsetY + MG_H * 0.21 * scale) + 'px';
            overlay.style.left   = (offsetX + contentW / 2) + 'px';
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

    const forceFullscreenFill = () => {
        if (!gameContainer || !isFS()) return;
        // game-container를 전체화면 크기로 확장 (CSS :fullscreen 룰과 동일한 효과를 inline으로 보장)
        gameContainer.style.position = 'absolute';
        gameContainer.style.top = '0';
        gameContainer.style.left = '0';
        gameContainer.style.right = '0';
        gameContainer.style.bottom = '0';
        gameContainer.style.width = '100%';
        gameContainer.style.height = '100%';
        gameContainer.style.maxWidth = 'none';
        gameContainer.style.aspectRatio = 'unset';
        // #mg-setup-overlay를 제외하고 Phaser 래퍼 div를 선택
        const wrapper = gameContainer.querySelector(':scope > div:not(#mg-setup-overlay)');
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
        // canvas margin 리셋 – Phaser CENTER_BOTH의 inline marginLeft를 JS에서도 제거
        const canvas = gameContainer.querySelector('canvas');
        if (canvas) {
            canvas.style.width = '100vw';
            canvas.style.height = '100vh';
            canvas.style.maxWidth = '100vw';
            canvas.style.maxHeight = '100vh';
            canvas.style.margin = '0';
            canvas.style.objectFit = 'contain';
            canvas.style.objectPosition = 'center center';
        }
        resizeMgOverlay();
    };

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
        gameContainer.style.maxWidth = '';
        gameContainer.style.aspectRatio = '';
        const wrapper = gameContainer.querySelector(':scope > div:not(#mg-setup-overlay)');
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
            canvas.style.margin = '';
            canvas.style.objectFit = '';
            canvas.style.objectPosition = '';
        }
        resizeMgOverlay();
    };

    const refreshScaleOnFullscreen = () => {
        if (!gameContainer || !mugunghwaGame.scale) return;
        const doRefresh = () => {
            forceFullscreenFill();
            if (mugunghwaGame.scale) mugunghwaGame.scale.refresh();
            forceFullscreenFill();
            resizeMgOverlay();
        };
        requestAnimationFrame(() => {
            doRefresh();
            requestAnimationFrame(() => doRefresh());
            setTimeout(doRefresh, 50);
            setTimeout(doRefresh, 150);
            setTimeout(doRefresh, 400);
        });
    };

    function updateFsUI() {
        const active = isFS() || fullWrap.classList.contains('mg-fullscreen-active');
        if (fsToggle) fsToggle.textContent = active ? '⛶ 전체화면 종료' : '⛶ 전체화면';
        if (mobileFsBar && isMobile()) mobileFsBar.style.display = active ? 'flex' : 'none';
        resizeMgOverlay();
    }

    mugunghwaGame.scale.on('enterfullscreen', () => {
        updateFsUI();
        refreshScaleOnFullscreen();
    });
    mugunghwaGame.scale.on('fullscreenfailed', () => {
        if (gameContainer) gameContainer.classList.add('fullscreen-fallback');
        if (fullWrap) fullWrap.classList.add('mg-fullscreen-active');
        updateFsUI();
    });
    mugunghwaGame.scale.on('fullscreenunsupported', () => {
        if (gameContainer) gameContainer.classList.add('fullscreen-fallback');
        if (fullWrap) fullWrap.classList.add('mg-fullscreen-active');
        updateFsUI();
    });
    mugunghwaGame.scale.on('leavefullscreen', () => {
        clearFullscreenStyles();
        updateFsUI();
    });

    const onFullscreenChange = () => {
        updateFsUI();
        if (!isFS()) {
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
            if (gameContainer && gameContainer.classList.contains('fullscreen-fallback')) {
                gameContainer.classList.remove('fullscreen-fallback');
                updateFsUI();
            } else if (isFS()) {
                exitFullscreen();
            } else {
                mugunghwaGame.scale.toggleFullscreen();
            }
        });
    }
    if (fsExitBtn) {
        fsExitBtn.addEventListener('click', () => {
            if (isFS()) exitFullscreen();
            if (gameContainer && gameContainer.classList.contains('fullscreen-fallback')) {
                gameContainer.classList.remove('fullscreen-fallback');
                updateFsUI();
            }
        });
    }
    if (mobileFsBtn) mobileFsBtn.addEventListener('click', () => {
        if (isFS()) exitFullscreen();
        if (fullWrap) fullWrap.classList.remove('mg-fullscreen-active');
        updateFsUI();
    });

    window.addEventListener('resize', () => {
        if (!mugunghwaGame.scale) return;
        if (typeof mugunghwaGame.scale.updateBounds === 'function') mugunghwaGame.scale.updateBounds();
        mugunghwaGame.scale.refresh();
    });

    updateFsUI();
});
