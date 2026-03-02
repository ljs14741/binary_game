'use strict';

// ============================================================
// horserace.js – 말달리자  |  Phaser 3 웹 경마 게임
// Binary World (game.binaryworld.kr)
// ============================================================

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

// ============================================================
// PreloadScene – 효과음 로드
// ============================================================
class PreloadScene extends Phaser.Scene {
    constructor() { super({ key: 'PreloadScene' }); }
    preload() {
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
        this.add.text(cx, titleY, '🏇 말달리자', {
            fontFamily: '"Orbitron","Pretendard",Arial',
            fontSize: '44px', color: '#FFD700',
            stroke: '#2a1500', strokeThickness: 6,
            shadow: { offsetX: 1, offsetY: 1, color: '#000000', blur: 4, fill: true },
        }).setOrigin(0.5);

        this.add.text(cx, titleY + 58, '참가자 이름을  쉼표( , )  또는  줄바꿈으로 구분하여 입력하세요', {
            fontFamily: '"Pretendard",Arial', fontSize: '18px', color: '#EEEEEE', fontStyle: 'bold',
            shadow: textShadow,
        }).setOrigin(0.5);

        // 이름 입력: 타이틀/안내 아래에 배치, 높이 제한해 모드 버튼·시작 버튼과 겹치지 않게
        const domY = titleY + 118;
        const taHtml = `<textarea id="hrNamesInput"
            placeholder="예시:&#10;홍길동, 김철수, 이영희&#10;또는 한 줄에 한 명씩 입력"
            style="width:80vw;max-width:500px;min-width:180px;height:90px;max-height:20vh;
                   background:#0a0a1e;border:2px solid #2e2e5a;border-radius:12px;color:#d8d8ff;
                   font-size:15px;line-height:1.65;padding:14px 18px;
                   font-family:'Pretendard',Arial,sans-serif;resize:none;outline:none;
                   box-sizing:border-box;opacity:1;visibility:visible;display:block;"
            onfocus="this.style.borderColor='#FFD700'"
            onblur="this.style.borderColor='#2e2e5a'"></textarea>`;
        this.domInput = this.add.dom(cx, domY).createFromHTML(taHtml);
        this.domInput.setOrigin(0.5, 0.5);
        this.domInput.setDepth(5);
        this._setupDomLayoutY = domY;
        this._syncDomContainerScale();

        // "몇명 입력됨" → 내기·추첨 문구 바로 위, 글자 크기 키움
        const FOOT_H = 36;
        this.countText = this.add.text(cx, H - FOOT_H - 22, '0명 입력됨', {
            fontFamily: '"Pretendard",Arial', fontSize: '21px', color: '#8888aa',
            shadow: textShadow,
        }).setOrigin(0.5);

        const taEl = document.getElementById('hrNamesInput');
        if (taEl) {
            taEl.addEventListener('input', () => this._updateCount(taEl.value));
            const last = this.registry.get('lastNames');
            if (last && last.length) { taEl.value = last.join('\n'); this._updateCount(taEl.value); }
        }

        // 모드 선택 라벨 (닉네임 입력 아래, 버튼 위에 배치)
        const modeLabelY = titleY + 228;
        this.add.text(cx, modeLabelY, '게임 모드 선택', {
            fontFamily: '"Pretendard",Arial', fontSize: '14px', color: '#b0b0dd', fontStyle: 'bold',
            shadow: textShadow,
        }).setOrigin(0.5);

        // 모드 토글 버튼 생성 (닉네임 입력·라벨 아래에 고정 배치)
        this.gameMode = this.registry.get('gameMode') || 'winner';
        this._createModeButtons();

        // 시작 버튼 (모드 버튼 아래에 배치)
        const startBg  = this.add.graphics();
        const SBY = modeLabelY + 130;
        const SBX = cx - 132, SBW = 264, SBH = 50;
        const drawStartBtn = (c) => {
            startBg.clear();
            startBg.fillStyle(c, 1);
            startBg.fillRoundedRect(SBX, SBY, SBW, SBH, 12);
        };
        drawStartBtn(0xFFD700);
        this.add.text(cx, SBY + SBH / 2, '🏁  경주 시작!', {
            fontFamily: '"Orbitron",Arial', fontSize: '21px', color: '#1a1000', fontStyle: 'bold',
            shadow: textShadow,
        }).setOrigin(0.5);
        this.add.rectangle(cx, SBY + SBH / 2, SBW, SBH)
            .setInteractive({ useHandCursor: true })
            .on('pointerover',  () => drawStartBtn(0xFFA500))
            .on('pointerout',   () => drawStartBtn(0xFFD700))
            .on('pointerdown',  () => {
                const ta    = document.getElementById('hrNamesInput');
                const names = this._parseNames(ta ? ta.value : '');
                if (names.length < 2)  return this._showMsg('최소 2명 이상 입력해주세요!');
                if (names.length > 30) return this._showMsg('최대 30명까지 가능합니다!');
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
        this.add.text(cx, H - FOOT_H / 2, '내기 · 추첨 · 이벤트에 딱!  사다리타기 · 룰렛 · 핀볼 대신 말달리자 🐎', {
            fontFamily: '"Pretendard",Arial', fontSize: '13px', color: '#ffffff',
            shadow: textShadow,
        }).setOrigin(0.5);

        // 창 리사이즈 시 textarea DOM 위치 재계산(정중앙 유지)
        this._resizeHandler = () => this._onResize();
        this.scale.on('resize', this._resizeHandler, this);
    }

    _createModeButtons() {
        const BW = 226, BH = 52, GAP = 18;
        const cx = this.scale.width / 2;
        const x1 = cx - BW - GAP / 2;
        const x2 = cx + GAP / 2;
        const titleY = 52 + 28;
        const modeLabelY = titleY + 228;
        const BY = modeLabelY + 36;  // "게임 모드 선택" 라벨 바로 아래

        this._modePos = { x1, x2, y: BY, w: BW, h: BH };
        this.modeBtnGfx = this.add.graphics();

        const lblShadow = { offsetX: 1, offsetY: 1, color: '#000000', blur: 4, fill: true };
        this.modeLbl1 = this.add.text(x1 + BW / 2, BY + BH / 2, '🏆 1등 우승 뽑기', {
            fontFamily: '"Pretendard",Arial', fontSize: '16px', fontStyle: 'bold',
            shadow: lblShadow,
        }).setOrigin(0.5);
        this.modeLbl2 = this.add.text(x2 + BW / 2, BY + BH / 2, '💣 꼴찌 벌칙 뽑기', {
            fontFamily: '"Pretendard",Arial', fontSize: '16px', fontStyle: 'bold',
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
        const sfx = (n > 0 && n < 2) ? ' (최소 2명)' : n > 30 ? ' (최대 30명 초과!)' : n >= 2 ? ' ✓' : '';
        this.countText.setText(`${n}명 입력됨${sfx}`).setColor(col);
    }
    _showMsg(msg) {
        this.msgText.setText(msg).setColor('#FF6B6B');
        this.time.delayedCall(3000, () => this.msgText.setText(''));
    }

    // 리사이즈 시 textarea DOM 위치 유지 + 모바일에서 DOM 컨테이너 스케일 동기화
    _onResize() {
        if (this.domInput && this.scene.isActive()) {
            const cx = this.scale.width / 2;
            const titleY = 52 + 28;
            const domY = titleY + 118;
            this.domInput.setPosition(cx, domY);
            this._setupDomLayoutY = domY;
            this._syncDomContainerScale();
        }
    }

    // 모바일 등에서 캔버스가 스케일될 때 DOM 오버레이도 같은 비율로 스케일해 입력창이 화면 안에 보이게
    _syncDomContainerScale() {
        const node = this.domInput && this.domInput.node;
        if (!node || !node.parentElement) return;
        const container = node.parentElement;
        const gw = (this.scale.gameSize && this.scale.gameSize.width) || this.scale.width || HR_W;
        const gh = (this.scale.gameSize && this.scale.gameSize.height) || this.scale.height || HR_H;
        const dw = (this.scale.displaySize && this.scale.displaySize.width) || this.scale.width;
        const dh = (this.scale.displaySize && this.scale.displaySize.height) || this.scale.height;
        if (!dw || !dh) return;
        const sx = dw / gw;
        const sy = dh / gh;
        container.style.width = gw + 'px';
        container.style.height = gh + 'px';
        container.style.transformOrigin = '0 0';
        container.style.transform = 'scale(' + sx + ',' + sy + ')';
    }

    shutdown() {
        if (this._resizeHandler) {
            this.scale.off('resize', this._resizeHandler, this);
        }
    }
}

// ============================================================
// GameScene – 경마 메인 씬
// ============================================================
class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    init(data) {
        this.names       = data.names || ['참가자1', '참가자2'];
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

        for (let i = 0; i < this.numHorses; i++) {
            const laneY = TRACK_TOP + i * LANE_H + LANE_H / 2;
            const tierDef = pickTier();
            const color = tierDef.tier === TIER_EPIC ? TIER_COLOR_EPIC
                : tierDef.tier === TIER_RARE ? TIER_COLOR_RARE
                    : HORSE_COLORS[i % HORSE_COLORS.length];
            const baseSpeed = Phaser.Math.FloatBetween(2.8, 4.3) + tierDef.speedBonus;

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
        const modeLabel = this.mode === 'winner' ? '🏆 1등 우승 뽑기' : '💣 꼴찌 벌칙 뽑기';
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

        this.add.text(LBX + LBW / 2, LBY + 12, '🏆 실시간 순위', {
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
                this.add.text(LBX + 10, y0 + i * ROW_H + ROW_H / 2, `${i + 1}위  -`, {
                    fontSize: `${lbFontSz}px`, fontFamily: '"Pretendard",Arial', color: '#cccccc',
                }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(51)
            );
        }
        this.lbFontSz = lbFontSz;

        this.lbRowH = ROW_H;
        this.lbX = LBX;
        this.lbY = LBY;
        this.lbW = LBW;
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
        const dt = Math.min(delta / 16.667, 3.0);

        this._updateParallax(this.cameras.main.scrollX);

        // 순위 계산
        const sortedByX = [...this.horses].sort((a, b) => b.x - a.x);
        sortedByX.forEach((h, i) => { if (!h.finished) h.rank = i + 1; });

        const activeCount = this.horses.filter(h => !h.finished).length;

        // 마지막 스퍼트: 선두가 결승 1000px 전이면 한 번만 팝업 + 붉은 점멸 + 막판 부스터 구간 시작
        if (!this.raceFinished && !this.finalLapTriggered && sortedByX[0] && !sortedByX[0].finished && sortedByX[0].x >= FINISH_X - 1000) {
            this._triggerFinalLap(time);
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

        // UI
        this._updateLeaderboard(sortedByX);
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

        const popup = this.add.text(cx, cy, '🔥 마지막 스퍼트! 🔥', {
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
            this._spawnPopupText(horse.x, horse.y, '🥕 냠냠!', '#FF8800');

        } else if (obs.type === 'rock') {
            // 🪨 돌멩이: 스핀 + 밀려남 + 걸림
            horse.isSpinning    = true;
            horse.spinFrames    = 55;
            horse.isStumbling   = true;
            horse.stumbleFrames = 90;
            horse.x             = Math.max(120, horse.x - 65);
            this.cameras.main.shake(260, 0.006);
            this._spawnPopupText(horse.x, horse.y, '🪨 쿵!', '#FF4444');

        } else if (obs.type === 'puddle') {
            // 💧 웅덩이: 걸림
            this._triggerStumble(horse);
            this._spawnPopupText(horse.x, horse.y, '💧 첨벙!', '#4488FF');
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
        const lbl = isWinner ? '🎉  우승!  🎉' : '💣  당첨(벌칙)!  💣';
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
        this._makeBtn(cx - 148, btnY, '🔄 같은 참가자로 재시작', 0x4ECDC4, 0x30a898, () => {
            this.scene.restart({ names: this.names, mode: this.mode });
        });
        this._makeBtn(cx + 118, btnY, '✏️ 새로 설정', 0xFFD700, 0xFFA500, () => {
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
            this.lbTexts[i].setText(`${i + 1}위  ${nm}${sfx}`).setColor(col);
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
    dom:             { createContainer: true },
    scale: {
        mode:       Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [PreloadScene, SetupScene, GameScene],
};

const horseRaceGame = new Phaser.Game(horseRaceConfig);

// ============================================================
// 외부 UI (BGM 토글, 전체화면)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const bgmAudio = new Audio('/assets/horseRace/audio/bgm.mp3');
    bgmAudio.loop = true;
    bgmAudio.volume = 0.5;

    let bgmOn = true;  // 기본값: 켜진 상태로 시작

    const bgmToggle  = document.getElementById('bgmToggle');
    const volumeCtrl = document.getElementById('volumeControl');
    const fsToggle   = document.getElementById('fsToggle');

    // 페이지 로드 시 BGM 무조건 재생 시도 (브라우저 정책으로 막히면 첫 사용자 동작 시 재시도)
    const tryPlayBgm = () => {
        if (!bgmOn) return;
        bgmAudio.play().catch(() => {});
    };
    tryPlayBgm();

    // 자동재생이 막힌 경우: 첫 클릭/터치 시 한 번만 재생 재시도
    const once = (el, ev, fn) => {
        const handler = () => { fn(); el.removeEventListener(ev, handler); };
        el.addEventListener(ev, handler);
    };
    once(document, 'click', tryPlayBgm);
    once(document, 'touchstart', tryPlayBgm);

    if (bgmToggle) {
        bgmToggle.addEventListener('click', () => {
            bgmOn = !bgmOn;
            bgmToggle.textContent = bgmOn ? '🔊 BGM 켜짐' : '🔇 BGM 꺼짐';
            if (bgmOn) bgmAudio.play().catch(() => {});
            else bgmAudio.pause();
        });
    }
    if (volumeCtrl) {
        const applyVolume = () => { bgmAudio.volume = volumeCtrl.value / 100; };
        applyVolume();
        volumeCtrl.addEventListener('input', applyVolume);
        volumeCtrl.addEventListener('change', applyVolume);
        volumeCtrl.addEventListener('touchend', applyVolume);
    }
    // 전체화면: Phaser 네이티브 API 사용, iOS 등 미지원 시 CSS 폴백
    const gameContainer = document.getElementById('game-container');
    const fullscreenWrap = document.getElementById('horserace-fullscreen-wrap');

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
            fsToggle.textContent = fs ? '⛶ 전체화면 종료' : '⛶ 전체화면';
            fsToggle.setAttribute('title', fs ? '전체화면 나가기' : '전체화면 전환');
        }
        if (fullscreenWrap) {
            if (fs) fullscreenWrap.classList.add('hr-fullscreen-active');
            else fullscreenWrap.classList.remove('hr-fullscreen-active');
        }
    };

    if (fullscreenWrap && horseRaceGame.scale) {
        horseRaceGame.scale.fullscreenTarget = fullscreenWrap;
    }
    const refreshScaleOnFullscreen = () => {
        if (!gameContainer || !horseRaceGame.scale) return;
        // flex 레이아웃으로 높이 결정되므로 고정 크기 제거 → BGM 바·버튼이 가리지 않음
        gameContainer.style.width = '';
        gameContainer.style.height = '';
        const doRefresh = () => horseRaceGame.scale && horseRaceGame.scale.refresh();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { doRefresh(); });
            setTimeout(doRefresh, 80);
            setTimeout(doRefresh, 250);
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
    horseRaceGame.scale.on('leavefullscreen', () => {
        if (gameContainer) {
            gameContainer.classList.remove('fullscreen-fallback');
            gameContainer.style.width = '';
            gameContainer.style.height = '';
        }
        updateFullscreenButton();
    });
    const onFullscreenChange = () => {
        updateFullscreenButton();
        if (!isFullscreen() && gameContainer) {
            gameContainer.style.width = '';
            gameContainer.style.height = '';
        } else if (isFullscreen()) {
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

    // 창 크기/회전 시 캔버스 재계산 (모바일 회전 시 확대 버그 방지)
    const refreshScale = () => {
        if (horseRaceGame.scale) horseRaceGame.scale.refresh();
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

    // 모바일 세로 모드 시 가로 모드 권장 알림 (화면 막지 않음, 확인 시 닫고 이번 세션 동안 미표시)
    const PORTRAIT_NOTICE_KEY = 'hr-portrait-notice-dismissed';
    const portraitNotice = document.getElementById('hr-portrait-notice');
    const portraitNoticeClose = document.getElementById('hr-portrait-notice-close');
    const isMobileDevice = () => {
        if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    };
    const updatePortraitNotice = () => {
        if (!portraitNotice) return;
        const isPortrait = typeof window.matchMedia !== 'undefined' && window.matchMedia('(orientation: portrait)').matches;
        const dismissed = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PORTRAIT_NOTICE_KEY);
        if (isMobileDevice() && isPortrait && !dismissed) {
            portraitNotice.classList.add('visible');
            portraitNotice.setAttribute('aria-hidden', 'false');
        } else {
            portraitNotice.classList.remove('visible');
            portraitNotice.setAttribute('aria-hidden', 'true');
        }
    };
    if (portraitNoticeClose) {
        portraitNoticeClose.addEventListener('click', () => {
            try { sessionStorage.setItem(PORTRAIT_NOTICE_KEY, '1'); } catch (e) {}
            if (portraitNotice) {
                portraitNotice.classList.remove('visible');
                portraitNotice.setAttribute('aria-hidden', 'true');
            }
        });
    }
    updatePortraitNotice();
    window.addEventListener('resize', updatePortraitNotice);
    window.addEventListener('orientationchange', () => { setTimeout(updatePortraitNotice, 100); });
});
