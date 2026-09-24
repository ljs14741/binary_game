'use strict';

// ============================================================
// mugunghwa.js  |  무궁화 꽃이 피었습니다  |  Phaser 3
// Binary World  |  game.binaryworld.kr
//
// 캔버스는 보여주기만 한다 (입력 없음 → 폰에서 게임 화면 위를 밀어도 페이지가 스크롤됨).
// 참가자 입력·결과 카드는 #game-container 안의 HTML(#mg-setup, #mg-result).
// 캐릭터 그림은 mugunghwa-art.js (먼저 로드).
// ============================================================

// ── 화면 배치: PC 는 가로형, 폭 600px 이하 폰은 세로형 ─────────
// x0 = 출발 위치, x1 = 결승선, trackL/R = 모래 트랙 끝, fs = 글자 배율
const MG_LAYOUTS = {
    wide: { key: 'wide', W: 1000, H: 720, hudH: 64, botH: 58, lbW: 190, trackL: 198, trackR: 866, x0: 300, x1: 842, dollX: 928, dollMaxH: 250, laneMax: 124, tagMax: 16, fs: 1 },
    tall: { key: 'tall', W: 540, H: 720, hudH: 108, botH: 58, lbW: 0, trackL: 6, trackR: 436, x0: 130, x1: 418, dollX: 486, dollMaxH: 200, laneMax: 132, tagMax: 18, fs: 1.3 },
};
const MG_TALL_MQ = '(max-width: 600px)';

function mgPickLayout() {
    return window.matchMedia && window.matchMedia(MG_TALL_MQ).matches ? MG_LAYOUTS.tall : MG_LAYOUTS.wide;
}
// 캔버스 해상도 배율 (고해상도 화면에서 흐리지 않게)
function mgRenderScale(L) {
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const box = document.getElementById('game-container');
    const cssW = box && box.clientWidth ? box.clientWidth : L.W;
    return Math.max(1, Math.min(2, Math.round(dpr * cssW / L.W * 4) / 4));
}
let MG_L = mgPickLayout();
let MG_K = mgRenderScale(MG_L);

// 모든 텍스트를 캔버스 배율 해상도로 렌더
{
    const origText = Phaser.GameObjects.GameObjectFactory.prototype.text;
    Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, t, style) {
        return origText.call(this, x, y, t, Object.assign({ resolution: MG_K }, style || {}));
    };
}

const MG_FONT = "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Hiragino Sans', sans-serif";
const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ── 진행 ───────────────────────────────────────────────────
// 화면상 x = x0 + (progress / TOTAL_PROGRESS) * (x1 - x0)
const TOTAL_PROGRESS = 1.7;   // 평균 4~5라운드 완주

// ── 인형 목소리 (mugunghwadoll.mp3 8.3초) ────────────────────
// 0.15~5.45초가 "무궁화 꽃이 피었습니다". 그 뒤 2.8초는 띵 소리·기계음이라 안 씀
// → 외침 끝나면 바로 삐리릭(얼음)
const SHOUT_START = 0.15;
const SHOUT_END   = 5.45;
const SHOUT_LEN   = SHOUT_END - SHOUT_START;
// 음절 시작 시각(파일 기준 초): 무 궁 화 꽃 이 피 었 습 니 다
const SYLLABLES = [0.22, 0.56, 0.94, 1.66, 2.36, 3.00, 3.56, 3.98, 4.26, 4.90];
// freeze.mp3 앞 0.5초는 작은 웅웅거림 → 건너뛰고 삐리리릭부터
const FREEZE_SEEK = 0.5;
// 라운드별 외침 빠르기. 1라운드는 원래 속도, 이후 무작위 (빠를수록 다들 더 빨리 뜀 → 라운드당 전진량은 같음)
const SHOUT_RATES = [0.95, 1.0, 1.08, 1.15, 1.22, 1.3];

// ── 속도 (progress/frame, 60fps 기준, 외침 1.0배속 기준) ──────
// 외침 한 번(5.3초 ≈ 318프레임) 동안 평균 0.5 전진
const SPEED_MIN = 0.00094;
const SPEED_MAX = 0.00218;
// 얼음 순간 반응 딜레이 동안 이만큼 넘게 움직였으면 걸림
const ELIM_MOVE_PROG = 0.0097;

// ── 게임 규칙 ──────────────────────────────────────────────
const DUR_RED_MIN = 700;
const DUR_RED_MAX = 1600;
const REACT_MIN   = 30;
const REACT_MAX   = 480;

const PLAYER_COLORS = [
    '#e8453c', '#2f7cf6', '#21a95a', '#f5a524', '#8d5cf6', '#13b3a6', '#ec4f9a', '#f47a1f', '#0fb5d8', '#7cc427',
    '#5b5fe8', '#b8325f', '#3aa0a0', '#d4a017', '#9b3fc4', '#e56a5e', '#2e8b57', '#1e5fa8', '#c75b12', '#d946ef',
    '#0e9f8a', '#6b8e23', '#ff6f91', '#4a90b8', '#a0522d', '#7b61ff', '#f2c230', '#20c997', '#cc3333', '#5e6b7d',
];

// 성격: 매 게임 무작위 배정 (반응속도·기본속도)
const PERSONALITY = [
    { type: 'bold',     speedMul: 1.18, reactMul: 1.50 },
    { type: 'bold',     speedMul: 1.10, reactMul: 1.35 },
    { type: 'normal',   speedMul: 1.00, reactMul: 1.00 },
    { type: 'normal',   speedMul: 0.96, reactMul: 0.88 },
    { type: 'cautious', speedMul: 0.88, reactMul: 0.46 },
];

// ── 화면 문구 (i18n) ───────────────────────────────────────
// 템플릿(mugunghwa.html)이 messages*.properties 에서 읽어 window.MUGUNGHWA_I18N 으로 넘긴다. 없으면 한국어 기본값.
const T = Object.assign({
    count:       '{0}명 입력됨',
    countMin:    '(최소 2명)',
    countMax:    '(최대 30명 초과!)',
    countOk:     '✓',
    modeWinnerShort: '🏆 1등 뽑기',
    modeLoserShort:  '💣 꼴찌 뽑기',
    msgMin:      '최소 2명 이상 입력해주세요!',
    msgMax:      '최대 30명까지 가능합니다!',
    bgmOn:       '🔊 소리 켜짐',
    bgmOff:      '🔇 소리 꺼짐',
    defaultName1:'참가자1',
    defaultName2:'참가자2',
    labelStart:  '시작',
    labelFinish: '결승',
    alive:       '생존: {0}/{1}',
    round:       '라운드: {0}',
    stateGreen:  '달려!',
    stateFast:   '술래가 빨라졌다! ⚡',
    stateRed:    '멈춰! 🛑',
    stateCheck:  '확인 중...',
    roundElim:   '{0}명 탈락!',
    phrase:      '무궁화 꽃이 피었습니다',
    allElim:     '전원 탈락!',
    rankHeader:  '순 위',
    rankName:    '{0}위 {1}',
    freeze:      '🧊 얼음!',
    elim:        '💀 {0} 탈락!',
    first:       '🏆 {0}  1위!',
    reach:       '🏁 {0}위!',
    finalRank:   '🏆 최종 순위',
    rank:        '{0}위',
    winnerTitle: '🏆 오늘의 1등',
    loserTitle:  '💣 벌칙 당첨',
    reasonFirst: '결승선에 제일 먼저 도착!',
    reasonCaught:'술래에게 제일 먼저 걸렸어요',
    reasonLast:  '결승선에 꼴찌로 들어왔어요',
    fsToggle:    '⛶ 전체화면',
    fsToggleExit:'⛶ 전체화면 종료',
}, window.MUGUNGHWA_I18N || {});
function fmt(t, ...v) { return String(t).replace(/\{(\d)\}/g, (_, i) => String(v[i])); }

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
const hexNum = (h) => parseInt(h.slice(1), 16);

// 로컬 저장 (사생활 모드 등에서 실패해도 무시)
const store = {
    get(k, d) { try { const v = localStorage.getItem('mg.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mg.' + k, JSON.stringify(v)); } catch (e) { /* 무시 */ } },
};

// ── 에셋 키 ────────────────────────────────────────────────
const IMG_DOLL       = '/img/mugunghwa';
const DOLL_BACK      = 'mg_doll_back';
const DOLL_TURN_HALF = 'mg_doll_turn_half';
const DOLL_TURN_34   = 'mg_doll_turn_3_4';
const DOLL_FRONT     = 'mg_doll_front';
const ANIM_DOLL_TURN = 'mg_doll_turn';
const ANIM_DOLL_BACK = 'mg_doll_back_turn';

const ASSET = '/assets/mugunghwa';
const BGM_KEY       = 'mg_bgm';
const SFX_COUNTDOWN = 'mg_countdown';
const SFX_DOLL      = 'mg_doll';
const SFX_FREEZE    = 'mg_freeze';
const SFX_GUNSHOT   = 'mg_gunshot';
const SFX_ELIMINATE = 'mg_eliminate';
const SFX_FINISH    = 'mg_finish';
const SFX_FANFARE   = 'mg_fanfare';
const BGM_VOL = 0.4;

function playSfx(scene, key, cfg) {
    if (!scene || !scene.sound) return null;
    // seek 은 play() 에 넘겨야 먹힘 (add 설정은 play 때 0 으로 초기화됨)
    try { const s = scene.sound.add(key); s.once('complete', () => s.destroy()); s.play(cfg || {}); return s; } catch (e) { return null; }
}

function initBgm(scene) {
    const game = scene.game;
    if (!game.bgmSound) {
        try { game.bgmSound = scene.sound.add(BGM_KEY, { loop: true, volume: BGM_VOL }); } catch (e) { return; }
    }
    const on = game.registry.get('bgmOn') !== false;
    scene.sound.mute = !on;
    scene.sound.volume = game.registry.get('volume') ?? 0.8;
    if (on && !game.bgmSound.isPlaying) {
        try { game.bgmSound.play(); } catch (e) { /* 무시 */ }
    }
}
function duckBgm(scene, vol, ms) {
    const s = scene.game.bgmSound;
    if (!s) return;
    scene.tweens.killTweensOf(s);
    scene.tweens.add({ targets: s, volume: vol, duration: ms });
}

function mgSetupCamera(scene) {
    scene.cameras.main.setZoom(MG_K).centerOn(MG_L.W / 2, MG_L.H / 2);
}
// 화면 폭이 바뀌어 배치가 달라졌으면 게임 크기를 새로 잡는다 (씬 시작 때만)
function mgEnsureLayout(scene) {
    const want = mgPickLayout();
    const k = mgRenderScale(want);
    if (want === MG_L && k === MG_K) return;
    MG_L = want;
    MG_K = k;
    scene.scale.setGameSize(Math.round(MG_L.W * MG_K), Math.round(MG_L.H * MG_K));
}

// ============================================================
// 공통 그리기 (필드·트랙·인형)
// ============================================================
function drawFlower(g, x, y, r) {
    g.fillStyle(0xf9a8d4, 1);
    for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
        g.fillCircle(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.52);
    }
    g.fillStyle(0xec4899, 1);
    g.fillCircle(x, y, r * 0.36);
    g.fillStyle(0x9d174d, 1);
    g.fillCircle(x, y, r * 0.2);
    g.fillStyle(0xfde68a, 1);
    g.fillCircle(x, y - r * 0.08, r * 0.08);
}

function drawField(scene, geo) {
    const L = MG_L;
    const g = scene.add.graphics().setDepth(0);
    // 잔디
    g.fillGradientStyle(0x5da04a, 0x5da04a, 0x3f7d36, 0x3f7d36, 1);
    g.fillRect(0, 0, L.W, L.H);
    g.fillStyle(0x000000, 0.05);
    for (let x = 0; x < L.W; x += 72) g.fillRect(x, 0, 36, L.H);

    // 모래 트랙 (레인 교대 색)
    const tt = geo.trackTop - 8, tb = geo.trackBot + 8;
    g.fillStyle(0x9c7443, 1);
    g.fillRoundedRect(L.trackL - 3, tt - 3, L.trackR - L.trackL + 6, tb - tt + 6, 14);
    g.fillStyle(0xdcbb82, 1);
    g.fillRoundedRect(L.trackL, tt, L.trackR - L.trackL, tb - tt, 12);
    for (let i = 0; i < geo.n; i++) {
        if (i % 2) continue;
        g.fillStyle(0xd2ae72, 1);
        g.fillRect(L.trackL, geo.trackTop + i * geo.laneH, L.trackR - L.trackL, geo.laneH);
    }
    // 모래 알갱이
    g.fillStyle(0xb8935c, 0.35);
    for (let i = 0; i < 140; i++) {
        g.fillCircle(Phaser.Math.Between(L.trackL + 6, L.trackR - 6), Phaser.Math.Between(tt + 4, tb - 4), Math.random() * 1.4 + 0.4);
    }
    // 레인 점선
    g.lineStyle(1.5, 0xffffff, 0.38);
    for (let i = 1; i < geo.n; i++) {
        const y = geo.trackTop + i * geo.laneH;
        for (let x = L.trackL + 10; x < L.trackR - 10; x += 22) g.lineBetween(x, y, x + 11, y);
    }
    // 출발선
    g.fillStyle(0xffffff, 0.92);
    g.fillRect(geo.startLineX - 2.5, tt + 4, 5, tb - tt - 8);
    // 결승선 (체크무늬)
    const sq = 8;
    for (let y = tt + 4, r = 0; y < tb - 4; y += sq, r++) {
        for (let c = 0; c < 2; c++) {
            g.fillStyle((r + c) % 2 ? 0x2b2733 : 0xffffff, 1);
            g.fillRect(L.x1 - sq + c * sq, y, sq, Math.min(sq, tb - 4 - y));
        }
    }
    // 시작·결승 라벨
    const ls = { fontFamily: MG_FONT, fontSize: `${Math.round(13 * L.fs)}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#2b2733', strokeThickness: 4 };
    scene.add.text(geo.startLineX, tt - 4, T.labelStart, ls).setOrigin(0.5, 1).setDepth(3);
    scene.add.text(L.x1, tt - 4, T.labelFinish, ls).setOrigin(0.5, 1).setDepth(3);
}

// 인형 + 무궁화 꽃밭
function createDoll(scene, geo) {
    const L = MG_L;
    const tex = scene.textures.get(DOLL_BACK).getSourceImage();
    const areaMid = geo.trackTop + geo.trackH / 2;
    const dollH = Phaser.Math.Clamp(geo.trackH * 0.9, 150, L.dollMaxH);
    const feetY = Math.min(areaMid + dollH / 2, L.H - L.botH - 16);
    const g = scene.add.graphics().setDepth(4);
    // 꽃밭 둔덕
    g.fillStyle(0x2f6b2c, 1);
    g.fillEllipse(L.dollX, feetY + 2, dollH * 0.62, dollH * 0.14);
    g.fillStyle(0x3d8a38, 1);
    g.fillEllipse(L.dollX, feetY - 1, dollH * 0.56, dollH * 0.1);
    const fr = Math.max(5, dollH * 0.032);
    [[-0.24, 0.01], [-0.12, 0.035], [0.02, 0.04], [0.16, 0.03], [0.26, 0.008], [-0.3, -0.012], [0.3, -0.016]].forEach(([dx, dy]) => {
        drawFlower(g, L.dollX + dx * dollH, feetY + dy * dollH, fr);
    });
    // 인형 뒤 은은한 빛
    const glow = scene.add.graphics().setDepth(3);
    for (let i = 0; i < 6; i++) {
        glow.fillStyle(0xfff4c2, 0.035);
        glow.fillCircle(L.dollX, feetY - dollH * 0.5, dollH * (0.2 + i * 0.07));
    }
    const sprite = scene.add.sprite(L.dollX, feetY, DOLL_BACK)
        .setOrigin(0.5, 0.97)
        .setFlipX(true)
        .setDepth(6);
    sprite.setScale(dollH / tex.height);
    return { sprite, feetY, dollH, headY: feetY - dollH * 0.86, handY: feetY - dollH * 0.5 };
}

function ensureDollAnims(scene) {
    if (!scene.anims.exists(ANIM_DOLL_TURN)) {
        scene.anims.create({
            key: ANIM_DOLL_TURN,
            frames: [{ key: DOLL_TURN_HALF }, { key: DOLL_TURN_34 }, { key: DOLL_FRONT }],
            frameRate: 16, repeat: 0,
        });
    }
    if (!scene.anims.exists(ANIM_DOLL_BACK)) {
        scene.anims.create({
            key: ANIM_DOLL_BACK,
            frames: [{ key: DOLL_TURN_34 }, { key: DOLL_TURN_HALF }, { key: DOLL_BACK }],
            frameRate: 20, repeat: 0,
        });
    }
}

// 참가자 텍스처 (프레임 시트)
function makeRunnerTexture(scene, key, look, dispH) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const s = Phaser.Math.Clamp(Math.ceil(dispH / MugunghwaArt.FH * MG_K * 1.15 * 4) / 4, 0.5, 3);
    const { canvas, fw, fh } = MugunghwaArt.makeSheet(look, s);
    const tex = scene.textures.addCanvas(key, canvas);
    MugunghwaArt.FRAMES.forEach((f, i) => tex.add(f, 0, i * fw, 0, fw, fh));
    return { scale: dispH / fh };
}

// 트랙 배치 계산 (인원수 기준)
function computeGeo(n) {
    const L = MG_L;
    const areaTop = L.hudH + 30, areaBot = L.H - L.botH - 14;
    const avail = areaBot - areaTop;
    const laneH = Math.min(L.laneMax, avail / n);
    const trackH = laneH * n;
    const trackTop = areaTop + (avail - trackH) / 2;
    // 레인이 넓으면 레인을 꽉 채우고, 좁으면(인원 많음) 위아래로 조금 겹치게
    const charH = laneH >= 40 ? Math.min(118, laneH * 0.93) : Phaser.Math.Clamp(laneH * 1.2, 22, 46);
    return {
        n, laneH, trackH, trackTop, trackBot: trackTop + trackH, charH,
        tagFont: Math.round(Phaser.Math.Clamp(laneH * 0.5, 12, L.tagMax)),
        startLineX: L.x0 + charH * 0.34,
        feetY: (i) => trackTop + i * laneH + laneH * 0.5 + charH * 0.45,
    };
}

// ============================================================
// PreloadScene
// ============================================================
class PreloadScene extends Phaser.Scene {
    constructor() { super({ key: 'PreloadScene' }); }

    preload() {
        mgSetupCamera(this);
        const L = MG_L;
        const bar = this.add.graphics();
        const txt = this.add.text(L.W / 2, L.H / 2 - 30, '🌸', { fontFamily: MG_FONT, fontSize: '42px' }).setOrigin(0.5);
        this.load.on('progress', (v) => {
            bar.clear();
            bar.fillStyle(0xffffff, 0.15).fillRoundedRect(L.W / 2 - 120, L.H / 2 + 10, 240, 10, 5);
            bar.fillStyle(0xec4f9a, 1).fillRoundedRect(L.W / 2 - 120, L.H / 2 + 10, Math.max(10, 240 * v), 10, 5);
        });
        this.load.once('complete', () => { bar.destroy(); txt.destroy(); });

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
        // 흙먼지 입자
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
        g.generateTexture('mg_dust', 16, 16);
        g.destroy();
        ensureDollAnims(this);
        this.scene.start('SetupScene');
    }
}

// ============================================================
// SetupScene – 참가자 입력 (HTML 패널) 뒤에 깔리는 대기 화면
// ============================================================
class SetupScene extends Phaser.Scene {
    constructor() { super({ key: 'SetupScene' }); }

    create() {
        mgEnsureLayout(this);
        mgSetupCamera(this);
        const n = 5;
        const geo = computeGeo(n);
        drawField(this, geo);
        const doll = createDoll(this, geo);
        doll.sprite.setTexture(DOLL_BACK);

        // 출발선에서 몸 푸는 참가자들
        const colors = shuffle(PLAYER_COLORS);
        this._idlers = [];
        for (let i = 0; i < n; i++) {
            const look = { color: colors[i], hair: MugunghwaArt.HAIRS[i % MugunghwaArt.HAIRS.length], hairStyle: i % 3 };
            const key = `mg_idle_${i}`;
            const { scale } = makeRunnerTexture(this, key, look, geo.charH);
            const x = MG_L.x0 + Phaser.Math.Between(-6, 26);
            const y = geo.feetY(i);
            this.add.ellipse(x, y, geo.charH * 0.5, geo.charH * 0.1, 0x000000, 0.18).setDepth(9);
            const sp = this.add.sprite(x, y, key, 'run1').setOrigin(MugunghwaArt.FOOT_X / MugunghwaArt.FW, MugunghwaArt.FOOT_Y / MugunghwaArt.FH)
                .setScale(scale).setDepth(10 + i * 0.01);
            this._idlers.push({ sp, t: Math.random() * 1000, frames: Math.random() < 0.5 ? ['run0', 'run1', 'run2', 'run3'] : ['frz0', 'frz1'] });
        }

        initBgm(this);
        if (window.mgUI) window.mgUI.showSetup();
        this.events.once('shutdown', () => {
            this._idlers.forEach((_, i) => { if (this.textures.exists(`mg_idle_${i}`)) this.textures.remove(`mg_idle_${i}`); });
        });
    }

    update(time, delta) {
        if (!this._idlers) return;
        this._idlers.forEach((o) => {
            o.t += delta;
            const f = o.frames.length === 4 ? o.frames[Math.floor(o.t / 150) % 4] : o.frames[Math.floor(o.t / 900) % 2];
            if (o.sp.frame.name !== f) o.sp.setFrame(f);
        });
    }
}

// ============================================================
// GameScene – 메인 게임
// ============================================================
class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    init(data) {
        this.playerNames = (data && data.names) || [T.defaultName1, T.defaultName2];
        this.gameMode    = (data && data.mode) || 'winner';
        this.numPlayers  = this.playerNames.length;

        this.phase        = 'IDLE';
        this.roundNum     = 0;
        this.gameOver     = false;
        this.players      = [];
        this.finishCount  = 0;
        this.shoutRate    = 1;
        this._voice       = null;
        this._roundEliminated = [];
        this._lbRows      = null;
        this._lbTimer     = 0;
        this._phraseChars = [];
        this._revealed    = 0;
    }

    create() {
        mgEnsureLayout(this);
        mgSetupCamera(this);
        if (window.mgUI) window.mgUI.hidePanels();
        const L = MG_L;
        this.geo = computeGeo(this.numPlayers);

        drawField(this, this.geo);
        this.doll = createDoll(this, this.geo);
        this.dollSprite = this.doll.sprite;
        ensureDollAnims(this);

        this.dust = this.add.particles(0, 0, 'mg_dust', {
            emitting: false,
            lifespan: 420,
            speedX: { min: -50, max: -12 },
            speedY: { min: -26, max: -4 },
            scale: { start: this.geo.charH / 260, end: this.geo.charH / 90 },
            alpha: { start: 0.55, end: 0 },
            tint: 0xc9a46a,
        }).setDepth(8);

        this._createPlayers();
        this._createHUD();
        if (L.lbW) this._createLeaderboard();

        // 얼음 순간 붉은 테두리
        this.vignette = this.add.graphics().setDepth(38).setAlpha(0);
        for (let i = 0; i < 6; i++) {
            this.vignette.lineStyle(14, 0xff1f3d, 0.2 - i * 0.03);
            this.vignette.strokeRect(i * 12 + 7, i * 12 + 7, L.W - i * 24 - 14, L.H - i * 24 - 14);
        }
        this.scanGfx = this.add.graphics().setDepth(7);

        initBgm(this);
        duckBgm(this, BGM_VOL, 200);

        this._voice = this.sound.add(SFX_DOLL);
        this._voice.addMarker({ name: 'shout', start: SHOUT_START, duration: SHOUT_LEN });

        this.events.once('shutdown', () => this._cleanup());
        this.time.delayedCall(350, () => this._startCountdown());
    }

    _cleanup() {
        this.tweens.killAll();
        this.time.removeAllEvents();
        if (this._voice) {
            try { this._voice.off('complete'); this._voice.stop(); this._voice.destroy(); } catch (e) { /* 무시 */ }
            this._voice = null;
        }
        if (this.dollSprite) {
            try { this.dollSprite.off('animationcomplete'); this.dollSprite.anims.stop(); } catch (e) { /* 무시 */ }
            this.dollSprite = null;
        }
        this.players.forEach((p) => { if (this.textures.exists(p.texKey)) this.textures.remove(p.texKey); });
    }

    // ────────────────────────────────────────────────────────
    // 참가자
    // ────────────────────────────────────────────────────────
    _createPlayers() {
        const L = MG_L, geo = this.geo;
        const colors = shuffle(PLAYER_COLORS);
        const hairs = shuffle(MugunghwaArt.HAIRS);
        const tagFont = geo.tagFont;
        // 이름표는 캐릭터 뒤(왼쪽)에 붙음 → 출발 구역 폭 안에 들어가게 자름
        const tagRoom = L.x0 - geo.charH * 0.28 - L.trackL - 6;

        for (let i = 0; i < this.numPlayers; i++) {
            // 성격은 매번 새로 추첨, 반응속도에 ±20% 개인 변동
            const pType = PERSONALITY[Phaser.Math.Between(0, PERSONALITY.length - 1)];
            const reactMs = Phaser.Math.Between(REACT_MIN, REACT_MAX) * pType.reactMul * Phaser.Math.FloatBetween(0.80, 1.20);
            const color = colors[i % colors.length];
            const look = { color, hair: hairs[i % hairs.length], hairStyle: Phaser.Math.Between(0, 2) };
            const texKey = `mg_runner_${i}`;
            const { scale } = makeRunnerTexture(this, texKey, look, geo.charH);
            const feetY = geo.feetY(i);

            const shadow = this.add.ellipse(L.x0, feetY, geo.charH * 0.5, geo.charH * 0.1, 0x3b2a14, 0.28).setDepth(9);
            const sprite = this.add.sprite(L.x0, feetY, texKey, 'run1')
                .setOrigin(MugunghwaArt.FOOT_X / MugunghwaArt.FW, MugunghwaArt.FOOT_Y / MugunghwaArt.FH)
                .setScale(scale)
                .setDepth(10 + i * 0.01);

            const name = this.playerNames[i];
            const tag = this.add.text(0, 0, name, {
                fontFamily: MG_FONT, fontSize: `${tagFont}px`, fontStyle: 'bold', color: '#ffffff',
                stroke: MugunghwaArt.shade(color, 0.45), strokeThickness: Math.max(3, tagFont * 0.22),
                backgroundColor: MugunghwaArt.shade(color, 0.8),
                padding: { x: Math.round(tagFont * 0.32), y: Math.round(tagFont * 0.1) },
            }).setOrigin(1, 0.5).setDepth(30 + i * 0.01);
            for (let len = Array.from(name).length - 1; tag.width > tagRoom && len > 1; len--) {
                tag.setText(Array.from(name).slice(0, len).join('') + '…');
            }

            this.players.push({
                idx: i, name, color, look, texKey, scale,
                progress: 0,
                feetY,
                alive: true, finished: false, rank: null,
                speedMul: pType.speedMul,
                reactDelay: reactMs,
                personality: pType.type,
                velocity: 0, baseVelocity: 0,
                inPlaceRunning: false,
                freezeFrame: 'frz0',
                animT: Math.random() * 600,
                dustT: Math.random() * 200,
                sprite, shadow, tag, alert: null,
            });
        }
        this.players.forEach((p) => this._placePlayer(p));
    }

    _px(p) { return MG_L.x0 + (Math.min(p.progress, TOTAL_PROGRESS) / TOTAL_PROGRESS) * (MG_L.x1 - MG_L.x0); }

    _placePlayer(p) {
        const x = p.finished ? MG_L.x1 + this.geo.charH * 0.3 : this._px(p);
        p.sprite.x = x + (p.jitter || 0);
        p.shadow.x = x;
        const g = this.geo;
        p.tag.setPosition(x - g.charH * 0.28, p.feetY - g.charH * (p.alive ? 0.42 : 0.62));
        if (p.alert) p.alert.setPosition(x + g.charH * 0.2, p.feetY - g.charH * 1.02);
    }

    // ────────────────────────────────────────────────────────
    // HUD
    // ────────────────────────────────────────────────────────
    _createHUD() {
        const L = MG_L, fs = L.fs;
        const top = this.add.graphics().setDepth(20);
        top.fillStyle(0x12101a, 0.88).fillRect(0, 0, L.W, L.hudH);
        top.fillStyle(0xec4f9a, 1).fillRect(0, L.hudH - 3, L.W, 3);
        const bot = this.add.graphics().setDepth(20);
        bot.fillStyle(0x12101a, 0.88).fillRect(0, L.H - L.botH, L.W, L.botH);

        // 신호등
        this.signalGfx = this.add.graphics().setDepth(21);
        this._signalPos = { x: 22 * fs, y: L.key === 'tall' ? 28 : L.hudH / 2 - 1, r: 10 * fs };
        this._drawSignal('off');

        const infoStyle = { fontFamily: MG_FONT, fontSize: `${Math.round(14 * fs)}px`, fontStyle: 'bold', color: '#e9e4f5' };
        if (L.key === 'tall') {
            this.roundText = this.add.text(L.W - 14, 12, '', infoStyle).setOrigin(1, 0).setDepth(21);
            this.aliveText = this.add.text(L.W - 14, 36, '', infoStyle).setOrigin(1, 0).setDepth(21);
        } else {
            this.roundText = this.add.text(L.W - 16, 12, '', infoStyle).setOrigin(1, 0).setDepth(21);
            this.aliveText = this.add.text(L.W - 16, 33, '', infoStyle).setOrigin(1, 0).setDepth(21);
        }
        const modeLabel = this.gameMode === 'winner' ? T.modeWinnerShort : T.modeLoserShort;
        const modeX = L.key === 'tall' ? L.W / 2 : this._signalPos.x + 84;
        this.add.text(modeX, this._signalPos.y, modeLabel, {
            fontFamily: MG_FONT, fontSize: `${Math.round(13 * fs)}px`, fontStyle: 'bold',
            color: this.gameMode === 'winner' ? '#2b2733' : '#ffffff',
            backgroundColor: this.gameMode === 'winner' ? '#ffd23f' : '#e0355a',
            padding: { x: 8, y: 3 },
        }).setOrigin(L.key === 'tall' ? 0.5 : 0, 0.5).setDepth(21);

        // 가사 (한 글자씩 불이 들어옴)
        this._phraseY = L.key === 'tall' ? 76 : L.hudH / 2;
        this._buildPhrase();

        // 상태 라벨
        this.stateLabel = this.add.text(L.W / 2, L.H - L.botH / 2, '', {
            fontFamily: MG_FONT, fontSize: `${Math.round(22 * fs)}px`, fontStyle: 'bold', color: '#ffffff',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(21);

        // 카운트다운·얼음 등 큰 글자
        this.bigText = this.add.text(L.W / 2, this.geo.trackTop + this.geo.trackH / 2, '', {
            fontFamily: MG_FONT, fontSize: `${Math.round(96 * Math.min(fs, 1.15))}px`, fontStyle: 'bold', color: '#ffffff',
            stroke: '#2b2733', strokeThickness: 12,
        }).setOrigin(0.5).setDepth(40).setAlpha(0);

        this._updateHUD();
    }

    _buildPhrase() {
        const L = MG_L;
        const size = L.key === 'tall' ? 36 : 30;
        const chars = Array.from(T.phrase);
        const style = { fontFamily: MG_FONT, fontSize: `${size}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#2b2733', strokeThickness: 5 };
        const objs = chars.map((c) => this.add.text(0, this._phraseY, c, style).setOrigin(0.5).setDepth(22));
        const widths = objs.map((o, i) => (chars[i] === ' ' ? size * 0.32 : o.width * 0.94));
        let total = widths.reduce((a, b) => a + b, 0);
        const maxW = L.key === 'tall' ? L.W - 28 : 560;
        const k = total > maxW ? maxW / total : 1;
        if (k < 1) objs.forEach((o) => o.setScale(k));
        total *= k;
        let x = L.W / 2 - total / 2;
        let si = 0;
        const nonSpace = chars.filter((c) => c !== ' ').length;
        this._phraseChars = [];
        objs.forEach((o, i) => {
            const w = widths[i] * k;
            o.setX(x + w / 2);
            o.baseScale = k;
            x += w;
            if (chars[i] === ' ') { o.setVisible(false); return; }
            // 글자 → 음절 시각 (글자 수가 달라도 음절 10개에 고르게 대응)
            const syl = SYLLABLES[Math.min(SYLLABLES.length - 1, Math.floor(si * SYLLABLES.length / nonSpace))];
            this._phraseChars.push({ o, at: syl - SHOUT_START });
            si++;
        });
        this._resetPhrase();
    }

    _resetPhrase() {
        this._revealed = 0;
        this._phraseChars.forEach(({ o }) => {
            this.tweens.killTweensOf(o);
            o.setAlpha(0.22).setColor('#ffffff').setScale(o.baseScale);
        });
    }

    _drawSignal(state) {
        const g = this.signalGfx;
        const { x, y, r } = this._signalPos;
        g.clear();
        g.fillStyle(0x0a0910, 1);
        g.fillRoundedRect(x - r - 5, y - r - 5, r * 6 + 18, r * 2 + 10, r + 5);
        const lights = [['red', 0xff3b4f, 0x3a1016], ['yellow', 0xffc83d, 0x3a2e10], ['green', 0x2ee07a, 0x0f3320]];
        lights.forEach(([k, on, off], i) => {
            const cx = x + i * (r * 2 + 4);
            if (state === k) {
                g.fillStyle(on, 0.3).fillCircle(cx, y, r + 4);
                g.fillStyle(on, 1).fillCircle(cx, y, r);
                g.fillStyle(0xffffff, 0.5).fillCircle(cx - r * 0.3, y - r * 0.3, r * 0.3);
            } else {
                g.fillStyle(off, 1).fillCircle(cx, y, r);
            }
        });
    }

    _updateHUD() {
        const alive = this.players.filter((p) => p.alive && !p.finished).length;
        this.aliveText.setText(fmt(T.alive, alive, this.numPlayers));
        this.roundText.setText(fmt(T.round, Math.max(1, this.roundNum)));
        this._updateLeaderboard();
    }

    _setState(text, color, size) {
        this.stateLabel.setText(text).setColor(color).setFontSize(`${Math.round((size || 22) * MG_L.fs)}px`);
        this.tweens.killTweensOf(this.stateLabel);
        this.stateLabel.setScale(1.25);
        this.tweens.add({ targets: this.stateLabel, scale: 1, duration: 220, ease: 'Back.Out' });
    }

    _popBig(text, color, hold) {
        const t = this.bigText;
        this.tweens.killTweensOf(t);
        t.setScale(1).setText(text).setColor(color).setAlpha(1);
        const k = Math.min(1, MG_L.W * 0.9 / Math.max(1, t.width));
        t.setScale(k * 1.7);
        this.tweens.add({ targets: t, scale: k, duration: 260, ease: 'Back.Out' });
        this.tweens.add({ targets: t, alpha: 0, delay: hold, duration: 260 });
    }

    // ────────────────────────────────────────────────────────
    // 순위표 (가로형 왼쪽)
    // ────────────────────────────────────────────────────────
    _createLeaderboard() {
        const L = MG_L;
        const x = 8, y = L.hudH + 10, w = L.lbW - 16, maxH = L.H - L.botH - y - 10;
        const rowH = Math.min(34, (maxH - 40) / this.numPlayers);
        const h = Math.min(maxH, 40 + rowH * this.numPlayers + 6);
        const g = this.add.graphics().setDepth(18);
        g.fillStyle(0x12101a, 0.78).fillRoundedRect(x, y, w, h, 12);
        this.add.text(x + w / 2, y + 16, T.rankHeader, {
            fontFamily: MG_FONT, fontSize: '14px', fontStyle: 'bold', color: '#f9a8d4',
        }).setOrigin(0.5).setDepth(19);
        const fsize = Math.round(Phaser.Math.Clamp(rowH * 0.56, 11, 17));
        const maxNm = this.numPlayers <= 8 ? 6 : this.numPlayers <= 15 ? 5 : 4;
        this._lb = { x, y0: y + 36, w, rowH, fsize, maxNm };
        this._lbRows = this.players.map(() => ({
            dot: this.add.circle(0, 0, Math.min(5, rowH * 0.22), 0xffffff).setDepth(19),
            txt: this.add.text(0, 0, '', { fontFamily: MG_FONT, fontSize: `${fsize}px`, fontStyle: 'bold', color: '#ffffff' }).setOrigin(0, 0.5).setDepth(19),
            icon: this.add.text(0, 0, '', { fontFamily: MG_FONT, fontSize: `${fsize}px` }).setOrigin(1, 0.5).setDepth(19),
        }));
        this._updateLeaderboard();
    }

    _sortedStandings() {
        return [...this.players].sort((a, b) => {
            if (a.finished !== b.finished) return a.finished ? -1 : 1;
            if (a.finished && b.finished) return a.rank - b.rank;
            if (a.alive !== b.alive) return a.alive ? -1 : 1;
            if (!a.alive && !b.alive) return a.rank - b.rank;
            return b.progress - a.progress;
        });
    }

    _updateLeaderboard() {
        if (!this._lbRows) return;
        const lb = this._lb;
        this._sortedStandings().forEach((p, r) => {
            const row = this._lbRows[r];
            const ry = lb.y0 + r * lb.rowH + lb.rowH / 2;
            const short = p.name.length > lb.maxNm ? p.name.slice(0, lb.maxNm - 1) + '…' : p.name;
            row.dot.setPosition(lb.x + 12, ry).setFillStyle(hexNum(p.color));
            row.txt.setPosition(lb.x + 22, ry).setText(fmt(T.rankName, r + 1, short))
                .setColor(p.finished ? '#ffd23f' : p.alive ? '#ffffff' : '#8d87a0');
            row.icon.setPosition(lb.x + lb.w - 8, ry).setText(p.finished ? '🏁' : p.alive ? '' : '❌');
        });
    }

    // ────────────────────────────────────────────────────────
    // 카운트다운 (countdown.mp3 는 1초 간격 삑 4번: 3·2·1·출발)
    // ────────────────────────────────────────────────────────
    // 느린 기기에서도 삑 소리와 맞도록 실제 시간 기준
    _startCountdown() {
        this.phase = 'COUNTDOWN';
        playSfx(this, SFX_COUNTDOWN, { volume: 0.8 });
        this._cdStart = performance.now();
        this._cdStep = -1;
    }

    _updateCountdown() {
        const e = performance.now() - this._cdStart;
        const step = Math.min(3, Math.floor(e / 1000));
        if (step > this._cdStep) {
            this._cdStep = step;
            if (step < 3) this._popBig(String(3 - step), '#ffd23f', 520);
            else this._popBig(T.stateGreen, '#2ee07a', 420);
        }
        if (e >= 3200) this._startGreenPhase();
    }

    // ────────────────────────────────────────────────────────
    // GREEN – 인형이 외치는 동안 달림
    // ────────────────────────────────────────────────────────
    _startGreenPhase() {
        if (this.gameOver) return;
        this._roundEliminated = [];
        this.phase = 'GREEN';
        this.roundNum++;
        this._drawSignal('green');
        this._resetPhrase();
        this.scanGfx.clear();
        duckBgm(this, BGM_VOL, 250);

        // 외침 빠르기: 1라운드는 원래대로, 이후 무작위
        this.shoutRate = this.roundNum === 1 ? 1 : Phaser.Utils.Array.GetRandom(SHOUT_RATES);
        const fast = this.shoutRate >= 1.15;
        this._setState(fast ? T.stateFast : T.stateGreen, fast ? '#ffd23f' : '#2ee07a', 22);

        // 매 라운드 속도 재추첨 → 역전 가능
        const roundBump   = 1 + (this.roundNum - 1) * 0.07;
        const roundFactor = Phaser.Math.FloatBetween(0.72, 1.28);
        const active = this.players.filter((p) => p.alive && !p.finished);
        const lastManBoost = active.length === 1 ? 2.8 : active.length <= 3 ? 1.6 : 1.0;
        active.forEach((p) => {
            const playerRnd = Phaser.Math.FloatBetween(0.75, 1.25);
            p.baseVelocity = Phaser.Math.FloatBetween(SPEED_MIN, SPEED_MAX)
                * p.speedMul * roundBump * roundFactor * playerRnd * lastManBoost;
            // 외침이 빠르면 다들 그만큼 빨리 뜀 (라운드당 전진량·걸릴 확률은 그대로)
            p.velocity = p.baseVelocity * this.shoutRate;
            p.inPlaceRunning = false;
            p.jitter = 0;
            if (p.alert) { p.alert.destroy(); p.alert = null; }
        });
        this._updateHUD();
        this._playDollPhrase();
    }

    _playDollPhrase() {
        const durMs = SHOUT_LEN / this.shoutRate * 1000;
        this._greenStart = performance.now();
        let done = false;
        const proceed = () => {
            if (done) return;
            done = true;
            fallback.remove(false);
            if (this.phase === 'GREEN' && !this.gameOver) this._startTurning();
        };
        // 소리가 안 나는 환경(자동재생 막힘 등)에서도 같은 박자로 진행
        const fallback = this.time.delayedCall(durMs + 250, proceed);
        const v = this._voice;
        if (v) {
            try {
                v.off('complete');
                v.once('complete', proceed);
                v.play('shout', { rate: this.shoutRate, volume: 1 });
            } catch (e) { /* 타이머로 진행 */ }
        }
    }

    // 가사 불 켜기 + 끝 두 음절에서 노란불
    _updatePhrase() {
        const t = (performance.now() - this._greenStart) / 1000 * this.shoutRate;
        while (this._revealed < this._phraseChars.length && this._phraseChars[this._revealed].at <= t) {
            const { o } = this._phraseChars[this._revealed];
            const last = this._revealed >= this._phraseChars.length - 2;
            o.setAlpha(1).setColor(last ? '#ffd23f' : '#ffffff').setScale(o.baseScale * 1.45);
            this.tweens.add({ targets: o, scale: o.baseScale, duration: 180, ease: 'Back.Out' });
            this._revealed++;
            if (this._revealed === this._phraseChars.length - 1) this._drawSignal('yellow');
        }
    }

    // ────────────────────────────────────────────────────────
    // 얼음! – 외침 끝나자마자 삐리리릭 + 뒤돌기
    // ────────────────────────────────────────────────────────
    _startTurning() {
        if (this.gameOver) return;
        this.phase = 'TURNING';
        this._drawSignal('red');
        this._setState(T.stateRed, '#ff4d62', 24);
        playSfx(this, SFX_FREEZE, { seek: FREEZE_SEEK, volume: 0.9 });
        duckBgm(this, BGM_VOL * 0.35, 150);
        this._phraseChars.forEach(({ o }) => o.setColor('#ff4d62'));
        this._popBig(T.freeze, '#bfe6ff', 420);
        if (!REDUCED_MOTION) this.cameras.main.shake(160, 0.006);
        this.vignette.setAlpha(1);
        this.tweens.add({ targets: this.vignette, alpha: 0.35, duration: 500 });

        this._turnDoll(() => this._startRedPhase());

        // 전원 즉시 정지 – 반응 딜레이 동안 달렸을 거리로 걸림 여부만 결정
        this.players.forEach((p) => {
            if (!p.alive || p.finished) return;
            p.velocity = 0;
            const theoreticalMove = (p.reactDelay / 16.67) * p.baseVelocity * 0.5;
            p.inPlaceRunning = theoreticalMove > ELIM_MOVE_PROG;
            p.freezeFrame = Math.random() < 0.5 ? 'frz0' : 'frz1';
            if (p.inPlaceRunning) {
                p.sprite.setFrame('pan0');
            } else {
                p.sprite.setFrame(p.freezeFrame);
                // 멈칫하는 느낌
                p.sprite.setScale(p.scale * 1.06, p.scale * 0.94);
                this.tweens.add({ targets: p.sprite, scaleX: p.scale, scaleY: p.scale, duration: 180, ease: 'Back.Out' });
            }
        });
    }

    _turnDoll(onDone) {
        const s = this.dollSprite;
        if (!s) { onDone(); return; }
        s.clearTint();
        s.play(ANIM_DOLL_TURN);
        s.once('animationcomplete', () => { if (this.dollSprite) s.setTexture(DOLL_FRONT); onDone(); });
    }

    // ────────────────────────────────────────────────────────
    // RED – 훑어보고 걸린 사람 탈락
    // ────────────────────────────────────────────────────────
    _startRedPhase() {
        if (this.gameOver) return;
        this.phase = 'RED';
        this._startScan();

        // 걸린 사람: 뒤에 있는 사람부터 (꼴찌 뽑기 순위가 바로 정해짐)
        let toElim = this.players
            .filter((p) => p.alive && !p.finished && p.inPlaceRunning)
            .sort((a, b) => a.progress - b.progress);

        // 1등 뽑기에서 전원 탈락 방지 – 모두 걸렸으면 선두는 살림
        if (this.gameMode === 'winner' && toElim.length > 0) {
            const willSurvive = this.players.filter((p) => p.alive && !p.finished && !p.inPlaceRunning);
            if (willSurvive.length === 0) {
                const spared = toElim[toElim.length - 1];
                toElim = toElim.slice(0, -1);
                spared.inPlaceRunning = false;
                spared.sprite.setFrame(spared.freezeFrame);
            }
        }

        // 걸린 사람 머리 위 느낌표
        toElim.forEach((p) => {
            p.alert = this.add.text(0, 0, '!', {
                fontFamily: MG_FONT, fontSize: `${Math.round(Phaser.Math.Clamp(this.geo.charH * 0.42, 11, 24))}px`, fontStyle: 'bold',
                color: '#ffffff', backgroundColor: '#e0253f', padding: { x: Math.round(Phaser.Math.Clamp(this.geo.charH * 0.1, 3, 7)), y: 0 },
            }).setOrigin(0.5, 1).setDepth(33);
            this._placePlayer(p);
            p.alert.setScale(0);
            this.tweens.add({ targets: p.alert, scale: 1, duration: 200, ease: 'Back.Out' });
        });

        if (toElim.length > 0) {
            const step = 300;
            toElim.forEach((p, i) => {
                this.time.delayedCall(420 + i * step, () => { if (p.alive && !this.gameOver) this._eliminatePlayer(p); });
            });
            this.time.delayedCall(420 + toElim.length * step + 650, () => { if (!this.gameOver) this._startCheckPhase(); });
        } else {
            const redDur = Phaser.Math.Between(DUR_RED_MIN, DUR_RED_MAX);
            this.time.delayedCall(redDur, () => { if (!this.gameOver) this._startCheckPhase(); });
        }
    }

    // 인형 눈에서 나오는 빨간 훑기 빛
    _startScan() {
        const L = MG_L, geo = this.geo;
        const ex = L.dollX - this.doll.dollH * 0.05, ey = this.doll.headY;
        const scan = { t: 0 };
        const draw = () => {
            const g = this.scanGfx;
            g.clear();
            if (this.phase !== 'RED') return;
            const band = geo.laneH * Math.min(2.2, Math.max(1.2, geo.n * 0.2));
            const cy = geo.trackTop + scan.t * geo.trackH;
            g.fillStyle(0xff2240, 0.1);
            g.beginPath();
            g.moveTo(ex, ey);
            g.lineTo(L.trackL, cy - band);
            g.lineTo(L.trackL, cy + band);
            g.closePath();
            g.fillPath();
            g.lineStyle(2, 0xff5068, 0.55);
            g.lineBetween(ex, ey, L.trackL, cy);
            g.fillStyle(0xff4058, 0.9).fillCircle(ex, ey, 3.5);
        };
        this._scanTween = this.tweens.add({
            targets: scan, t: 1, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut',
            onUpdate: draw,
        });
    }

    // ────────────────────────────────────────────────────────
    // CHECK – 다음 라운드 or 결과
    // ────────────────────────────────────────────────────────
    _startCheckPhase() {
        if (this.gameOver) return;
        this.phase = 'CHECK';
        if (this._scanTween) { this._scanTween.remove(); this._scanTween = null; }
        this.scanGfx.clear();
        this.tweens.add({ targets: this.vignette, alpha: 0, duration: 250 });

        const elimThisRound = [...this._roundEliminated].sort((a, b) => a.progress - b.progress);
        if (elimThisRound.length > 0) this._setState(fmt(T.roundElim, elimThisRound.length), '#ff4d62', 22);
        else this._setState(T.stateCheck, '#b9b3c9', 20);

        // 꼴찌 뽑기: 이번 라운드 탈락자 중 가장 뒤에 있던 사람
        if (elimThisRound.length > 0 && this.gameMode === 'loser') {
            this.gameOver = true;
            this.time.delayedCall(350, () => this._showResult(elimThisRound[0], 'loser', 'caught'));
            return;
        }

        const activeCount = this.players.filter((p) => p.alive && !p.finished).length;
        if (activeCount <= 0) {
            const finishers = this.players.filter((q) => q.finished).sort((a, b) => a.rank - b.rank);
            this.gameOver = true;
            this.time.delayedCall(350, () => {
                if (finishers.length > 0 && this.gameMode === 'winner') this._showResult(finishers[0], 'winner', 'first');
                else this._showResult(null, 'allElim');
            });
            return;
        }

        // 인형 다시 뒤돌기
        if (this.dollSprite) {
            this.dollSprite.play(ANIM_DOLL_BACK);
            this.dollSprite.once('animationcomplete', () => { if (this.dollSprite) this.dollSprite.setTexture(DOLL_BACK); });
        }
        this.time.delayedCall(380, () => { if (!this.gameOver) this._startGreenPhase(); });
    }

    // ────────────────────────────────────────────────────────
    // 탈락
    // ────────────────────────────────────────────────────────
    _eliminatePlayer(p) {
        p.alive = false;
        p.velocity = 0;
        if (!this._roundEliminated.includes(p)) this._roundEliminated.push(p);
        // 탈락 순위: 먼저 탈락할수록 낮은 순위
        const deadCount = this.players.filter((q) => !q.alive && !q.finished).length;
        p.rank = this.numPlayers - deadCount + 1;

        playSfx(this, SFX_GUNSHOT, { volume: 0.7 });
        this._drawShot(p);
        if (!REDUCED_MOTION) this.cameras.main.shake(110, 0.007);
        if (this.dollSprite) {
            this.dollSprite.setTint(0xffb0b0);
            this.time.delayedCall(140, () => { if (this.dollSprite) this.dollSprite.clearTint(); });
        }

        this.time.delayedCall(120, () => {
            playSfx(this, SFX_ELIMINATE, { volume: 0.8 });
            this._fallDown(p);
            this._updateHUD();
        });

        // 탈락 이름은 쓰러진 사람 머리 위에
        const L = MG_L;
        const flash = this.add.text(0, 0, fmt(T.elim, p.name), {
            fontFamily: MG_FONT, fontSize: `${Math.round(Phaser.Math.Clamp(this.geo.charH * 0.3, 16, 24) * L.fs)}px`, fontStyle: 'bold', color: '#ffffff',
            stroke: '#b3122b', strokeThickness: 6,
        }).setOrigin(0.5, 1).setDepth(39).setAlpha(0);
        const fx = Phaser.Math.Clamp(p.sprite.x, flash.width / 2 + 8, L.W - flash.width / 2 - 8);
        const fy = Math.max(L.hudH + flash.height + 4, p.feetY - this.geo.charH * 0.75);
        flash.setPosition(fx, fy);
        this.tweens.add({
            targets: flash, alpha: 1, scale: { from: 0.6, to: 1 }, duration: 200, ease: 'Back.Out',
            onComplete: () => this.tweens.add({ targets: flash, alpha: 0, y: fy - 26, delay: 700, duration: 400, onComplete: () => flash.destroy() }),
        });
    }

    _drawShot(p) {
        const L = MG_L;
        const gx = L.dollX - this.doll.dollH * 0.16, gy = this.doll.handY;
        const tx = p.sprite.x, ty = p.feetY - this.geo.charH * 0.45;
        const g = this.add.graphics().setDepth(36);
        g.lineStyle(4, 0xfff27a, 0.95).lineBetween(gx, gy, tx, ty);
        g.lineStyle(1.5, 0xffffff, 1).lineBetween(gx, gy, tx, ty);
        g.fillStyle(0xff7a1a, 0.8).fillCircle(gx, gy, 13);
        g.fillStyle(0xfff27a, 1).fillCircle(gx, gy, 7);
        // 맞은 자리 별
        const r = this.geo.charH * 0.32;
        g.fillStyle(0xffffff, 1);
        g.beginPath();
        for (let i = 0; i < 16; i++) {
            const a = i * Math.PI / 8, rr = i % 2 ? r * 0.35 : r;
            if (i === 0) g.moveTo(tx + Math.cos(a) * rr, ty + Math.sin(a) * rr); else g.lineTo(tx + Math.cos(a) * rr, ty + Math.sin(a) * rr);
        }
        g.closePath().fillPath();
        this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
    }

    _fallDown(p) {
        if (p.alert) { p.alert.destroy(); p.alert = null; }
        p.jitter = 0;
        this._placePlayer(p);
        p.sprite.setFrame('dead');
        this.tweens.add({
            targets: p.sprite, angle: -90, duration: 360, ease: 'Bounce.Out',
            onComplete: () => { p.sprite.setTint(0xb0aab8); p.sprite.setAlpha(0.85); },
        });
        this.tweens.add({ targets: p.tag, alpha: 0.4, duration: 300 });
        for (let k = 0; k < 8; k++) {
            this.dust.emitParticleAt(p.sprite.x - this.geo.charH * 0.4 + Math.random() * this.geo.charH * 0.5, p.feetY - 2, 1);
        }
    }

    // ────────────────────────────────────────────────────────
    // 결승 도착
    // ────────────────────────────────────────────────────────
    _playerFinished(p) {
        p.finished = true;
        p.velocity = 0;
        p.rank = ++this.finishCount;
        playSfx(this, SFX_FINISH, { volume: 0.7 });
        p.sprite.setFrame('cheer');
        this._placePlayer(p);
        this.tweens.add({ targets: p.sprite, y: p.feetY - this.geo.charH * 0.25, duration: 160, yoyo: true, repeat: 1, ease: 'Quad.Out' });

        const L = MG_L;
        if (this.gameMode === 'winner' && p.rank === 1) {
            playSfx(this, SFX_FANFARE, { volume: 0.8 });
            const flt = this.add.text(L.W / 2, this.geo.trackTop + this.geo.trackH * 0.35, fmt(T.first, p.name), {
                fontFamily: MG_FONT, fontSize: `${Math.round(38 * Math.min(L.fs, 1.1))}px`, fontStyle: 'bold', color: '#ffd23f',
                stroke: '#2b2733', strokeThickness: 8,
            }).setOrigin(0.5).setDepth(39).setAlpha(0);
            this.tweens.add({
                targets: flt, alpha: 1, scale: { from: 0.5, to: 1.08 }, duration: 320, ease: 'Back.Out',
                onComplete: () => this.tweens.add({ targets: flt, alpha: 0, y: flt.y - 50, delay: 1800, duration: 600, onComplete: () => flt.destroy() }),
            });
            this._confetti(70);
        }

        const f = this.add.text(p.sprite.x, p.feetY - this.geo.charH, fmt(T.reach, p.rank), {
            fontFamily: MG_FONT, fontSize: `${Math.round(18 * L.fs)}px`, fontStyle: 'bold', color: '#ffd23f',
            stroke: '#2b2733', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(37);
        this.tweens.add({ targets: f, y: f.y - 36, alpha: 0, duration: 1100, ease: 'Power2', onComplete: () => f.destroy() });

        const stillActive = this.players.filter((q) => !q.finished && q.alive);
        if (stillActive.length === 0 && !this.gameOver) {
            this.gameOver = true;
            if (this.gameMode === 'winner') {
                const winner = this.players.filter((q) => q.finished).sort((a, b) => a.rank - b.rank)[0];
                this.time.delayedCall(700, () => this._showResult(winner, 'winner', 'first'));
            } else {
                const last = this.players.filter((q) => q.finished).sort((a, b) => b.rank - a.rank)[0];
                this.time.delayedCall(700, () => this._showResult(last, 'loser', 'last'));
            }
        }
        this._updateHUD();
    }

    // ────────────────────────────────────────────────────────
    // 결과
    // ────────────────────────────────────────────────────────
    _getFinalRanking() {
        const finished = this.players.filter((p) => p.finished).sort((a, b) => a.rank - b.rank);
        const out = this.players.filter((p) => !p.alive && !p.finished).sort((a, b) => a.rank - b.rank);
        const running = this.players.filter((p) => p.alive && !p.finished).sort((a, b) => b.progress - a.progress);
        return [...finished, ...running, ...out];
    }

    _showResult(player, type, reason) {
        if (this.phase === 'RESULT') return;
        this.gameOver = true;
        this.phase = 'RESULT';
        this.players.forEach((p) => { p.velocity = 0; });
        if (this._voice) { try { this._voice.stop(); } catch (e) { /* 무시 */ } }
        this.scanGfx.clear();
        duckBgm(this, BGM_VOL, 400);

        const L = MG_L;
        const dim = this.add.rectangle(L.W / 2, L.H / 2, L.W, L.H, 0x0b0912, 0.62).setDepth(45).setAlpha(0);
        this.tweens.add({ targets: dim, alpha: 1, duration: 350 });

        if (type === 'winner') this._confetti(90);
        if (type === 'loser') { playSfx(this, SFX_FANFARE, { volume: 0.7 }); this._loserRain(); }

        const ranking = this._getFinalRanking().map((p, i) => ({
            rank: p.finished || !p.alive ? p.rank : i + 1,
            name: p.name, color: p.color, out: !p.alive, finished: p.finished,
        }));
        const data = {
            type, reason, mode: this.gameMode,
            name: player ? player.name : null,
            color: player ? player.color : null,
            avatar: player ? MugunghwaArt.portrait(player.look, type === 'winner' ? 'cheer' : 'pan0', 200) : null,
            ranking: type === 'winner' ? ranking : [],
        };
        this.time.delayedCall(450, () => { if (window.mgUI) window.mgUI.showResult(data); });
    }

    _confetti(count) {
        const L = MG_L;
        const cols = [0xec4f9a, 0x2ee07a, 0xffd23f, 0x2f7cf6, 0x8d5cf6, 0xff6f3c, 0x0fb5d8];
        for (let i = 0; i < count; i++) {
            const x = Phaser.Math.Between(10, L.W - 10);
            const c = this.add.rectangle(x, -20, Phaser.Math.Between(6, 11), Phaser.Math.Between(9, 16), Phaser.Utils.Array.GetRandom(cols)).setDepth(46);
            this.tweens.add({
                targets: c,
                x: x + Phaser.Math.Between(-120, 120), y: L.H + 30,
                angle: Phaser.Math.Between(-540, 540),
                duration: Phaser.Math.Between(1800, 3600), ease: 'Sine.easeIn',
                delay: Phaser.Math.Between(0, 900),
                onComplete: () => c.destroy(),
            });
        }
    }

    _loserRain() {
        const L = MG_L;
        const cols = [0xcc2244, 0xff3355, 0xaa1133, 0xff6688];
        for (let i = 0; i < 50; i++) {
            const x = Phaser.Math.Between(20, L.W - 20);
            const c = this.add.circle(x, L.H + 20, Phaser.Math.Between(3, 9), Phaser.Utils.Array.GetRandom(cols)).setDepth(46);
            this.tweens.add({
                targets: c, x: x + Phaser.Math.Between(-100, 100), y: Phaser.Math.Between(L.H * 0.15, L.H * 0.75),
                alpha: { from: 1, to: 0 }, duration: Phaser.Math.Between(1400, 3000), ease: 'Power2',
                delay: Phaser.Math.Between(0, 800), onComplete: () => c.destroy(),
            });
        }
    }

    // ────────────────────────────────────────────────────────
    // 매 프레임
    // ────────────────────────────────────────────────────────
    update(time, delta) {
        if (this.phase === 'RESULT') return;
        const dms = Math.min(delta, 100);
        const dt = dms / 16.67;
        const geo = this.geo;

        if (this.phase === 'GREEN') this._updatePhrase();
        else if (this.phase === 'COUNTDOWN') this._updateCountdown();

        this.players.forEach((p) => {
            if (p.finished) {
                this._placePlayer(p);
                return;
            }
            if (!p.alive) return;

            if (this.phase === 'GREEN') {
                p.progress = Math.min(p.progress + p.velocity * dt, TOTAL_PROGRESS);
                if (p.progress >= TOTAL_PROGRESS && !this.gameOver) {
                    this._playerFinished(p);
                    return;
                }
                // 빠를수록 발놀림도 빠르게
                const ref = (SPEED_MIN + SPEED_MAX) / 2 * this.shoutRate;
                const frameMs = Phaser.Math.Clamp(105 / Math.sqrt(Math.max(0.2, p.velocity / ref)), 60, 150);
                p.animT += dms;
                const f = 'run' + (Math.floor(p.animT / frameMs) % 4);
                if (p.sprite.frame.name !== f) p.sprite.setFrame(f);
                p.dustT += dms;
                if (p.dustT > 140) {
                    p.dustT = 0;
                    this.dust.emitParticleAt(p.sprite.x - geo.charH * 0.12, p.feetY - 2, 1);
                }
            } else if (this.phase === 'TURNING' || this.phase === 'RED' || this.phase === 'CHECK') {
                if (p.inPlaceRunning) {
                    // 들킨 사람: 제자리에서 허우적
                    p.animT += dms;
                    const f = 'pan' + (Math.floor(p.animT / 80) % 2);
                    if (p.sprite.frame.name !== f) p.sprite.setFrame(f);
                    p.jitter = Math.sin(time / 30 + p.idx) * geo.charH * 0.03;
                } else if (this.phase === 'RED') {
                    // 숨 참고 부들부들
                    p.jitter = Math.sin(time / 45 + p.idx * 1.7) * geo.charH * 0.012;
                } else {
                    p.jitter = 0;
                }
            }
            this._placePlayer(p);
        });

        this._lbTimer += dms;
        if (this._lbTimer > 200) {
            this._lbTimer = 0;
            this._updateLeaderboard();
        }
    }
}

// ============================================================
// Phaser 게임 인스턴스 (입력 없음 – 조작은 HTML 버튼)
// ============================================================
const mugunghwaGame = new Phaser.Game({
    type: Phaser.AUTO,
    width: Math.round(MG_L.W * MG_K),
    height: Math.round(MG_L.H * MG_K),
    parent: 'mg-canvas',
    backgroundColor: '#3f7d36',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    render: { antialias: true },
    scene: [PreloadScene, SetupScene, GameScene],
});

// ============================================================
// HTML UI (참가자 입력 · 결과 카드 · 소리 · 전체화면)
// ============================================================
(() => {
    const $ = (id) => document.getElementById(id);
    const game = mugunghwaGame;
    const stage = $('game-container');
    const setupEl = $('mg-setup');
    const resultEl = $('mg-result');
    const namesEl = $('mgNamesInput');
    const countEl = $('mgCount');
    const msgEl = $('mgMsg');
    const startBtn = $('mgStartBtn');
    const modeBtns = Array.from(document.querySelectorAll('#mg-setup [data-mode]'));
    let mode = store.get('mode', 'winner') === 'loser' ? 'loser' : 'winner';
    let lastNames = [];
    let msgTimer = 0;

    const parseNames = (raw) => raw.split(/[\n,，、]+/).map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, 20));

    function updateCount() {
        const n = parseNames(namesEl.value).length;
        const ok = n >= 2 && n <= 30;
        countEl.textContent = fmt(T.count, n) + ' ' + (n < 2 ? T.countMin : n > 30 ? T.countMax : T.countOk);
        countEl.classList.toggle('ok', ok);
        startBtn.classList.toggle('ready', ok);
    }
    function setMode(m) {
        mode = m;
        modeBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
    }
    function showMsg(text) {
        msgEl.textContent = text;
        clearTimeout(msgTimer);
        msgTimer = setTimeout(() => { msgEl.textContent = ''; }, 2600);
    }

    function startGame(names, m) {
        lastNames = names;
        store.set('names', names);
        store.set('mode', m);
        game.registry.set('lastNames', names);
        hidePanels();
        // 게임 시작 버튼(사용자 동작)에서 오디오 잠금 해제
        try { if (game.sound.context && game.sound.context.state !== 'running') game.sound.context.resume(); } catch (e) { /* 무시 */ }
        const sm = game.scene;
        if (sm.isActive('SetupScene')) sm.stop('SetupScene');
        if (sm.isActive('GameScene') || sm.isPaused('GameScene')) sm.getScene('GameScene').scene.restart({ names, mode: m });
        else sm.start('GameScene', { names, mode: m });
    }

    function hidePanels() {
        setupEl.hidden = true;
        resultEl.hidden = true;
        stage.classList.remove('mg-has-panel');
    }
    function showSetup() {
        resultEl.hidden = true;
        setupEl.hidden = false;
        stage.classList.add('mg-has-panel');
        updateCount();
    }

    function showResult(d) {
        const card = resultEl.querySelector('.mg-result-card');
        card.className = 'mg-card mg-result-card ' + (d.type === 'winner' ? 'is-winner' : d.type === 'loser' ? 'is-loser' : 'is-all') + (d.ranking.length > 6 ? ' long' : '');
        const kicker = resultEl.querySelector('.mg-result-kicker');
        const nameEl = resultEl.querySelector('.mg-result-name');
        const reasonEl = resultEl.querySelector('.mg-result-reason');
        const img = resultEl.querySelector('.mg-result-avatar');
        const list = resultEl.querySelector('.mg-rank-list');
        const listTitle = resultEl.querySelector('.mg-rank-title');
        kicker.textContent = d.type === 'winner' ? T.winnerTitle : d.type === 'loser' ? T.loserTitle : T.allElim;
        nameEl.textContent = d.name || '—';
        nameEl.style.setProperty('--mg-c', d.color || '#ec4f9a');
        reasonEl.textContent = d.reason === 'first' ? T.reasonFirst : d.reason === 'caught' ? T.reasonCaught : d.reason === 'last' ? T.reasonLast : '';
        if (d.avatar) { img.src = d.avatar; img.hidden = false; } else { img.hidden = true; }
        list.innerHTML = '';
        listTitle.hidden = !d.ranking.length;
        d.ranking.forEach((r) => {
            const li = document.createElement('li');
            if (r.out) li.className = 'out';
            if (r.rank <= 3 && r.finished) li.classList.add('top' + r.rank);
            const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = fmt(T.rank, r.rank);
            const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = r.color;
            const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
            const st = document.createElement('span'); st.className = 'st'; st.textContent = r.finished ? '🏁' : r.out ? '❌' : '';
            li.append(rk, dot, nm, st);
            list.appendChild(li);
        });
        setupEl.hidden = true;
        resultEl.hidden = false;
        stage.classList.add('mg-has-panel');
        const first = resultEl.querySelector('[data-act="restart"]');
        if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
    }

    window.mgUI = { showSetup, showResult, hidePanels };

    // ── 참가자 입력 ──
    const saved = store.get('names', null);
    if (Array.isArray(saved) && saved.length) namesEl.value = saved.join('\n');
    setMode(mode);
    updateCount();
    namesEl.addEventListener('input', updateCount);
    namesEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); startBtn.click(); }
    });
    modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    startBtn.addEventListener('click', () => {
        const names = parseNames(namesEl.value);
        if (names.length < 2) return showMsg(T.msgMin);
        if (names.length > 30) return showMsg(T.msgMax);
        startGame(names, mode);
    });
    resultEl.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'restart') {
            startGame(lastNames.length ? lastNames : parseNames(namesEl.value), mode);
        } else {
            const sm = game.scene;
            if (sm.isActive('GameScene')) sm.stop('GameScene');
            sm.start('SetupScene');
        }
    });

    // ── 소리 ──
    const bgmToggle = $('bgmToggle');
    const volumeCtrl = $('volumeControl');
    game.registry.set('bgmOn', store.get('sound', true) !== false);
    game.registry.set('volume', Phaser.Math.Clamp(Number(store.get('volume', 0.8)) || 0.8, 0, 1));
    if (volumeCtrl) volumeCtrl.value = String(Math.round(game.registry.get('volume') * 100));

    const applySound = () => {
        const on = game.registry.get('bgmOn') !== false;
        if (bgmToggle) {
            bgmToggle.textContent = on ? T.bgmOn : T.bgmOff;
            bgmToggle.setAttribute('aria-pressed', String(on));
        }
        if (!game.sound) return;
        game.sound.mute = !on;
        game.sound.volume = game.registry.get('volume');
        const s = game.bgmSound;
        if (s) {
            if (on && !s.isPlaying) { try { s.play(); } catch (e) { /* 무시 */ } }
            if (!on && s.isPlaying) s.pause();
        }
    };
    applySound();
    if (bgmToggle) bgmToggle.addEventListener('click', () => {
        const on = !(game.registry.get('bgmOn') !== false);
        game.registry.set('bgmOn', on);
        store.set('sound', on);
        try { if (on && game.sound.context && game.sound.context.state !== 'running') game.sound.context.resume(); } catch (e) { /* 무시 */ }
        applySound();
    });
    if (volumeCtrl) {
        const onVol = () => {
            const v = Number(volumeCtrl.value) / 100;
            game.registry.set('volume', v);
            store.set('volume', v);
            if (game.sound) game.sound.volume = v;
        };
        volumeCtrl.addEventListener('input', onVol);
        volumeCtrl.addEventListener('change', onVol);
    }

    // ── 전체화면 (게임 박스만) ──
    const fsToggle = $('fsToggle');
    const fsExit = $('mgFsExitBtn');
    const fsEnabled = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    const isFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    const refresh = () => requestAnimationFrame(() => { try { game.scale.refresh(); } catch (e) { /* 무시 */ } });
    const onFsChange = () => {
        const on = isFS();
        if (fsToggle) fsToggle.textContent = on ? T.fsToggleExit : T.fsToggle;
        stage.classList.toggle('is-fs', on);
        refresh();
        setTimeout(refresh, 250);
    };
    if (!fsEnabled) {
        if (fsToggle) fsToggle.hidden = true;
    } else {
        if (fsToggle) fsToggle.addEventListener('click', () => {
            if (isFS()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
        });
        if (fsExit) fsExit.addEventListener('click', () => { if (isFS()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); });
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onFsChange);
    }
    // 폰 회전 등으로 배치가 바뀌면 대기 화면은 바로 다시 그림 (게임 중이면 다음 판부터)
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        refresh();
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (game.scene.isActive('SetupScene') && (mgPickLayout() !== MG_L || mgRenderScale(mgPickLayout()) !== MG_K)) {
                game.scene.getScene('SetupScene').scene.restart();
            }
        }, 250);
    });
})();
