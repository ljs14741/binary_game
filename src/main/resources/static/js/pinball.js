const config = {
    type: Phaser.AUTO,
    width: 1000,
    height: 720,
    parent: 'game-container',
    physics: {
        default: 'matter',
        matter: {
            gravity: { y: 1 },
            debug: false
        }
    },
    dom: { createContainer: true },
    plugins: {
        global: [
            { key: 'rexInputTextPlugin', plugin: window.rexinputtextplugin, start: true }
        ]
    },
    scene: { preload, create, update }
};

let game;
let uiElements = {};
let playerCount = 5;
let playerNicknames = [];
let players = [];
let lastWinner = null;
let finishZone;
let minimap;
let backgroundMusic;
let nickMaxLength = 10;
const BALL_RADIUS = 15;
const BALL_DIAM = BALL_RADIUS * 2;
const BALL_OUTER_W = 1;      // 바깥 테두리 두께
const BALL_OUTER_A = 0.95;   // 바깥 테두리 알파
const BALL_OUTLINE_COLOR = 0xffffff; // ← 항상 흰색
const BALL_INNER_W = 1;      // 안쪽 림 두께(0이면 끔)
const BALL_INNER_A = 0.75;   // 안쪽 림 알파
const BASE_W = 1000, BASE_H = 720;
const MatterJS = Phaser.Physics.Matter.Matter;
const bodyToPlayer = new Map();
let _kbLocked = false;

window.onload = () => {
    game = new Phaser.Game(config);
};

function preload() {
    this.load.image('cannon', 'assets/luckyRacing/cannon.png');
    this.load.image('goal', 'assets/luckyRacing/goal.png');
    this.load.audio('backgroundMusic', 'assets/luckyRacing/audio/luckyRacingBGM.mp3');
}

function create() {
    if (!backgroundMusic) {
        backgroundMusic = this.sound.add('backgroundMusic', { loop: true });
        backgroundMusic.play();
    }

    document.getElementById('bgmToggle')?.addEventListener('click', () => {
        if (backgroundMusic.isPlaying) {
            backgroundMusic.pause();
        } else {
            this.sound.context.resume();
            backgroundMusic.play({ loop: true });
        }
    });

    document.getElementById('volumeControl')?.addEventListener('input', function () {
        const volume = this.value / 100;
        backgroundMusic.setVolume(volume);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            backgroundMusic?.pause();
        } else {
            backgroundMusic?.resume();
        }
    });

    this.cameras.main.setBackgroundColor('#222');
    // this.cameras.main.setBounds(0, 0, 800, 4000);
    // this.matter.world.setBounds(0, 0, 800, 4000);
    this.cameras.main.setBounds(0, 0, config.width, 4000);
    this.matter.world.setBounds(0, 0, config.width, 4000);

    applyTheme(this);

    registerCollisionHandlers(this);

    this.uiLayer = this.add.layer();
    this.uiLayer.setDepth(1000);

    this.matter.world.engine.enableSleeping = false;

    createGameSetupUI(this);
    this.cannon = this.add.image(config.width / 2, 4000, 'cannon').setOrigin(0.5, 1);
}

// ─────────────────────────────────────────────────────────────
// 테마 적용: 배경 컬러 + 은은한 스타필드
function applyTheme(scene) {
    // 배경색 교체(깊은 네이비)
    scene.cameras.main.setBackgroundColor('#0b1220');

    // 작은 점 텍스처 보장
    if (!scene.textures.exists('starDot')) {
        const g = scene.add.graphics();
        g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
        g.generateTexture('starDot', 2, 2);
        g.destroy();
    }

    // 스타필드 파티클 (스크린 고정, 은은하게)
    scene._starfield?.destroy();
    const stars = scene.add.particles(0, 0, 'starDot', {
        x: { min: 0, max: scene.scale.width },
        y: { min: 0, max: scene.scale.height },
        lifespan: 8000,
        speedX: { min: -6, max: 6 },
        speedY: { min: 10, max: 24 },
        quantity: 1,
        frequency: 80,
        scale: { start: 1, end: 0.4 },
        alpha: { start: 0.35, end: 0 }
    });
    stars.setScrollFactor(0).setDepth(-10);
    scene._starfield = stars;
}

// UI 버튼 생성, 닉네임 입력, 참가자 수 조절 기능
function createGameSetupUI(scene) {
    const centerX = config.width / 2;

    // 파란 패널(그래픽 객체는 매번 다시 그릴 것이므로 핸들만 유지)
    uiElements.uiContainer?.destroy();
    uiElements.uiContainer = scene.add.graphics().setScrollFactor(0).setDepth(10);
    scene.uiLayer?.add(uiElements.uiContainer);

    // 타이틀
    uiElements.titleText?.destroy();
    uiElements.titleText = scene.add.text(centerX, 85, "🎮 게임 참가 설정", {
        fontSize: '30px', fontFamily: 'Orbitron', fontWeight: 'bold', color: '#ffcc00'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
    scene.uiLayer?.add(uiElements.titleText);

    // 참가자 수
    uiElements.participantLabel?.destroy();
    uiElements.participantLabel = scene.add.text(centerX - 120, 160, "참가자 수", {
        fontSize: '22px', fontFamily: 'Arial', color: '#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
    scene.uiLayer?.add(uiElements.participantLabel);

    uiElements.participantCountText?.destroy();
    uiElements.participantCountText = scene.add.text(centerX, 160, playerCount, {
        fontSize: '24px', fontFamily: 'Arial', color: '#00ffea',
        backgroundColor: '#222', padding: { left: 14, right: 14, top: 8, bottom: 8 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
    scene.uiLayer?.add(uiElements.participantCountText);

    // + / -
    uiElements.increaseButton?.destroy();
    uiElements.decreaseButton?.destroy();
    uiElements.increaseButton = createStyledButton(scene, centerX + 100, 160, "＋",
        () => changePlayerCount.call(scene, 1), 50, "#28a745").setDepth(30);
    uiElements.decreaseButton = createStyledButton(scene, centerX + 160, 160, "－",
        () => changePlayerCount.call(scene, -1), 50, "#dc3545").setDepth(30);

    // 닉네임 입력 열기 버튼
    uiElements.nicknameButton?.destroy();
    uiElements.nicknameButton = createStyledButton(scene, centerX, 220, "✍ 닉네임 입력하기",
        () => generateNicknameInputs(scene), 260, "#1e7cff").setDepth(25);

    // 시작 버튼 (하단에 재배치 예정)
    uiElements.startGameButton?.destroy();
    uiElements.startGameButton = createStyledButton(scene, centerX, 0, "🚀 게임 시작",
        () => startGame(scene), 300, "#ff3b3b").setDepth(25);
    uiElements.startGameButton.setVisible(false);

    // 노란 프레임(입력칸 영역). 처음에는 숨김
    uiElements.nameFrame?.destroy();
    uiElements.nameFrame = scene.add.graphics().setScrollFactor(0).setDepth(15).setVisible(false);
    scene.uiLayer?.add(uiElements.nameFrame);

    uiElements.nameTitle?.destroy();
    uiElements.nameTitle = scene.add.text(centerX, 0, '닉네임 입력 (최대 ' + nickMaxLength + '자)', {
        fontSize: '20px', color: '#ffcc00', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(25).setVisible(false);
    scene.uiLayer?.add(uiElements.nameTitle);

    // 최초 패널 그리기
    resizeSetupPanel(scene, { rows: 0, frameH: 0 }); // 기본 높이로
}

// rows에 맞춰 파란 패널 크기와 요소 배치 업데이트
function resizeSetupPanel(scene, { rows, frameH }) {
    const centerX = config.width / 2;
    const baseW = 800;
    const baseX = centerX - baseW / 2;
    const topY  = 50;

    // 기본 높이
    let panelH = 600;

    // 입력 프레임이 있을 때는 필요한 높이 계산
    if (rows > 0) {
        const topSpace = 260 - topY; // 타이틀/참가자수/버튼 영역
        const bottomSpace = 100;     // 시작 버튼 + 여백
        panelH = Math.max(600, topSpace + frameH + bottomSpace);
    }

    // 파란 패널 다시 그리기
    uiElements.uiContainer.clear();
    uiElements.uiContainer
        .fillStyle(0x1e1e1e, 0.95)
        .fillRoundedRect(baseX, topY, baseW, panelH, 20)
        .lineStyle(3, 0x00c3ff)
        .strokeRoundedRect(baseX, topY, baseW, panelH, 20);

    // 시작 버튼은 항상 하단 60px 위
    uiElements.startGameButton.setY(topY + panelH - 60);
}

// 버튼 생성 (개선된 스타일)
function createStyledButton(scene, x, y, label, callback, width = 100, color = "#0077ff") {
    const btn = scene.add.text(x, y, label, {
        fontSize: '20px', fontFamily: 'Arial',
        backgroundColor: color, color: '#fff', align: 'center',
        fixedWidth: width, fixedHeight: 45, padding: { top: 10 }
    })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', callback)
        .on('pointerover', () => btn.setStyle({ backgroundColor: '#fff', color }))
        .on('pointerout',  () => btn.setStyle({ backgroundColor: color, color: '#fff' }));

    scene.uiLayer?.add(btn); // ✅ 레이어에 넣기
    return btn;
}

function generateNicknameInputsNative(scene) {
    uiElements.nicknameButton?.setVisible(false);

    // 이전 것 정리
    const old = document.getElementById('name-overlay');
    if (old) old.remove();
    uiElements.nameInputs = [];

    const s = getMobileScale();            // PC=1, 모바일<1
    const centerX = BASE_W / 2;
    const frameW = 740;
    const frameX = centerX - frameW / 2;
    const frameY = 270;
    const padding = 18;

    const cellW = 120, cellH = 36, gap = 12;
    const cols = Math.max(2, Math.min(6, Math.floor((frameW - padding*2 + gap) / (cellW + gap))));
    const rows = Math.ceil(playerCount / cols);
    const frameH = padding*2 + rows*cellH + (rows - 1)*gap;

    // 노란 프레임은 그대로 캔버스에 그림
    uiElements.nameFrame.setVisible(true).clear()
        .lineStyle(2, 0xffcc00, 1)
        .fillStyle(0x000000, 0.20)
        .fillRoundedRect(frameX, frameY, frameW, frameH, 14)
        .strokeRoundedRect(frameX, frameY, frameW, frameH, 14);

    uiElements.nameTitle.setVisible(true).setPosition(centerX, frameY - 10);

    const gridW = cols * cellW + (cols - 1)*gap;
    const startX = frameX + (frameW - gridW)/2 + cellW/2;
    const startY = frameY + padding + cellH/2;

    // 시드값 유지
    const seed = Array.isArray(playerNicknames) ? playerNicknames.slice() : [];

    // 오버레이 생성
    const gc = document.getElementById('game-container');
    const overlay = document.createElement('div');
    overlay.id = 'name-overlay';
    gc.appendChild(overlay);

    // 좌표/사이즈를 컨테이너 실제 픽셀로 변환
    const px = v => Math.round(v * (s < 1 ? s : 1));

    for (let i = 0; i < playerCount; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const baseX = startX + c*(cellW + gap);
        const baseY = startY + r*(cellH + gap);

        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.left = px(baseX) + 'px';
        cell.style.top  = px(baseY) + 'px';

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = nickMaxLength;
        input.placeholder = `P${i+1}`;
        input.value = seed[i] || '';
        input.style.width  = px(cellW) + 'px';
        input.style.height = px(cellH) + 'px';
        input.style.fontSize = Math.max(16, px(16)) + 'px';
        input.addEventListener('touchstart', e => e.stopPropagation(), { passive:true });
        input.addEventListener('pointerdown', e => e.stopPropagation());
        input.addEventListener('mousedown', e => e.stopPropagation());

        cell.appendChild(input);
        overlay.appendChild(cell);
        uiElements.nameInputs.push(input);
    }

    uiElements.startGameButton.setVisible(true);
    resizeSetupPanel(scene, { rows, frameH });
}

function generateNicknameInputs(scene) {
    if (useNativeInputs()) return generateNicknameInputsNative(scene);

    // 열기 버튼 숨김 + 기존 입력 지우기
    uiElements.nicknameButton?.setVisible(false);
    uiElements.nameInputs?.forEach(i => i.destroy());
    uiElements.nameInputs = [];

    const s = getMobileScale();          // PC=1, 모바일<1
    const centerX = BASE_W / 2;
    const frameW = 740;
    const frameX = centerX - frameW / 2;
    const frameY = 270;
    const padding = 18;

    // 인풋 셀 기본(논리 좌표)
    const cellW = 120, cellH = 36, gap = 12;

    // 칼럼/행 계산(논리 좌표 기준)
    const cols = Math.max(2, Math.min(6, Math.floor((frameW - padding*2 + gap) / (cellW + gap))));
    const rows = Math.ceil(playerCount / cols);
    const frameH = padding*2 + rows*cellH + (rows - 1)*gap;

    // 프레임(캔버스)은 논리좌표 그대로 — CSS가 캔버스 전체를 축소하므로 OK
    uiElements.nameFrame.setVisible(true).clear()
        .lineStyle(2, 0xffcc00, 1)
        .fillStyle(0x000000, 0.20)
        .fillRoundedRect(frameX, frameY, frameW, frameH, 14)
        .strokeRoundedRect(frameX, frameY, frameW, frameH, 14);

    uiElements.nameTitle
        .setVisible(true)
        .setPosition(centerX, frameY - 10);

    // 그리드 시작점(논리 좌표)
    const gridW = cols * cellW + (cols - 1) * gap;
    const startX = frameX + (frameW - gridW) / 2 + cellW / 2;
    const startY = frameY + padding + cellH / 2;

    // 기존값 유지
    const keep = Array.isArray(uiElements.nameInputs) ? uiElements.nameInputs.map(i => (i?.text || '').trim()) : [];
    const seed = keep.some(Boolean) ? keep : (Array.isArray(playerNicknames) ? playerNicknames.slice() : []);

    // 도우미: 모바일이면 좌표/사이즈에 s 곱(PC는 그대로)
    const pos  = v => (s < 1 ? Math.round(v * s) : Math.round(v));
    const scale = v => (s < 1 ? Math.round(v * s) : Math.round(v));
    const size = (v, min=1) => (s < 1 ? Math.max(min, Math.round(v * s)) : v);

    for (let i = 0; i < playerCount; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const baseX = startX + c * (cellW + gap);
        const baseY = startY + r * (cellH + gap);

        const x = scale(startX + c * (cellW + gap));
        const y = scale(startY + r * (cellH + gap));
        const w = size(cellW, 40);
        const h = size(cellH, 24);
        const fontPx = size(16, 12);
        const padPx  = size(4, 2);
        const borderPx = Math.max(1, Math.round(size(1)));

        const input = scene.add.rexInputText(x, y, w, h, {
            type: 'text',
            text: (seed[i] || ''),
            fontSize: `${size(16, 12)}px`,
            color: '#ffffff',
            backgroundColor: '#333333',
            border: '1px solid #ffcc00',
            align: 'center',
            padding: size(4, 2),
            placeholder: `P${i+1}`,
            selectAll: true,
            maxLength: nickMaxLength
        })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(22)

        if (i === 0) normalizeDomContainerFrom(input);

        wireKeyboardGuard(input.node);

        scene.uiLayer?.add(input);     // 레이어에 붙여서 start 시 함께 정리됨
        uiElements.nameInputs.push(input);
    }

    // 시작 버튼 노출 + 패널 높이 조정
    uiElements.startGameButton.setVisible(true);
    resizeSetupPanel(scene, { rows, frameH });
}

function useNativeInputs() {
    return window.matchMedia('(max-width: 1000px)').matches; // 모바일 구간
}

function getDomContainer() {
    return document.querySelector('#game-container > .dom-container, #game-container > div.dom-container');
}
function lockDomContainer() {
    const gc = document.getElementById('game-container');
    const domC = getDomContainer();
    if (!gc || !domC) return;
    const r = gc.getBoundingClientRect();

    Object.assign(domC.style, {
        position: 'fixed',
        left: r.left + 'px',
        top:  r.top  + 'px',
        width:  r.width + 'px',
        height: r.height + 'px',
        transform: 'none',
        WebkitTransform: 'none',
        zIndex:  9999,
        pointerEvents: 'auto'
    });

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    _kbLocked = true;
    // 키보드 열릴 때 뷰포트가 또 바뀌면 계속 맞춰줌
    if (window.visualViewport) {
        const _fix = () => {
            if (!_kbLocked) return;
            const rr = gc.getBoundingClientRect();
            Object.assign(domC.style, {
                left: rr.left + 'px', top: rr.top + 'px',
                width: rr.width + 'px', height: rr.height + 'px'
            });
        };
        window.visualViewport.addEventListener('resize', _fix, { passive: true });
        window.visualViewport.addEventListener('scroll', _fix,  { passive: true });
        domC._vvFix = _fix; // 해제 시 제거용
    }
}
function unlockDomContainer() {
    const domC = getDomContainer();
    if (!domC) return;
    Object.assign(domC.style, {
        position: 'absolute',
        left: '0px', top: '0px', width: '100%', height: '100%',
        zIndex: '2'
    });
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    _kbLocked = false;
    // 리스너 제거
    if (window.visualViewport && domC._vvFix) {
        window.visualViewport.removeEventListener('resize', domC._vvFix);
        window.visualViewport.removeEventListener('scroll', domC._vvFix);
        delete domC._vvFix;
    }
}

// 입력 엘리먼트에 포커스/블러 가드 장착
function wireKeyboardGuard(el) {
    if (!el) return;
    el.addEventListener('focus', () => {
        lockDomContainer();
    }, { passive: true });

    el.addEventListener('blur', () => {
        unlockDomContainer();
    });

    // 터치가 게임으로 전파되지 않도록
    ['touchstart','touchmove','touchend','pointerdown','pointermove','pointerup','mousedown','mousemove','mouseup','click']
        .forEach(evt => el.addEventListener(evt, e => { e.stopPropagation(); }, { passive: false }));
}

// 모바일일 때만(컨테이너 폭이 1000 미만) 스케일값 반환. PC면 1.
function getMobileScale() {
    if (!window.matchMedia('(max-width: 1000px)').matches) return 1; // PC면 1
    const p = document.getElementById('game-container');
    return p ? Math.min(1, p.clientWidth / BASE_W) : 1;
}

function normalizeDomContainerFrom(inputGO) {
    // rexInputText의 실제 HTML <input>
    const el = inputGO?.node;
    const gc = document.getElementById('game-container');
    if (!el || !gc) return;

    // 이 <input>의 부모가 바로 "Phaser DOM 컨테이너"
    const domC = el.parentElement;
    if (!domC) return;

    // 🔧 컨테이너가 #game-container 밖에 있으면 안으로 이동
    if (domC.parentElement !== gc) {
        gc.appendChild(domC);
    }

    // 🔧 좌표계/크기 고정 (부모를 꽉 채우고 (0,0) 기준으로)
    Object.assign(domC.style, {
        position: 'absolute',
        left: '0px',
        top: '0px',
        right: '0px',
        bottom: '0px',
        width: '100%',
        height: '100%',
        transform: 'none',
        WebkitTransform: 'none',
        pointerEvents: 'auto'
    });
}

function changePlayerCount(delta) {
    playerCount = Phaser.Math.Clamp(playerCount + delta, 1, 30);
    uiElements.participantCountText.setText(playerCount);

    if (uiElements.nameFrame && uiElements.nameFrame.visible) {
        generateNicknameInputs(this); // 입력칸/프레임/패널 자동 재배치
    } else {
        // 입력칸 닫힌 상태면 기본 패널 높이 유지
        resizeSetupPanel(this, { rows: 0, frameH: 0 });
    }
}

function lighter(hex, factor = 1.15) {
    const r = Math.min(255, ((hex >> 16) & 0xff) * factor);
    const g = Math.min(255, ((hex >> 8) & 0xff) * factor);
    const b = Math.min(255, (hex & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
}
function darker(hex, factor = 0.6) {
    const r = ((hex >> 16) & 0xff) * factor;
    const g = ((hex >> 8) & 0xff) * factor;
    const b = (hex & 0xff) * factor;
    return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
}

function makeBallTexture(scene, key, fillColor) {
    if (scene.textures.exists(key)) return;

    const cx = BALL_RADIUS, cy = BALL_RADIUS;
    const g = scene.add.graphics();

    // 1) 베이스
    g.fillStyle(fillColor, 1).fillCircle(cx, cy, BALL_RADIUS);

    // 2) 안쪽 림(옵션)
    if (BALL_INNER_W > 0) {
        g.lineStyle(BALL_INNER_W, darker(fillColor, 0.6), BALL_INNER_A);
        g.strokeCircle(cx, cy, BALL_RADIUS - 2);
    }

    // 3) 바깥 테두리 — 항상 흰색
    g.lineStyle(BALL_OUTER_W, BALL_OUTLINE_COLOR, BALL_OUTER_A);
    g.strokeCircle(cx, cy, BALL_RADIUS - 0.5);

    // 4) 상단 글로스(얇게)
    g.fillStyle(0xffffff, 0.20);
    g.beginPath();
    g.arc(cx - 3, cy - 4, BALL_RADIUS - 7, Phaser.Math.DegToRad(220), Phaser.Math.DegToRad(320), false);
    g.fillPath();

    // 5) 하단 미세 그림자
    g.fillStyle(0x000000, 0.12);
    g.beginPath();
    g.arc(cx + 3, cy + 2, BALL_RADIUS - 5, Phaser.Math.DegToRad(30), Phaser.Math.DegToRad(150), false);
    g.fillPath();

    g.generateTexture(key, BALL_DIAM, BALL_DIAM);
    g.destroy();
}

// 최대 30색 기반으로 매 게임 시작마다 랜덤 추출
function buildBallPalette(scene, count) {
    const baseCount = 30;
    const wheel = Phaser.Display.Color.HSVColorWheel();
    const step = Math.floor(wheel.length / baseCount);

    // 30개 고르게 뽑아 풀 생성
    const pool = [];
    for (let i = 0; i < baseCount; i++) {
        pool.push(wheel[(i * step) % wheel.length].color);
    }

    // 매번 랜덤 순서로 섞고, 필요한 수만큼 사용
    Phaser.Utils.Array.Shuffle(pool);
    return pool.slice(0, count);
}

function hexToCss(hex) {
    return '#' + (hex >>> 0).toString(16).padStart(6, '0');
}

function startGame(scene) {
    const overlay = document.getElementById('name-overlay');
    if (overlay) {
        // 모바일: HTML 인풋에서 수집
        const fields = Array.from(overlay.querySelectorAll('input'));
        playerNicknames = fields.map(inp => (inp.value || '').trim() || ('Player-' + Math.random().toString(36).slice(2,6)));
    } else if (Array.isArray(uiElements.nameInputs) && uiElements.nameInputs.length) {
        // PC: rexInputText에서 수집
        playerNicknames = uiElements.nameInputs.map(inp => {
            const v = (inp.text || inp.node?.value || '').trim();
            return v || ('Player-' + Math.random().toString(36).slice(2,6));
        });
    }

    // 2) 방어로직: 길이 맞추기
    if (!Array.isArray(playerNicknames) || playerNicknames.length !== playerCount) {
        playerNicknames = Array.from({ length: playerCount }, (_, i) =>
            'Player-' + Math.random().toString(36).slice(2, 6)
        );
    }

    console.log("🎮 참가자 리스트:", playerNicknames);

    // 3) 설정 UI 정리
    overlay?.remove();
    scene.uiLayer?.destroy();
    uiElements = {};

    scene.cameras.main.setBackgroundColor('#000');
    players = [];
    lastWinner = null;
    scene.winner = null;

    const startX = config.width / 2;
    const startY = 3800;
    const launchSpeed = 110;
    const ballColors = buildBallPalette(scene, playerCount);

    for (let i = 0; i < playerCount; i++) {
        const key = `ball_${i}`;
        makeBallTexture(scene, key, ballColors[i]);

        const ballImg = scene.add.image(startX, startY, key).setDisplaySize(BALL_DIAM, BALL_DIAM);
        const player = scene.matter.add.gameObject(ballImg);
        player.setCircle(BALL_RADIUS);
        player.setBounce(0.8);
        + player.setFriction(0).setFrictionStatic(0).setFrictionAir(0.02); // ← 추가
        + player.setFixedRotation();
        player.setIgnoreGravity(true);

        const label = scene.add.text(startX, startY - 25, playerNicknames[i], {
            fontSize: '14px', fill: '#ffffff', backgroundColor: 'rgba(0,0,0,0.5)',
            padding: { left: 5, right: 5, top: 2, bottom: 2 }
        }).setOrigin(0.5);

        players.push({
            body: player,
            label,
            name: playerNicknames[i],
            color: ballColors[i],
            finished: false,
            finishedAt: null,
            rank: null
        });

        // 2초 후 개별 발사 (루프 안: OK)
        scene.time.delayedCall(2000, () => {
            player.setIgnoreGravity(false);
            player.setVelocity(0, -launchSpeed);
        });
    }

    // ✅ 장애물/골인지역/승리판정은 "한 번만" 생성 (루프 밖)
    //    2초 발사 + 1.1초 대기 = 3100ms 후에 한 번만 생성
    scene.time.delayedCall(3100, () => {
        if (scene.cannon?.destroy) scene.cannon.destroy();
        createGoalZone(scene);
        createObstacles(scene);
        checkWin(scene);
    });

    createMinimap(scene);
    createLeaderboard(scene);
}

function createMinimap(scene) {
    // console.log("🗺️ 미니맵 생성");

    // 기존 미니맵이 있으면 제거
    if (scene.minimapCamera) scene.minimapCamera.destroy();
    if (scene.minimapBorder) scene.minimapBorder.destroy();

    // 📌 미니맵 카메라 위치 및 사이즈
    const minimapX = 3;
    const minimapY = 3;
    const minimapWidth = 194;
    const minimapHeight = 594;
    const minimapZoom = minimapWidth / config.width;

    // 📸 미니맵 카메라 생성
    scene.minimapCamera = scene.cameras.add(minimapX, minimapY, minimapWidth, minimapHeight)
        .setZoom(minimapZoom)
        .setBackgroundColor(0x000000)
        .setBounds(0, 0, config.width, 4000);

    // 경계선
    scene.minimapBorder = scene.add.graphics();
    scene.minimapBorder.lineStyle(3, 0xffffff, 1);
    scene.minimapBorder.strokeRect(minimapX + 0.5, minimapY + 0.5, minimapWidth - 1, minimapHeight - 1);
    scene.minimapBorder.setScrollFactor(0);
    scene.minimapBorder.setDepth(9999);

    // ✅ UI 레이어와 테두리를 미니맵에서 제외
    const ignoreList = [];
    if (scene.uiLayer) ignoreList.push(scene.uiLayer);
    if (scene.lbLayer) ignoreList.push(scene.lbLayer);
    if (scene.minimapBorder) ignoreList.push(scene.minimapBorder);
    scene.minimapCamera.ignore(ignoreList);
}

// 확장된 장애물 구성 (진자, 왕복, 난기류 다양하게 배치)
function createObstacles(scene) {
    scene.obstacles = [];

    // 존 레지스트리
    scene.swirlMap    = new Map();  // body -> {strength, tangential, outward}
    scene.conveyorMap = new Map();  // body -> {dir, force}
    scene.stickySet   = new Set();  // Set of bodies
    scene.updraftMap  = new Map();  // body -> {strength}
    scene.pegBodies   = new Set();  // 플링코 핀

    const MatterJS = Phaser.Physics.Matter.Matter;

    // ── 공용 텍스처
    const ensureTextures = () => {
        // 소용돌이 링
        if (!scene.textures.exists('ring')) {
            const g = scene.add.graphics();
            g.lineStyle(6, 0x5eead4, 0.85); g.strokeCircle(64, 64, 56);
            g.lineStyle(3, 0x22d3ee, 0.85); g.strokeCircle(64, 64, 44);
            g.generateTexture('ring', 128, 128); g.destroy();
        }
        // 궤도 점
        if (!scene.textures.exists('orbitDot')) {
            const g = scene.add.graphics();
            g.fillStyle(0x7dd3fc, 1).fillCircle(4,4,4);
            g.generateTexture('orbitDot', 8, 8); g.destroy();
        }
        // 컨베이어 타일
        if (!scene.textures.exists('arrowTile')) {
            const g = scene.add.graphics();
            g.fillStyle(0x0b1220, 0).fillRect(0,0,64,32);
            g.lineStyle(4, 0x7dd3fc, 0.9);
            const A=(x,y)=>{ g.beginPath(); g.moveTo(x-10,y); g.lineTo(x+10,y); g.lineTo(x+4,y-6);
                g.moveTo(x+10,y); g.lineTo(x+4,y+6); g.strokePath(); };
            A(12,16); A(32,16); A(52,16);
            g.generateTexture('arrowTile',64,32); g.destroy();
        }
        // 업드래프트 ↑ 타일
        if (!scene.textures.exists('upTile')) {
            const g = scene.add.graphics();
            g.fillStyle(0x0b1220, 0).fillRect(0,0,48,48);
            g.lineStyle(4, 0x93c5fd, 0.95);
            const U=(x,y)=>{ g.beginPath(); g.moveTo(x,y+10); g.lineTo(x,y-10);
                g.moveTo(x,y-10); g.lineTo(x-6,y-4);
                g.moveTo(x,y-10); g.lineTo(x+6,y-4); g.strokePath(); };
            U(12,32); U(24,24); U(36,16);
            g.generateTexture('upTile',48,48); g.destroy();
        }
        // 끈적존
        if (!scene.textures.exists('goo')) {
            const g = scene.add.graphics();
            g.fillStyle(0x9d7dff, 0.22).fillEllipse(100, 32, 200, 64);
            g.lineStyle(3, 0xc4b5fd, 0.7).strokeEllipse(100, 32, 200, 64);
            g.generateTexture('goo', 200, 64); g.destroy();
        }
        // 플링코 핀
        if (!scene.textures.exists('pegDot')) {
            const g = scene.add.graphics();
            g.fillStyle(0x79c0ff, 1).fillCircle(6, 6, 6);
            g.lineStyle(2, 0xffffff, 0.9).strokeCircle(6, 6, 6);
            g.generateTexture('pegDot', 12, 12); g.destroy();
        }
        // ❗팬(업드래프트) — 좌표 회전 계산으로 블레이드 그림 (translate/rotate 사용 안함)
        if (!scene.textures.exists('fan')) {
            const g = scene.add.graphics();
            const cx = 48, cy = 48;
            g.lineStyle(3, 0x7dd3fc, 0.9).strokeCircle(cx, cy, 44);
            g.fillStyle(0x7dd3fc, 0.9);

            const drawBlade = (angleDeg) => {
                const a = Phaser.Math.DegToRad(angleDeg);
                const cos = Math.cos(a), sin = Math.sin(a);
                const rot = (x, y) => ({ x: cx + x*cos - y*sin, y: cy + x*sin + y*cos });
                // 삼각형 블레이드
                const p1 = rot(0, 0);
                const p2 = rot(32, 8);
                const p3 = rot(32, -8);
                g.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
            };

            drawBlade(0); drawBlade(90); drawBlade(180); drawBlade(270);
            g.generateTexture('fan', 96, 96);
            g.destroy();
        }
        // 바람 점
        if (!scene.textures.exists('windDot')) {
            const g = scene.add.graphics(); g.fillStyle(0xffffff,1).fillRect(0,0,2,2);
            g.generateTexture('windDot',2,2); g.destroy();
        }
    };
    ensureTextures();

    // ── 도우미: 바
    function makeBarImage(x, y, w, color) {
        const key = `bar_${w}_${color.toString(16)}`;
        makeSolidTexture(scene, key, w, 20, color, 1);
        const img = scene.matter.add.image(x, y, key, null, { restitution: 0.6 });
        img.setOrigin(0.5).setFriction(0).setFrictionStatic(0).setFrictionAir(0);
        return img;
    }

    // 스피너/왕복
    function createSpinner(x, y, armLen = 220, angVel = 0.11, color = 0xff7bd6, cross = true) {
        const bar1 = makeBarImage(x, y, armLen, color);
        const h1 = MatterJS.Constraint.create({ pointA:{x,y}, bodyB:bar1.body, pointB:{x:0,y:0}, length:0, stiffness:1 });
        scene.matter.world.add(h1); bar1.setAngularVelocity(angVel).setIgnoreGravity(true); scene.obstacles.push(bar1);
        if (cross) {
            const bar2 = makeBarImage(x, y, armLen, color);
            const h2 = MatterJS.Constraint.create({ pointA:{x,y}, bodyB:bar2.body, pointB:{x:0,y:0}, length:0, stiffness:1 });
            scene.matter.world.add(h2); bar2.setAngularVelocity(-angVel*1.05).setAngle(90).setIgnoreGravity(true); scene.obstacles.push(bar2);
        }
    }
    function createMover(x, y, width, range, duration, color = 0x67e8f9) {
        const go = makeBarImage(x, y, width, color); go.setStatic(true); scene.obstacles.push(go);
        scene.tweens.add({ targets: go, x:`+=${range}`, duration, yoyo:true, repeat:-1, ease:'Sine.easeInOut',
            onUpdate: ()=> MatterJS.Body.setPosition(go.body, {x:go.x, y:go.y}) });
    }

    // 플링코
    // 화면 폭을 끝까지 채우는 플링코
    function createPegFieldFullWidth(y, rows = 7, rowGap = 70, margin = 24, r = 10, rest = 0.85) {
        const left = margin;
        const right = config.width - margin;
        const width = right - left;

        // 목표 간격(대략 90px)이 되도록 컬럼 수 계산
        const targetGap = 90;
        let cols = Math.max(5, Math.round(width / targetGap) + 1);
        const gap = width / (cols - 1);           // 실제 간격 재계산

        for (let ry = 0; ry < rows; ry++) {
            // 홀수 행은 반 칸 오프셋(벌집 배열)
            const offset = (ry % 2) ? gap / 2 : 0;
            for (let c = 0; c < cols; c++) {
                let x = left + c * gap + offset;
                // 가장 왼/오른쪽이 화면 밖으로 나가지 않게 보정
                if (x < left + r) x = left + r;
                if (x > right - r) x = right - r;

                const body = scene.matter.add.circle(x, y + ry * rowGap, r, {
                    isStatic: true, restitution: rest, friction: 0, frictionStatic: 0
                });
                scene.pegBodies.add(body);
                scene.obstacles.push(scene.add.image(x, y + ry * rowGap, 'pegDot'));
            }
        }
    }

    // 소용돌이(난기류)
    function createSwirl(x, y, radius = 120, strength = 0.0016, tangential = 1.0, outward = -0.10) {
        const body = scene.matter.add.circle(x, y, radius, { isStatic:true, isSensor:true });
        scene.swirlMap.set(body, { strength, tangential, outward });

        const ring1 = scene.add.image(x, y, 'ring').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.85);
        const ring2 = scene.add.image(x, y, 'ring').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6).setScale(0.72);
        scene.tweens.add({ targets: ring1, angle:360, duration:3600, repeat:-1, ease:'Linear' });
        scene.tweens.add({ targets: ring2, angle:-360, duration:5000, repeat:-1, ease:'Linear' });

        const orbit = scene.add.container(x, y);
        for (let i=0;i<8;i++){
            const dot = scene.add.image(0,0,'orbitDot').setAlpha(0.9);
            const a = (i/8)*Math.PI*2; dot.x = Math.cos(a)* (radius-14); dot.y = Math.sin(a)*(radius-14);
            orbit.add(dot);
        }
        scene.tweens.add({ targets: orbit, angle: 360, duration: 3000, repeat:-1, ease:'Linear' });

        scene.obstacles.push(ring1, ring2, orbit);
    }

    // 컨베이어
    function createConveyor(x, y, w, h, dir = +1, force = 0.0010) {
        const body = scene.matter.add.rectangle(x, y, w, h, { isStatic:true, isSensor:true });
        scene.conveyorMap.set(body, { dir: Math.sign(dir) || +1, force });
        const tile = scene.add.tileSprite(x,y,w,h,'arrowTile').setAlpha(0.85).setTint(0x7dd3fc);
        scene.tweens.add({ targets: tile, tilePositionX: dir>0? 64 : -64, duration:800, repeat:-1, ease:'Linear' });
        scene.obstacles.push(tile);
    }

    // 끈적존
    function createSticky(x, y, w) {
        const h = 24;
        const body = scene.matter.add.rectangle(x, y, w, h, { isStatic:true, isSensor:true });
        scene.stickySet.add(body);
        const goo = scene.add.image(x,y,'goo').setDisplaySize(w, h*2).setAlpha(0.85);
        scene.tweens.add({ targets: goo, scaleY: {from: goo.scaleY*0.95, to: goo.scaleY*1.05}, duration:1200, yoyo:true, repeat:-1, ease:'Sine.inOut' });
        scene.obstacles.push(goo);
    }

    // 업드래프트(위로 부는 바람)
    // 업드래프트(위로 부는 바람) — 펄스형
    function createUpdraft(x, y, w, h, strength = 0.0040, onMs = 1100, offMs = 700, phaseMs = 0) {
        const body = scene.matter.add.rectangle(x, y, w, h, { isStatic: true, isSensor: true });

        // 비주얼
        const tile = scene.add.tileSprite(x, y, w, h, 'upTile').setAlpha(0.9);
        scene.tweens.add({ targets: tile, tilePositionY: -48, duration: 700, repeat: -1, ease: 'Linear' });

        const fan = scene.add.image(x, y + h/2 + 26, 'fan').setAlpha(0.95).setTint(0x7dd3fc);
        scene.tweens.add({ targets: fan, angle: 360, duration: 1000, repeat: -1, ease: 'Linear' });

        const emitter = scene.add.particles(0,0,'windDot', {
            x: { min: x - w/2 + 8, max: x + w/2 - 8 },
            y: y + h/2,
            lifespan: 900,
            speedY: { min: -160, max: -240 },
            speedX: { min: -15, max: 15 },
            quantity: 2,
            frequency: 60,
            alpha: { start: 0.7, end: 0 },
            scale: { start: 1, end: 0.4 }
        });
        emitter.setDepth(10);

        // 존 레지스트리에 물리/시각 상태 모두 저장
        if (!scene.updraftMap) scene.updraftMap = new Map();
        scene.updraftMap.set(body, {
            strength, on: onMs, off: offMs, t0: scene.time.now + phaseMs,
            tile, fan, emitter, _emitting: true
        });

        // 매 프레임 ON/OFF에 맞춰 비주얼 갱신(한 번만 훅킹)
        if (!scene._updraftUpdater) {
            scene._updraftUpdater = (time) => {
                if (!scene.updraftMap) return;
                const now = scene.time.now;
                scene.updraftMap.forEach((z) => {
                    const T = (z.on || 1000) + (z.off || 1000);
                    const t = ((now - (z.t0 || 0)) % T + T) % T;
                    const active = t < (z.on || 1000);

                    // 시각 효과 토글
                    if (z.tile) z.tile.setAlpha(active ? 0.95 : 0.35);
                    if (z.fan)  z.fan.setTint(active ? 0xffffff : 0x5b8ab0);
                    if (z.emitter) {
                        if (active && !z._emitting) { z.emitter.start(); z._emitting = true; }
                        else if (!active && z._emitting) { z.emitter.stop();  z._emitting = false; }
                    }
                });
            };
            scene.events.on('update', scene._updraftUpdater);
        }

        scene.obstacles.push(tile, fan, emitter);
    }

    // ── 배치
    createSpinner(config.width/2, 900, 240, 0.10, 0xff8bd1, true);
    createMover  (config.width/2, 1200, 180, 180, 1700, 0x93c5fd);

    createPegFieldFullWidth(1650, 7, 70, 24, 10, 0.85);

    createSwirl   (config.width/2 - 140, 2300, 130, 0.0016,  1.0, -0.10);
    createSwirl   (config.width/2 + 140, 2500, 130, 0.0016, -1.0, -0.10);
    createConveyor(config.width/2,       2650, 360, 22, +1,   0.0010);
    createSticky  (config.width/2,       2800, 420);

    createSpinner (config.width/2, 3050, 280, -0.11, 0x34d399, true);
    createMover   (config.width/2 - 120, 3300, 140, 220, 1400, 0xfca5a5);
    createMover   (config.width/2 + 120, 3450, 140, -220, 1400, 0xfca5a5);

    // ── 피니시 업드래프트 (Y-레일 내부, 펄스형)
    createUpdraft(config.width/2 - 60, 3840, 120, 240, 0.0060, 1000, 700,   0);   // 왼쪽, 먼저 ON
    createUpdraft(config.width/2 + 60, 3840, 120, 240, 0.0060, 1000, 700, 500);   // 오른쪽, 반 박자 뒤 ON
} // ← 이 괄호 바로 위에 배치 블록이 들어가야 합니다.

function createGoalZone(scene) {
    const goalX = config.width / 2;
    const goalY = 3950;

    const leftPathStartX = goalX - 125;
    const leftPathStartY = goalY - 450;
    const rightPathStartX = goalX + 125;
    const rightPathStartY = goalY - 450;
    const mergePointX = goalX;
    const mergePointY = goalY + 50;

    const slideLength = Phaser.Math.Distance.Between(leftPathStartX, leftPathStartY, mergePointX, mergePointY);
    const slideHeight = 10;

    const leftAngleDeg  = Phaser.Math.RadToDeg(Math.atan2(mergePointY - leftPathStartY,  mergePointX - leftPathStartX));
    const rightAngleDeg = Phaser.Math.RadToDeg(Math.atan2(mergePointY - rightPathStartY, mergePointX - rightPathStartX));

    // ── 슬라이드(정적 바디)
    const slideKey = `slide_${Math.round(slideLength)}`;
    makeSolidTexture(scene, slideKey, Math.round(slideLength), slideHeight, 0xffff00, 1);

    const leftSlide = scene.matter.add.image(goalX - 60, goalY - 200, slideKey, null, { isStatic: true });
    leftSlide.setOrigin(0.5).setAngle(leftAngleDeg);

    const rightSlide = scene.matter.add.image(goalX + 60, goalY - 200, slideKey, null, { isStatic: true });
    rightSlide.setOrigin(0.5).setAngle(rightAngleDeg);

    // ── 상단 가로 바리어(좌/우)
    const barrierY = leftPathStartY - 5;
    const barrierThickness = 10;

    const leftWidth  = leftPathStartX;
    const rightWidth = config.width - rightPathStartX;

    const leftKey  = `barrier_L_${leftWidth}`;
    const rightKey = `barrier_R_${rightWidth}`;
    makeSolidTexture(scene, leftKey,  leftWidth,  barrierThickness, 0x0000ff, 0.4);
    makeSolidTexture(scene, rightKey, rightWidth, barrierThickness, 0x0000ff, 0.4);

    const leftBarrier  = scene.matter.add.image(leftWidth / 2, barrierY, leftKey,  null, { isStatic: true, restitution: 1.2, friction: 0 });
    const rightBarrier = scene.matter.add.image(rightPathStartX + rightWidth / 2, barrierY, rightKey, null, { isStatic: true, restitution: 1.2, friction: 0 });

    // ✅ 중앙(갭) 방향으로 아주 살짝 경사
    leftBarrier.setAngle(+2);   // 오른쪽(중앙)으로 내려가도록
    rightBarrier.setAngle(-2);  // 왼쪽(중앙)으로 내려가도록

    scene.leftBarrierBody  = leftBarrier.body;
    scene.rightBarrierBody = rightBarrier.body;

    // 골인 이미지(장식)
    scene.goalImage = scene.add.image(goalX, goalY, 'goal').setDisplaySize(200, 200);

    // 골인 센서
    const goalKey = `goalSensor`;
    makeSolidTexture(scene, goalKey, 100, 100, 0x00ff00, 0); // 보이지 않는 센서
    const goalGO = scene.matter.add.image(goalX, goalY, goalKey, null, { isStatic: true, isSensor: true });
    goalGO.setOrigin(0.5);
    scene.goalZone = goalGO;
}

function registerCollisionHandlers(scene) {
    if (scene._collisionsReady) return;
    scene._collisionsReady = true;

    const MatterJS = Phaser.Physics.Matter.Matter;

    // 업드래프트 ON/OFF 판정
    function isUpdraftActive(z, scene) {
        const now = scene.time.now;
        const T = (z.on || 1000) + (z.off || 1000);
        const t = ((now - (z.t0 || 0)) % T + T) % T;
        return t < (z.on || 1000);
    }

    // 플레이어 바디 찾기
    function asPlayer(body) {
        return players.find(p => p?.body?.body === body) || null;
    }

    // 상단 파란 바 접촉 시 초기 튕김
    function bounceOnBarrier(playerObj, which) {
        const mBody = playerObj.body.body;
        const v = mBody.velocity;
        const push = 1.1;
        const minX = 0.8;
        const nextVX = (which === 'L')
            ? Math.max(Math.abs(v.x), minX) * push
            : -Math.max(Math.abs(v.x), minX) * push;
        const nextVY = (v.y < 0.5 ? -1.0 : v.y * -0.33);
        MatterJS.Body.setVelocity(mBody, { x: nextVX, y: nextVY });
    }

    // ▶ 업드래프트 "입장 킥" : 영역에 갓 들어왔고 ON이면 한 번에 위로 차올림
    function kickUpdraft(p, otherBody) {
        if (!p || !scene.updraftMap) return;
        const z = scene.updraftMap.get(otherBody);
        if (!z || !isUpdraftActive(z, scene)) return;

        const mBody = p.body.body;
        const v = mBody.velocity;

        // 충분히 내려오고 있을 때만 강하게 반전
        if (v.y > 1.2) {
            const targetVy = Math.min(-6.0, -v.y * 0.55); // 한 번에 위로
            MatterJS.Body.setVelocity(mBody, { x: v.x, y: targetVy });
        }
    }

    // ─── collisionstart: 골인/바리어/업드래프트 입장 킥 ───
    scene.matter.world.on('collisionstart', (event) => {
        for (const { bodyA, bodyB } of event.pairs) {
            const pA = asPlayer(bodyA);
            const pB = asPlayer(bodyB);

            // 골인 처리
            if (pA && scene.goalZone?.body === bodyB) onPlayerFinish(scene, pA, pA.name);
            else if (pB && scene.goalZone?.body === bodyA) onPlayerFinish(scene, pB, pB.name);

            // 상단 바 첫 접촉 튕김
            if (pA && bodyB === scene.leftBarrierBody)  bounceOnBarrier(pA, 'L');
            if (pA && bodyB === scene.rightBarrierBody) bounceOnBarrier(pA, 'R');
            if (pB && bodyA === scene.leftBarrierBody)  bounceOnBarrier(pB, 'L');
            if (pB && bodyA === scene.rightBarrierBody) bounceOnBarrier(pB, 'R');

            // ⬇ 추가: 업드래프트 입장 킥
            if (pA) kickUpdraft(pA, bodyB);
            if (pB) kickUpdraft(pB, bodyA);
        }
    });

    // ─── collisionactive: 폴스존(난기류/컨베이어/끈적/업드래프트 연속 밀기) + 멈춤 방지 ───
    const VTOP_MIN_SPEED = 0.6;
    const VTOP_PUSH_X    = 0.002;
    const VTOP_PUSH_UP   = 0.0005;
    const VTOP_KICK_AFTER= 18;
    const VTOP_KICK_VX   = 1.8;
    const VTOP_KICK_VY   = -0.6;

    scene.matter.world.on('collisionactive', (event) => {
        for (const { bodyA, bodyB } of event.pairs) {
            const pA = asPlayer(bodyA);
            const pB = asPlayer(bodyB);

            // 난기류(소용돌이)
            const applySwirl = (p, other) => {
                const z = p && scene.swirlMap && scene.swirlMap.get(other);
                if (!z) return;
                const mBody = p.body.body, pos = mBody.position;
                const cx = other.position.x, cy = other.position.y;
                const dx = pos.x - cx, dy = pos.y - cy;
                const dist = Math.max(1, Math.hypot(dx, dy));
                const nx = dx / dist, ny = dy / dist;   // 중심→플레이어
                const tx = -ny, ty = nx;                // 접선
                const falloff = Math.min(1, (other.circleRadius || 120) / dist);
                const fx = (z.tangential * tx + z.outward * nx) * z.strength * falloff;
                const fy = (z.tangential * ty + z.outward * ny) * z.strength * falloff;
                if (mBody.isSleeping && MatterJS.Sleeping) MatterJS.Sleeping.set(mBody, false);
                MatterJS.Body.applyForce(mBody, pos, { x: fx, y: fy });
            };

            // 컨베이어
            const applyConveyor = (p, other) => {
                const z = p && scene.conveyorMap && scene.conveyorMap.get(other);
                if (!z) return;
                const mBody = p.body.body;
                if (mBody.isSleeping && MatterJS.Sleeping) MatterJS.Sleeping.set(mBody, false);
                MatterJS.Body.applyForce(mBody, mBody.position, { x: z.dir * z.force, y: 0 });
            };

            // 끈적존(감속)
            const applySticky = (p, other) => {
                if (!p || !scene.stickySet || !scene.stickySet.has(other)) return;
                const mBody = p.body.body;
                const v = mBody.velocity;
                MatterJS.Body.applyForce(mBody, mBody.position, { x: -v.x * 0.0009, y: -v.y * 0.0009 });
            };

            // 업드래프트 연속 밀기(속도 비례 강화)
            const applyUpdraft = (p, other) => {
                const z = p && scene.updraftMap && scene.updraftMap.get(other);
                if (!z || !isUpdraftActive(z, scene)) return;

                const mBody = p.body.body;
                if (mBody.isSleeping && MatterJS.Sleeping) MatterJS.Sleeping.set(mBody, false);

                const vy = mBody.velocity.y; // + 아래로
                const scale = Phaser.Math.Clamp(vy * 0.02, 0, 0.08);
                const base  = z.strength;
                const jitter = (Math.random() - 0.5) * base * 0.4;

                MatterJS.Body.applyForce(mBody, mBody.position, { x: jitter, y: -(base + scale) });
            };

            const nudgeIfNeeded = (p, otherBody) => {
                if (!p || !otherBody) return;

                // 폴스존 적용
                applySwirl(p, otherBody);
                applyConveyor(p, otherBody);
                applySticky(p, otherBody);
                applyUpdraft(p, otherBody);

                // 상단 바 거의 멈춤 방지
                const isLeft  = (otherBody === scene.leftBarrierBody);
                const isRight = (otherBody === scene.rightBarrierBody);
                if (!isLeft && !isRight) return;

                const mBody = p.body.body;
                const v = mBody.velocity;
                if (mBody.isSleeping && MatterJS.Sleeping) MatterJS.Sleeping.set(mBody, false);

                const almostStill = Math.abs(v.x) < VTOP_MIN_SPEED && Math.abs(v.y) < VTOP_MIN_SPEED;
                if (almostStill) {
                    const dir = isLeft ? +1 : -1;
                    MatterJS.Body.applyForce(mBody, mBody.position, {
                        x: dir * VTOP_PUSH_X, y: -VTOP_PUSH_UP
                    });
                    p._stuckFrames = (p._stuckFrames || 0) + 1;
                    if (p._stuckFrames > VTOP_KICK_AFTER) {
                        MatterJS.Body.setVelocity(mBody, { x: dir * VTOP_KICK_VX, y: VTOP_KICK_VY });
                        p._stuckFrames = 0;
                    }
                } else {
                    p._stuckFrames = 0;
                }
            };

            nudgeIfNeeded(pA, bodyB);
            nudgeIfNeeded(pB, bodyA);
        }
    });
}

function isUpdraftActive(z, scene) {
    const now = scene.time.now;
    const T = (z.on || 1000) + (z.off || 1000);
    const t = ((now - (z.t0 || 0)) % T + T) % T;
    return t < (z.on || 1000);
}

function makeSolidTexture(scene, key, w, h, color = 0xffffff, alpha = 1) {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    g.fillStyle(color, alpha).fillRect(0, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
}

function checkWin(scene) {
    scene.finishOrder = [];
}

function onPlayerFinish(scene, p, name) {
    if (p.finished) return;

    p.finished = true;
    p.finishedAt = scene.time.now;
    p.rank = (scene.finishOrder?.length || 0) + 1;
    scene.finishOrder.push(p);

    // 더 이상 쌓이지 않도록 정리
    p.body.setIgnoreGravity(true);
    p.body.setVelocity(0, 0);
    p.body.setStatic(true);
    p.body.setVisible(false);
    p.label.setVisible(false);
    // 화면 밖으로
    p.body.setPosition(-10000, -10000);

    // 1등 HUD (게임은 계속 진행)
    if (p.rank === 1) {
        scene.winner = p;
        showWinnerUI(scene, name);
    }

    updateLeaderboard(scene);
}

function createLeaderboard(scene) {
    scene.lbLayer?.destroy();
    const layer = scene.add.layer().setDepth(8000);
    scene.lbLayer = layer;

    if (scene.minimapCamera) scene.minimapCamera.ignore(layer);

    const w = 190, h = config.height - 20;
    const x = config.width - w - 10, y = 10;

    const bg = scene.add.graphics().setScrollFactor(0);
    bg.fillStyle(0x0f1729, 0.82).fillRoundedRect(x, y, w, h, 12);
    bg.lineStyle(2, 0x5eead4, 1).strokeRoundedRect(x, y, w, h, 12); // 민트 네온
    layer.add(bg);

    const title = scene.add.text(x + 12, y + 10, "📜 순위", {
        fontSize: '16px', fontFamily: 'Orbitron', color: '#c7d2fe'
    }).setScrollFactor(0);
    layer.add(title);

    scene._lbStartX = x + 12;
    scene._lbStartY = y + 36;
    scene._lbWidth  = w - 24;
    scene._lbLineH  = 18;
    scene.lbItems   = [];
}

function updateLeaderboard(scene) {
    if (!scene.lbLayer) return;

    // finished 먼저, 그 다음 진행 중은 결승선에 가까운 순
    const sorted = players.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.rank - b.rank;
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        return (b.body.y - a.body.y);
    });

    const makeOrUpdate = (i, p, rank) => {
        const baseY = scene._lbStartY + i * scene._lbLineH;
        const name  = p.name || p.label?.text || `P${i+1}`;
        const flag  = p.finished ? " 🏁" : "";
        const color = p.color || 0xffffff;

        let line = scene.lbItems[i];
        if (!line) {
            const rankTx = scene.add.text(scene._lbStartX, baseY, '', {
                fontSize: '14px', fontFamily: 'Arial', color: '#ffffff'
            }).setScrollFactor(0);

            const nameTx = scene.add.text(0, baseY, '', {
                fontSize: '14px', fontFamily: 'Arial', color: hexToCss(color)
            }).setScrollFactor(0);

            const flagTx = scene.add.text(0, baseY, '', {
                fontSize: '14px', fontFamily: 'Arial', color: '#ffffff'
            }).setScrollFactor(0);

            // ⛏️ 여기! addMultiple 대신 개별 add
            scene.lbLayer.add(rankTx);
            scene.lbLayer.add(nameTx);
            scene.lbLayer.add(flagTx);

            line = scene.lbItems[i] = { rankTx, nameTx, flagTx };
        }

        // 내용/색/위치 갱신
        line.rankTx.setText(String(rank).padStart(2, ' ') + '.').setY(baseY);
        line.nameTx.setText(name).setColor(hexToCss(color)).setY(baseY);
        line.nameTx.setX(line.rankTx.x + line.rankTx.width + 6);
        line.flagTx.setText(flag).setY(baseY);
        line.flagTx.setX(line.nameTx.x + line.nameTx.width + 4);

        line.rankTx.setVisible(true);
        line.nameTx.setVisible(true);
        line.flagTx.setVisible(true);
    };

    for (let i = 0; i < sorted.length; i++) {
        const p = sorted[i];
        const rank = p.finished ? p.rank : (i + 1);
        makeOrUpdate(i, p, rank);
    }

    // 남는 라인 정리
    for (let j = sorted.length; j < (scene.lbItems?.length || 0); j++) {
        const l = scene.lbItems[j];
        l.rankTx.destroy(); l.nameTx.destroy(); l.flagTx.destroy();
    }
    scene.lbItems.length = sorted.length;
}

function showWinnerUI(scene, winnerName) {
    // 중복 방지
    if (scene._winHudShown) return;
    scene._winHudShown = true;

    const winner = scene.winner; // 게임은 계속 진행

    // === 작은 HUD 레이어(화면 고정) ===
    const hud = scene.add.layer().setDepth(9000);
    if (scene.minimapCamera) scene.minimapCamera.ignore(hud); // 미니맵에서 숨김

    const margin = 14;
    const boxW = 280;
    const boxH = 120;
    const bx = config.width - margin - boxW;
    const by = config.height - margin - boxH;

    // 패널
    const panel = scene.add.graphics().setScrollFactor(0);
    panel.fillStyle(0x101418, 0.92).fillRoundedRect(bx, by, boxW, boxH, 12);
    panel.lineStyle(2, 0x00d2ff, 1).strokeRoundedRect(bx, by, boxW, boxH, 12);
    hud.add(panel);

    // 타이틀
    const title = scene.add.text(bx + 14, by + 12, "🏆 1등", {
        fontSize: "16px", fontFamily: "Orbitron", color: "#a8e5ff"
    }).setScrollFactor(0);
    hud.add(title);

    // 우승자 이름
    const name = scene.add.text(bx + 14, by + 42, winnerName, {
        fontSize: "20px", fontFamily: "Arial", color: "#ffffff",
        wordWrap: { width: boxW - 28, useAdvancedWrap: true }
    }).setScrollFactor(0);
    hud.add(name);

    // 다시하기 버튼
    const btn = scene.add.text(bx + boxW - 112, by + boxH - 36, "🔁 다시하기", {
        fontSize: "16px", fontFamily: "Arial",
        backgroundColor: "#ff4a4a", color: "#fff",
        fixedWidth: 110, fixedHeight: 32, align: "center",
        padding: { top: 7 }
    })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => window.location.reload())
        .on("pointerover", () => btn.setStyle({ backgroundColor: "#ffffff", color: "#ff4a4a" }))
        .on("pointerout",  () => btn.setStyle({ backgroundColor: "#ff4a4a", color: "#ffffff" }));
    hud.add(btn);

    // 나타나는 애니메이션
    scene.tweens.add({
        targets: hud,
        alpha: { from: 0, to: 1 },
        y: { from: 8, to: 0 },
        duration: 180,
        ease: "Quad.easeOut"
    });

    // === 화면 전체 축포! (기존 HUD 주변 컨페티 코드는 제거) ===
    playFullScreenConfetti(scene, 3000); // 3초간 전체 화면에서 컨페티

    // 우승 공 하이라이트(짧게)
    if (winner?.body) {
        const pulse = scene.add.circle(winner.body.x, winner.body.y, 24, 0xffff00, 0.25).setDepth(5000);
        scene.tweens.add({
            targets: pulse, scale: 4, alpha: 0, duration: 900, repeat: 1,
            onComplete: () => pulse.destroy()
        });
    }
}

function playFullScreenConfetti(scene, duration = 3000) {
    // 텍스처 보장
    if (!scene.textures.exists('confetti')) {
        const g = scene.add.graphics();
        g.fillStyle(0xffffff).fillRect(0, 0, 8, 8);
        g.generateTexture('confetti', 8, 8);
        g.destroy();
    }

    // 화면 전체 폭에서 떨어지도록 이mitter 하나 생성
    const confetti = scene.add.particles(0, 0, 'confetti', {
        x: { min: 20, max: config.width - 20 },
        y: 0,
        speed: { min: 220, max: 420 },
        angle: { min: 110, max: 250 },
        gravityY: 520,
        lifespan: { min: 900, max: 1400 },
        quantity: 12,
        frequency: 60,
        scale: { start: 1.0, end: 0.4 },
        rotate: { min: -180, max: 180 },
        tint: [0xff5252, 0xffe066, 0x69f0ae, 0x40c4ff, 0xff80ab]
    });

    confetti.setScrollFactor(0).setDepth(9050);   // 화면 고정 + 최상단
    if (scene.minimapCamera) scene.minimapCamera.ignore(confetti);

    // duration(ms) 후 종료 및 정리
    scene.time.delayedCall(duration, () => {
        confetti.stop();     // ← 이mitter 직접 정지
        confetti.destroy();  // ← GameObject 제거
    });
}


// update 함수: 카메라 추적, 라벨 따라가기, 미니맵 연동
function update() {
    if (players.length === 0) return;

    // 진행 중인 플레이어들만 추적
    const racing = players.filter(p => !p.finished);
    const lowest = racing.length
        ? racing.reduce((a, b) => (a.body.y > b.body.y ? a : b))
        : players[0];

    if (lowest) {
        this.cameras.main.startFollow(lowest.body, true, 0.2, 0.2);
    }
    this.cameras.main.setZoom(1);

    players.forEach(p => {
        if (!p.body || !p.label) return;
        if (p.finished) return;                   // 결승 통과자는 갱신 X

        p.label.setPosition(p.body.x, p.body.y - 25);

        const { x, y } = p.body;
        if (x < -500 || x > config.width + 300 || y < -200 || y > 4500) {
            p.body.setPosition(config.width / 2, 200);
            p.body.setVelocity(Phaser.Math.Between(-2, 2), 0);
        }
    });

    if (this.minimapCamera && lowest) {
        this.minimapCamera.scrollX = 0;
        this.minimapCamera.scrollY = lowest.body.y - (this.minimapCamera.height / 2);
        if (this.minimapCamera.scrollY < 0) this.minimapCamera.scrollY = 0;
        if (this.minimapCamera.scrollY > 4000 - this.minimapCamera.height)
            this.minimapCamera.scrollY = 4000 - this.minimapCamera.height;
    }

    // ← 실시간 순위판 갱신
    updateLeaderboard(this);
}