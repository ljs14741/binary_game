import * as THREE from 'three';
import { labelTexture, FONT } from './props.js';
import { UNIT_M } from './world.js';

// "여기 거기 맞네" 를 만드는 표시물: 건물 이름 간판, 1층 가게 간판, 역 이름 표지판, 번호 붙은 지하철 출구.
// 간판은 매단 벽이 무너지면 떨어지고, 출구 구조물은 맞으면 날아간다.

const GRAV = -24;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

const SHOP_COLORS = {
    cafe: ['#5d3a1a', '#fff'], restaurant: ['#b23a2e', '#fff'], fast_food: ['#e8742c', '#fff'], bakery: ['#9c5a2e', '#fff'],
    bank: ['#1f3a93', '#fff'], shop: ['#138d75', '#fff'], grocery: ['#1e8449', '#fff'], pharmacy: ['#27ae60', '#fff'],
    hospital: ['#ffffff', '#1565c0'], doctors: ['#ffffff', '#1565c0'], dentist: ['#ffffff', '#00796b'], post: ['#c62828', '#fff'],
    lodging: ['#5e35b1', '#fff'], cinema: ['#1b1b1b', '#ffd54f'], office: ['#37474f', '#fff'], bar: ['#4a148c', '#fff'],
    beer: ['#f9a825', '#222'], ice_cream: ['#ec407a', '#fff'], clothing_store: ['#6d4c41', '#fff'], library: ['#2e7d32', '#fff'],
    police: ['#0d47a1', '#fff'], town_hall: ['#455a64', '#fff'],
};

function fit(g, text, maxW, size, weight = 900) {
    let s = size;
    do { g.font = `${weight} ${s}px ${FONT}`; s -= 2; } while (g.measureText(text).width > maxW && s > 10);
}

function plateTexture(text, bg, fg, w = 512, h = 128, border = null) {
    return labelTexture(w, h, (g) => {
        if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
        if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); }
        g.fillStyle = fg;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        fit(g, text, w - 36, h * 0.66);
        g.fillText(text, w / 2, h / 2 + 3);
    });
}

function avg(list, k, def) {
    if (!list.length) return def;
    let s = 0;
    for (const o of list) s += o[k];
    return s / list.length;
}

function poiKey(p) {
    return p.name + ':' + Math.round(p.x / 3) + ',' + Math.round(p.z / 3);
}

function signedArea(p) {
    let a = 0;
    const n = p.length / 2;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
    return a / 2;
}

/** 다각형의 변 목록: 시작점, 방향, 길이, 바깥 법선 */
function edges(poly) {
    const out = [];
    const n = poly.length / 2, sign = signedArea(poly) < 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = poly[i * 2], az = poly[i * 2 + 1], bx = poly[j * 2], bz = poly[j * 2 + 1];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 1.5) continue;
        out.push({ ax, az, bx, bz, L, ux: (bx - ax) / L, uz: (bz - az) / L, nx: sign * -(bz - az) / L, nz: sign * (bx - ax) / L });
    }
    return out;
}

/** 벽에 붙은 판. 매단 점 두 곳이 모두 비면 떨어진다 */
class Plate {
    constructor(parent, tex, w, h, x, y, z, nx, nz, anchors, opts = {}) {
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: !!opts.transparent, side: THREE.DoubleSide }));
        this.mesh.position.set(x, y, z);
        this.mesh.quaternion.setFromAxisAngle(UP, Math.atan2(nx, nz));
        this.mesh.castShadow = !opts.transparent;
        parent.add(this.mesh);
        this.n = { x: nx, z: nz };
        this.anchors = anchors;
        this.h = h;
        this.state = 'wall';
        this.vel = new THREE.Vector3();
        this.ang = new THREE.Vector3();
        this.check = Math.random() * 0.3;
    }

    drop(dir) {
        if (this.state !== 'wall') return;
        this.state = 'fall';
        this.vel.set(this.n.x * 3 + (dir ? dir.x * 4 : 0), 2, this.n.z * 3 + (dir ? dir.z * 4 : 0));
        this.ang.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4);
    }

    update(dt, world) {
        if (this.state === 'wall') {
            this.check -= dt;
            if (this.check > 0) return;
            this.check = 0.25;
            let held = 0;
            for (const a of this.anchors) if (world.blocked(a.x, a.y, a.z, null)) held++;
            if (!held) this.drop(null);
            return;
        }
        if (this.state !== 'fall') return;
        const p = this.mesh.position;
        this.vel.y += GRAV * dt;
        p.addScaledVector(this.vel, dt);
        const w = this.ang.length();
        if (w > 0.01) { _q.setFromAxisAngle(_v.copy(this.ang).divideScalar(w), w * dt); this.mesh.quaternion.premultiply(_q); }
        const s = world.surface(p.x, p.y + 0.3, p.z, null);
        if (p.y - 0.1 <= s && this.vel.y < 0) {
            p.y = s + 0.08;
            this.state = 'down';
            this.mesh.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, Math.random() * 6, 0, 'YXZ'));
        }
    }
}

export class Landmarks {
    constructor(scene, fx, sfx) {
        this.scene = scene;
        this.fx = fx;
        this.sfx = sfx;
        this.group = new THREE.Group();
        scene.add(this.group);
        this.plates = [];
        this.exits = [];
        this.stations = [];
        const glass = new THREE.MeshLambertMaterial({ color: 0x9fc8e6, transparent: true, opacity: 0.55 });
        const frame = new THREE.MeshLambertMaterial({ color: 0x5f6b77 });
        this.exitParts = { glass, frame };
    }

    clear() {
        this.group.traverse(o => this._dispose(o));
        this.scene.remove(this.group);
        this.group = new THREE.Group();
        this.scene.add(this.group);
        this.plates = [];
        this.exits = [];
        this.stations = [];
    }

    /** 새 동네 시작. 이후 칸마다 extend 로 표시물을 더한다 */
    begin(target, camDir, { maxNames = 28, maxShops = 48 } = {}) {
        this.clear();
        this.target = target;
        this.camDir = camDir;
        this.caps = { maxNames, maxShops };
        this.seenShops = new Set();
        this.seenStations = new Set();
        this.seenExits = new Set();
        this.perEdge = new Map();
        this.first = true;
    }

    /**
     * 칸 하나의 표시물. 처음 칸은 넉넉히, 이웃 칸은 적게(멀리서 보이므로).
     * @param pois      월드 좌표(칸)로 바뀐 표시물
     * @param buildings 이번에 새로 생긴 건물
     * @returns 새로 세운 역 목록 (출구 번호를 받아 오는 데 쓴다)
     */
    extend(pois, world, buildings, key) {
        this.curKey = key;
        const t = this.target;
        const first = this.first;
        this.first = false;
        const cx = first ? t.cx : avg(buildings, 'cx', t.cx), cz = first ? t.cz : avg(buildings, 'cz', t.cz);
        const nameCap = first ? this.caps.maxNames : Math.ceil(this.caps.maxNames / 3);
        const shopCap = first ? this.caps.maxShops : Math.ceil(this.caps.maxShops / 3);
        // 건물 이름 간판: 회사 건물을 뺀 이름 있는 중·고층, 가까운 순
        const named = buildings
            .filter(b => b !== t && b.name && b.top >= 9)
            .sort((a, b) => Math.hypot(a.cx - cx, a.cz - cz) - Math.hypot(b.cx - cx, b.cz - cz))
            .slice(0, nameCap);
        for (const b of named) this._nameSign(b, this.camDir);
        // 1층 가게 간판 (이웃 칸과 겹치는 표시물은 한 번만)
        const shops = pois.filter(p => p.t === 'shop' && !this.seenShops.has(poiKey(p)))
            .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))
            .slice(0, shopCap);
        for (const s of shops) {
            this.seenShops.add(poiKey(s));
            const pl = this._shopSign(s, world, this.perEdge);
            if (pl) pl.seen = poiKey(s);
            else this.seenShops.delete(poiKey(s));
        }
        // 역 이름과 출구 (번호는 나중에 applyExits 로)
        const fresh = [];
        for (const s of pois.filter(p => p.t === 'station')) {
            const k = s.name + ':' + Math.round(s.x / 40) + ',' + Math.round(s.z / 40);
            if (this.seenStations.has(k)) continue;
            this.seenStations.add(k);
            const st = this._station(s);
            st.seen = k;
            fresh.push(st);
        }
        for (const e of pois.filter(p => p.t === 'exit')) {
            const k = Math.round(e.x / 3) + ',' + Math.round(e.z / 3);
            if (this.seenExits.has(k)) continue;
            this.seenExits.add(k);
            this._exit(e.x, e.z, null, this._nearestStation(e.x, e.z)).seen = k;
        }
        return fresh;
    }

    /** 메시·스프라이트 하나 정리. 상자 면마다 재질이 다른 경우(배열)도 있다 */
    _dispose(o) {
        if (!o.isMesh && !o.isSprite) return;
        if (o.geometry && !o.isSprite) o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (!m || m === this.exitParts.glass || m === this.exitParts.frame) continue;
            if (m.map) m.map.dispose();
            m.dispose();
        }
    }

    /** 멀어진 칸의 표시물을 치운다 */
    removeCell(key) {
        const drop = o => {
            this.group.remove(o);
            o.traverse(m => this._dispose(m));
        };
        // 다시 돌아오면 다시 세울 수 있게 '세웠음' 기록도 지운다
        this.plates = this.plates.filter(p => { if (p.key !== key) return true; drop(p.mesh); if (p.seen) this.seenShops.delete(p.seen); return false; });
        this.exits = this.exits.filter(e => { if (e.key !== key) return true; drop(e.group); if (e.seen) this.seenExits.delete(e.seen); return false; });
        this.stations = this.stations.filter(s => { if (s.key !== key) return true; drop(s.group); if (s.seen) this.seenStations.delete(s.seen); return false; });
    }

    station() {
        return this.stations[0] || null;
    }

    _nearestStation(x, z) {
        let best = null, bd = 260;
        for (const s of this.stations) {
            const d = Math.hypot(s.x - x, s.z - z);
            if (d < bd) { bd = d; best = s; }
        }
        return best;
    }

    _wallPoint(b, e, t) {
        return { x: e.ax + e.ux * t, z: e.az + e.uz * t };
    }

    _nameSign(b, camDir) {
        const es = edges(b.poly);
        if (!es.length) return;
        let best = null, score = -Infinity;
        for (const e of es) {
            const s = (e.nx * camDir.x + e.nz * camDir.z) * Math.min(e.L, 25) + e.L * 0.05;
            if (s > score) { score = s; best = e; }
        }
        const apt = b.style === 1;
        const len = Math.max(4, Math.min(best.L * 0.75, 15, b.name.length * 1.4));
        const h = len * (apt ? 0.22 : 0.19);
        const out = b.vs * 0.5 + 0.1, depth = b.vs * 0.75 + 0.35;
        const mid = this._wallPoint(b, best, best.L / 2);
        const y = Math.max(h + 2, b.top - h * 0.9);
        // 아파트는 벽에 페인트로 쓴 큰 이름, 그 밖은 어두운 판 간판
        const tex = apt ? plateTexture(b.name, null, '#3d5a80', 512, 112) : plateTexture(b.name, '#1d2b3a', '#ffffff', 512, 104, '#c9a227');
        const anchors = [-1, 1].map(s => ({ x: mid.x + best.ux * s * len * 0.4 - best.nx * depth, y: y, z: mid.z + best.uz * s * len * 0.4 - best.nz * depth }));
        const pl = new Plate(this.group, tex, len, h, mid.x + best.nx * out, y, mid.z + best.nz * out, best.nx, best.nz, anchors, { transparent: apt });
        pl.key = this.curKey;
        this.plates.push(pl);
    }

    _shopSign(s, world, perEdge) {
        // 가게가 든 건물(없으면 가장 가까운 건물)의 가장 가까운 벽
        let bestB = null, bestE = null, bestD = 9;
        for (const b of world.candidates(s.x, s.z).concat(world.candidates(s.x + 6, s.z), world.candidates(s.x - 6, s.z), world.candidates(s.x, s.z + 6), world.candidates(s.x, s.z - 6))) {
            if (b.state !== 'intact' || b.top < 3) continue;
            for (const e of edges(b.poly)) {
                const t = Math.max(0.8, Math.min(e.L - 0.8, (s.x - e.ax) * e.ux + (s.z - e.az) * e.uz));
                const d = Math.hypot(e.ax + e.ux * t - s.x, e.az + e.uz * t - s.z);
                if (d < bestD) { bestD = d; bestB = b; bestE = { ...e, t }; }
            }
        }
        if (!bestB) return;
        const key = bestB.idx + ':' + Math.round(bestE.ax) + ':' + Math.round(bestE.az) + ':' + Math.round(bestE.t / 5);
        const level = perEdge.get(key) || 0;
        if (level >= 3 || (level + 1) * 1.15 + 1.6 > bestB.top) return;
        perEdge.set(key, level + 1);
        const [bg, fg] = SHOP_COLORS[s.cls] || ['#455a64', '#fff'];
        const w = Math.min(4.2, bestE.L * 0.8), h = 0.85;
        const out = bestB.vs * 0.5 + 0.12 + level * 0.01, depth = bestB.vs * 0.75 + 0.3;
        const p = this._wallPoint(bestB, bestE, bestE.t);
        const y = 1.7 + level * 1.15;
        const anchors = [{ x: p.x - bestE.nx * depth, y, z: p.z - bestE.nz * depth }];
        const pl = new Plate(this.group, plateTexture(s.name, bg, fg, 512, 104), w, h, p.x + bestE.nx * out, y, p.z + bestE.nz * out, bestE.nx, bestE.nz, anchors);
        pl.key = this.curKey;
        this.plates.push(pl);
        return pl;
    }

    _station(s) {
        const g = new THREE.Group();
        const pole = new THREE.MeshLambertMaterial({ color: 0x3b4450 });
        for (const x of [-1.6, 1.6]) {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.2, 8), pole);
            m.position.set(x, 2.1, 0); g.add(m);
        }
        const name = s.name.endsWith('역') ? s.name : s.name + '역';
        const board = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.2, 0.16), [pole, pole, pole, pole,
            new THREE.MeshLambertMaterial({ map: plateTexture(name, '#1e4fa3', '#fff', 512, 140, '#ffffff') }),
            new THREE.MeshLambertMaterial({ map: plateTexture(name, '#1e4fa3', '#fff', 512, 140, '#ffffff') })]);
        board.position.set(0, 4.0, 0); board.castShadow = true;
        g.add(board);
        // 멀리서도 역이 어딘지 보이게 높이 띄운 역 이름
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(512, 150, (c) => {
            c.fillStyle = '#1e4fa3'; c.beginPath(); c.roundRect(6, 6, 500, 112, 30); c.fill();
            c.beginPath(); c.moveTo(232, 116); c.lineTo(256, 146); c.lineTo(280, 116); c.fill();
            c.fillStyle = '#fff'; c.beginPath(); c.arc(66, 62, 38, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#1e4fa3'; c.font = `900 50px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('M', 66, 65);
            c.fillStyle = '#fff'; fit(c, name, 360, 66); c.fillText(name, 300, 66);
        }) }));
        tag.scale.set(11, 3.2, 1);
        tag.position.set(0, 13, 0);
        g.add(tag);
        g.position.set(s.x, 0, s.z);
        this.group.add(g);
        const st = { name: s.name, x: s.x, z: s.z, group: g, body: this._body(g), key: this.curKey };
        this.stations.push(st);
        return st;
    }

    /** 지하철 출구: 유리 지붕을 얹은 계단 입구 + 번호판 */
    _exit(x, z, no, st) {
        const g = new THREE.Group();
        const { glass, frame } = this.exitParts;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 3.6), glass);
        roof.position.set(0, 2.3, 0); roof.rotation.x = -0.12; g.add(roof);
        for (const sx of [-1.25, 1.25]) {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 3.4), glass);
            wall.position.set(sx, 1.1, 0); g.add(wall);
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), frame);
            post.position.set(sx, 1.2, 1.75); g.add(post);
        }
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.3, 0.1), frame);
        back.position.set(0, 1.15, -1.75); g.add(back);
        const label = no ? `${st ? st.name.replace(/역$/, '') + '역 ' : ''}${no}번 출구` : (st ? st.name.replace(/역$/, '') + '역' : '지하철');
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.6), new THREE.MeshLambertMaterial({ map: plateTexture(label, '#1e4fa3', '#fff', 512, 120) }));
        sign.position.set(0, 2.62, 1.82); g.add(sign);
        if (no) {
            const badge = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ map: labelTexture(128, 128, (c) => {
                c.fillStyle = '#ffd200'; c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#111'; c.font = `900 80px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(no), 64, 70);
            }) }));
            badge.position.set(0, 3.25, 1.6); g.add(badge);
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), frame);
            pole.position.set(0, 2.85, 1.6); g.add(pole);
        }
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        // 실제 크기 출구는 멀리서 안 보인다 — 지도 앱 마커처럼 머리 위에 번호 표지를 띄운다
        const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(256, 160, (c) => {
            c.fillStyle = '#1e4fa3'; c.beginPath(); c.roundRect(8, 8, 240, 112, 26); c.fill();
            c.beginPath(); c.moveTo(108, 118); c.lineTo(128, 152); c.lineTo(148, 118); c.fill();
            c.fillStyle = '#ffd200'; c.beginPath(); c.arc(64, 64, 42, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#111'; c.font = `900 ${no && no > 9 ? 46 : 58}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(no ? String(no) : 'M', 64, 68);
            c.fillStyle = '#fff'; c.font = `900 40px ${FONT}`; c.fillText('출구', 178, 66);
        }) }));
        marker.scale.set(4.2, 2.6, 1);
        marker.position.set(0, 7.2, 0);
        g.add(marker);
        // 입구는 역 반대쪽을 본다
        const yaw = st ? Math.atan2(x - st.x, z - st.z) : 0;
        g.position.set(x, 0, z);
        g.rotation.y = yaw;
        this.group.add(g);
        const ex = { no, x, z, group: g, body: this._body(g), key: this.curKey, st };
        this.exits.push(ex);
        return ex;
    }

    /** 카카오에서 받은 번호 붙은 출구로 바꾼다 (그 역 주변 출구만). 위치는 카카오 좌표 */
    applyExits(list, st, origin) {
        if (!list || !list.length || !origin || !st) return;
        this.exits = this.exits.filter(e => {
            if (e.st !== st && Math.hypot(e.x - st.x, e.z - st.z) > 200) return true;
            this.group.remove(e.group);
            return false;
        });
        const kx = 111320 * Math.cos(origin.lat * Math.PI / 180) / UNIT_M, kz = 110574 / UNIT_M;
        const prev = this.curKey;
        this.curKey = st.key;
        for (const e of list) {
            const x = (e.lng - origin.lng) * kx, z = -(e.lat - origin.lat) * kz;
            if (Math.hypot(x - st.x, z - st.z) > 260) continue;
            this._exit(x, z, e.no, st);
        }
        this.curKey = prev;
    }

    _body(g) {
        return { obj: g, vel: new THREE.Vector3(), ang: new THREE.Vector3(), air: false, down: false };
    }

    impact(p, r, force, dir) {
        let n = 0;
        const knock = (o, x, z, reach) => {
            const d = Math.hypot(x - p.x, z - p.z);
            if (d > r + reach || p.y > 6 + r || o.body.down) return;
            const b = o.body;
            b.air = true;
            b.vel.set((x - p.x) / (d || 1) * force * 0.6 + dir.x * 3, 6 + force * 0.4, (z - p.z) / (d || 1) * force * 0.6 + dir.z * 3);
            b.ang.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
            n++;
        };
        for (const e of this.exits) knock(e, e.group.position.x, e.group.position.z, 2);
        for (const s of this.stations) knock(s, s.group.position.x, s.group.position.z, 2.4);
        for (const pl of this.plates) {
            if (pl.state === 'wall' && pl.mesh.position.distanceTo(p) < r + 1) pl.drop(dir);
        }
        return n;
    }

    update(dt, world) {
        for (const pl of this.plates) pl.update(dt, world);
        for (const o of [...this.exits, ...this.stations]) {
            const b = o.body;
            if (!b.air) continue;
            const g = b.obj;
            b.vel.y += GRAV * dt;
            g.position.addScaledVector(b.vel, dt);
            const w = b.ang.length();
            if (w > 0.01) { _q.setFromAxisAngle(_v.copy(b.ang).divideScalar(w), w * dt); g.quaternion.premultiply(_q); }
            const s = world.surface(g.position.x, g.position.y + 0.3, g.position.z, null);
            if (g.position.y <= s && b.vel.y < 0) {
                g.position.y = s;
                if (-b.vel.y > 7) { b.vel.y *= -0.3; b.vel.x *= 0.5; b.vel.z *= 0.5; b.ang.multiplyScalar(0.5); this.sfx.thump(6); }
                else { b.air = false; b.down = true; this.fx.dust(g.position.x, g.position.y + 0.5, g.position.z, 3, 1, 0.6); }
            }
        }
    }
}
