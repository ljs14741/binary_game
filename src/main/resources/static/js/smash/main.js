import * as THREE from 'three';
import { World, UNIT_M, pointInPolygon, distToPolygon } from './world.js';
import { FX } from './fx.js';
import { Boss, Sign, Banner, FONT, BOSS_LOOK, BOSS_COLORS } from './props.js';
import { Street } from './street.js';
import { Landmarks } from './landmarks.js';
import { Labels } from './labels.js';
import { Clip } from './clip.js';
import { Weapons, WEAPONS, NUKE } from './weapons.js';
import { fakeArea } from './fallback.js';
import { initAudio, sfx, setMuted, isMuted, setBgmVolume, bgmVolume, audioStream } from './audio.js';
import T, { fmt, score, RANKS, LINES } from './text.js';

const $ = id => document.getElementById(id);
const stage = $('smash-stage');
const box = $('smash-canvas');
const ui = {
    start: $('smash-start'), name: $('smash-name'), go: $('smash-go'), results: $('smash-results'), msg: $('smash-msg'), fake: $('smash-fake'),
    loading: $('smash-loading'), skip: $('smash-skip'), loadingText: $('smash-loading-text'), loadingTip: $('smash-loading-tip'),
    corp: $('smash-corp'), money: $('smash-money'), goal: $('smash-goal'), ratio: $('smash-ratio'), bar: $('smash-bar'),
    rank: $('smash-rank'), combo: $('smash-combo'), toast: $('smash-toast'), bubble: $('smash-bubble'),
    pops: $('smash-pops'), weapons: $('smash-weapons'), wname: $('smash-wname'), mute: $('smash-mute'), full: $('smash-full'), home: $('smash-home'),
    nuke: $('smash-nuke'), aim: $('smash-aim'), flash: $('smash-flash'), osm: $('smash-osm'), finishBtn: $('smash-finish'), bgm: $('smash-bgm'),
    help: $('smash-help'), tut: $('smash-tut'), tutOk: $('smash-tut-ok'), keys: $('smash-keys'),
    end: $('smash-end'), endTitle: $('smash-end-title'), endSub: $('smash-end-sub'), endStats: $('smash-end-stats'),
    again: $('smash-again'), keep: $('smash-keep'), other: $('smash-other'), share: $('smash-share'), hint: $('smash-hint'),
};

const coarse = matchMedia('(pointer: coarse)').matches;
const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 사생활 모드 */ } },
};
const track = (name, params) => { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); };
const pick = a => a[Math.floor(Math.random() * a.length)];

// ── 상사 꾸미기: 이름·직함 + 얼굴·옷·소품. 이 기기에 저장하고, 상사 랭킹에는 이름 + 직함만 보냄 ──
const BOSS_DEFAULT = { name: '', title: '사장님', ...BOSS_LOOK };
const bossLook = loadBossLook();
/** 저장된 꾸미기 읽기. 예전 값(안경 true/false, 수염 칸 없음)도 받고, 모르는 값은 기본으로 */
function loadBossLook() {
    let s = {};
    try { s = JSON.parse(store.get('smash.boss') || '{}') || {}; } catch (e) { /* 깨진 값은 버림 */ }
    const L = { ...BOSS_DEFAULT };
    if (typeof s.name === 'string') L.name = s.name.slice(0, 6);
    if (typeof s.title === 'string' && s.title.trim()) L.title = s.title.slice(0, 8);
    if (s.glasses === true) s.glasses = 'horn';
    else if (s.glasses === false) s.glasses = 'none';
    // 예전엔 여자 상사면 수염이 없었음
    if (s.beard === undefined && s.gender === 'f') s.beard = 'none';
    for (const k of Object.keys(T.bossOpts)) {
        const ok = k === 'suit' ? s[k] in BOSS_COLORS : T.bossOpts[k].some(([v]) => v === s[k]);
        if (ok) L[k] = s[k];
    }
    return L;
}
function bossLabel() {
    const n = (bossLook.name || '').trim();
    return n ? `${n} ${bossLook.title}` : bossLook.title;
}
function applyBossLook() {
    boss.setLook({ ...bossLook, label: bossLabel() });
    street.setBossTag(fmt(T.bossCarTag, bossLook.title));
    finder.name.textContent = bossLook.title;
    if (preview.boss) preview.boss.setLook({ ...bossLook, label: bossLabel() });
}

/** 상사 꾸미기 미리보기: 메뉴를 처음 열 때 작은 3D 화면을 만들고, 열려 있는 동안만 그린다 */
const preview = { renderer: null, scene: null, camera: null, boss: null, t: 0, focus: 0, f: 0 };
function initBossPreview() {
    if (preview.renderer) return;
    const cv = $('smash-boss-canvas');
    preview.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    preview.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    preview.scene = new THREE.Scene();
    preview.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 2.3));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
    key.position.set(3, 5, 6);
    preview.scene.add(key);
    preview.camera = new THREE.PerspectiveCamera(28, 2, 0.1, 50);
    preview.boss = new Boss(preview.scene);
    preview.boss.reset(0, 0, 0, 1);
    preview.boss.setLook({ ...bossLook, label: bossLabel() });
    sizeBossPreview();
}
function sizeBossPreview() {
    const cv = $('smash-boss-canvas');
    const w = cv.clientWidth || 300, h = cv.clientHeight || 170;
    preview.renderer.setSize(w, h, false);
    preview.camera.aspect = w / h;
    preview.camera.updateProjectionMatrix();
}
function drawBossPreview(dt) {
    if (!preview.renderer || $('smash-bosssheet').hidden) return;
    preview.t += dt;
    const b = preview.boss;
    // 얼굴 탭에선 얼굴 가까이, 나머지는 온몸 (focus 0 → 1 로 부드럽게)
    preview.f += (preview.focus - preview.f) * Math.min(1, dt * 6);
    const f = preview.f;
    // 좁은 화면(PC 세로 미리보기)은 들고 있는 골프채까지 들어오게 조금 물러남
    const span = 2 * Math.tan(THREE.MathUtils.degToRad(preview.camera.fov / 2)) * preview.camera.aspect;
    const far = Math.max(8.2, 3.1 / span), near = Math.max(3.6, 1.6 / span);
    preview.camera.position.set(0, 2.35 + f * 0.35, far + (near - far) * f);
    preview.camera.lookAt(0, 2.05 + f * 0.45, 0);
    b.group.rotation.set(0, Math.sin(preview.t * 0.6) * (0.9 - f * 0.45), 0);
    b.armR.rotation.z = 2.4 + Math.sin(preview.t * 6) * 0.35;
    b.armR.rotation.x = -0.3;
    b.armL.rotation.z = -0.25 + Math.sin(preview.t * 3) * 0.1;
    b.body.position.y = Math.abs(Math.sin(preview.t * 3)) * 0.05;
    preview.renderer.render(preview.scene, preview.camera);
}
/*
 * 욕설·비하 거르기. 상사 이름·직함은 간판·말풍선·캡처·상사 랭킹으로 퍼질 수 있다
 * ("이진수 과장씹색기" 같은 것). 띄어쓰기·숫자·기호를 빼고 찾는다 — "씹 색 기", "ㅅ1발" 도 걸리게.
 */
const BAD_WORDS = ['씨발', '시발', '씨빨', 'ㅅㅂ', 'ㅆㅂ', 'ㅅ발', '씹', '병신', '븅신', 'ㅂㅅ', '좆', '존나', '졸라', '개새', '개색', '새끼', '색기', '섀끼',
    '쌔끼', '지랄', '미친', '또라이', '닥쳐', '꺼져', '죽어', '뒤져', '뒈져', '엿먹', '썅', '염병', '등신', '호로', '애미', '애비', '느금', '니미', '걸레',
    '창녀', '보지', '자지', '한남', '김치녀', '틀딱', 'fuck', 'shit', 'bitch', 'sex'];
function badWord(s) {
    const k = String(s || '').toLowerCase().replace(/[\s\d\p{P}\p{S}]/gu, '');
    return BAD_WORDS.some(b => k.includes(b));
}
const OWNER_RE = /대표|사장|회장|오너|이사장/;
function isOwner() { return OWNER_RE.test(bossLook.title || ''); }

function syncBossSummary() { $('smash-boss-summary').textContent = bossLabel(); }

function buildBossPanel() {
    // 예전에 저장된 값에 욕이 있으면 비운다
    if (badWord(bossLook.name)) bossLook.name = '';
    if (badWord(bossLook.title)) bossLook.title = BOSS_DEFAULT.title;
    const sheet = $('smash-bosssheet');
    const nameIn = $('smash-boss-name'), titleIn = $('smash-boss-title'), warn = $('smash-boss-warn');
    nameIn.value = bossLook.name || '';
    titleIn.value = bossLook.title || '';
    const save = () => { store.set('smash.boss', JSON.stringify(bossLook)); applyBossLook(); syncBossSummary(); };
    // 이름·직함: 직접 입력. 욕이 섞이면 빨갛게 표시하고 반영하지 않는다
    const textField = (input, key, max, fallback) => input.addEventListener('input', () => {
        const v = input.value.replace(/[<>]/g, '').replace(/\s+/g, ' ').slice(0, max);
        const bad = badWord(v);
        input.classList.toggle('bad', bad);
        warn.hidden = !(nameIn.classList.contains('bad') || titleIn.classList.contains('bad'));
        if (bad) return;
        bossLook[key] = v.trim() || fallback;
        save();
    });
    textField(nameIn, 'name', 6, '');
    textField(titleIn, 'title', 8, BOSS_DEFAULT.title);
    // 직함 빠른 선택 (회사마다 직함이 달라 입력이 기본, 이건 도우미)
    const sugg = $('smash-boss-sugg');
    for (const t of T.bossTitles) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = t;
        b.addEventListener('click', () => { titleIn.value = t; titleIn.dispatchEvent(new Event('input')); });
        sugg.appendChild(b);
    }
    // 얼굴·옷·소품: 버튼 묶음, 옷 색: 색 동그라미
    const groups = [...sheet.querySelectorAll('.smash-seg, .smash-swatches')];
    const sync = () => groups.forEach(g => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(bossLook[g.dataset.k]) === b.dataset.v)));
    const choose = (k, v) => {
        bossLook[k] = v;
        // 여자로 바꾸면 대머리·수염은 빼 줌 (원하면 다시 고르면 됨)
        if (k === 'gender' && v === 'f') {
            if (bossLook.hair === 'bald') bossLook.hair = 'bob';
            bossLook.beard = 'none';
        }
        // 골프웨어·등산복은 모자가 없으면 짝 맞는 모자를 씌움
        if (k === 'outfit' && bossLook.hat === 'none') {
            if (v === 'golf') bossLook.hat = 'visor';
            if (v === 'hiking') bossLook.hat = 'hiking';
        }
        sync();
        save();
    };
    for (const g of groups) {
        const k = g.dataset.k;
        for (const [v, text] of T.bossOpts[k]) {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.v = String(v);
            if (k === 'suit') {
                b.style.background = '#' + BOSS_COLORS[v].toString(16).padStart(6, '0');
                b.title = text;
                b.setAttribute('aria-label', text);
            } else b.textContent = text;
            b.addEventListener('click', () => choose(k, v));
            g.appendChild(b);
        }
    }
    // 🎲 아무렇게나: 이름·직함·성별은 두고 나머지를 섞음
    $('smash-boss-dice').addEventListener('click', () => {
        for (const k of ['hair', 'glasses', 'beard', 'face', 'body', 'outfit', 'suit', 'hat', 'item']) bossLook[k] = pick(T.bossOpts[k])[0];
        if (bossLook.gender === 'f') {
            if (bossLook.hair === 'bald') bossLook.hair = pick(['bob', 'long', 'pony', 'perm']);
            if (Math.random() < 0.85) bossLook.beard = 'none';
        }
        sync();
        save();
    });
    // 탭: 기본 · 얼굴 · 옷 · 소품. 얼굴 탭이면 미리보기를 얼굴로 당김
    const tabs = [...sheet.querySelectorAll('.smash-boss-tabs button')];
    const panes = [...sheet.querySelectorAll('.smash-boss-pane')];
    const showTab = name => {
        tabs.forEach(t => { const on = t.dataset.tab === name; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
        panes.forEach(p => p.classList.toggle('on', p.dataset.pane === name));
        preview.focus = name === 'face' ? 1 : 0;
    };
    tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
    showTab('who');
    sync();
    syncBossSummary();
    // 입력하는 동안엔 "과장씹…" 의 앞부분("과장")까지 반영되니, 욕이 남은 채로 닫으면 그 칸을 고치기 시작하기 전 값으로 되돌린다
    const before = { name: bossLook.name, title: bossLook.title };
    nameIn.addEventListener('focus', () => { before.name = bossLook.name; });
    titleIn.addEventListener('focus', () => { before.title = bossLook.title; });
    const head = $('smash-boss-head'), done = $('smash-boss-done'), skip = $('smash-boss-skip');
    const headText = head.textContent, doneText = done.textContent;
    let then = null;
    const close = () => {
        let changed = false;
        if (nameIn.classList.contains('bad')) { bossLook.name = before.name; nameIn.value = before.name || ''; nameIn.classList.remove('bad'); changed = true; }
        if (titleIn.classList.contains('bad')) { bossLook.title = before.title; titleIn.value = before.title || ''; titleIn.classList.remove('bad'); changed = true; }
        if (changed) save();
        warn.hidden = true;
        sheet.hidden = true;
        head.textContent = headText; done.textContent = doneText; skip.hidden = true;
        const go = then; then = null;
        if (go) { go(); return; }
        ui.start.hidden = game.phase !== 'start';
    };
    /** 회사를 고른 뒤: 이름 안 지은 상사면 한 번 꾸미기 창을 띄우고, 닫으면 then() 으로 시작 */
    bossAsk = (cb) => {
        then = cb;
        head.textContent = T.bossAskTitle;
        done.textContent = T.bossAskGo;
        skip.hidden = false;
        ui.start.hidden = true;
        sheet.hidden = false;
        initBossPreview();
        sizeBossPreview();
        showTab('who');
        track('smash_boss_ask');
    };
    skip.addEventListener('click', close);
    $('smash-boss-toggle').addEventListener('click', () => {
        ui.start.hidden = true;
        sheet.hidden = false;
        initBossPreview();
        sizeBossPreview();
    });
    $('smash-boss-done').addEventListener('click', close);
    sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
}

// ── 렌더러·장면 ──
const renderer = new THREE.WebGLRenderer({ antialias: !coarse, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.6 : 2));
renderer.shadowMap.enabled = !coarse;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
box.appendChild(renderer.domElement);
// 하이라이트 영상 녹화기 (못 쓰는 브라우저면 아무것도 안 함)
const clip = new Clip(renderer.domElement, audioStream, coarse);

const scene = new THREE.Scene();
const SKY = 0xb5dcf3;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 120, 420);
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 1500);

scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x8d8573, 1.9));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
sun.castShadow = !coarse;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 260 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

const world = new World(scene, coarse ? { budget: 22000, perBuilding: 3600, targetBudget: 6500, aniso: 4 }
    : { budget: 42000, perBuilding: 5200, targetBudget: 9500, aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
const fx = new FX(scene, { mobile: coarse });
const street = new Street(scene, world, fx, sfx);
const landmarks = new Landmarks(scene, fx, sfx);
const labels = new Labels(box, coarse ? { max: 7, minTop: 9, bottom: 96 } : { max: 14, minTop: 7, bottom: 84 });
const _bossAt = new THREE.Vector3();
// 이름표가 피할 위쪽 정보창 자리 (레이아웃 읽기는 0.5초에 한 번만)
let hudAvoid = [], hudT = 0;
function hudRects(dt) {
    hudT -= dt;
    if (hudT > 0) return hudAvoid;
    hudT = 0.5;
    const o = box.getBoundingClientRect();
    hudAvoid = [...document.querySelectorAll('.smash-score, .smash-side')].map(e => {
        const r = e.getBoundingClientRect();
        return { x0: r.left - o.left - 4, y0: r.top - o.top - 4, x1: r.right - o.left + 4, y1: r.bottom - o.top + 4 };
    });
    return hudAvoid;
}
const boss = new Boss(scene);
const BOSS_BIG = 2.3;

// ── 상사 찾기: 상사가 화면 밖(뒤 포함)이면 가장자리에 화살표 + 직함 동그라미를 띄움. 누르면 카메라가 상사한테 감 ──
// 화면 안이면 숨김 — 머리 위 이름표가 건물에 가려도 보이게 그려지니 따로 안 띄움
// 매 프레임 레이아웃을 읽지 않게 크기는 ResizeObserver 로만 받음
const finder = {
    el: $('smash-finder'), arrow: $('smash-finder-arrow'), name: $('smash-finder-name'),
    w: 0, h: 0, on: false, go: 0, x: NaN, y: NaN, a: NaN, p: new THREE.Vector3(), v: new THREE.Vector3(),
};
new ResizeObserver(() => { finder.w = box.clientWidth; finder.h = box.clientHeight; }).observe(box);
finder.el.addEventListener('click', () => { finder.go = 0.9; track('smash_find_boss'); });
/** 카메라 위치를 정하기 전에: 눌렀으면 0.9초 동안 카메라 중심을 상사 쪽으로 끌어옴 (날아가는 중이어도 따라감) */
function followBoss(dt) {
    if (finder.go <= 0) return;
    finder.go -= dt;
    boss.center(finder.p);
    const k = Math.min(1, dt * 7);
    orbit.target.lerp(finder.p, k);
    if (orbit.zoom > 1.1) orbit.zoom += (1 - orbit.zoom) * k;
}
/** 카메라를 정한 뒤에: 상사가 화면 밖이면 가장자리 자리·방향을 잡아 보여 줌 */
function updateFinder() {
    const f = finder;
    let show = false;
    if (game.phase === 'play' && boss.group.visible && f.w) {
        boss.center(f.p);
        const v = f.v.copy(f.p).project(camera);
        const behind = v.z > 1;
        // 카메라 뒤면 투영이 뒤집히니 방향을 되돌림
        const x = behind ? -v.x : v.x, y = behind ? -v.y : v.y;
        show = behind || Math.abs(x) > 0.96 || Math.abs(y) > 0.96;
        if (show) {
            // 화면 가운데에서 상사 쪽으로 그은 선이 안쪽 테두리(위 점수판·아래 무기 칸은 피함)와 만나는 곳
            const hw = f.w / 2, hh = f.h / 2;
            let dx = x * hw, dy = -y * hh;
            if (Math.abs(dx) + Math.abs(dy) < 1) dy = 1;
            const top = Math.min(hh - 40, 118), bottom = Math.min(hh - 40, 124), side = 44;
            const t = Math.min((hw - side) / Math.max(1e-3, Math.abs(dx)), (dy < 0 ? hh - top : hh - bottom) / Math.max(1e-3, Math.abs(dy)));
            const px = Math.round(hw + dx * t), py = Math.round(hh + dy * t), a = Math.atan2(dy, dx);
            if (px !== f.x || py !== f.y) { f.el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`; f.x = px; f.y = py; }
            if (!(Math.abs(a - f.a) < 0.01)) { f.arrow.style.transform = `rotate(${a.toFixed(3)}rad) translateX(33px)`; f.a = a; }
        }
    }
    if (show !== f.on) { f.on = show; f.el.classList.toggle('show', show); }
}
const sign = new Sign(scene);
const banner = new Banner(scene);
boss.group.visible = sign.group.visible = banner.group.visible = false;

// ── 카메라 궤도 ──
const orbit = { theta: 0.6, phi: 1.12, zoom: 1, target: new THREE.Vector3(0, 10, 0), home: new THREE.Vector3(), base: 60 };
let trauma = 0;
function fitCamera() {
    const w = box.clientWidth || 1, h = box.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    fx.setScale(h * renderer.getPixelRatio(), camera.fov);
}
function placeCamera(dt) {
    const r = orbit.base * orbit.zoom;
    const sp = Math.sin(orbit.phi);
    camera.position.set(
        orbit.target.x + r * sp * Math.sin(orbit.theta),
        orbit.target.y + r * Math.cos(orbit.phi),
        orbit.target.z + r * sp * Math.cos(orbit.theta));
    camera.lookAt(orbit.target);
    if (trauma > 0) {
        const s = trauma * trauma * 1.4;
        camera.position.x += (Math.random() - 0.5) * s;
        camera.position.y += (Math.random() - 0.5) * s;
        camera.position.z += (Math.random() - 0.5) * s;
        trauma = Math.max(0, trauma - dt * 1.5);
    }
    scene.fog.near = r * 1.3;
    scene.fog.far = r * 4.5 + 120;
    sun.target.position.copy(orbit.target).setY(0);
    sun.position.copy(orbit.target).add(new THREE.Vector3(60, 110, 70));
}
new ResizeObserver(fitCamera).observe(box);
fitCamera();

const stream = { on: false, area: null, loaded: new Set(), failed: new Map(), busy: false, t: 0 };
const satZoom = coarse ? 17 : 18;
const CELL_M = 280;

// ── 게임 상태 ──
const game = {
    phase: 'start', name: T.defaultName, company: true, rankable: false, place: null, area: null, target: null, wscale: 1,
    damage: 0, shown: 0, combo: 0, comboT: 0, rankIdx: 0, weapon: 0,
    nuke: 0, nukeArmed: false, startAt: 0, lineT: 0, idleT: 3,
    bossOut: false, signPaid: false, bossCarPaid: false, endTimer: -1, ended: false, nearEnd: false,
    stats: { buildings: new Set(), cars: 0, boss: 0 },
};

function rankFor(d) {
    let k = 0;
    for (let i = 0; i < RANKS.length; i++) if (d >= RANKS[i][0]) k = i;
    return k;
}

/** 같은 대사가 연달아 나오지 않게, 종류마다 섞어 둔 순서대로 하나씩 꺼낸다 */
const bags = new Map();
function draw(key, list) {
    let b = bags.get(key);
    if (!b || !b.length) {
        b = list.map((_, i) => i);
        for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
        bags.set(key, b);
    }
    return list[b.pop()];
}

/** 건물이 부서진 만큼 상사 태도가 바뀐다: 갑질(0) → 협박(1) → 회유(2) → 체념(3) */
function mood() {
    const r = targetRatio();
    return r < 0.15 ? 0 : r < 0.35 ? 1 : r < 0.55 ? 2 : 3;
}

/** 지금 실제 요일·시간에 맞는 대사 묶음. 해당 없으면 null */
function timeKind(now = new Date()) {
    const d = now.getDay(), h = now.getHours();
    if (now.getDate() === 25) return 'payday';
    if (d === 0 || d === 6) return 'weekend';
    if (h >= 22 || h < 6) return 'late';
    if (d === 1 && h < 12) return 'mon';
    if (d === 5 && h >= 14) return 'fri';
    if (h >= 7 && h < 9) return 'morning';
    if (h === 12) return 'lunch';
    if (h >= 18) return 'evening';
    return null;
}

function lineFor(kind) {
    const tk = timeKind();
    const timed = tk && LINES.time && LINES.time[tk];
    if (kind === 'first') {
        if (!game.company) return draw('away', LINES.away);
        if (timed) return draw('t' + tk, timed);
        kind = 'idle';
    }
    if (kind === 'idle') {
        const st = mood();
        if (st >= 2) { const k = st === 2 ? 'plead' : 'despair'; return draw(k, LINES[k]); }
        const r = Math.random();
        if (timed && r < 0.2) return draw('t' + tk, timed);
        if (r < 0.42) { const k = isOwner() ? 'owner' : 'mid'; return draw(k, LINES[k]); }
        return draw('idle', LINES.idle);
    }
    if (kind === 'hit') { const k = ['hit', 'threat', 'plead', 'despair'][mood()]; return draw(k, LINES[k]); }
    return draw(kind, LINES[kind]);
}

/** quiet: 비명을 따로 내는 때(맞거나 날아갈 때)는 웅얼거리는 말소리를 겹치지 않는다 */
function say(kind, force, quiet) {
    if (!force && game.lineT > 0.6) return;
    ui.bubble.textContent = lineFor(kind);
    ui.bubble.classList.add('show');
    game.lineT = 2.4;
    boss.say();
    if (!quiet) sfx.voice(5 + Math.floor(Math.random() * 4));
}

function toast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.remove('show');
    void ui.toast.offsetWidth;
    ui.toast.classList.add('show');
}

const _proj = new THREE.Vector3();
function toScreen(x, y, z) {
    _proj.set(x, y, z).project(camera);
    return { x: (_proj.x + 1) / 2 * box.clientWidth, y: (1 - _proj.y) / 2 * box.clientHeight, behind: _proj.z > 1 };
}

function pop(p, text, cls) {
    if (ui.pops.childElementCount > 14) ui.pops.firstElementChild.remove();
    const s = toScreen(p.x, p.y, p.z);
    if (s.behind || s.x < -50 || s.y < -50 || s.x > box.clientWidth + 50 || s.y > box.clientHeight + 50) return;
    const el = document.createElement('span');
    el.className = 'smash-pop' + (cls ? ' ' + cls : '');
    el.textContent = text;
    el.style.left = s.x + 'px';
    el.style.top = s.y + 'px';
    el.addEventListener('animationend', () => el.remove());
    ui.pops.appendChild(el);
}
street.onSay = (x, y, z, text) => pop({ x, y, z }, text, 'talk');

function mult() { return 1 + Math.min(game.combo, 40) * 0.05; }

function addDamage(eok, p, label, big) {
    if (eok <= 0 || game.phase !== 'play') return 0;
    const v = eok * mult();
    game.damage += v;
    game.nuke = Math.min(1, game.nuke + v / 2500);
    if (p && (label || v >= 1)) pop(p, label || '+' + score(v, false), big || v >= 80 ? 'big' : '');
    const k = rankFor(game.damage);
    if (k > game.rankIdx) {
        game.rankIdx = k;
        ui.rank.textContent = RANKS[k][1];
        ui.rank.classList.remove('up'); void ui.rank.offsetWidth; ui.rank.classList.add('up');
        toast(fmt(T.rankUp, RANKS[k][1]));
        sfx.rank();
    }
    return v;
}

// ── 공격이 닿았을 때 ──
const _d = new THREE.Vector3();
const _c = new THREE.Vector3();

function nearBuildings(p, r) {
    const out = new Set();
    for (let x = Math.floor((p.x - r) / 12); x <= Math.floor((p.x + r) / 12); x++) {
        for (let z = Math.floor((p.z - r) / 12); z <= Math.floor((p.z + r) / 12); z++) {
            for (const b of world.hash.get(x + ',' + z) || []) out.add(b);
        }
    }
    return out;
}

/** 반경 안 멀쩡한 건물은 블록으로 바꾼다 (예산 밖이면 주저앉힌다) */
function wake(p, r) {
    for (const b of nearBuildings(p, r)) {
        if (b.state !== 'intact') continue;
        if (p.y > b.top + r) continue;
        if (distToPolygon(p.x, p.z, b.poly) > r) continue;
        const v = world.voxelize(b);
        if (!v && b.state === 'sinking') onFlatten(b);
    }
}

function onFlatten(b) {
    clip.trigger(2);
    const v = addDamage(b.area * b.h * 0.025, new THREE.Vector3(b.cx, b.top * 0.6, b.cz), null, true);
    if (v) pop(new THREE.Vector3(b.cx, b.top, b.cz), fmt(T.flattened, score(v, false)), 'big');
    game.stats.buildings.add(b.id);
    sfx.rumble(80);
}

const hitOut = { value: 0, blocks: 0, glass: [], chunks: [], windows: [] };
function hit(point, w, dir) {
    if (game.phase !== 'play') return;
    // 초고층 사옥은 같은 무기로는 티가 안 난다 — 회사 건물 크기만큼 범위·위력을 키운다 (setup 의 wscale)
    const r = w.radius * game.wscale;
    const force = w.force * Math.sqrt(game.wscale);
    // 예산이 차서 블록 대신 무너질 때 맞은 방향으로 쓰러지게
    world.hitDir = dir;
    wake(point, r);
    hitOut.value = 0; hitOut.blocks = 0; hitOut.glass.length = 0; hitOut.chunks.length = 0; hitOut.windows.length = 0;
    for (const v of world.voxels) {
        const bb = v.bbox;
        if (point.x < bb.minx - r || point.x > bb.maxx + r || point.z < bb.minz - r || point.z > bb.maxz + r || point.y > bb.maxy + r) continue;
        v.impact(point, r, force, dir, w.vaporize || 0, hitOut);
    }
    const res = hitOut;
    if (res.blocks || res.glass.length) { game.combo++; game.comboT = 1.8; }
    const g = res.glass;
    for (let i = 0; i < g.length && i < 60; i += 3) fx.glass(g[i], g[i + 1], g[i + 2], w.id === 'hammer' ? 5 : 3, dir);
    if (g.length) sfx.glass(g.length / 3);
    const c = res.chunks;
    for (let i = 0; i < c.length && i < 90; i += 3) {
        fx.dust(c[i], c[i + 1], c[i + 2], 2, 1, 0.8);
        if (Math.random() < 0.25) fx.papersBurst(c[i], c[i + 1], c[i + 2], 1, 0.8);
    }
    const wn = res.windows;
    for (let i = 0; i < wn.length && i < 18; i += 3) {
        _d.set(wn[i], 0, wn[i + 2]);
        const b = game.target;
        const ox = wn[i] - (b ? b.cx : 0), oz = wn[i + 2] - (b ? b.cz : 0), L = Math.hypot(ox, oz) || 1;
        street.spawnItem(wn[i], wn[i + 1], wn[i + 2], ox / L * 6 + dir.x * 3, 3 + Math.random() * 3, oz / L * 6 + dir.z * 3);
    }
    if (w.id === 'hammer') {
        fx.dust(point.x, point.y, point.z, 5, 0.8, 0.8);
        if (res.blocks) fx.papersBurst(point.x, point.y, point.z, 2, 0.7);
        // 연타라 한 방 흔들림은 작게
        trauma = Math.min(0.7, trauma + 0.06);
    } else if (w.id === 'gun') {
        trauma = Math.min(1, trauma + 0.02);
    }
    if (res.blocks) sfx.crash(res.blocks);
    addDamage(res.value, point);

    // 거리
    landmarks.impact(point, r, w.force || 8, dir);
    const st = street.impact(point, r, w.force || 8, dir);
    if (st.value) addDamage(st.value * 40, point);
    game.stats.cars += st.cars;
    if (st.bossCar && !game.bossCarPaid) {
        game.bossCarPaid = true;
        const v = addDamage(300, street.bossCar.p, null);
        toast(fmt(T.bossCar, bossLook.title, score(v, false)));
        say('car', true);
        cheer();
    }

    // 사장님
    boss.center(_c);
    if (boss.group.visible && boss.hitDist(point) < r + boss.hitR()) {
        _d.subVectors(_c, point).setY(0);
        if (_d.lengthSq() < 0.01) _d.copy(dir).setY(0);
        _d.normalize().lerp(dir, 0.4).setY(0).normalize();
        if (boss.knock(_d, Math.max(10, w.force))) {
            sfx.scream(bossLook.gender, 'hit');
            say('ouch', true, true);
            game.stats.boss++;
            addDamage(10, _c);
            if (!game.bossOut) {
                game.bossOut = true;
                const v = addDamage(150, _c, null);
                toast(fmt(T.bossOut, bossLook.title, score(v, false)));
                cheer();
            }
        }
    } else if (res.blocks > 0) {
        say(res.blocks > 40 ? 'big' : 'hit');
    }
    // 간판
    _c.copy(sign.group.position).setY(sign.group.position.y + 2.3);
    if (sign.group.visible && _c.distanceTo(point) < r + 3) sign.knock(dir, Math.max(10, w.force));
}

function ignite(point, r0) {
    const r = r0 * game.wscale;
    if (game.phase !== 'play') return;
    wake(point, r);
    let n = 0;
    for (const v of world.voxels) {
        const bb = v.bbox;
        if (point.x < bb.minx - r || point.x > bb.maxx + r || point.z < bb.minz - r || point.z > bb.maxz + r) continue;
        n += v.ignite(point, r);
    }
    street.ignite(point, r);
    if (n && Math.random() < 0.15) say('fire');
    if (n) { game.combo++; game.comboT = 1.8; }
}

function pull(point, r0, strength, dt) {
    const r = r0 * game.wscale;
    if (game.phase !== 'play') return;
    wake(point, r * 0.55);
    for (const v of world.voxels) {
        const bb = v.bbox;
        if (point.x < bb.minx - r || point.x > bb.maxx + r || point.z < bb.minz - r || point.z > bb.maxz + r) continue;
        const before = v.lost;
        v.pull(point, r, strength, dt);
        if (v.lost > before) addDamage((v.lost - before) * 0.4 * v.valueScale, null);
    }
    street.pull(point, r, strength, dt);
    boss.center(_c);
    const d = _c.distanceTo(point);
    if (d < r && boss.group.visible) {
        _d.subVectors(point, _c).normalize().multiplyScalar(strength * 0.6 * dt);
        boss.push(_d.x - _d.z * 0.8, _d.y + 20 * dt, _d.z + _d.x * 0.8);
    }
}

function nukeBlast(p, dir) {
    clip.trigger(5);
    sfx.nuke();
    trauma = 1;
    ui.flash.classList.remove('go'); void ui.flash.offsetWidth; ui.flash.classList.add('go');
    fx.blast(p.x, p.y + 2, p.z, 26, 0xfff3c4);
    fx.ring(p.x, 0.3, p.z, 70, 0xffffff);
    fx.mushroom(p.x, p.y, p.z, 2 * Math.min(2, Math.max(1, game.wscale)), game.target ? game.target.top * 1.1 : 0);
    slowmo = 0.45; slowK = 0.3;
    say('nuke', true);
    // 가까운 곳은 블록으로 날리고, 그 바깥은 통째로 주저앉힌다
    hit(p, NUKE, dir);
    for (const b of nearBuildings(p, 40)) {
        if (b.state !== 'intact') continue;
        const d = distToPolygon(p.x, p.z, b.poly);
        if (d < 40) { world.collapse(b, new THREE.Vector3(b.cx - p.x, 0, b.cz - p.z)); onFlatten(b); }
    }
    for (const v of world.voxels) {
        const bb = v.bbox;
        const cx = (bb.minx + bb.maxx) / 2, cz = (bb.minz + bb.maxz) / 2;
        const d = Math.hypot(cx - p.x, cz - p.z);
        if (d < 45) {
            hitOut.value = 0; hitOut.blocks = 0; hitOut.glass.length = 0; hitOut.chunks.length = 0; hitOut.windows.length = 0;
            v.impact(_c.set(p.x, 2, p.z), Math.max(8, 45 - d * 0.6), 30, dir, 0.1, hitOut);
            addDamage(hitOut.value, null);
        }
    }
    // 회사 건물은 높아도 확실히 무너지게: 폭심 쪽 절반을 여러 높이에서 한꺼번에 뜯어냄
    const t = game.target, tv = t && t.voxel;
    if (tv && distToPolygon(p.x, p.z, t.poly) < 60) {
        const bb = tv.bbox, w = Math.max(bb.maxx - bb.minx, bb.maxz - bb.minz);
        const cx = (bb.minx + bb.maxx) / 2, cz = (bb.minz + bb.maxz) / 2;
        for (const fy of [0.12, 0.35, 0.6, 0.85]) {
            hitOut.value = 0; hitOut.blocks = 0; hitOut.glass.length = 0; hitOut.chunks.length = 0; hitOut.windows.length = 0;
            _c.set(cx + (p.x - cx) * 0.35, t.top * fy, cz + (p.z - cz) * 0.35);
            tv.impact(_c, w * 0.42, 34, dir, 0.12, hitOut);
            addDamage(hitOut.value, null);
        }
    }
    street.impact(p, 40, 40, dir);
    landmarks.impact(p, 40, 40, dir);
    cheer();
    track('smash_nuke');
}
/** 큰 폭발 직후 잠깐 느리게 (남은 초, 그동안 시간 배율). 세게 때린 순간의 짧은 멈춤(hitStop)도 같은 걸 씀 */
let slowmo = 0, slowK = 0.3;
function hitStop(sec) {
    if (slowmo > 0 && slowK > 0.1) return;
    slowmo = Math.max(slowmo, sec);
    slowK = 0.06;
}

/** 핵폭탄(무기): 필살기의 작은 판. 섬광 → 불덩이 → 충격파 → 버섯구름, 가까운 작은 건물은 주저앉힘 */
function miniNuke(p, dir) {
    clip.trigger(4);
    sfx.boom(true);
    sfx.rumble(10);
    trauma = Math.min(1, trauma + 0.85);
    ui.flash.classList.remove('go'); void ui.flash.offsetWidth; ui.flash.classList.add('go');
    fx.mushroom(p.x, p.y, p.z, 1.2 * Math.min(2, Math.max(1, game.wscale)), game.target ? game.target.top : 0);
    slowmo = 0.35; slowK = 0.3;
    fx.blast(p.x, p.y + 1, p.z, 14, 0xfff3c4);
    fx.pow(p.x, p.y + 10, p.z, '콰광!!', 5, '#ffd23f');
    const w = WEAPONS[5];
    hit(p, w, dir);
    const R = w.radius * game.wscale * 1.5;
    for (const b of nearBuildings(p, R)) {
        if (b.state !== 'intact' || b === game.target || b.top > 45) continue;
        if (distToPolygon(p.x, p.z, b.poly) < R * 0.75) { world.collapse(b, new THREE.Vector3(b.cx - p.x, 0, b.cz - p.z)); onFlatten(b); }
    }
    street.impact(p, R, 30, dir);
    landmarks.impact(p, R, 30, dir);
    // 둘레에 불씨가 남아 한동안 탐
    for (let k = 0; k < 5; k++) {
        const a = Math.random() * Math.PI * 2, r = R * (0.3 + Math.random() * 0.5);
        fx.burn(p.x + Math.cos(a) * r, 0.8, p.z + Math.sin(a) * r, 3 + Math.random() * 3, 1.2);
    }
    if (Math.random() < 0.5) say('nuke', true);
}

function cheer() {
    if (!game.target) return;
    street.cheer(game.target.cx, game.target.cz, 60);
    sfx.cheer();
}

const weapons = new Weapons(scene, fx, {
    hit, ignite, pull, nukeBlast, miniNuke, hitStop,
    clip: w => clip.trigger(w),
    // 초고층 사옥은 무기 범위를 키우니(wscale) 폭발 그림도 같이 키움
    fxScale: () => Math.min(2.2, Math.max(1, game.wscale)),
    shake: n => { trauma = Math.min(1, trauma + n); },
    surface: (x, z) => world.surface(x, 500, z, null),
    solidAt: (x, y, z) => world.blocked(x, y, z, null),
});

// ── 시작: 검색 → 지도 → 부수기 ──
/** 간판·결과에 쓰는 이름. ㈜ 는 붙이지 않는다 — "㈜칠곡중학교" 처럼 어색해지고, 유명한 회사는 없어도 안다 */
function corpName() { return game.name; }

function showMsg(text) {
    ui.msg.textContent = text || '';
    ui.msg.hidden = !text;
}

let searchSeq = 0;
async function search() {
    initAudio();
    const q = (ui.name.value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!q) { showMsg(T.tooShort); ui.name.focus(); return; }
    const seq = ++searchSeq;
    ui.results.innerHTML = '';
    showMsg(T.searching);
    try {
        const res = await fetch('/api/smash/search?q=' + encodeURIComponent(q));
        if (seq !== searchSeq) return;
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (!data.places || !data.places.length) { showMsg(T.noResult); return; }
        showMsg('');
        // 5개까지만 — 더 많으면 카드에 스크롤이 생긴다. 못 찾으면 더 구체적으로 검색하면 된다
        for (const p of data.places.slice(0, 5)) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'smash-result';
            const n = document.createElement('b'); n.textContent = p.name;
            const a = document.createElement('small'); a.textContent = [p.category, p.address].filter(Boolean).join(' · ');
            b.append(n, a);
            b.addEventListener('click', () => (p.category === '주소' ? askName(q, p) : choose(q, p)));
            ui.results.appendChild(b);
        }
        track('smash_search', { source: data.source });
    } catch (e) {
        if (seq === searchSeq) showMsg(T.searchFail);
    }
}

/** 주소로 고르면 간판에 쓸 회사 이름을 묻는다. 비워 두면 "가족같은 회사" (랭킹에는 안 들어간다) */
function askName(query, place) {
    ui.results.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'smash-addrname';
    const label = document.createElement('b'); label.textContent = T.addrName;
    const sub = document.createElement('small'); sub.textContent = place.name;
    const input = document.createElement('input');
    Object.assign(input, { type: 'text', maxLength: 30, placeholder: T.addrNamePh, autocomplete: 'off' });
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'smash-primary'; go.textContent = T.addrGo;
    const start = () => choose(query, place, input.value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30));
    go.addEventListener('click', start);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
    wrap.append(label, sub, input, go);
    ui.results.appendChild(wrap);
    input.focus();
}

/**
 * 간판 이름과 회사 여부.
 * - 회사: 검색한 말 그대로("삼성전자 서초사옥" 말고 "삼성전자") — 랭킹도 이 이름으로 모인다
 * - 주소: 직접 적은 회사 이름, 없으면 기본 이름
 * - 그 밖(학교·관공서·아파트…): 장소 이름 그대로. 랭킹에도 넣는다 (company 는 현수막·첫마디·엔딩 문구만 가른다)
 * - 친구가 공유한 링크: 친구 화면과 같게
 */
function naming(query, place, typed) {
    const sh = place.shared;
    if (sh) return { name: sh.name, company: sh.company, rankable: sh.name !== T.defaultName };
    if (place.category === '주소') return { name: typed || T.defaultName, company: true, rankable: !!typed };
    if (place.company) return { name: query, company: true, rankable: true };
    return { name: place.name, company: false, rankable: true };
}

/** 시·도 긴 이름 → 짧은 이름 (카카오는 짧게, 네이버는 길게 줌) */
const SIDO = { 서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산',
    세종특별자치시: '세종', 경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전북특별자치도: '전북',
    전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주' };

/**
 * 주소 → 동네 "시·도 구·군·시" ("서울 구로구 디지털로…" → "서울 구로구", "경기 성남시 분당구 …" → "경기 분당구",
 * "경기 화성시 …" → "경기 화성시", 세종은 "세종 세종시"). 동네 찾기에서 시·도로 묶을 때 앞 말을 씀
 */
function regionOf(addr) {
    const t = String(addr || '').trim().split(/\s+/);
    if (t.length < 2) return null;
    const sido = SIDO[t[0]] || t[0];
    if (!/^[가-힣]{2,4}$/.test(sido)) return null;
    if (sido === '세종') return '세종 세종시';
    let r = null;
    for (let i = 1; i < Math.min(t.length, 4); i++) {
        const w = t[i];
        if (/[구군]$/.test(w)) { r = w; break; }
        if (/시$/.test(w)) { r = w; if (!/구$/.test(t[i + 1] || '')) break; }
    }
    if (!r || !/^[가-힣]+$/.test(r)) return null;
    r = sido + ' ' + r;
    return r.length <= 15 ? r : null;
}
/** 화면에 짧게: "서울 구로구" → "구로구" (중구·동구처럼 흔한 이름은 시·도까지) */
function regionShort(r) {
    const p = String(r || '').split(' ');
    if (p.length < 2) return r || '';
    return /^[중동서남북]구$/.test(p[1]) ? r : p[1];
}

/** 친구 도전장: 공유 링크에 담긴 친구 점수 (화면 점수 단위). 다른 회사로 가면 지움 */
let challenge = null;

/** 상사 꾸미기 창을 "회사 고른 뒤" 모드로 여는 함수 (창 설정 때 채움) */
let bossAsk = null, bossAsked = false;

async function choose(query, place, typed) {
    // 상사 이름을 안 지었으면 시작 전에 한 번 꾸미기 창을 보여 줌 (페이지당 한 번)
    if (bossAsk && !bossAsked && !(bossLook.name || '').trim()) {
        bossAsked = true;
        bossAsk(() => choose(query, place, typed));
        return;
    }
    Object.assign(game, naming(query, place, typed));
    game.place = place;
    game.region = (place.shared && place.shared.region) || regionOf(place.address);
    if (game.region) store.set('smash.region', game.region);
    if (!place.shared) challenge = null;
    store.set('smash.name', query);
    showLoading(fmt(T.loadingMap, place.name));
    let area = null, skipped = false, limited = false;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 45000);
    // 처음 가는 동네는 지도 서버에서 받아 오느라 오래 걸릴 수 있다
    const slow = setTimeout(() => { ui.skip.hidden = false; }, 10000);
    ui.skip.onclick = () => { skipped = true; ctl.abort(); };
    try {
        const res = await fetch(`/api/smash/area?lat=${place.lat}&lng=${place.lng}`, { signal: ctl.signal });
        limited = res.status === 429;
        if (!res.ok) throw new Error('HTTP ' + res.status);
        area = await res.json();
        if (!area.buildings) throw new Error('bad');
    } catch (e) {
        area = null;
    }
    clearTimeout(to);
    clearTimeout(slow);
    ui.skip.hidden = true;
    // 호출 제한에 걸리면 가상 동네로 몰래 넘기지 말고 알려 준다 — 진짜 지도인 줄 알고 헷갈린다
    if (limited) {
        clearInterval(tipTimer);
        ui.loading.hidden = true;
        ui.start.hidden = false;
        showMsg(T.mapLimited);
        return;
    }
    if (!area) {
        setup(fakeArea(), true);
        if (!skipped) toast(T.mapFail);
    } else setup(area, false, place.name);
}

function startFake() {
    initAudio();
    const q = (ui.name.value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    game.name = q || T.defaultName;
    game.company = true;
    game.rankable = !!q;
    game.place = null;
    store.set('smash.name', game.name);
    showLoading(fmt(T.loadingMap, corpName()));
    setTimeout(() => setup(fakeArea(Math.floor(Math.random() * 1000)), true), 50);
}

let tipTimer = 0;
function showLoading(text) {
    ui.start.hidden = true;
    ui.loading.hidden = false;
    ui.loadingText.textContent = text;
    ui.loadingTip.textContent = pick(T.tips);
    clearInterval(tipTimer);
    tipTimer = setInterval(() => { ui.loadingTip.textContent = pick(T.tips); }, 1400);
}

/** preview: 시작 화면 뒤에 깔리는 미리보기. 게임 상태·화면은 건드리지 않는다 */
function setup(area, fake, placeName, preview = false) {
    if (!preview) clip.reset();
    // 도전장 목표 줄: 친구 링크로 들어온 판에만
    ui.goal.hidden = !challenge || preview;
    ui.goal.classList.remove('won');
    ui.goal.textContent = '';
    if (challenge) challenge.beaten = false;
    clearInterval(tipTimer);
    game.area = area;
    game.fake = fake;
    weapons.clear();
    game.placeName = placeName;
    game.wscale = 1;
    labels.reset();
    const { target: b, added } = world.load(area, game.name, placeName);
    game.target = b;
    street.populate(b);
    // 카메라: 가장 긴 벽이 보이는 쪽에서 3/4 각도
    const p = b.poly, n = p.length / 2;
    let best = 0, nx = 0, nz = 1;
    const sgn = signedArea(p) < 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const L = Math.hypot(p[j * 2] - p[i * 2], p[j * 2 + 1] - p[i * 2 + 1]);
        if (L > best) { best = L; nx = sgn * -(p[j * 2 + 1] - p[i * 2 + 1]) / L; nz = sgn * (p[j * 2] - p[i * 2]) / L; }
    }
    orbit.phi = 1.12;
    orbit.zoom = 1;
    const size = Math.sqrt(b.area);
    // 세로 화면은 폭이 좁아 더 멀리서 본다
    const portrait = camera.aspect < 1 ? 1 / Math.sqrt(camera.aspect) : 1;
    orbit.base = Math.min(260, Math.max(50, b.top * 2.15, size * 2.6) * portrait);
    // 옥상의 큰 상사 머리까지 화면에 들어오게 중심을 조금 올림
    const bossSize = Math.min(4, Math.max(1.6, b.top / 20)) * BOSS_BIG;
    orbit.home.set(b.cx, Math.min(Math.max(b.top * 0.48, (b.top + 4 * bossSize) * 0.5), 70), b.cz);
    orbit.theta = bestView(b, Math.atan2(nx, nz) + 0.45);
    orbit.target.copy(orbit.home);
    const camDir = new THREE.Vector3(Math.sin(orbit.theta), 0, Math.cos(orbit.theta));
    // 사장님: 옥상 안쪽 점
    const spot = roofSpot(b, camDir);
    // 괴롭히는 맛이 나게 건물에 비해 일부러 크게 (예전 1.6~4 → 2.8~7)
    boss.reset(spot.x, b.top, spot.z, bossSize);
    // 상사 울타리: 회사 건물과 바로 옆까지만
    boss.bound.x = b.cx; boss.bound.z = b.cz;
    boss.bound.r = Math.max(b.bbox.maxx - b.bbox.minx, b.bbox.maxz - b.bbox.minz) * 0.5 + 12;
    applyBossLook();
    boss.group.visible = true;
    sign.setName(corpName());
    sign.reset(b, camDir);
    if (game.company) banner.setText(T.bannerTop, corpName(), T.bannerBottom);
    else banner.setText(T.bannerTopAny, corpName(), T.bannerBottomAny);
    banner.reset(b, camDir);
    landmarks.begin(b, camDir, coarse ? { maxNames: 12, maxShops: 20 } : {});
    const fresh = landmarks.extend(added.pois, world, added.buildings, world.cellOf(0, 0));
    stream.on = false;
    if (preview) { ui.osm.hidden = true; return; }
    // 항공사진 바닥과 출구 번호는 뒤이어 받아 붙인다 (게임은 바로 시작)
    if (area.sat) {
        const R = (area.radius + 160) / UNIT_M;
        world.loadSat(-R, R, -R, R, satZoom);
    }
    if (!fake) fetchExits(fresh, area);
    // 걸어가는 쪽으로 이웃 칸을 이어 붙인다 (가상 동네는 이미 넓어서 하지 않는다)
    Object.assign(stream, { on: !fake, area, loaded: new Set([world.cellOf(0, 0)]), failed: new Map(), busy: false, t: 0 });
    Object.assign(game, {
        phase: 'play', submitted: false, wscale: Math.min(2, Math.max(1, b.top / 55)), damage: 0, shown: 0, combo: 0, comboT: 0, rankIdx: 0, nuke: 0, nukeArmed: false,
        ended: false, nearEnd: false, rankRes: null, sent: null, bossOut: false, signPaid: false, bossCarPaid: false, endTimer: -1, idleT: 2, lineT: 0,
        stats: { buildings: new Set(), cars: 0, boss: 0 },
    });
    game.startAt = performance.now();
    ui.rank.textContent = RANKS[0][1];
    ui.corp.textContent = corpName();
    ui.end.hidden = true;
    ui.loading.hidden = true;
    ui.osm.hidden = fake;
    ui.finishBtn.classList.remove('ready');
    if (!fake) {
        ui.osm.classList.add('open');
        clearTimeout(creditTimer);
        creditTimer = setTimeout(() => ui.osm.classList.remove('open'), 6000);
    }
    // 처음 한 번은 조작 안내 카드, 그 뒤로는 "?" 버튼으로. PC 는 구석에 키 안내를 계속 둔다
    ui.keys.hidden = coarse;
    if (!store.get('smash.tut')) ui.tut.hidden = false;
    else {
        ui.hint.classList.add('show');
        setTimeout(() => ui.hint.classList.remove('show'), 4500);
    }
    setTimeout(() => say('first', true), 700);
    track('smash_start', { fake: fake ? 1 : 0 });
}

/** 앞 건물에 가리지 않는 방향. 16방향 중 가림이 가장 적고, 같으면 긴 벽 쪽(preferred)에 가까운 것 */
function bestView(b, preferred) {
    const r = orbit.base;
    let best = preferred, bestScore = Infinity, bestPhi = orbit.phi;
    for (const phi of [1.12, 0.95, 0.8, 0.62]) for (let k = 0; k < 16; k++) {
        const sp = Math.sin(phi), cp = Math.cos(phi);
        const th = preferred + k / 16 * Math.PI * 2;
        const cx = orbit.home.x + r * sp * Math.sin(th), cy = orbit.home.y + r * cp, cz = orbit.home.z + r * sp * Math.cos(th);
        let blocked = 0;
        for (const fy of [0.3, 0.6, 0.95]) {
            const ty = b.top * fy;
            for (let t = 0.04; t < 1; t += 0.04) {
                const x = b.cx + (cx - b.cx) * t, y = ty + (cy - ty) * t, z = b.cz + (cz - b.cz) * t;
                const o = world.intactAt(x, z);
                if (o && o !== b && o.top > y) { blocked++; break; }
            }
        }
        const turn = Math.abs(Math.atan2(Math.sin(th - preferred), Math.cos(th - preferred)));
        const score = blocked * 10 + turn * 0.5 + (1.12 - phi) * 4;
        if (score < bestScore) { bestScore = score; best = th; bestPhi = phi; }
    }
    orbit.phi = bestPhi;
    return best;
}

function signedArea(p) {
    let a = 0;
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
    }
    return a / 2;
}

/** 옥상 위 사장님 자리: 무게중심에서 카메라 쪽으로 조금, 반드시 지붕 안 */
function roofSpot(b, camDir) {
    const tryAt = (x, z) => pointInPolygon(x, z, b.poly) && distToPolygon(x, z, b.poly) === 0;
    for (const s of [3, 1.5, 0]) {
        const x = b.cx + camDir.x * s, z = b.cz + camDir.z * s;
        if (tryAt(x, z)) return { x, z };
    }
    // L 자 건물처럼 무게중심이 밖이면 격자로 찾는다
    let best = null, bd = Infinity;
    for (let x = b.bbox.minx; x <= b.bbox.maxx; x += 1) for (let z = b.bbox.minz; z <= b.bbox.maxz; z += 1) {
        if (!pointInPolygon(x, z, b.poly)) continue;
        const d = Math.hypot(x - b.cx, z - b.cz);
        if (d < bd) { bd = d; best = { x, z }; }
    }
    return best || { x: b.cx, z: b.cz };
}

// ── 회사 파괴 랭킹: 판이 끝나면 회사 이름(사용자가 입력한 것)과 피해액만 보낸다. 상사는 이름 + 직함 + 날린 횟수만 ──
function playSeconds() {
    return Math.round((performance.now() - game.startAt) / 1000);
}

/** 상사 랭킹용: 이름 + 직함. 손대지 않은 기본 "사장님"·욕 섞인 이름·한 번도 안 날렸으면 안 보냄 */
function bossPayload() {
    const title = (bossLook.title || '').trim();
    const name = (bossLook.name || '').trim();
    if (game.stats.boss < 1 || !title || (!name && title === BOSS_DEFAULT.title) || badWord(name + title)) return null;
    // 랭킹 옆 작은 그림용 모습 (이름·직함은 위에서 따로)
    const look = {};
    for (const k of Object.keys(BOSS_LOOK)) look[k] = String(bossLook[k]);
    return { bossName: name, bossTitle: title, bossHits: game.stats.boss, bossLook: look };
}

function rankPayload() {
    if (game.phase !== 'play' || !game.target) return null;
    const name = (game.name || '').trim();
    const company = game.rankable && name && name !== T.defaultName ? name : null;
    const boss = bossPayload();
    if (!company && !boss) return null;
    const region = company ? game.region || null : null;
    if (game.submitted) {
        // 결과를 본 뒤 "더 부수기"로 더 부순 만큼만 한 번 더 (판 수는 안 늘어남)
        const s = game.sent;
        if (!s) return null;
        const d = Math.round(game.damage) - s.damage, h = (boss ? boss.bossHits : 0) - s.hits;
        if (d < 1 && h < 1) return null;
        const sec = Math.max(1, playSeconds() - s.sec);
        game.sent = { damage: s.damage + Math.max(0, d), hits: s.hits + Math.max(0, h), sec: playSeconds() };
        const extraBoss = boss && h > 0 ? { ...boss, bossHits: h } : {};
        const c = d > 0 ? company : null;
        if (!c && !extraBoss.bossTitle) return null;
        return JSON.stringify({ company: c, damage: Math.max(0, d), seconds: sec, region, extra: true, ...extraBoss });
    }
    if (game.damage < 1 || playSeconds() < 15) return null;
    game.submitted = true;
    game.sent = { damage: Math.round(game.damage), hits: boss ? boss.bossHits : 0, sec: playSeconds() };
    return JSON.stringify({ company, damage: Math.round(game.damage), seconds: playSeconds(), region, ...boss });
}

/** 기록하고 결과(누적·순위)를 돌려준다. 보낼 게 없으면 null */
async function submitPlay() {
    const body = rankPayload();
    if (!body) return null;
    try {
        const r = await fetch('/api/smash/plays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        return r.ok ? await r.json() : null;
    } catch (e) { return null; }
}

/** 페이지를 떠날 때는 응답을 기다릴 수 없어 비콘으로 */
function beaconPlay() {
    const body = rankPayload();
    if (body && navigator.sendBeacon) navigator.sendBeacon('/api/smash/plays', new Blob([body], { type: 'application/json' }));
}

/**
 * 랭킹을 목록(ol)에 그린다. 시작 화면은 TOP 5, 🏆 창·페이지 아래는 TOP 10.
 * fresh: 방금 기록을 보낸 뒤 — 응답이 20초 캐시되니 브라우저 캐시를 건너뛴다
 */
/** 페이지 회사 랭킹에서 고른 동네 (null = 전체) */
let rankRegion = null;
const pageRankDesc = $('smash-pagerank-desc').textContent;

async function loadRanking(olId = 'smash-pagerank-ol', limit = 10, fresh = false) {
    try {
        const detail = olId === 'smash-pagerank-ol';
        const reg = detail && rankRegion ? '&region=' + encodeURIComponent(rankRegion) : '';
        const r = await fetch('/api/smash/rankings?limit=' + limit + reg, fresh ? { cache: 'no-cache' } : undefined);
        if (!r.ok) return;
        const data = await r.json();
        if (detail) regionChips(data.regions || []);
        fillRanking(olId, 'smash-pagerank', detail, data.top || [], e => score(e.damage), T.rankDetail, fmt(T.rankEmpty, data.minPlayers || 2));
        // 상사 응징 랭킹은 페이지 아래 목록에만
        if (detail) {
            fillRanking('smash-bossrank-ol', 'smash-bossrank', true, data.bosses || [], e => fmt(T.bossHitsUnit, e.hits.toLocaleString()), T.bossRankDetail, T.bossRankEmpty);
            bossFaces('smash-bossrank-ol', data.bosses || []);
        }
    } catch (e) { /* 랭킹이 안 떠도 게임은 된다 */ }
}

/** 동네 대항전 칩: 전체 · 최근에 부순 동네 · 고른 동네 · 많이 부서진 동네들 · 🔍 동네 찾기 */
const pickedRegions = [];
function selectRegion(val) {
    rankRegion = val || null;
    if (val && !pickedRegions.includes(val)) pickedRegions.unshift(val);
    if (pickedRegions.length > 3) pickedRegions.length = 3;
    $('smash-pagerank-desc').textContent = val ? fmt(T.regionDesc, regionShort(val)) : pageRankDesc;
    $('smash-pagerank').classList.remove('more');
    loadRanking('smash-pagerank-ol', 10);
    track('smash_region', { region: val || 'all' });
}
function regionChips(regions) {
    const box = $('smash-regions');
    const mine = store.get('smash.region');
    const seen = new Set();
    const list = [];
    const add = (v, label) => { if (v && !seen.has(v)) { seen.add(v); list.push([v, label]); } };
    if (mine) add(mine, '📍 ' + regionShort(mine));
    for (const v of pickedRegions) add(v, regionShort(v));
    for (const g of regions.slice(0, 5)) add(g.name, fmt(T.regionChip, regionShort(g.name), g.companies));
    box.innerHTML = '';
    box.hidden = !list.length && !regions.length;
    if (box.hidden) return;
    const chip = (val, label, cls) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        if (cls) b.className = cls;
        b.classList.toggle('on', val !== undefined && (rankRegion || null) === val);
        b.addEventListener('click', () => (val === undefined ? openRegionFinder() : selectRegion(val)));
        box.appendChild(b);
    };
    chip(null, T.regionAll);
    for (const [v, l] of list) chip(v, l);
    chip(undefined, T.regionFind, 'find');
}

/** 동네 찾기 창: 기록 있는 동네 전부를 시·도로 묶어 보여 주고 검색 */
function openRegionFinder() {
    let dlg = $('smash-regionfind');
    if (!dlg) {
        dlg = document.createElement('div');
        dlg.id = 'smash-regionfind';
        dlg.className = 'bw-regionfind';
        dlg.innerHTML = '<div class="bw-regionfind-dim"></div><div class="bw-regionfind-box" role="dialog" aria-modal="true">'
            + '<div class="bw-regionfind-head"><b></b><button type="button" class="x" aria-label="닫기">✕</button></div>'
            + '<input type="search" autocomplete="off" enterkeyhint="search"><div class="bw-regionfind-list"></div></div>';
        document.body.appendChild(dlg);
        dlg.querySelector('b').textContent = T.regionFindTitle;
        const input = dlg.querySelector('input');
        input.placeholder = T.regionFindPh;
        const close = () => { dlg.classList.remove('open'); };
        dlg.querySelector('.x').addEventListener('click', close);
        dlg.querySelector('.bw-regionfind-dim').addEventListener('click', close);
        input.addEventListener('input', () => drawRegionList(dlg));
        dlg.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    }
    dlg.classList.add('open');
    const list = dlg.querySelector('.bw-regionfind-list');
    list.textContent = T.regionFindLoading;
    fetch('/api/smash/regions').then(r => (r.ok ? r.json() : [])).then(all => { dlg.all = all || []; drawRegionList(dlg); })
        .catch(() => { list.textContent = T.regionFindEmpty; });
    track('smash_region_find');
}
function drawRegionList(dlg) {
    const list = dlg.querySelector('.bw-regionfind-list');
    const q = dlg.querySelector('input').value.replace(/\s+/g, '');
    const all = (dlg.all || []).filter(g => !q || g.name.replace(/\s+/g, '').includes(q));
    list.innerHTML = '';
    if (!all.length) { list.textContent = T.regionFindEmpty; return; }
    // 시·도별로 (시·도 안은 많이 부서진 순 그대로)
    const groups = new Map();
    for (const g of all) {
        const p = g.name.split(' ');
        const sido = p.length > 1 ? p[0] : T.regionEtc;
        if (!groups.has(sido)) groups.set(sido, []);
        groups.get(sido).push(g);
    }
    for (const [sido, gs] of groups) {
        const h = document.createElement('h4');
        h.textContent = sido;
        const row = document.createElement('div');
        for (const g of gs) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = fmt(T.regionChip, g.name.split(' ').slice(1).join(' ') || g.name, g.companies);
            b.addEventListener('click', () => {
                dlg.classList.remove('open');
                selectRegion(g.name);
                $('smash-pagerank').scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            row.appendChild(b);
        }
        list.append(h, row);
    }
}

/** 랭킹 목록 한 개 그리기. detail: 페이지 아래 목록 (메달·부가 설명·폰 "더 보기") */
function fillRanking(olId, sectionId, detail, list, value, detailText, emptyText) {
    const ol = $(olId);
    ol.innerHTML = '';
    for (const e of list) {
        const li = document.createElement('li');
        const i = document.createElement('i'); i.textContent = detail && e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank;
        const s = document.createElement('span'); s.textContent = e.name;
        // 회사 줄: 동네 표시 (누르면 그 동네 랭킹으로)
        if (e.region && olId === 'smash-pagerank-ol' && !rankRegion) {
            const rg = document.createElement('button');
            rg.type = 'button';
            rg.className = 'bw-rg';
            rg.textContent = regionShort(e.region);
            rg.addEventListener('click', () => selectRegion(e.region));
            s.append(rg);
        }
        if (detail) { const d = document.createElement('small'); d.textContent = fmt(detailText, e.players, e.plays); s.append(d); }
        const m = document.createElement('em'); m.textContent = value(e);
        li.append(i, s, m);
        ol.appendChild(li);
    }
    if (!list.length) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = emptyText;
        ol.appendChild(li);
    }
    // 폰은 5위까지만 보이고 나머지는 "더 보기" (CSS 가 숨긴다)
    if (detail) $(sectionId + '-more').hidden = !(list.length > 5 && matchMedia('(max-width: 640px)').matches) || $(sectionId).classList.contains('more');
}

/**
 * 상사 랭킹 옆 작은 상사 그림. 그림판 하나로 상사를 한 명씩 그려 이미지로 굳힘 (한 번만, 쉴 때).
 * 같은 모습은 다시 안 그림. 모습이 없는 옛 기록은 기본 상사로
 */
const faceCache = new Map();
let faceKit = null;
function bossFaceUrl(look) {
    const key = JSON.stringify(look || {});
    if (faceCache.has(key)) return faceCache.get(key);
    if (!faceKit) {
        const cv = document.createElement('canvas');
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
        r.setPixelRatio(1);
        r.setSize(192, 192, false);
        const sc = new THREE.Scene();
        sc.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 2.3));
        const key2 = new THREE.DirectionalLight(0xfff4e0, 2.2);
        key2.position.set(3, 5, 6);
        sc.add(key2);
        const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
        // 가슴 위로 (얼굴·모자·안경이 잘 보이게)
        cam.position.set(0, 2.8, 4.9);
        cam.lookAt(0, 2.4, 0);
        const b = new Boss(sc);
        b.reset(0, 0, 0, 1);
        faceKit = { r, sc, cam, b };
    }
    const { r, sc, cam, b } = faceKit;
    b.setLook({ ...(look || {}), label: '' });
    b.group.rotation.set(0, -0.35, 0);
    b.armR.rotation.z = 2.4; b.armR.rotation.x = -0.3; b.armL.rotation.z = -0.25;
    r.render(sc, cam);
    const url = r.domElement.toDataURL('image/png');
    faceCache.set(key, url);
    return url;
}
function bossFaces(olId, list) {
    const items = [...$(olId).querySelectorAll('li:not(.empty)')];
    const run = () => {
        items.forEach((li, i) => {
            const e = list[i];
            if (!e) return;
            let img = li.querySelector('img.smash-bossface');
            if (!img) { img = document.createElement('img'); img.className = 'smash-bossface'; img.alt = ''; li.insertBefore(img, li.children[1]); }
            try { img.src = bossFaceUrl(e.look); } catch (err) { img.remove(); }
        });
    };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 300);
}

/** 페이지 위 TOP 10 (기록을 보낸 뒤엔 fresh) */
function refreshRankings(fresh = false) {
    loadRanking('smash-pagerank-ol', 10, fresh);
}

$('smash-rank-btn').addEventListener('click', e => {
    e.stopPropagation();
    const pop = $('smash-rankpop');
    pop.hidden = !pop.hidden;
    if (!pop.hidden) loadRanking('smash-rankpop-ol', 10);
});
$('smash-rankpop-close').addEventListener('click', () => { $('smash-rankpop').hidden = true; });

/** 랭킹에 안 올라가는 이유 (올라가면 null). 결과 화면에 알려 준다 — 말없이 빠지면 "저장이 안 된다"고 느낀다 */
function rankSkipReason() {
    if (!game.rankable) return 'noName';
    if (playSeconds() < 15) return 'short';
    if (game.damage < 1) return 'zero';
    return null;
}

function showEndRank(res, skip) {
    const el = $('smash-end-rank');
    // 이름 없는 기본 상사를 때렸으면 상사 랭킹 오르는 법을 알려 줌
    let hint = $('smash-end-bosshint');
    if (!hint) { hint = document.createElement('p'); hint.id = 'smash-end-bosshint'; hint.className = 'smash-end-rank'; el.after(hint); }
    hint.textContent = T.bossRankHint;
    hint.hidden = !(game.stats.boss > 0 && !(bossLook.name || '').trim() && bossLook.title === BOSS_DEFAULT.title);
    // 도전장 결과
    let vs = $('smash-end-vs');
    if (!vs) { vs = document.createElement('p'); vs.id = 'smash-end-vs'; vs.className = 'smash-end-rank vs'; el.before(vs); }
    if (challenge) {
        const me = Math.floor(game.damage * 10);
        vs.textContent = me > challenge.score ? fmt(T.challengeWin, challenge.score.toLocaleString(), me.toLocaleString())
            : fmt(T.challengeLose, (challenge.score - me + 1).toLocaleString());
        vs.classList.toggle('won', me > challenge.score);
        vs.hidden = false;
    } else vs.hidden = true;
    if (res && res.counted === false && res.reason) skip = res.reason;
    if (skip && T.rankSkip[skip]) { el.textContent = T.rankSkip[skip]; el.hidden = false; return; }
    if (!res || !res.name) { el.hidden = true; return; }
    el.textContent = (res.rank
        ? fmt(T.rankLine, res.name, score(res.totalDamage), res.rank)
        : fmt(T.rankPending, res.name, score(res.totalDamage), 2, res.players))
        + (res.region && res.regionRank ? fmt(T.rankRegionLine, res.region, res.regionRank) : '');
    el.hidden = false;
}

addEventListener('pagehide', beaconPlay);

function finish() {
    game.ended = true;
    const sec = Math.round((performance.now() - game.startAt) / 1000);
    const time = sec >= 60 ? fmt(T.minutes, Math.floor(sec / 60), sec % 60) : fmt(T.seconds, sec);
    ui.endTitle.textContent = game.company ? T.endTitle : T.endTitleAny;
    const r = targetRatio();
    const sub = (T.endSubs || []).find(([min]) => r >= min);
    ui.endSub.textContent = fmt(sub ? sub[1] : T.endSub, corpName());
    ui.endStats.innerHTML = '';
    const rows = [
        [T.statDamage, score(game.damage)],
        [T.statRatio, Math.round(targetRatio() * 100) + '%'],
        [T.statBuildings, fmt(T.countUnit, game.stats.buildings.size)],
        [T.statCars, fmt(T.carUnit, game.stats.cars)],
        [fmt(T.statBoss, bossLook.title), fmt(T.timesUnit, game.stats.boss)],
        [T.statTime, time],
        [T.statRank, T.retire],
    ];
    for (const [k, v] of rows) {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        ui.endStats.append(dt, dd);
    }
    ui.rank.textContent = T.retire;
    ui.end.hidden = false;
    say('end', true);
    game.lastLine = ui.bubble.textContent;
    game.shot = snapshot();
    sfx.fanfare();
    cheer();
    track('smash_finish', { seconds: sec });
    $('smash-end-rank').hidden = true;
    const skip = game.submitted ? null : rankSkipReason();
    submitPlay().then(res => {
        if (res && res.counted !== false) game.rankRes = res;
        showEndRank(res && res.counted === false ? res : game.rankRes, game.rankRes ? null : skip);
        refreshRankings(!!res);
    });
}

/**
 * 끝은 사람이 🏁 로 정한다. 이 비율을 넘으면 버튼을 반짝여 알려 주기만 하고 (초고층은 외벽이 끝까지 버티기 쉬워 낮게),
 * 건물이 정말 다 없어졌을 때(AUTO_END)만 저절로 끝낸다. 예전엔 80% 에서 바로 끝나 "다 안 부쉈는데 끝났다"는 말을 들었다.
 */
function endRatio() {
    return game.target && game.target.top > 45 ? 0.65 : 0.8;
}
const AUTO_END = 0.97;
let creditTimer = 0;

function targetRatio() {
    const b = game.target;
    if (!b) return 0;
    if (b.state === 'rubble' || b.state === 'sinking') return 1;
    return b.voxel ? b.voxel.ratio() : 0;
}

// ── 결과 공유: 결과 이미지(스토리 9:16, 카톡용 1:1) + 카카오톡·LINE·X·페이스북·링크 복사 ──

/** 지금 화면을 캔버스로 떠 둔다. 렌더 직후 같은 틱에 복사해야 해서 preserveDrawingBuffer 없이도 된다 */
function snapshot() {
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const k = Math.min(1, 1280 / src.width);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(src.width * k));
    c.height = Math.max(1, Math.round(src.height * k));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
}

/** 친구가 받으면 같은 곳에서 바로 시작하는 주소 */
function shareUrl() {
    const q = new URLSearchParams({ c: game.name });
    const p = game.place;
    if (p && p.lat && p.lng) {
        q.set('lat', (+p.lat).toFixed(5));
        q.set('lng', (+p.lng).toFixed(5));
        q.set('p', p.shared ? p.shared.place : p.name);
        q.set('k', game.company ? '1' : '0');
        if (game.region) q.set('r', game.region);
    }
    // 도전장: 내 점수를 담아 보냄 (받은 친구 화면에 목표로 뜸)
    if (game.damage > 0) q.set('s', String(Math.floor(game.damage * 10)));
    return 'https://game.binaryworld.kr/smash?' + q.toString();
}

function shareRank() { return game.ended ? T.retire : RANKS[game.rankIdx][1]; }

function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

/** 글자가 maxW 를 넘으면 글씨를 줄인다 (최소 minPx) */
function fitFont(g, text, weight, px, minPx, maxW) {
    let s = px;
    do { g.font = `${weight} ${s}px ${FONT}`; s -= 4; } while (s >= minPx && g.measureText(text).width > maxW);
}

/** 사진을 상자에 꽉 차게(넘치는 쪽은 잘라서) */
function drawCover(g, img, x, y, w, h) {
    const k = Math.max(w / img.width, h / img.height);
    const sw = w / k, sh = h / k;
    g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** 공사장 경고 띠 */
function tape(g, y, w, h) {
    g.save();
    g.fillStyle = '#ffd23f';
    g.fillRect(0, y, w, h);
    g.beginPath();
    g.rect(0, y, w, h);
    g.clip();
    g.fillStyle = '#14171d';
    for (let x = -h; x < w + h; x += h * 1.4) {
        g.beginPath();
        g.moveTo(x, y + h); g.lineTo(x + h * 0.7, y + h); g.lineTo(x + h * 1.4, y); g.lineTo(x + h * 0.7, y);
        g.closePath();
        g.fill();
    }
    g.restore();
}

/** 도장: 빨간 테두리 글자를 비스듬히 */
function stampMark(g, text, cx, cy, size) {
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.22);
    g.font = `900 ${size}px ${FONT}`;
    const w = g.measureText(text).width + size * 0.7, h = size * 1.35;
    g.globalAlpha = 0.92;
    g.lineWidth = size * 0.1;
    g.strokeStyle = '#e0242f';
    rr(g, -w / 2, -h / 2, w, h, size * 0.18);
    g.stroke();
    g.fillStyle = '#e0242f';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 0, size * 0.05);
    g.restore();
}

function cardStats() {
    const parts = [`${T.statRatio} ${Math.round(targetRatio() * 100)}%`, `${T.statBuildings} ${fmt(T.countUnit, game.stats.buildings.size)}`];
    if (game.stats.boss) parts.push(`${fmt(T.statBoss, bossLook.title)} ${fmt(T.timesUnit, game.stats.boss)}`);
    return parts.join(' · ');
}

/**
 * 결과 이미지. story = 1080×1920 (인스타·카톡 스토리), square = 1080×1080 (카카오톡 공유 미리보기)
 */
function drawCard(kind) {
    const W = 1080, H = kind === 'story' ? 1920 : 1080;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const shot = game.shot || snapshot();
    const name = corpName();
    const stamp = game.company ? T.cardStamp : T.cardStampAny;
    const pts = score(game.damage);
    const res = game.rankRes;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    if (kind === 'square') {
        drawCover(g, shot, 0, 0, W, H);
        const grad = g.createLinearGradient(0, H * 0.42, 0, H);
        grad.addColorStop(0, 'rgba(11,13,16,0)');
        grad.addColorStop(1, 'rgba(11,13,16,.92)');
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);
        tape(g, 0, W, 34);
        g.fillStyle = 'rgba(11,13,16,.72)';
        rr(g, 40, 64, 470, 66, 33); g.fill();
        g.fillStyle = '#ffd23f'; g.font = `800 34px ${FONT}`; g.textAlign = 'left';
        g.fillText(T.cardKicker, 66, 109);
        g.textAlign = 'center';
        stampMark(g, stamp, W - 190, 190, 92);
        g.fillStyle = '#fff';
        fitFont(g, name, 900, 78, 40, W - 100);
        g.fillText(name, W / 2, H - 230);
        g.fillStyle = '#ffd23f';
        fitFont(g, pts, 900, 132, 60, W - 100);
        g.fillText(pts, W / 2, H - 92);
        return c;
    }
    // story
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1b1f27');
    bg.addColorStop(1, '#0b0d10');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    tape(g, 0, W, 48);
    tape(g, H - 48, W, 48);
    g.fillStyle = '#ffd23f';
    g.font = `800 40px ${FONT}`;
    g.fillText(T.cardKicker, W / 2, 150);
    g.fillStyle = '#fff';
    fitFont(g, name, 900, 92, 44, W - 120);
    g.fillText(name, W / 2, 262);
    // 부서진 화면
    const bx = 60, by = 320, bw = W - 120, bh = 860;
    g.save();
    rr(g, bx, by, bw, bh, 40);
    g.clip();
    drawCover(g, shot, bx, by, bw, bh);
    g.restore();
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(255,255,255,.14)';
    rr(g, bx, by, bw, bh, 40);
    g.stroke();
    stampMark(g, stamp, bx + bw - 170, by + bh - 130, 110);
    // 상사의 마지막 한마디
    const line = game.lastLine || '';
    if (line) {
        fitFont(g, `“${line}”`, 800, 42, 28, W - 220);
        const tw = Math.min(W - 160, g.measureText(`“${line}”`).width + 80);
        g.fillStyle = '#fff';
        rr(g, (W - tw) / 2, 1215, tw, 92, 46);
        g.fill();
        g.beginPath();
        g.moveTo(W / 2 - 22, 1217); g.lineTo(W / 2, 1186); g.lineTo(W / 2 + 22, 1217);
        g.fill();
        g.fillStyle = '#14181f';
        g.fillText(`“${line}”`, W / 2, 1276);
        g.fillStyle = '#9ca3af';
        g.font = `700 30px ${FONT}`;
        g.fillText(`— ${bossLook.title}`, W / 2, 1352);
    }
    g.fillStyle = '#9ca3af';
    g.font = `800 34px ${FONT}`;
    g.fillText(T.cardScore, W / 2, 1450);
    g.fillStyle = '#ffd23f';
    fitFont(g, pts, 900, 168, 80, W - 120);
    g.fillText(pts, W / 2, 1610);
    g.fillStyle = '#e5e7eb';
    fitFont(g, cardStats(), 700, 38, 24, W - 120);
    g.fillText(cardStats(), W / 2, 1690);
    if (res && res.rank) {
        g.fillStyle = '#ffb020';
        g.font = `800 38px ${FONT}`;
        g.fillText(fmt(T.cardRank, res.rank), W / 2, 1750);
    }
    g.fillStyle = '#fff';
    fitFont(g, T.cardCta, 800, 36, 24, W - 120);
    g.fillText(T.cardCta, W / 2, H - 96);
    return c;
}

const toBlob = c => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('blob'))), 'image/png'));

const sheet = { box: $('smash-sharesheet'), img: $('smash-share-img'), blob: null, file: null, kakaoImg: null, objUrl: '',
    vid: $('smash-share-vid'), tabs: $('smash-share-tabs'), vfile: null, vurl: '', mode: 'img' };
/** 지금 공유 창에 보이는 것 (사진 또는 영상) */
function shareMedia() {
    return sheet.mode === 'vid' && sheet.vfile ? { file: sheet.vfile, url: sheet.vurl, vid: true } : { file: sheet.file, url: sheet.objUrl, vid: false };
}
function setShareMode(m) {
    sheet.mode = m === 'vid' && sheet.vfile ? 'vid' : 'img';
    const v = sheet.mode === 'vid';
    sheet.img.hidden = v;
    sheet.vid.hidden = !v;
    if (v) sheet.vid.play().catch(() => {}); else sheet.vid.pause();
    sheet.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === sheet.mode));
    const save = sheet.box.querySelector('[data-act="save"]');
    if (!save.dataset.text) save.dataset.text = save.textContent;
    save.textContent = v ? T.shareSaveVid : save.dataset.text;
    const f = shareMedia().file;
    sheet.native.hidden = !(f && navigator.canShare && navigator.canShare({ files: [f] }));
}
const KAKAO_KEY = '8b68c737be6b8e9a8007c61ee6f9b8da';
let kakaoLoading = null;
function loadKakao() {
    if (window.Kakao) return Promise.resolve();
    if (kakaoLoading) return kakaoLoading;
    kakaoLoading = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://developers.kakao.com/sdk/js/kakao.min.js';
        s.async = true;
        s.onload = res;
        s.onerror = () => { kakaoLoading = null; rej(new Error('kakao sdk')); };
        document.head.appendChild(s);
    });
    return kakaoLoading;
}

/** 카톡 미리보기 사진은 카카오 서버에 올려서 쓴다. 안 되면 게임 대표 이미지로 */
function prepareKakao() {
    sheet.kakaoImg = null;
    return loadKakao().then(() => {
        if (!Kakao.isInitialized()) Kakao.init(KAKAO_KEY);
        const api = Kakao.Share || Kakao.Link;
        if (!api || !api.uploadImage) return;
        return toBlob(drawCard('square'))
            .then(b => api.uploadImage({ file: [new File([b], 'smash.png', { type: 'image/png' })] }))
            .then(r => { sheet.kakaoImg = r && r.infos && r.infos.original && r.infos.original.url; });
    }).catch(() => {});
}

async function openShare() {
    track('smash_share_open');
    sheet.box.hidden = false;
    sheet.box.classList.add('busy');
    sheet.img.removeAttribute('src');
    sheet.native.hidden = true;
    try {
        sheet.blob = await toBlob(drawCard('story'));
        sheet.file = new File([sheet.blob], `smash-${Date.now()}.png`, { type: 'image/png' });
        if (sheet.objUrl) URL.revokeObjectURL(sheet.objUrl);
        sheet.objUrl = URL.createObjectURL(sheet.blob);
        sheet.img.src = sheet.objUrl;
    } catch (e) {
        sheet.blob = sheet.file = null;
        toast(T.shareFail);
    }
    // 하이라이트 영상 (찍힌 게 있으면 영상을 먼저 보여 줌)
    const best = await clip.finish();
    if (sheet.vurl) { URL.revokeObjectURL(sheet.vurl); sheet.vurl = ''; }
    sheet.vfile = null;
    if (best) {
        sheet.vfile = new File([best.blob], `smash-${Date.now()}.${best.ext}`, { type: best.type });
        sheet.vurl = URL.createObjectURL(best.blob);
        sheet.vid.src = sheet.vurl;
    }
    sheet.tabs.hidden = !best;
    setShareMode(best ? 'vid' : 'img');
    sheet.box.classList.remove('busy');
    prepareKakao();
}

function copyText(text) {
    const legacy = () => new Promise((res, rej) => {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy') ? res() : rej(new Error('copy')); } catch (e) { rej(e); }
        ta.remove();
    });
    if (!(navigator.clipboard && window.isSecureContext)) return legacy();
    // 포커스가 없으면 clipboard API 가 끝나지 않는다 — 1초 넘으면 옛 방법으로
    return Promise.race([navigator.clipboard.writeText(text), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1000))]).catch(legacy);
}

function saveImage() {
    const m = shareMedia();
    if (!m.file) return;
    const a = document.createElement('a');
    a.href = m.url;
    a.download = m.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(m.vid ? T.shareSavedVid : T.shareSaved);
}

function shareAct(act) {
    const url = shareUrl();
    const text = fmt(T.shareText, corpName(), score(game.damage), shareRank());
    const popup = u => window.open(u, '_blank', 'noopener,width=600,height=560');
    track('smash_share', { method: act });
    if (act === 'save') saveImage();
    else if (act === 'instagram') {
        // 인스타는 웹 공유 주소가 없음: 폰은 결과 이미지로 공유 창(여기서 인스타 스토리·피드 고름), 안 되면 이미지 저장 + 링크 복사
        copyText(url).catch(() => {});
        const mf = shareMedia().file;
        if (mf && navigator.canShare && navigator.canShare({ files: [mf] })) {
            navigator.share({ files: [mf], text: text + '\n' + url }).catch(e => { if (!e || e.name !== 'AbortError') { saveImage(); toast(T.shareInsta); } });
        } else { saveImage(); toast(T.shareInsta); }
    }
    else if (act === 'native') {
        navigator.share({ files: [shareMedia().file], text: text + '\n' + url }).catch(e => { if (!e || e.name !== 'AbortError') saveImage(); });
    } else if (act === 'kakao') {
        loadKakao().then(() => {
            if (!Kakao.isInitialized()) Kakao.init(KAKAO_KEY);
            const ok = !!sheet.kakaoImg;
            (Kakao.Share || Kakao.Link).sendDefault({
                objectType: 'feed',
                content: {
                    title: fmt(T.shareKakaoTitle, corpName(), score(game.damage)),
                    description: fmt(T.shareKakaoDesc, Math.round(targetRatio() * 100) + '%', shareRank()),
                    imageUrl: ok ? sheet.kakaoImg : 'https://game.binaryworld.kr/img/smash.png',
                    imageWidth: ok ? 1080 : 1200, imageHeight: ok ? 1080 : 630,
                    link: { mobileWebUrl: url, webUrl: url },
                },
                buttons: [{ title: T.shareKakaoBtn, link: { mobileWebUrl: url, webUrl: url } }],
            });
        }).catch(() => toast(T.shareKakaoFail));
    } else if (act === 'line') popup('https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(url));
    else if (act === 'x') popup('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url));
    else if (act === 'facebook') popup('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url));
    else if (act === 'copy') copyText(text + '\n' + url).then(() => toast(T.copied), () => toast(T.copyFail));
}

sheet.native = sheet.box.querySelector('[data-act="native"]');
sheet.tabs.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { setShareMode(b.dataset.m); track('smash_share_mode', { mode: b.dataset.m }); } });
sheet.box.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'close') { sheet.box.hidden = true; sheet.vid.pause(); return; }
    shareAct(b.dataset.act);
});
const share = openShare;

ui.go.addEventListener('click', search);
ui.name.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
ui.fake.addEventListener('click', startFake);
ui.again.addEventListener('click', () => { submitPlay(); if (game.area) { setup(game.area, game.fake, game.placeName); } });
ui.keep.addEventListener('click', () => { ui.end.hidden = true; });
ui.other.addEventListener('click', () => {
    submitPlay().then(res => refreshRankings(!!res));
    ui.end.hidden = true;
    ui.start.hidden = false;
    game.phase = 'start';
});
ui.share.addEventListener('click', share);

if (coarse && ui.hint.dataset.touch) ui.hint.textContent = ui.hint.dataset.touch;
const qs = new URLSearchParams(location.search);
const qName = (qs.get('c') || '').replace(/[<>]/g, '').slice(0, 30);
ui.name.value = (qName || store.get('smash.name') || '').slice(0, 30);
const qLat = +qs.get('lat'), qLng = +qs.get('lng');
if (qName && qLat > 33 && qLat < 39 && qLng > 124 && qLng < 132) {
    // 친구가 공유한 링크: 같은 곳을 결과 하나로 띄워 둔다. 누르면 바로 시작 (소리는 눌러야 켜진다)
    const placeName = (qs.get('p') || qName).replace(/[<>]/g, '').slice(0, 40);
    const company = qs.get('k') !== '0';
    const qReg = (qs.get('r') || '').replace(/[^가-힣 ]/g, '').slice(0, 15) || null;
    const place = { name: placeName, lat: qLat, lng: qLng, category: '', shared: { name: qName, company, place: placeName, region: qReg } };
    const qScore = Math.floor(+qs.get('s') || 0);
    if (qScore > 0 && qScore < 1e9) {
        challenge = { score: qScore, beaten: false };
        showMsg(fmt(T.challengeIntro, qName, qScore.toLocaleString()));
    } else showMsg(T.shareFriend);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'smash-result friend';
    const n = document.createElement('b'); n.textContent = qName;
    b.append(n);
    if (placeName !== qName) { const a = document.createElement('small'); a.textContent = placeName; b.append(a); }
    b.addEventListener('click', () => { initAudio(); choose(qName, place); });
    ui.results.appendChild(b);
} else if (qName) search();
buildBossPanel();
refreshRankings();
$('smash-pagerank-go').addEventListener('click', () => { stage.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (game.phase === 'start') setTimeout(() => ui.name.focus({ preventScroll: true }), 400); });
setup(fakeArea(11), true, null, true);

// ── 무기 버튼 ──
const wBtns = [...ui.weapons.querySelectorAll('button[data-w]')];
function setWeapon(k) {
    game.weapon = k;
    game.nukeArmed = false;
    ui.aim.classList.remove('show');
    wBtns.forEach((b, i) => b.classList.toggle('on', i === k));
    ui.wname.textContent = T.weapons[k] + ' · ' + T.weaponTips[k];
    ui.wname.classList.remove('show'); void ui.wname.offsetWidth; ui.wname.classList.add('show');
}
wBtns.forEach((b, i) => {
    b.querySelector('small').textContent = T.weaponShort[i];
    b.addEventListener('click', e => { e.stopPropagation(); setWeapon(i); initAudio(); });
});
setWeapon(0);
ui.nuke.addEventListener('click', e => {
    e.stopPropagation();
    if (game.phase !== 'play') return;
    // 덜 찼을 때 눌러도 아무 반응이 없으면 고장인 줄 안다 — 얼마나 찼는지 알려 준다
    if (game.nuke < 1) { toast(fmt(T.nukeCharging, Math.floor(game.nuke * 100))); return; }
    game.nukeArmed = !game.nukeArmed;
    ui.aim.textContent = T.nukeAim;
    ui.aim.classList.toggle('show', game.nukeArmed);
});

setMuted(store.get('smash.mute') === '1');
const syncMute = () => { ui.mute.textContent = isMuted() ? '🔇' : '🔊'; };
syncMute();
ui.mute.addEventListener('click', () => { setMuted(!isMuted()); store.set('smash.mute', isMuted() ? '1' : '0'); syncMute(); });
// 배경음악 볼륨: 🎵 를 누르면 슬라이더가 열린다. 0 이면 끈 것 (예전 켜기/끄기 값 smash.bgm=0 도 0 으로)
const volBox = $('smash-vol'), volRange = $('smash-vol-range'), volVal = $('smash-vol-val');
const savedVol = parseInt(store.get('smash.bgmVol'), 10);
setBgmVolume(Number.isFinite(savedVol) ? savedVol / 100 : (store.get('smash.bgm') === '0' ? 0 : 0.3));
// 음악은 처음부터: 브라우저는 사용자가 한 번 누르기 전엔 소리를 막으니, 페이지 어디든(랭킹·스크롤바 말고 클릭·탭·키) 처음 누르는 순간 켠다
const UNLOCK = ['pointerup', 'touchend', 'keydown', 'click'];
const unlockAudio = () => {
    initAudio();
    UNLOCK.forEach(t => document.removeEventListener(t, unlockAudio, true));
};
UNLOCK.forEach(t => document.addEventListener(t, unlockAudio, true));
$('smash-pagerank-more').addEventListener('click', e => { $('smash-pagerank').classList.add('more'); e.currentTarget.hidden = true; });
$('smash-bossrank-more').addEventListener('click', e => { $('smash-bossrank').classList.add('more'); e.currentTarget.hidden = true; });
const syncBgm = () => {
    const v = Math.round(bgmVolume() * 100);
    volRange.value = v;
    volVal.textContent = v + '%';
    ui.bgm.classList.toggle('off', v === 0);
};
syncBgm();
ui.bgm.addEventListener('click', e => { e.stopPropagation(); initAudio(); volBox.hidden = !volBox.hidden; });
volRange.addEventListener('input', () => {
    initAudio();
    setBgmVolume(volRange.value / 100);
    store.set('smash.bgmVol', String(volRange.value));
    syncBgm();
});
// 슬라이더 밖을 누르면 닫는다
document.addEventListener('pointerdown', e => { if (!volBox.hidden && !volBox.contains(e.target) && e.target !== ui.bgm) volBox.hidden = true; });
ui.osm.querySelector('button').addEventListener('click', e => { e.stopPropagation(); clearTimeout(creditTimer); ui.osm.classList.toggle('open'); });
ui.finishBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (game.phase !== 'play') return;
    ui.finishBtn.classList.remove('ready');
    finish();
});
ui.full.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
});
ui.home.addEventListener('click', () => { orbit.target.copy(orbit.home); orbit.zoom = 1; });
ui.help.addEventListener('click', e => { e.stopPropagation(); ui.tut.hidden = !ui.tut.hidden; });
ui.tutOk.addEventListener('click', () => { ui.tut.hidden = true; store.set('smash.tut', '1'); initAudio(); });

const keys = new Set();
document.addEventListener('keydown', e => {
    if (game.phase !== 'play' || e.target === ui.name) return;
    const k = '12345678'.indexOf(e.key);
    if (k >= 0) setWeapon(k);
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase()) && stageHot) {
        keys.add(e.key.toLowerCase());
        e.preventDefault();
    }
});
document.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
let stageHot = false;
stage.addEventListener('pointerenter', () => { stageHot = true; });
stage.addEventListener('pointerleave', () => { stageHot = false; keys.clear(); });

// ── 입력: 탭 = 공격, 꾹 = 연사, 끌기 = 회전(폰은 이동), 오른쪽 버튼 = 이동, 두 손가락 = 돌리기·기울이기·확대, 휠 = 확대 ──
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const ptrs = new Map();
let pinch = 0, mid = null, twist = null;

function aimAt(cx, cy) {
    const r = box.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const sm = street.meshes();
    for (const m of sm) m.computeBoundingSphere();
    const targets = [...world.chunkMeshes(), ...boss.meshes, ...sign.meshes, banner.mesh, ...sm];
    for (const m of world.voxelMeshes()) { m.computeBoundingSphere(); targets.push(m); }
    const hits = raycaster.intersectObjects(targets, false);
    for (const h of hits) if (h.object.visible !== false && h.object.parent && h.object.parent.visible !== false) return h.point.clone();
    const ray = raycaster.ray;
    if (ray.direction.y < -0.01) {
        const t = -ray.origin.y / ray.direction.y;
        if (t < 900) return ray.origin.clone().addScaledVector(ray.direction, t);
    }
    return null;
}

function attack(cx, cy) {
    if (game.phase !== 'play') return false;
    const p = aimAt(cx, cy);
    if (!p) return false;
    const dir = raycaster.ray.direction.clone();
    if (game.nukeArmed) {
        game.nukeArmed = false;
        game.nuke = 0;
        ui.aim.classList.remove('show');
        weapons.nuke(p, dir);
        return true;
    }
    return weapons.fire(game.weapon, p, dir, camera.position);
}

const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => {
    if (game.phase !== 'play') return;
    initAudio();
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, fired: false, firing: false, pan: e.button === 2 || e.shiftKey, touch: e.pointerType === 'touch' });
    if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        twist = Math.atan2(b.y - a.y, b.x - a.x);
        a.moved = b.moved = true; a.firing = b.firing = false;
    }
});
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();
function panBy(dx, dy) {
    const k = orbit.base * orbit.zoom * 0.0022;
    _right.set(Math.cos(orbit.theta), 0, -Math.sin(orbit.theta));
    _fwd.set(-Math.sin(orbit.theta), 0, -Math.cos(orbit.theta));
    orbit.target.addScaledVector(_right, -dx * k).addScaledVector(_fwd, dy * k);
    const lim = 20000;
    orbit.target.x = Math.max(-lim, Math.min(lim, orbit.target.x));
    orbit.target.z = Math.max(-lim, Math.min(lim, orbit.target.z));
}
cv.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) orbit.zoom = Math.min(2.4, Math.max(0.25, orbit.zoom * pinch / d));
        pinch = d;
        // 지도 앱처럼 두 손가락 비틀기 = 돌리기, 같이 위아래로 밀기 = 기울이기
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (twist !== null) {
            let da = ang - twist;
            if (da > Math.PI) da -= Math.PI * 2;
            if (da < -Math.PI) da += Math.PI * 2;
            orbit.theta -= da;
        }
        twist = ang;
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (mid) orbit.phi = Math.min(1.45, Math.max(0.3, orbit.phi - (m.y - mid.y) * 0.006));
        mid = m;
        return;
    }
    if (p.firing) return;
    if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > 9) p.moved = true;
    if (p.moved) {
        // 폰은 한 손가락 끌기가 이동 (지도 앱과 같게)
        if (p.pan || p.touch) panBy(dx, dy);
        else {
            orbit.theta -= dx * 0.008;
            orbit.phi = Math.min(1.45, Math.max(0.3, orbit.phi - dy * 0.006));
        }
    }
});
function release(e) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) { pinch = 0; mid = null; twist = null; }
    if (!p.moved && !p.fired && !p.pan && performance.now() - p.t < 500) attack(p.x, p.y);
}
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch = 0; mid = null; twist = null; });
cv.addEventListener('wheel', e => {
    if (game.phase !== 'play') return;
    e.preventDefault();
    orbit.zoom = Math.min(2.4, Math.max(0.25, orbit.zoom * (1 + Math.sign(e.deltaY) * 0.09)));
}, { passive: false });
cv.addEventListener('contextmenu', e => e.preventDefault());

/** 꾹 누르고 있으면 연사. 쏘는 동안 손가락을 움직이면 조준이 따라간다 */
function holdFire(now) {
    if (ptrs.size !== 1) return;
    const p = ptrs.values().next().value;
    if (p.pan || (p.moved && !p.firing)) return;
    const w = WEAPONS[game.weapon];
    if (game.nukeArmed || !w.hold) return;
    const wait = w.id === 'gun' || w.id === 'flame' || w.id === 'hammer' ? 110 : 240;
    if (now - p.t < wait) return;
    p.firing = true;
    if (attack(p.x, p.y)) p.fired = true;
}

// ── 루프 ──
let visible = true;
new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(stage);
const clock = new THREE.Clock();
let time = 0;
const landings = [];
const _h = new THREE.Vector3();

function onShatter(s) {
    for (let i = 0; i < s.length && i < 36; i += 3) fx.glass(s[i], s[i + 1], s[i + 2], 3);
    sfx.glass(s.length / 3);
}

// ── 끝없이 이어지는 동네: 카메라가 있는 칸 주변 3×3 칸을 이어 붙이고, 두 칸 넘게 멀어진 칸은 치운다 ──

/** 역마다 카카오에서 출구 번호를 받아 붙인다 (실시간, 저장 안 함) */
function fetchExits(stations, area) {
    const o = world.origin;
    if (!o) return;
    const kx = 111320 * Math.cos(o.lat * Math.PI / 180);
    for (const st of stations) {
        const lat = o.lat - st.z * UNIT_M / 110574, lng = o.lng + st.x * UNIT_M / kx;
        fetch(`/api/smash/exits?station=${encodeURIComponent(st.name)}&lat=${lat}&lng=${lng}`)
            .then(r => r.ok ? r.json() : [])
            .then(list => { if (game.area === area) landmarks.applyExits(list, st, o); })
            .catch(() => {});
    }
}

function streamTick(dt) {
    if (!stream.on || game.phase !== 'play') return;
    stream.t -= dt;
    if (stream.t > 0) return;
    stream.t = 0.5;
    const cs = world.cellSize;
    const ci = Math.round(orbit.target.x / cs), cj = Math.round(orbit.target.z / cs);
    // 멀어진 칸 치우기
    for (const key of [...stream.loaded]) {
        const [i, j] = key.split(',').map(Number);
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) <= 2) continue;
        world.removeCell(key);
        landmarks.removeCell(key);
        stream.loaded.delete(key);
    }
    world.trimSat(orbit.target.x, orbit.target.z, cs * 2.8);
    street.trim(orbit.target.x, orbit.target.z, cs * 2.8);
    if (stream.busy) return;
    // 폰은 시작하자마자 이웃 칸을 한꺼번에 받으면 끊긴다 — 회사 근처에 있는 동안은 받지 않고, 움직이기 시작하면 받는다
    if (coarse && Math.hypot(orbit.target.x - orbit.home.x, orbit.target.z - orbit.home.z) < 60) return;
    // 아직 없는 이웃 칸 중 가장 가까운 것 하나
    const now = performance.now();
    let next = null, nd = Infinity;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const key = (ci + di) + ',' + (cj + dj);
        if (stream.loaded.has(key) || (stream.failed.get(key) || 0) > now) continue;
        const d = di * di + dj * dj;
        if (d < nd) { nd = d; next = { i: ci + di, j: cj + dj, key }; }
    }
    if (!next) return;
    stream.busy = true;
    const area = stream.area, o = world.origin;
    const lat = o.lat - next.j * CELL_M / 110574, lng = o.lng + next.i * CELL_M / (111320 * Math.cos(o.lat * Math.PI / 180));
    fetch(`/api/smash/area?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(data => {
            if (game.area !== area || !stream.on) return;
            const add = world.addArea(data, next.key);
            street.extend(add.roads, next.i * cs, next.j * cs);
            fetchExits(landmarks.extend(add.pois, world, add.buildings, next.key), area);
            if (data.sat) world.loadSat((next.i - 0.75) * cs, (next.i + 0.75) * cs, (next.j - 0.75) * cs, (next.j + 0.75) * cs, satZoom);
            stream.loaded.add(next.key);
        })
        .catch(e => { console.warn("stream cell failed", next.key, e && e.stack); stream.failed.set(next.key, performance.now() + 20000); })
        .finally(() => { stream.busy = false; });
}

function frame() {
    requestAnimationFrame(frame);
    const raw = Math.min(clock.getDelta(), 1 / 30);
    // 핵폭탄이 터진 순간 잠깐 슬로모션 (터지는 맛)
    let dt = raw;
    if (slowmo > 0) { slowmo -= raw; dt = raw * slowK; }
    if (!visible || document.hidden) return;
    time += dt;
    const now = performance.now();

    if (game.phase === 'play') {
        holdFire(now);
        if (keys.size) {
            const s = 500 * dt;
            panBy((keys.has('a') || keys.has('arrowleft') ? s : 0) - (keys.has('d') || keys.has('arrowright') ? s : 0),
                (keys.has('w') || keys.has('arrowup') ? s : 0) - (keys.has('s') || keys.has('arrowdown') ? s : 0));
        }
    }
    weapons.update(dt);

    landings.length = 0;
    world.step(dt / 2, landings, onShatter);
    world.step(dt / 2, landings, onShatter);
    for (let i = 0, n = 0; i < landings.length && n < 12; i += 4, n++) {
        if (landings[i + 3] > 9 || Math.random() < 0.3) fx.dust(landings[i], landings[i + 1] + 0.2, landings[i + 2], 2, 1, 0.7);
        sfx.thump(landings[i + 3]);
    }
    for (const v of world.voxels) {
        if (v.supportDirty) {
            const res = v.updateSupport();
            if (res.count > 0) {
                let cx = 0, cy = 0, cz = 0;
                for (const i of res.drop) { cx += v.pos[i * 3]; cy += v.pos[i * 3 + 1]; cz += v.pos[i * 3 + 2]; }
                _h.set(cx / res.count, cy / res.count, cz / res.count);
                const big = res.count >= 30;
                const val = addDamage(res.value, _h, null);
                if (big) {
                    pop(_h, fmt(T.collapse, score(val, false)), 'big');
                    sfx.rumble(res.count);
                    trauma = Math.min(1, trauma + Math.min(0.8, res.count / 300));
                    if (v.meta && v.meta.target) say('big', true);
                    if (res.count > 150) cheer();
                    for (let k = 0; k < Math.min(res.count, 40); k++) {
                        const i = res.drop[Math.floor(Math.random() * res.count)];
                        fx.dust(v.pos[i * 3], v.pos[i * 3 + 1], v.pos[i * 3 + 2], 1, 2, 1.2);
                    }
                } else sfx.crash(res.count);
            }
        }
        const fv = v.stepFire(dt);
        if (fv) addDamage(fv, null);
        const em = v.embers;
        for (let i = 0; i < em.length && i < 60; i += 3) fx.flameAt(em[i], em[i + 1] + 0.4, em[i + 2], v.vs * 1.3, 0.8);
        if (v.shatter.length) onShatter(v.shatter);
        if (v.meta && !game.stats.buildings.has(v.meta.id) && v.ratio() > 0.5) game.stats.buildings.add(v.meta.id);
    }
    world.stepCollapse(dt, (x, y, z) => fx.dust(x, y, z, 2, 3, 1.5), (x, y, z, b, first, sp) => {
        // 층 덩어리가 바닥에 부딪힐 때: 파편·유리·먼지 구름·쿵 소리
        const w = Math.max(b.bbox.maxx - b.bbox.minx, b.bbox.maxz - b.bbox.minz);
        fx.chunks(x, y, z, 14, w * 0.6, 1 + sp * 0.02, Math.max(0.6, w * 0.05));
        fx.glass(x, y + 1, z, 10, null, 1.4);
        fx.dust(x, y, z, 10, w * 0.7, 2.2);
        if (Math.random() < 0.5) fx.papersBurst(x, y + 1, z, 4, 1.2);
        sfx.thump(10 + Math.min(10, sp * 0.4));
        sfx.crash(30);
        trauma = Math.min(1, trauma + 0.12);
        if (first) {
            fx.ring(b.cx, 0.3, b.cz, w * 1.2, 0xe5dccb);
            fx.pow(b.cx, b.top * 0.6, b.cz, '와르르!', Math.max(2, w * 0.12), '#ffffff');
            for (let k = 0; k < 6; k++) fx.smokeAt(b.cx + (Math.random() - 0.5) * w, 1, b.cz + (Math.random() - 0.5) * w, w * 0.5, 0.5);
        }
    });
    world.tickBake(dt);


    if (game.phase === 'play') {
        const bev = boss.update(dt, time, world, camera.position);
        if (bev === 'fall') { sfx.scream(bossLook.gender, 'fly'); say('fly', true, true); }
        else if (bev === 'land') { sfx.thump(12); fx.dust(boss.group.position.x, boss.group.position.y + 0.3, boss.group.position.z, 8, 1.6, 1); }
        else if (bev === 'up') say('up', true);
        if (bev === 'fall' && !game.bossOut) {
            game.bossOut = true;
            boss.center(_h);
            const v = addDamage(150, _h, null);
            toast(fmt(T.bossOut, bossLook.title, score(v, false)));
            cheer();
        }
        if (sign.update(dt, world) === 'fall' && !game.signPaid) {
            game.signPaid = true;
            const v = addDamage(60, sign.group.position, null);
            pop(sign.group.position, fmt(T.signDown, score(v, false)), 'big');
            sfx.crash(20);
        }
        if (banner.update(dt, time, world) === 'fall') {
            fx.papersBurst(banner.group.position.x, banner.group.position.y, banner.group.position.z, 6, 0.8);
        }
    }
    street.update(dt, time, camera.position);
    landmarks.update(dt, world);
    fx.update(dt, camera.position);

    if (game.phase === 'play') {
        game.lineT -= dt;
        game.idleT -= dt;
        if (game.lineT <= 0) ui.bubble.classList.remove('show');
        if (game.idleT <= 0 && boss.state === 'stand') { say('idle'); game.idleT = 5 + Math.random() * 4; }
        if (ui.bubble.classList.contains('show')) {
            boss.group.updateMatrixWorld();
            boss.headPos(_h);
            const s = toScreen(_h.x, _h.y, _h.z);
            ui.bubble.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
            ui.bubble.style.visibility = s.behind ? 'hidden' : 'visible';
        }
        if (game.comboT > 0) { game.comboT -= dt; if (game.comboT <= 0) game.combo = 0; }
        if (game.combo >= 3) {
            ui.combo.textContent = fmt(T.combo, game.combo) + ' ×' + mult().toFixed(2).replace(/0$/, '');
            ui.combo.classList.add('show');
        } else ui.combo.classList.remove('show');
        game.shown += (game.damage - game.shown) * Math.min(1, dt * 8);
        if (game.damage - game.shown < 0.5) game.shown = game.damage;
        ui.money.textContent = score(game.shown);
        if (challenge && game.phase === 'play') {
            const me = Math.floor(game.damage * 10);
            if (!challenge.beaten && me > challenge.score) {
                challenge.beaten = true;
                toast(T.challengeBeat); sfx.fanfare(); cheer();
                ui.goal.classList.add('won');
            }
            const txt = challenge.beaten ? T.challengeWonHud : fmt(T.challengeHud, challenge.score.toLocaleString());
            if (ui.goal.textContent !== txt) ui.goal.textContent = txt;
        }
        const ratio = targetRatio();
        ui.ratio.textContent = Math.floor(ratio * 100) + '%';
        ui.bar.style.width = Math.min(100, ratio * 100) + '%';
        game.nuke = Math.min(1, game.nuke + dt / 150);
        const wasReady = ui.nuke.classList.contains('ready');
        ui.nuke.style.setProperty('--g', game.nuke.toFixed(3));
        ui.nuke.classList.toggle('ready', game.nuke >= 1);
        if (!wasReady && game.nuke >= 1) { toast(T.nukeReady); sfx.rank(); }
        wBtns.forEach((b, i) => b.style.setProperty('--cd', weapons.coolRatio(i).toFixed(3)));
        if (!game.ended && !game.nearEnd && ratio >= endRatio()) {
            game.nearEnd = true;
            ui.finishBtn.classList.add('ready');
            toast(T.nearEnd);
        }
        if (!game.ended && ratio >= AUTO_END) {
            if (game.endTimer < 0) game.endTimer = 1.8;
            game.endTimer -= dt;
            if (game.endTimer <= 0) finish();
        }
    }
    streamTick(dt);
    world.flushRoofs(coarse ? 1 : 2);
    drawBossPreview(dt);
    if (game.phase === 'start') orbit.theta += dt * 0.12;
    followBoss(dt);
    placeCamera(dt);
    // 이름표는 이번 프레임 카메라로 잡아야 안 밀림
    labels.setVisible(game.phase !== 'start');
    if (game.phase !== 'start') {
        camera.updateMatrixWorld();
        // 옥상 상사와 말풍선 자리는 이름표가 가리지 않게
        const avoid = hudRects(dt).slice();
        if (boss.group.visible) {
            // 상사가 커서 발~머리 위 이름표까지 통째로 피함
            boss.group.getWorldPosition(_bossAt);
            const ft = toScreen(_bossAt.x, _bossAt.y, _bossAt.z);
            boss.headPos(_bossAt);
            const h = toScreen(_bossAt.x, _bossAt.y, _bossAt.z);
            const half = Math.max(130, (ft.y - h.y) * 0.6);
            if (!h.behind) avoid.push({ x0: h.x - half, y0: h.y - 80, x1: h.x + half, y1: Math.max(h.y + 50, ft.y + 10) });
        }
        labels.update(dt, world, game.target, orbit.target, orbit.base * orbit.zoom * 1.8, toScreen, box.clientWidth, box.clientHeight, camera.position, avoid);
    }
    updateFinder();
    renderer.render(scene, camera);
    clip.frame();
}

requestAnimationFrame(frame);
// 자동 테스트용 손잡이. 주소에 ?debug 가 있을 때만 연다
if (new URLSearchParams(location.search).has('debug')) {
    window.__smash = { game, world, boss, street, landmarks, stream, orbit, camera, attack, setWeapon, setup, lineFor, timeKind, finish, drawCard, shareUrl, sfx, weapons, fx, clip, dbg: () => ({ slowmo, slowK, trauma }) };
}
