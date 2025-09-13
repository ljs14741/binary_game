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
let __typingLock = false;
let __domContainer = null;

// === 캔버스 실제 사각형과 스케일 ===
function getCanvasEl() {
    return document.querySelector('#game-container canvas');
}
function getCanvasRect() {
    const cv = getCanvasEl();
    return cv ? cv.getBoundingClientRect() : null;
}
function getCanvasScaleAndOffset() {
    const gc = document.getElementById('game-container');
    const gr = gc.getBoundingClientRect();
    const cr = getCanvasRect();
    if (!cr) return { sx: 1, sy: 1, offX: 0, offY: 0 };
    return {
        sx: cr.width / BASE_W,
        sy: cr.height / BASE_H,
        offX: cr.left - gr.left,
        offY: cr.top - gr.top
    };
}

function syncDomContainerToCanvas() {
    const gc = document.getElementById('game-container');
    const domC = getDomContainer();
    if (!gc || !domC) return;

    const apply = () => {
        const cr = getCanvasRect();
        if (!cr) return;
        const gr = gc.getBoundingClientRect();
        const left = cr.left - gr.left;
        const top  = cr.top  - gr.top;
        Object.assign(domC.style, {
            position: 'absolute',
            left:  left + 'px',
            top:   top  + 'px',
            width:  cr.width  + 'px',
            height: cr.height + 'px',
            transform: 'none',
            WebkitTransform: 'none',
            pointerEvents: 'auto',
            zIndex: 2
        });
    };

    // 즉시 1회 + 레이아웃 확정 후 1회 + 느린 브라우저 대비 1회
    apply();
    requestAnimationFrame(apply);
    setTimeout(apply, 80);
}

function rebuildNicknameInputs(scene) {
    // 열려있지 않으면 패스
    const overlay = document.getElementById('name-overlay');
    const hasRex  = Array.isArray(uiElements.nameInputs) && uiElements.nameInputs.length > 0;
    if (!overlay && !hasRex) return;

    // 현재 값 + 현재 포커스 index 저장
    let values = [];
    let focusIdx = -1;

    if (overlay) {
        const inputs = Array.from(overlay.querySelectorAll('input'));
        values = inputs.map(inp => (inp.value || '').trim());
        focusIdx = inputs.indexOf(document.activeElement);
        overlay.remove();               // 네이티브 오버레이 제거
    } else if (hasRex) {
        values = uiElements.nameInputs.map(inp => (inp.text || inp.node?.value || '').trim());
        const active = document.activeElement;
        focusIdx = uiElements.nameInputs.findIndex(inp => inp?.node === active);
        uiElements.nameInputs.forEach(inp => { try { inp.destroy(); } catch(e){} });
        uiElements.nameInputs = [];
    }

    // seed로 사용하도록 전역에 반영
    playerNicknames = values;

    // DOM 컨테이너를 현재 캔버스에 동기화(안전)
    syncDomContainerToCanvas();

    // 현재 화면 폭에 맞춰 올바른 방식으로 다시 생성
    if (useNativeInputs()) {
        generateNicknameInputsNative(scene);
    } else {
        generateNicknameInputs(scene);
    }

    // 포커스 복원(가능하면)
    setTimeout(() => {
        if (useNativeInputs()) {
            const list = document.querySelectorAll('#name-overlay input');
            if (focusIdx >= 0 && list[focusIdx]) list[focusIdx].focus();
        } else if (Array.isArray(uiElements.nameInputs) && uiElements.nameInputs[focusIdx]?.node) {
            uiElements.nameInputs[focusIdx].node.focus();
        }
    }, 0);
}

// === 닉네임 입력창 리레이아웃(전체화면/리사이즈 시 호출) ===
function relayoutNicknameInputs(scene) {
    // 아무것도 열려있지 않으면 패스
    const overlay = document.getElementById('name-overlay');
    const hasRex = Array.isArray(uiElements.nameInputs) && uiElements.nameInputs.length > 0;
    if (!overlay && !hasRex) return;

    // 공통 그리드 파라미터 (생성 때와 동일)
    const centerX = BASE_W / 2;
    const frameW = 740;
    const frameX = centerX - frameW / 2;
    const frameY = 270;
    const padding = 18;
    const cellW = 120, cellH = 36, gap = 12;

    const cols = Math.max(2, Math.min(6, Math.floor((frameW - padding*2 + gap) / (cellW + gap))));
    const rows = Math.ceil(playerCount / cols);
    const frameH = padding*2 + rows*cellH + (rows - 1)*gap;

    const gridW = cols * cellW + (cols - 1)*gap;
    const startX = frameX + (frameW - gridW)/2 + cellW/2;
    const startY = frameY + padding + cellH/2;

    // 노란 프레임/타이틀 재도색(Phaser 쪽)
    if (uiElements.nameFrame) {
        uiElements.nameFrame.setVisible(true).clear()
            .lineStyle(2, 0xffcc00, 1)
            .fillStyle(0x000000, 0.20)
            .fillRoundedRect(frameX, frameY, frameW, frameH, 14)
            .strokeRoundedRect(frameX, frameY, frameW, frameH, 14);
    }
    if (uiElements.nameTitle) uiElements.nameTitle.setVisible(true).setPosition(centerX, frameY - 10);
    resizeSetupPanel(scene, { rows, frameH });

    // 캔버스 스케일/오프셋
    const { sx, sy, offX, offY } = getCanvasScaleAndOffset();
    const pxX = v => Math.round(offX + v * sx);
    const pxY = v => Math.round(offY + v * sy);

    // 1) 네이티브 오버레이 인풋(모바일) 재배치
    if (overlay) {
        const cells = overlay.querySelectorAll('.cell');
        for (let i = 0; i < playerCount && i < cells.length; i++) {
            const c = i % cols, r = Math.floor(i / cols);
            const baseX = startX + c*(cellW + gap);
            const baseY = startY + r*(cellH + gap);

            const cell = cells[i];
            const input = cell.querySelector('input');

            cell.style.left = pxX(baseX) + 'px';
            cell.style.top  = pxY(baseY) + 'px';

            if (input) {
                input.style.width  = Math.round(cellW * sx) + 'px';
                input.style.height = Math.round(cellH * sy) + 'px';
                input.style.fontSize = Math.max(12, Math.round(16 * Math.min(sx, sy))) + 'px';
                input.style.lineHeight = input.style.height;
            }
        }
    }

    // 2) rexInputText(PC 등) 재배치
    if (!overlay && hasRex) {
        for (let i = 0; i < uiElements.nameInputs.length; i++) {
            const inputGO = uiElements.nameInputs[i];
            if (!inputGO) continue;

            const c = i % cols, r = Math.floor(i / cols);
            const x = Math.round((startX + c * (cellW + gap)) * sx);
            const y = Math.round((startY + r * (cellH + gap)) * sy);
            const w = Math.max(40, Math.round(cellW * sx));
            const h = Math.max(24, Math.round(cellH * sy));
            const fontPx = Math.max(12, Math.round(16 * Math.min(sx, sy)));

            inputGO.setPosition(x, y);
            if (typeof inputGO.setSize === 'function') inputGO.setSize(w, h);
            if (inputGO.node) {
                inputGO.node.style.width = w + 'px';
                inputGO.node.style.height = h + 'px';
                inputGO.node.style.fontSize = fontPx + 'px';
                inputGO.node.style.lineHeight = h + 'px';
            }
        }
        // DOM 컨테이너도 캔버스 사각형에 맞춤
        syncDomContainerToCanvas();
    }
}

// === 뷰포트 변화(리사이즈/회전/전체화면 토글 등) 때 공통 처리 ===
function onViewportChange(force = false) {
    if (!force && __typingLock) return;

    // ★ 미디어쿼리 임계(1000px) 넘나들면 인풋 방식을 갈아엎어야 함
    const wantNative = useNativeInputs();
    const overlayOpen = !!document.getElementById('name-overlay');
    const rexOpen = Array.isArray(uiElements.nameInputs)
        && uiElements.nameInputs.length > 0
        && !!uiElements.nameInputs[0]?.node;

    if (window.__pinballScene) {
        if (wantNative && rexOpen && !overlayOpen) {
            rebuildNicknameInputs(window.__pinballScene); // rex -> 네이티브
            return;
        }
        if (!wantNative && overlayOpen) {
            rebuildNicknameInputs(window.__pinballScene); // 네이티브 -> rex
            return;
        }
    }

    // 평소엔 위치/사이즈만 동기화
    syncDomContainerToCanvas();
    if (window.__pinballScene) relayoutNicknameInputs(window.__pinballScene);
}


function rafReflow(times = 8, force = true) {
    let i = 0;
    const tick = () => {
        if (!__typingLock) onViewportChange(force);
        if (++i < times) requestAnimationFrame(tick);   // 몇 프레임 연속으로 추적
    };
    // 전환 직후 한 프레임 기다렸다가 시작
    requestAnimationFrame(tick);
}

// 한번만 바인딩
let __reflowBound = false;
function bindViewportReflow() {
    if (__reflowBound) return;
    __reflowBound = true;

    // 일반 리사이즈/회전: 4~6프레임 정도 추적
    const light = () => rafReflow(6, true);
    // 전체화면 토글: 더 크게 흔들리므로 8~10프레임 추적
    const heavy = () => rafReflow(10, true);

    window.addEventListener('resize', light, { passive: true });
    window.addEventListener('orientationchange', heavy, { passive: true });

    document.addEventListener('fullscreenchange', heavy);
    document.addEventListener('webkitfullscreenchange', heavy);

    if (window.visualViewport) {
        // 모바일 주소창 애니메이션 등: 짧게 여러 번
        window.visualViewport.addEventListener('resize', () => rafReflow(4, true), { passive: true });
        window.visualViewport.addEventListener('scroll',  () => rafReflow(4, true), { passive: true });
    }

    // 가짜 전체화면(#game-container.fake-fullscreen) 클래스 변경 추적
    const gc = document.getElementById('game-container');
    if (gc && !window.__fsObserver) {
        window.__fsObserver = new MutationObserver(muts => {
            for (const m of muts) if (m.attributeName === 'class') heavy();
        });
        window.__fsObserver.observe(gc, { attributes: true, attributeFilter: ['class'] });
    }
}

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

    window.__pinballScene = this;
    bindViewportReflow();
    onViewportChange();   // 최초 1회 정렬

}

function setPlayingMode(on){
    const gc = document.getElementById('game-container');
    if (gc) gc.classList.toggle('playing', !!on);
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
    uiElements.nameTitle = scene.add.text(centerX, 0, '닉네임 입력 (최대 ' + nickMaxLength + '자) - 변경없이 시작 가능', {
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
    setPlayingMode(false);
    uiElements.nicknameButton?.setVisible(false);

    const old = document.getElementById('name-overlay');
    if (old) old.remove();
    uiElements.nameInputs = [];

    const { sx, sy, offX, offY } = getCanvasScaleAndOffset();

    const centerX = BASE_W / 2;
    const frameW = 740;
    const frameX = centerX - frameW / 2;
    const frameY = 270;
    const padding = 18;

    const cellW = 120, cellH = 36, gap = 12;
    const cols = Math.max(2, Math.min(6, Math.floor((frameW - padding*2 + gap) / (cellW + gap))));
    const rows = Math.ceil(playerCount / cols);
    const frameH = padding*2 + rows*cellH + (rows - 1)*gap;

    uiElements.nameFrame.setVisible(true).clear()
        .lineStyle(2, 0xffcc00, 1)
        .fillStyle(0x000000, 0.20)
        .fillRoundedRect(frameX, frameY, frameW, frameH, 14)
        .strokeRoundedRect(frameX, frameY, frameW, frameH, 14);

    uiElements.nameTitle.setVisible(true).setPosition(centerX, frameY - 10);

    const gridW = cols * cellW + (cols - 1)*gap;
    const startX = frameX + (frameW - gridW)/2 + cellW/2;
    const startY = frameY + padding + cellH/2;

    const seed = Array.isArray(playerNicknames) ? playerNicknames.slice() : [];

    const gc = document.getElementById('game-container');
    const overlay = document.createElement('div');
    overlay.id = 'name-overlay';
    // 필요 CSS가 없다면 최소한 이것만:
    // overlay.style.position = 'absolute'; overlay.style.left = overlay.style.top = 0; overlay.style.width = overlay.style.height = '100%';
    gc.appendChild(overlay);

    const pxX = v => Math.round(offX + v * sx);
    const pxY = v => Math.round(offY + v * sy);

    for (let i = 0; i < playerCount; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const baseX = startX + c*(cellW + gap);
        const baseY = startY + r*(cellH + gap);

        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.position = 'absolute';                // 안전하게 보장
        cell.style.left = pxX(baseX) + 'px';
        cell.style.top  = pxY(baseY) + 'px';

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = nickMaxLength;
        input.placeholder = `P${i+1}`;
        input.value = seed[i] || '';
        input.style.width  = Math.round(cellW * sx) + 'px';
        input.style.height = Math.round(cellH * sy) + 'px';
        input.style.fontSize = Math.max(12, Math.round(16 * Math.min(sx, sy))) + 'px';
        input.style.lineHeight = input.style.height;

        // ▶ 모바일 키보드 안정화 포인트
        input.setAttribute('inputmode', 'text');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('autocorrect', 'off');

        // 포커스 직전에 타이핑락 걸어 리레이아웃을 완전히 멈춤
        input.addEventListener('pointerdown', () => {
            __typingLock = true;
            // 일부 브라우저는 클릭 후 focus가 늦게 오므로 확실히 보장
            setTimeout(() => { try { input.focus({ preventScroll: true }); } catch(e){} }, 0);
        }, { passive: true });

        input.addEventListener('focus', () => {
            __typingLock = true;
        }, { passive:true });

        input.addEventListener('blur',  () => {
            __typingLock = false;
            setTimeout(() => onViewportChange(true), 60);
        });

        // 터치 이벤트가 Phaser로 전파되지 않게만 처리 (기본 포커스는 막지 않음)
        ['touchstart','touchmove','touchend','pointerup','mousedown','mouseup','click']
            .forEach(evt => input.addEventListener(evt, e => { e.stopPropagation(); }, { passive: false }));

        cell.appendChild(input);
        overlay.appendChild(cell);
        uiElements.nameInputs.push(input);
    }

    uiElements.startGameButton.setVisible(true);
    resizeSetupPanel(scene, { rows, frameH });

    syncDomContainerToCanvas();
    rafReflow(8, true);
}

function generateNicknameInputs(scene) {
    if (useNativeInputs()) return generateNicknameInputsNative(scene);

    uiElements.nicknameButton?.setVisible(false);
    uiElements.nameInputs?.forEach(i => i.destroy());
    uiElements.nameInputs = [];

    const { sx, sy } = getCanvasScaleAndOffset();

    const centerX = BASE_W / 2;
    const frameW = 740;
    const frameX = centerX - frameW / 2;
    const frameY = 270;
    const padding = 18;

    const cellW = 120, cellH = 36, gap = 12;

    const cols = Math.max(2, Math.min(6, Math.floor((frameW - padding*2 + gap) / (cellW + gap))));
    const rows = Math.ceil(playerCount / cols);
    const frameH = padding*2 + rows*cellH + (rows - 1)*gap;

    uiElements.nameFrame.setVisible(true).clear()
        .lineStyle(2, 0xffcc00, 1)
        .fillStyle(0x000000, 0.20)
        .fillRoundedRect(frameX, frameY, frameW, frameH, 14)
        .strokeRoundedRect(frameX, frameY, frameW, frameH, 14);

    uiElements.nameTitle.setVisible(true).setPosition(centerX, frameY - 10);

    const gridW = cols * cellW + (cols - 1) * gap;
    const startX = frameX + (frameW - gridW) / 2 + cellW / 2;
    const startY = frameY + padding + cellH / 2;

    const keep = Array.isArray(uiElements.nameInputs) ? uiElements.nameInputs.map(i => (i?.text || '').trim()) : [];
    const seed = keep.some(Boolean) ? keep : (Array.isArray(playerNicknames) ? playerNicknames.slice() : []);

    for (let i = 0; i < playerCount; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const x = Math.round((startX + c * (cellW + gap)) * sx);
        const y = Math.round((startY + r * (cellH + gap)) * sy);
        const w = Math.max(40, Math.round(cellW * sx));
        const h = Math.max(24, Math.round(cellH * sy));
        const fontPx = Math.max(12, Math.round(16 * Math.min(sx, sy)));
        const padPx  = Math.max(2, Math.round(4 * Math.min(sx, sy)));

        const input = scene.add.rexInputText(x, y, w, h, {
            type: 'text',
            text: (seed[i] || ''),
            fontSize: `${fontPx}px`,
            color: '#ffffff',
            backgroundColor: '#333333',
            border: '1px solid #ffcc00',
            align: 'center',
            padding: padPx,
            placeholder: `P${i+1}`,
            selectAll: true,
            maxLength: nickMaxLength
        })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(22);

        if (i === 0) normalizeDomContainerFrom(input);
        wireKeyboardGuard(input.node);
        scene.uiLayer?.add(input);
        uiElements.nameInputs.push(input);
    }

    uiElements.startGameButton.setVisible(true);
    resizeSetupPanel(scene, { rows, frameH });

    // ⬇️ 생성 직후 & 전환 직후 몇 프레임 동안 계속 추적해서 잘림 방지
    rafReflow(8, true);
}

function useNativeInputs() {
    return window.matchMedia('(max-width: 1000px)').matches; // 모바일 구간
}

function getDomContainer() {
    // ① 캐시가 살아있으면 그걸 사용
    if (__domContainer && __domContainer.isConnected) return __domContainer;

    // ② 현재 rex 인풋이 하나라도 있으면 그 부모를 컨테이너로
    const anyNode = uiElements?.nameInputs?.find(i => i?.node)?.node;
    if (anyNode && anyNode.parentElement) {
        __domContainer = anyNode.parentElement;
        return __domContainer;
    }

    // ③ 일반 쿼리 (플러그인이 클래스 붙여준 경우)
    const gc = document.getElementById('game-container');
    if (!gc) return null;

    let el = gc.querySelector(':scope > .dom-container, :scope > div.dom-container');
    if (el) { __domContainer = el; return el; }

    // ④ 최후의 수단: 직접 자식 div 중에 input을 품은 것을 찾음
    const divs = gc.querySelectorAll(':scope > div');
    for (const d of divs) {
        if (d.querySelector('input')) { __domContainer = d; return d; }
    }
    return null;
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
        __typingLock = true;     // 입력 중 플래그 ON
        lockDomContainer();      // 화면 흔들림 방지
    }, { passive: true });

    el.addEventListener('blur', () => {
        __typingLock = false;    // 입력 끝
        unlockDomContainer();
        // 키보드가 완전히 닫힌 뒤 레이아웃 싱크
        setTimeout(() => onViewportChange(true), 60);
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
    const el = inputGO?.node;
    const gc = document.getElementById('game-container');
    if (!el || !gc) return;

    const domC = el.parentElement;
    if (!domC) return;

    if (domC.parentElement !== gc) {
        gc.appendChild(domC);
    }

    // ▶ 이후 탐색이 항상 성공하도록 클래스와 캐시를 보장
    domC.classList.add('dom-container');
    __domContainer = domC;
    uiElements.domContainer = domC;

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
        pointerEvents: 'auto',
        zIndex: 2
    });

    // 최초 동기화
    syncDomContainerToCanvas();
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

    // 공백이면 P{index+1}로 대체
    const safeName = (v, idx) => {
        const s = (v ?? '').toString().trim();
        return s.length ? s : `P${idx + 1}`;
    };

    // 1) 닉네임 수집 (모바일: 네이티브 input, PC: rexInputText)
    if (overlay) {
        const fields = Array.from(overlay.querySelectorAll('input'));
        playerNicknames = fields.slice(0, playerCount).map((inp, idx) =>
            safeName(inp.value, idx)
        );
    } else if (Array.isArray(uiElements.nameInputs) && uiElements.nameInputs.length) {
        playerNicknames = uiElements.nameInputs.slice(0, playerCount).map((inp, idx) =>
            safeName(inp.text || inp.node?.value, idx)
        );
    } else {
        // 입력 UI가 닫혀 있었던 특수 상황 방어
        playerNicknames = Array.from({ length: playerCount }, (_, i) => `P${i + 1}`);
    }

    // 길이/공백 방어 (혹시 수집 배열 길이가 어긋나면 보강)
    if (!Array.isArray(playerNicknames) || playerNicknames.length !== playerCount) {
        playerNicknames = Array.from({ length: playerCount }, (_, i) =>
            safeName(playerNicknames?.[i], i)
        );
    }

    // 설정 UI 정리
    overlay?.remove();
    scene.uiLayer?.destroy();
    uiElements = {};

    setPlayingMode(true);

    try {
        const domC = getDomContainer();
        if (domC) domC.style.pointerEvents = 'none';
        const ov = document.getElementById('name-overlay');
        if (ov) ov.style.pointerEvents = 'none';
    } catch (e) {}

    scene.cameras.main.setBackgroundColor('#000');
    players = [];
    lastWinner = null;
    scene.winner = null;

    const startX = config.width / 2;
    const startY = 3800;
    const launchSpeed = 110;
    const ballColors = buildBallPalette(scene, playerCount);

    // 스폰 방향/자리 랜덤화
    const fromLeft = Phaser.Math.Between(0, 1) === 1;
    const SLOT_X = BALL_DIAM + 10;
    const SLOT_Y = BALL_RADIUS + 6;

    const slotOrder = Phaser.Utils.Array.NumberArray(0, playerCount - 1);
    Phaser.Utils.Array.Shuffle(slotOrder);

    const totalWidth  = (playerCount - 1) * SLOT_X;
    const leftAnchor  = startX - totalWidth / 2;
    const rightAnchor = startX + totalWidth / 2;

    for (let i = 0; i < playerCount; i++) {
        const key = `ball_${i}`;
        makeBallTexture(scene, key, ballColors[i]);

        const s = slotOrder[i];
        const sx = fromLeft ? (leftAnchor  + s * SLOT_X) : (rightAnchor - s * SLOT_X);
        const sy = startY - s * SLOT_Y;

        const ballImg = scene.add.image(sx, sy, key).setDisplaySize(BALL_DIAM, BALL_DIAM);
        const player  = scene.matter.add.gameObject(ballImg);
        player.setCircle(BALL_RADIUS);
        player.setBounce(0.8);
        player.setFriction(0).setFrictionStatic(0).setFrictionAir(0.02);
        player.setFixedRotation();
        player.setIgnoreGravity(true);

        // const label = scene.add.text(sx, sy - 25, playerNicknames[i], {
        //     fontSize: '14px', fill: '#ffffff', backgroundColor: 'rgba(0,0,0,0.5)',
        //     padding: { left: 5, right: 5, top: 2, bottom: 2 }
        // }).setOrigin(0.5);
        const nameColor = hexToCss(ballColors[i]); // ← 공 색상을 CSS 문자열로
        const label = scene.add.text(sx, sy - 25, playerNicknames[i], {
            fontSize: '14px',
            fontFamily: 'Arial',
            color: nameColor,                                // ← 닉네임 색 적용
            backgroundColor: 'rgba(0,0,0,0.45)',
            padding: { left: 5, right: 5, top: 2, bottom: 2 },
            stroke: '#000000',                               // 가독성(선택)
            strokeThickness: 2
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

        // 2초 후 일괄 발사
        scene.time.delayedCall(2000, () => {
            player.setIgnoreGravity(false);
            player.setVelocity(0, -launchSpeed);
        });
    }

    // 장애물/골인지역/승리판정은 한 번만 생성
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

// 확장된 장애물 구성 (스피너, 왕복, 플링코만 유지 — 끈적/소용돌이/컨베이어 제거)
function createObstacles(scene) {
    scene.obstacles = [];

    // 존 레지스트리 (충돌 핸들러 호환을 위해 빈 컨테이너만 유지)
    scene.swirlMap    = new Map();  // (사용 안함)
    scene.conveyorMap = new Map();  // (사용 안함)
    scene.stickySet   = new Set();  // (사용 안함)
    scene.updraftMap  = new Map();  // 업드래프트는 결승역에서 사용
    scene.pegBodies   = new Set();  // 플링코 핀

    const MatterJS = Phaser.Physics.Matter.Matter;

    // ── 공용 텍스처 (필요한 것들만 보장)
    const ensureTextures = () => {
        // 플링코 핀
        if (!scene.textures.exists('pegDot')) {
            const g = scene.add.graphics();
            g.fillStyle(0x79c0ff, 1).fillCircle(6, 6, 6);
            g.lineStyle(2, 0xffffff, 0.9).strokeCircle(6, 6, 6);
            g.generateTexture('pegDot', 12, 12); g.destroy();
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
        // 팬(업드래프트)
        if (!scene.textures.exists('fan')) {
            const g = scene.add.graphics();
            const cx = 48, cy = 48;
            g.lineStyle(3, 0x7dd3fc, 0.9).strokeCircle(cx, cy, 44);
            g.fillStyle(0x7dd3fc, 0.9);
            const drawBlade = (angleDeg) => {
                const a = Phaser.Math.DegToRad(angleDeg);
                const cos = Math.cos(a), sin = Math.sin(a);
                const rot = (x, y) => ({ x: cx + x*cos - y*sin, y: cy + x*sin + y*cos });
                const p1 = rot(0, 0), p2 = rot(32, 8), p3 = rot(32, -8);
                g.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
            };
            drawBlade(0); drawBlade(90); drawBlade(180); drawBlade(270);
            g.generateTexture('fan', 96, 96); g.destroy();
        }
        // 바람 점
        if (!scene.textures.exists('windDot')) {
            const g = scene.add.graphics(); g.fillStyle(0xffffff,1).fillRect(0,0,2,2);
            g.generateTexture('windDot',2,2); g.destroy();
        }
    };
    ensureTextures();

    // ── 도우미: 단색 바 이미지
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

    // 플링코: 화면 폭 가득, 엣지 안전 여백 포함
    function createPegFieldFullWidth(y, rows = 7, rowGap = 70, margin = 24, r = 10, rest = 0.85) {
        const EDGE_PAD = BALL_RADIUS + r + 6; // 31px
        const left  = margin + EDGE_PAD;
        const right = config.width - margin - EDGE_PAD;
        const width = right - left;

        const targetGap = 90;
        const baseCols = Math.max(5, Math.round(width / targetGap) + 1);
        const gap = width / (baseCols - 1);

        for (let ry = 0; ry < rows; ry++) {
            const odd = (ry % 2) === 1;
            const startX = odd ? (left + gap / 2) : left;
            const count  = odd ? (baseCols - 1)   : baseCols;

            for (let i = 0; i < count; i++) {
                const x = startX + i * gap;
                const yy = y + ry * rowGap;
                if (x < left + r || x > right - r) continue;

                const body = scene.matter.add.circle(x, yy, r, {
                    isStatic: true, restitution: rest, friction: 0, frictionStatic: 0
                });
                scene.pegBodies.add(body);
                scene.obstacles.push(scene.add.image(x, yy, 'pegDot'));
            }
        }
    }

    // 업드래프트(피니시 구간, 펄스형)
    function createUpdraft(x, y, w, h, strength = 0.0040, onMs = 1100, offMs = 700, phaseMs = 0) {
        const body = scene.matter.add.rectangle(x, y, w, h, { isStatic: true, isSensor: true });

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

        scene.updraftMap.set(body, {
            strength, on: onMs, off: offMs, t0: scene.time.now + phaseMs,
            tile, fan, emitter, _emitting: true
        });

        if (!scene._updraftUpdater) {
            scene._updraftUpdater = () => {
                const now = scene.time.now;
                scene.updraftMap.forEach((z) => {
                    const T = (z.on || 1000) + (z.off || 1000);
                    const t = ((now - (z.t0 || 0)) % T + T) % T;
                    const active = t < (z.on || 1000);
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

    // ── 배치 ─────────────────────────────────────────────
    // 상단 스피너/왕복
    createSpinner(config.width/2, 900, 240, 0.10, 0xff8bd1, true);
    createMover  (config.width/2, 1200, 180, 180, 1700, 0x93c5fd);

    // 기존 플링코(첫 구역)
    createPegFieldFullWidth(1650, 7, 70, 24, 10, 0.85);

    // 🔥 중단 구역(빨간 박스) — 소용돌이/컨베이어/끈적임 제거하고 플링코로 꽉 채움
    // 2000부터 12행(간격 70) → 대략 2000~(2000+11*70=2770)까지 촘촘
    createPegFieldFullWidth(2200, 7, 70, 24, 10, 0.85);

    // 하단 스피너/왕복은 유지
    createSpinner (config.width/2, 3050, 280, -0.11, 0x34d399, true);
    createMover   (config.width/2 - 120, 3300, 140, 220, 1400, 0xfca5a5);
    createMover   (config.width/2 + 120, 3450, 140, -220, 1400, 0xfca5a5);

    // ── 피니시 업드래프트 (Y-레일 내부, 펄스형)
    createUpdraft(config.width/2 - 60, 3840, 120, 420, 0.0060, 1000, 700,   0);   // 왼쪽, 먼저 ON
    createUpdraft(config.width/2 + 60, 3840, 120, 420, 0.0060, 1000, 700, 500);   // 오른쪽, 반 박자 뒤 ON
}

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
        if (v.y > 0.8) {
            const mult = 2;     // ← 기존 0.55보다 더 크게 반전
            const floorVy = -15.0;  // ← 최소 위로 튀는 속도(더 세게)
            const targetVy = Math.min(floorVy, -v.y * mult);
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
                const scale = Phaser.Math.Clamp(vy * 0.03, 0, 0.12);
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

function createRestartCTA(scene, opts = {}) {
    const btnW = opts.w || 240;
    const btnH = opts.h || 64;
    const x = opts.x ?? (14 + btnW / 2);
    const y = opts.y ?? (config.height - 14 - btnH / 2);
    const label = opts.label || "🔁 다시하기";
    const onClick = opts.onClick || (() => window.location.reload());

    // HUD 레이어
    const hud = scene.add.layer().setDepth(9000);
    if (scene.minimapCamera) scene.minimapCamera.ignore(hud);

    // 평면 버튼 텍스처 생성 (필요 시 1회만)
    const key = `cta_flat_${btnW}x${btnH}`;
    if (!scene.textures.exists(key)) {
        const g = scene.add.graphics();
        const r = Math.min(18, btnH / 2);

        // 본체 + 얇은 외곽선 (네온/글로우 없음)
        g.fillStyle(0x1f2937, 0.95).fillRoundedRect(0, 0, btnW, btnH, r);
        g.lineStyle(2, 0x7dd3fc, 1).strokeRoundedRect(0.5, 0.5, btnW - 1, btnH - 1, r - 1);

        // 살짝 상단 하이라이트(아주 약하게)
        g.fillStyle(0xffffff, 0.05);
        g.fillRoundedRect(6, 6, btnW - 12, Math.max(10, btnH * 0.38), Math.max(4, r - 6));

        g.generateTexture(key, btnW, btnH);
        g.destroy();
    }

    // 버튼 이미지 (이 객체 하나만 인터랙티브)
    const bg = scene.add.image(x, y, key)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(9001)
        .setInteractive({ useHandCursor: true });  // PC에서 cursor:pointer

    // 텍스트
    const txt = scene.add.text(x, y, label, {
        fontFamily: "Arial Black",
        fontSize: "20px",
        color: "#e6faff",
        align: "center",
        stroke: "#00222a",
        strokeThickness: 3,
        shadow: { color: "#000000", blur: 2, fill: true, offsetY: 1 }
    })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(9002);

    hud.add([bg, txt]);

    // 모바일/PC 공통 눌림 애니메이션 & 클릭 처리
    let armed = false;
    const press = () => {
        if (armed) return;
        armed = true;
        scene.tweens.add({ targets: [bg, txt], scale: 0.96, duration: 80, ease: "Quad.easeOut" });
    };
    const release = (fire) => {
        if (!armed) return;
        armed = false;
        scene.tweens.add({
            targets: [bg, txt],
            scale: 1,
            duration: 120,
            ease: "Back.Out",
            onComplete: () => { if (fire) onClick(); }
        });
    };

    bg.on("pointerdown", () => press());
    bg.on("pointerup", () => release(true));
    bg.on("pointerupoutside", () => release(true)); // iOS 등에서 upoutside만 오는 케이스 대비
    bg.on("pointerout", () => release(false));
    bg.on("pointercancel", () => release(false));

    // 혹시 브라우저가 커서를 먹으면 강제로 지정
    if (bg.input) bg.input.cursor = 'pointer';

    return { hud, bg, txt };
}

// 우승 패널: 이름 자동-맞춤 + 플레이어 색 적용 + 다시하기는 좌하단
// 우승 패널: 가운데 정렬 + 이름 자동-맞춤 + 공색 적용
function showWinnerUI(scene, winnerName) {
    if (scene._winHudShown) return;
    scene._winHudShown = true;

    const winner = scene.winner;
    const nameColor = hexToCss(winner?.color || 0xffffff);

    // ── 우측 하단 우승 패널(더 크게, 중앙 정렬)
    const hud = scene.add.layer().setDepth(9000);
    if (scene.minimapCamera) scene.minimapCamera.ignore(hud);

    const margin = 14;
    const boxW = 420;         // ⬅ 더 키움
    const boxH = 190;
    const bx = config.width  - margin - boxW;
    const by = config.height - margin - boxH;

    const panel = scene.add.graphics().setScrollFactor(0);
    panel.fillStyle(0x101418, 0.92).fillRoundedRect(bx, by, boxW, boxH, 12);
    panel.lineStyle(2, 0x00d2ff, 1).strokeRoundedRect(bx, by, boxW, boxH, 12);
    hud.add(panel);

    const title = scene.add.text(bx + boxW / 2, by + 14, "🏆 1등", {
        fontSize: "20px", fontFamily: "Orbitron", color: "#a8e5ff", align: "center"
    }).setOrigin(0.5, 0).setScrollFactor(0);
    hud.add(title);

    const name = scene.add.text(bx + boxW / 2, by + 50, winnerName || "", {
        fontFamily: "Arial", color: nameColor, align: "center"
    })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setStroke("#000000", 5)
        .setShadow(0, 2, "#000000", 4, true, true);
    hud.add(name);

    const contentTop = title.y + title.height + 10;
    const nameBoxW = boxW - 36;
    const nameBoxH = (by + boxH - 16) - contentTop;

    const fitTextToBox = (txt, maxW, maxH, minPx = 22, maxPx = 96) => {
        let lo = minPx, hi = maxPx, best = minPx;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            txt.setFontSize(mid);
            if (txt.width <= maxW && txt.height <= maxH) { best = mid; lo = mid + 1; }
            else hi = mid - 1;
        }
        txt.setFontSize(best);
        txt.setX(bx + boxW / 2);
        txt.setY(contentTop + Math.max(0, (nameBoxH - txt.height) / 2));
    };
    fitTextToBox(name, nameBoxW, nameBoxH);

    scene.tweens.add({ targets: hud, alpha: { from: 0, to: 1 }, y: { from: 8, to: 0 }, duration: 180, ease: "Quad.easeOut" });

    // ── 좌하단: 새 예쁜 CTA 버튼
    createRestartCTA(scene, {
        w: 260, h: 68,
        x: 14 + 260 / 2,
        y: config.height - 14 - 68 / 2,
        label: "🔁 다시하기",
        onClick: () => window.location.reload()
    });

    // 축포 + 우승 공 하이라이트 유지
    playFullScreenConfetti(scene, 3000);
    if (winner?.body) {
        const pulse = scene.add.circle(winner.body.x, winner.body.y, 24, 0xffff00, 0.25).setDepth(5000);
        scene.tweens.add({ targets: pulse, scale: 4, alpha: 0, duration: 900, repeat: 1, onComplete: () => pulse.destroy() });
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