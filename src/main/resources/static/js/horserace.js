'use strict';

// ============================================================
// horserace.js – 말달리자  |  Phaser 3 웹 경마 게임
// Binary World (game.binaryworld.kr)
// ============================================================

// ============================================================
// 화면 문구 (i18n)
// 템플릿(horserace.html)이 messages*.properties 에서 읽어 window.HORSERACE_I18N 으로 넘긴다.
// 없으면 한국어 기본값. 문구를 고칠 땐 이 파일이 아니라 properties 를 고친다.
// 예전엔 navigator.language 로 언어를 골라 JS 안의 사전을 썼는데, 구글이 영어 문서로 안 봐서
// 서버 렌더(/en/horserace, /ja/horserace)로 바꿨다. 언어는 주소가 정한다.
// ============================================================
const T = Object.assign({
    count:           '{0}명 입력됨',
    countMin:        '(최소 2명)',
    countMax:        '(최대 30명 초과!)',
    countOk:         '✓',
    modeWinner:      '🏆 1등 우승 뽑기',
    modeLoser:       '💣 꼴찌 벌칙 뽑기',
    modeHintLoser:   '▲ 꼴찌로 들어온 말의 주인이 벌칙!',
    modeHintWinner:  '▲ 1등으로 들어온 말의 주인이 우승!',
    msgMin:          '최소 2명 이상 입력해주세요!',
    msgMax:          '최대 30명까지 가능합니다!',
    defaultName1:    '참가자1',
    defaultName2:    '참가자2',
    leaderboard:     '🏆 실시간 순위',
    rank:            '{0}위',
    finalSpurt:      '🔥 마지막 스퍼트! 🔥',
    carrotEat:       '🥕 냠냠!',
    rockHit:         '🪨 쿵!',
    puddleHit:       '💧 첨벙!',
    resultWin:       '🏆 우승!',
    resultLose:      '💣 벌칙 당첨!',
    reasonWin:       '결승선에 제일 먼저 들어왔어요',
    reasonLose:      '결승선에 마지막으로 들어왔어요',
    bgmOn:           '🔊 소리 켜짐',
    bgmOff:          '🔇 소리 꺼짐',
    fsToggle:        '⛶ 전체화면',
    fsToggleExit:    '⛶ 전체화면 종료',
    fsToggleTip:     '전체화면 전환',
    fsExitTip:       '전체화면 나가기',
}, (typeof window !== 'undefined' && window.HORSERACE_I18N) || {});
function fmt(t, v) { return t.replace('{0}', String(v)); }

// ── 화면 배치: PC 는 가로형, 폭 600px 이하 폰은 세로형 ─────────
// 높이(720)는 같아서 레인 폭·회피 거리 등 경주 계산은 배치와 상관없이 똑같다. 보이는 폭만 다름.
// lbW = 순위표 폭, camOff = 선두 말을 화면 폭의 어디에 둘지, fs = 글자 배율
const HR_LAYOUTS = {
    wide: { key: 'wide', W: 1000, H: 720, lbW: 190, camOff: 0.65, fs: 1 },
    tall: { key: 'tall', W: 540,  H: 720, lbW: 172, camOff: 0.4,  fs: 1.3 },
};
const HR_TALL_MQ = '(max-width: 600px)';

function hrPickLayout() {
    return window.matchMedia && window.matchMedia(HR_TALL_MQ).matches ? HR_LAYOUTS.tall : HR_LAYOUTS.wide;
}
// 캔버스 해상도 배율 (고해상도 화면에서 흐리지 않게, 최대 2)
function hrRenderScale(L) {
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const box = document.getElementById('game-container');
    const cssW = box && box.clientWidth ? box.clientWidth : L.W;
    return Math.max(1, Math.min(2, Math.round(dpr * cssW / L.W * 4) / 4));
}
let HR_L = hrPickLayout();
let HR_K = hrRenderScale(HR_L);

// 모든 텍스트를 캔버스 배율 해상도로 렌더
{
    const origText = Phaser.GameObjects.GameObjectFactory.prototype.text;
    Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, t, style) {
        return origText.call(this, x, y, t, Object.assign({ resolution: HR_K }, style || {}));
    };
}

const HR_FONT = "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Hiragino Sans', sans-serif";

// 로컬 저장 (사생활 모드 등에서 실패해도 무시)
const store = {
    get(k, d) { try { const v = localStorage.getItem('hr.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('hr.' + k, JSON.stringify(v)); } catch (e) { /* 무시 */ } },
};

// 카메라: 원점을 왼쪽 위로 두고 배율만큼 확대 → 좌표는 논리 크기(HR_L.W × HR_L.H) 그대로 쓴다
function hrSetupCamera(scene) {
    scene.cameras.main.setOrigin(0, 0).setZoom(HR_K);
}
// 화면 폭이 바뀌어 배치가 달라졌으면 게임 크기를 새로 잡는다 (씬 시작 때만)
function hrEnsureLayout(scene) {
    const want = hrPickLayout();
    const k = hrRenderScale(want);
    if (want === HR_L && k === HR_K) return;
    HR_L = want;
    HR_K = k;
    scene.scale.setGameSize(Math.round(HR_L.W * HR_K), Math.round(HR_L.H * HR_K));
}
// 글자가 폭을 넘으면 줄임
function hrFitText(t, maxW) {
    if (t.width > maxW) t.setScale(maxW / t.width);
    return t;
}

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
// 말은 OS 이모지를 쓴다. 코드로 그린 스프라이트로 바꿔 봤는데(2026-09-20) 이모지보다 못생겨서 되돌렸다.
// 이모지 🏇🦄🐉✨🔥 는 전부 유니코드 6~8 이라 어디서나 나온다 (깨지던 건 🪨 뿐이고 그건 장애물 쪽에서 그림으로 대체).
// 달리는 느낌은 _drawHorseVisuals 의 들썩임(gait)으로 낸다.
// 에픽 dodgeMul 은 원래 0.35(덩치 커서 둔함)였는데, 계산해 보니 바위에 두 번 더 걸리는 손해(약 1200px)가
// 속도 보너스(약 300px)를 크게 넘어 1% 잭팟이 오히려 불리했다. 용은 날아 넘는다는 설정으로 1.0.
const TIER_COMMON = 'common';
const TIER_RARE   = 'rare';
const TIER_EPIC   = 'epic';
const TIER_DEF = [
    { tier: TIER_COMMON, prob: 0.94, emoji: '🏇', speedBonus: 0,   boosterMul: 1.0, trail: null, dodgeMul: 1.0 },
    { tier: TIER_RARE,   prob: 0.05, emoji: '🦄', speedBonus: 0.1, boosterMul: 1.5, trail: '✨', dodgeMul: 1.0 },
    { tier: TIER_EPIC,   prob: 0.01, emoji: '🐉', speedBonus: 0.2, boosterMul: 1.0, trail: '🔥', dodgeMul: 1.0 },
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

// 장애물 정의 (가중치 랜덤). 그림은 HorseRaceArt 의 'hr_obs_<type>' 텍스처
const OBSTACLE_DEF = [
    { type: 'rock',   weight: 3 },
    { type: 'puddle', weight: 3 },
    { type: 'carrot', weight: 4 },
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
        HorseRaceArt.build(this);   // 말·장애물·아이콘 텍스처 (게임 전체에서 공유)
        this.scene.start('SetupScene');
    }
}

// ============================================================
// SetupScene – 참가자 입력 대기 화면. 입력은 HTML 패널(#hr-setup)이 받고, 캔버스는 배경만
// ============================================================
class SetupScene extends Phaser.Scene {
    constructor() { super({ key: 'SetupScene' }); }

    create() {
        hrEnsureLayout(this);
        hrSetupCamera(this);
        const { W, H } = HR_L;
        this.cameras.main.setBackgroundColor('#060614');

        this.add.graphics()
            .fillGradientStyle(0x07071a, 0x07071a, 0x141432, 0x141432, 1)
            .fillRect(0, 0, W, H);
        for (let i = 0; i < 90; i++) {
            this.add.circle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, 150), Math.random() * 1.3 + 0.3, 0xffffff, Math.random() * 0.5 + 0.25);
        }

        // 출발선에 선 말 5마리 (제자리에서 들썩임)
        const n = 5, top = 170, laneH = (H - top - 40) / n;
        const gfx = this.add.graphics();
        for (let i = 0; i < n; i++) {
            gfx.fillStyle(i % 2 === 0 ? 0x3c7828 : 0x326420, 1).fillRect(0, top + i * laneH, W, laneH);
        }
        gfx.lineStyle(2.5, 0xffffff, 0.5).lineBetween(0, top, W, top).lineBetween(0, top + n * laneH, W, top + n * laneH);
        gfx.fillStyle(0xffffff, 0.8).fillRect(W * 0.2, top, 4, n * laneH);
        const colors = pickDistinctColorsForCount(n);
        this._idlers = [];
        for (let i = 0; i < n; i++) {
            const y = top + i * laneH + laneH / 2;
            const x = W * 0.2 - 40 - Phaser.Math.Between(0, 14);
            this.add.circle(x, y, laneH * 0.36, colors[i], 0.3);
            const t = this.add.text(x, y, '🏇', { fontSize: `${Math.floor(laneH * 0.7)}px` }).setOrigin(0.5);
            this._idlers.push({ t, y, ph: Math.random() * Math.PI * 2 });
        }

        // BGM: Phaser Sound Manager 사용 (모바일/iOS에서 볼륨 슬라이더 정상 동작)
        if (!this.game.bgmSound) {
            try { this.game.bgmSound = this.sound.add(BGM_KEY, { loop: true }); } catch (e) { /* 무시 */ }
        }
        const vol = this.registry.get('bgmVolume');
        if (this.game.bgmSound) this.game.bgmSound.volume = vol === undefined ? 0.3 : vol;
        const bgmOn = this.registry.get('bgmOn') !== false;
        this.sound.mute = !bgmOn;
        if (bgmOn && this.game.bgmSound) { try { if (!this.game.bgmSound.isPlaying) this.game.bgmSound.play(); } catch (e) { /* 무시 */ } }

        if (window.hrUI) window.hrUI.showSetup();
    }

    update(time) {
        if (!this._idlers) return;
        for (const o of this._idlers) {
            const g = time * 0.006 + o.ph;
            o.t.y = o.y + Math.sin(g) * 3;
            o.t.rotation = Math.sin(g + Math.PI / 2) * 0.05;
        }
    }
}

// ============================================================
// GameScene – 경마 메인 씬
// ============================================================
class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    init(data) {
        this.names       = data.names || [T.defaultName1, T.defaultName2];
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
    }

    create() {
        hrEnsureLayout(this);
        hrSetupCamera(this);
        const { W, H, fs } = HR_L;
        if (window.hrUI) window.hrUI.hidePanels();

        // 모바일 포함 효과음 잘 들리도록 마스터 볼륨 확보
        this.sound.volume = 1;

        // ── 레이아웃 계산 ─────────────────────────────────────
        const MARGIN_TOP = 44;
        const MARGIN_BOT = MM_H + 12;
        const TRACK_TOP  = MARGIN_TOP;
        const TRACK_H    = H - MARGIN_TOP - MARGIN_BOT;
        const LANE_H     = TRACK_H / this.numHorses;
        // HORSE_FONT 는 이모지 시절의 이름이지만 말 크기·오라·그림자·아이콘 위치의 기준 단위로 그대로 쓴다.
        const HORSE_FONT = Phaser.Math.Clamp(Math.floor(LANE_H * 0.78), 10, 60);   // 상한 44→60: 이모지보다 스프라이트가 여유롭게 커도 된다
        // 레인이 좁으면(대략 19명 이상) 이름표를 말 위가 아니라 말 뒤(왼쪽)에 붙인다.
        // 위에 두면 윗 레인 말과 겹치고, 그걸 피하려고 글자를 7px 까지 줄이면 읽을 수가 없었다.
        const NAME_BESIDE = LANE_H < 34;
        // 폰(세로 배치)은 화면이 작게 줄어드니 글자를 fs 배만큼 키운다
        const FONT_SZ    = this.numHorses <= 10
            ? Phaser.Math.Clamp(Math.floor(LANE_H * 0.52), 12, Math.round(22 * fs))
            : NAME_BESIDE
                ? Phaser.Math.Clamp(Math.floor(LANE_H * 0.6), 10, Math.round(14 * fs))
                : Phaser.Math.Clamp(Math.floor(LANE_H * 0.42), 10, Math.round(14 * fs));
        this.layout = { TRACK_TOP, TRACK_H, LANE_H, HORSE_FONT, FONT_SZ, NAME_BESIDE };

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
                Phaser.Math.Between(0, W),
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
        this.horseEmojis = [];   // 🏇🦄🐉 Text 오브젝트
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
                gait:              Math.random() * Math.PI * 2,   // 들썩임 위상 (말마다 다르게 시작)
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

            // 등급별 이모지 텍스트
            this.horseEmojis.push(
                this.add.text(120, laneY, tierDef.emoji, { fontSize: `${HORSE_FONT}px` })
                    .setOrigin(0.5).setDepth(10)
            );

            this.nameLabels.push(
                this.add.text(0, 0, this.names[i], {
                    fontFamily: HR_FONT,
                    fontSize: `${FONT_SZ}px`,
                    fontStyle: 'bold',
                    color: '#ffffff',
                    stroke: '#000000', strokeThickness: 3,
                }).setOrigin(0.5).setDepth(11)
            );

            const iconSz = Phaser.Math.Clamp(FONT_SZ + 6, 12, Math.round(24 * fs));
            this.statusIcons.push(
                this.add.image(0, 0, 'hr_ic_boost').setDisplaySize(iconSz, iconSz).setDepth(12).setVisible(false)
            );
        }

        // ── 순위표 (우측 상단, 상대 좌표 사용) ─────────────────
        this._createLeaderboard();
        // 카운트다운 동안에도 내 말을 찾을 수 있게 이름표·순위표를 미리 그림
        for (const h of this.horses) this._drawHorseVisuals(h);
        this._updateLeaderboard(this.horses);

        // ── 모드 표시 라벨 ───────────────────────────────────
        const modeLabel = this.mode === 'winner' ? T.modeWinner : T.modeLoser;
        const modeColor = this.mode === 'winner' ? '#FFD700' : '#FF6666';
        this.add.text(12, 6, modeLabel, {
            fontFamily: HR_FONT, fontStyle: 'bold', fontSize: `${Math.round(16 * fs)}px`,
            color: modeColor, stroke: '#000', strokeThickness: 4,
        }).setScrollFactor(0).setDepth(52);

        // ── 미니맵 (하단, 안전 여백) ─────────────────────────
        this._createMinimap();

        // ── 마지막 스퍼트 연출용 오버레이 (숨김) ─────────────
        const cw = W, ch = H;
        this.finalLapOverlay = this.add.rectangle(cw / 2, ch / 2, cw + 200, ch + 200, 0xFF0000, 0)
            .setScrollFactor(0).setDepth(88).setVisible(false);

        // 슬로우모션 연출용 오버레이 & 텍스트 (꼴찌 뽑기: 마지막 말이 결승선 직전일 때)
        this.slowMoOverlay = this.add.rectangle(cw / 2, ch / 2, cw + 200, ch + 200, 0x000033, 0)
            .setScrollFactor(0).setDepth(89).setVisible(false);
        this.slowMoText = this.add.text(cw / 2, ch * 0.28, '🐢  S · L · O · W', {
            fontFamily: HR_FONT,
            fontSize: '40px',
            color: '#00EEFF',
            stroke: '#003355',
            strokeThickness: 7,
            shadow: { offsetX: 0, offsetY: 0, color: '#0088FF', blur: 22, fill: true },
        }).setOrigin(0.5).setScrollFactor(0).setDepth(96).setAlpha(0).setVisible(false);
        hrFitText(this.slowMoText, W - 40);

        // ── 카운트다운 ──────────────────────────────────────
        this.time.delayedCall(400, () => this._showCountdown());
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
            fontFamily: HR_FONT, fontSize: '13px',
            color: '#FFD700', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(7);
    }

    // ── Obstacles ─────────────────────────────────────────────
    _generateObstacles() {
        const { TRACK_TOP, LANE_H } = this.layout;
        const count      = Phaser.Math.Clamp(this.numHorses * 5, 20, 90);
        const obsFontSz  = Phaser.Math.Clamp(Math.floor(LANE_H * 0.50), 14, 28);   // 최소 10→14: 30명 레인에서 12px 짜리 바위는 안 보였다

        for (let i = 0; i < count; i++) {
            const x       = Phaser.Math.Between(500, FINISH_X - 400);
            const laneIdx = Phaser.Math.Between(0, this.numHorses - 1);
            const y       = TRACK_TOP + laneIdx * LANE_H + LANE_H / 2;
            const def     = pickObstacleDef();

            const img = this.add.image(x, y, 'hr_obs_' + def.type)
                .setOrigin(0.5).setDepth(7.5).setDisplaySize(obsFontSz * 1.25, obsFontSz * 1.25);

            // 살랑이는 애니메이션
            this.tweens.add({
                targets: img, y: y - 4, yoyo: true, repeat: -1,
                duration: 750 + Math.random() * 500, ease: 'Sine.easeInOut',
                delay: Math.random() * 600,
            });

            this.obstacleGroup.push({ id: i, x, y, laneIdx, type: def.type, sprite: img, collected: false });
        }
    }

    // ── Leaderboard: 참가자 수에 맞춰 전원 표시, 짤림 방지 ─
    // 행 높이는 글자에 맞추고(빈 칸으로 트랙 가리지 않게), 넘치면 미니맵 위까지만
    _createLeaderboard() {
        const { W: camW, H: camH, lbW: LBW, fs } = HR_L;
        const n    = this.numHorses;
        const LBX  = camW - LBW - 10;
        const LBY  = 12;
        const titleSz  = Math.round(13 * fs);
        const HEADER_H = titleSz + 14;

        const mmTop  = camH - MM_H - 8;
        const maxH   = mmTop - LBY - 12;
        const rowFit = Math.max(12, Math.floor((maxH - HEADER_H - 6) / n));
        const lbFontSz = n <= 10
            ? Phaser.Math.Clamp(rowFit - 4, 14, Math.round(17 * fs))
            : Phaser.Math.Clamp(rowFit - 5, 9, Math.round(13 * fs));
        const ROW_H = Math.min(rowFit, Math.round(lbFontSz * 1.5));
        const LBH   = HEADER_H + ROW_H * n + 6;

        const bg = this.add.graphics().setScrollFactor(0).setDepth(50);
        this.lbBg = bg;
        this.lbX = LBX; this.lbY = LBY; this.lbW = LBW; this.lbH = LBH;
        this._redrawLeaderboardBg(0.42);

        this.lbTitle = this.add.text(LBX + LBW / 2, LBY + HEADER_H / 2, T.leaderboard, {
            fontSize: `${titleSz}px`, fontFamily: HR_FONT,
            color: '#FFD700', fontStyle: 'bold',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
        hrFitText(this.lbTitle, LBW - 12);

        this.lbTexts = [];
        const y0 = LBY + HEADER_H;
        for (let i = 0; i < n; i++) {
            const t = this.add.text(LBX + 8, y0 + i * ROW_H + ROW_H / 2, `${fmt(T.rank, i + 1)}  -`, {
                fontSize: `${lbFontSz}px`, fontFamily: HR_FONT, fontStyle: 'bold', color: '#cccccc',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(51);
            t._last = '';
            this.lbTexts.push(t);
        }
        this.lbFontSz = lbFontSz;
        this.lbRowH = ROW_H;
    }

    // ── Minimap (하단, 상대 좌표) ─────────────────────────────
    _createMinimap() {
        const { W: camW, H: camH } = HR_L;
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
        const cx = HR_L.W / 2, cy = HR_L.H / 2;
        const cd = this.add.text(cx, cy, '', {
            fontFamily: HR_FONT, fontSize: '110px',
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
        const viewW = HR_L.W;

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
        this._updateCamera(sortedByX, dt);

        // UI (순위는 완주 순·현재 위치 반영)
        this._updateLeaderboard(this._getRankDisplayOrder());
        this._updateMinimap();
    }

    // ── Camera Follow: 선두 추적, 화면 우측(0.65)에 두어 후발 추격전이 잘 보이게 ─
    _updateCamera(sortedByX, dt) {
        const targetHorse = sortedByX[0];
        const viewW       = HR_L.W;
        const offset      = HR_L.camOff;
        const targetX     = Phaser.Math.Clamp(targetHorse.x - viewW * offset, 0, TRACK_LEN - viewW + 300);
        // 프레임이 느린 폰에서도 같은 속도로 따라가게 dt 반영
        this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, targetX, 1 - Math.pow(0.93, dt || 1));
    }

    _triggerFinalLap(time) {
        this.finalLapTriggered = true;
        this.finalLapUntil    = time + 3000;

        const cx = HR_L.W / 2, cy = HR_L.H / 2;

        const popup = this.add.text(cx, cy, T.finalSpurt, {
            fontFamily: HR_FONT,
            fontSize: '52px',
            color: '#FFDD00',
            stroke: '#CC0000',
            strokeThickness: 8,
            shadow: { offsetX: 0, offsetY: 0, color: '#FF4400', blur: 20, fill: true },
        }).setOrigin(0.5).setScrollFactor(0).setDepth(95).setAlpha(0);
        // 폰 폭에 맞춰 줄이고, 그 크기를 기준으로 튀어나오게
        const k = Math.min(1, (HR_L.W - 60) / (popup.width * 1.35));
        popup.setScale(0.5 * k);

        this.tweens.add({
            targets: popup,
            alpha: 1,
            scaleX: 1.15 * k,
            scaleY: 1.15 * k,
            duration: 280,
            ease: 'Back.easeOut',
        });
        this.tweens.add({
            targets: popup,
            alpha: 0,
            scaleX: 1.35 * k,
            scaleY: 1.35 * k,
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
        const iconKey = horse.isSpinning ? 'hr_ic_dizzy' : horse.isBoosting ? 'hr_ic_boost' : horse.isStumbling ? 'hr_ic_alert' : null;
        const icon = this.statusIcons[horse.idx];
        if (iconKey) {
            if (icon.texture.key !== iconKey) {
                const w = icon.displayWidth, h = icon.displayHeight;
                icon.setTexture(iconKey).setDisplaySize(w, h);
            }
            icon.setVisible(true);
        } else {
            icon.setVisible(false);
        }

        // ★ Rubber-banding: 꼴찌 그룹 부스터 (레어 1.5배, 막판 스퍼트 시 하위권 대폭 상승)
        // 2명일 때도 돈다. 예전엔 3명 이상 조건이라 제일 흔한 1:1 에서 역전 장치가 통째로 꺼져 있었다.
        // (2명이면 rank 2 > 2*0.72 이므로 뒤처진 쪽이 그대로 꼴찌 그룹에 잡힌다)
        if (!horse.isBoosting && !horse.isStumbling && activeCount >= 2) {
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
        // 들썩임 위상: 빠를수록 빨리 뛴다 (기본 속도 6 ≈ 초당 2.7보)
        horse.gait += dt * 0.28 * Phaser.Math.Clamp(spd / 6, 0.4, 2.5);

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
                    const inViewForJump = (horse.x >= cam.scrollX && horse.x <= cam.scrollX + HR_L.W);
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
        const inView = (horse.x >= cam.scrollX && horse.x <= cam.scrollX + HR_L.W);
        if (inView) {
            if (obs.type === 'rock')   this.sound.play(SFX_ROCK);
            if (obs.type === 'puddle') this.sound.play(SFX_PUDDLE);
            if (obs.type === 'carrot') this.sound.play(SFX_CARROT);
        }

        // 장애물 소멸 애니메이션 (setDisplaySize 로 잡은 스케일의 2.2배)
        this.tweens.add({
            targets: obs.sprite, scaleX: obs.sprite.scaleX * 2.2, scaleY: obs.sprite.scaleY * 2.2, alpha: 0, duration: 380,
            onComplete: () => obs.sprite.setVisible(false),
        });

        if (obs.type === 'carrot') {
            // 🥕 당근: 1등이면 부스터(속도) 없음 — 크기 확대만. 2등 이하는 부스터 + 크기 확대
            if (horse.rank !== 1) this._triggerBoost(horse);
            horse.scaleBonus = 1.45;
            this._spawnPopupText(horse.x, horse.y, T.carrotEat, '#FF8800');

        } else if (obs.type === 'rock') {
            // 🪨 돌멩이: 스핀 + 밀려남 + 걸림
            horse.isSpinning    = true;
            horse.spinFrames    = 55;
            horse.isStumbling   = true;
            horse.stumbleFrames = 90;
            horse.x             = Math.max(120, horse.x - 65);
            this.cameras.main.shake(260, 0.006);
            this._spawnPopupText(horse.x, horse.y, T.rockHit, '#FF4444');

        } else if (obs.type === 'puddle') {
            // 💧 웅덩이: 걸림
            this._triggerStumble(horse);
            this._spawnPopupText(horse.x, horse.y, T.puddleHit, '#4488FF');
        }
    }

    _spawnPopupText(x, y, text, color) {
        const t = this.add.text(x, y - 20, text, {
            fontFamily: HR_FONT, fontStyle: 'bold', fontSize: `${Math.round(17 * HR_L.fs)}px`,
            color, stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(15);
        this.tweens.add({
            targets: t, y: y - 72, alpha: 0, duration: 1200, ease: 'Power1',
            onComplete: () => t.destroy(),
        });
    }

    // ── Horse Render (이모지 + 들썩임 + 그림자 + 이름 배경) ────
    _drawHorseVisuals(horse) {
        const { HORSE_FONT, FONT_SZ, NAME_BESIDE } = this.layout;
        const ht = this.horseEmojis[horse.idx];
        const nl = this.nameLabels[horse.idx];
        const si = this.statusIcons[horse.idx];
        const g  = this.nameGfx;

        // 달리는 느낌: 이모지가 정지 그림이라 몸을 위아래로 들썩이고(bob), 앞뒤로 까딱이고(tilt),
        // 살짝 늘었다 줄었다(stretch) 한다. 완주하면 멈춘다. 부스터 중엔 더 크게 들썩인다.
        const running = !horse.finished;
        const amp  = running ? (horse.isBoosting ? 1.5 : 1.0) : 0;
        const bob  = Math.sin(horse.gait) * HORSE_FONT * 0.07 * amp;          // 위(-)로 뜰 때 음수
        const tilt = Math.sin(horse.gait + Math.PI / 2) * 0.06 * amp;
        const stretch = 1 + Math.sin(horse.gait) * 0.035 * amp;
        const lean = horse.isStumbling && !horse.isSpinning ? 0.2 : 0;      // 걸리면 앞으로 고꾸라짐

        ht.setPosition(horse.x, horse.y + bob);
        ht.setRotation(horse.rotation + tilt + lean);
        const sc = horse.scaleBonus * (horse.isBoosting ? 1.08 : 1.0);
        ht.setScale(sc * stretch, sc / stretch);
        ht.setAlpha(horse.finished ? 0.5 : 1.0);
        if (horse.emoji) ht.setText(horse.emoji);

        // 고유 색상 오라 (이모지 뒤쪽 은은한 원형 글로우)
        const auraR = HORSE_FONT * 0.72;
        g.fillStyle(horse.color, 0.3);
        g.fillCircle(horse.x, horse.y, auraR);

        // 바닥 그림자 (ellipse) — 몸이 떠오르면 작고 흐려진다
        const lift = Phaser.Math.Clamp(-bob / (HORSE_FONT * 0.07), -1, 1);   // 1 = 최고점
        g.fillStyle(0x000000, 0.24 - lift * 0.06);
        g.fillEllipse(horse.x + 2, horse.y + HORSE_FONT * 0.50, HORSE_FONT * (0.88 - lift * 0.12), HORSE_FONT * 0.20);

        // 이름 라벨 배경: 텍스트 실제 width + 좌우 12px 패딩 (width 미갱신 시 폴백)
        const nm = String(horse.name || '').trim() || '?';
        nl.setText(nm);
        const PADDING = 14;
        const w = nl.width || 0;
        const charW = FONT_SZ * 0.72;
        const fallbackW = nm.length * charW + PADDING;
        const lblW = Math.max(w + PADDING, fallbackW, 42);
        const lblH = FONT_SZ + 7;
        // 레인이 넓으면 말 위, 좁으면 말 뒤(왼쪽)에 세로 중앙으로
        const lx   = NAME_BESIDE ? horse.x - HORSE_FONT * 0.85 - lblW / 2 : horse.x;
        const ly   = NAME_BESIDE ? horse.y + lblH / 2 : horse.y - HORSE_FONT * 0.62;

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
        const nc = horse.isBoosting ? '#FFD700' : nameColor;
        if (nl._col !== nc) { nl._col = nc; nl.setColor(nc); }

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
        const inView = (horse.x >= cam.scrollX && horse.x <= cam.scrollX + HR_L.W);
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
        const viewW = HR_L.W;

        // 슬로우모션 UI 즉시 숨김
        if (this.slowMoOverlay) this.slowMoOverlay.setVisible(false);
        if (this.slowMoText)    this.slowMoText.setVisible(false);

        // 나머지 말들 슬로우모션
        for (const h of this.horses) { if (!h.finished) h.baseSpeed *= 0.22; }
        this._updateLeaderboard(this._getRankDisplayOrder());

        const targetX = Phaser.Math.Clamp(this.winner.x - viewW / 2, 0, TRACK_LEN - viewW + 300);
        this.tweens.add({
            targets: this.cameras.main, scrollX: targetX, duration: 1100, ease: 'Power2',
            onComplete: () => {
                this._launchConfetti();
                this.time.delayedCall(350, () => {
                    this.sound.play(SFX_FANFARE);  // 결과 카드 뜰 때 fanfare (finish와 겹치지 않게)
                    this._showResult(this.winner);
                });
            },
        });
    }

    _launchConfetti() {
        const viewW = HR_L.W, viewH = HR_L.H;

        // 꼴찌 모드는 붉은 계열 색상으로 장난스러운 연출
        const cols = this.mode === 'loser'
            ? [0xFF4444, 0xFF7777, 0xCC0000, 0xFF2222, 0xFFAAAA, 0x880000, 0xFF6666]
            : [0xFF6B6B, 0x4ECDC4, 0xFFD700, 0x45B7D1, 0xFF8C00, 0x7B68EE, 0x90EE90];
        const per = Math.round(28 * viewW / 1000) + 6;

        for (let burst = 0; burst < 7; burst++) {
            this.time.delayedCall(burst * 260, () => {
                for (let i = 0; i < per; i++) {
                    const cx  = Phaser.Math.Between(20, viewW - 20);
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

    // 결과는 HTML 카드(#hr-result). 캔버스는 어둡게만
    _showResult(subject) {
        const dim = this.add.rectangle(HR_L.W / 2, HR_L.H / 2, HR_L.W, HR_L.H, 0x000000, 0.55)
            .setScrollFactor(0).setDepth(150).setAlpha(0);
        this.tweens.add({ targets: dim, alpha: 1, duration: 300 });

        const hex = (c) => '#' + (c & 0xFFFFFF).toString(16).padStart(6, '0');
        const ranking = this._getRankDisplayOrder().map((h, i) => ({
            rank: i + 1, name: h.name, color: hex(h.color), emoji: h.emoji, finished: h.finished,
        }));
        const data = {
            type: this.mode === 'winner' ? 'winner' : 'loser',
            name: subject.name, color: hex(subject.color), emoji: subject.emoji,
            ranking,
        };
        if (window.hrUI) window.hrUI.showResult(data);
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

    // ── UI Update: 참가자 전원 순위표 ───────────────────────────
    _updateLeaderboard(sortedByX) {
        const n = sortedByX.length;

        const maxLen = HR_L.key === 'tall' ? 5 : this.numHorses <= 10 ? 8 : this.numHorses <= 20 ? 6 : 5;
        const maxW = this.lbW - 14;

        for (let i = 0; i < n && i < this.lbTexts.length; i++) {
            const h   = sortedByX[i];
            const nm  = h.name.length > maxLen ? h.name.slice(0, maxLen - 1) + '…' : h.name;
            const sfx = h.isSpinning ? ' 💫' : h.isBoosting ? ' 🔥' : h.isStumbling ? ' 💦' : '';
            // 닉네임·아이콘 모두 말 고유 색상 유지 (아이템에 따라 색 바꾸지 않음)
            const horseColorCss = '#' + ((h.color & 0xFFFFFF).toString(16).padStart(6, '0')).toUpperCase();
            const col = h.finished ? '#FFD700' : horseColorCss;
            // 글자 텍스처를 매 프레임 다시 그리지 않게 바뀔 때만
            const t = this.lbTexts[i];
            const str = `${fmt(T.rank, i + 1)}  ${nm}${sfx}`;
            if (t._last === str + col) continue;
            t._last = str + col;
            t.setText(str).setColor(col).setScale(1);
            hrFitText(t, maxW);
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
// Phaser 게임 인스턴스 (입력 없음 – 조작은 HTML 버튼)
// ============================================================
const horseRaceGame = new Phaser.Game({
    type:            Phaser.AUTO,
    width:           Math.round(HR_L.W * HR_K),
    height:          Math.round(HR_L.H * HR_K),
    parent:          'hr-canvas',
    backgroundColor: '#060614',
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
    const game = horseRaceGame;
    const stage = $('game-container');
    const setupEl = $('hr-setup');
    const resultEl = $('hr-result');
    const namesEl = $('hrNamesInput');
    const countEl = $('hrCount');
    const msgEl = $('hrMsg');
    const hintEl = $('hrModeHint');
    const startBtn = $('hrStartBtn');
    const modeBtns = Array.from(document.querySelectorAll('#hr-setup [data-mode]'));
    // 기본은 꼴찌 벌칙 뽑기. 내기 용도가 대부분이라 "누가 쏘냐"가 먼저다
    let mode = store.get('mode', 'loser') === 'winner' ? 'winner' : 'loser';
    let lastNames = [];
    let msgTimer = 0;

    const parseNames = (raw) => String(raw || '').split(/[\n\r,，、]+/).map((s) => s.trim()).filter(Boolean);

    function updateCount() {
        const n = parseNames(namesEl.value).length;
        const ok = n >= 2 && n <= 30;
        countEl.textContent = fmt(T.count, n) + ' ' + (n < 2 ? T.countMin : n > 30 ? T.countMax : T.countOk);
        countEl.classList.toggle('ok', ok);
        countEl.classList.toggle('bad', n > 30);
        startBtn.classList.toggle('ready', ok);
    }
    function setMode(m) {
        mode = m;
        modeBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
        hintEl.textContent = m === 'winner' ? T.modeHintWinner : T.modeHintLoser;
        hintEl.classList.toggle('is-winner', m === 'winner');
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
        hidePanels();
        // 시작 버튼(사용자 동작)에서 오디오 잠금 해제
        try { if (game.sound.context && game.sound.context.state !== 'running') game.sound.context.resume(); } catch (e) { /* 무시 */ }
        const sm = game.scene;
        if (sm.isActive('SetupScene')) sm.stop('SetupScene');
        if (sm.isActive('GameScene') || sm.isPaused('GameScene')) sm.getScene('GameScene').scene.restart({ names, mode: m });
        else sm.start('GameScene', { names, mode: m });
    }

    function hidePanels() {
        setupEl.hidden = true;
        resultEl.hidden = true;
    }
    function showSetup() {
        resultEl.hidden = true;
        setupEl.hidden = false;
        updateCount();
    }

    function showResult(d) {
        const card = resultEl.querySelector('.hr-result-card');
        card.className = 'hr-card hr-result-card ' + (d.type === 'winner' ? 'is-winner' : 'is-loser') + (d.ranking.length > 5 ? ' long' : '');
        resultEl.querySelector('.hr-result-kicker').textContent = d.type === 'winner' ? T.resultWin : T.resultLose;
        resultEl.querySelector('.hr-result-horse').textContent = d.emoji || '🏇';
        const nameEl = resultEl.querySelector('.hr-result-name');
        nameEl.textContent = d.name;
        nameEl.style.setProperty('--hr-c', d.color);
        resultEl.querySelector('.hr-result-reason').textContent = d.type === 'winner' ? T.reasonWin : T.reasonLose;
        const list = resultEl.querySelector('.hr-rank-list');
        list.innerHTML = '';
        const lastRank = d.ranking.length;
        d.ranking.forEach((r) => {
            const li = document.createElement('li');
            if (r.rank <= 3) li.className = 'top' + r.rank;
            if (d.type === 'loser' && r.rank === lastRank) li.className = 'pick';
            const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = fmt(T.rank, r.rank);
            const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = r.color;
            const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
            const st = document.createElement('span'); st.className = 'st'; st.textContent = (r.emoji && r.emoji !== '🏇' ? r.emoji : '') + (r.finished ? '🏁' : '');
            li.append(rk, dot, nm, st);
            list.appendChild(li);
        });
        setupEl.hidden = true;
        resultEl.hidden = false;
        // 꼴찌 뽑기면 목록 끝(당첨자)이 보이게
        list.scrollTop = d.type === 'loser' ? list.scrollHeight : 0;
        const first = resultEl.querySelector('[data-act="restart"]');
        if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
    }

    window.hrUI = { showSetup, showResult, hidePanels };

    // ── 참가자 입력 ──
    const saved = store.get('names', null);
    if (Array.isArray(saved) && saved.length) namesEl.value = saved.join('\n');
    setMode(mode);
    updateCount();
    namesEl.addEventListener('input', updateCount);
    namesEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); startBtn.click(); }
    });
    modeBtns.forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.mode); store.set('mode', mode); }));
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

    // ── 소리 (켜기/끄기는 효과음까지, 볼륨은 BGM) ──
    const bgmToggle = $('bgmToggle');
    const volumeCtrl = $('volumeControl');
    game.registry.set('bgmOn', store.get('sound', true) !== false);
    const savedVol = Number(store.get('volume', 0.3));
    game.registry.set('bgmVolume', Phaser.Math.Clamp(Number.isFinite(savedVol) ? savedVol : 0.3, 0, 1));
    if (volumeCtrl) volumeCtrl.value = String(Math.round(game.registry.get('bgmVolume') * 100));

    const applySound = () => {
        const on = game.registry.get('bgmOn') !== false;
        if (bgmToggle) {
            bgmToggle.textContent = on ? T.bgmOn : T.bgmOff;
            bgmToggle.setAttribute('aria-pressed', String(on));
        }
        if (!game.sound) return;
        game.sound.mute = !on;
        const s = game.bgmSound;
        if (s) {
            s.volume = game.registry.get('bgmVolume');
            if (on && !s.isPlaying) { try { s.play(); } catch (e) { /* 무시 */ } }
            if (!on && s.isPlaying) s.pause();
        }
    };
    applySound();
    // 자동재생 차단 대응: 첫 터치/클릭에 오디오 잠금 해제 후 BGM 재생
    const unlockAudio = () => {
        try { if (game.sound && game.sound.context && game.sound.context.state === 'suspended') game.sound.context.resume(); } catch (e) { /* 무시 */ }
        applySound();
    };
    document.addEventListener('touchend', unlockAudio, { passive: true, once: true });
    document.addEventListener('click', unlockAudio, { once: true, capture: true });

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
            game.registry.set('bgmVolume', v);
            store.set('volume', v);
            if (game.bgmSound) game.bgmSound.volume = v;
        };
        volumeCtrl.addEventListener('input', onVol);
        volumeCtrl.addEventListener('change', onVol);
    }

    // ── 전체화면 (게임 박스만). 아이폰처럼 지원 안 하면 버튼을 숨김 ──
    const fsToggle = $('fsToggle');
    const fsExit = $('hrFsExitBtn');
    const fsEnabled = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    const isFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    const refresh = () => requestAnimationFrame(() => { try { game.scale.refresh(); } catch (e) { /* 무시 */ } });
    const onFsChange = () => {
        const on = isFS();
        if (fsToggle) {
            fsToggle.textContent = on ? T.fsToggleExit : T.fsToggle;
            fsToggle.title = on ? T.fsExitTip : T.fsToggleTip;
        }
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
    // 폰 회전 등으로 배치가 바뀌면 대기 화면은 바로 다시 그림 (경주 중이면 다음 판부터)
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        refresh();
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (game.scene.isActive('SetupScene') && (hrPickLayout() !== HR_L || hrRenderScale(hrPickLayout()) !== HR_K)) {
                game.scene.getScene('SetupScene').scene.restart();
            }
        }, 250);
    });
})();
