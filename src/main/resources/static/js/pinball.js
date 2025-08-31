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

    this.uiLayer = this.add.layer();
    this.uiLayer.setDepth(1000);

    createGameSetupUI(this);
    this.cannon = this.add.image(config.width / 2, 4000, 'cannon').setOrigin(0.5, 1);
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

function generateNicknameInputs(scene) {
    // 버튼 겹침 방지: 닉네임 입력을 열면 열기 버튼 숨김
    uiElements.nicknameButton?.setVisible(false);

    // 기존 입력 지우기
    uiElements.nameInputs?.forEach(i => i.destroy());
    uiElements.nameInputs = [];

    // 영역 잡기(고정 y 기준)
    const centerX = config.width / 2;
    const frameW = 740;
    const frameX = centerX - frameW / 2;
    const frameY = 270; // 닉네임 버튼(220)과 시각적으로 겹치지 않도록 충분히 아래
    const padding = 18;

    // 인풋 셀 사이즈/간격
    const cellW = 120, cellH = 36, gap = 12;

    // 칼럼/행 계산(반응형)
    const cols = Math.max(2, Math.min(6, Math.floor((frameW - padding*2 + gap) / (cellW + gap))));
    const rows = Math.ceil(playerCount / cols);

    // 프레임 높이
    const frameH = padding*2 + rows*cellH + (rows - 1)*gap;

    // 노란 프레임/타이틀 표시 & 위치
    uiElements.nameFrame.setVisible(true).clear()
        .lineStyle(2, 0xffcc00, 1)
        .fillStyle(0x000000, 0.20)
        .fillRoundedRect(frameX, frameY, frameW, frameH, 14)
        .strokeRoundedRect(frameX, frameY, frameW, frameH, 14);

    uiElements.nameTitle
        .setVisible(true)
        .setPosition(centerX, frameY - 10);

    // 입력칸 배치
    const gridW = cols * cellW + (cols - 1) * gap;
    const startX = frameX + (frameW - gridW) / 2 + cellW / 2;
    const startY = frameY + padding + cellH / 2;

    // 기존값 유지(있으면 최우선)
    const keep = Array.isArray(uiElements.nameInputs)
        ? uiElements.nameInputs.map(i => (i?.text || '').trim()) : [];
    const seed = keep.some(Boolean) ? keep
        : (Array.isArray(playerNicknames) ? playerNicknames.slice() : []);

    for (let i = 0; i < playerCount; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const x = startX + c * (cellW + gap);
        const y = startY + r * (cellH + gap);

        const input = scene.add.rexInputText(x, y, cellW, cellH, {
            type: 'text',
            text: (seed[i] || ''),     // 비워두면 나중에 랜덤으로 채워짐
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#333333',
            border: '1px solid #ffcc00',
            align: 'center',
            padding: 4,
            placeholder: `P${i+1}`,
            selectAll: true,
            maxLength: nickMaxLength
        })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(22)
            .setInteractive()
            .on('pointerdown', () => input.setFocus());

        scene.uiLayer?.add(input);
        uiElements.nameInputs.push(input);
    }

    // 시작 버튼은 항상 보이게
    uiElements.startGameButton.setVisible(true);

    // 🔧 파란 패널 높이/시작 버튼 위치를 rows에 맞춰 조정
    resizeSetupPanel(scene, { rows, frameH });
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
    // 1) 입력칸이 열려있다면 입력값 수집
    if (Array.isArray(uiElements.nameInputs) && uiElements.nameInputs.length) {
        playerNicknames = uiElements.nameInputs.map(inp => {
            const v = (inp.text || '').trim();
            return v || ('Player-' + Math.random().toString(36).slice(2, 6));
        });
    }

    // 2) 방어로직: 길이 맞추기
    if (!Array.isArray(playerNicknames) || playerNicknames.length !== playerCount) {
        playerNicknames = Array.from({ length: playerCount }, (_, i) =>
            'Player-' + Math.random().toString(36).slice(2, 6)
        );
    }

    console.log("🎮 참가자 리스트:", playerNicknames);

    // 3) 설정 UI 싹 정리(레이어 통째로 제거 → 미니맵에도 안 남음)
    scene.uiLayer?.destroy();
    uiElements = {};

    scene.cameras.main.setBackgroundColor('#000');
    players = [];
    lastWinner = null;
    scene.winner = null;

    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
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
        player.setFrictionAir(0.02);
        player.setFixedRotation();
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

        // 2초 후 발사
        scene.time.delayedCall(2000, () => {
            player.setIgnoreGravity(false); // 중력 적용
            player.setVelocity(0, -launchSpeed); // 위로 발사

            // 1100ms 후 충돌 및 구성 설정
            scene.time.delayedCall(1100, () => {
                if (scene.cannon?.destroy) scene.cannon.destroy();

                createGoalZone(scene);
                createObstacles(scene);
                checkWin(scene);

                // 장애물 충돌 이벤트 등록
                scene.matter.world.on('collisionstart', (event) => {
                    event.pairs.forEach(({ bodyA, bodyB }) => {
                        scene.obstacles.forEach(obstacle => {
                            if (
                                (bodyA === player.body.body && bodyB === obstacle.body) ||
                                (bodyB === player.body.body && bodyA === obstacle.body)
                            ) {
                                console.log(`🚀 플레이어 ${playerNicknames[i]} 장애물 충돌!`);
                                const angularForce = obstacle.body.angularVelocity * 2;
                                const vx = Phaser.Math.Between(-200, 200) + angularForce;
                                const vy = Phaser.Math.Between(-300, -100);
                                player.setVelocity(vx, vy);
                            }
                        });
                    });
                });
            });
        });
    }
    createMinimap(scene);
    createLeaderboard(scene);
}

function createMinimap(scene) {
    console.log("🗺️ 미니맵 생성");

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

    const Matter = Phaser.Physics.Matter.Matter;

    // ✅ 진자형 장애물 생성 함수
    function createPendulum(x, y, width, angularVelocity, color = 0xff6600) {
        const body = scene.matter.add.rectangle(x, y, width, 20, {
            chamfer: { radius: 5 }, restitution: 0.5
        });
        const constraint = Matter.Constraint.create({
            pointA: { x, y },
            bodyB: body,
            pointB: { x: 0, y: 0 },
            length: 0,
            stiffness: 1
        });
        scene.matter.world.add(constraint);
        Matter.Body.setAngularVelocity(body, angularVelocity);

        const graphic = scene.add.rectangle(x, y, width, 20, color).setOrigin(0.5);
        scene.matter.add.gameObject(graphic, body);
        scene.obstacles.push(graphic);
    }

    // ✅ 왕복 장애물 생성 함수
    function createMover(x, y, width, range, duration, color = 0x00ffff) {
        const body = scene.matter.add.rectangle(x, y, width, 20, { isStatic: true });
        const graphic = scene.add.rectangle(x, y, width, 20, color).setOrigin(0.5);
        scene.matter.add.gameObject(graphic, body);
        scene.obstacles.push(graphic);

        scene.tweens.add({
            targets: graphic,
            x: `+=${range}`,
            duration,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                scene.matter.body.setPosition(body, { x: graphic.x, y: graphic.y });
            }
        });
    }

    // ✅ 난기류 장애물 생성 함수
    function createSwirl(x, y, size = 100) {
        const body = scene.matter.add.rectangle(x, y, size, size, {
            isStatic: true,
            isSensor: true
        });
        const graphic = scene.add.rectangle(x, y, size, size, 0xffff00, 0.3).setOrigin(0.5);
        scene.matter.add.gameObject(graphic, body);
        scene.obstacles.push(graphic);

        scene.matter.world.on('collisionstart', event => {
            event.pairs.forEach(({ bodyA, bodyB }) => {
                players.forEach(player => {
                    const pBody = player.body.body;
                    if ((bodyA === pBody && bodyB === body) || (bodyB === pBody && bodyA === body)) {
                        const vx = Phaser.Math.Between(-10, 10);
                        const vy = Phaser.Math.Between(-15, -5);
                        player.body.setVelocity(vx, vy);
                        console.log('💨 난기류 영향 받음!');
                    }
                });
            });
        });
    }

    // 👉 장애물 배치
    createPendulum(config.width / 2, 800, 200, 0.08);            // 큰 진자
    createMover(config.width / 2, 1200, 150, 150, 1500);          // 느린 왕복
    createPendulum(config.width / 2 - 100, 1600, 150, -0.12, 0xff0000); // 빨간 진자
    createMover(config.width / 2 + 100, 2000, 100, 200, 1000);          // 빠른 왕복
    createSwirl(config.width / 2, 2500);                          // 난기류
    createPendulum(config.width / 2, 3000, 220, 0.1, 0x00ff00);   // 녹색 진자
    createMover(config.width / 2, 3200, 180, 180, 1800, 0xff00ff); // 보라 왕복
    createSwirl(config.width / 2, 3500);                          // 마지막 난기류
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

    const leftAngleRad = Math.atan2(mergePointY - leftPathStartY, mergePointX - leftPathStartX);
    const rightAngleRad = Math.atan2(mergePointY - rightPathStartY, mergePointX - rightPathStartX);

    const leftSlide = scene.matter.add.rectangle(
        goalX - 60, goalY - 200,
        slideLength, slideHeight,
        {
            isStatic: true,
            angle: leftAngleRad
        }
    );
    scene.add.rectangle(goalX - 60, goalY - 200, slideLength, slideHeight, 0xffff00).setAngle(Phaser.Math.RadToDeg(leftAngleRad));

    const rightSlide = scene.matter.add.rectangle(
        goalX + 60, goalY - 200,
        slideLength, slideHeight,
        {
            isStatic: true,
            angle: rightAngleRad
        }
    );
    scene.add.rectangle(goalX + 60, goalY - 200, slideLength, slideHeight, 0xffff00).setAngle(Phaser.Math.RadToDeg(rightAngleRad));

    const barrierY = leftPathStartY - 5;
    const barrierThickness = 10;

    const leftWidth = leftPathStartX;
    const leftBarrier = scene.add.rectangle(leftWidth / 2, barrierY, leftWidth, barrierThickness, 0x0000ff, 0.4);
    scene.matter.add.gameObject(leftBarrier, {
        isStatic: true,
        restitution: 1.2,
        friction: 0
    });

    const rightWidth = config.width - rightPathStartX;
    const rightBarrier = scene.add.rectangle(rightPathStartX + rightWidth / 2, barrierY, rightWidth, barrierThickness, 0x0000ff, 0.4);
    scene.matter.add.gameObject(rightBarrier, {
        isStatic: true,
        restitution: 1.2,
        friction: 0
    });

    scene.goalImage = scene.add.image(goalX, goalY, 'goal');
    scene.goalImage.setDisplaySize(200, 200);

    scene.goalZone = scene.add.rectangle(goalX, goalY, 100, 100);
    scene.matter.add.gameObject(scene.goalZone, { isSensor: true, isStatic: true });

    // 튕김 반응 처리 (속도 기반 + 최소 튕김 보장)
    scene.matter.world.on('collisionstart', (event) => {
        event.pairs.forEach(({ bodyA, bodyB }) => {
            players.forEach(player => {
                const pBody = player.body.body;

                if ((bodyA === pBody && bodyB === leftBarrier.body) || (bodyB === pBody && bodyA === leftBarrier.body)) {
                    const velocity = player.body.body.velocity;
                    const bounceForce = 1.5;
                    const vx = Math.max(velocity.x, 1.5) * bounceForce;
                    const vy = velocity.y < 0.5 ? -2 : velocity.y * -0.5;
                    player.body.setVelocity(vx, vy);
                    console.log('🔵 좌측 벽 → 오른쪽으로 튕김');
                }

                if ((bodyA === pBody && bodyB === rightBarrier.body) || (bodyB === pBody && bodyA === rightBarrier.body)) {
                    const velocity = player.body.body.velocity;
                    const bounceForce = 1.5;
                    const vx = -Math.max(velocity.x, 1.5) * bounceForce;
                    const vy = velocity.y < 0.5 ? -2 : velocity.y * -0.5;
                    player.body.setVelocity(vx, vy);
                    console.log('🔵 우측 벽 → 왼쪽으로 튕김');
                }
            });
        });
    });
}


function checkWin(scene) {
    scene.finishOrder = [];

    scene.matter.world.on('collisionstart', (event) => {
        event.pairs.forEach(({ bodyA, bodyB }) => {
            players.forEach((p, idx) => {
                const pBody = p.body.body;
                if (!pBody || p.finished) return;

                const hitGoal =
                    (bodyA === pBody && bodyB === scene.goalZone.body) ||
                    (bodyB === pBody && bodyA === scene.goalZone.body);

                if (hitGoal) {
                    onPlayerFinish(scene, p, p.name || playerNicknames[idx]);
                }
            });
        });
    });
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
    // 제거/재생성
    scene.lbLayer?.destroy();
    const layer = scene.add.layer().setDepth(8000);
    scene.lbLayer = layer;

    // 미니맵에 보이지 않게
    if (scene.minimapCamera) scene.minimapCamera.ignore(layer);

    const w = 180, h = config.height - 20;
    const x = config.width - w - 10, y = 10;

    const bg = scene.add.graphics().setScrollFactor(0);
    bg.fillStyle(0x0d1116, 0.85).fillRoundedRect(x, y, w, h, 12);
    bg.lineStyle(2, 0x00c3ff, 1).strokeRoundedRect(x, y, w, h, 12);
    layer.add(bg);

    const title = scene.add.text(x + 12, y + 10, "📜 순위", {
        fontSize: '16px', fontFamily: 'Orbitron', color: '#a8e5ff'
    }).setScrollFactor(0);
    layer.add(title);

    // 리스트 배치정보 & 아이템 배열
    scene._lbStartX = x + 12;
    scene._lbStartY = y + 36;
    scene._lbWidth  = w - 24;
    scene._lbLineH  = 18;          // 14px 폰트 기준 줄 간격
    scene.lbItems   = [];          // [{rankTx,nameTx,flagTx}]
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