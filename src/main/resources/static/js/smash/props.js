import * as THREE from 'three';

const GRAV = -24;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export function labelTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}

export const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';

function fitFont(g, text, maxW, size, weight = 900) {
    let s = size;
    do {
        g.font = `${weight} ${s}px ${FONT}`;
        s -= 2;
    } while (g.measureText(text).width > maxW && s > 10);
}

/** 바닥(발)이 원점인 물체를 떨어뜨리고 굴린다. 딛는 면은 월드가 알려준다. */
class Rigid {
    constructor(obj) {
        this.obj = obj;
        this.vel = new THREE.Vector3();
        this.ang = new THREE.Vector3();
        this.flying = false;
    }

    launch(vx, vy, vz, spin) {
        this.flying = true;
        this.vel.set(vx, vy, vz);
        this.ang.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
    }

    /** 반환: 착지 속도 (착지 안 했으면 0) */
    step(dt, world, gravScale = 1, drag = 0) {
        if (!this.flying) return 0;
        const p = this.obj.position;
        this.vel.y += GRAV * gravScale * dt;
        if (drag) this.vel.multiplyScalar(1 - drag * dt);
        const ny = p.y + this.vel.y * dt;
        const nx = p.x + this.vel.x * dt;
        const nz = p.z + this.vel.z * dt;
        if (world.blocked(nx, Math.max(ny, p.y) + 0.5, nz, null) && this.vel.y > -2) {
            this.vel.x *= -0.3; this.vel.z *= -0.3;
        } else {
            p.x = nx; p.z = nz;
        }
        const top = world.surface(p.x, Math.max(p.y, ny + 0.3), p.z, null);
        if (ny <= top && this.vel.y <= 0) {
            p.y = top;
            const sp = -this.vel.y;
            if (sp > 7) {
                this.vel.y = sp * 0.3;
                this.vel.x *= 0.6; this.vel.z *= 0.6;
                this.ang.multiplyScalar(0.6);
                return sp;
            }
            this.flying = false;
            this.vel.set(0, 0, 0);
            return Math.max(sp, 0.01);
        }
        p.y = ny;
        const w = this.ang.length();
        if (w > 0.01) {
            _q.setFromAxisAngle(_v.copy(this.ang).divideScalar(w), w * dt);
            this.obj.quaternion.premultiply(_q);
        }
        if (p.y < -30) { p.y = 0; this.flying = false; }
        return 0;
    }
}

const SKIN = 0xf2c39b, SHIRT = 0xffffff, TIE = 0xd8333a, MUSTACHE = 0x3b2a20, GOLD = 0xd4a52a;

/** 상사 옷 색. 키는 저장값(suit) 그대로 — 예전 다섯 색도 같은 키 */
export const BOSS_COLORS = {
    navy: 0x283247, gray: 0x6b7280, black: 0x1a1a1f, brown: 0x6d4c41, wine: 0x7b2d3b,
    red: 0xd8333a, yellow: 0xf2b630, pink: 0xf08fb0, green: 0x2f8f5b, sky: 0x5aa9e6, white: 0xeef0f3,
};
/** 꾸미기 기본값. 모르는 값이 오면 이걸로 */
export const BOSS_LOOK = { gender: 'm', hair: 'bald', glasses: 'horn', suit: 'navy', outfit: 'suit', body: 'normal', beard: 'mustache', face: 'angry', hat: 'none', item: 'none' };
// 체형: 배 타원 크기 x, y, z, 배를 앞으로 내미는 양
const BODIES = { normal: [1, 1.05, 0.88, 0], belly: [1.16, 1.1, 1.25, 0.12], slim: [0.8, 1.03, 0.72, 0] };
// 모자가 머리 위로 솟는 높이 (이름표·말풍선을 그만큼 올림)
const HAT_TOP = { fedora: 0.26, hiking: 0.1, crown: 0.3 };

// 재질은 색마다 하나만 만들어 미리보기 상사·게임 상사가 같이 씀 (지우지 않음)
const MATS = new Map();
function mat(hex, kind = 'l') {
    const k = kind + hex;
    let m = MATS.get(k);
    if (!m) {
        const side = kind.includes('d') ? THREE.DoubleSide : THREE.FrontSide;
        m = kind.startsWith('p') ? new THREE.MeshPhongMaterial({ color: hex, shininess: 70, side }) : new THREE.MeshLambertMaterial({ color: hex, side });
        MATS.set(k, m);
    }
    return m;
}
function shade(hex, k) { return new THREE.Color(hex).multiplyScalar(k).getHex(); }
/** 옷 색과 겹치지 않는 포인트 색 */
function accent(hex, a = 0xd8333a, b = 0x1f2a44) {
    const warm = [a, BOSS_COLORS.red, BOSS_COLORS.wine, BOSS_COLORS.pink];
    return warm.includes(hex) ? b : a;
}

const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (rt, rb, h, n = 14, open = false, t0 = 0, tl = Math.PI * 2) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open, t0, tl);
function part(parent, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true;
    parent.add(o);
    return o;
}
/** 갈아입힐 묶음 비우기. 공유 재질은 두고 모양·자기 전용 재질만 버린다 */
function clearSlot(g) {
    for (const c of [...g.children]) {
        g.remove(c);
        c.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material && o.material.userData.own) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
        });
    }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _seg = new THREE.Line3();

export class Boss {
    constructor(scene) {
        const g = this.group = new THREE.Group();
        this.body = new THREE.Group();
        g.add(this.body);
        const B = this.body;
        const slot = p => { const s = new THREE.Group(); p.add(s); return s; };
        // 다리·구두·배·팔. 색과 크기는 옷·체형 따라 setLook 에서 바꿈
        this.legs = [-1, 1].map(s => part(B, BOX(0.34, 0.85, 0.38), mat(0x1d2333), s * 0.22, 0.43, 0));
        this.shoes = [-1, 1].map(s => part(B, BOX(0.4, 0.16, 0.56), mat(0x111111), s * 0.22, 0.08, 0.07));
        this.belly = part(B, new THREE.SphereGeometry(0.66, 20, 14), mat(BOSS_COLORS.navy), 0, 1.42, 0);
        this.dressBelly = slot(this.belly); // 배 곡면을 따라 붙는 것 (지퍼·띠)
        // 앞판: 배 앞면에 붙는 것. 체형 따라 통째로 앞뒤로 민다
        this.front = slot(B);
        this.shirt = part(this.front, new THREE.SphereGeometry(0.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), mat(SHIRT), 0, 1.62, 0.36, Math.PI / 2 - 0.25);
        this.shirt.scale.set(0.7, 0.62, 0.6);
        this.tie = part(this.front, BOX(0.13, 0.55, 0.06), mat(TIE), 0, 1.5, 0.6, -0.1);
        // 목걸이 (여성 상사)
        this.necklace = slot(this.front);
        const pearl = new THREE.SphereGeometry(0.045, 8, 6);
        for (let i = 0; i < 9; i++) {
            const a = -0.9 + i * 0.225;
            part(this.necklace, pearl, mat(0xf5f0e6), Math.sin(a) * 0.3, 1.78 - Math.cos(a) * 0.16 + 0.08, 0.42 + Math.cos(a) * 0.05).castShadow = false;
        }
        this.dress = slot(B);
        this.dressF = slot(this.front);
        this.armL = new THREE.Group(); this.armL.position.set(-0.68, 1.8, 0); B.add(this.armL);
        this.armR = new THREE.Group(); this.armR.position.set(0.68, 1.8, 0); B.add(this.armR);
        this.sleeves = [this.armL, this.armR].map(a => part(a, BOX(0.26, 0.8, 0.28), mat(BOSS_COLORS.navy), 0, -0.38, 0));
        this.hands = [this.armL, this.armR].map(a => part(a, BOX(0.22, 0.2, 0.22), mat(SKIN), 0, -0.84, 0));
        this.dressArm = [slot(this.armL), slot(this.armR)];
        this.item = slot(this.armR); // 손에 든 것 (치켜든 오른손)
        this.head = new THREE.Group(); this.head.position.set(0, 2.42, 0); B.add(this.head);
        const H = this.head;
        part(H, new THREE.SphereGeometry(0.46, 22, 16), mat(SKIN, 'p'));
        // 눈·눈썹·입. 표정은 이 셋의 크기·각도로만 바꿈
        this.eyes = []; this.pupils = []; this.brows = [];
        for (const s of [-1, 1]) {
            this.eyes.push(part(H, new THREE.SphereGeometry(0.075, 10, 8), mat(0xffffff), s * 0.16, 0.05, 0.43));
            this.pupils.push(part(H, new THREE.SphereGeometry(0.042, 8, 6), mat(0x1a1a1a), s * 0.155, 0.045, 0.46));
            this.brows.push(part(H, BOX(0.17, 0.035, 0.03), mat(0x2b2420), s * 0.17, 0.2, 0.43));
        }
        this.mouth = part(H, BOX(0.16, 0.04, 0.04), mat(0x7a1f1f), 0, -0.25, 0.42);
        this.sweat = part(H, new THREE.SphereGeometry(0.055, 8, 6), mat(0x9fd8ff, 'p'), 0.37, 0.24, 0.26);
        this.sweat.scale.set(0.75, 1.35, 0.75);
        this.glasses = slot(H); this.beard = slot(H); this.hat = slot(H); this.hairSlot = slot(H);
        // 이름표: 머리 위에 늘 카메라를 보는 판. 건물에 가려도 보이게 깊이 검사를 끔 (상사 찾기)
        this.plateMat = new THREE.SpriteMaterial({ transparent: true, depthTest: false });
        this.plate = new THREE.Sprite(this.plateMat);
        this.plate.renderOrder = 5;
        this.plate.position.set(0, 3.55, 0);
        this.plate.scale.set(2.6, 0.62, 1);
        this.plate.visible = false;
        g.add(this.plate);
        this.stars = new THREE.Group(); this.stars.position.set(0, 3.05, 0); g.add(this.stars);
        for (let i = 0; i < 3; i++) {
            const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
            s.position.set(Math.cos(i * 2.09) * 0.5, 0, Math.sin(i * 2.09) * 0.5);
            this.stars.add(s);
        }
        this.stars.visible = false;
        this.size = 1.6;
        this.bodyR = 0.66;
        this.hatTop = 0;
        this.setLook({});
        g.scale.setScalar(this.size);
        scene.add(g);
        this.rigid = new Rigid(g);
    }

    reset(x, y, z, size = 1.6) {
        this.size = size;
        this.group.scale.setScalar(size);
        this.group.position.set(x, y, z);
        this.group.quaternion.identity();
        this.rigid.flying = false;
        this.state = 'stand';
        this.timer = 0;
        this.talk = 0;
        this.hitCool = 0;
        this.stars.visible = false;
        this.stars.position.set(0, 3.05 + this.hatTop, 0);
        // 날아가도 이 원 밖으로는 못 나감 (못 찾게 멀리 가지 않게). 반지름은 main 이 정함
        this.bound = { x, z, r: 30 };
    }

    /**
     * 상사 꾸미기. look = { gender, hair, glasses, suit(옷 색), outfit, body, beard, face, hat, item, label }
     * hair: bald 대머리 | part 가르마 | slick 올백 | perm 파마 | bob 단발 | long 긴머리 | pony 묶음
     * 모르는 값은 기본 모양으로 그림
     */
    setLook(look) {
        const L = { ...BOSS_LOOK, label: '', ...look };
        const f = L.gender === 'f';
        // 체형: 배 크기를 바꾸고 앞판·팔을 배 겉면에 맞춤
        const [bx, by, bz, oz] = BODIES[L.body] || BODIES.normal;
        const sx = bx * (f ? 0.88 : 1), sz = bz * (f ? 0.9 : 1);
        this.belly.scale.set(sx, by, sz);
        this.belly.position.set(0, 1.42, oz);
        this.front.position.z = oz + 0.66 * sz - 0.58;
        this.armL.position.x = -(0.66 * sx + 0.03);
        this.armR.position.x = 0.66 * sx + 0.03;
        this.bodyR = 0.66 * Math.max(sx, sz);
        this.dressUp(L.outfit, BOSS_COLORS[L.suit] ?? BOSS_COLORS.navy, f, sx, sz, oz);
        this.mouth.material = mat(f ? 0xd0344a : 0x7a1f1f);
        // 머리
        clearSlot(this.hairSlot);
        this.hairSlot.add(hairMesh(L.hair, L.hair === 'bald' ? 0x5a5a5a : (f ? 0x2b201b : 0x24211f)));
        // 안경 (예전 저장값은 true/false)
        clearSlot(this.glasses);
        buildGlasses(this.glasses, L.glasses === true ? 'horn' : L.glasses === false ? 'none' : L.glasses);
        clearSlot(this.beard);
        buildBeard(this.beard, L.beard);
        clearSlot(this.hat);
        buildHat(this.hat, L.hat);
        this.hatTop = HAT_TOP[L.hat] || 0;
        clearSlot(this.item);
        buildItem(this.item, L.item);
        this.faceKind = ['angry', 'smug', 'panic'].includes(L.face) ? L.face : 'angry';
        this.applyFace(this.faceKind);
        // 이름표: 모자 높이만큼 올림
        this.plate.position.y = 3.55 + this.hatTop;
        if (this.plateMat.map) this.plateMat.map.dispose();
        this.plateMat.map = L.label ? labelTexture(512, 120, (g, w, h) => {
            g.fillStyle = 'rgba(216,51,58,0.95)'; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 30); g.fill();
            g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
            fitFont(g, L.label, w - 50, 70);
            g.fillText(L.label, w / 2, h / 2 + 3);
        }) : null;
        this.plateMat.needsUpdate = true;
        this.plate.visible = !!L.label;
        this.meshes = [];
        this.group.traverse(o => { if (o.isMesh) this.meshes.push(o); });
    }

    /** 옷 종류별 모양. 배·소매·다리는 있는 걸 칠하고, 나머지는 묶음에 새로 붙임 */
    dressUp(kind, color, f, sx, sz, oz) {
        for (const s of [this.dress, this.dressF, this.dressBelly, ...this.dressArm]) clearSlot(s);
        const main = mat(color), dark = mat(shade(color, 0.7)), white = mat(SHIRT);
        const backZ = oz - 0.66 * sz;
        // 기본: 정장 차림
        let pants = 0x1d2333, shoes = 0x111111, sleeve = main, arm = 'long', shirt = true, tie = true, pearl = true, wideLegs = false;
        this.belly.material = main;
        this.hands[0].material = this.hands[1].material = mat(SKIN);
        for (const s of this.shoes) { s.scale.y = 1; s.position.y = 0.08; }
        this.shirt.scale.set(0.7, 0.62, 0.6);
        const F = this.dressF, D = this.dress, BL = this.dressBelly;
        // 배 곡면을 따라 내려가는 앞 줄 (지퍼)
        const zipper = (m, w) => { part(BL, new THREE.SphereGeometry(0.668, 3, 12, Math.PI / 2 - w / 2, w, 0.25, 2.1), m).castShadow = false; };
        const collar = m => part(D, CYL(0.3, 0.36, 0.2, 16, true), m, 0, 2.0, oz * 0.5);
        const buttons = (m, ys) => ys.forEach(([y, z]) => { part(F, new THREE.SphereGeometry(0.04, 8, 6), m, 0, y, z).castShadow = false; });
        switch (kind) {
            case 'vest':
                sleeve = white; pants = 0x4b5563; shoes = 0x3b2a20;
                this.shirt.scale.set(0.85, 0.62, 0.6);
                buttons(mat(GOLD, 'p'), [[1.36, 0.59], [1.2, 0.56], [1.04, 0.5]]);
                part(F, BOX(0.24, 0.02, 0.02), mat(GOLD, 'p'), 0.2, 1.16, 0.55, 0, 0, 0.35).castShadow = false; // 회중시계 줄
                for (const a of this.dressArm) part(a, BOX(0.28, 0.06, 0.3), mat(0x9ca3af), 0, -0.3, 0); // 팔 고리
                break;
            case 'golf': {
                pants = 0xe9e4d4; shoes = 0xf5f5f5; arm = 'short'; shirt = tie = pearl = false;
                const trim = color === BOSS_COLORS.white ? mat(BOSS_COLORS.navy) : white;
                for (const s of [-1, 1]) part(D, BOX(0.2, 0.05, 0.15), trim, s * 0.11, 2.0, oz * 0.5 + 0.3, 0.7, 0, -s * 0.35);
                part(F, BOX(0.07, 0.26, 0.02), dark, 0, 1.84, 0.43, -0.45).castShadow = false;
                part(D, CYL(0.42, 0.42, 0.08, 18), mat(0x3b2a20), 0, 0.86, 0); // 벨트
                this.hands[0].material = white; // 왼손 장갑
                break;
            }
            case 'hiking': {
                pants = 0x374151; shoes = 0x6b4a2e; shirt = tie = pearl = false;
                for (const s of this.shoes) { s.scale.y = 1.7; s.position.y = 0.13; }
                collar(mat(color, 'd'));
                zipper(mat(0x222222), 0.04);
                const band = accent(color, 0x222222, BOSS_COLORS.yellow);
                part(BL, new THREE.SphereGeometry(0.67, 20, 2, 0, Math.PI * 2, 0.78, 0.26), mat(band)).castShadow = false;
                part(D, BOX(0.74, 0.86, 0.3), mat(accent(color, 0xe3762b, 0x3f4a3a)), 0, 1.5, backZ - 0.1); // 배낭
                part(D, CYL(0.12, 0.12, 0.72, 10), mat(0x2f6f4f), 0, 2.0, backZ - 0.1, 0, 0, Math.PI / 2);
                for (const a of this.dressArm) part(a, BOX(0.28, 0.08, 0.3), mat(band), 0, -0.68, 0); // 소맷부리
                break;
            }
            case 'training': {
                pants = color; shoes = 0xf5f5f5; shirt = tie = pearl = false;
                const line = color === BOSS_COLORS.white ? mat(BOSS_COLORS.navy) : white;
                collar(main);
                zipper(line, 0.035);
                this.dressArm.forEach((a, i) => { part(a, BOX(0.04, 0.8, 0.29), line, (i ? 1 : -1) * 0.12, -0.38, 0).castShadow = false; });
                for (const s of [-1, 1]) part(D, BOX(0.04, 0.85, 0.39), line, s * 0.38, 0.43, 0).castShadow = false;
                break;
            }
            case 'hanbok': {
                pants = 0xe9e4d4; shoes = 0xf5f5f5; arm = 'wide'; shirt = tie = false; wideLegs = true;
                // 동정(흰 깃) 두 줄이 엇갈리고, 옷고름이 늘어짐
                part(F, BOX(0.09, 0.62, 0.04), white, 0.07, 1.7, 0.47, -0.4, 0, 0.62);
                part(F, BOX(0.09, 0.42, 0.04), white, -0.13, 1.82, 0.4, -0.5, 0, -0.62);
                const ribbon = mat(accent(color));
                part(F, BOX(0.07, 0.5, 0.03), ribbon, 0.12, 1.32, 0.58, -0.08, 0, 0.12);
                part(F, BOX(0.07, 0.4, 0.03), ribbon, 0.22, 1.36, 0.57, -0.08, 0, -0.18);
                part(F, new THREE.SphereGeometry(0.06, 8, 6), ribbon, 0.16, 1.58, 0.56);
                break;
            }
            case 'gown': {
                pants = 0x2b2b2b; shoes = shade(color, 0.6); arm = 'wide'; tie = false;
                const trim = mat(GOLD, 'p');
                // 무릎까지 오는 가운 자락
                part(D, CYL(0.6, 0.76, 0.95, 20, true), mat(color, 'd'), 0, 0.64, oz).scale.set(sx, 1, sz);
                for (const s of [-1, 1]) part(F, BOX(0.13, 0.78, 0.04), trim, s * 0.15, 1.58, 0.5, -0.28, 0, -s * 0.36);
                part(BL, new THREE.TorusGeometry(0.62, 0.045, 6, 26), trim, 0, -0.24, 0, Math.PI / 2);
                part(BL, BOX(0.08, 0.32, 0.03), trim, 0.16, -0.42, 0.6, -0.4, 0, 0.2);
                part(BL, BOX(0.08, 0.28, 0.03), trim, 0.26, -0.42, 0.57, -0.4, 0, -0.1);
                for (const a of this.dressArm) part(a, CYL(0.27, 0.27, 0.08, 10, true), trim, 0, -0.78, 0);
                break;
            }
            default: // suit 정장: 깃·단추·행커치프
                for (const s of [-1, 1]) part(F, BOX(0.1, 0.5, 0.04), dark, s * 0.17, 1.68, 0.5, -0.35, 0, -s * 0.42);
                buttons(mat(0x111111), [[1.2, 0.56], [1.03, 0.49]]);
                part(F, BOX(0.13, 0.06, 0.03), white, -0.3, 1.64, 0.47, -0.2).castShadow = false;
        }
        for (const s of this.sleeves) {
            s.material = sleeve;
            s.visible = arm !== 'wide';
            s.scale.y = arm === 'short' ? 0.45 : 1;
            s.position.y = arm === 'short' ? -0.18 : -0.38;
        }
        // 반팔은 맨팔, 넓은 소매는 아래로 퍼지는 통
        if (arm === 'short') for (const a of this.dressArm) part(a, BOX(0.2, 0.44, 0.22), mat(SKIN), 0, -0.58, 0);
        if (arm === 'wide') for (const a of this.dressArm) part(a, CYL(0.15, 0.27, 0.82, 12), main, 0, -0.4, 0);
        for (const l of this.legs) { l.material = mat(pants); l.scale.set(wideLegs ? 1.3 : 1, 1, wideLegs ? 1.2 : 1); }
        for (const s of this.shoes) s.material = mat(shoes);
        this.shirt.visible = shirt;
        this.tie.visible = tie && !f;
        this.necklace.visible = f && pearl;
    }

    /** 표정: angry 버럭 | smug 능글 | panic 당황 (날아가거나 쓰러지면 잠깐 당황) */
    applyFace(kind) {
        this.faceNow = kind;
        const smug = kind === 'smug', panic = kind === 'panic';
        this.eyes.forEach(e => e.scale.set(panic ? 1.3 : 1, smug ? 0.42 : panic ? 1.3 : 0.8, 0.4));
        this.pupils.forEach(p => p.scale.set(panic ? 0.7 : 1, panic ? 0.7 : smug ? 0.55 : 1, 0.5));
        this.brows.forEach((b, i) => {
            const s = i ? 1 : -1;
            if (panic) { b.rotation.z = -s * 0.3; b.position.y = 0.25; }
            else if (smug) { b.rotation.z = i ? -0.05 : 0.18; b.position.y = i ? 0.18 : 0.26; }
            else { b.rotation.z = s * 0.32; b.position.y = 0.2; }
        });
        const m = this.mouth;
        m.scale.x = panic ? 0.6 : smug ? 1.25 : 1;
        this.mouthY = panic ? 3.2 : 1;
        m.scale.y = this.mouthY;
        m.rotation.z = smug ? 0.24 : 0;
        m.position.set(smug ? 0.05 : 0, panic ? -0.27 : -0.25, 0.42);
        this.sweat.visible = panic;
    }

    say() { this.talk = 1.6; }

    headPos(out) { return out.set(0, this.plate.visible ? this.plate.position.y + 0.5 : 3.25 + this.hatTop, 0).applyMatrix4(this.group.matrixWorld); }
    center(out) { return out.set(0, 1.4, 0).applyMatrix4(this.group.matrixWorld); }
    /** 맞았는지 볼 때: 발목~정수리 선분까지 거리. 덩치가 커지면 같이 커짐 */
    hitDist(p) {
        const m = this.group.matrixWorld;
        _seg.set(_a.set(0, 0.4, 0).applyMatrix4(m), _b.set(0, 2.6, 0).applyMatrix4(m));
        return _seg.closestPointToPoint(p, true, _v).distanceTo(p);
    }
    /** 몸통 반지름 (월드) */
    hitR() { return (this.bodyR + 0.12) * this.size; }

    knock(dir, force) {
        if (this.hitCool > 0) return false;
        this.hitCool = 0.3;
        this.state = 'fly';
        this.stars.visible = false;
        // 옆으로는 덜, 위로는 더 날림 (멀리 사라지지 않고 높이 붕 뜨게)
        this.rigid.launch(dir.x * force * 0.45, 9 + force * 0.5, dir.z * force * 0.45, 10);
        return true;
    }

    /** 블랙홀 등 외부 힘. 날고 있지 않으면 띄운다 */
    push(vx, vy, vz) {
        if (this.state !== 'fly') { this.state = 'fly'; this.rigid.launch(0, 2, 0, 6); this.stars.visible = false; }
        this.rigid.vel.x += vx; this.rigid.vel.y += vy; this.rigid.vel.z += vz;
    }

    /** 반환: 'fall' | 'land' | 'bounce' | 'up' | null */
    update(dt, time, world, camPos) {
        this.hitCool -= dt;
        const g = this.group;
        let ev = null;
        // 날아가거나 쓰러져 있는 동안은 당황한 얼굴
        const face = this.state === 'fly' || this.state === 'down' ? 'panic' : this.faceKind;
        if (face !== this.faceNow) this.applyFace(face);
        if (this.talk > 0) {
            this.talk -= dt;
            this.mouth.scale.y = this.mouthY + Math.abs(Math.sin(time * 22)) * 3;
        } else this.mouth.scale.y = this.mouthY;

        if (this.state === 'stand') {
            const p = g.position;
            const top = world.surface(p.x, p.y + 0.05, p.z, null);
            if (top < p.y - 0.25) {
                this.state = 'fly';
                this.rigid.launch(0, 0, 0, 2);
                ev = 'fall';
            } else {
                p.y = Math.max(p.y, top);
                const yaw = Math.atan2(camPos.x - p.x, camPos.z - p.z);
                _q.setFromAxisAngle(UP, yaw);
                g.quaternion.slerp(_q, Math.min(1, dt * 4));
                this.body.position.y = Math.abs(Math.sin(time * 3)) * 0.06;
                this.armR.rotation.z = 2.4 + Math.sin(time * 6) * 0.35;
                this.armR.rotation.x = -0.3;
                this.armL.rotation.z = -0.25 + Math.sin(time * 3) * 0.1;
                this.head.rotation.z = Math.sin(time * 2.2) * 0.08;
            }
        }
        if (this.state === 'fly') {
            this.armR.rotation.z = 2.6 + Math.sin(time * 30) * 0.6;
            this.armL.rotation.z = -2.6 - Math.sin(time * 30) * 0.6;
            const land = this.rigid.step(dt, world);
            // 보이지 않는 울타리: 넘으면 안쪽으로 튕겨 돌아옴
            const bd = this.bound, p = g.position, v = this.rigid.vel;
            const ox = p.x - bd.x, oz = p.z - bd.z, d = Math.hypot(ox, oz);
            if (d > bd.r) {
                const nx = ox / d, nz = oz / d, out = v.x * nx + v.z * nz;
                if (out > 0) { v.x -= 1.6 * out * nx; v.z -= 1.6 * out * nz; }
                p.x = bd.x + nx * bd.r; p.z = bd.z + nz * bd.r;
            }
            if (land > 0 && !this.rigid.flying) {
                this.state = 'down';
                // 금방 털고 일어나야 또 때리는 맛이 있음
                this.timer = 0.4;
                this.stars.visible = true;
                _e.set(-Math.PI / 2, Math.random() * Math.PI * 2, 0, 'YXZ');
                this.lieQ = new THREE.Quaternion().setFromEuler(_e);
                ev = 'land';
            } else if (land > 0) ev = 'bounce';
        }
        if (this.state === 'down') {
            g.quaternion.slerp(this.lieQ, Math.min(1, dt * 10));
            this.armR.rotation.z = 1.2; this.armL.rotation.z = -1.2;
            this.stars.rotation.y += dt * 6;
            this.stars.position.set(0, 0.6, 2.9);
            this.timer -= dt;
            const p = g.position;
            if (world.surface(p.x, p.y + 0.05, p.z, null) < p.y - 0.25) { this.rigid.launch(0, 0, 0, 1); this.state = 'fly'; }
            else if (this.timer <= 0) { this.state = 'rise'; this.timer = 0.15; this.stars.visible = false; ev = 'up'; }
        }
        if (this.state === 'rise') {
            const yaw = Math.atan2(camPos.x - g.position.x, camPos.z - g.position.z);
            _q2.setFromAxisAngle(UP, yaw);
            g.quaternion.slerp(_q2, Math.min(1, dt * 22));
            this.timer -= dt;
            if (this.timer <= 0) { this.state = 'stand'; this.stars.position.set(0, 3.05 + this.hatTop, 0); }
        }
        return ev;
    }
}

/** 안경: none | horn 뿔테 | gold 금테 | sun 선글라스. 머리 그룹 기준 (얼굴은 +z) */
function buildGlasses(g, kind) {
    if (kind === 'none') return;
    if (kind === 'sun') {
        const lens = mat(0x101317, 'p');
        // 눈알보다 앞에 오게 얼굴에서 조금 띄움
        for (const x of [-0.16, 0.16]) part(g, CYL(0.125, 0.125, 0.025, 16), lens, x, 0.04, 0.49, Math.PI / 2).scale.set(1, 1, 0.82);
        part(g, BOX(0.5, 0.03, 0.025), lens, 0, 0.13, 0.48);
        return;
    }
    const gold = kind === 'gold';
    const m = gold ? mat(GOLD, 'p') : mat(0x111111);
    for (const x of [-0.16, 0.16]) part(g, new THREE.TorusGeometry(gold ? 0.1 : 0.11, gold ? 0.013 : 0.03, 6, 18), m, x, 0.05, 0.42).castShadow = false;
    part(g, BOX(0.1, gold ? 0.014 : 0.03, 0.02), m, 0, 0.06, 0.43);
}

/** 수염: none | mustache 콧수염 | kaiser 팔자 | goatee 염소 | full 덥수룩 */
function buildBeard(g, kind) {
    const m = mat(MUSTACHE);
    switch (kind) {
        case 'none': return;
        case 'kaiser':
            for (const s of [-1, 1]) {
                part(g, BOX(0.17, 0.05, 0.05), m, s * 0.085, -0.155, 0.435, 0, 0, s * 0.3);
                part(g, new THREE.SphereGeometry(0.026, 6, 5), m, s * 0.155, -0.118, 0.425);
            }
            return;
        case 'goatee':
            part(g, BOX(0.26, 0.05, 0.06), m, 0, -0.15, 0.43);
            part(g, new THREE.ConeGeometry(0.08, 0.26, 7), m, 0, -0.49, 0.32, Math.PI);
            return;
        case 'full':
            part(g, BOX(0.36, 0.09, 0.08), m, 0, -0.14, 0.43);
            part(g, new THREE.SphereGeometry(0.5, 18, 6, Math.PI / 2 - 1.3, 2.6, 2.2, 0.8), mat(MUSTACHE, 'd'), 0, 0.01, 0.02);
            return;
        default:
            part(g, BOX(0.34, 0.09, 0.08), m, 0, -0.14, 0.42);
    }
}

/** 모자: none | visor 골프 바이저 | fedora 중절모 | hiking 등산모 | band 머리띠 | crown 왕관 */
function buildHat(g, kind) {
    switch (kind) {
        case 'visor':
            part(g, CYL(0.48, 0.48, 0.13, 24, true), mat(0xffffff, 'd'), 0, 0.27, 0);
            part(g, CYL(0.44, 0.44, 0.03, 18, false, -Math.PI / 2, Math.PI), mat(0x1f2a44), 0, 0.23, 0.1, 0.12).scale.z = 1.15;
            break;
        case 'fedora': {
            const m = mat(0x4b3a2f);
            part(g, CYL(0.38, 0.47, 0.36, 18), m, 0, 0.5, -0.02);
            part(g, CYL(0.475, 0.475, 0.08, 18), mat(0x1a1a1a), 0, 0.36, -0.02);
            part(g, CYL(0.8, 0.8, 0.035, 26), m, 0, 0.32, -0.02, 0.1);
            break;
        }
        case 'hiking': {
            const m = mat(0x8a7f5a, 'd');
            part(g, CYL(0.4, 0.5, 0.3, 18), m, 0, 0.38, 0);
            part(g, CYL(0.5, 0.74, 0.13, 24, true), m, 0, 0.18, 0);
            break;
        }
        case 'band': {
            part(g, new THREE.TorusGeometry(0.475, 0.055, 6, 28), mat(0xffffff), 0, 0.22, 0, Math.PI / 2 + 0.12);
            const tm = new THREE.MeshBasicMaterial({ transparent: true, map: labelTexture(256, 100, (c, w, h) => {
                c.fillStyle = '#d8333a'; c.textAlign = 'center'; c.textBaseline = 'middle';
                fitFont(c, '필승', w - 20, 84);
                c.fillText('필승', w / 2, h / 2 + 4);
            }) });
            tm.userData.own = true;
            part(g, new THREE.PlaneGeometry(0.34, 0.13), tm, 0, 0.225, 0.535, -0.12).castShadow = false;
            break;
        }
        case 'crown': {
            const m = mat(0xf2c230, 'pd');
            part(g, CYL(0.33, 0.3, 0.2, 18, true), m, 0, 0.5, 0);
            for (let i = 0; i < 6; i++) {
                const a = i / 6 * Math.PI * 2;
                part(g, new THREE.ConeGeometry(0.06, 0.18, 6), m, Math.sin(a) * 0.32, 0.68, Math.cos(a) * 0.32);
            }
            part(g, new THREE.SphereGeometry(0.05, 8, 6), mat(0xd8333a, 'p'), 0, 0.5, 0.33);
            break;
        }
    }
}

/** 손에 든 것: none | board 결재판 | club 골프채 | coffee 아아 | phone 휴대폰. 오른팔 기준 (손은 y -0.84, 팔을 치켜들면 -y 가 위) */
function buildItem(g, kind) {
    switch (kind) {
        case 'board': {
            const b = new THREE.Group(); b.position.set(0, -1.14, 0.06); g.add(b);
            part(b, BOX(0.46, 0.62, 0.05), mat(0x1f2a44));
            part(b, BOX(0.38, 0.5, 0.012), mat(0xffffff), 0, 0.01, 0.03).castShadow = false;
            for (let i = 0; i < 3; i++) part(b, BOX(0.24, 0.018, 0.006), mat(0x9ca3af), -0.03, 0.14 - i * 0.07, 0.04).castShadow = false;
            part(b, CYL(0.06, 0.06, 0.012, 14), mat(0xd8333a), 0.1, -0.15, 0.04, Math.PI / 2).castShadow = false; // 도장
            part(b, BOX(0.14, 0.05, 0.03), mat(GOLD, 'p'), 0, -0.29, 0.04);
            break;
        }
        case 'club':
            part(g, CYL(0.045, 0.045, 0.34, 8), mat(0x111111), 0, -0.98, 0);
            part(g, CYL(0.022, 0.022, 1.7, 6), mat(0xc0c6cc, 'p'), 0, -1.9, 0);
            part(g, new THREE.SphereGeometry(0.15, 12, 8), mat(0x22252a, 'p'), 0, -2.78, 0.1).scale.set(0.9, 0.7, 1.4);
            break;
        case 'coffee': {
            // 팔을 치켜들면 똑바로 서게 뒤집어 둠
            const c = new THREE.Group(); c.position.set(0, -0.98, 0.04); c.rotation.z = Math.PI; g.add(c);
            part(c, CYL(0.16, 0.12, 0.42, 14), mat(0x5a3a22));
            part(c, CYL(0.165, 0.15, 0.15, 14), mat(0xc8975a), 0, 0.02, 0);
            part(c, CYL(0.17, 0.17, 0.04, 14), mat(0xffffff), 0, 0.23, 0);
            part(c, CYL(0.018, 0.018, 0.34, 6), mat(0x2f8f5b), 0.04, 0.38, 0, 0, 0, -0.18);
            break;
        }
        case 'phone': {
            const p = new THREE.Group(); p.position.set(0, -1.06, 0.06); g.add(p);
            part(p, BOX(0.25, 0.46, 0.04), mat(0x111111));
            part(p, BOX(0.21, 0.4, 0.006), mat(0x6ec1ff, 'p'), 0, 0, 0.022).castShadow = false;
            break;
        }
    }
}

/** 머리 모양. 머리 그룹 기준 좌표(머리 반지름 0.46, 얼굴은 +z) */
function hairMesh(style, color) {
    const g = new THREE.Group();
    const m = mat(color);
    const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
        const o = new THREE.Mesh(geo, m);
        o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); o.castShadow = true;
        g.add(o);
        return o;
    };
    // 정수리 덮개: 위쪽 반구, 앞이마는 조금 열어 둔다
    const cap = (theta = Math.PI * 0.42, r = 0.49) => add(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, theta), 0, 0.02, -0.02, -0.18);
    // 얼굴만 뚫린 옆·뒷머리 (원통의 앞쪽을 비운다. three.js 원통은 각도 0 이 +z)
    const skirt = (h, y, r0 = 0.5, r1 = 0.53) => add(new THREE.CylinderGeometry(r0, r1, h, 20, 1, true, 0.95, Math.PI * 2 - 1.9), 0, y, -0.02);
    switch (style) {
        case 'part':
            cap();
            add(new THREE.BoxGeometry(0.03, 0.02, 0.4), -0.15, 0.47, 0.05, -0.2);
            add(new THREE.BoxGeometry(0.1, 0.3, 0.34), -0.44, -0.02, -0.06);
            add(new THREE.BoxGeometry(0.1, 0.3, 0.34), 0.44, -0.02, -0.06);
            break;
        case 'slick':
            cap(Math.PI * 0.46, 0.485).rotation.x = -0.32;
            add(new THREE.BoxGeometry(0.36, 0.26, 0.14), 0, -0.02, -0.42);
            break;
        case 'perm':
            for (let i = 0; i < 22; i++) {
                const a = i * 2.39996, t = Math.acos(1 - (i + 0.5) / 22 * 1.15);
                if (Math.cos(a) > 0.55 && t > 0.75) continue;
                add(new THREE.SphereGeometry(0.15, 8, 6), Math.sin(t) * Math.sin(a) * 0.47, Math.cos(t) * 0.47 + 0.04, Math.sin(t) * Math.cos(a) * 0.47 - 0.04);
            }
            break;
        case 'bob':
            cap(Math.PI * 0.5);
            skirt(0.5, -0.18);
            add(new THREE.SphereGeometry(0.5, 16, 8, Math.PI / 2 - 0.95, 1.9, 0.3, 0.55), 0, 0.03, 0.02);
            break;
        case 'long':
            cap(Math.PI * 0.5);
            skirt(1.0, -0.42, 0.5, 0.58);
            add(new THREE.SphereGeometry(0.5, 16, 8, Math.PI / 2 - 0.95, 1.9, 0.3, 0.55), 0, 0.03, 0.02);
            break;
        case 'pony':
            cap(Math.PI * 0.5);
            add(new THREE.SphereGeometry(0.15, 10, 8), 0, 0.12, -0.52);
            add(new THREE.CylinderGeometry(0.1, 0.05, 0.6, 8), 0, -0.2, -0.6, 0.25);
            break;
        default: // bald: 옆·뒤만 희끗
            add(new THREE.BoxGeometry(0.12, 0.32, 0.36), -0.44, -0.02, -0.06);
            add(new THREE.BoxGeometry(0.12, 0.32, 0.36), 0.44, -0.02, -0.06);
            add(new THREE.BoxGeometry(0.36, 0.2, 0.12), 0, 0, -0.42);
    }
    return g;
}

/** 옥상 간판. 다리 밑이 꺼지면 떨어진다. */
export class Sign {
    constructor(scene) {
        this.group = new THREE.Group();
        this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const dark = new THREE.MeshLambertMaterial({ color: 0x1f2a44 });
        this.board = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, 0.35), [dark, dark, dark, dark, this.mat, dark]);
        this.board.castShadow = true;
        this.group.add(this.board);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x444b55 });
        this.legs = [0, 1].map(() => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), legMat);
            this.group.add(leg);
            return leg;
        });
        scene.add(this.group);
        this.rigid = new Rigid(this.group);
        this.meshes = [this.board];
    }

    setName(text) {
        if (this.mat.map) this.mat.map.dispose();
        this.mat.map = labelTexture(1024, 192, (g, w, h) => {
            g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, h);
            g.fillStyle = '#d8333a'; g.fillRect(0, h - 18, w, 18);
            g.fillStyle = '#1f2a44';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            fitFont(g, text, w - 60, 120);
            g.fillText(text, w / 2, h / 2 - 6);
        });
        this.mat.needsUpdate = true;
    }

    /** 대상 건물 옥상, 카메라 반대쪽 가장자리에 카메라를 향해 세운다 */
    reset(b, camDir) {
        const s = Math.min(3, Math.max(1, b.top / 30));
        this.group.scale.setScalar(s);
        const w = Math.min(16, Math.max(6, Math.sqrt(b.area) * 0.75)) / s;
        this.w = w;
        this.board.scale.x = w;
        this.board.position.y = 2.3;
        this.legs[0].position.set(-w / 2 + 0.8, 0.55, 0);
        this.legs[1].position.set(w / 2 - 0.8, 0.55, 0);
        // 중심에서 카메라 반대 방향으로 지붕 안쪽 끝을 찾는다
        // 양쪽 다리와 가운데가 모두 지붕 안에 드는 데까지만 뒤로 물러난다
        const rx = camDir.z, rz = -camDir.x, half = (w / 2 - 0.8) * s;
        const fits = (x, z) => pointInRoof(b, x, z) && pointInRoof(b, x + rx * half, z + rz * half) && pointInRoof(b, x - rx * half, z - rz * half);
        let x = b.cx, z = b.cz;
        for (let d = 0; d < 60; d += 0.5) {
            const tx = b.cx - camDir.x * d, tz = b.cz - camDir.z * d;
            if (!fits(tx, tz)) break;
            x = tx; z = tz;
        }
        if (d0(x, z, b) > 1.5 * s) { x += camDir.x * 1.5 * s; z += camDir.z * 1.5 * s; }
        this.group.position.set(x, b.top, z);
        this.group.quaternion.setFromAxisAngle(UP, Math.atan2(camDir.x, camDir.z));
        this.rigid.flying = false;
        this.down = false;
        this.group.visible = true;
    }

    knock(dir, force) {
        if (this.rigid.flying) return false;
        this.rigid.launch(dir.x * force * 0.5, 5 + force * 0.3, dir.z * force * 0.5, 4);
        return true;
    }

    /** 반환: 'fall' 처음 떨어질 때 */
    update(dt, world) {
        let ev = null;
        if (!this.rigid.flying && !this.down) {
            const p = this.group.position;
            let lost = 0;
            for (const leg of [...this.legs, this.board]) {
                _v.copy(leg.position).setY(0).multiplyScalar(this.group.scale.x).applyQuaternion(this.group.quaternion).add(p);
                if (world.surface(_v.x, p.y + 0.05, _v.z, null) < p.y - 0.4) lost++;
            }
            if (lost >= 1) this.rigid.launch((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2, 2.5);
        }
        if (this.rigid.flying && !this.down) { this.down = true; ev = 'fall'; }
        this.rigid.step(dt, world);
        return ev;
    }
}

/** 지붕 가장자리까지 거리 (밖이면 0) */
function d0(x, z, b) {
    if (!pointInRoof(b, x, z)) return 0;
    let best = Infinity;
    const p = b.poly, n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = p[j * 2], az = p[j * 2 + 1], dx = p[i * 2] - ax, dz = p[i * 2 + 1] - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
    }
    return best;
}

function pointInRoof(b, x, z) {
    let inside = false;
    const p = b.poly, n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

/** 외벽 현수막. 매단 벽이 무너지면 펄럭이며 떨어진다. */
export class Banner {
    constructor(scene) {
        this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 16, 1), this.mat);
        this.group = new THREE.Group();
        this.group.add(this.mesh);
        scene.add(this.group);
        this.rigid = new Rigid(this.group);
        this.base = this.mesh.geometry.attributes.position.array.slice();
    }

    setText(top, name, bottom) {
        if (this.mat.map) this.mat.map.dispose();
        this.mat.map = labelTexture(1024, 140, (g, w, h) => {
            g.fillStyle = '#d8333a'; g.fillRect(0, 0, w, h);
            g.fillStyle = '#fff';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            const s = name.replace(/\s/g, '').includes(top.replace(/\s/g, '')) ? `${name} — ${bottom}` : `${top} ${name} — ${bottom}`;
            fitFont(g, s, w - 50, 64, 800);
            g.fillText(s, w / 2, h / 2 + 2);
        });
        this.mat.needsUpdate = true;
    }

    /** 카메라 쪽을 가장 많이 보는 긴 벽에 건다 */
    reset(b, camDir) {
        const p = b.poly, n = p.length / 2;
        const sign = signedArea(p) < 0 ? 1 : -1;
        let best = null, bestScore = -Infinity;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
            const L = Math.hypot(bx - ax, bz - az);
            if (L < 5) continue;
            const nx = sign * -(bz - az) / L, nz = sign * (bx - ax) / L;
            const face = nx * camDir.x + nz * camDir.z;
            const score = face * Math.min(L, 30);
            if (score > bestScore) { bestScore = score; best = { ax, az, bx, bz, L, nx, nz }; }
        }
        this.group.visible = !!best && bestScore > 0;
        this.down = false;
        this.rigid.flying = false;
        if (!this.group.visible) return;
        const w = Math.min(best.L * 0.8, 28);
        const h = Math.max(1.4, w * 0.09);
        this.mesh.scale.set(w, h, 1);
        this.mesh.position.y = -h / 2;
        const mx = (best.ax + best.bx) / 2, mz = (best.az + best.bz) / 2;
        const y = Math.max(h + 2, b.top * 0.72);
        const out = b.vs * 0.5 + 0.12, depth = b.vs * 0.75 + 0.3;
        this.group.position.set(mx + best.nx * out, y, mz + best.nz * out);
        this.group.quaternion.setFromAxisAngle(UP, Math.atan2(best.nx, best.nz));
        // 매단 점: 현수막 양 끝 위, 벽 살짝 안쪽
        const ux = (best.bx - best.ax) / best.L, uz = (best.bz - best.az) / best.L;
        this.anchors = [-1, 1].map(s => ({ x: mx + ux * s * w * 0.45 - best.nx * depth, y: y - 0.3, z: mz + uz * s * w * 0.45 - best.nz * depth }));
        this.w = w;
    }

    update(dt, time, world) {
        let ev = null;
        if (!this.group.visible) return null;
        if (!this.down) {
            const held = this.anchors.filter(a => world.blocked(a.x, a.y, a.z, null)).length;
            if (held < 2) {
                this.down = true;
                this.rigid.launch((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 3);
                ev = 'fall';
            }
        }
        if (this.down) this.rigid.step(dt, world, 0.35, 1.2);
        const pos = this.mesh.geometry.attributes.position;
        const amp = this.down && this.rigid.flying ? 0.5 : 0.04;
        for (let i = 0; i < pos.count; i++) {
            const x = this.base[i * 3];
            pos.array[i * 3 + 2] = Math.sin(x * 9 + time * (this.down ? 9 : 2.5)) * amp / Math.max(1, this.w * 0.05);
        }
        pos.needsUpdate = true;
        return ev;
    }
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
