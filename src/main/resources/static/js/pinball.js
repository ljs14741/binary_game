// 문구는 템플릿(pinball.html)이 messages*.properties 에서 읽어 window.PINBALL_I18N 으로 넘긴다.
// 없으면 한국어 기본값. 문구를 고칠 땐 이 파일이 아니라 properties 를 고친다.
const T = Object.assign({
    count:      "{0}명 입력됨",
    countMin:   "(최소 2명 · 최대 30명)",
    countMax:   "(최대 30명 초과!)",
    countOk:    "✓ (최대 30명)",
    msgMin:     "최소 2명 이상 입력해주세요!",
    msgMax:     "최대 30명까지 가능합니다!",
    dupNames:   "같은 이름이 있어요: {0}",
    rankTitle:  "📜 순위",
    rankTitleLoser: "💣 꼴찌 뽑기 · 순위",
    winnerTitle: "🏆 오늘의 1등",
    congrats:   "축하드립니다~!",
    loserTitle: "💣 벌칙 당첨",
    loserReason: "마지막까지 남은 공!",
    rank:       "{0}등",
    more:       "외 {0}명",
    bgmOn:      "🔊 BGM 켜짐",
    bgmOff:     "🔇 BGM 꺼짐",
    fsToggle:   "전체화면",
    fsToggleExit: "🗗 일반 화면"
}, window.PINBALL_I18N || {});
function fmt(t, v) { return t.replace('{0}', String(v)); }

// 폰(좁은 화면)은 세로로 긴 화면을 쓴다. 월드(1000×4000)·물리는 그대로고 한 번에 보이는 높이만 늘어남
const PB_TALL_MQ = '(max-width: 600px)';
const BASE_W = 1000;
function pbViewH() {
    return window.matchMedia && window.matchMedia(PB_TALL_MQ).matches ? 1333 : 720;
}

const config = {
    type: Phaser.AUTO,
    width: BASE_W,
    height: pbViewH(),
    parent: 'pb-canvas',
    backgroundColor: '#0b1220',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // 캔버스는 입력을 안 받음(버튼·입력은 HTML). 그래서 폰에서 게임 위를 밀어도 페이지가 스크롤됨
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    physics: {
        default: 'matter',
        matter: {
            gravity: { y: 1 },
            debug: false,
            // 터널링(공이 벽 통과) 방지: 충돌 반복 횟수를 올려 얇은 벽도 확실히 잡는다.
            positionIterations: 12,
            velocityIterations: 8,
            constraintIterations: 4
        }
    },
    scene: { preload, create, update },
    fps: {
        target: 60,
        forceSetTimeOut: true,
        smoothStep: false
    }
};

let game;
let playerCount = 0;
let playerNicknames = [];
let players = [];
let pendingNames = null;     // 씬 준비 전에 시작을 누르면 여기 뒀다가 create 에서 시작
let pbMode = 'winner';       // winner: 1등 우승 뽑기 / loser: 꼴찌 벌칙 뽑기 (공 하나 남으면 그 공이 꼴찌)
let backgroundMusic;
const NICK_MAX = 10;         // 공 위 이름표 길이 제한
const BALL_RADIUS = 15;
const BALL_DIAM = BALL_RADIUS * 2;
const MatterJS = Phaser.Physics.Matter.Matter;
// ── 아트 팔레트 (뿌셔뿌셔 계열: 납작한 단색 + 두꺼운 잉크 외곽선 + 절제된 색) ──
// 스테이지가 어두운 남색이라 잉크는 near-black, 외곽선 안쪽에 얇은 밝은 림을 둬서 형태가 뜨게 한다.
const PB_INK = 0x0a0e1a;      // 외곽선(거의 검정 남색)
const PB_LINE = 3;            // 외곽선 두께
const PB = {
    peg:     0x7dd3fc,        // 핀 — 하늘
    spinner: 0xf472b6,        // 회전 팔 — 핑크(위험물)
    mover:   0x38bdf8,        // 좌우 왕복 바 — 블루
    deflect: 0xfb7185,        // 가이드 디플렉터 — 로즈
    rail:    0xfbbf24,        // 결승 슬라이드 — 앰버
    barrier: 0x64748b,        // 결승 상단 바리어 — 슬레이트
    goal:    0x34d399,        // 골 — 그린
};
const UI_FONT = "Pretendard, 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, Arial";
const UI = {
    bg: '#0b1220',            // 씬 배경
};

const store = {
    get(k, d) { try { const v = localStorage.getItem('pinball_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pinball_' + k, JSON.stringify(v)); } catch (e) { /* 사파리 프라이빗 등 무시 */ } }
};

// 소리 설정(켜짐·볼륨)은 기억해 둔다
const pbSound = {
    on: store.get('bgm', true) !== false,
    volume: Phaser.Math.Clamp(Number(store.get('volume', 1)), 0, 1) || 0
};

// 캔버스가 실제로 몇 배로 줄어 보이는지 (PC 1, 폰 약 0.35)
function pbViewScale() {
    const cv = game && game.canvas;
    const w = cv ? cv.getBoundingClientRect().width : 0;
    return w ? Math.min(1, w / BASE_W) : 1;
}
// 캔버스 글자 크기: 기본 base, 화면에서 minReal(px) 보다 작아지면 키움
function fpx(base, minReal) {
    return Math.max(base, Math.ceil(minReal / pbViewScale()));
}


function preload() {
    // 절대경로 필수. 상대경로면 /en/pinball·/ja/pinball 에서 /en/assets/… 로 가서 404 → 게임이 안 떴음
    this.load.image('cannon', '/assets/luckyRacing/cannon.png');
    this.load.audio('backgroundMusic', '/assets/luckyRacing/audio/luckyRacingBGM.mp3');
}

function create() {
    // 폰 회전 등으로 화면 모양이 바뀌었으면 판 시작 때 보이는 높이를 다시 잡는다
    const h = pbViewH();
    if (config.height !== h) {
        config.height = h;
        this.scale.setGameSize(BASE_W, h);
    }

    if (!backgroundMusic && this.cache.audio.exists('backgroundMusic')) {
        backgroundMusic = this.sound.add('backgroundMusic', { loop: true });
        this.sound.volume = pbSound.volume;
        if (pbSound.on) backgroundMusic.play();
    }

    this.cameras.main.setBackgroundColor('#222');
    this.cameras.main.setBounds(0, 0, config.width, 4000);
    // 월드 경계 벽을 두껍게(200px) 잡아 빠른 공이 옆으로 새지 않게 한다.
    this.matter.world.setBounds(0, 0, config.width, 4000, 200);

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

    this.matter.world.engine.enableSleeping = false;

    this.cannon = this.add.image(config.width / 2, 4000, 'cannon').setOrigin(0.5, 1);

    window.__pinballScene = this;

    if (pendingNames) {
        const names = pendingNames;
        pendingNames = null;
        startGame(this, names);
    }
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

    // 뿌셔뿌셔 스타일: 납작한 단색 + 두꺼운 잉크 외곽선.
    // 어두운 스테이지에서 형태가 뜨도록 잉크 링 안쪽에 아주 얇은 밝은 림을 하나 둔다.
    const cx = BALL_RADIUS, cy = BALL_RADIUS;
    const g = scene.add.graphics();

    // 1) 잉크 외곽선(공 전체를 잉크색으로 채운 뒤, 안쪽을 단색으로 덮는다)
    g.fillStyle(PB_INK, 1).fillCircle(cx, cy, BALL_RADIUS);
    g.fillStyle(fillColor, 1).fillCircle(cx, cy, BALL_RADIUS - PB_LINE);

    // 2) 아래쪽 살짝 어두운 반달 — 납작하지만 굴러가는 느낌만 최소한
    g.fillStyle(darker(fillColor, 0.72), 1);
    g.beginPath();
    g.arc(cx, cy, BALL_RADIUS - PB_LINE, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
    g.arc(cx, cy + 2, BALL_RADIUS - PB_LINE, Phaser.Math.DegToRad(160), Phaser.Math.DegToRad(20), true);
    g.closePath();
    g.fillPath();

    // 3) 왼쪽 위 하이라이트 도트(납작한 원 하나)
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(cx - BALL_RADIUS * 0.32, cy - BALL_RADIUS * 0.34, BALL_RADIUS * 0.22);

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

function startGame(scene, names) {
    // ✅ 중복 시작/중복 클릭 방지
    if (scene._starting || scene._gameStarted) return;
    scene._starting = true;

    playerNicknames = names.slice(0, 30);
    playerCount = playerNicknames.length;

    // 이하 기존 게임 시작 로직
    scene.cameras.main.setBackgroundColor('#000');
    players = [];
    scene.winner = null;

    const startX = config.width / 2;
    const startY = 3800;
    const launchSpeed = 110;
    const ballColors = buildBallPalette(scene, playerCount);

    const fromLeft = Phaser.Math.Between(0, 1) === 1;
    const SLOT_X = BALL_DIAM + 10;
    const SLOT_Y = BALL_RADIUS + 6;

    const slotOrder = Phaser.Utils.Array.NumberArray(0, playerCount - 1);
    Phaser.Utils.Array.Shuffle(slotOrder);

    const totalWidth  = (playerCount - 1) * SLOT_X;
    const leftAnchor  = startX - totalWidth / 2;
    const rightAnchor = startX + totalWidth / 2;

    // 이름표 글자: 폰에서 화면상 11px 아래로 안 작아지게
    const labelPx = fpx(13, 11);
    const padX = Math.round(labelPx * 1.08), padY = Math.round(labelPx * 0.46);

    for (let i = 0; i < playerCount; i++) {
        // 텍스처 키는 색 기준. 예전엔 ball_${i} 라서 "다시하기"로 팔레트가 다시 섞여도
        // 캐시된 옛 색 공이 그대로 나와 이름표(새 색)와 안 맞았다.
        const colorHex = ballColors[i].toString(16).padStart(6, '0');
        const key = `ball_${colorHex}`;
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

        const displayName = playerNicknames[i];

        // 닉네임 라벨(공 색상 외곽선 배지)
        const nameText = scene.add.text(0, 0, displayName, {
            fontSize: labelPx + 'px',
            fontFamily: UI_FONT,
            fontStyle: '600',
            color: '#e2e8f0',
            stroke: '#000000',
            strokeThickness: Math.max(3, Math.round(labelPx / 4.3))
        }).setOrigin(0.5);

        const pillW = Math.ceil(nameText.width) + padX * 2;
        const pillH = Math.max(22, Math.ceil(nameText.height) + padY);
        const pillKey = `pill_${colorHex}_${pillW}x${pillH}`;   // 같은 이유로 색을 키에 넣는다
        makePillTexture(scene, pillKey, pillW, pillH, ballColors[i], 0x0f1729, 0.78);
        const pillImg = scene.add.image(0, 0, pillKey).setOrigin(0.5);

        const labelDy = Math.round(BALL_RADIUS + pillH / 2 - 1);
        const label = scene.add.container(sx, sy - labelDy, [pillImg, nameText]);
        label.setDepth(500);

        players.push({
            body: player,
            label,
            labelDy,
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

// 같은 이름(공백 정리 + 대소문자 무시) 찾기
function findDuplicateNames(names) {
    const norm = s => (s ?? '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
    const seen = new Set();
    const dup = [];
    for (const n of names) {
        const key = norm(n);
        if (seen.has(key) && !dup.includes(n)) dup.push(n);
        seen.add(key);
    }
    return dup;
}

// 금메달: 리본 두 가닥 + 잉크 외곽선 금색 원판 + 안쪽 링 + "1". size 는 정사각 한 변(px)
function makeMedalTexture(scene, key, size = 96) {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    const cx = size / 2, cy = size * 0.62, r = size * 0.34;

    // 리본 (왼쪽 빨강, 오른쪽 파랑) — 원판 뒤에서 위로 뻗는다
    const ribbon = (color, dir) => {
        g.fillStyle(PB_INK, 1);
        g.fillTriangle(cx + dir * 4, cy - r * 0.5, cx + dir * (r * 1.05), 0, cx + dir * (r * 0.35), 0);
        g.fillStyle(color, 1);
        g.fillTriangle(cx + dir * 4, cy - r * 0.55, cx + dir * (r * 0.95), PB_LINE, cx + dir * (r * 0.42), PB_LINE);
    };
    ribbon(0xe0245e, -1);
    ribbon(0x3b82f6, +1);

    // 원판
    g.fillStyle(PB_INK, 1).fillCircle(cx, cy, r);
    g.fillStyle(0xf5b700, 1).fillCircle(cx, cy, r - PB_LINE);
    g.lineStyle(PB_LINE, 0xc98a00, 1).strokeCircle(cx, cy, r * 0.68);
    g.fillStyle(0xffffff, 0.55).fillCircle(cx - r * 0.35, cy - r * 0.38, r * 0.16);   // 하이라이트
    g.generateTexture(key, size, size);
    g.destroy();

    // 숫자 "1"은 글자로 찍어 텍스처에 합친다 (그래픽스로 그리면 못생긴다)
    const tex = scene.textures.get(key);
    const src = tex.getSourceImage();
    const cvs = document.createElement('canvas');
    cvs.width = size; cvs.height = size;
    const ctx = cvs.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.font = `900 ${Math.round(r * 1.15)}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = PB_LINE * 1.6;
    ctx.strokeStyle = '#' + PB_INK.toString(16).padStart(6, '0');
    ctx.strokeText('1', cx, cy + r * 0.06);
    ctx.fillStyle = '#fff7d6';
    ctx.fillText('1', cx, cy + r * 0.06);
    scene.textures.remove(key);
    scene.textures.addCanvas(key, cvs);
}

// 둥근 배지 텍스처 생성(필 + 테두리)
function makePillTexture(scene, key, w, h, strokeColor = 0xffffff, fillColor = 0x0f1729, fillA = 0.78) {
    if (scene.textures.exists(key)) return;
    const r = Math.floor(h / 2);
    const g = scene.add.graphics();
    g.fillStyle(fillColor, fillA).fillRoundedRect(0, 0, w, h, r);
    g.lineStyle(Math.max(2, Math.round(h / 11)), strokeColor, 0.95).strokeRoundedRect(0.5, 0.5, w - 1, h - 1, r - 1);
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
    const minimapWidth = 194;
    const minimapZoom = minimapWidth / config.width;
    // 세로 화면에선 월드 전체가 들어가는 높이까지
    const minimapHeight = Math.min(config.height - 126, Math.round(4000 * minimapZoom));

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
        // 플링코 핀 — 물리 반지름(10)과 크기를 맞춘다(예전엔 시각 6, 물리 10으로 어긋났다)
        makePegTexture(scene, 'pegDot', 10);
        // 업드래프트 ↑ 타일 — 타일 하나에 깔끔한 위쪽 셰브론 하나(세로로 이어져 바람길이 된다)
        if (!scene.textures.exists('upTile')) {
            const g = scene.add.graphics();
            g.lineStyle(5, 0x93c5fd, 0.5);
            g.beginPath(); g.moveTo(12, 34); g.lineTo(24, 18); g.lineTo(36, 34); g.strokePath();
            g.generateTexture('upTile', 48, 48); g.destroy();
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
        makeFlatBar(scene, key, w, 20, color);
        // 반발을 0.6→0.9 로 올린다. 낮으면 공이 왕복 바 위에 얹혀 안 떨어지고 끼었다.
        // (여전히 1 미만이라 에너지가 늘지 않아 터널링은 없다)
        const img = scene.matter.add.image(x, y, key, null, { restitution: 0.9 });
        img.setOrigin(0.5).setFriction(0).setFrictionStatic(0).setFrictionAir(0);
        return img;
    }

    // ── 도우미: 미끄러지는 가이드 디플렉터
    function createDeflector(x, y, width, angleDeg, color = PB.deflect, restitution = 0.35, thickness = 18) {
        const key = `deflect_${width}_${thickness}_${color.toString(16)}`;
        makeFlatBar(scene, key, width, thickness, color);
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
    createSpinner(config.width/2, 900, 240, 0.10, PB.spinner, true);
    createMover  (config.width/2, 1200, 180, 180, 1700, PB.mover);

    // 🔻 1구간(첫 플링코 앞) 디플렉터
    (function placeFirstPegDeflectors(){
        const y = 1520;               // 첫 플링코(1650) 직전
        const inset = 90;             // 좌/우 가장자리에서 안쪽으로
        const width = 220;            // 디플렉터 길이
        createDeflector(inset,                 y, width,  +24, PB.deflect, 0.35); // 좌측: \ 방향
        createDeflector(config.width - inset,  y, width,  -24, PB.deflect, 0.35); // 우측: / 방향
    })();

    // 첫 번째 플링코
    createPegFieldFullWidth(1650, 7, 70, 24, 10, 0.85);

    // 🔻 2구간(두 번째 플링코 앞) 디플렉터 — 요청 추가
    (function placeSecondPegTopDeflectors(){
        const y = 2120;               // 두 번째 플링코(2200) 직전
        const inset = 90;
        const width = 220;
        createDeflector(inset,                 y, width,  +24, PB.deflect, 0.35);
        createDeflector(config.width - inset,  y, width,  -24, PB.deflect, 0.35);
    })();

    // 두 번째 플링코
    createPegFieldFullWidth(2200, 7, 70, 24, 10, 0.85);

    // 하단 스피너/왕복
    createSpinner (config.width/2, 3050, 280, -0.11, PB.spinner, true);
    createMover   (config.width/2 - 120, 3300, 140, 220, 1400, PB.mover);
    createMover   (config.width/2 + 120, 3450, 140, -220, 1400, PB.mover);

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
    const slideHeight = 18;   // 10 → 18: 얇은 벽 관통 방지

    const leftAngleDeg  = Phaser.Math.RadToDeg(Math.atan2(mergePointY - leftPathStartY,  mergePointX - leftPathStartX));
    const rightAngleDeg = Phaser.Math.RadToDeg(Math.atan2(mergePointY - rightPathStartY, mergePointX - rightPathStartX));

    // ── 슬라이드(정적 바디)
    const slideKey = `slide_${Math.round(slideLength)}`;
    makeFlatBar(scene, slideKey, Math.round(slideLength), slideHeight, PB.rail);

    const leftSlide = scene.matter.add.image(goalX - 60, goalY - 200, slideKey, null, { isStatic: true });
    leftSlide.setOrigin(0.5).setAngle(leftAngleDeg);

    const rightSlide = scene.matter.add.image(goalX + 60, goalY - 200, slideKey, null, { isStatic: true });
    rightSlide.setOrigin(0.5).setAngle(rightAngleDeg);

    // ── 상단 가로 바리어(좌/우)
    const barrierY = leftPathStartY - 5;
    const barrierThickness = 18;   // 10 → 18: 얇은 벽 관통 방지

    const leftWidth  = leftPathStartX;
    const rightWidth = config.width - rightPathStartX;

    const leftKey  = `barrier_L_${leftWidth}`;
    const rightKey = `barrier_R_${rightWidth}`;
    makeFlatBar(scene, leftKey,  leftWidth,  barrierThickness, PB.barrier);
    makeFlatBar(scene, rightKey, rightWidth, barrierThickness, PB.barrier);

    // ⚠ restitution 을 1.2 로 두면 튕길 때마다 에너지가 늘어(반발계수>1) 공이 점점 빨라져
    //    결국 벽을 뚫었다. 0.6 으로 낮춰 에너지 증가를 없앤다. 초기 튕김은 bounceOnBarrier 가 담당.
    const leftBarrier  = scene.matter.add.image(leftWidth / 2, barrierY, leftKey,  null, { isStatic: true, restitution: 0.6, friction: 0 });
    const rightBarrier = scene.matter.add.image(rightPathStartX + rightWidth / 2, barrierY, rightKey, null, { isStatic: true, restitution: 0.6, friction: 0 });

    // ✅ 중앙(갭) 방향으로 아주 살짝 경사
    leftBarrier.setAngle(+2);   // 오른쪽(중앙)으로 내려가도록
    rightBarrier.setAngle(-2);  // 왼쪽(중앙)으로 내려가도록

    scene.leftBarrierBody  = leftBarrier.body;
    scene.rightBarrierBody = rightBarrier.body;

    // 골인 이미지(장식) — 코드로 그린 납작한 과녁(잉크 외곽선 + 단색 링)
    if (!scene.textures.exists('goalFlat')) {
        const gg = scene.add.graphics();
        const C = 100;
        const ring = (rad, col) => { gg.fillStyle(PB_INK, 1).fillCircle(C, C, rad); gg.fillStyle(col, 1).fillCircle(C, C, rad - PB_LINE - 1); };
        ring(88, PB.goal);
        ring(60, 0xf8fafc);
        ring(34, PB.goal);
        gg.fillStyle(PB_INK, 1).fillCircle(C, C, 12);
        gg.generateTexture('goalFlat', 200, 200);
        gg.destroy();
    }
    scene.goalImage = scene.add.image(goalX, goalY, 'goalFlat').setDisplaySize(200, 200);

    // 골인 센서 — 예전엔 100×100 이라 바닥에 닿은 공이 x가 조금만 어긋나도 골에 안 들어가고
    // 깔때기에서 계속 튕겼다("골에 안 들어감" 버그). 깔때기 목을 덮도록 넓혀 바닥에 도달한
    // 공이 확실히 잡히게 한다. 어느 공이 먼저 도달하느냐는 그대로라 확률·공정성은 불변.
    const goalKey = `goalSensor`;
    makeSolidTexture(scene, goalKey, 340, 200, 0x00ff00, 0); // 보이지 않는 센서(깔때기 양옆 사각지대까지 덮는다)
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

        // 충분히 내려오고 있을 때만 위로 반전.
        // 원래 값은 mult 2 · floor -15 · 상한 없음. 진짜 문제는 mult 2 였다 — 튈 때마다 낙하속도의
        // 2배로 차올리니 높이가 기하급수로 커져 맵 위까지 날아가 골에 안 들어갔다.
        // 한 번 8~11 로 확 줄였더니 "통통 튀는 맛"이 죽어서(정점 230px → 80px) 되돌린다:
        //   floor -15 는 그대로(예전 높이), mult 1 로 누적을 끊고, 상한 -18 로 폭주를 막는다.
        // 결국 ON/OFF 주기(1000/700ms)의 OFF 구간에 떨어져 골로 간다. 모든 공 동일 → 공정성 불변.
        if (v.y > 0.8) {
            const mult = 1.0;
            const floorVy = -15.0;
            const targetVy = Math.max(-18, Math.min(floorVy, -v.y * mult));
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
                // 연속 상승력이 너무 세면(원래 최대 0.126) 공이 골 위에 떠서 안 내려온다.
                // 0.03 까지 낮췄더니 레일에서 다시 튀어오르는 느낌이 죽어 0.05 로 절충.
                // 바람은 느끼되 결국 골로 가라앉는다(모든 공 동일 → 공정성 불변).
                const scale = Phaser.Math.Clamp(vy * 0.03, 0, 0.05);
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

// 납작한 바 텍스처(뿌셔뿌셔 스타일): 두꺼운 잉크 외곽선 + 단색 + 위쪽 밝은 띠.
// 물리 바디는 이 텍스처의 w×h 그대로라 충돌 크기는 바뀌지 않는다(연출만).
function makeFlatBar(scene, key, w, h, color) {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    const r = Math.min(h, w) / 2;                 // 캡슐형 라운드
    g.fillStyle(PB_INK, 1).fillRoundedRect(0, 0, w, h, r);
    const iw = Math.max(1, w - PB_LINE * 2), ih = Math.max(1, h - PB_LINE * 2);
    const ir = Math.max(0, r - PB_LINE);
    g.fillStyle(color, 1).fillRoundedRect(PB_LINE, PB_LINE, iw, ih, ir);
    // 위쪽 밝은 띠 + 아래쪽 살짝 어둡게(납작한 2톤)
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(PB_LINE + 1, PB_LINE + 1, iw - 2, Math.max(2, ih * 0.32), ir);
    g.fillStyle(0x000000, 0.16).fillRoundedRect(PB_LINE + 1, PB_LINE + ih * 0.7, iw - 2, Math.max(1, ih * 0.28), ir);
    g.generateTexture(key, w, h);
    g.destroy();
}

// 핀(플링코) 텍스처: 잉크 외곽선 + 단색 + 하이라이트. 물리 반지름 r 과 크기를 맞춘다.
function makePegTexture(scene, key, r) {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    const c = r;
    g.fillStyle(PB_INK, 1).fillCircle(c, c, r);
    g.fillStyle(PB.peg, 1).fillCircle(c, c, r - PB_LINE);
    g.fillStyle(0xffffff, 0.8).fillCircle(c - r * 0.28, c - r * 0.3, r * 0.28);
    g.generateTexture(key, r * 2, r * 2);
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

    // 1등 HUD (게임은 계속 진행). 꼴찌 뽑기에선 1등은 조용히 넘어감
    if (p.rank === 1 && pbMode === 'winner') {
        scene.winner = p;
        pbUI.showActions();
        showWinnerUI(scene, name);
    }

    updateLeaderboard(scene);

    if (scene.finishOrder.length === players.length) {
        showAllFinishedMessage(scene);
    } else if (pbMode === 'loser' && scene.finishOrder.length === players.length - 1) {
        // 공이 하나만 남으면 그 공이 꼴찌로 확정. 끼어 있어도 기다리지 않고 바로 결과
        showLoserResult(scene, players.find(q => !q.finished));
    }
}

function showLoserResult(scene, loser) {
    if (scene._raceOverShown || !loser) return;
    scene._raceOverShown = true;
    const ranking = scene.finishOrder.map(p => ({ rank: p.rank, name: p.name, color: hexToCss(p.color || 0xffffff) }));
    ranking.push({ rank: players.length, name: loser.name, color: hexToCss(loser.color || 0xffffff) });
    scene.time.delayedCall(700, () => pbUI.showResult(ranking));
}

function showAllFinishedMessage(scene) {
    if (scene._raceOverShown) return;           // 가드
    scene._raceOverShown = true;

    // ✨ 무한 컨페티 시작 (다시하기 전까지 유지)
    playFullScreenConfettiForever(scene);

    // 마지막 공이 들어가는 걸 잠깐 보여준 뒤 결과 카드
    const ranking = (scene.finishOrder || []).map(p => ({ rank: p.rank, name: p.name, color: hexToCss(p.color || 0xffffff) }));
    scene.time.delayedCall(900, () => pbUI.showResult(ranking));
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
    // 폰에서도 화면상 12px 이상
    const rightPad = 8;
    scene._lbFont     = fpx(14, 12);
    const k = scene._lbFont / 14;
    scene._lbRightX   = config.width - rightPad;
    scene._lbLineH    = Math.round(22 * k);
    scene._lbNameMaxW = Math.round(160 * k);

    // 제목 텍스트
    const title = scene.add.text(scene._lbRightX, 8, pbMode === 'loser' ? T.rankTitleLoser : T.rankTitle, {
        fontSize: fpx(16, 13) + 'px',
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
    // 아래쪽(1등 메달·버튼 자리)은 비워 두고, 넘치는 인원은 "외 N명"으로
    scene._lbMaxRows = Math.max(3, Math.floor((config.height * 0.8 - scene._lbStartY) / scene._lbLineH));

    scene.lbItems = [];
    scene._lbMore = scene.add.text(scene._lbRightX, 0, '', {
        fontSize: scene._lbFont + 'px', fontFamily: UI_FONT, color: '#94a3b8',
        stroke: '#000000', strokeThickness: 3
    }).setOrigin(1, 0).setScrollFactor(0).setVisible(false);
    layer.add(scene._lbMore);
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
    const k = scene._lbLineH / 22;
    const GAP_ICON_NAME = Math.round(8 * k);
    const GAP_NAME_RANK = Math.round(16 * k);
    const lbStyle = (color) => ({
        fontSize: scene._lbFont + 'px', fontFamily: UI_FONT, color,
        stroke: '#000000', strokeThickness: 3
    });

    const makeOrUpdate = (i, p, rank) => {
        const yTop = startY + i * lineH;

        let line = scene.lbItems[i];
        if (!line) {
            const iconTx = scene.add.text(rightX, yTop, "", lbStyle('#ffffff')).setOrigin(1, 0).setScrollFactor(0);
            const nameTx = scene.add.text(rightX, yTop, "", lbStyle('#e2e8f0')).setOrigin(1, 0).setScrollFactor(0);
            const rankTx = scene.add.text(rightX, yTop, "", lbStyle('#94a3b8')).setOrigin(1, 0).setScrollFactor(0);

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
        line.rankTx.setText(fmt(T.rank, rank)).setColor(rankColor(rank));

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

    const maxRows = scene._lbMaxRows || sorted.length;
    const shown = sorted.length > maxRows ? maxRows - 1 : sorted.length;
    for (let i = 0; i < shown; i++) {
        const p = sorted[i];
        const rank = p.finished ? p.rank : (i + 1);
        makeOrUpdate(i, p, rank);
    }
    if (scene._lbMore) {
        scene._lbMore.setVisible(shown < sorted.length)
            .setText(fmt(T.more, sorted.length - shown))
            .setPosition(rightX, startY + shown * lineH);
    }

    // 남는 라인 정리
    for (let j = shown; j < (scene.lbItems?.length || 0); j++) {
        const l = scene.lbItems[j];
        l.iconTx.destroy(); l.nameTx.destroy(); l.rankTx.destroy();
    }
    scene.lbItems.length = shown;
}

function softRestart(scene){
    // 1) 파티클/트윈/타이머/리스너 정리
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
    players = [];
    // ❗️닉네임은 유지해서 "다시하기"에 씀
    // playerNicknames = [];  // ← 지우지 마!

    if (scene) {
        scene._starting = false;
        scene._gameStarted = false;
        scene._collisionsReady = false;
        if (scene._updraftUpdater) {
            try { scene.events.off('update', scene._updraftUpdater); } catch(e) {}
        }
        scene._updraftUpdater = null;
        scene._winHudShown = false;
        scene._raceOverShown = false;
    }

    // 배경음은 유지
    window.__pinballScene = null;
}

// 우승 표시는 우측 하단 한 줄: 메달 + 닉네임 (배경 없음)
function showWinnerUI(scene, winnerName) {
    if (scene._winHudShown) return;
    scene._winHudShown = true;

    const winner = scene.winner;
    const nameColor = hexToCss(winner?.color || 0xffffff);

    const hud = scene.add.layer().setDepth(7500);
    if (scene.minimapCamera) scene.minimapCamera.ignore(hud);

    // ====== 튜닝값 ======
    // 우측 하단에 붙인다. 하단 가운데는 골 과녁과 겹쳤고, 좌측 하단은 다시하기 버튼(HTML) 자리다.
    const GAP = 14;                 // 메달 ↔ 이름 간격
    const MEDAL_RATIO = 1.7;        // 메달 높이 = 이름 글자 크기 × 이 값 (이모지 시절 0.8 → 눈에 띄게 키움)
    const RIGHT_PAD = 18;           // 화면 오른쪽과의 간격
    const BOTTOM_PAD = 14;          // 화면 바닥과의 간격
    const MAX_W = Math.floor(config.width * 0.6); // 한 줄 최대 폭 (왼쪽 다시하기 버튼과 안 겹치게)
    // ====================

    // 금메달은 이모지 대신 그린다 (기기마다 다르게 보이는 문제도 없고, 크기도 마음대로)
    makeMedalTexture(scene, 'medal_gold', 96);
    const medalImg = scene.add.image(0, 0, 'medal_gold')
        .setScrollFactor(0).setOrigin(1, 1);     // ★ 우측·하단 기준

    const nameTx = scene.add.text(0, 0, winnerName || "", {
        fontFamily: "Arial Black, system-ui",
        fontSize: "20px",
        color: nameColor,
        stroke: "#000000",
        strokeThickness: 6,
        shadow: { color: "#000", blur: 6, fill: true, offsetY: 2 }
    }).setScrollFactor(0).setOrigin(1, 1);       // ★ 우측·하단 기준

    hud.add(medalImg);
    hud.add(nameTx);

    // 크기/배치 자동 맞춤: 오른쪽 끝에 이름, 그 왼쪽에 메달. 둘의 아래선을 맞춘다
    const fitRow = (minPx = fpx(30, 14), maxPx = fpx(44, 16)) => {
        let lo = minPx, hi = maxPx, best = minPx;
        const medalW = (px) => Math.round(px * MEDAL_RATIO);   // 메달 텍스처는 정사각형
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;                 // 이름 폰트 크기
            nameTx.setFontSize(mid);
            const totalW = medalW(mid) + GAP + nameTx.width;
            if (totalW <= MAX_W) { best = mid; lo = mid + 1; }
            else hi = mid - 1;
        }
        nameTx.setFontSize(best);
        const m = medalW(best);
        medalImg.setDisplaySize(m, m);

        const xRight  = config.width - RIGHT_PAD;
        let yBottom = config.height - BOTTOM_PAD;
        // 폰처럼 좁으면 다시하기 버튼과 가로로 겹침 → 버튼 위로 올림
        const bar = document.getElementById('pb-actions');
        const cv = scene.game.canvas;
        if (bar && !bar.hidden && cv) {
            const vs = pbViewScale();
            const cr = cv.getBoundingClientRect(), br = bar.getBoundingClientRect();
            const barRight = (br.right - cr.left) / vs, barTop = (br.top - cr.top) / vs;
            const rowLeft = xRight - nameTx.width - GAP - m;
            if (rowLeft < barRight + 16) yBottom = Math.round(barTop - 14);
        }
        nameTx.setPosition(xRight, yBottom);
        medalImg.setPosition(xRight - nameTx.width - GAP, yBottom + 4);   // 메달 리본이 글자 밑선보다 살짝 내려오게
    };
    fitRow();

    // 간단한 페이드 인 + 메달이 살짝 커졌다 제자리
    scene.tweens.add({
        targets: [medalImg, nameTx],
        alpha: { from: 0, to: 1 },
        duration: 200,
        ease: "Quad.easeOut"
    });
    scene.tweens.add({
        targets: medalImg,
        scale: { from: medalImg.scale * 1.5, to: medalImg.scale },
        duration: 420,
        ease: "Back.easeOut"
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
            p.label.setPosition(p.body.x, p.body.y - p.labelDy);

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
            let speed = Math.hypot(v.x, v.y);
            const pos = mBody.position;

            // ── 속도 상한 클램프(폭주 안전망) ──
            // ⚠ 이 게임은 바닥에서 공을 위로 쏘아 올린다(발사속도 110). 상한을 낮게 잡으면
            //    발사가 잘려 공이 위로 못 올라간다(원래 룰: 아래→위→낙하). 그래서 발사보다
            //    높은 140 으로 잡아, 반발계수>1 로 인한 폭주만 잘라내고 발사·정상 플레이는 건드리지 않는다.
            //    (터널링은 벽 두께 상향 + 충돌 반복 횟수 상향으로 이미 막았다)
            const MAX_SPEED = 140;
            if (speed > MAX_SPEED) {
                const k = MAX_SPEED / speed;
                MatterJS.Body.setVelocity(mBody, { x: v.x * k, y: v.y * k });
                speed = MAX_SPEED;
            }

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

// 광고·폰트 로딩(onload)을 기다리지 않고 바로 띄움
game = new Phaser.Game(config);

// ============================================================
// HTML UI (참가자 입력 · 다시하기 · 결과 카드 · 소리 · 전체화면)
// ============================================================
const pbUI = (() => {
    const $ = (id) => document.getElementById(id);
    const stage = $('game-container');
    const setupEl = $('pb-setup');
    const actionsEl = $('pb-actions');
    const resultEl = $('pb-result');
    const namesEl = $('pbNamesInput');
    const countEl = $('pbCount');
    const msgEl = $('pbMsg');
    const startBtn = $('pbStartBtn');
    let msgTimer = 0;

    // 줄바꿈·쉼표로 나눔. 이름표가 공 위에 붙으니 10자까지만
    const parseNames = (raw) => raw.split(/[\n,，、]+/).map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, NICK_MAX));

    function updateCount() {
        const n = parseNames(namesEl.value).length;
        const ok = n >= 2 && n <= 30;
        countEl.textContent = fmt(T.count, n) + ' ' + (n < 2 ? T.countMin : n > 30 ? T.countMax : T.countOk);
        countEl.classList.toggle('ok', ok);
        startBtn.classList.toggle('ready', ok);
    }
    function showMsg(text) {
        msgEl.textContent = text;
        clearTimeout(msgTimer);
        msgTimer = setTimeout(() => { msgEl.textContent = ''; }, 3000);
    }

    function hideAll() {
        setupEl.hidden = true;
        actionsEl.hidden = true;
        resultEl.hidden = true;
        stage.classList.remove('pb-has-panel');
    }
    function showSetup() {
        hideAll();
        setupEl.hidden = false;
        stage.classList.add('pb-has-panel');
        updateCount();
    }
    function showActions() {
        if (!resultEl.hidden) return;
        actionsEl.hidden = false;
    }
    function showResult(ranking) {
        const list = resultEl.querySelector('.pb-rank-list');
        const nameEl = resultEl.querySelector('.pb-result-name');
        const loser = pbMode === 'loser';
        const pick = loser ? ranking[ranking.length - 1] : ranking[0];
        resultEl.querySelector('.pb-result-kicker').textContent = loser ? T.loserTitle : T.winnerTitle;
        resultEl.querySelector('.pb-result-reason').textContent = loser ? T.loserReason : T.congrats;
        resultEl.querySelector('.pb-result-card').classList.toggle('is-loser', loser);
        nameEl.textContent = pick ? pick.name : '—';
        nameEl.style.setProperty('--pb-c', pick ? pick.color : '#2dd4bf');
        resultEl.querySelector('.pb-result-card').classList.toggle('long', ranking.length > 8);
        list.innerHTML = '';
        ranking.forEach((r) => {
            const li = document.createElement('li');
            if (loser && r === pick) li.className = 'loser';
            else if (r.rank <= 3) li.className = 'top' + r.rank;
            const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = fmt(T.rank, r.rank);
            const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = r.color;
            const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
            li.append(rk, dot, nm);
            list.appendChild(li);
        });
        actionsEl.hidden = true;
        setupEl.hidden = true;
        resultEl.hidden = false;
        stage.classList.add('pb-has-panel');
        // 꼴찌 뽑기면 당첨자(맨 아래)가 보이게
        if (loser) list.scrollTop = list.scrollHeight;
        const first = resultEl.querySelector('[data-act="restart"]');
        if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
    }

    function resumeAudio() {
        try { if (game?.sound?.context && game.sound.context.state !== 'running') game.sound.context.resume(); } catch (e) { /* 무시 */ }
    }

    // 새 판 시작. 이미 한 판 돌았으면 씬을 새로 띄운 뒤 create 에서 시작
    function run(names) {
        hideAll();
        resumeAudio();
        const scene = window.__pinballScene;
        if (scene && !scene._gameStarted && !scene._starting) {
            startGame(scene, names);
        } else {
            pendingNames = names;
            if (scene) softRestart(scene);
        }
    }

    // ── 모드 (1등 / 꼴찌) ──
    const modeBtns = [...setupEl.querySelectorAll('.pb-mode [data-mode]')];
    const setMode = (m) => {
        pbMode = m === 'loser' ? 'loser' : 'winner';
        modeBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === pbMode)));
    };
    setMode(store.get('mode', 'winner'));
    modeBtns.forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.mode); store.set('mode', pbMode); }));

    // ── 참가자 입력 ──
    const saved = store.get('names', null);
    if (Array.isArray(saved) && saved.length) {
        // 예전 판에서 빈칸이 P1·P2… 로 저장된 건 빼고 복원
        const restored = saved.map((v) => (v ?? '').toString().trim()).filter((v) => v && !/^P\d+$/.test(v));
        namesEl.value = restored.slice(0, 30).join('\n');
    }
    updateCount();
    namesEl.addEventListener('input', updateCount);
    namesEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); startBtn.click(); }
    });
    startBtn.addEventListener('click', () => {
        const names = parseNames(namesEl.value);
        if (names.length < 2) return showMsg(T.msgMin);
        if (names.length > 30) return showMsg(T.msgMax);
        const dup = findDuplicateNames(names);
        if (dup.length) return showMsg(fmt(T.dupNames, dup.join(', ')));
        msgEl.textContent = '';
        store.set('names', names);
        run(names);
    });

    // ── 다시하기 / 새로 입력 ──
    const onAct = (e) => {
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'restart' && playerNicknames.length >= 2) {
            run(playerNicknames.slice());
        } else {
            const scene = window.__pinballScene;
            pendingNames = null;
            if (scene && (scene._gameStarted || scene._starting)) softRestart(scene);
            showSetup();
        }
    };
    actionsEl.addEventListener('click', onAct);
    resultEl.addEventListener('click', onAct);

    // ── 소리 ──
    const bgmToggle = $('bgmToggle');
    const volumeCtrl = $('volumeControl');
    if (volumeCtrl) volumeCtrl.value = String(Math.round(pbSound.volume * 100));
    const applySound = () => {
        if (bgmToggle) {
            bgmToggle.textContent = pbSound.on ? T.bgmOn : T.bgmOff;
            bgmToggle.setAttribute('aria-pressed', String(pbSound.on));
        }
        if (game?.sound) game.sound.volume = pbSound.volume;
        if (!backgroundMusic) return;
        if (pbSound.on) {
            if (backgroundMusic.isPaused) backgroundMusic.resume();
            else if (!backgroundMusic.isPlaying) backgroundMusic.play();
        } else if (backgroundMusic.isPlaying) {
            backgroundMusic.pause();
        }
    };
    applySound();
    bgmToggle?.addEventListener('click', () => {
        pbSound.on = !pbSound.on;
        store.set('bgm', pbSound.on);
        resumeAudio();
        applySound();
    });
    if (volumeCtrl) {
        const onVol = () => {
            pbSound.volume = Number(volumeCtrl.value) / 100;
            store.set('volume', pbSound.volume);
            if (game?.sound) game.sound.volume = pbSound.volume;
        };
        volumeCtrl.addEventListener('input', onVol);
        volumeCtrl.addEventListener('change', onVol);
    }
    document.addEventListener('visibilitychange', () => {
        if (!backgroundMusic) return;
        if (document.hidden) backgroundMusic.pause();
        else if (pbSound.on) backgroundMusic.resume();
    });

    // ── 전체화면 (게임 박스만). 지원 안 하는 브라우저(아이폰 사파리 등)는 버튼을 숨김 ──
    const fsToggle = $('fsToggle');
    const fsExit = $('pbFsExitBtn');
    const fsEnabled = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    const isFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    const exitFS = () => { if (isFS()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); };
    const refresh = () => requestAnimationFrame(() => { try { game?.scale.refresh(); } catch (e) { /* 무시 */ } });
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
        fsToggle?.addEventListener('click', () => {
            if (isFS()) exitFS();
            else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
        });
        fsExit?.addEventListener('click', exitFS);
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onFsChange);
    }

    // 회전 등으로 화면 모양이 바뀌면 대기 중일 때 바로 새로 띄움 (경기 중이면 다음 판부터)
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const scene = window.__pinballScene;
            if (scene && !scene._gameStarted && !scene._starting && pbViewH() !== config.height) softRestart(scene);
        }, 250);
    });

    return { showSetup, showActions, showResult, applySound };
})();
