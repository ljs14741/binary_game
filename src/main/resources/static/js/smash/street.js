import * as THREE from 'three';
import { labelTexture } from './props.js';

const GRAV = -24;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const EMBER = new THREE.Color(0xe0581c), CHAR = new THREE.Color(0x1d1a17);
const UP = new THREE.Vector3(0, 1, 0);

/** 인덱스 없는 지오메트리 여러 개를 하나로 (position·normal 만) */
function merge(parts) {
    const pos = [], nor = [];
    for (const [geo, x, y, z, rx = 0, ry = 0, rz = 0] of parts) {
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
        g.translate(x, y, z);
        pos.push(...g.attributes.position.array);
        nor.push(...g.attributes.normal.array);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return out;
}

function inst(scene, geo, color, count, shadow = true) {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color }), count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = shadow;
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
    return m;
}

/** 바닥이 원점인 강체 한 개를 한 걸음 움직인다. 반환: 착지 속도(안 닿았으면 0) */
function stepBody(o, dt, world, bounce = 0.3) {
    o.v.y += GRAV * dt;
    const nx = o.p.x + o.v.x * dt, nz = o.p.z + o.v.z * dt, ny = o.p.y + o.v.y * dt;
    if (world.blocked(nx, Math.max(ny, o.p.y) + 0.4, nz, null) && o.v.y > -3) { o.v.x *= -0.3; o.v.z *= -0.3; }
    else { o.p.x = nx; o.p.z = nz; }
    const s = world.surface(o.p.x, Math.max(o.p.y, ny) + 0.2, o.p.z, null);
    if (ny <= s && o.v.y <= 0) {
        o.p.y = s;
        const sp = -o.v.y;
        if (sp > 6) {
            o.v.y = sp * bounce; o.v.x *= 0.6; o.v.z *= 0.6; o.w.multiplyScalar(0.6);
            return sp;
        }
        o.v.set(0, 0, 0);
        o.w.set(0, 0, 0);
        o.air = false;
        return Math.max(sp, 0.01);
    }
    o.p.y = ny;
    const w = o.w.length();
    if (w > 0.01) { _q.setFromAxisAngle(_v.copy(o.w).divideScalar(w), w * dt); o.q.premultiply(_q); }
    if (o.p.y < -30) { o.p.set(0, -50, 0); o.air = false; o.gone = true; }
    return 0;
}

function launch(o, vx, vy, vz, spin) {
    o.air = true;
    o.v.set(vx, vy, vz);
    o.w.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
}

function body(x, y, z, yaw = 0) {
    return { p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(), w: new THREE.Vector3(), q: new THREE.Quaternion().setFromAxisAngle(UP, yaw), air: false };
}

const MAX_TREES = 480, MAX_LAMPS = 240, MAX_CARS = 140;
const CAR_COLORS = [0xf2f2f2, 0x1f2329, 0x8a9099, 0xc8102e, 0x2a5caa, 0xe8e2d0, 0x3b6e4f, 0xf2b705, 0xb0b5bb];
const SHIRTS = [0xffffff, 0xdfe8f5, 0x9cb8d8, 0xf1d6d6, 0xd9e4c8, 0x2b2f3a, 0xf3e3b8];

export const PEOPLE_LINES = {
    cheer: ['사이다!', '칼퇴다!!', '가즈아!', '더 세게!', '속이 다 시원하네', '오늘 회식 취소!', '드디어 퇴사각!', '월요일 없어졌다!'],
    flee: ['으악!', '살려줘!', '사원증 두고 왔는데!', '노트북 안 챙겼어!', '엄마아!'],
    hit: ['괜찮아요!', '산재 처리돼요?', '어지러워...', '연차 쓸게요!'],
    bossCar: ['저거 사장님 차예요!', '사장님 차 저기 있어요!'],
};

export class Street {
    constructor(scene, world, fx, sfx) {
        this.scene = scene;
        this.world = world;
        this.fx = fx;
        this.sfx = sfx;
        this.group = new THREE.Group();
        scene.add(this.group);
        const G = this.group;

        // 자동차 (앞 = +x)
        const wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 10);
        this.carBody = inst(G, merge([[new THREE.BoxGeometry(2.8, 0.55, 1.15), 0, 0.55, 0]]), 0xffffff, MAX_CARS + 2);
        this.carTop = inst(G, merge([[new THREE.BoxGeometry(1.45, 0.48, 1.02), -0.2, 1.06, 0]]), 0x26323f, MAX_CARS + 2);
        this.carWheels = inst(G, merge([
            [wheel, 0.9, 0.3, 0.52, Math.PI / 2], [wheel, -0.9, 0.3, 0.52, Math.PI / 2],
            [wheel, 0.9, 0.3, -0.52, Math.PI / 2], [wheel, -0.9, 0.3, -0.52, Math.PI / 2]]), 0x18191b, MAX_CARS + 2, false);
        // 나무·가로등
        this.trunks = inst(G, merge([[new THREE.CylinderGeometry(0.14, 0.2, 1.6, 6), 0, 0.8, 0]]), 0x7a5533, MAX_TREES);
        this.leaves = inst(G, merge([[new THREE.IcosahedronGeometry(1.15, 0), 0, 2.3, 0], [new THREE.IcosahedronGeometry(0.8, 0), 0.3, 3.0, 0.2]]), 0xffffff, MAX_TREES);
        this.lamps = inst(G, merge([
            [new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6), 0, 1.8, 0],
            [new THREE.BoxGeometry(0.9, 0.08, 0.08), 0.42, 3.55, 0],
            [new THREE.BoxGeometry(0.4, 0.14, 0.24), 0.85, 3.5, 0]]), 0x50565e, MAX_LAMPS);
        // 사람: 다리·몸·머리 (높이 ≈ 1.6칸 — 실제보다 크게)
        this.legs = inst(G, merge([[new THREE.BoxGeometry(0.17, 0.62, 0.2), -0.11, 0.31, 0], [new THREE.BoxGeometry(0.17, 0.62, 0.2), 0.11, 0.31, 0]]), 0x2b2f3a, 60);
        this.torsos = inst(G, merge([[new THREE.BoxGeometry(0.5, 0.62, 0.3), 0, 0.93, 0], [new THREE.BoxGeometry(0.14, 0.55, 0.16), -0.33, 0.95, 0], [new THREE.BoxGeometry(0.14, 0.55, 0.16), 0.33, 0.95, 0]]), 0xffffff, 60);
        this.heads = inst(G, merge([[new THREE.SphereGeometry(0.22, 10, 8), 0, 1.44, 0], [new THREE.BoxGeometry(0.46, 0.1, 0.46), 0, 1.6, 0]]), 0xf2c39b, 60);
        // 사무용품
        this.itemMeshes = [
            inst(G, merge([[new THREE.BoxGeometry(0.75, 0.5, 0.08), 0, 0.42, 0], [new THREE.BoxGeometry(0.1, 0.2, 0.1), 0, 0.1, 0], [new THREE.BoxGeometry(0.4, 0.04, 0.3), 0, 0.02, 0]]), 0x23272e, 40),
            inst(G, merge([[new THREE.BoxGeometry(0.55, 0.1, 0.55), 0, 0.45, 0], [new THREE.BoxGeometry(0.55, 0.6, 0.1), 0, 0.8, -0.24], [new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), 0, 0.22, 0]]), 0x3d4b6b, 40),
            inst(G, merge([[new THREE.CylinderGeometry(0.22, 0.18, 0.4, 8), 0, 0.2, 0], [new THREE.IcosahedronGeometry(0.35, 0), 0, 0.65, 0]]), 0x5f9a4c, 40),
            inst(G, merge([[new THREE.BoxGeometry(0.4, 0.9, 0.4), 0, 0.45, 0], [new THREE.CylinderGeometry(0.17, 0.17, 0.45, 10), 0, 1.12, 0]]), 0xe9edf2, 40),
            inst(G, merge([[new THREE.BoxGeometry(1.4, 0.08, 0.75), 0, 0.72, 0], [new THREE.BoxGeometry(0.08, 0.7, 0.7), -0.62, 0.35, 0], [new THREE.BoxGeometry(0.08, 0.7, 0.7), 0.62, 0.35, 0]]), 0xb88a5a, 40),
        ];
        this.itemMeshes.forEach(m => { m.count = 40; for (let i = 0; i < 40; i++) { _m.makeScale(0, 0, 0); m.setMatrixAt(i, _m); } });
        this.items = [];
        this.itemNext = 0;

        // 상사 차 이름표
        const tag = new THREE.Sprite(new THREE.SpriteMaterial());
        tag.scale.set(3.4, 0.95, 1);
        tag.renderOrder = 5;
        tag.visible = false;
        G.add(tag);
        this.bossTag = tag;
        this.setBossTag('사장님 차');
        this.bossCar = null;
        this.clear();
    }

    setBossTag(text) {
        const m = this.bossTag.material;
        if (m.map) m.map.dispose();
        m.map = labelTexture(256, 72, (g, w, h) => {
            g.fillStyle = '#14181f'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill();
            g.fillStyle = '#ffd23f'; g.textAlign = 'center'; g.textBaseline = 'middle';
            let s = 34;
            do { g.font = `900 ${s}px "Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif`; s -= 2; } while (g.measureText(text).width > w - 24 && s > 14);
            g.fillText(text, w / 2, h / 2 + 2);
        });
        m.needsUpdate = true;
    }

    clear() {
        this.cars = []; this.trees = []; this.lampList = []; this.people = []; this.occ = new Set();
        for (const it of this.items) it.life = 0;
        [this.carBody, this.carTop, this.carWheels, this.trunks, this.leaves, this.lamps, this.legs, this.torsos, this.heads].forEach(m => { m.count = 0; });
    }

    /** 도로·대상 건물 주변에 소품을 놓는다 */
    populate(target, rnd = Math.random) {
        this.clear();
        this._dress(this.world.roads, target.cx, target.cz, 125, rnd, 70);
        // 상사 차: 대상 건물 앞 가장 가까운 도로가
        this.bossCar = null;
        const spot = this._spotNear(target, 6);
        if (spot) {
            const c = this._car(null, 0, 1, 0x0c0d10, rnd);
            c.p.set(spot.x, 0, spot.z);
            c.q.setFromAxisAngle(UP, spot.yaw);
            c.parked = true;
            c.boss = true;
            c.scale = 1.25;
            this.bossCar = c;
        }
        // 직원들: 대상 건물 둘레
        for (let k = 0; k < 26; k++) {
            const sp = this._spotNear(target, 3 + rnd() * 9);
            if (!sp) continue;
            this._person(sp.x, sp.z, rnd);
        }
        this._flush();
    }

    /** 새로 이어 붙인 칸의 도로에도 가로수·가로등·자동차를 채운다 */
    extend(roads, cx, cz, rnd = Math.random) {
        this._dress(roads, cx, cz, 175, rnd, 22);
    }

    /** 멀어진 소품을 치운다 (상사 차와 직원은 남긴다) */
    trim(cx, cz, r) {
        const far = o => Math.hypot(o.p.x - cx, o.p.z - cz) > r;
        this.trees = this.trees.filter(t => !far(t));
        this.lampList = this.lampList.filter(l => !far(l));
        this.cars = this.cars.filter(c => c.boss || !far(c));
        this.occ = new Set();
        for (const o of [...this.trees, ...this.lampList]) this.occ.add(Math.round(o.p.x / 2) + ',' + Math.round(o.p.z / 2));
    }

    /** 도로를 따라 나무·가로등, 도로 위에 자동차. 이웃 칸과 겹치는 도로는 같은 자리에 두 번 심지 않는다 */
    _dress(allRoads, cx, cz, radius, rnd, carCount) {
        const W = this.world;
        const near = (x, z, r) => Math.hypot(x - cx, z - cz) < r;
        const free = (x, z) => !W.intactAt(x, z);
        const roads = allRoads.filter(r => r.t !== 'foot');
        for (const r of roads) {
            const pts = r.pts;
            let acc = rnd() * 6;
            for (let i = 0; i + 3 < pts.length; i += 2) {
                const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
                const L = Math.hypot(bx - ax, bz - az);
                if (L < 0.5) continue;
                const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
                for (let s = acc; s < L; s += r.t === 'minor' ? 9 : 7) {
                    const x = ax + ux * s, z = az + uz * s;
                    if (!near(x, z, radius)) continue;
                    for (const side of [1, -1]) {
                        const off = r.w / 2 + 1.3;
                        const px = x + nx * off * side, pz = z + nz * off * side;
                        const key = Math.round(px / 2) + ',' + Math.round(pz / 2);
                        if (this.occ.has(key) || !free(px, pz)) continue;
                        if (this.trees.length < MAX_TREES && rnd() < 0.7) { this._tree(px, pz, rnd); this.occ.add(key); }
                        else if (this.lampList.length < MAX_LAMPS && r.t !== 'minor') { this._lamp(px, pz, Math.atan2(-nz * side, nx * side) + Math.PI, rnd); this.occ.add(key); }
                    }
                }
                acc = 0;
            }
        }
        const drivable = roads.filter(r => r.pts.length >= 4);
        for (let k = 0; k < carCount * 2 && drivable.length && this.cars.length < MAX_CARS; k++) {
            const r = drivable[Math.floor(rnd() * drivable.length)];
            const len = polyLength(r.pts);
            if (len < 12) continue;
            const s = rnd() * len;
            const at = pointAt(r.pts, s);
            if (!near(at.x, at.z, radius)) continue;
            this._car(r, s, rnd() < 0.5 ? 1 : -1, CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)], rnd);
            if (--carCount <= 0) break;
        }
    }

    _spotNear(b, gap) {
        const p = b.poly, n = p.length / 2;
        for (let tries = 0; tries < 30; tries++) {
            const i = Math.floor(Math.random() * n), j = (i + 1) % n;
            const t = Math.random();
            const ex = p[i * 2] + (p[j * 2] - p[i * 2]) * t, ez = p[i * 2 + 1] + (p[j * 2 + 1] - p[i * 2 + 1]) * t;
            let dx = ex - b.cx, dz = ez - b.cz;
            const L = Math.hypot(dx, dz) || 1;
            dx /= L; dz /= L;
            const x = ex + dx * gap, z = ez + dz * gap;
            if (!this.world.intactAt(x, z)) return { x, z, yaw: Math.atan2(-(p[j * 2 + 1] - p[i * 2 + 1]), p[j * 2] - p[i * 2]) };
        }
        return null;
    }

    _tree(x, z, rnd) {
        const t = body(x, 0, z, rnd() * 6);
        t.state = 0; t.s = 0.8 + rnd() * 0.5; t.burn = 0; t.burnt = false;
        t.leaf = [0x5f9a4c, 0x6aa84f, 0x4f8a43, 0x7bb35a][Math.floor(rnd() * 4)];
        this.trees.push(t);
    }

    _lamp(x, z, yaw) {
        const l = body(x, 0, z, yaw);
        l.state = 0;
        this.lampList.push(l);
    }

    _car(road, s, dir, color, rnd) {
        const c = body(0, 0, 0);
        Object.assign(c, { road, s, dir, speed: 4 + rnd() * 5, color, hits: 0, state: 'drive', fire: 0, scale: 1, lane: road ? road.w * 0.22 : 0 });
        if (road) this._placeOnRoad(c);
        this.cars.push(c);
        return c;
    }

    _placeOnRoad(c) {
        const at = pointAt(c.road.pts, c.s);
        const yaw = Math.atan2(-at.uz * c.dir, at.ux * c.dir);
        const nx = -at.uz * c.dir, nz = at.ux * c.dir;
        c.p.set(at.x + nx * c.lane, 0, at.z + nz * c.lane);
        c.q.setFromAxisAngle(UP, yaw);
    }

    _person(x, z, rnd) {
        const p = body(x, 0, z, rnd() * 6);
        Object.assign(p, { state: 'wander', t: rnd() * 3, gx: x, gz: z, shirt: SHIRTS[Math.floor(rnd() * SHIRTS.length)], phase: rnd() * 6, home: { x, z }, talk: 0 });
        this.people.push(p);
    }

    // ── 맞았을 때 ──

    /** 반환: {cars, exploded, trees, bossCar, people} */
    impact(p, r, force, dir) {
        const out = { cars: 0, exploded: 0, trees: 0, bossCar: false, people: 0, value: 0 };
        for (const c of this.cars) {
            if (c.gone) continue;
            const d = _v.set(c.p.x - p.x, c.p.y + 0.6 - p.y, c.p.z - p.z).length();
            if (d > r + 1.6) continue;
            const k = Math.max(0.2, 1 - d / (r + 1.6));
            c.hits++;
            const L = Math.hypot(_v.x, _v.z) || 1;
            launch(c, _v.x / L * force * k * 0.8 + dir.x * 3, 6 + force * k * 0.6, _v.z / L * force * k * 0.8 + dir.z * 3, 6);
            if (c.state === 'drive') { out.cars++; out.value += c.boss ? 0 : 0.6; }
            c.state = 'wreck';
            if (c.hits >= 2 && !c.exploded) {
                c.exploded = true;
                out.exploded++;
                out.value += c.boss ? 0 : 1.5;
                c.fire = 6;
                this.fx.blast(c.p.x, c.p.y + 0.8, c.p.z, 3.2);
                this.sfx.boom(false);
                c.v.y += 9;
            } else this.sfx.crash(4);
            if (c.boss && !c.bossHit) { c.bossHit = true; out.bossCar = true; }
        }
        for (const t of this.trees) {
            if (t.state === 3) continue;
            const d = Math.hypot(t.p.x - p.x, t.p.z - p.z);
            if (d > r + 0.9 || p.y > 4 + r) continue;
            out.trees++;
            if (force > 18 && d < r * 0.6) { t.state = 3; this.fx.dust(t.p.x, 1.5, t.p.z, 3, 1, 1); continue; }
            this._topple(t, p, force);
        }
        for (const l of this.lampList) {
            if (l.state === 3) continue;
            if (Math.hypot(l.p.x - p.x, l.p.z - p.z) > r + 0.6 || p.y > 4 + r) continue;
            this._topple(l, p, force);
        }
        for (const q of this.people) {
            const d = Math.hypot(q.p.x - p.x, q.p.z - p.z);
            if (d < r + 0.8 && Math.abs(q.p.y + 0.8 - p.y) < r + 1) {
                launch(q, (q.p.x - p.x) / (d || 1) * force * 0.5, 6 + force * 0.4, (q.p.z - p.z) / (d || 1) * force * 0.5, 10);
                q.state = 'fly';
                out.people++;
            } else if (d < r + 18 && q.state !== 'fly' && q.state !== 'down') {
                q.state = 'flee'; q.t = 2.5 + Math.random() * 2;
                q.fx = q.p.x - p.x; q.fz = q.p.z - p.z;
                if (Math.random() < 0.08) this.say(q, 'flee');
            }
        }
        for (const it of this.items) {
            if (it.life <= 0) continue;
            const d = it.p.distanceTo(p);
            if (d < r + 0.6) launch(it, (it.p.x - p.x) / (d || 1) * force * 0.6, 4 + force * 0.4, (it.p.z - p.z) / (d || 1) * force * 0.6, 12);
        }
        return out;
    }

    _topple(t, p, force) {
        if (t.state !== 0) return;
        t.state = 1;
        t.fall = 0;
        let ax = t.p.x - p.x, az = t.p.z - p.z;
        const L = Math.hypot(ax, az) || 1;
        // 쓰러지는 축: 밀리는 방향과 수직인 수평축
        t.axis = new THREE.Vector3(az / L, 0, -ax / L);
        t.base = t.q.clone();
        t.speed = 2 + force * 0.12;
    }

    ignite(p, r) {
        let n = 0;
        for (const t of this.trees) {
            if (t.state === 3 || t.burn > 0 || t.burnt) continue;
            if (Math.hypot(t.p.x - p.x, t.p.z - p.z) < r + 1 && p.y < 5 + r) { this._lightTree(t); n++; }
        }
        for (const c of this.cars) {
            if (Math.hypot(c.p.x - p.x, c.p.z - p.z) < r + 1.2 && Math.abs(c.p.y - p.y) < r + 1.5) {
                if (c.fire <= 0) { c.fire = 5; c.hits++; }
                if (c.state === 'drive') c.state = 'wreck';
            }
        }
        for (const q of this.people) {
            if (q.state === 'wander' || q.state === 'cheer') {
                if (Math.hypot(q.p.x - p.x, q.p.z - p.z) < r + 8) { q.state = 'flee'; q.t = 3; q.fx = q.p.x - p.x; q.fz = q.p.z - p.z; }
            }
        }
        return n;
    }

    /** 나무에 불: 몇 초 활활 타면서 까맣게 그을리고 옆 나무로 번짐 */
    _lightTree(t) {
        t.burn = t.burnMax = 4 + Math.random() * 2.5;
        this.fx.burn(t.p.x, 2.1 * t.s, t.p.z, t.burn, 1.15 * t.s);
    }

    pull(p, r, strength, dt) {
        const grab = (o) => {
            const dx = p.x - o.p.x, dy = p.y - o.p.y, dz = p.z - o.p.z;
            const d = Math.hypot(dx, dy, dz) || 0.01;
            if (d > r) return false;
            if (!o.air) launch(o, 0, 3, 0, 5);
            const k = strength * (1.2 - d / r) * dt;
            o.v.x += dx / d * k - dz / d * k * 0.8;
            o.v.y += dy / d * k + 24 * dt * 0.9;
            o.v.z += dz / d * k + dx / d * k * 0.8;
            if (d < 1.2) o.v.multiplyScalar(0.7);
            return true;
        };
        for (const c of this.cars) if (!c.gone && grab(c)) { if (c.state === 'drive') c.state = 'wreck'; }
        for (const q of this.people) if (grab(q)) q.state = 'fly';
        for (const it of this.items) if (it.life > 0) grab(it);
    }

    /** 건물에서 사무용품이 튀어나온다 */
    spawnItem(x, y, z, vx, vy, vz) {
        const it = this.items[this.itemNext] || (this.items[this.itemNext] = body(0, 0, 0));
        it.type = Math.floor(Math.random() * this.itemMeshes.length);
        it.slot = this.itemNext;
        this.itemNext = (this.itemNext + 1) % 40;
        it.p.set(x, y, z);
        it.q.setFromEuler(_e.set(Math.random() * 6, Math.random() * 6, 0));
        it.life = 30;
        it.gone = false;
        launch(it, vx, vy, vz, 9);
        // 같은 슬롯을 쓰던 다른 종류는 지운다
        for (let k = 0; k < this.itemMeshes.length; k++) {
            if (k !== it.type) { _m.makeScale(0, 0, 0); this.itemMeshes[k].setMatrixAt(it.slot, _m); this.itemMeshes[k].instanceMatrix.needsUpdate = true; }
        }
    }

    cheer(x, z, r) {
        for (const q of this.people) {
            if ((q.state === 'wander' || q.state === 'flee') && Math.hypot(q.p.x - x, q.p.z - z) < r) {
                q.state = 'cheer'; q.t = 2 + Math.random() * 2;
                if (Math.random() < 0.25) this.say(q, 'cheer');
            }
        }
    }

    say(q, kind) {
        if (q.talk > 0 || !this.onSay) return;
        q.talk = 3;
        const lines = PEOPLE_LINES[kind];
        this.onSay(q.p.x, q.p.y + 2.2, q.p.z, lines[Math.floor(Math.random() * lines.length)]);
    }

    // ── 매 프레임 ──

    update(dt, time, camPos) {
        const W = this.world;
        for (const c of this.cars) {
            if (c.gone) continue;
            if (c.state === 'drive' && !c.parked) {
                c.s += c.speed * c.dir * dt;
                const len = polyLength(c.road.pts);
                if (c.s > len - 1 || c.s < 1) { c.dir *= -1; c.s = Math.max(1, Math.min(len - 1, c.s)); }
                this._placeOnRoad(c);
                // 길 위에 건물 잔해가 쌓였으면 그 위로 올라탄다
                c.p.y = W.ground.height(c.p.x, c.p.z) * 0.5;
            } else if (c.air) {
                const land = stepBody(c, dt, W, 0.25);
                if (land > 6) { this.sfx.thump(land); this.fx.dust(c.p.x, c.p.y + 0.3, c.p.z, 3, 1, 0.8); }
            }
            if (c.fire > 0) {
                c.fire -= dt;
                if (Math.random() < dt * 14) this.fx.fire(c.p.x, c.p.y + 1, c.p.z, 1, 0.8, 0.5);
            } else if (c.state === 'wreck' && Math.random() < dt * 3) this.fx.dust(c.p.x, c.p.y + 1.2, c.p.z, 1, 0.3, 0.3);
        }
        for (const t of [...this.trees, ...this.lampList]) {
            if (t.state === 1) {
                t.fall = Math.min(Math.PI / 2, t.fall + dt * t.speed);
                t.speed += dt * 6;
                _q.setFromAxisAngle(t.axis, t.fall);
                t.q.copy(t.base).premultiply(_q);
                if (t.fall >= Math.PI / 2) { t.state = 2; this.sfx.thump(5); this.fx.dust(t.p.x, 0.5, t.p.z, 2, 1.5, 0.6); }
            }
            if (t.burn > 0) {
                t.burn -= dt;
                // 옆 나무로 옮겨붙음
                if (Math.random() < dt * 0.7) {
                    for (const o of this.trees) {
                        if (o === t || o.burn > 0 || o.burnt || o.state === 3) continue;
                        if (Math.abs(o.p.x - t.p.x) < 5 && Math.abs(o.p.z - t.p.z) < 5) { this._lightTree(o); break; }
                    }
                }
                if (t.burn <= 0) { t.burnt = true; this._topple(t, { x: t.p.x + Math.random() - 0.5, z: t.p.z + Math.random() - 0.5 }, 4); }
            }
        }
        for (const q of this.people) this._updatePerson(q, dt, time, camPos);
        for (const it of this.items) {
            if (it.life <= 0) continue;
            it.life -= dt;
            if (it.air) stepBody(it, dt, W, 0.35);
        }
        if (this.bossCar && !this.bossCar.gone) {
            this.bossTag.visible = !this.bossCar.bossHit;
            this.bossTag.position.set(this.bossCar.p.x, this.bossCar.p.y + 3.2 + Math.sin(time * 3) * 0.15, this.bossCar.p.z);
        } else this.bossTag.visible = false;
        this._flush();
    }

    _updatePerson(q, dt, time, camPos) {
        const W = this.world;
        q.talk -= dt;
        q.t -= dt;
        if (q.state === 'fly') {
            const land = stepBody(q, dt, W, 0.3);
            if (land > 0 && !q.air) {
                q.state = 'down'; q.t = 2 + Math.random();
                _e.set(-Math.PI / 2, Math.random() * 6, 0, 'YXZ');
                q.q.setFromEuler(_e);
                if (Math.random() < 0.3) this.say(q, 'hit');
            }
            return;
        }
        if (q.state === 'down') {
            if (W.surface(q.p.x, q.p.y, q.p.z, null) < q.p.y - 0.3) { launch(q, 0, 0, 0, 1); q.state = 'fly'; return; }
            if (q.t <= 0) { q.state = 'wander'; q.t = 1; }
            return;
        }
        let speed = 0, yaw = null;
        if (q.state === 'wander') {
            if (q.t <= 0 || Math.hypot(q.gx - q.p.x, q.gz - q.p.z) < 0.5) {
                q.gx = q.home.x + (Math.random() - 0.5) * 10; q.gz = q.home.z + (Math.random() - 0.5) * 10;
                q.t = 3 + Math.random() * 4;
            }
            speed = 1.3;
            yaw = Math.atan2(q.gx - q.p.x, q.gz - q.p.z);
        } else if (q.state === 'flee') {
            speed = 5.5;
            yaw = Math.atan2(q.fx, q.fz);
            if (q.t <= 0) { q.state = 'wander'; q.home = { x: q.p.x, z: q.p.z }; }
        } else if (q.state === 'cheer') {
            yaw = Math.atan2(camPos.x - q.p.x, camPos.z - q.p.z);
            if (q.t <= 0) q.state = 'wander';
        }
        if (yaw !== null) {
            _q2.setFromAxisAngle(UP, yaw);
            q.q.slerp(_q2, Math.min(1, dt * 8));
        }
        if (speed) {
            const nx = q.p.x + Math.sin(yaw) * speed * dt, nz = q.p.z + Math.cos(yaw) * speed * dt;
            if (!W.blocked(nx, q.p.y + 0.5, nz, null)) { q.p.x = nx; q.p.z = nz; }
            else { q.gx = q.p.x - Math.sin(yaw) * 4; q.gz = q.p.z - Math.cos(yaw) * 4; q.fx = -q.fx; q.fz = -q.fz; }
        }
        const s = W.surface(q.p.x, q.p.y + 0.8, q.p.z, null);
        q.p.y += (s - q.p.y) * Math.min(1, dt * 10);
        q.bob = q.state === 'cheer' ? Math.abs(Math.sin(time * 9 + q.phase)) * 0.6 : speed ? Math.abs(Math.sin(time * speed * 4 + q.phase)) * 0.08 : 0;
    }

    _flush() {
        let n = 0;
        for (const c of this.cars) {
            if (c.gone) continue;
            _m.compose(c.p, c.q, _s.setScalar(c.scale));
            this.carBody.setMatrixAt(n, _m); this.carTop.setMatrixAt(n, _m); this.carWheels.setMatrixAt(n, _m);
            _c.setHex(c.color);
            if (c.exploded) _c.multiplyScalar(0.25); else if (c.state === 'wreck') _c.multiplyScalar(0.7);
            this.carBody.setColorAt(n, _c);
            n++;
        }
        this.carBody.count = this.carTop.count = this.carWheels.count = n;
        n = 0;
        for (const t of this.trees) {
            if (t.state === 3) continue;
            _m.compose(t.p, t.q, _s.setScalar(t.s));
            this.trunks.setMatrixAt(n, _m); this.leaves.setMatrixAt(n, _m);
            _c.setHex(t.burnt ? 0x1d1a17 : t.leaf);
            if (t.burn > 0) {
                // 처음엔 벌겋게 달았다가 점점 숯처럼 까매짐
                const k = 1 - t.burn / (t.burnMax || 4);
                _c.lerp(EMBER, Math.min(1, k * 2.5) * 0.65).lerp(CHAR, Math.max(0, (k - 0.35) / 0.65));
            }
            this.leaves.setColorAt(n, _c);
            n++;
        }
        this.trunks.count = this.leaves.count = n;
        n = 0;
        for (const l of this.lampList) {
            if (l.state === 3) continue;
            _m.compose(l.p, l.q, _s.setScalar(1));
            this.lamps.setMatrixAt(n++, _m);
        }
        this.lamps.count = n;
        n = 0;
        for (const q of this.people) {
            _v.copy(q.p); _v.y += q.bob || 0;
            _m.compose(_v, q.q, _s.setScalar(1));
            this.legs.setMatrixAt(n, _m); this.torsos.setMatrixAt(n, _m); this.heads.setMatrixAt(n, _m);
            this.torsos.setColorAt(n, _c.setHex(q.shirt));
            n++;
        }
        this.legs.count = this.torsos.count = this.heads.count = n;
        for (const it of this.items) {
            if (it.slot === undefined) continue;
            const s = it.life <= 0 ? 0 : Math.min(1, it.life / 1.5);
            _m.compose(it.p, it.q, _s.setScalar(s));
            this.itemMeshes[it.type].setMatrixAt(it.slot, _m);
        }
        for (const m of [this.carBody, this.carTop, this.carWheels, this.trunks, this.leaves, this.lamps, this.legs, this.torsos, this.heads, ...this.itemMeshes]) {
            m.instanceMatrix.needsUpdate = true;
            if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
    }

    meshes() {
        return [this.carBody, this.carTop, this.trunks, this.leaves];
    }
}

function polyLength(pts) {
    if (pts._len) return pts._len;
    let L = 0;
    for (let i = 0; i + 3 < pts.length; i += 2) L += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
    pts._len = L;
    return L;
}

function pointAt(pts, s) {
    for (let i = 0; i + 3 < pts.length; i += 2) {
        const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
        const L = Math.hypot(bx - ax, bz - az);
        if (s <= L || i + 4 >= pts.length - 1) {
            const t = L > 0 ? Math.min(1, Math.max(0, s / L)) : 0;
            return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, ux: L ? (bx - ax) / L : 1, uz: L ? (bz - az) / L : 0 };
        }
        s -= L;
    }
    return { x: pts[0], z: pts[1], ux: 1, uz: 0 };
}
