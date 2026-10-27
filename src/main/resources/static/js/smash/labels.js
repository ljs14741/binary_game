// 건물 이름표: 지붕 위에 이름 꼬리표를 띄움 (HTML 이라 글자가 또렷하고 가벼움).
// 화면에서 겹치면 덜 중요한 것(낮고 먼 건물)을 숨기고, 회사 건물은 늘 맨 위에 빨갛게.

const norm = s => (s || '').replace(/\s+/g, '').toLowerCase();

export class Labels {
    /**
     * @param box   캔버스를 담은 칸 (이름표 층을 그 위에 얹음)
     * @param caps  { max: 한 화면 최대 개수, minTop: 이름표 달 최소 높이 }
     */
    constructor(box, caps) {
        this.caps = caps;
        this.layer = document.createElement('div');
        this.layer.className = 'smash-tags';
        box.appendChild(this.layer);
        this.items = new Map();   // building → item
        this.list = [];           // 이번에 후보인 item (중요한 순)
        this.pickT = 0;
        this.occT = 0;
        this.on = true;
    }

    reset() {
        for (const it of this.items.values()) it.el.remove();
        this.items.clear();
        this.list = [];
        this.pickT = 0;
    }

    setVisible(on) {
        if (on === this.on) return;
        this.on = on;
        this.layer.hidden = !on;
    }

    _item(b, target) {
        let it = this.items.get(b);
        if (it) return it;
        const el = document.createElement('div');
        el.className = 'smash-tag' + (b === target ? ' main' : '');
        el.textContent = b.name;
        el.style.display = 'none';
        this.layer.appendChild(el);
        it = { b, el, w: 0, h: 0, shown: false, x: -1, y: -1 };
        this.items.set(b, it);
        return it;
    }

    /** 0.3초마다: 카메라 근처의 이름 있는 건물을 중요한 순으로 고름. 같은 이름이 붙은 동은 가장 높은 것 하나만 */
    _pick(buildings, target, cx, cz, radius) {
        const best = new Map();
        for (const b of buildings) {
            // 이름 없거나 "1" "B동" 처럼 짧은 건 뺌
            if (!b.name || b.name.trim().length < 2 || /^[\d\s-]+$/.test(b.name) || b.state === 'rubble' || b.state === 'sinking') continue;
            if (b !== target && b.top < this.caps.minTop) continue;
            const d = Math.hypot(b.cx - cx, b.cz - cz);
            if (d > radius && b !== target) continue;
            const k = norm(b.name);
            const prev = best.get(k);
            if (prev && Math.hypot(prev.b.cx - b.cx, prev.b.cz - b.cz) < 80 && (prev.b === target || prev.b.top >= b.top)) continue;
            // 높고 가까울수록 먼저
            best.set(k, { b, p: b === target ? 1e9 : b.top * 2 + Math.sqrt(b.area || 0) - d * 0.35 });
        }
        const live = new Set();
        this.list = [...best.values()].sort((a, b) => b.p - a.p).slice(0, this.caps.max * 3).map(o => this._item(o.b, target));
        for (const it of this.list) live.add(it);
        // 후보에서 빠진 것은 지움 (DOM 을 무한히 늘리지 않게)
        for (const [b, it] of this.items) {
            if (!live.has(it)) { it.el.remove(); this.items.delete(b); }
        }
    }

    /**
     * 매 프레임: 화면 위치를 잡고 겹치면 숨김.
     * @param toScreen (x,y,z) → {x,y,behind}
     */
    update(dt, world, target, center, radius, toScreen, W, H, cam, avoid) {
        if (!this.on) return;
        this.pickT -= dt;
        if (this.pickT <= 0) {
            this.pickT = 0.3;
            this._pick(world.buildings, target, center.x, center.z, radius);
        }
        // 다른 건물 뒤에 가려진 이름표는 숨김 (0.15초마다 카메라 쪽으로 몇 걸음 짚어 봄)
        this.occT -= dt;
        if (this.occT <= 0) {
            this.occT = 0.15;
            for (const it of this.list) it.occ = it.b !== target && this._hidden(world, it.b, cam);
        }
        // 상사·말풍선 자리와 아래 무기 줄은 비워 둠
        const placed = avoid ? avoid.slice() : [];
        const bottom = H - this.caps.bottom;
        let n = 0;
        for (const it of this.list) {
            const b = it.b;
            // 거의 다 부서진 건물은 이름표를 뗌
            let show = n < this.caps.max && b.state !== 'rubble' && b.state !== 'sinking' && !(b.voxel && b.voxel.ratio() > 0.6);
            let s = null;
            if (show && it.occ) show = false;
            if (show) {
                const a = b === target ? this._front(b, cam) : null;
                s = a ? toScreen(a.x, b.top + 0.4, a.z) : toScreen(b.cx, b.top + 1.2, b.cz);
                show = !s.behind && s.x > -40 && s.x < W + 40 && s.y > 30 && s.y < bottom;
            }
            if (show) {
                if (!it.w) {
                    // 크기를 재려면 한 번 보여야 함. 아래에서 숨길지 다시 정함
                    it.el.style.display = '';
                    it.shown = true;
                    it.w = it.el.offsetWidth; it.h = it.el.offsetHeight;
                }
                // 화면 끝에서 잘리지 않게 안으로 밀어 넣음
                const x0 = Math.max(4, Math.min(W - it.w - 4, s.x - it.w / 2)), y0 = s.y - it.h - 6;
                const r = { x0: x0 - 3, y0: y0 - 2, x1: x0 + it.w + 3, y1: y0 + it.h + 2 };
                // 회사 건물은 늘 띄우고, 나머지는 앞선 이름표와 겹치면 숨김
                if (b !== target) for (const q of placed) if (r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0) { show = false; break; }
                if (show) {
                    placed.push(r);
                    n++;
                    const x = Math.round(x0), y = Math.round(y0);
                    if (x !== it.x || y !== it.y) { it.el.style.transform = `translate(${x}px, ${y}px)`; it.x = x; it.y = y; }
                }
            }
            if (show !== it.shown) {
                it.el.style.display = show ? '' : 'none';
                it.shown = show;
            }
        }
    }

    /** 지붕 위 점에서 카메라 쪽으로 가다 다른 건물 벽에 막히면 가려진 것 */
    _hidden(world, b, cam) {
        const ax = b.cx, ay = b.top + 1.2, az = b.cz;
        const dx = cam.x - ax, dy = cam.y - ay, dz = cam.z - az;
        const L = Math.hypot(dx, dy, dz);
        const n = Math.min(60, Math.floor(Math.min(L, 360) / 4));
        for (let i = 2; i <= n; i++) {
            const t = i * 4 / L;
            const x = ax + dx * t, y = ay + dy * t, z = az + dz * t;
            if (y > 400) break;
            if (world.blocked(x, y, z, null)) return true;
        }
        return false;
    }

    /** 회사 건물은 옥상 한가운데(상사 자리)를 가리지 않게 카메라 쪽 지붕 끝에 닮 */
    _front(b, cam) {
        const p = b.poly;
        let best = null, bd = Infinity;
        for (let i = 0; i < p.length; i += 2) {
            const j = (i + 2) % p.length;
            const mx = (p[i] + p[j]) / 2, mz = (p[i + 1] + p[j + 1]) / 2;
            const d = Math.hypot(mx - cam.x, mz - cam.z);
            if (d < bd) { bd = d; best = { x: mx, z: mz }; }
        }
        return best;
    }
}
