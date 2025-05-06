const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    physics: {
        default: 'matter',
        matter: {
            gravity: { y: 1 },
            debug: true
        }
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
    this.cameras.main.setBounds(0, 0, 800, 4000);
    this.matter.world.setBounds(0, 0, 800, 4000);

    createGameSetupUI(this);
    this.cannon = this.add.image(400, 4000, 'cannon').setOrigin(0.5, 1);

    this.matter.world.createDebugGraphic();
}

// UI 버튼 생성, 닉네임 입력, 참가자 수 조절 기능
function createGameSetupUI(scene) {
    uiElements.uiContainer = scene.add.graphics()
        .fillStyle(0x333333, 0.95)
        .fillRoundedRect(100, 30, 600, 540, 20);

    uiElements.titleText = scene.add.text(400, 50, "게임 참가 설정", {
        fontSize: '26px', fill: '#ffcc00', fontFamily: 'Arial', fontWeight: 'bold'
    }).setOrigin(0.5);

    uiElements.participantLabel = scene.add.text(230, 100, "참가자 수:", { fontSize: '16px', fill: '#ffffff' });
    uiElements.participantCountText = scene.add.text(400, 100, playerCount, {
        fontSize: '20px', fill: '#ffffff', backgroundColor: '#444'
    }).setPadding(5).setOrigin(0.5);

    uiElements.increaseButton = createButton(scene, 460, 100, "▲", 18, '#00ff00', () => changePlayerCount(1));
    uiElements.decreaseButton = createButton(scene, 460, 130, "▼", 18, '#ff4444', () => changePlayerCount(-1));

    uiElements.nicknameButton = createButton(scene, 400, 180, "닉네임 입력하기", 20, '#0077ff', generateNicknameInputs, 200);
    uiElements.startGameButton = createButton(scene, 400, 520, "게임 시작", 22, '#ff0000', () => startGame(scene), 200);
    uiElements.startGameButton.setVisible(false);
}

function generateNicknameInputs() {
    if (uiElements.nicknameContainer) {
        document.body.removeChild(uiElements.nicknameContainer);
    }

    uiElements.nicknameContainer = document.createElement("div");
    Object.assign(uiElements.nicknameContainer.style, {
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "40%",
        maxHeight: "250px",
        overflowY: "auto",
        padding: "15px",
        backgroundColor: "#222",
        border: "2px solid #ffcc00",
        borderRadius: "10px",
        textAlign: "center",
        zIndex: "1000"
    });
    document.body.appendChild(uiElements.nicknameContainer);

    let previousNicknames = playerNicknames.map(input => input.value);
    playerNicknames = [];

    for (let i = 0; i < playerCount; i++) {
        let input = document.createElement("input");
        Object.assign(input.style, {
            width: "100px", margin: "5px", padding: "5px", fontSize: "14px",
            textAlign: "center", border: "1px solid #ffcc00",
            borderRadius: "5px", backgroundColor: "#333", color: "#fff"
        });
        input.placeholder = "P" + (i + 1);
        if (previousNicknames[i]) input.value = previousNicknames[i];

        uiElements.nicknameContainer.appendChild(input);
        playerNicknames.push(input);
    }
    uiElements.startGameButton.setVisible(true);
}

function changePlayerCount(delta) {
    playerCount = Phaser.Math.Clamp(playerCount + delta, 1, 30);
    uiElements.participantCountText.setText(playerCount);
    if (uiElements.nicknameContainer) {
        generateNicknameInputs();
    }
}

function createButton(scene, x, y, text, fontSize, color, callback, width = 100) {
    let button = scene.add.text(x, y, text, {
        fontSize: `${fontSize}px`, fill: '#ffffff', backgroundColor: color
    })
        .setPadding(10).setFixedSize(width, 40).setInteractive().setOrigin(0.5)
        .on('pointerdown', callback)
        .on('pointerover', () => button.setBackgroundColor('#ffffff').setFill(color))
        .on('pointerout', () => button.setBackgroundColor(color).setFill('#ffffff'));

    return button;
}

function startGame(scene) {
    playerNicknames = playerNicknames.map(input => input.value.trim() || "Player " + Math.random().toString(36).substr(2, 5));
    console.log("🎮 참가자 리스트:", playerNicknames);

    // 기존 UI 제거
    Object.values(uiElements).forEach(el => {
        if (el?.destroy) el.destroy();
    });
    if (uiElements.nicknameContainer) {
        document.body.removeChild(uiElements.nicknameContainer);
    }
    uiElements = {};

    scene.cameras.main.setBackgroundColor('#000');
    players = [];
    lastWinner = null;
    scene.winner = null;

    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
    const startX = 400;
    const startY = 3800;
    const launchSpeed = 110;

    for (let i = 0; i < playerCount; i++) {
        const circle = scene.add.circle(startX, startY, 15, colors[i % colors.length]);
        const player = scene.matter.add.gameObject(circle);
        player.setCircle(15);
        player.setBounce(0.8);
        player.setFrictionAir(0.02);
        player.setFixedRotation();
        player.setIgnoreGravity(true); // 중력 비활성화

        const label = scene.add.text(startX, startY - 25, playerNicknames[i], {
            fontSize: '14px', fill: '#ffffff', backgroundColor: 'rgba(0,0,0,0.5)',
            padding: { left: 5, right: 5, top: 2, bottom: 2 }
        }).setOrigin(0.5);

        players.push({ body: player, label });

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
    const minimapZoom = 0.25;

    // 📸 미니맵 카메라 생성
    scene.minimapCamera = scene.cameras.add(minimapX, minimapY, minimapWidth, minimapHeight)
        .setZoom(minimapZoom)
        .setBackgroundColor(0x000000)
        .setBounds(0, 0, 800, 4000);

    // 🔳 미니맵 테두리
    scene.minimapBorder = scene.add.graphics();
    scene.minimapBorder.lineStyle(3, 0xffffff, 1);
    scene.minimapBorder.strokeRect(minimapX + 0.5, minimapY + 0.5, minimapWidth - 1, minimapHeight - 1);
    scene.minimapBorder.setScrollFactor(0);
    scene.minimapBorder.setDepth(9999);

    // 미니맵에는 테두리 안 보이게
    scene.minimapCamera.ignore([scene.minimapBorder]);
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
    createPendulum(400, 800, 200, 0.08);            // 큰 진자
    createMover(400, 1200, 150, 150, 1500);          // 느린 왕복
    createPendulum(300, 1600, 150, -0.12, 0xff0000); // 빨간 진자
    createMover(500, 2000, 100, 200, 1000);          // 빠른 왕복
    createSwirl(400, 2500);                          // 난기류
    createPendulum(400, 3000, 220, 0.1, 0x00ff00);   // 녹색 진자
    createMover(400, 3200, 180, 180, 1800, 0xff00ff); // 보라 왕복
    createSwirl(400, 3500);                          // 마지막 난기류
}

function createGoalZone(scene) {
    const goalX = 400;
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

    const rightWidth = 800 - rightPathStartX;
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
    scene.matter.world.on('collisionstart', (event) => {
        event.pairs.forEach(({ bodyA, bodyB }) => {
            players.forEach((player, i) => {
                if (
                    (bodyA === player.body.body && bodyB === scene.goalZone.body) ||
                    (bodyB === player.body.body && bodyA === scene.goalZone.body)
                ) {
                    if (!scene.winner) {
                        scene.winner = player;
                        showWinnerUI(scene, playerNicknames[i]);
                    }
                }
            });
        });
    });
}

function showWinnerUI(scene, winnerName) {
    let winner = scene.winner;
    let winText = scene.add.text(winner.body.x, winner.body.y - 50, `${winnerName} 승리!`, {
        fontSize: '32px', fill: '#ffffff', fontWeight: 'bold',
        backgroundColor: 'rgba(0,0,0,0.7)', padding: { left: 10, right: 10, top: 5, bottom: 5 }
    }).setOrigin(0.5);

    let restartButton = createButton(scene, winner.body.x, winner.body.y + 50, "다시하기", 22, '#0077ff', () => {
        window.location.reload();
    }, 150);

    scene.time.addEvent({
        delay: 10,
        loop: true,
        callback: () => {
            if (winner.body) {
                winText.setPosition(winner.body.x, winner.body.y - 150);
                restartButton.setPosition(winner.body.x, winner.body.y - 100);
            }
        }
    });

    scene.tweens.add({
        targets: winText,
        alpha: { from: 0, to: 1 },
        duration: 500,
        yoyo: true,
        repeat: -1
    });

    scene.matter.world.pause();
}

// update 함수: 카메라 추적, 라벨 따라가기, 미니맵 연동
function update() {
    if (players.length === 0) return;

    let lowest = players.reduce((a, b) => (a.body.y > b.body.y ? a : b));
    this.cameras.main.startFollow(lowest.body, true, 0.2, 0.2);
    this.cameras.main.setZoom(1);

    players.forEach(player => {
        if (player.body && player.label) {
            // 라벨 따라가게
            player.label.setPosition(player.body.x, player.body.y - 25);

            // 너무 멀리 벗어나면 복귀
            const { x, y } = player.body;
            if (x < -500 || x > 1300 || y < -200 || y > 4500) {
                console.log(`🌀 ${player.label.text} 위치 이탈 → 복귀`);
                player.body.setPosition(400, 200); // 맨 위에서 다시 떨어지게
                player.body.setVelocity(Phaser.Math.Between(-2, 2), 0);
            }
        }
    });

    if (this.minimapCamera) {
        this.minimapCamera.startFollow(lowest.body, true, 0.1, 0.1);
    }
}