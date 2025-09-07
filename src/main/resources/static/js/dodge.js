window.onload = function() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    const config = {
        type: Phaser.AUTO,
        width: 800,
        height: 600,
        parent: 'game-container',
        scale: {
            mode: isMobile ? Phaser.Scale.FIT : Phaser.Scale.NONE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: 800,
            height: 600,
        },
        backgroundColor: '#000000',
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { y: 0 }
            }
        },
        scene: {
            preload: preload,
            create: create,
            update: update
        },
    };

    let game = new Phaser.Game(config);
    let tower;
    let enemies;
    let powerUps;
    let bombs;
    let cursors;
    let gameOver = false;
    let gameOverText;
    let restartButton;
    let gameOverUI;
    let timerText;
    let startTime;
    let pauseStartTime = 0;
    let totalPausedTime = 0;
    let enemySpawnTimer;
    let powerUpSpawnTimer;
    let bombSpawnTimer;
    let enemySpeed = 100;
    let spawnInterval = 1000;
    let touchControls;
    let backgroundMusic;

    let touchStartX, touchStartY; // 터치 시작 위치
    let circleBase, circleThumb; // 큰 동그라미와 작은 동그라미

    function preload () {
        // 음악
        this.load.audio('backgroundMusic', 'assets/audio/Ztar Warz.mp3');
    }

    function create () {
        // 배경 음악 재생
        if (!backgroundMusic) {
            backgroundMusic = this.sound.add('backgroundMusic', { loop: true });
            backgroundMusic.play();
        }

        // BGM 끄기/켜기 버튼 이벤트 설정
        document.getElementById('bgmToggle').addEventListener('click', () => {
            if (backgroundMusic.isPlaying) {
                backgroundMusic.pause();
            } else {
                this.sound.context.resume();
                backgroundMusic.play({ loop: true });
            }
        });

        // 볼륨 조절 슬라이더 이벤트 설정
        document.getElementById('volumeControl').addEventListener('input', function() {
            const volume = this.value / 100;
            backgroundMusic.setVolume(volume);
        });

        // 타워를 그래픽스로 그리기
        const towerGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        towerGraphics.fillStyle(0xFFFF00, 1);
        towerGraphics.fillCircle(5, 5, 5); // 반지름을 5로 줄임
        towerGraphics.generateTexture('tower', 10, 10); // 지름이 10인 텍스처 생성
        tower = this.physics.add.sprite(this.cameras.main.width / 2, this.cameras.main.height / 2, 'tower');

        // 적을 그래픽스로 그리기
        const enemyGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        enemyGraphics.fillStyle(0xFF0000, 1);
        enemyGraphics.fillCircle(3.75, 3.75, 3.75); // 반지름을 3.75로 줄임
        enemyGraphics.generateTexture('enemy', 7.5, 7.5); // 지름이 7.5인 텍스처 생성
        enemies = this.physics.add.group();

        // 파워업 아이템 그래픽
        const powerUpGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        powerUpGraphics.fillStyle(0x00FF00, 1);
        powerUpGraphics.fillCircle(5, 5, 5); // 반지름 5로 줄임
        powerUpGraphics.generateTexture('powerUp', 10, 10); // 지름이 10인 텍스처 생성
        powerUps = this.physics.add.group();

        // 폭탄 아이템 그래픽
        const bombGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        bombGraphics.fillStyle(0x0000FF, 1);
        bombGraphics.fillCircle(5, 5, 5); // 반지름 5로 줄임
        bombGraphics.generateTexture('bomb', 10, 10); // 지름이 10인 텍스처 생성
        bombs = this.physics.add.group();

        enemySpawnTimer = this.time.addEvent({
            delay: spawnInterval,
            callback: addEnemy,
            callbackScope: this,
            loop: true
        });

        powerUpSpawnTimer = this.time.addEvent({
            delay: 10000,
            callback: addPowerUp,
            callbackScope: this,
            loop: true
        });

        bombSpawnTimer = this.time.addEvent({
            delay: 20000,
            callback: addBomb,
            callbackScope: this,
            loop: true
        });

        cursors = this.input.keyboard.createCursorKeys();

        // 터치 입력 지원
        touchControls = this.input.addPointer(1);

        // 충돌 감지
        this.physics.add.overlap(tower, enemies, hitEnemy, null, this);
        this.physics.add.overlap(tower, powerUps, collectPowerUp, null, this);
        this.physics.add.overlap(tower, bombs, collectBomb, null, this);

        // 타이머 텍스트
        timerText = this.add.text(16, 16, 'Time: 0', { fontSize: '32px', fill: '#FFF' });

        // 게임 오버 텍스트
        // gameOverText = this.add.text(this.cameras.main.width / 2 - 100, this.cameras.main.height / 2 - 50, 'Game Over', { fontSize: '32px', fill: '#FFF' }).setVisible(false);

        // 다시하기 버튼 생성
        // restartButton = this.add.text(this.cameras.main.width / 2 - 50, this.cameras.main.height / 2, 'Restart', { fontSize: '32px', fill: '#FFF' }).setInteractive().setVisible(false);
        // restartButton.on('pointerdown', () => {
        //     this.scene.restart();
        //     gameOver = false;
        //     startTime = this.time.now;
        //     enemySpeed = 100;
        //     spawnInterval = 1000;
        //     totalPausedTime = 0;
        // });

        // 게임 시작 시간 기록
        startTime = this.time.now;

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 터치 입력 이벤트
        this.input.on('pointerdown', (pointer) => {
            touchStartX = pointer.x;
            touchStartY = pointer.y;

            // 큰 동그라미 생성
            circleBase = this.add.circle(touchStartX, touchStartY, 40, 0x888888).setAlpha(0.5);

            // 작은 동그라미 생성
            circleThumb = this.add.circle(touchStartX, touchStartY, 20, 0xffffff).setAlpha(0.8);
        });

        this.input.on('pointermove', (pointer) => {
            if (!circleBase || !circleThumb) return;

            const dx = pointer.x - touchStartX;
            const dy = pointer.y - touchStartY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= 40) {
                circleThumb.x = pointer.x;
                circleThumb.y = pointer.y;
            } else {
                const angle = Math.atan2(dy, dx);
                circleThumb.x = touchStartX + Math.cos(angle) * 40;
                circleThumb.y = touchStartY + Math.sin(angle) * 40;
            }

            // 터치 방향 계산
            if (distance > 10) {
                touchAngle = Math.atan2(dy, dx); // 방향 저장
            } else {
                touchAngle = null; // 움직임 멈춤
            }
        });

        this.input.on('pointerup', () => {
            if (circleBase) circleBase.destroy();
            if (circleThumb) circleThumb.destroy();
            circleBase = null;
            circleThumb = null;

            touchAngle = null; // 터치 입력 종료
        });
    }

    function update () {
        if (gameOver) {
            return;
        }

        // 타이머 업데이트
        const elapsed = Math.floor((this.time.now - startTime - totalPausedTime) / 1000);
        timerText.setText('Time: ' + elapsed);

        // 난이도 증가
        if (elapsed > 0 && elapsed % 10 === 0 && enemySpawnTimer.delay > 200) {
            enemySpawnTimer.remove(false);
            spawnInterval -= 100;  // 적 생성 주기를 줄임
            enemySpawnTimer = this.time.addEvent({
                delay: spawnInterval,
                callback: addEnemy,
                callbackScope: this,
                loop: true
            });
            enemySpeed += 20; // 적 속도 증가
        }

        // 키보드 입력 처리
        if (cursors.left.isDown) {
            tower.x -= 3;
        }
        else if (cursors.right.isDown) {
            tower.x += 3;
        }

        if (cursors.up.isDown) {
            tower.y -= 3;
        }
        else if (cursors.down.isDown) {
            tower.y += 3;
        }

        // 터치 입력 처리
        if (circleThumb && circleBase) {
            const dx = circleThumb.x - circleBase.x;
            const dy = circleThumb.y - circleBase.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 10) {
                tower.x += (dx / distance) * 3; // 일정한 속도로 이동
                tower.y += (dy / distance) * 3;
            }
        }

        // 화면 경계를 벗어나지 않도록 제한
        if (tower.x < 0) {
            tower.x = 0;
        } else if (tower.x > this.cameras.main.width) {
            tower.x = this.cameras.main.width;
        }

        if (tower.y < 0) {
            tower.y = 0;
        } else if (tower.y > this.cameras.main.height) {
            tower.y = this.cameras.main.height;
        }
    }

    function addEnemy () {
        const elapsed = Math.floor((this.time.now - startTime - totalPausedTime) / 1000);

        // 적이 화면 밖에서 생성되도록 함
        const position = Phaser.Math.Between(0, 3);
        let x, y;

        switch (position) {
            case 0: // 상단
                x = Phaser.Math.Between(0, this.cameras.main.width);
                y = -20;
                break;
            case 1: // 하단
                x = Phaser.Math.Between(0, this.cameras.main.width);
                y = this.cameras.main.height + 20;
                break;
            case 2: // 좌측
                x = -20;
                y = Phaser.Math.Between(0, this.cameras.main.height);
                break;
            case 3: // 우측
                x = this.cameras.main.width + 20;
                y = Phaser.Math.Between(0, this.cameras.main.height);
                break;
        }

        let enemy;
        if (elapsed < 10) {
            enemy = enemies.create(x, y, 'enemy');
            this.physics.moveToObject(enemy, tower, enemySpeed);
        } else if (elapsed < 20) {
            enemy = enemies.create(x, y, 'enemy');
            this.physics.moveToObject(enemy, tower, enemySpeed * 1.1);
        } else if (elapsed < 30) {
            enemy = enemies.create(x, y, 'enemy');
            this.physics.moveToObject(enemy, tower, enemySpeed * 1.2);
        } else if (elapsed < 40) {
            enemy = enemies.create(x, y, 'enemy');
            this.physics.moveToObject(enemy, tower, enemySpeed * 1.3);
        } else if (elapsed < 50) {
            enemy = enemies.create(x, y, 'enemy');
            this.physics.moveToObject(enemy, tower, enemySpeed * 1.4);
        } else if (elapsed < 60) {
            enemy = enemies.create(x, y, 'enemy');
            this.physics.moveToObject(enemy, tower, enemySpeed * 1.5);
        } else if (elapsed < 70) {
            enemy = enemies.create(x, y, 'enemy');
            this.physics.moveToObject(enemy, tower, enemySpeed * 1.6);
        } else if (elapsed < 80) {
            enemy = enemies.create(x, y, 'enemy');
            this.physics.moveToObject(enemy, tower, enemySpeed * 1.7);
        } else if (elapsed < 90) {
            enemy = enemies.create(x, y, 'enemy');
            this.physics.moveToObject(enemy, tower, enemySpeed * 1.8);
        } else {
            enemy = enemies.create(x, y, 'enemy');
            this.physics.moveToObject(enemy, tower, enemySpeed * 1.9);
        }
    }

    function addPowerUp () {
        const x = Phaser.Math.Between(0, this.cameras.main.width);
        const y = Phaser.Math.Between(0, this.cameras.main.height);
        const powerUp = powerUps.create(x, y, 'powerUp');

        powerUp.setCollideWorldBounds(true);
        powerUp.setBounce(1);
        powerUp.setVelocity(Phaser.Math.Between(-100, 100), Phaser.Math.Between(-100, 100));
    }

    function addBomb () {
        const x = Phaser.Math.Between(0, this.cameras.main.width);
        const y = Phaser.Math.Between(0, this.cameras.main.height);
        const bomb = bombs.create(x, y, 'bomb');

        bomb.setCollideWorldBounds(true);
        bomb.setBounce(1);
        bomb.setVelocity(Phaser.Math.Between(-100, 100), Phaser.Math.Between(-100, 100));
    }

    function collectPowerUp(tower, powerUp) {
        powerUp.destroy();
        activatePowerUp.call(this); // 여기서 this 바인딩
    }

    function collectBomb(tower, bomb) {
        bomb.destroy();
        clearEnemies.call(this); // 여기서 this 바인딩
    }

    function activatePowerUp() {
        tower.setTint(0x00ff00); // 무적 상태 표시
        this.time.addEvent({
            delay: 5000,
            callback: () => {
                tower.clearTint(); // 무적 상태 해제
            }
        });
    }

    function clearEnemies() {
        enemies.clear(true, true); // 모든 적 제거
    }

    function hitEnemy (tower, enemy) {
        if (tower.tintTopLeft === 0x00ff00) {
            enemy.destroy();
            return;
        }
        this.physics.pause();
        tower.setTint(0xff0000);
        gameOver = true;
        const survivedTime = Math.floor((this.time.now - startTime - totalPausedTime) / 1000);
        showGameOverUI(this, survivedTime);
        submitScore(survivedTime)
            .then(() => refreshLeaderboards())
            .catch(console.error);
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            pauseStartTime = performance.now();
            if (backgroundMusic) {
                backgroundMusic.pause();
            }
        } else {
            const now = performance.now();
            totalPausedTime += now - pauseStartTime;
            if (backgroundMusic) {
                backgroundMusic.resume();
            }
        }
    }

    function makeUIButton(scene, x, y, label, onClick) {
        const w = 220, h = 56, r = 16;
        const container = scene.add.container(x, y).setDepth(1002).setScale(1.0);

        // 1) 버튼 비주얼(그림자+본체)은 그대로 Graphics로
        const g = scene.add.graphics();
        g.fillStyle(0x000000, 0.35);                // 그림자
        g.fillRoundedRect(-w/2 + 4, -h/2 + 6, w, h, r);
        g.fillStyle(0x2b6fff, 1);                   // 본체
        g.fillRoundedRect(-w/2, -h/2, w, h, r);
        const highlight = scene.add.rectangle(-w/2, -h/2, w, h/2, 0xffffff, 0.07)
            .setOrigin(0, 0);

        const text = scene.add.text(0, 0, label, {
            fontFamily: 'Pretendard, Noto Sans KR, Arial',
            fontSize: '22px',
            color: '#ffffff',
        }).setOrigin(0.5);

        // 2) 투명한 히트박스(정확한 클릭 영역 담당)
        const hitBox = scene.add.rectangle(0, 0, w, h, 0x000000, 0.001)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });   // ← 커서 pointer

        // 3) 호버/클릭 애니메이션은 hitBox에만 바인딩
        hitBox.on('pointerover', () => {
            scene.tweens.add({ targets: container, scale: 1.04, duration: 120, ease: 'Quad.easeOut' });
            scene.input.setDefaultCursor('pointer');    // html의 cursor:pointer와 동일
        });
        hitBox.on('pointerout', () => {
            scene.tweens.add({ targets: container, scale: 1.00, duration: 120, ease: 'Quad.easeOut' });
            scene.input.setDefaultCursor('default');
        });
        hitBox.on('pointerdown', () => {
            scene.tweens.add({ targets: container, scale: 0.98, duration: 80, ease: 'Quad.easeOut' });
        });
        hitBox.on('pointerup', () => {
            scene.tweens.add({ targets: container, scale: 1.02, duration: 100, ease: 'Quad.easeOut' });
            onClick && onClick();
        });

        container.add([g, highlight, text, hitBox]);  // hitBox를 맨 위에 두면 정확
        return container;
    }

// 게임오버 모달 UI
    function showGameOverUI(scene, survivedTime) {
        const { width, height } = scene.cameras.main;

        // 배경 어둡게
        const dim = scene.add.rectangle(width/2, height/2, width, height, 0x000000, 0.55)
            .setDepth(1000).setInteractive(); // 바깥 클릭 방지

        // 카드
        const cardW = Math.min(540, width * 0.9);
        const cardH = 320;
        const cardX = (width - cardW) / 2;
        const cardY = (height - cardH) / 2;

        const card = scene.add.graphics().setDepth(1001);
        // 카드 그림자
        card.fillStyle(0x000000, 0.35);
        card.fillRoundedRect(cardX + 6, cardY + 10, cardW, cardH, 20);
        // 카드 본체
        card.fillStyle(0x131313, 1);
        card.fillRoundedRect(cardX, cardY, cardW, cardH, 20);
        // 테두리
        card.lineStyle(2, 0xffffff, 0.12);
        card.strokeRoundedRect(cardX, cardY, cardW, cardH, 20);

        // 타이틀
        const title = scene.add.text(width/2, cardY + 70, 'GAME OVER', {
            fontFamily: 'Orbitron, Pretendard, Arial',
            fontSize: '48px',
            color: '#ffffff',
        }).setOrigin(0.5).setDepth(1002)
            .setShadow(0, 0, '#ff3b3b', 12); // 은은한 레드 글로우

        // 생존 시간
        const timeText = scene.add.text(width/2, cardY + 140, `생존시간: ${survivedTime} 초`, {
            fontFamily: 'Noto Sans KR, Arial',
            fontSize: '26px',
            color: '#e9ecef'
        }).setOrigin(0.5).setDepth(1002);

        // 로컬 최고기록(옵션)
        let best = Number(localStorage.getItem('dodge_best') || 0);
        if (survivedTime > best) {
            best = survivedTime;
            localStorage.setItem('dodge_best', best);
        }
        const bestText = scene.add.text(width/2, cardY + 176, `최고기록: ${best} 초`, {
            fontFamily: 'Noto Sans KR, Arial',
            fontSize: '16px',
            color: '#8ab4ff'
        }).setOrigin(0.5).setDepth(1002);

        // 버튼들
        const restartBtn = makeUIButton(scene, width/2, cardY + cardH - 66, '다시하기 (R)', () => {
            doRestart(scene);
        });


        // 등장 애니메이션
        [dim, card, title, timeText, bestText, restartBtn].forEach(obj => obj.setAlpha(0));
        [title, timeText, bestText, restartBtn].forEach(obj => obj.setScale(0.9));

        scene.tweens.add({ targets: dim, alpha: 0.55, duration: 200, ease: 'Quad.easeOut' });
        scene.tweens.add({ targets: [card], alpha: 1, duration: 220, delay: 60 });
        scene.tweens.add({ targets: [title, timeText, bestText, restartBtn], alpha: 1, scale: 1.0, duration: 260, delay: 100, ease: 'Back.Out' });

        // 키보드 R로 재시작
        scene.input.keyboard.once('keydown-R',     () => doRestart(scene));
        scene.input.keyboard.once('keydown-ENTER', () => doRestart(scene));
        scene.input.keyboard.once('keydown-SPACE', () => doRestart(scene));

        // 메모리 정리용 핸들
        gameOverUI = { dim, card, title, timeText, bestText, restartBtn };
    }

    function doRestart(scene) {
        // (선택) 페이드아웃 후 재시작
        const targets = gameOverUI ? [
            gameOverUI.dim, gameOverUI.card, gameOverUI.title,
            gameOverUI.timeText, gameOverUI.bestText, gameOverUI.restartBtn
        ] : [];

        scene.tweens.add({
            targets,
            alpha: 0,
            duration: 160,
            onComplete: () => {
                scene.scene.restart();
                gameOver = false;
                startTime = scene.time.now;
                enemySpeed = 100;
                spawnInterval = 1000;
                totalPausedTime = 0;
            }
        });
    }

};