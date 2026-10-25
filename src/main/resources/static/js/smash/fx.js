import * as THREE from 'three';

const DUST_MAX = 1500;
const PAPER_MAX = 180;
const SHARD_MAX = 420;
const BLAST_MAX = 6;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function paperTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 88;
    const g = c.getContext('2d');
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, 64, 88);
    g.fillStyle = '#9aa3ad';
    for (let y = 14; y < 80; y += 8) g.fillRect(8, y, 36 + Math.random() * 14, 2);
    g.fillStyle = '#d33'; g.beginPath(); g.arc(50, 74, 7, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

export class FX {
    constructor(scene) {
        this.scene = scene;
        this._initDust();
        this._initPapers();
        this._initShards();
        this._initBlasts();
    }

    _initDust() {
        const geo = new THREE.BufferGeometry();
        this.dPos = new Float32Array(DUST_MAX * 3);
        this.dCol = new Float32Array(DUST_MAX * 3);
        this.dSize = new Float32Array(DUST_MAX);
        this.dAlpha = new Float32Array(DUST_MAX);
        this.dVel = new Float32Array(DUST_MAX * 3);
        this.dLife = new Float32Array(DUST_MAX);
        this.dMax = new Float32Array(DUST_MAX);
        this.dGrow = new Float32Array(DUST_MAX);
        this.dFire = new Uint8Array(DUST_MAX);
        this.dNext = 0;
        geo.setAttribute('position', new THREE.BufferAttribute(this.dPos, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aColor', new THREE.BufferAttribute(this.dCol, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aSize', new THREE.BufferAttribute(this.dSize, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.dAlpha, 1).setUsage(THREE.DynamicDrawUsage));
        this.dustMat = new THREE.ShaderMaterial({
            uniforms: { uScale: { value: 400 } },
            vertexShader: `
                attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
                uniform float uScale;
                varying float vA; varying vec3 vC;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
                    gl_Position = projectionMatrix * mv;
                    vA = aAlpha; vC = aColor;
                }`,
            fragmentShader: `
                varying float vA; varying vec3 vC;
                void main() {
                    vec2 c = gl_PointCoord - 0.5;
                    float d = length(c);
                    if (d > 0.5) discard;
                    gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.1, d));
                }`,
            transparent: true,
            depthWrite: false,
        });
        this.dustPoints = new THREE.Points(geo, this.dustMat);
        this.dustPoints.frustumCulled = false;
        this.dustPoints.renderOrder = 2;
        this.scene.add(this.dustPoints);
    }

    setScale(viewportHeightPx, fovDeg) {
        this.dustMat.uniforms.uScale.value = viewportHeightPx / (2 * Math.tan(fovDeg * Math.PI / 360));
    }

    _spawnDust(x, y, z, vx, vy, vz, size, life, r, g, b, fire = 0) {
        const i = this.dNext;
        this.dNext = (i + 1) % DUST_MAX;
        this.dPos[i * 3] = x; this.dPos[i * 3 + 1] = y; this.dPos[i * 3 + 2] = z;
        this.dVel[i * 3] = vx; this.dVel[i * 3 + 1] = vy; this.dVel[i * 3 + 2] = vz;
        this.dCol[i * 3] = r; this.dCol[i * 3 + 1] = g; this.dCol[i * 3 + 2] = b;
        this.dSize[i] = size;
        this.dGrow[i] = size * 1.2;
        this.dLife[i] = life; this.dMax[i] = life;
        this.dFire[i] = fire;
    }

    dust(x, y, z, n = 6, spread = 1, power = 1) {
        for (let k = 0; k < n; k++) {
            const s = 0.75 + Math.random() * 0.2;
            this._spawnDust(
                x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * 3 * power, Math.random() * 2 * power + 0.4, (Math.random() - 0.5) * 3 * power,
                1.2 + Math.random() * 1.6 * power, 1.2 + Math.random() * 1.4, s * 0.86, s * 0.82, s * 0.76);
        }
    }

    fire(x, y, z, n = 10, spread = 1, power = 1) {
        for (let k = 0; k < n; k++) {
            this._spawnDust(
                x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * 8 * power, Math.random() * 6 * power, (Math.random() - 0.5) * 8 * power,
                2 + Math.random() * 2.5 * power, 0.5 + Math.random() * 0.6, 1, 0.65 + Math.random() * 0.25, 0.2, 1);
        }
    }

    sparks(x, y, z, n = 4) {
        for (let k = 0; k < n; k++) {
            this._spawnDust(x, y, z, (Math.random() - 0.5) * 14, Math.random() * 9, (Math.random() - 0.5) * 14,
                0.25 + Math.random() * 0.3, 0.18 + Math.random() * 0.15, 1, 0.9, 0.5, 1);
        }
    }

    flame(x, y, z, vx, vy, vz, size) {
        this._spawnDust(x, y, z, vx + (Math.random() - 0.5) * 3, vy + Math.random() * 2, vz + (Math.random() - 0.5) * 3,
            size, 0.3 + Math.random() * 0.25, 1, 0.55 + Math.random() * 0.3, 0.15, 1);
    }

    swirl(x, y, z, r, n) {
        for (let k = 0; k < n; k++) {
            const a = Math.random() * Math.PI * 2, rr = r * (0.6 + Math.random() * 0.4);
            const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr, py = y + (Math.random() - 0.5) * r * 0.6;
            this._spawnDust(px, py, pz, -Math.sin(a) * 10 - Math.cos(a) * 6, (y - py) * 1.5, Math.cos(a) * 10 - Math.sin(a) * 6,
                0.8 + Math.random(), 0.6, 0.62, 0.4, 0.9);
        }
    }

    ring(x, y, z, R, color = 0xffffff) {
        const r = this.rings.find(r => !r.mesh.visible) || this.rings[0];
        r.mesh.position.set(x, y + 0.2, z);
        r.mesh.material.color.setHex(color);
        r.mesh.visible = true;
        r.t = 0; r.R = R; r.dur = 0.7;
    }

    _initPapers() {
        const geo = new THREE.PlaneGeometry(0.42, 0.58);
        const mat = new THREE.MeshLambertMaterial({ map: paperTexture(), side: THREE.DoubleSide });
        this.papers = new THREE.InstancedMesh(geo, mat, PAPER_MAX);
        this.papers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.papers.frustumCulled = false;
        this.pp = new Float32Array(PAPER_MAX * 3);
        this.pv = new Float32Array(PAPER_MAX * 3);
        this.pr = new Float32Array(PAPER_MAX * 3);
        this.pw = new Float32Array(PAPER_MAX * 3);
        this.pl = new Float32Array(PAPER_MAX);
        this.pNext = 0;
        for (let i = 0; i < PAPER_MAX; i++) {
            _m.makeScale(0, 0, 0);
            this.papers.setMatrixAt(i, _m);
        }
        this.scene.add(this.papers);
    }

    papersBurst(x, y, z, n = 6, power = 1) {
        for (let k = 0; k < n; k++) {
            const i = this.pNext;
            this.pNext = (i + 1) % PAPER_MAX;
            this.pp.set([x, y, z], i * 3);
            this.pv.set([(Math.random() - 0.5) * 9 * power, (Math.random() * 6 + 3) * power, (Math.random() - 0.5) * 9 * power], i * 3);
            this.pr.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
            this.pw.set([(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9], i * 3);
            this.pl[i] = 6 + Math.random() * 4;
        }
    }

    _initShards() {
        const geo = new THREE.TetrahedronGeometry(0.16);
        const mat = new THREE.MeshLambertMaterial({ color: 0xbfe3ff, emissive: 0x204060 });
        this.shards = new THREE.InstancedMesh(geo, mat, SHARD_MAX);
        this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.shards.frustumCulled = false;
        this.sp = new Float32Array(SHARD_MAX * 3);
        this.sv = new Float32Array(SHARD_MAX * 3);
        this.sr = new Float32Array(SHARD_MAX * 3);
        this.sl = new Float32Array(SHARD_MAX);
        this.sNext = 0;
        for (let i = 0; i < SHARD_MAX; i++) { _m.makeScale(0, 0, 0); this.shards.setMatrixAt(i, _m); }
        this.scene.add(this.shards);
    }

    glass(x, y, z, n = 6, dir = null, power = 1) {
        for (let k = 0; k < n; k++) {
            const i = this.sNext;
            this.sNext = (i + 1) % SHARD_MAX;
            this.sp.set([x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.8, z + (Math.random() - 0.5) * 0.8], i * 3);
            const dx = dir ? dir.x * 6 : 0, dz = dir ? dir.z * 6 : 0;
            this.sv.set([dx + (Math.random() - 0.5) * 10 * power, Math.random() * 6 * power, dz + (Math.random() - 0.5) * 10 * power], i * 3);
            this.sr.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
            this.sl[i] = 1.2 + Math.random() * 0.8;
        }
    }

    _initBlasts() {
        this.blasts = [];
        const geo = new THREE.SphereGeometry(1, 20, 14);
        for (let i = 0; i < BLAST_MAX; i++) {
            const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, depthWrite: false }));
            m.visible = false;
            this.scene.add(m);
            this.blasts.push({ mesh: m, t: 0, dur: 0, r: 0 });
        }
        this.rings = [];
        const rg = new THREE.RingGeometry(0.85, 1, 64);
        rg.rotateX(-Math.PI / 2);
        for (let i = 0; i < 4; i++) {
            const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
            m.visible = false;
            this.scene.add(m);
            this.rings.push({ mesh: m, t: 0, R: 1, dur: 0.7 });
        }
        this.light = new THREE.PointLight(0xffaa55, 0, 80, 1.4);
        this.scene.add(this.light);
        this.lightT = 0;
    }

    blast(x, y, z, r, color = 0xffb347) {
        const b = this.blasts.find(b => !b.mesh.visible) || this.blasts[0];
        b.mesh.position.set(x, y, z);
        b.mesh.material.color.setHex(color);
        b.mesh.visible = true;
        b.t = 0; b.dur = 0.38; b.r = r;
        this.light.position.set(x, y + 1, z);
        this.light.intensity = 60 * r;
        this.lightT = 0.35;
        this.fire(x, y, z, Math.round(10 + r * 6), r * 0.5, r / 3);
        this.dust(x, y, z, Math.round(8 + r * 4), r, r / 3);
    }

    update(dt) {
        // 먼지·불
        for (let i = 0; i < DUST_MAX; i++) {
            if (this.dLife[i] <= 0) { this.dAlpha[i] = 0; continue; }
            this.dLife[i] -= dt;
            const k = Math.max(this.dLife[i] / this.dMax[i], 0);
            const i3 = i * 3;
            const drag = this.dFire[i] ? 3.5 : 1.6;
            this.dVel[i3] *= 1 - drag * dt; this.dVel[i3 + 2] *= 1 - drag * dt;
            this.dVel[i3 + 1] = this.dVel[i3 + 1] * (1 - drag * dt) + (this.dFire[i] ? 2.5 : 0.6) * dt;
            this.dPos[i3] += this.dVel[i3] * dt; this.dPos[i3 + 1] += this.dVel[i3 + 1] * dt; this.dPos[i3 + 2] += this.dVel[i3 + 2] * dt;
            this.dSize[i] += this.dGrow[i] * dt;
            if (this.dFire[i]) {
                // 불꽃 → 연기로 식는다
                this.dCol[i3] = 0.35 + 0.65 * k; this.dCol[i3 + 1] = 0.3 + 0.4 * k * k; this.dCol[i3 + 2] = 0.28 + 0.0 * k;
                this.dAlpha[i] = Math.min(1, k * 1.6) * 0.9;
            } else {
                this.dAlpha[i] = Math.min(1, k * 2) * 0.55;
            }
        }
        const ga = this.dustPoints.geometry.attributes;
        ga.position.needsUpdate = ga.aColor.needsUpdate = ga.aSize.needsUpdate = ga.aAlpha.needsUpdate = true;

        // 서류
        for (let i = 0; i < PAPER_MAX; i++) {
            if (this.pl[i] <= 0) continue;
            this.pl[i] -= dt;
            const i3 = i * 3;
            const p = this.pp, v = this.pv;
            if (p[i3 + 1] > 0.02) {
                v[i3 + 1] -= 4.5 * dt;
                const drag = 1 - 1.6 * dt;
                v[i3] *= drag; v[i3 + 1] *= v[i3 + 1] < 0 ? 1 - 2.8 * dt : drag; v[i3 + 2] *= drag;
                v[i3] += Math.sin(this.pl[i] * 3 + i) * 2.2 * dt;
                p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
                this.pr[i3] += this.pw[i3] * dt; this.pr[i3 + 1] += this.pw[i3 + 1] * dt; this.pr[i3 + 2] += this.pw[i3 + 2] * dt;
            } else {
                p[i3 + 1] = 0.02; this.pr[i3] = -Math.PI / 2; this.pr[i3 + 2] = 0;
            }
            const s = this.pl[i] < 0.6 ? Math.max(this.pl[i], 0) / 0.6 : 1;
            _e.set(this.pr[i3], this.pr[i3 + 1], this.pr[i3 + 2]);
            _m.compose(_p.set(p[i3], p[i3 + 1], p[i3 + 2]), _q.setFromEuler(_e), _s.set(s, s, s));
            this.papers.setMatrixAt(i, _m);
        }
        this.papers.instanceMatrix.needsUpdate = true;

        // 유리 조각
        for (let i = 0; i < SHARD_MAX; i++) {
            if (this.sl[i] <= 0) continue;
            this.sl[i] -= dt;
            const i3 = i * 3;
            const p = this.sp, v = this.sv;
            v[i3 + 1] -= 22 * dt;
            p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
            if (p[i3 + 1] < 0.05) { p[i3 + 1] = 0.05; v[i3 + 1] *= -0.3; v[i3] *= 0.5; v[i3 + 2] *= 0.5; }
            this.sr[i3] += 9 * dt; this.sr[i3 + 1] += 7 * dt;
            const s = this.sl[i] > 0 ? Math.min(1, this.sl[i] * 2) : 0;
            _e.set(this.sr[i3], this.sr[i3 + 1], this.sr[i3 + 2]);
            _m.compose(_p.set(p[i3], p[i3 + 1], p[i3 + 2]), _q.setFromEuler(_e), _s.set(s, s, s));
            this.shards.setMatrixAt(i, _m);
        }
        this.shards.instanceMatrix.needsUpdate = true;

        for (const b of this.blasts) {
            if (!b.mesh.visible) continue;
            b.t += dt;
            const k = b.t / b.dur;
            if (k >= 1) { b.mesh.visible = false; continue; }
            const e = 1 - Math.pow(1 - k, 3);
            b.mesh.scale.setScalar(0.3 + b.r * e);
            b.mesh.material.opacity = 1 - k;
        }
        for (const r of this.rings) {
            if (!r.mesh.visible) continue;
            r.t += dt;
            const k = r.t / r.dur;
            if (k >= 1) { r.mesh.visible = false; continue; }
            r.mesh.scale.setScalar(1 + r.R * (1 - Math.pow(1 - k, 2)));
            r.mesh.material.opacity = 0.9 * (1 - k);
        }
        if (this.lightT > 0) {
            this.lightT -= dt;
            this.light.intensity *= Math.pow(0.002, dt);
            if (this.lightT <= 0) this.light.intensity = 0;
        }
    }
}
