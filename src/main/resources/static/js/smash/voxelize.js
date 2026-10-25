// 건물 바닥 모양(다각형) + 높이 → 블록 목록.
// 블록 한 변 = vs 칸. 2블록이 한 층(아래 블록은 바닥판/띠, 위 블록은 창문 줄).
// 큰 건물은 vs 를 키워 블록 수를 예산 안에 맞춘다.

export const TYPE = { SLAB: 0, WALL: 1, GLASS: 2, PILLAR: 3, ROOF: 4, PARAPET: 5, BAND: 6, LIT: 7 };
export const IS_GLASS = [false, false, true, false, false, false, false, true];
// 억 원 (블록 한 개, vs=1 기준. vs 가 크면 부피만큼 비싸다)
export const VALUE = [0.35, 0.6, 0.25, 0.9, 0.4, 0.35, 0.35, 0.25];

export function polygonArea(p) {
    let a = 0;
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
    }
    return a / 2;
}

export function pointInPolygon(x, z, p) {
    let inside = false;
    const n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

export function distToPolygon(x, z, p) {
    if (pointInPolygon(x, z, p)) return 0;
    let best = Infinity;
    const n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = p[j * 2], az = p[j * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1];
        const dx = bx - ax, dz = bz - az;
        const L = dx * dx + dz * dz || 1e-9;
        let t = ((x - ax) * dx + (z - az) * dz) / L;
        t = Math.max(0, Math.min(1, t));
        const ex = ax + dx * t - x, ez = az + dz * t - z;
        best = Math.min(best, ex * ex + ez * ez);
    }
    return Math.sqrt(best);
}

function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

const WALLS = [0xefe9de, 0xdedad2, 0xd2c3a8, 0xb9785e, 0xf2f2ef, 0xa9b4c0, 0xe6dccb, 0xc9ccd1];
const GLASS = [0x5b8fc4, 0x4a7fa8, 0x6aa0c8, 0x3f6f8f, 0x5d7f9a];
const ROOFS = [0x8f8c86, 0x7d8189, 0x9a958c, 0x6f747c];

/** 겉모습 종류. 외벽 텍스처 줄 번호와 블록 무늬가 이 순서를 같이 쓴다 */
export const STYLE = { OFFICE: 0, APART: 1, SHOP: 2, HOUSE: 3, PLAIN: 4 };

/** 건물 용도(kind)와 높이로 겉모습을 고른다 */
export function styleOf(kind, heightM) {
    switch (kind) {
        case 'office': case 'hotel': return heightM > 20 ? STYLE.OFFICE : STYLE.SHOP;
        case 'apartments': return STYLE.APART;
        case 'commercial': case 'retail': return heightM > 40 ? STYLE.OFFICE : STYLE.SHOP;
        case 'house': case 'detached': return STYLE.HOUSE;
        default: return heightM > 45 ? STYLE.OFFICE : STYLE.PLAIN;
    }
}

const APART_WALLS = [0xf4f2ec, 0xeceae2, 0xf2ede4, 0xe8ebee];
const SHOP_BANDS = [0xc8553d, 0x2f6690, 0x3a7d44, 0xe0a030, 0x6c4f8c, 0x8d6e63];
const HOUSE_WALLS = [0xc98d6a, 0xe2cfb2, 0xb9785e, 0xd8c3a5, 0xece4d6, 0xa98467];

/** 건물마다 정해진 색. 같은 건물은 늘 같은 색 */
export function palette(id, style) {
    const h = hash(String(id));
    let glass = GLASS[h % GLASS.length];
    let wall = WALLS[h % WALLS.length];
    let band = [0x6f7a88, 0x8b8378, 0x7a6f66, 0x5d6670][(h >>> 8) % 4];
    if (style === STYLE.OFFICE) {
        glass = [0x3f6f8f, 0x4a7fa8, 0x2f5f7a, 0x6a8fa8, 0x3b5f6e][h % 5];
        wall = [0xd6dde4, 0xc3ccd6, 0xe4e7ea, 0xaab6c3][h % 4];
        band = 0x4a5562;
    } else if (style === STYLE.APART) {
        wall = APART_WALLS[h % APART_WALLS.length];
        glass = 0x52606d;
        band = 0xdcdcd6;
    } else if (style === STYLE.SHOP) {
        band = SHOP_BANDS[(h >>> 8) % SHOP_BANDS.length];
    } else if (style === STYLE.HOUSE) {
        wall = HOUSE_WALLS[h % HOUSE_WALLS.length];
        band = wall;
        glass = 0x51606e;
    }
    const c = [];
    c[TYPE.SLAB] = 0xb5aea3;
    c[TYPE.WALL] = wall;
    c[TYPE.GLASS] = glass;
    c[TYPE.PILLAR] = 0xcfc8bb;
    c[TYPE.ROOF] = ROOFS[(h >>> 4) % ROOFS.length];
    c[TYPE.PARAPET] = wall;
    c[TYPE.BAND] = band;
    c[TYPE.LIT] = 0xf3d488;
    return { colors: c, wall, glass, roof: c[TYPE.ROOF], band, seed: h, style };
}

/**
 * @param b {poly:number[] (x,z 칸), h:number (칸), id}
 * @returns {cells:Int16Array(4n), count, W, H, D, ox, oz, vs}
 */
export function voxelize(b, budget = 5200) {
    const p = b.poly;
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity, per = 0;
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
        const x = p[i * 2], z = p[i * 2 + 1];
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        minz = Math.min(minz, z); maxz = Math.max(maxz, z);
        const j = (i + 1) % n;
        per += Math.hypot(p[j * 2] - x, p[j * 2 + 1] - z);
    }
    const A = Math.abs(polygonArea(p));
    const Hm = Math.max(2, b.h);
    let vs = 1;
    for (vs = 1; vs < 5; vs++) {
        const est = (A / (vs * vs)) * (Hm / vs) * 0.5 + (per / vs) * (Hm / vs) * 0.5 + A / (vs * vs) * 0.3;
        if (est <= budget) break;
    }
    const W = Math.max(1, Math.ceil((maxx - minx) / vs));
    const D = Math.max(1, Math.ceil((maxz - minz) / vs));
    const Hc = Math.max(2, Math.round(Hm / vs));
    const mask = new Uint8Array(W * D);
    let cnt = 0;
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
        if (pointInPolygon(minx + (x + 0.5) * vs, minz + (z + 0.5) * vs, p)) { mask[z * W + x] = 1; cnt++; }
    }
    if (!cnt) { mask[Math.floor(D / 2) * W + Math.floor(W / 2)] = 1; }
    const m = (x, z) => x >= 0 && z >= 0 && x < W && z < D && mask[z * W + x] === 1;
    const shell = (x, z) => m(x, z) && (!m(x + 1, z) || !m(x - 1, z) || !m(x, z + 1) || !m(x, z - 1));
    const style = b.style ?? STYLE.PLAIN;
    // 바깥벽 창문 줄에서 기둥(벽) 칸 간격. 오피스는 거의 유리, 주택은 거의 벽
    const window = (x, z) => {
        const k = (x + z) % 4;
        switch (style) {
            case STYLE.OFFICE: return k !== 0;
            case STYLE.HOUSE: return (x + z) % 3 === 1;
            default: return (x + z) % 3 !== 0;
        }
    };
    const out = [];
    const rnd = mulberry(hash(String(b.id)));
    for (let y = 0; y < Hc; y++) {
        const slabRow = y % 2 === 0;
        for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
            if (!m(x, z)) continue;
            let t;
            if (shell(x, z)) {
                if (slabRow) t = TYPE.BAND;
                else t = window(x, z) ? (rnd() < 0.08 ? TYPE.LIT : TYPE.GLASS) : TYPE.WALL;
            } else if (slabRow) t = TYPE.SLAB;
            else if (x % 3 === 0 && z % 3 === 0) t = TYPE.PILLAR;
            else continue;
            out.push(x, y, z, t);
        }
    }
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
        if (!m(x, z)) continue;
        const s = shell(x, z);
        out.push(x, Hc, z, s ? TYPE.PARAPET : TYPE.ROOF);
        if (s && Hc > 3) out.push(x, Hc + 1, z, TYPE.PARAPET);
    }
    return { cells: Int16Array.from(out), count: out.length / 4, W, H: Hc + 2, D, ox: minx, oz: minz, vs, roofTop: (Hc + 1) * vs };
}

function mulberry(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
