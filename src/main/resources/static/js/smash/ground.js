// 땅 높이맵. 잔해가 쌓이면 칸 높이가 오르고, 그 위로 다음 잔해가 쌓인다.
// 동네가 끝없이 이어지므로 64×64 칸 조각을 필요할 때만 만든다 (모든 블록 건물·소품이 같은 땅을 쓴다).
const B = 64;

export class Ground {
    constructor() {
        this.blocks = new Map();
    }

    reset() {
        this.blocks.clear();
    }

    /** 칸 번호. 조각 키와 조각 안 위치를 한 숫자로: 조각이 없으면 만들지 않고 -1 */
    index(x, z, create = true) {
        const cx = Math.floor(x), cz = Math.floor(z);
        const bx = Math.floor(cx / B), bz = Math.floor(cz / B);
        // 늘 양수인 키 (음수면 -1 표시와 겹친다). key*4096 도 2^53 안
        const key = (bx + 50000) * 100000 + (bz + 50000);
        let blk = this.blocks.get(key);
        if (!blk) {
            if (!create) return -1;
            blk = new Float32Array(B * B);
            this.blocks.set(key, blk);
        }
        this._last = blk;
        return (cz - bz * B) * B + (cx - bx * B) + key * B * B;
    }

    _block(c) {
        const key = Math.floor(c / (B * B));
        return this.blocks.get(key);
    }

    height(x, z) {
        const c = this.index(x, z, false);
        if (c < 0) return 0;
        return this._last[c - Math.floor(c / (B * B)) * B * B];
    }

    /** 더미가 이웃보다 drop 이상 높으면 낮은 쪽 방향 [dx, dz] */
    slide(x, z, g, drop) {
        let best = null, bestH = g - drop, h;
        if ((h = this.height(x + 1, z)) < bestH) { bestH = h; best = [1, 0]; }
        if ((h = this.height(x - 1, z)) < bestH) { bestH = h; best = [-1, 0]; }
        if ((h = this.height(x, z + 1)) < bestH) { bestH = h; best = [0, 1]; }
        if ((h = this.height(x, z - 1)) < bestH) { best = [0, -1]; }
        return best;
    }

    add(c, dh) {
        if (c === -1 || c === undefined) return;
        const blk = this._block(c);
        if (blk) blk[c - Math.floor(c / (B * B)) * B * B] += dh;
    }

    remove(c, dh) {
        if (c === -1 || c === undefined) return;
        const blk = this._block(c);
        if (blk) { const i = c - Math.floor(c / (B * B)) * B * B; blk[i] = Math.max(0, blk[i] - dh); }
    }
}
