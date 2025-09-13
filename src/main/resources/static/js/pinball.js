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
let endConfettiParticles = null;
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
const UI_FONT = "Pretendard, 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, Arial";
const UI = {
    bg: '#0b1220',            // 씬 배경
    panelBg: 0x0f1729,        // 카드 바탕
    panelAlpha: 1.0,
    panelBorder: 0x334155,    // 카드 보더(슬레이트)
    accent: 0x60a5fa,         // 포인트(블루)
    accentSoft: 0x93c5fd,
    danger: 0xf87171,         // -
    success: 0x34d399,        // +
    text: '#f1f5f9',     // 거의 흰색
    subText: '#cbd5e1',  // 밝은 회색
};

function ensureDomContainerVisible() {
    const domC = getDomContainer();
    if (!domC) return;
    domC.style.display = '';          // ← display:none 해제
    domC.style.pointerEvents = 'auto';
    domC.style.zIndex = '2';
}

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
    this.cameras.main.setBounds(0, 0, config.width, 4000);
    this.matter.world.setBounds(0, 0, config.width, 4000);

    applyTheme(this);

    // ★ 재시작 시 같은 Scene 인스턴스 재사용 → 가드/업데이트 핸들러 초기화
    this._collisionsReady = false;
    if (this._updraftUpdater) {
        try { this.events.off('update', this._updraftUpdater); } catch(e) {}
    }
    this._updraftUpdater = null;
    this._winHudShown = false;

    // 충돌 핸들러 재등록
    registerCollisionHandlers(this);

    this.uiLayer = this.add.layer();
    this.uiLayer.setDepth(1000);

    this.matter.world.engine.enableSleeping = false;

    createGameSetupUI(this);
    this.cannon = this.add.image(config.width / 2, 4000, 'cannon').setOrigin(0.5, 1);

    this.input.manager.canvas.style.touchAction = 'none';

    window.__pinballScene = this;
    bindViewportReflow();
    onViewportChange();   // 최초 1회 정렬
}

// ─────────────────────────────────────────────────────────────
// 테마 적용: 배경 컬러 + 은은한 스타필드
function applyTheme(scene) {
    // 깊은 네이비 배경
    scene.cameras.main.setBackgroundColor(UI.bg);

    // 점 텍스처 보장
    if (!scene.textures.exists('starDot')) {
        const g = scene.add.graphics();
        g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
        g.generateTexture('starDot', 2, 2);
        g.destroy();
    }

    // 은은한 스타필드 (과한 네온/글로우 제거)
    scene._starfield?.destroy();
    const stars = scene.add.particles(0, 0, 'starDot', {
        x: { min: 0, max: scene.scale.width },
        y: { min: 0, max: scene.scale.height },
        lifespan: 8000,
        speedX: { min: -5, max: 5 },
        speedY: { min: 8, max: 18 },
        quantity: 1,
        frequency: 90,
        scale: { start: 1, end: 0.4 },
        alpha: { start: 0.30, end: 0 }
    });
    stars.setScrollFactor(0).setDepth(-10);
    scene._starfield = stars;
}

// UI 버튼 생성, 닉네임 입력, 참가자 수 조절 기능
function createGameSetupUI(scene) {
    const centerX = config.width / 2;

    // 레이어 초기화
    uiElements.uiContainer?.destroy();
    uiElements.uiContainer = scene.add.graphics().setScrollFactor(0);
    scene.uiLayer?.add(uiElements.uiContainer); // 패널은 레이어에

    // 타이틀
    uiElements.titleText?.destroy();
    uiElements.titleText = scene.add.text(centerX, 84, "🎮 게임 참가 설정", {
        fontSize: '28px', fontFamily: UI_FONT, color: UI.text, fontStyle: 'bold'
    }).setOrigin(0.5).setScrollFactor(0);
    scene.uiLayer?.add(uiElements.titleText); // ⭐ 레이어에 올리기

    // 참가자 레이블
    uiElements.participantLabel?.destroy();
    uiElements.participantLabel = scene.add.text(centerX - 120, 155, "참가자 수", {
        fontSize: '18px', fontFamily: UI_FONT, color: UI.subText
    }).setOrigin(0.5).setScrollFactor(0);
    scene.uiLayer?.add(uiElements.participantLabel); // ⭐

    // 참가자 숫자 Pill
    uiElements.participantCountText?.destroy();
    uiElements.participantCountText = scene.add.text(centerX, 155, playerCount, {
        fontSize: '22px', fontFamily: UI_FONT, color: '#0b1220',
        backgroundColor: Phaser.Display.Color.IntegerToColor(UI.accent).rgba,
        padding: { left: 12, right: 12, top: 6, bottom: 6 }
    }).setOrigin(0.5).setScrollFactor(0);
    scene.uiLayer?.add(uiElements.participantCountText); // ⭐

    // + / - 버튼 (이 함수는 내부에서 레이어에 올림)
    uiElements.increaseButton?.destroy();
    uiElements.decreaseButton?.destroy();
    uiElements.increaseButton = createStyledButton(
        scene, centerX + 100, 155, "＋", () => changePlayerCount.call(scene, 1), 48, UI.success
    );
    uiElements.decreaseButton = createStyledButton(
        scene, centerX + 160, 155, "－", () => changePlayerCount.call(scene, -1), 48, UI.danger
    );

    // 닉네임 입력 열기 버튼 (내부에서 레이어에 올림)
    uiElements.nicknameButton?.destroy();
    uiElements.nicknameButton = createStyledButton(
        scene, centerX, 214, "✍ 닉네임 입력하기", () => generateNicknameInputs(scene), 280, UI.accent
    );

    // 시작 버튼 (하단 정렬, 내부에서 레이어에 올림)
    uiElements.startGameButton?.destroy();
    uiElements.startGameButton = createStyledButton(
        scene, centerX, 0, "🚀 게임 시작", () => startGame(scene), 320, 0xf43f5e
    );
    uiElements.startGameButton.setVisible(false);

    // 닉네임 프레임/타이틀
    uiElements.nameFrame?.destroy();
    uiElements.nameFrame = scene.add.graphics().setScrollFactor(0).setVisible(false);
    scene.uiLayer?.add(uiElements.nameFrame); // ⭐

    uiElements.nameTitle?.destroy();
    uiElements.nameTitle = scene.add.text(centerX, 0,
        `닉네임 입력 (최대 ${nickMaxLength}자) - 변경 없이 시작 가능`, {
            fontSize: '16px', fontFamily: UI_FONT, color: UI.subText
        }
    ).setOrigin(0.5, 1).setScrollFactor(0).setVisible(false);
    scene.uiLayer?.add(uiElements.nameTitle); // ⭐

    // 최초 패널 드로우
    resizeSetupPanel(scene, { rows: 0, frameH: 0 });
}

// rows에 맞춰 파란 패널 크기와 요소 배치 업데이트
function resizeSetupPanel(scene, { rows, frameH }) {
    const centerX = config.width / 2;
    const baseW = 820;
    const baseX = centerX - baseW / 2;
    const topY  = 46;

    let panelH = 560;
    if (rows > 0) {
        const topSpace = 252 - topY; // 타이틀/스테퍼 영역
        const bottomSpace = 110;      // 시작 버튼 영역
        panelH = Math.max(560, topSpace + frameH + bottomSpace);
    }

    // 카드(글래스 느낌, 네온 아님)
    uiElements.uiContainer.clear();
    uiElements.uiContainer
        .fillStyle(UI.panelBg, UI.panelAlpha)
        .fillRoundedRect(baseX, topY, baseW, panelH, 18)
        .lineStyle(2, UI.panelBorder, 1)
        .strokeRoundedRect(baseX, topY, baseW, panelH, 18);

    // 시작 버튼 하단 정렬
    uiElements.startGameButton.setY(topY + panelH - 58);
}

// 버튼 생성 (반복 클릭 가능 / onClick은 pointerup 때마다 실행)
function createStyledButton(scene, cx, cy, label, onClick, width = 120, color = UI.accent) {
    const h = 44;
    const key = `btn_${width}_${h}_${color}`;
    if (!scene.textures.exists(key)) {
        const g = scene.add.graphics();
        g.fillStyle(color, 1).fillRoundedRect(0, 0, width, h, 12);
        g.fillStyle(0xffffff, 0.06).fillRoundedRect(6, 6, width - 12, Math.max(10, h * 0.38), 8);
        const border = darker(color, 0.68);
        g.lineStyle(2, border, 1).strokeRoundedRect(0.5, 0.5, width - 1, h - 1, 11);
        g.generateTexture(key, width, h);
        g.destroy();
    }

    // 1) 시각 요소(입력 없음)
    const visuals = scene.add.container(cx - width/2, cy - h/2).setScrollFactor(0);
    const bg  = scene.add.image(width/2, h/2, key).setOrigin(0.5);
    const txt = scene.add.text(width/2, h/2, label, {
        fontSize: '18px', fontFamily: UI_FONT, color: '#0b1220', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5);
    visuals.add([bg, txt]);
    if (scene.uiLayer) scene.uiLayer.add(visuals);

    // 2) 정확한 히트 박스(컨테이너와 분리)
    const hit = scene.add.rectangle(cx, cy, width, h, 0x000000, 0.001)
        .setOrigin(0.5).setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
    if (scene.uiLayer) scene.uiLayer.add(hit);
    if (hit.input) hit.input.cursor = 'pointer';

    // 3) 마이크로 인터랙션 (항상 클릭마다 실행)
    const press   = () => scene.tweens.add({ targets: [bg, txt], scale: 0.98, duration: 80, ease: 'Quad.easeOut' });
    const release = (fire) => scene.tweens.add({
        targets: [bg, txt], scale: 1, duration: 120, ease: 'Back.Out',
        onComplete: () => { if (fire) onClick?.(); }
    });

    hit.on('pointerdown',     press);
    hit.on('pointerup',        () => release(true));   // ← 클릭마다 onClick 실행
    hit.on('pointerupoutside', () => release(false));
    hit.on('pointerout',       () => release(false));
    hit.on('pointercancel',    () => release(false));

    // 4) 체이닝 API
    const api = {
        setDepth: (d) => { visuals.setDepth(d); hit.setDepth(d + 0.1); return api; },
        setVisible: (v) => { visuals.setVisible(v); hit.setVisible(v); return api; },
        setPosition: (x, y) => { visuals.setPosition(x - width/2, y - h/2); hit.setPosition(x, y); return api; },
        setX: (x) => { visuals.setX(x - width/2); hit.setX(x); return api; },
        setY: (y) => { visuals.setY(y - h/2); hit.setY(y); return api; }
    };
    return Object.assign(api, { _visuals: visuals, _hit: hit });
}

function generateNicknameInputsNative(scene) {
    ensureDomContainerVisible();
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

    // 프레임 (노란 네온 제거 → 미니멀)
    uiElements.nameFrame.setVisible(true).clear()
        .fillStyle(UI.panelBg, 0.22).fillRoundedRect(frameX, frameY, frameW, frameH, 12)
        .lineStyle(1.5, UI.panelBorder, 1).strokeRoundedRect(frameX, frameY, frameW, frameH, 12);

    uiElements.nameTitle.setVisible(true).setPosition(centerX, frameY - 10);

    const gridW = cols * cellW + (cols - 1)*gap;
    const startX = frameX + (frameW - gridW)/2 + cellW/2;
    const startY = frameY + padding + cellH/2;

    const seed = Array.isArray(playerNicknames) ? playerNicknames.slice() : [];
    const gc = document.getElementById('game-container');
    const overlay = document.createElement('div');
    overlay.id = 'name-overlay';
    gc.appendChild(overlay);

    const pxX = v => Math.round(offX + v * sx);
    const pxY = v => Math.round(offY + v * sy);

    for (let i = 0; i < playerCount; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const baseX = startX + c*(cellW + gap);
        const baseY = startY + r*(cellH + gap);

        const cell = document.createElement('div');
        cell.className = 'cell';
        Object.assign(cell.style, { position:'absolute', left: pxX(baseX)+'px', top: pxY(baseY)+'px' });

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = nickMaxLength;
        input.placeholder = `P${i+1}`;
        input.value = seed[i] || '';

        const w = Math.round(cellW * sx);
        const h = Math.round(cellH * sy);
        Object.assign(input.style, {
            width: w+'px', height: h+'px', fontSize: Math.max(12, Math.round(16*Math.min(sx, sy)))+'px',
            lineHeight: h+'px', textAlign:'center',
            color: UI.text, background: 'rgba(15,23,42,0.85)',
            border: `1px solid ${Phaser.Display.Color.IntegerToColor(UI.panelBorder).rgba}`,
            borderRadius: '10px', outline: 'none',
            boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 2px transparent',
            transition: 'box-shadow .15s ease'
        });
        input.onfocus = () => { input.style.boxShadow = `0 0 0 2px ${Phaser.Display.Color.IntegerToColor(UI.accentSoft).rgba}`; };
        input.onblur  = () => { input.style.boxShadow = '0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 2px transparent'; };

        input.setAttribute('inputmode', 'text');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('autocorrect', 'off');

        input.addEventListener('pointerdown', () => {
            __typingLock = true;
            setTimeout(() => { try { input.focus({ preventScroll: true }); } catch(e){} }, 0);
        }, { passive: true });
        input.addEventListener('focus', () => { __typingLock = true; }, { passive:true });
        input.addEventListener('blur', () => { __typingLock = false; setTimeout(() => onViewportChange(true), 60); });

        ['touchstart','touchmove','touchend','pointerup','mousedown','mouseup','click']
            .forEach(evt => input.addEventListener(evt, e => e.stopPropagation(), { passive:false }));

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

    ensureDomContainerVisible();
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
        .fillStyle(UI.panelBg, 0.22).fillRoundedRect(frameX, frameY, frameW, frameH, 12)
        .lineStyle(1.5, UI.panelBorder, 1).strokeRoundedRect(frameX, frameY, frameW, frameH, 12);

    uiElements.nameTitle.setVisible(true).setPosition(centerX, frameY - 10);

    const gridW = cols * cellW + (cols - 1)*gap;
    const startX = frameX + (frameW - gridW)/2 + cellW/2;
    const startY = frameY + padding + cellH/2;

    const keep = Array.isArray(uiElements.nameInputs) ? uiElements.nameInputs.map(i => (i?.text || '').trim()) : [];
    const seed = keep.some(Boolean) ? keep : (Array.isArray(playerNicknames) ? playerNicknames.slice() : []);

    for (let i = 0; i < playerCount; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const x = Math.round((startX + c * (cellW + gap)) * sx);
        const y = Math.round((startY + r * (cellH + gap)) * sy);
        const w = Math.max(40, Math.round(cellW * sx));
        const h = Math.max(24, Math.round(cellH * sy));
        const fontPx = Math.max(12, Math.round(16 * Math.min(sx, sy)));
        const padPx  = Math.max(2, Math.round(6 * Math.min(sx, sy)));

        const input = scene.add.rexInputText(x, y, w, h, {
            type: 'text', text: (seed[i] || ''), fontSize: `${fontPx}px`,
            fontFamily: UI_FONT, color: UI.text, backgroundColor: 'rgba(15,23,42,0.85)',
            border: `1px solid ${Phaser.Display.Color.IntegerToColor(UI.panelBorder).rgba}`,
            align: 'center', padding: padPx, placeholder: `P${i+1}`, selectAll: true, maxLength: nickMaxLength
        }).setOrigin(0.5).setScrollFactor(0).setDepth(22);

        // DOM 스타일 미세 조정
        if (input.node) {
            const n = input.node;
            n.style.borderRadius = '10px';
            n.style.outline = 'none';
            n.style.boxShadow = '0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 2px transparent';
            n.style.transition = 'box-shadow .15s ease';
            n.addEventListener('focus', () => { n.style.boxShadow = `0 0 0 2px ${Phaser.Display.Color.IntegerToColor(UI.accentSoft).rgba}`; }, { passive: true });
            n.addEventListener('blur',  () => { n.style.boxShadow = '0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 2px transparent'; });
            wireKeyboardGuard(n);
        }

        if (i === 0) { normalizeDomContainerFrom(input); ensureDomContainerVisible(); }

        scene.uiLayer?.add(input);
        uiElements.nameInputs.push(input);
    }

    uiElements.startGameButton.setVisible(true);
    resizeSetupPanel(scene, { rows, frameH });
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

    // ▶ 숨김 상태였다면 반드시 다시 표시
    domC.classList.add('dom-container');
    __domContainer = domC;
    uiElements.domContainer = domC;

    // ★ display 해제 + 활성화
    domC.style.display = '';
    domC.style.pointerEvents = 'auto';
    domC.style.zIndex = '2';

    Object.assign(domC.style, {
        position: 'absolute',
        left: '0px',
        top: '0px',
        right: '0px',
        bottom: '0px',
        width: '100%',
        height: '100%',
        transform: 'none',
        WebkitTransform: 'none'
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
    // ✅ 중복 시작 방지
    if (scene._starting || scene._gameStarted) return;
    scene._starting = true;

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

    // 길이/공백 방어
    if (!Array.isArray(playerNicknames) || playerNicknames.length !== playerCount) {
        playerNicknames = Array.from({ length: playerCount }, (_, i) =>
            safeName(playerNicknames?.[i], i)
        );
    }

    // ─────────────────────────────────────────────────────
    // 설정 UI/DOM 완전 정리
    // ─────────────────────────────────────────────────────
    overlay?.remove();
    scene.uiLayer?.destroy();
    uiElements = {};

    try {
        const domC = getDomContainer();
        if (domC) {
            try { unlockDomContainer(); } catch(e) {}
            domC.style.display = 'none';
            domC.style.pointerEvents = 'none';
            domC.style.zIndex = '0';
        }
    } catch (e) {}

    __typingLock = false;
    _kbLocked = false;

    // ─────────────────────────────────────────────────────
    // 이하 기존 게임 시작 로직
    // ─────────────────────────────────────────────────────
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

        const nameColor = hexToCss(ballColors[i]);
        const displayName = playerNicknames[i];

        // 텍스트
        const nameText = scene.add.text(0, 0, displayName, {
            fontSize: '13px',
            fontFamily: UI_FONT,
            fontStyle: '600',
            color: '#e2e8f0',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        // 배지
        const padX = 14, padY = 6;
        const pillW = Math.ceil(nameText.width) + padX * 2;
        const pillH = Math.max(22, Math.ceil(nameText.height) + padY);
        const pillKey = `pill_${i}_${pillW}x${pillH}`;
        makePillTexture(scene, pillKey, pillW, pillH, playersColor = ballColors[i], 0x0f1729, 0.78);
        const pillImg = scene.add.image(0, 0, pillKey).setOrigin(0.5);

        // 컨테이너
        const label = scene.add.container(sx, sy - 24, [pillImg, nameText]);
        label.setDepth(500);

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

    // ✅ 시작 완료 마킹
    scene._starting = false;
    scene._gameStarted = true;
}

// 둥근 배지 텍스처 생성(필 + 테두리)
function makePillTexture(scene, key, w, h, strokeColor = 0xffffff, fillColor = 0x0f1729, fillA = 0.78) {
    if (scene.textures.exists(key)) return;
    const r = Math.min(12, Math.floor(h / 2));
    const g = scene.add.graphics();
    g.fillStyle(fillColor, fillA).fillRoundedRect(0, 0, w, h, r);
    g.lineStyle(2, strokeColor, 0.95).strokeRoundedRect(0.5, 0.5, w - 1, h - 1, r - 1);
    g.generateTexture(key, w, h);
    g.destroy();
}


function createMinimap(scene) {
    // 기존 미니맵이 있으면 안전하게 제거
    if (scene.minimapCamera) {
        try { scene.cameras.remove(scene.minimapCamera, true); }
        catch(e) { try { scene.minimapCamera.destroy(true); } catch(_) {} }
        scene.minimapCamera = null;
    }
    if (scene.minimapBorder) { try { scene.minimapBorder.destroy(); } catch(_) {} }

    const minimapX = 3, minimapY = 3;
    const minimapWidth = 194, minimapHeight = 594;
    const minimapZoom = minimapWidth / config.width;

    scene.minimapCamera = scene.cameras.add(minimapX, minimapY, minimapWidth, minimapHeight)
        .setZoom(minimapZoom)
        .setBackgroundColor(0x000000)
        .setBounds(0, 0, config.width, 4000);

    scene.minimapBorder = scene.add.graphics();
    scene.minimapBorder.lineStyle(3, 0xffffff, 1);
    scene.minimapBorder.strokeRect(minimapX + 0.5, minimapY + 0.5, minimapWidth - 1, minimapHeight - 1);
    scene.minimapBorder.setScrollFactor(0);
    scene.minimapBorder.setDepth(9999);

    const ignoreList = [];
    if (scene.uiLayer) ignoreList.push(scene.uiLayer);
    if (scene.lbLayer) ignoreList.push(scene.lbLayer);
    if (scene.minimapBorder) ignoreList.push(scene.minimapBorder);
    scene.minimapCamera.ignore(ignoreList);
}

// 확장된 장애물 구성 (스피너, 왕복, 플링코 + 좌/우 가이드 디플렉터 2구간)
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

    // ── 도우미: 미끄러지는 가이드 디플렉터
    function createDeflector(x, y, width, angleDeg, color = 0xfda4af, restitution = 0.35, thickness = 18) {
        const key = `deflect_${width}_${thickness}_${color.toString(16)}`;
        makeSolidTexture(scene, key, width, thickness, color, 1);
        const img = scene.matter.add.image(x, y, key, null, {
            isStatic: true,
            restitution,           // 너무 튀지 않게
            friction: 0.02,
            frictionStatic: 0.02
        });
        img.setOrigin(0.5).setAngle(angleDeg);
        scene.obstacles.push(img);
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

    // 🔻 1구간(첫 플링코 앞) 디플렉터
    (function placeFirstPegDeflectors(){
        const y = 1520;               // 첫 플링코(1650) 직전
        const inset = 90;             // 좌/우 가장자리에서 안쪽으로
        const width = 220;            // 디플렉터 길이
        createDeflector(inset,                 y, width,  +24, 0xfda4af, 0.35); // 좌측: \ 방향
        createDeflector(config.width - inset,  y, width,  -24, 0xfda4af, 0.35); // 우측: / 방향
    })();

    // 첫 번째 플링코
    createPegFieldFullWidth(1650, 7, 70, 24, 10, 0.85);

    // 🔻 2구간(두 번째 플링코 앞) 디플렉터 — 요청 추가
    (function placeSecondPegTopDeflectors(){
        const y = 2120;               // 두 번째 플링코(2200) 직전
        const inset = 90;
        const width = 220;
        createDeflector(inset,                 y, width,  +24, 0xfda4af, 0.35);
        createDeflector(config.width - inset,  y, width,  -24, 0xfda4af, 0.35);
    })();

    // 두 번째 플링코
    createPegFieldFullWidth(2200, 7, 70, 24, 10, 0.85);

    // 하단 스피너/왕복
    createSpinner (config.width/2, 3050, 280, -0.11, 0x34d399, true);
    createMover   (config.width/2 - 120, 3300, 140, 220, 1400, 0xfca5a5);
    createMover   (config.width/2 + 120, 3450, 140, -220, 1400, 0xfca5a5);

    // 피니시 업드래프트 (Y-레일 내부, 펄스형)
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

    // ✅ 전원 골인했으면 엔드 메시지 + 무한 컨페티
    if (scene.finishOrder.length === players.length) {
        showAllFinishedMessage(scene);  // ← 아래 새 함수
    }
}

function showAllFinishedMessage(scene) {
    if (scene._raceOverLayer) return;           // 가드

    // 1등 정보
    const winner   = scene.winner || scene.finishOrder?.[0];
    const winName  = winner?.name || '???';
    const nameHex  = winner?.color || 0xffffff;
    const nameCss  = '#' + (nameHex >>> 0).toString(16).padStart(6, '0');

    // 레이어(고정 HUD)
    const layer = scene.add.layer().setDepth(8500);
    if (scene.minimapCamera) scene.minimapCamera.ignore(layer);
    scene._raceOverLayer = layer;

    // 폰트 크기 자동(폭에 맞춰 살짝 조절)
    const base = 44;
    const fontPx = Math.max(32, Math.min(52, Math.round(base * (config.width / 1000))));

    // 1줄: "1등은 " + [닉네임] + "님"
    const styleWhite = { fontFamily: UI_FONT, fontStyle: '700', fontSize: `${fontPx}px`,
        color: '#ffffff', stroke: '#000', strokeThickness: 6,
        shadow: { color:'#000', blur:6, fill:true, offsetY:2 } };
    const styleName  = { ...styleWhite, color: nameCss, fontFamily: "Arial Black, system-ui" };

    const pre  = scene.add.text(0, 0, '1등은 ', styleWhite).setOrigin(0, 0.5).setScrollFactor(0);
    const name = scene.add.text(0, 0, winName, styleName ).setOrigin(0, 0.5).setScrollFactor(0);
    const suf  = scene.add.text(0, 0, '님',   styleWhite).setOrigin(0, 0.5).setScrollFactor(0);

    // 2줄: "축하드립니다~!"
    const sub = scene.add.text(0, 0, '축하드립니다~!', {
        ...styleWhite, fontSize: `${Math.round(fontPx * 0.9)}px`
    }).setOrigin(0.5, 0.5).setScrollFactor(0);

    // 두 줄을 가운데 정렬 배치
    const gapY = 18;
    const totalW = pre.width + name.width + suf.width;
    const cx = Math.round(config.width / 2);
    const cy = Math.round(config.height / 2);

    pre .setPosition(cx - totalW / 2,           cy - gapY);
    name.setPosition(pre.x + pre.width,         cy - gapY);
    suf .setPosition(name.x + name.width,       cy - gapY);
    sub .setPosition(cx,                        cy + Math.max(14, fontPx * 0.6));

    layer.add([pre, name, suf, sub]);

    // ✨ 무한 컨페티 시작 (다시하기 전까지 유지)
    playFullScreenConfettiForever(scene);
}

function playFullScreenConfettiForever(scene) {
    // 텍스처 보장(기존 playFullScreenConfetti와 동일)
    if (!scene.textures.exists('confetti')) {
        const g = scene.add.graphics();
        g.fillStyle(0xffffff).fillRect(0, 0, 8, 8);
        g.generateTexture('confetti', 8, 8);
        g.destroy();
    }

    // 이미 돌고 있으면 스킵
    if (scene._confettiForever && !scene._confettiForever.destroyed) return scene._confettiForever;

    const emitter = scene.add.particles(0, 0, 'confetti', {
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
    emitter.setScrollFactor(0).setDepth(9050);
    if (scene.minimapCamera) scene.minimapCamera.ignore(emitter);

    scene._confettiForever = emitter; // ★ softRestart에서 정리
    return emitter;
}

function createLeaderboard(scene) {
    // 기존 레이어 정리 후 새로 생성 (순위판은 높은 depth 유지)
    scene.lbLayer?.destroy();
    const layer = scene.add.layer().setDepth(8000);
    scene.lbLayer = layer;
    if (scene.minimapCamera) scene.minimapCamera.ignore(layer);

    // 우측에 붙여서 표시(완전 투명)
    const rightPad = 8;
    scene._lbRightX   = config.width - rightPad;
    scene._lbLineH    = 22;
    scene._lbNameMaxW = 160;

    // 제목 텍스트
    const title = scene.add.text(scene._lbRightX, 8, "📜 순위", {
        fontSize: '16px',
        fontFamily: UI_FONT,
        color: '#e2e8f0',
        fontStyle: '700',
        stroke: '#000000',
        strokeThickness: 3,
        shadow: { color: '#000', blur: 2, fill: true, offsetY: 1 },
        align: 'right'
    })
        .setOrigin(1, 0)   // 오른쪽 정렬
        .setScrollFactor(0);
    layer.add(title);

    // 👉 제목과 첫 줄 사이 여백을 확보
    const gapBelowTitle = 10;
    scene._lbStartY = title.y + title.height + gapBelowTitle;

    scene.lbItems = [];
}

function rankColor(rank){
    if (rank === 1) return '#facc15'; // gold
    if (rank === 2) return '#cbd5e1'; // silver-ish
    if (rank === 3) return '#f97316'; // bronze-ish
    return '#94a3b8';                 // others
}

function updateLeaderboard(scene) {
    if (!scene.lbLayer) return;

    // 완료자 우선(순위 오름차순) → 진행중은 y가 큰 순서(결승에 가까움)
    const sorted = players.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.rank - b.rank;
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        return (b.body.y - a.body.y);
    });

    const iconFor = (rank, finished) => {
        if (!finished) return " ";
        if (rank === 1) return "🥇";
        if (rank === 2) return "🥈";
        if (rank === 3) return "🥉";
        return "🏆";
    };

    // 닉네임이 너무 길면 … 처리
    const ellipsize = (txtObj, str, maxW) => {
        txtObj.setText(str);
        if (txtObj.width <= maxW) return str;
        let lo = 1, hi = str.length, best = 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            txtObj.setText(str.slice(0, mid) + "…");
            if (txtObj.width <= maxW) { best = mid; lo = mid + 1; }
            else hi = mid - 1;
        }
        const out = str.slice(0, best) + "…";
        txtObj.setText(out);
        return out;
    };

    const rightX   = scene._lbRightX;
    const startY   = scene._lbStartY;
    const lineH    = scene._lbLineH;
    const nameMaxW = scene._lbNameMaxW;

    // 간격(요청: 이름↔등수 간격 더 띄움)
    const GAP_ICON_NAME = 8;
    const GAP_NAME_RANK = 16;

    const makeOrUpdate = (i, p, rank) => {
        const yTop = startY + i * lineH;

        let line = scene.lbItems[i];
        if (!line) {
            const iconTx = scene.add.text(rightX, yTop, "", {
                fontSize: '14px', fontFamily: UI_FONT, color: '#ffffff',
                stroke: '#000000', strokeThickness: 3
            }).setOrigin(1, 0).setScrollFactor(0);

            const nameTx = scene.add.text(rightX, yTop, "", {
                fontSize: '14px', fontFamily: UI_FONT, color: '#e2e8f0',
                stroke: '#000000', strokeThickness: 3
            }).setOrigin(1, 0).setScrollFactor(0);

            const rankTx = scene.add.text(rightX, yTop, "", {
                fontSize: '14px', fontFamily: UI_FONT, color: '#94a3b8',
                stroke: '#000000', strokeThickness: 3
            }).setOrigin(1, 0).setScrollFactor(0);

            scene.lbLayer.add(iconTx);
            scene.lbLayer.add(nameTx);
            scene.lbLayer.add(rankTx);
            line = scene.lbItems[i] = { iconTx, nameTx, rankTx };
        }

        // 아이콘
        line.iconTx.setText(iconFor(rank, !!p.finished));

        // 닉네임 색을 공 색으로
        const nameStr = p.name || p.label?.text || `P${i+1}`;
        line.nameTx.setColor(hexToCss(p.color || 0xffffff));
        ellipsize(line.nameTx, nameStr, nameMaxW);

        // "N등"
        line.rankTx.setText(`${rank}등`).setColor(rankColor(rank));

        // 오른쪽 정렬: [아이콘] [닉네임] [N등]
        const xRank = rightX;
        const xName = xRank - line.rankTx.width - GAP_NAME_RANK;
        const xIcon = xName - line.nameTx.width - GAP_ICON_NAME;

        line.rankTx.setPosition(xRank, yTop);
        line.nameTx.setPosition(xName, yTop);
        line.iconTx.setPosition(xIcon, yTop);

        line.iconTx.setVisible(true);
        line.nameTx.setVisible(true);
        line.rankTx.setVisible(true);
    };

    for (let i = 0; i < sorted.length; i++) {
        const p = sorted[i];
        const rank = p.finished ? p.rank : (i + 1);
        makeOrUpdate(i, p, rank);
    }

    // 남는 라인 정리
    for (let j = sorted.length; j < (scene.lbItems?.length || 0); j++) {
        const l = scene.lbItems[j];
        l.iconTx.destroy(); l.nameTx.destroy(); l.rankTx.destroy();
    }
    scene.lbItems.length = sorted.length;
}

function createRestartCTA(scene, opts = {}) {
    const btnW = opts.w || 240;
    const btnH = opts.h || 64;           // ← 호출부에서 96, 110 등으로 키우면 박스/클릭영역 같이 커짐
    const x = opts.x ?? (14 + btnW / 2);
    const y = opts.y ?? (config.height - 14 - btnH / 2);
    const label = opts.label || "🔁 다시하기";
    const onClick = opts.onClick || (() => softRestart(scene));

    const hud = scene.add.layer().setDepth(9000);
    if (scene.minimapCamera) scene.minimapCamera.ignore(hud);

    const key = `cta_flat_${btnW}x${btnH}`;
    if (!scene.textures.exists(key)) {
        const g = scene.add.graphics();
        const r = Math.min(18, btnH / 2);
        g.fillStyle(0x1f2937, 0.95).fillRoundedRect(0, 0, btnW, btnH, r);
        g.lineStyle(2, 0x7dd3fc, 1).strokeRoundedRect(0.5, 0.5, btnW - 1, btnH - 1, r - 1);
        g.fillStyle(0xffffff, 0.05);
        g.fillRoundedRect(6, 6, btnW - 12, Math.max(10, btnH * 0.38), Math.max(4, r - 6));
        g.generateTexture(key, btnW, btnH); g.destroy();
    }

    const bg  = scene.add.image(x, y, key).setOrigin(0.5).setScrollFactor(0).setDepth(9001);
    const txt = scene.add.text(x, y, label, {
        fontFamily: "Arial Black", fontSize: "20px", color: "#e6faff",
        align: "center", stroke: "#00222a", strokeThickness: 3,
        shadow: { color: "#000000", blur: 2, fill: true, offsetY: 1 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9002);

    hud.add([bg, txt]);

    const hit = scene.add.rectangle(x, y, btnW, btnH, 0x000000, 0.001)
        .setOrigin(0.5).setScrollFactor(0).setDepth(9003)
        .setInteractive({ useHandCursor: true });

    if (hit.input) {
        hit.input.cursor = 'pointer';
        hit.input.alwaysEnabled = true;
    }

    let fired = false;
    const press   = () => scene.tweens.add({ targets: [bg, txt], scale: 0.96, duration: 80, ease: "Quad.easeOut" });
    const release = (fire) => scene.tweens.add({
        targets: [bg, txt], scale: 1, duration: 120, ease: "Back.Out",
        onComplete: () => { if (fire && !fired) { fired = true; onClick(); } }
    });

    hit.on("pointerdown",     () => press());
    hit.on("pointerup",        () => release(true));   // ✅ 한 번만 실행
    hit.on("pointerupoutside", () => release(false));
    hit.on("pointerout",       () => release(false));
    hit.on("pointercancel",    () => release(false));

    return { hud, bg, txt, hit };
}

function softRestart(scene){
    // 1) 입력 오버레이/DOM 컨테이너 완전 제거/숨김
    try {
        document.getElementById('name-overlay')?.remove();
        getDomContainer()?.style.setProperty('display','none','important');
        getDomContainer()?.style.setProperty('pointer-events','none','important');
        const domC = getDomContainer();
        if (domC) {
            domC.style.display = 'none';
            domC.style.pointerEvents = 'none';
            domC.style.zIndex = '0';
        }
    } catch (e) {}

    // 2) 파티클/트윈/타이머/리스너 정리
    try { scene.tweens.killAll(); } catch(e) {}
    try { scene.time.removeAllEvents(); } catch(e) {}

    // ★ 업드래프트 업데이트 루프 해제
    if (scene._updraftUpdater) {
        try { scene.events.off('update', scene._updraftUpdater); } catch(e) {}
        scene._updraftUpdater = null;
    }

    // ★ Matter 충돌 리스너 전부 제거 (이후 재등록할 것)
    try { scene.matter.world.removeAllListeners?.(); } catch(e) {}

    // 3) HUD / 미니맵 안전 제거(가끔 남는 참조 방지)
    try {
        scene.lbLayer?.destroy(); scene.lbLayer = null;
        scene.minimapBorder?.destroy(); scene.minimapBorder = null;
        if (scene.minimapCamera) { try { scene.cameras.remove(scene.minimapCamera, true); } catch(_) {}
            scene.minimapCamera = null; }
    } catch(e) {}

    // ✅ 추가 정리: 엔딩 레이어/무한 컨페티
    try {
        if (scene._raceOverLayer) { scene._raceOverLayer.destroy(); scene._raceOverLayer = null; }
        if (scene._confettiForever) {
            scene._confettiForever.stop();
            scene._confettiForever.destroy();
            scene._confettiForever = null;
        }
    } catch(e) {}

    // 4) 씬 가드 리셋
    scene._collisionsReady = false;
    scene._winHudShown = false;

    // 5) 글로벌/런타임 상태 초기화
    resetGlobals(scene);

    // 6) 씬 재시작
    scene.scene.restart();
}

function resetGlobals(scene){
    uiElements = {};
    players = [];
    playerNicknames = [];
    lastWinner = null;
    finishZone = null;
    minimap = null;

    __typingLock = false;
    _kbLocked = false;

    // ✅ 시작 플래그 초기화
    if (scene) {
        scene._starting = false;
        scene._gameStarted = false;
        scene._collisionsReady = false;
        if (scene._updraftUpdater) {
            try { scene.events.off('update', scene._updraftUpdater); } catch(e) {}
        }
        scene._updraftUpdater = null;
        scene._winHudShown = false;
        scene._raceEndShown = false;
    }

    // 배경음은 유지
    window.__pinballScene = null;
}

// 모든 플레이어가 결승점에 도달했을 때 중앙에 고정으로 띄우는 축하 문구
// 모든 플레이어가 결승점에 도달했을 때 중앙에 고정으로 띄우는 축하 문구
function showRaceEndUI(scene) {
    if (scene._raceEndShown) return;
    scene._raceEndShown = true;

    const top = scene.finishOrder?.[0];
    const name = top?.name || "???";
    const nameColor = hexToCss(top?.color || 0xffffff);

    const layer = scene.add.layer().setDepth(8500);
    if (scene.minimapCamera) scene.minimapCamera.ignore(layer);

    // ====== 스타일 튜닝값 ======
    const F1_INIT = 46;   // 1줄 기본 폰트(px)
    const FNAME   = 50;   // 닉네임 기본 폰트(px)
    const F2_INIT = 36;   // 2줄 기본 폰트(px)
    const GAP_X   = 10;   // "1등은" ↔ 닉네임 ↔ "님" 가로 간격
    const GAP_Y   = 12;   // 1·2줄 세로 간격
    const MAX_W   = Math.floor(config.width * 0.92);
    // ==========================

    const baseStyle = {
        fontFamily: "Pretendard, 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, Arial",
        color: "#ffffff",
        fontStyle: "900",
        stroke: "#000000",
        strokeThickness: 6,
        shadow: { color: "#000000", blur: 8, fill: true, offsetY: 2 },
        align: "center"
    };

    // 1줄: "1등은 " + 닉네임(색상) + "님"
    const tLeft  = scene.add.text(0, 0, "1등은 ", { ...baseStyle, fontSize: `${F1_INIT}px` })
        .setOrigin(0.5, 1).setScrollFactor(0);
    const tName  = scene.add.text(0, 0, name, { ...baseStyle, fontSize: `${FNAME}px`, color: nameColor })
        .setOrigin(0.5, 1).setScrollFactor(0);
    const tRight = scene.add.text(0, 0, "님",    { ...baseStyle, fontSize: `${F1_INIT}px` })
        .setOrigin(0.5, 1).setScrollFactor(0);

    // 2줄: "축하드립니다~!"
    const tSecond = scene.add.text(0, 0, "축하드립니다~!", {
        ...baseStyle, fontSize: `${F2_INIT}px`, fontStyle: "800"
    }).setOrigin(0.5, 0).setScrollFactor(0);

    layer.add([tLeft, tName, tRight, tSecond]);

    // 폭에 맞춰 자동 리사이즈 + 중앙 정렬
    const layout = () => {
        const y1 = Math.round(config.height / 2) - 6;
        const totalW = tLeft.width + GAP_X + tName.width + GAP_X + tRight.width;
        const startX = Math.round(config.width / 2 - totalW / 2);

        tLeft .setPosition(startX + tLeft.width / 2, y1);
        tName .setPosition(tLeft.x + tLeft.width / 2 + GAP_X + tName.width / 2, y1);
        tRight.setPosition(tName.x + tName.width / 2 + GAP_X + tRight.width / 2, y1);

        tSecond.setPosition(config.width / 2, y1 + GAP_Y);
    };

    const fit = () => {
        // 글자 크기를 같이 줄여서 한 줄 폭을 맞춤
        let fLeft = F1_INIT, fName = FNAME, fRight = F1_INIT, f2 = F2_INIT;
        const down = () => {
            fLeft = Math.max(24, fLeft - 1);
            fName = Math.max(28, fName - 1);
            fRight = Math.max(24, fRight - 1);
            f2 = Math.max(22, f2 - 1);
            tLeft.setFontSize(fLeft);
            tName.setFontSize(fName);
            tRight.setFontSize(fRight);
            tSecond.setFontSize(f2);
        };
        // 과도하면 줄이기
        for (let i = 0; i < 40; i++) {
            const w = tLeft.width + GAP_X + tName.width + GAP_X + tRight.width;
            if (w <= MAX_W) break;
            down();
        }
        layout();
    };
    fit();

    // 등장 애니메이션(텍스트 유지)
    const targets = [tLeft, tName, tRight, tSecond];
    targets.forEach(t => t.setAlpha(0).setScale(0.98));
    scene.tweens.add({
        targets, alpha: 1, scale: 1,
        duration: 420, ease: "Back.Out"
    });

    // 중앙 주변 반짝 파티클(짧게) + 컨페티 재생
    if (!scene.textures.exists('spark')) {
        const g = scene.add.graphics();
        g.fillStyle(0xffffff).fillCircle(4, 4, 4);
        g.generateTexture('spark', 8, 8);
        g.destroy();
    }
    const spark = scene.add.particles(0, 0, 'spark', {
        x: { min: config.width / 2 - 160, max: config.width / 2 + 160 },
        y: Math.round(config.height / 2) - 40,
        lifespan: 1200,
        speed: { min: 80, max: 160 },
        angle: { min: 60, max: 120 },
        gravityY: 300,
        quantity: 6,
        frequency: 80,
        scale: { start: 1.0, end: 0 },
        tint: [0xfff176, 0xf8c4ff, 0x93c5fd, 0x86efac]
    });
    spark.setScrollFactor(0).setDepth(8510);
}

// 우승 표시는 하단 중앙 한 줄: "🥇 닉네임" (배경 없음)
function showWinnerUI(scene, winnerName) {
    if (scene._winHudShown) return;
    scene._winHudShown = true;

    const winner = scene.winner;
    const nameColor = hexToCss(winner?.color || 0xffffff);

    const hud = scene.add.layer().setDepth(7500);
    if (scene.minimapCamera) scene.minimapCamera.ignore(hud);

    // ====== 튜닝값 ======
    const GAP = 12;                 // 메달 ↔ 이름 간격
    const MEDAL_RATIO = 0.8;        // ← 네가 쓰는 값
    const MEDAL_DY = 2;             // 메달을 더 아래로 내리고 싶으면 +로 늘리기(0~6 추천)
    const BOTTOM_PAD = 6;           // 화면 바닥과의 간격
    const MAX_W = Math.floor(config.width * 0.92); // 한 줄 최대 폭
    // ====================

    const medalTx = scene.add.text(0, 0, "🥇", {
        fontFamily: "Segoe UI Emoji, Apple Color Emoji, system-ui",
        fontSize: "20px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        shadow: { color: "#000", blur: 6, fill: true, offsetY: 2 }
    }).setScrollFactor(0).setOrigin(0, 1);   // ★ 하단 기준

    const nameTx = scene.add.text(0, 0, winnerName || "", {
        fontFamily: "Arial Black, system-ui",
        fontSize: "20px",
        color: nameColor,
        stroke: "#000000",
        strokeThickness: 6,
        shadow: { color: "#000", blur: 6, fill: true, offsetY: 2 }
    }).setScrollFactor(0).setOrigin(0, 1);   // ★ 하단 기준

    hud.add(medalTx);
    hud.add(nameTx);

    // 크기/배치 자동 맞춤 (두 텍스트의 아래선 동일)
    const fitRow = (minPx = 28, maxPx = 40) => {
        let lo = minPx, hi = maxPx, best = minPx;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;                 // 이름 폰트 크기
            nameTx.setFontSize(mid);
            medalTx.setFontSize(Math.round(mid * MEDAL_RATIO));
            const totalW = medalTx.width + GAP + nameTx.width;
            if (totalW <= MAX_W) { best = mid; lo = mid + 1; }
            else hi = mid - 1;
        }
        nameTx.setFontSize(best);
        medalTx.setFontSize(Math.round(best * MEDAL_RATIO));

        const totalW = medalTx.width + GAP + nameTx.width;
        const cx = config.width / 2;
        const startX = Math.round(cx - totalW / 2);

        const yBottom = config.height - BOTTOM_PAD; // ★ 두 텍스트의 아래선을 동일하게
        medalTx.setPosition(startX, yBottom + MEDAL_DY); // 메달만 미세 보정
        nameTx.setPosition(startX + medalTx.width + GAP, yBottom);
    };
    fitRow();

    // 간단한 페이드 인
    scene.tweens.add({
        targets: [medalTx, nameTx],
        alpha: { from: 0, to: 1 },
        duration: 200,
        ease: "Quad.easeOut"
    });

    // 다시하기 버튼/컨페티 유지
    createRestartCTA(scene, {
        w: 260, h: 96,
        x: 14 + 260 / 2,
        y: config.height - 14 - 96 / 2,
        label: "🔁 다시하기",
        onClick: () => softRestart(scene)
    });
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

function respawnPlayerToTop(scene, p) {
    const MatterJS = Phaser.Physics.Matter.Matter;
    if (!p || !p.body) return;

    const spawnY = 200; // 맵 최상단 근처
    const jitterX = Phaser.Math.Between(-140, 140);
    const spawnX = Phaser.Math.Clamp((config.width / 2) + jitterX, BALL_RADIUS + 4, config.width - BALL_RADIUS - 4);

    const mBody = p.body.body;
    if (MatterJS.Sleeping) MatterJS.Sleeping.set(mBody, false);

    p.body.setIgnoreGravity(false);
    p.body.setStatic(false);
    p.body.setPosition(spawnX, spawnY);
    p.body.setVelocity(Phaser.Math.FloatBetween(-1.2, 1.2), 0);

    // 정지 타이머 리셋
    p._idleSince = null;

    // ❗️여기서 바로 현재 위치로 lastPos 재설정(= null 금지)
    const cur = mBody.position;
    p._lastPos = { x: cur.x, y: cur.y };
}

// update 함수: 카메라 추적, 라벨 따라가기, 미니맵 연동
function update() {
    if (players.length === 0) return;

    // 진행 중인 플레이어들만 추적
    const racing = players.filter(p => !p.finished);
    const lowest = racing.length
        ? racing.reduce((a, b) => (a.body.y > b.body.y ? a : b))
        : players[0];

    if (lowest) this.cameras.main.startFollow(lowest.body, true, 0.2, 0.2);
    this.cameras.main.setZoom(1);

    const now = this.time.now;
    const MatterJS = Phaser.Physics.Matter.Matter;

    players.forEach(p => {
        if (!p.body || !p.label) return;

        if (!p.finished) {
            // 라벨은 항상 공 위에
            p.label.setPosition(p.body.x, p.body.y - 25);

            // 화면 완전 이탈 시 즉시 리스폰 → 이 프레임 처리 종료
            const { x, y } = p.body;
            if (x < -500 || x > config.width + 300 || y < -200 || y > 4500) {
                respawnPlayerToTop(this, p);
                return; // ← 중요: 같은 프레임에서 더 만지지 않음
            }

            // ── 정지 감지 → 3초 지나면 최상단 복귀 ──
            const mBody = p.body.body;
            if (mBody.isSleeping && MatterJS.Sleeping) MatterJS.Sleeping.set(mBody, false);

            const v = mBody.velocity;
            const speed = Math.hypot(v.x, v.y);
            const pos = mBody.position;

            // null 안전: 없으면 즉시 객체로 만들어 둔다
            if (!p._lastPos) p._lastPos = { x: pos.x, y: pos.y };

            const moved = Math.hypot(pos.x - p._lastPos.x, pos.y - p._lastPos.y);

            const IDLE_SPEED = 0.12; // "거의 정지"
            const MOVE_EPS   = 0.8;  // 프레임간 이동량 임계
            const STUCK_MS   = 3000; // 3초

            const idleNow = (speed < IDLE_SPEED && moved < MOVE_EPS);

            if (idleNow) {
                if (!p._idleSince) p._idleSince = now;
                if (now - p._idleSince >= STUCK_MS) {
                    // 리스폰하고 이번 프레임은 종료 (아래 lastPos 갱신 금지)
                    respawnPlayerToTop(this, p);
                    return; // ← 중요
                }
            } else {
                p._idleSince = null;
            }

            // 다음 프레임 비교용 위치 갱신(여기까지 내려왔으면 p._lastPos는 절대 null 아님)
            p._lastPos.x = pos.x;
            p._lastPos.y = pos.y;
        }
        // 결승 통과자는 갱신 생략
    });

    // 미니맵 추적
    if (this.minimapCamera && lowest) {
        this.minimapCamera.scrollX = 0;
        this.minimapCamera.scrollY = lowest.body.y - (this.minimapCamera.height / 2);
        if (this.minimapCamera.scrollY < 0) this.minimapCamera.scrollY = 0;
        if (this.minimapCamera.scrollY > 4000 - this.minimapCamera.height)
            this.minimapCamera.scrollY = 4000 - this.minimapCamera.height;
    }

    updateLeaderboard(this);
}