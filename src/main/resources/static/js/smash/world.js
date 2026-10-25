import * as THREE from 'three';
import { Ground } from './ground.js';
import { VoxelBuilding } from './building.js';
import { voxelize, palette, polygonArea, pointInPolygon, distToPolygon, STYLE, styleOf } from './voxelize.js';

// 1칸 = 1.6m. 층 높이 3.2m = 2칸이라 블록 두 줄이 한 층이 된다.
export const UNIT_M = 1.6;
const CHUNK = 48;
const HASH = 12;
const VOXEL_BUDGET_PER = 5200;

const _v = new THREE.Vector3();

/**
 * 블록 무늬와 맞춘 외벽 텍스처 모음. R=유리, G=층 띠, B=밝기.
 * 한 줄 = 한 겉모습(STYLE 순서), 가로 한 장 = 블록 3칸(오피스는 4칸), 세로 = 한 층(창문 줄 + 띠 줄).
 */
function facadeTexture() {
    const W = 384, H = 64, N = 5;
    const c = document.createElement('canvas');
    c.width = W; c.height = H * N;
    const g = c.getContext('2d');
    const px = (r, gg, bb) => `rgb(${r},${gg},${bb})`;
    const row = (s, draw) => { g.save(); g.translate(0, s * H); draw(); g.restore(); };
    // 0 오피스: 유리 커튼월, 얇은 세로살, 띠는 반쯤 어두운 판
    row(STYLE.OFFICE, () => {
        g.fillStyle = px(255, 0, 235); g.fillRect(0, 0, W, H);
        g.fillStyle = px(255, 0, 210); for (let i = 0; i < 4; i++) g.fillRect(i * 96 + 48, 0, 46, 32);
        g.fillStyle = px(0, 0, 255); for (let i = 0; i < 4; i++) g.fillRect(i * 96, 0, 6, H);
        g.fillStyle = px(0, 255, 200); g.fillRect(0, 34, W, 14);
    });
    // 1 아파트: 넓은 창 + 베란다 난간 띠
    row(STYLE.APART, () => {
        g.fillStyle = px(0, 0, 255); g.fillRect(0, 0, W, H);
        g.fillStyle = px(255, 0, 240); g.fillRect(140, 4, 232, 28);
        g.fillStyle = px(0, 0, 255); g.fillRect(252, 4, 6, 28);
        g.fillStyle = px(0, 255, 255); g.fillRect(0, 32, W, 18);
        g.fillStyle = px(0, 255, 215); for (let x = 0; x < W; x += 12) g.fillRect(x, 34, 3, 14);
    });
    // 2 상가: 큰 유리창 + 색 띠(간판 자리)
    row(STYLE.SHOP, () => {
        g.fillStyle = px(0, 0, 255); g.fillRect(0, 0, W, H);
        g.fillStyle = px(255, 0, 235); g.fillRect(136, 3, 112, 29); g.fillRect(264, 3, 112, 29);
        g.fillStyle = px(0, 255, 255); g.fillRect(0, 34, W, 26);
    });
    // 3 주택: 벽 위주 + 작은 창, 띠 없음
    row(STYLE.HOUSE, () => {
        g.fillStyle = px(0, 0, 255); g.fillRect(0, 0, W, H);
        g.fillStyle = px(255, 0, 230); g.fillRect(168, 6, 48, 22); g.fillRect(296, 6, 48, 22);
        g.fillStyle = px(0, 0, 225); g.fillRect(0, 36, W, 3);
    });
    // 4 일반: 예전 무늬
    row(STYLE.PLAIN, () => {
        g.fillStyle = px(0, 0, 255); g.fillRect(0, 0, W, H);
        g.fillStyle = px(0, 255, 230); g.fillRect(0, 32, W, 32);
        g.fillStyle = px(255, 0, 255); g.fillRect(136, 3, 112, 27); g.fillRect(264, 3, 112, 27);
        g.fillStyle = px(255, 0, 200); g.fillRect(136, 3, 112, 6); g.fillRect(264, 3, 112, 6);
    });
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace;
    return t;
}

function facadeMaterial() {
    const mat = new THREE.MeshLambertMaterial({ map: facadeTexture() });
    mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', `#include <common>
attribute vec3 aWall;
attribute vec3 aGlass;
attribute vec3 aBand;
attribute float aStyle;
varying vec3 vWall;
varying vec3 vGlass;
varying vec3 vBand;
varying float vStyle;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
vWall = aWall; vGlass = aGlass; vBand = aBand; vStyle = aStyle;`);
        // 줄 하나가 한 겉모습: 세로 좌표를 한 층 안에서 되풀이(fract)한 뒤 그 줄로 옮긴다 (캔버스 위가 v=1)
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
varying vec3 vWall;
varying vec3 vGlass;
varying vec3 vBand;
varying float vStyle;`)
            .replace('#include <map_fragment>', `vec2 fuv = vec2(vMapUv.x, (clamp(fract(vMapUv.y), 0.01, 0.99) + (4.0 - vStyle)) / 5.0);
vec4 tx = texture2D(map, fuv);
diffuseColor.rgb = mix(mix(vWall, vBand, tx.g), vGlass, tx.r) * (0.8 + 0.2 * tx.b);`);
    };
    return mat;
}

const ROAD_COLOR = { major: 0x45494f, mid: 0x4d5158, minor: 0x5a5e64, foot: 0xbdb7aa };
const AREA_COLOR = { park: 0x8dbf6a, grass: 0x97c375, wood: 0x5f9a4c, water: 0x6fa8dc, pitch: 0x7fb069 };

export class World {
    constructor(scene, { budget = 45000, perBuilding = VOXEL_BUDGET_PER, targetBudget = 9000 } = {}) {
        this.scene = scene;
        this.ground = new Ground();
        this.cellSize = 280 / UNIT_M;
        this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        this.texLoader = new THREE.TextureLoader();
        this.sat = new Map();
        this.reqs = new Map();
        this.ids = new Set();
        this.roads = [];
        this.blockMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
        this.facadeMat = facadeMaterial();
        this.rubbleMat = new THREE.MeshLambertMaterial({ color: 0x8a8378 });
        this.budget = budget;
        this.perBuilding = perBuilding;
        this.targetBudget = targetBudget;
        this.root = new THREE.Group();
        scene.add(this.root);
        this.buildings = [];
        this.voxels = [];
        this.collapsing = [];
        this.chunks = new Map();
        this.hash = new Map();
    }

    clear() {
        this.gen = (this.gen || 0) + 1;
        this.sat = new Map();
        this.reqs = new Map();
        this.ids = new Set();
        this.roads = [];
        for (const v of this.voxels) v.dispose();
        this.voxels = [];
        this.collapsing = [];
        this.root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
        this.scene.remove(this.root);
        this.root = new THREE.Group();
        this.scene.add(this.root);
        this.buildings = [];
        this.chunks.clear();
        this.hash.clear();
        this.ground.reset();
    }

    /**
     * 처음 동네. 이 지점이 월드 원점이 되고, 이후 이웃 칸은 addArea 로 이어 붙인다.
     * @param area 서버 /api/smash/area 응답 (그 칸 중심 기준 미터, x 동쪽 z 남쪽)
     * @returns {target, added} 대상 건물과 이번에 더해진 것들
     */
    load(area, targetName, placeName) {
        this.clear();
        this.origin = { lat: area.lat, lng: area.lng };
        this._baseGround();
        const added = this.addArea(area, this.cellOf(0, 0), false);
        let target = this._pickTarget(placeName);
        if (!target) {
            // 검색 지점에 건물 데이터가 없으면 가상의 사옥을 세운다
            const s = 7;
            target = this._addBuilding({ id: 'target', name: targetName, kind: 'office', poly: [-s * 1.4, s, s * 1.4, s, s * 1.4, -s, -s * 1.4, -s], h: 26 });
            target.cell = this.cellOf(0, 0);
            this._clearAround(target);
        }
        target.target = true;
        target.name = targetName || target.name;
        // 회사 건물은 블록을 더 잘게. 너무 낮으면 부수는 맛이 없어 최소 높이를 둔다
        target.budget = this.targetBudget;
        this._setHeight(target, Math.max(14, target.h));
        this.target = target;
        this._buildChunks();
        return { target, added };
    }

    /** 칸 번호 (원점 칸이 "0,0"). 건물은 무게중심이 든 칸에 속한다 */
    cellOf(x, z) {
        return Math.round(x / this.cellSize) + ',' + Math.round(z / this.cellSize);
    }

    /** 서버 응답 좌표(그 칸 중심 기준 미터) → 월드 좌표(원점 기준 칸) */
    _converter(area) {
        const o = this.origin, k = 1 / UNIT_M;
        const kx0 = 111320 * Math.cos(o.lat * Math.PI / 180), kxc = 111320 * Math.cos(area.lat * Math.PI / 180);
        const ox = (area.lng - o.lng) * kx0, oz = -(area.lat - o.lat) * 110574, sx = kx0 / kxc;
        return (p) => {
            const out = new Array(p.length);
            for (let i = 0; i < p.length; i += 2) { out[i] = (ox + p[i] * sx) * k; out[i + 1] = (oz + p[i + 1]) * k; }
            return out;
        };
    }

    /**
     * 이웃 칸 데이터를 이어 붙인다. 이미 있는 건물(id)은 건너뛴다.
     * @returns {buildings, roads, pois} 이번에 새로 생긴 것 (월드 좌표)
     */
    addArea(area, key, rebuild = true) {
        const conv = this._converter(area);
        const k = 1 / UNIT_M;
        const newB = [];
        for (const b of area.buildings) {
            if (this.ids.has(b.id)) continue;
            const nb = this._addBuilding({ id: b.id, name: b.name, kind: b.kind, poly: conv(b.poly), h: Math.max(2.5, b.h * k) });
            nb.cell = this.cellOf(nb.cx, nb.cz);
            this.ids.add(b.id);
            newB.push(nb);
        }
        const req = this.reqs.get(key) || { ground: null, roads: [] };
        if (req.ground) { this.root.remove(req.ground); req.ground.geometry.dispose(); }
        const { mesh, roads } = this._cellGround(area, conv);
        mesh.visible = !area.sat;
        this.root.add(mesh);
        req.ground = mesh;
        req.roads = roads;
        this.reqs.set(key, req);
        this._collectRoads();
        const pois = (area.pois || []).map(p => {
            const [x, z] = conv([p.x, p.z]);
            return { ...p, x, z };
        });
        if (rebuild) this._addToChunks(newB);
        return { buildings: newB, roads, pois };
    }

    _collectRoads() {
        this.roads = [];
        for (const r of this.reqs.values()) this.roads.push(...r.roads);
    }

    /** 멀어진 칸 치우기: 그 칸에 속한 멀쩡한 건물·땅·도로를 지운다 (부서지는 중인 건물과 회사 건물은 남긴다) */
    removeCell(key) {
        const gone = [];
        for (const b of this.buildings) {
            if (b.cell === key && b.state === 'intact' && !b.target) gone.push(b);
        }
        if (gone.length) {
            const set = new Set(gone);
            const chunkKeys = new Set();
            for (const b of gone) {
                this._unhash(b);
                this.ids.delete(b.id);
                chunkKeys.add(b.chunk);
            }
            this.buildings = this.buildings.filter(b => !set.has(b));
            this.buildings.forEach((b, i) => { b.idx = i; });
            for (const ck of chunkKeys) {
                const c = this.chunks.get(ck);
                if (!c) continue;
                c.list = c.list.filter(b => !set.has(b));
                this._rebuildChunk(ck);
                if (!c.list.length) { const cc = this.chunks.get(ck); if (cc) this.root.remove(cc.mesh); this.chunks.delete(ck); }
            }
        }
        const req = this.reqs.get(key);
        if (req) {
            if (req.ground) { this.root.remove(req.ground); req.ground.geometry.dispose(); }
            this.reqs.delete(key);
            this._collectRoads();
        }
        return gone.length;
    }

    _addToChunks(list) {
        const touched = new Set();
        for (const b of list) {
            const key = Math.floor(b.cx / CHUNK) + ',' + Math.floor(b.cz / CHUNK);
            b.chunk = key;
            let c = this.chunks.get(key);
            if (!c) { c = { list: [], mesh: new THREE.Object3D() }; this.chunks.set(key, c); }
            c.list.push(b);
            touched.add(key);
        }
        for (const key of touched) this._rebuildChunk(key);
    }

    _unhash(b) {
        for (let x = Math.floor(b.bbox.minx / HASH); x <= Math.floor(b.bbox.maxx / HASH); x++) {
            for (let z = Math.floor(b.bbox.minz / HASH); z <= Math.floor(b.bbox.maxz / HASH); z++) {
                const l = this.hash.get(x + ',' + z);
                if (!l) continue;
                const i = l.indexOf(b);
                if (i >= 0) l.splice(i, 1);
            }
        }
    }

    _addBuilding(spec) {
        const p = spec.poly;
        let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity, cx = 0, cz = 0, per = 0;
        const n = p.length / 2;
        for (let i = 0; i < n; i++) {
            const x = p[i * 2], z = p[i * 2 + 1];
            minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z);
            cx += x; cz += z;
            const j = (i + 1) % n;
            per += Math.hypot(p[j * 2] - x, p[j * 2 + 1] - z);
        }
        const b = {
            ...spec, idx: this.buildings.length, cx: cx / n, cz: cz / n,
            bbox: { minx, maxx, minz, maxz }, area: Math.abs(polygonArea(p)), per,
            state: 'intact', voxel: null, target: false,
        };
        b.budget = this.perBuilding;
        this._setHeight(b, spec.h);
        b.style = styleOf(spec.kind, b.h * UNIT_M);
        b.pal = palette(b.id, b.style);
        this.buildings.push(b);
        for (let x = Math.floor(minx / HASH); x <= Math.floor(maxx / HASH); x++) {
            for (let z = Math.floor(minz / HASH); z <= Math.floor(maxz / HASH); z++) {
                const key = x + ',' + z;
                let l = this.hash.get(key);
                if (!l) this.hash.set(key, l = []);
                l.push(b);
            }
        }
        return b;
    }

    /** 블록으로 바꿨을 때와 같은 높이·무늬가 되도록 블록 크기(vs)를 미리 정한다 */
    _setHeight(b, h) {
        b.h = h;
        let vs = 1;
        for (vs = 1; vs < 5; vs++) {
            const est = (b.area / (vs * vs)) * (h / vs) * 0.5 + (b.per / vs) * (h / vs) * 0.5 + b.area / (vs * vs) * 0.3;
            if (est <= b.budget) break;
        }
        b.vs = vs;
        b.Hc = Math.max(2, Math.round(h / vs));
        b.top = (b.Hc + 1) * vs;
    }

    /** 검색한 장소와 이름이 같은 건물이 근처에 있으면 그것, 없으면 검색 지점에 가장 가까운 건물 */
    _pickTarget(placeName) {
        const norm = s => (s || '').replace(/[\s().,·-]/g, '').toLowerCase();
        const want = norm(placeName);
        if (want.length >= 2) {
            let named = null, nd = 90;
            for (const b of this.buildings) {
                const n = norm(b.name);
                if (n.length < 2 || !(n.includes(want) || want.includes(n))) continue;
                const d = distToPolygon(0, 0, b.poly);
                if (d < nd) { nd = d; named = b; }
            }
            if (named) return named;
        }
        // 지하철역처럼 검색 지점이 길 위면 옆의 매점·화장실 같은 작은 건물이 걸린다 — 작은 건물은 거리 벌점을 준다
        let best = null, bd = Infinity;
        for (const b of this.buildings) {
            const d = distToPolygon(0, 0, b.poly);
            if (d > 40) continue;
            const small = b.area < 120 ? 25 : 0;
            const score = d + small - Math.min(b.h, 40) * 0.05;
            if (score < bd) { bd = score; best = b; }
        }
        return best;
    }

    _clearAround(t) {
        const keep = [];
        for (const b of this.buildings) {
            if (b === t) { keep.push(b); continue; }
            const ov = b.bbox.maxx > t.bbox.minx - 3 && b.bbox.minx < t.bbox.maxx + 3 && b.bbox.maxz > t.bbox.minz - 3 && b.bbox.minz < t.bbox.maxz + 3;
            if (!ov) keep.push(b);
            else this.ids.delete(b.id);
        }
        this.buildings = keep;
        keep.forEach((b, i) => { b.idx = i; });
        this.hash.clear();
        for (const b of keep) {
            for (let x = Math.floor(b.bbox.minx / HASH); x <= Math.floor(b.bbox.maxx / HASH); x++) {
                for (let z = Math.floor(b.bbox.minz / HASH); z <= Math.floor(b.bbox.maxz / HASH); z++) {
                    const key = x + ',' + z;
                    let l = this.hash.get(key);
                    if (!l) this.hash.set(key, l = []);
                    l.push(b);
                }
            }
        }
    }

    candidates(x, z) {
        return this.hash.get(Math.floor(x / HASH) + ',' + Math.floor(z / HASH)) || [];
    }

    /** (x,z) 에 서 있는 멀쩡한 건물 */
    intactAt(x, z) {
        for (const b of this.candidates(x, z)) {
            if (b.state === 'intact' && x >= b.bbox.minx && x <= b.bbox.maxx && z >= b.bbox.minz && z <= b.bbox.maxz && pointInPolygon(x, z, b.poly)) return b;
        }
        return null;
    }

    /** y 아래로 가장 가까운 딛을 면의 높이 */
    surface(x, y, z, self) {
        let s = this.ground.height(x, z);
        for (const b of this.candidates(x, z)) {
            if (b.state === 'intact') {
                if (b.top <= y + 0.6 && b.top > s && x >= b.bbox.minx && x <= b.bbox.maxx && z >= b.bbox.minz && z <= b.bbox.maxz && pointInPolygon(x, z, b.poly)) s = b.top;
            } else if (b.state === 'voxel' && b.voxel !== self) {
                const t = b.voxel.topBelow(x, y + 0.3, z);
                if (t > s) s = t;
            } else if (b.state === 'rubble') {
                if (b.rubbleTop <= y + 0.6 && b.rubbleTop > s && pointInPolygon(x, z, b.poly)) s = b.rubbleTop;
            }
        }
        return s;
    }

    /** 멀쩡한 건물 벽 안쪽인가 */
    blocked(x, y, z, self) {
        for (const b of this.candidates(x, z)) {
            if (b.state === 'intact' && y < b.top - 0.5 && x >= b.bbox.minx && x <= b.bbox.maxx && z >= b.bbox.minz && z <= b.bbox.maxz && pointInPolygon(x, z, b.poly)) return true;
            if (b.state === 'voxel' && b.voxel !== self && b.voxel.isAttached(b.voxel.cellAt(x, y, z))) return true;
        }
        return false;
    }

    // ── 멀쩡한 건물 메시 (청크로 묶음) ──

    _buildChunks() {
        const groups = new Map();
        for (const b of this.buildings) {
            const key = Math.floor(b.cx / CHUNK) + ',' + Math.floor(b.cz / CHUNK);
            b.chunk = key;
            let l = groups.get(key);
            if (!l) groups.set(key, l = []);
            l.push(b);
        }
        for (const [key, list] of groups) this._rebuildChunk(key, list);
    }

    _rebuildChunk(key, list) {
        const old = this.chunks.get(key);
        if (old) { this.root.remove(old.mesh); if (old.mesh.isMesh) old.mesh.geometry.dispose(); }
        list = list || (old ? old.list : []);
        const live = list.filter(b => b.state === 'intact');
        if (!live.length) { this.chunks.set(key, { list, mesh: new THREE.Object3D() }); return; }
        const geo = buildingGeometry(live);
        const mesh = new THREE.Mesh(geo, this.facadeMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.chunk = key;
        this.root.add(mesh);
        this.chunks.set(key, { list, mesh });
    }

    chunkMeshes() {
        const out = [];
        for (const c of this.chunks.values()) if (c.mesh.isMesh) out.push(c.mesh);
        return out;
    }

    voxelMeshes() {
        return this.voxels.map(v => v.mesh);
    }

    totalBlocks() {
        let n = 0;
        for (const v of this.voxels) n += v.N;
        return n;
    }

    /** 멀쩡한 건물을 블록 건물로 바꾼다. 예산을 넘으면 통째로 주저앉힌다(collapse). */
    voxelize(b) {
        if (b.state !== 'intact') return b.voxel;
        if (!b.target && this.totalBlocks() > this.budget) {
            this.collapse(b);
            return null;
        }
        const spec = voxelize({ poly: b.poly, h: b.Hc * b.vs, id: b.id, style: b.style }, b.budget);
        b.voxel = new VoxelBuilding(this, spec, b.pal, b);
        b.state = 'voxel';
        this.voxels.push(b.voxel);
        this._rebuildChunk(b.chunk);
        return b.voxel;
    }

    /** 블록 예산 밖의 건물: 먼지와 함께 땅으로 꺼지고 낮은 잔해 더미가 남는다 */
    collapse(b) {
        if (b.state !== 'intact') return;
        b.state = 'sinking';
        this._rebuildChunk(b.chunk);
        const mesh = new THREE.Mesh(buildingGeometry([b]), this.facadeMat);
        mesh.castShadow = true;
        this.root.add(mesh);
        this.collapsing.push({ b, mesh, t: 0, dur: 1.4 + Math.random() * 0.6 });
        b.rubbleTop = Math.min(b.top * 0.12, 3);
    }

    stepCollapse(dt, dustCb) {
        for (let i = this.collapsing.length - 1; i >= 0; i--) {
            const c = this.collapsing[i];
            c.t += dt;
            const k = Math.min(1, c.t / c.dur);
            const e = k * k;
            const h = Math.max(c.b.rubbleTop / c.b.top, 1 - e);
            c.mesh.scale.y = h;
            if (Math.random() < dt * 14) dustCb(c.b.cx + (Math.random() - 0.5) * (c.b.bbox.maxx - c.b.bbox.minx), c.b.top * h, c.b.cz + (Math.random() - 0.5) * (c.b.bbox.maxz - c.b.bbox.minz), c.b);
            if (k >= 1) {
                c.b.state = 'rubble';
                c.mesh.material = this.rubbleMat;
                this.collapsing.splice(i, 1);
            }
        }
    }

    // ── 땅·도로·공원 ──

    /** 끝없이 이어지는 바탕 땅 한 장 (칸마다 도로·공원·항공사진을 그 위에 얹는다) */
    _baseGround() {
        const base = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshLambertMaterial({ color: 0xcdc8bc }));
        base.rotation.x = -Math.PI / 2;
        base.receiveShadow = true;
        base.userData.ground = true;
        this.root.add(base);
        this.groundMesh = base;
    }

    /** 한 칸의 도로·공원·물 메시. 반환: {mesh, roads(자동차·가로수용)} */
    _cellGround(area, conv) {
        const k = 1 / UNIT_M;
        const pos = [], col = [];
        const c = new THREE.Color();
        const tri = (ax, az, bx, bz, cx, cz, y, hex) => {
            c.setHex(hex);
            // 위에서 봤을 때 앞면이 되도록 감기 방향을 맞춘다
            if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) > 0) { [bx, cx] = [cx, bx]; [bz, cz] = [cz, bz]; }
            pos.push(ax, y, az, bx, y, bz, cx, y, cz);
            for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
        };
        const poly = (p, y, hex) => {
            const pts = [];
            for (let i = 0; i < p.length; i += 2) pts.push(new THREE.Vector2(p[i], p[i + 1]));
            const faces = THREE.ShapeUtils.triangulateShape(pts, []);
            for (const [a, b, d] of faces) tri(pts[a].x, pts[a].y, pts[b].x, pts[b].y, pts[d].x, pts[d].y, y, hex);
        };
        for (const a of area.areas) {
            const p = conv(a.poly);
            if (p.length >= 6) poly(p, a.t === 'water' ? 0.015 : 0.01, AREA_COLOR[a.t] || 0x97c375);
        }
        const order = { foot: 0, minor: 1, mid: 2, major: 3 };
        const sorted = [...area.roads].sort((a, b) => order[a.t] - order[b.t]);
        const roads = [];
        for (const r of sorted) {
            const pts = conv(r.pts);
            const w = r.w * k;
            const y = 0.02 + order[r.t] * 0.006;
            if (r.t === 'major' || r.t === 'mid') ribbon(pts, w + 2.2, y - 0.004, 0xbab4a8, tri);
            ribbon(pts, w, y, ROAD_COLOR[r.t], tri);
            if (r.t === 'major' || r.t === 'mid') dashes(pts, 0.14, y + 0.002, 0xf1f1ec, tri);
            if (r.t !== 'foot') roads.push({ t: r.t, w, pts });
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, this.groundMat);
        mesh.receiveShadow = true;
        return { mesh, roads };
    }

    /**
     * 항공사진 (브이월드, 서버가 대신 받아 줌). 사진 조각 하나 = 판 하나로 깔고,
     * 이미 깐 조각은 건너뛴다. 범위는 월드 좌표(칸) 상자.
     */
    loadSat(minx, maxx, minz, maxz, z) {
        const o = this.origin;
        if (!o) return;
        const n = 1 << z;
        const kx0 = 111320 * Math.cos(o.lat * Math.PI / 180);
        const lngOf = x => o.lng + x * UNIT_M / kx0, latOf = zz => o.lat - zz * UNIT_M / 110574;
        const tx = lng => Math.floor((lng + 180) / 360 * n);
        const ty = lat => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
        const x0 = tx(lngOf(minx)), x1 = tx(lngOf(maxx)), y0 = ty(latOf(minz)), y1 = ty(latOf(maxz));
        const lng = x => x / n * 360 - 180;
        const lat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
        const ux = lg => (lg - o.lng) * kx0 / UNIT_M, uz = lt => -(lt - o.lat) * 110574 / UNIT_M;
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
            const key = z + '/' + x + '/' + y;
            if (this.sat.has(key)) continue;
            const west = ux(lng(x)), east = ux(lng(x + 1)), north = uz(lat(y)), south = uz(lat(y + 1));
            const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            // 조각 사이 틈이 보이지 않게 아주 조금 겹친다
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry((east - west) * 1.004, (south - north) * 1.004), mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set((west + east) / 2, 0.012, (north + south) / 2);
            mesh.receiveShadow = true;
            mesh.visible = false;
            this.root.add(mesh);
            this.sat.set(key, mesh);
            this.texLoader.load(`/api/smash/sat/${z}/${x}/${y}`, tex => {
                if (!mesh.parent) { tex.dispose(); return; }
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.anisotropy = 4;
                mat.map = tex;
                mat.needsUpdate = true;
                mesh.visible = true;
            }, undefined, () => { /* 사진이 없는 조각은 바탕 땅이 보인다 */ });
        }
    }

    /** 멀어진 항공사진 조각을 치운다 */
    trimSat(cx, cz, r) {
        for (const [key, mesh] of this.sat) {
            if (Math.hypot(mesh.position.x - cx, mesh.position.z - cz) <= r) continue;
            this.root.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material.map) mesh.material.map.dispose();
            mesh.material.dispose();
            this.sat.delete(key);
        }
    }

    // ── 매 프레임 ──

    step(dt, landings, onShatter) {
        for (const v of this.voxels) {
            v.step(dt, landings);
            if (v.shatter.length) onShatter(v.shatter);
        }
    }
}

function ribbon(pts, w, y, hex, tri) {
    const h = w / 2;
    for (let i = 0; i + 3 < pts.length; i += 2) {
        const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
        const nx = -dz / L * h, nz = dx / L * h;
        tri(ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, y, hex);
        tri(ax + nx, az + nz, bx - nx, bz - nz, ax - nx, az - nz, y, hex);
        // 꺾이는 곳 이음새: 작은 팔각형
        for (let k = 0; k < 8; k++) {
            const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2;
            tri(bx, bz, bx + Math.cos(a0) * h, bz + Math.sin(a0) * h, bx + Math.cos(a1) * h, bz + Math.sin(a1) * h, y, hex);
        }
    }
}

function dashes(pts, w, y, hex, tri) {
    let carry = 0;
    for (let i = 0; i + 3 < pts.length; i += 2) {
        const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
        if (L < 0.01) continue;
        const ux = dx / L, uz = dz / L, nx = -uz * w, nz = ux * w;
        for (let s = carry; s < L; s += 3.2) {
            const e = Math.min(L, s + 1.6);
            const x0 = ax + ux * s, z0 = az + uz * s, x1 = ax + ux * e, z1 = az + uz * e;
            tri(x0 + nx, z0 + nz, x1 + nx, z1 + nz, x1 - nx, z1 - nz, y, hex);
            tri(x0 + nx, z0 + nz, x1 - nx, z1 - nz, x0 - nx, z0 - nz, y, hex);
            carry = s + 3.2 - L;
        }
    }
}

/** 바닥 다각형을 올려 세운 메시. 외벽 UV 는 블록 무늬와 같은 간격. */
function buildingGeometry(list) {
    const pos = [], nor = [], uv = [], wall = [], glass = [], band = [], sty = [];
    let curStyle = 4;
    const c1 = new THREE.Color(), c2 = new THREE.Color(), c3 = new THREE.Color();
    const push = (x, y, z, nx, ny, nz, u, v) => {
        pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(u, v);
        wall.push(c1.r, c1.g, c1.b); glass.push(c2.r, c2.g, c2.b); band.push(c3.r, c3.g, c3.b); sty.push(curStyle);
    };
    for (const b of list) {
        const p = b.poly, n = p.length / 2;
        const sign = polygonArea(p) < 0 ? 1 : -1;
        const top = b.top, vs = b.vs;
        c1.setHex(b.pal.wall); c2.setHex(b.pal.glass); c3.setHex(b.pal.band);
        curStyle = b.style ?? STYLE.PLAIN;
        const cols = curStyle === STYLE.OFFICE ? 4 : 3;
        let run = 0;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
            const L = Math.hypot(bx - ax, bz - az);
            if (L < 0.01) continue;
            const nx = sign * -(bz - az) / L, nz = sign * (bx - ax) / L;
            const u0 = run / (cols * vs), u1 = (run + L) / (cols * vs), v1 = top / (2 * vs);
            run += L;
            // 바깥에서 봤을 때 반시계: (a,0) (b,0) (b,top) / (a,0) (b,top) (a,top) — 법선과 맞지 않으면 뒤집는다
            const cx = (bx - ax), cz = (bz - az);
            const faceN = { x: -cz, z: cx };
            const flip = faceN.x * nx + faceN.z * nz < 0;
            const A0 = [ax, 0, az, u0, 0], B0 = [bx, 0, bz, u1, 0], B1 = [bx, top, bz, u1, v1], A1 = [ax, top, az, u0, v1];
            const quad = flip ? [A0, B1, B0, A0, A1, B1] : [A0, B0, B1, A0, B1, A1];
            for (const q of quad) push(q[0], q[1], q[2], nx, 0, nz, q[3], q[4]);
        }
        c1.setHex(b.pal.roof); c2.setHex(b.pal.roof); c3.setHex(b.pal.roof);
        const pts = [];
        for (let i = 0; i < n; i++) pts.push(new THREE.Vector2(p[i * 2], p[i * 2 + 1]));
        for (const [a, bb, d] of THREE.ShapeUtils.triangulateShape(pts, [])) {
            let A = pts[a], B = pts[bb], D = pts[d];
            // 위를 보는 면: (B-A)x(D-A) 의 y 성분 = (Bz-Az)(Dx-Ax) - (Bx-Ax)(Dz-Az) > 0
            if ((B.y - A.y) * (D.x - A.x) - (B.x - A.x) * (D.y - A.y) < 0) [B, D] = [D, B];
            for (const P of [A, B, D]) push(P.x, top, P.y, 0, 1, 0, 0.15, 0.75);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aWall', new THREE.Float32BufferAttribute(wall, 3));
    g.setAttribute('aGlass', new THREE.Float32BufferAttribute(glass, 3));
    g.setAttribute('aBand', new THREE.Float32BufferAttribute(band, 3));
    g.setAttribute('aStyle', new THREE.Float32BufferAttribute(sty, 1));
    g.computeBoundingSphere();
    return g;
}

export { pointInPolygon, distToPolygon };
