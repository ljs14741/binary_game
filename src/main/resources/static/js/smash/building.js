import * as THREE from 'three';
import { TYPE, IS_GLASS, VALUE } from './voxelize.js';

// 블록 건물. 처음엔 격자에 박혀(attached) 있고, 맞거나 받침을 잃으면 떨어져(dynamic) 굴러다니다 멈춘다(sleep).
// 위치 단위는 월드 칸, 블록 한 변 = vs.
const ATTACHED = 0, DYNAMIC = 1, SLEEP = 2, GONE = 3;
const GRAV = -26;
const SPAN = 3;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _glow = new THREE.Color(0xff5a14);

export class VoxelBuilding {
    /**
     * @param world  surface(x,y,z,self) / blocked(x,y,z,self) / ground 를 가진 월드
     * @param spec   voxelize() 결과
     * @param pal    palette() 결과
     */
    constructor(world, spec, pal, meta) {
        this.world = world;
        this.meta = meta;
        this.pal = pal;
        Object.assign(this, { W: spec.W, H: spec.H, D: spec.D, ox: spec.ox, oz: spec.oz, vs: spec.vs });
        this.roofTop = spec.roofTop;
        const N = this.N = spec.count;
        this.gx = new Int16Array(N); this.gy = new Int16Array(N); this.gz = new Int16Array(N);
        this.type = new Uint8Array(N); this.state = new Uint8Array(N);
        this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3);
        this.quat = new Float32Array(N * 4); this.ang = new Float32Array(N * 3);
        this.age = new Float32Array(N); this.restOn = new Int32Array(N); this.restCell = new Float64Array(N);
        this.burn = new Float32Array(N);
        this.burning = new Set();
        this.grid = new Int32Array(this.W * this.H * this.D).fill(-1);
        this.shatter = [];
        this.embers = [];
        this.lost = 0;
        this.dynamicCount = 0;
        this.supportDirty = false;
        this.bbox = { minx: this.ox, maxx: this.ox + this.W * this.vs, minz: this.oz, maxz: this.oz + this.D * this.vs, maxy: this.H * this.vs };

        const geo = new THREE.BoxGeometry(this.vs, this.vs, this.vs);
        this.mesh = new THREE.InstancedMesh(geo, world.blockMaterial, N);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.frustumCulled = false;
        this.mesh.userData.voxel = this;
        const vs = this.vs;
        for (let i = 0; i < N; i++) {
            const x = spec.cells[i * 4], y = spec.cells[i * 4 + 1], z = spec.cells[i * 4 + 2], t = spec.cells[i * 4 + 3];
            this.gx[i] = x; this.gy[i] = y; this.gz[i] = z; this.type[i] = t;
            this.grid[this._idx(x, y, z)] = i;
            this.pos[i * 3] = this.ox + (x + 0.5) * vs;
            this.pos[i * 3 + 1] = (y + 0.5) * vs;
            this.pos[i * 3 + 2] = this.oz + (z + 0.5) * vs;
            this.quat[i * 4 + 3] = 1;
            this.restOn[i] = -1; this.restCell[i] = -1;
            _c.setHex(pal.colors[t]);
            _c.offsetHSL(0, 0, (Math.random() - 0.5) * (IS_GLASS[t] ? 0.12 : 0.05));
            this.mesh.setColorAt(i, _c);
            this._write(i);
        }
        this.mesh.instanceColor.needsUpdate = true;
        world.scene.add(this.mesh);
        this.valueScale = vs * vs;
    }

    dispose() {
        this.world.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.dispose();
    }

    _idx(x, y, z) { return (y * this.D + z) * this.W + x; }

    cellAt(wx, wy, wz) {
        const x = Math.floor((wx - this.ox) / this.vs), y = Math.floor(wy / this.vs), z = Math.floor((wz - this.oz) / this.vs);
        if (x < 0 || x >= this.W || y < 0 || y >= this.H || z < 0 || z >= this.D) return -1;
        return this.grid[this._idx(x, y, z)];
    }

    /** 이 기둥에서 y 아래로 가장 가까운 붙은 블록의 윗면. 없으면 -1 */
    topBelow(wx, wy, wz) {
        const x = Math.floor((wx - this.ox) / this.vs), z = Math.floor((wz - this.oz) / this.vs);
        if (x < 0 || x >= this.W || z < 0 || z >= this.D) return -1;
        let y = Math.min(this.H - 1, Math.floor(wy / this.vs));
        for (; y >= 0; y--) {
            if (this.grid[this._idx(x, y, z)] >= 0) return (y + 1) * this.vs;
        }
        return -1;
    }

    isAttached(i) { return i >= 0 && this.state[i] === ATTACHED; }

    _write(i) {
        if (this.state[i] === GONE) {
            _m.compose(_v.set(0, -500, 0), _q.set(0, 0, 0, 1), _s.set(0, 0, 0));
        } else {
            const p = this.pos, q = this.quat;
            _m.compose(_v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]),
                _q.set(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]), _s.set(1, 1, 1));
        }
        this.mesh.setMatrixAt(i, _m);
    }

    _unrest(i) {
        if (this.restCell[i] >= 0) this.world.ground.remove(this.restCell[i], this.vs * 0.5);
        this.restCell[i] = -1;
        this.restOn[i] = -1;
    }

    _detachGrid(i) {
        this.grid[this._idx(this.gx[i], this.gy[i], this.gz[i])] = -1;
        this.lost++;
        this.supportDirty = true;
        if (this.burn[i] > 0) { this.burn[i] = 0; this.burning.delete(i); }
    }

    _setDynamic(i, vx, vy, vz, spin) {
        const st = this.state[i];
        if (st === ATTACHED) this._detachGrid(i);
        else if (st === SLEEP) this._unrest(i);
        if (st !== DYNAMIC) this.dynamicCount++;
        this.state[i] = DYNAMIC;
        this.age[i] = 0;
        this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
        this.ang[i * 3] = (Math.random() - 0.5) * spin;
        this.ang[i * 3 + 1] = (Math.random() - 0.5) * spin;
        this.ang[i * 3 + 2] = (Math.random() - 0.5) * spin;
    }

    _destroy(i) {
        const st = this.state[i];
        if (st === ATTACHED) this._detachGrid(i);
        else if (st === SLEEP) this._unrest(i);
        else if (st === DYNAMIC) this.dynamicCount--;
        this.state[i] = GONE;
        this._write(i);
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    ratio() { return this.lost / this.N; }

    /** 폭발·타격. 반환: {value(억), blocks, glass[], chunks[], windows[]} */
    impact(p, radius, force, dir, vaporize, out) {
        const r2 = radius * radius;
        const P = this.pos;
        const vs = this.vs;
        for (let i = 0; i < this.N; i++) {
            const st = this.state[i];
            if (st === GONE) continue;
            const dx = P[i * 3] - p.x, dy = P[i * 3 + 1] - p.y, dz = P[i * 3 + 2] - p.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            const rr = radius + vs * 0.5;
            if (d2 > rr * rr) continue;
            const d = Math.sqrt(d2) || 0.001;
            const k = Math.max(0, 1 - d / rr);
            const t = this.type[i];
            if (st === ATTACHED) {
                out.value += VALUE[t] * this.valueScale;
                out.blocks++;
                if (!IS_GLASS[t] && t !== TYPE.ROOF && this.gy[i] % 2 === 1 && Math.random() < 0.12) out.windows.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
            } else out.value += 0.01;
            if (st === ATTACHED && IS_GLASS[t]) {
                out.glass.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
                this._destroy(i);
                continue;
            }
            if (vaporize && d < radius * 0.4 && Math.random() < vaporize) {
                out.chunks.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
                this._destroy(i);
                continue;
            }
            const f = force * (0.35 + k) * (0.6 + Math.random() * 0.6);
            const vx = dx / d * f + dir.x * force * 0.35 * k + (Math.random() - 0.5) * 2;
            const vy = dy / d * f + force * 0.3 * k + Math.random() * 2;
            const vz = dz / d * f + dir.z * force * 0.35 * k + (Math.random() - 0.5) * 2;
            if (st === ATTACHED && Math.random() < 0.3) out.chunks.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
            this._setDynamic(i, vx, vy, vz, (6 + force * 0.4) / vs);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /** 반경 안 블록에 불을 붙인다. 반환: 새로 붙은 수 */
    ignite(p, radius) {
        let n = 0;
        const r2 = (radius + this.vs * 0.5) ** 2;
        for (let i = 0; i < this.N; i++) {
            if (this.state[i] !== ATTACHED || this.burn[i] > 0) continue;
            const dx = this.pos[i * 3] - p.x, dy = this.pos[i * 3 + 1] - p.y, dz = this.pos[i * 3 + 2] - p.z;
            if (dx * dx + dy * dy + dz * dz > r2) continue;
            this._light(i);
            n++;
        }
        return n;
    }

    _light(i) {
        if (this.burning.size > 260) return;
        this.burn[i] = 1.6 + Math.random() * 2.2;
        this.burning.add(i);
    }

    /** 불: 타는 블록은 옆으로 번지고, 다 타면 그을려 떨어진다. 반환: 타서 떨어진 블록 피해액 */
    stepFire(dt) {
        if (!this.burning.size) return 0;
        let value = 0;
        this.embers.length = 0;
        const now = performance.now() / 1000;
        for (const i of this.burning) {
            this.burn[i] -= dt;
            // 타는 동안 벌겋게 달아 깜빡임
            _c.setHex(this.pal.colors[this.type[i]]).lerp(_glow, 0.55 + 0.3 * Math.sin(now * 17 + i * 1.7));
            this.mesh.setColorAt(i, _c);
            if (Math.random() < dt * 5) this.embers.push(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
            if (Math.random() < dt * 0.9) {
                const x = this.gx[i], y = this.gy[i], z = this.gz[i];
                const k = Math.floor(Math.random() * 6);
                const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][k];
                const a = x + nb[0], b = y + nb[1], c = z + nb[2];
                if (a >= 0 && a < this.W && b >= 0 && b < this.H && c >= 0 && c < this.D) {
                    const j = this.grid[this._idx(a, b, c)];
                    if (j >= 0 && this.burn[j] <= 0) this._light(j);
                }
            }
            if (this.burn[i] <= 0) {
                this.burning.delete(i);
                this.burn[i] = 0;
                value += VALUE[this.type[i]] * this.valueScale;
                _c.setHex(0x2a2522).offsetHSL(0, 0, Math.random() * 0.08);
                this.mesh.setColorAt(i, _c);
                this.mesh.instanceColor.needsUpdate = true;
                if (IS_GLASS[this.type[i]]) {
                    this.shatter.push(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
                    this._destroy(i);
                } else this._setDynamic(i, (Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2, 2);
            }
        }
        this.mesh.instanceColor.needsUpdate = true;
        return value;
    }

    /**
     * 하중 검사. 버팀 거리 = 땅까지 곧게 내려가는 기둥에서 옆으로 몇 칸 떨어졌나.
     * 위로 가면 그대로, 옆·아래로 가면 1 늘어난다. SPAN 을 넘으면 무너진다.
     * 단순 연결 검사만 하면 1층을 다 뚫어도 외벽 한 줄에 위층 전체가 매달려 버틴다.
     */
    updateSupport() {
        this.supportDirty = false;
        const { N, W, D, H, grid } = this;
        const cost = new Uint8Array(N).fill(255);
        const buckets = [];
        for (let k = 0; k <= SPAN; k++) buckets.push([]);
        for (let i = 0; i < N; i++) {
            if (this.state[i] === ATTACHED && this.gy[i] === 0) { cost[i] = 0; buckets[0].push(i); }
        }
        const visit = (a, b, c, nc) => {
            if (a < 0 || a >= W || b < 0 || b >= H || c < 0 || c >= D || nc > SPAN) return;
            const j = grid[this._idx(a, b, c)];
            if (j >= 0 && nc < cost[j]) { cost[j] = nc; buckets[nc].push(j); }
        };
        for (let k = 0; k <= SPAN; k++) {
            const q = buckets[k];
            for (let h = 0; h < q.length; h++) {
                const i = q[h];
                if (cost[i] !== k) continue;
                const x = this.gx[i], y = this.gy[i], z = this.gz[i];
                visit(x, y + 1, z, k);
                visit(x + 1, y, z, k + 1); visit(x - 1, y, z, k + 1);
                visit(x, y, z + 1, k + 1); visit(x, y, z - 1, k + 1);
                visit(x, y - 1, z, k + 1);
            }
        }
        const drop = [];
        let value = 0;
        for (let i = 0; i < N; i++) if (this.state[i] === ATTACHED && cost[i] === 255) drop.push(i);
        let cx = 0, cz = 0;
        for (const i of drop) { cx += this.pos[i * 3]; cz += this.pos[i * 3 + 2]; }
        if (drop.length) { cx /= drop.length; cz /= drop.length; }
        for (const i of drop) {
            value += VALUE[this.type[i]] * this.valueScale;
            const ox = this.pos[i * 3] - cx, oz = this.pos[i * 3 + 2] - cz;
            this._setDynamic(i, ox * 0.15 + (Math.random() - 0.5) * 1.2, -0.5 - Math.random(), oz * 0.15 + (Math.random() - 0.5) * 1.2, 1.2 / this.vs);
        }
        for (let i = 0; i < N; i++) {
            if (this.state[i] === SLEEP && this.restOn[i] >= 0 && this.state[this.restOn[i]] !== ATTACHED) this._setDynamic(i, 0, 0, 0, 1);
        }
        if (drop.length) this.mesh.instanceMatrix.needsUpdate = true;
        return { count: drop.length, value, drop };
    }

    /** 반환: 땅에 세게 닿은 위치들 [x,y,z,속도,...] */
    step(dt, landings) {
        this.shatter.length = 0;
        if (this.dynamicCount === 0) return;
        const P = this.pos, V = this.vel, Q = this.quat, A = this.ang;
        const vs = this.vs, half = vs * 0.5;
        const ground = this.world.ground;
        for (let i = 0; i < this.N; i++) {
            if (this.state[i] !== DYNAMIC) continue;
            const i3 = i * 3;
            this.age[i] += dt;
            V[i3 + 1] += GRAV * dt;
            const px = P[i3], py = P[i3 + 1], pz = P[i3 + 2];
            let nx = px + V[i3] * dt, ny = py + V[i3 + 1] * dt, nz = pz + V[i3 + 2] * dt;

            if (ny < -20) { this._destroy(i); continue; }

            const t = this.type[i];
            const hit = this.cellAt(nx, ny - half * 0.9, nz);
            const surf = this.world.surface(nx, py, nz, this);
            if (IS_GLASS[t] && (hit >= 0 || ny - half < surf)) {
                // 무너지며 떨어진 유리는 닿는 순간 깨진다
                this.shatter.push(nx, ny, nz);
                this._destroy(i);
                continue;
            }
            if (hit >= 0) {
                const top = (this.gy[hit] + 1) * vs;
                if (py - half >= top - vs * 0.35 && V[i3 + 1] <= 0) {
                    ny = top + half;
                    if (V[i3 + 1] < -6) {
                        landings.push(nx, top, nz, -V[i3 + 1]);
                        V[i3 + 1] *= -0.2; V[i3] *= 0.5; V[i3 + 2] *= 0.5;
                    } else this._sleep(i, -1, hit);
                } else {
                    nx = px; nz = pz;
                    V[i3] *= -0.25; V[i3 + 2] *= -0.25;
                }
            } else if (this.world.blocked(nx, ny, nz, this)) {
                nx = px; nz = pz;
                V[i3] *= -0.3; V[i3 + 2] *= -0.3;
            }

            if (this.state[i] === DYNAMIC && ny - half < surf) {
                ny = surf + half;
                const vy = V[i3 + 1];
                if (vy < -5) {
                    landings.push(nx, surf, nz, -vy);
                    V[i3 + 1] = -vy * 0.22;
                    V[i3] *= 0.6; V[i3 + 2] *= 0.6;
                    A[i3] *= 0.6; A[i3 + 1] *= 0.6; A[i3 + 2] *= 0.6;
                } else {
                    V[i3 + 1] = 0;
                    V[i3] *= 0.82; V[i3 + 2] *= 0.82;
                    if (V[i3] * V[i3] + V[i3 + 2] * V[i3 + 2] < 2.5) {
                        const onGround = surf <= ground.height(nx, nz) + 0.01;
                        const slide = onGround ? ground.slide(nx, nz, surf, 0.75 * vs) : null;
                        if (slide) { V[i3] = slide[0] * 3; V[i3 + 2] = slide[1] * 3; V[i3 + 1] = 1.5; }
                        else this._sleep(i, onGround ? ground.index(nx, nz) : -1, -1);
                    }
                }
            }
            if (this.age[i] > 7 && this.state[i] === DYNAMIC) this._sleep(i, ground.index(nx, nz), -1);

            P[i3] = nx; P[i3 + 1] = ny; P[i3 + 2] = nz;
            if (this.state[i] === DYNAMIC) {
                const ax = A[i3], ay = A[i3 + 1], az = A[i3 + 2];
                const w = Math.sqrt(ax * ax + ay * ay + az * az);
                if (w > 0.01) {
                    _v.set(ax / w, ay / w, az / w);
                    _dq.setFromAxisAngle(_v, w * dt);
                    _q.set(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]).premultiply(_dq);
                    Q[i * 4] = _q.x; Q[i * 4 + 1] = _q.y; Q[i * 4 + 2] = _q.z; Q[i * 4 + 3] = _q.w;
                }
            }
            this._write(i);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    _sleep(i, cell, onBlock) {
        this.state[i] = SLEEP;
        this.dynamicCount--;
        this.vel.fill(0, i * 3, i * 3 + 3);
        this.restOn[i] = onBlock;
        this.restCell[i] = -1;
        if (cell >= 0 && onBlock < 0) {
            this.world.ground.add(cell, this.vs * 0.5);
            this.restCell[i] = cell;
        }
    }

    /** 블랙홀: 중심으로 끌어당긴다. 붙은 블록은 가까울수록 뜯겨 나온다 */
    pull(p, radius, strength, dt) {
        const r2 = radius * radius;
        for (let i = 0; i < this.N; i++) {
            const st = this.state[i];
            if (st === GONE) continue;
            const dx = p.x - this.pos[i * 3], dy = p.y - this.pos[i * 3 + 1], dz = p.z - this.pos[i * 3 + 2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > r2) continue;
            const d = Math.sqrt(d2) || 0.01;
            if (st === ATTACHED) {
                if (Math.random() > dt * 3 * (1 - d / radius)) continue;
                this._setDynamic(i, 0, 2, 0, 4);
            } else if (st === SLEEP) this._setDynamic(i, 0, 2, 0, 4);
            const k = strength * (1.2 - d / radius) * dt;
            this.vel[i * 3] += dx / d * k - dz / d * k * 0.8;
            this.vel[i * 3 + 1] += dy / d * k + 26 * dt * 0.9;
            this.vel[i * 3 + 2] += dz / d * k + dx / d * k * 0.8;
            if (d < 1.2) {
                this.vel[i * 3] *= 0.7; this.vel[i * 3 + 1] *= 0.7; this.vel[i * 3 + 2] *= 0.7;
            }
        }
    }

    /** 사장님·간판 받침 판정용 */
    centerOfRemaining(out) {
        let n = 0, x = 0, y = 0, z = 0;
        for (let i = 0; i < this.N; i += 3) {
            if (this.state[i] !== ATTACHED) continue;
            x += this.pos[i * 3]; y += this.pos[i * 3 + 1]; z += this.pos[i * 3 + 2]; n++;
        }
        return n ? out.set(x / n, y / n, z / n) : null;
    }
}
