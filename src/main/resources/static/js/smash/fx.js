import * as THREE from 'three';

const DUST_MAX = 1500;
const PAPER_MAX = 180;
const SHARD_MAX = 420;
const CHUNK_MAX = 360;
const BLAST_MAX = 6;
const POW_FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

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

/** 부드러운 덩어리 무늬 (불·연기 공용). 가운데가 진하고 가장자리가 울퉁불퉁 */
function puffTexture() {
    const S = 64, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    for (let k = 0; k < 7; k++) {
        const a = Math.random() * Math.PI * 2, r = k ? 6 + Math.random() * 9 : 0;
        const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, R = k ? 12 + Math.random() * 8 : 26;
        const gr = g.createRadialGradient(x, y, 0, x, y, R);
        gr.addColorStop(0, 'rgba(255,255,255,' + (k ? 0.55 : 0.9) + ')');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, S, S);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
}

/**
 * 불꽃·연기 입자 한 층. fire: 더해 그리기(빛남) + 나이에 따라 흰빛→주황→빨강으로 식음.
 * smoke: 보통 그리기, 어두운 회색이 커지며 옅어짐
 */
class PuffLayer {
    constructor(scene, max, tex, fire) {
        this.max = max; this.fire = fire; this.next = 0;
        this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
        this.size = new Float32Array(max); this.grow = new Float32Array(max);
        this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
        this.age = new Float32Array(max); this.alpha = new Float32Array(max);
        this.rot = new Float32Array(max); this.shade = new Float32Array(max);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aShade', new THREE.BufferAttribute(this.shade, 1).setUsage(THREE.DynamicDrawUsage));
        this.mat = new THREE.ShaderMaterial({
            uniforms: { uScale: { value: 400 }, map: { value: tex } },
            vertexShader: `
                attribute float aSize; attribute float aAge; attribute float aAlpha; attribute float aRot; attribute float aShade;
                uniform float uScale;
                varying float vAge; varying float vA; varying float vR; varying float vS;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
                    gl_Position = projectionMatrix * mv;
                    vAge = aAge; vA = aAlpha; vR = aRot; vS = aShade;
                }`,
            fragmentShader: fire ? `
                uniform sampler2D map;
                varying float vAge; varying float vA; varying float vR; varying float vS;
                void main() {
                    vec2 c = gl_PointCoord - 0.5;
                    float s = sin(vR), k = cos(vR);
                    c = mat2(k, -s, s, k) * c;
                    float t = texture2D(map, c + 0.5).a;
                    vec3 col = mix(vec3(1.0, 0.93, 0.7), vec3(1.0, 0.52, 0.1), smoothstep(0.0, 0.35, vAge));
                    col = mix(col, vec3(0.8, 0.16, 0.03), smoothstep(0.35, 0.85, vAge));
                    float a = t * vA * (1.0 - smoothstep(0.55, 1.0, vAge));
                    gl_FragColor = vec4(col * (0.75 + 0.5 * vS), a);
                }` : `
                uniform sampler2D map;
                varying float vAge; varying float vA; varying float vR; varying float vS;
                void main() {
                    vec2 c = gl_PointCoord - 0.5;
                    float s = sin(vR), k = cos(vR);
                    c = mat2(k, -s, s, k) * c;
                    float t = texture2D(map, c + 0.5).a;
                    float a = t * vA * smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.45, 1.0, vAge));
                    // shade 가 1 보다 크면 불빛을 받아 주황으로 달아오른 연기 (버섯구름 갓)
                    vec3 col = vS > 1.0 ? mix(vec3(0.42, 0.38, 0.36), vec3(1.0, 0.55, 0.22), min(1.0, vS - 1.0) * (1.0 - vAge)) : vec3(vS);
                    gl_FragColor = vec4(col, a);
                }`,
            transparent: true,
            depthWrite: false,
            blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        this.points = new THREE.Points(geo, this.mat);
        this.points.frustumCulled = false;
        this.points.renderOrder = fire ? 4 : 3;
        scene.add(this.points);
        this.live = 0;
    }

    spawn(x, y, z, vx, vy, vz, size, life, alpha = 1, shade = 0.5, grow = 1) {
        const i = this.next;
        this.next = (i + 1) % this.max;
        const i3 = i * 3;
        this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
        this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
        this.size[i] = size; this.grow[i] = size * grow;
        this.life[i] = life; this.maxLife[i] = life;
        this.alpha[i] = alpha; this.shade[i] = shade;
        this.rot[i] = Math.random() * 6.28;
        this.age[i] = 0;
    }

    update(dt, time) {
        const buoy = this.fire ? 7 : 2.2, drag = this.fire ? 2.2 : 0.9;
        let live = 0;
        for (let i = 0; i < this.max; i++) {
            if (this.life[i] <= 0) { if (this.age[i] < 1) { this.age[i] = 1; this.size[i] = 0; } continue; }
            live++;
            this.life[i] -= dt;
            const i3 = i * 3;
            const v = this.vel;
            // 위로 뜨고, 살짝 흔들리며 퍼짐
            v[i3] = v[i3] * (1 - drag * dt) + Math.sin(time * 3 + i) * 1.2 * dt;
            v[i3 + 2] = v[i3 + 2] * (1 - drag * dt) + Math.cos(time * 2.6 + i * 1.7) * 1.2 * dt;
            v[i3 + 1] = v[i3 + 1] * (1 - drag * dt) + buoy * dt;
            this.pos[i3] += v[i3] * dt; this.pos[i3 + 1] += v[i3 + 1] * dt; this.pos[i3 + 2] += v[i3 + 2] * dt;
            this.size[i] += this.grow[i] * dt;
            this.rot[i] += (i % 2 ? 0.8 : -0.8) * dt;
            this.age[i] = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
        }
        this.live = live;
        const a = this.points.geometry.attributes;
        a.position.needsUpdate = a.aSize.needsUpdate = a.aAge.needsUpdate = a.aAlpha.needsUpdate = a.aRot.needsUpdate = a.aShade.needsUpdate = true;
    }
}

/**
 * 버섯구름 덩어리 (한 구름 = Points 하나). 덩어리마다 자리(기둥/갓/바닥 고리)가 정해져 있고
 * 시간에 따라 기둥이 자라고 갓이 떠오르며 넓어지고 안쪽으로 말려 돎. 처음엔 불빛에 달아오른 주황, 식으면 회갈색.
 */
class MushroomCloud {
    constructor(scene, tex, n) {
        this.n = n;
        this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
        this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.rot = new Float32Array(n);
        this.kind = new Uint8Array(n); this.u = new Float32Array(n); this.v = new Float32Array(n); this.w = new Float32Array(n); this.r = new Float32Array(n);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1));
        this.mat = new THREE.ShaderMaterial({
            uniforms: { uScale: { value: 400 }, map: { value: tex } },
            vertexShader: `
                attribute float aSize; attribute float aAlpha; attribute float aRot; attribute vec3 aColor;
                uniform float uScale;
                varying float vA; varying float vR; varying vec3 vC;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = min(aSize * uScale / max(-mv.z, 0.1), 900.0);
                    gl_Position = projectionMatrix * mv;
                    vA = aAlpha; vR = aRot; vC = aColor;
                }`,
            fragmentShader: `
                uniform sampler2D map;
                varying float vA; varying float vR; varying vec3 vC;
                void main() {
                    vec2 c = gl_PointCoord - 0.5;
                    float s = sin(vR), k = cos(vR);
                    vec2 q = mat2(k, -s, s, k) * c;
                    float t = texture2D(map, q + 0.5).a;
                    // 위쪽이 밝고 아래쪽이 어두운 뭉게구름 음영
                    float lit = 0.68 + 0.6 * (0.5 - c.y);
                    gl_FragColor = vec4(vC * lit, t * vA);
                }`,
            transparent: true,
            depthWrite: false,
        });
        this.points = new THREE.Points(geo, this.mat);
        this.points.frustumCulled = false;
        this.points.renderOrder = 3;
        this.points.visible = false;
        scene.add(this.points);
        this.capY = 0;
    }

    start(x, y, z, s, height = 0) {
        this.x = x; this.y = y; this.z = z; this.s = s;
        // 갓 높이: 크기에 비례하되, 옆 건물보다 확실히 위로 솟게
        this.H = Math.max(48 * s, height * 1.5);
        const n = this.n;
        // 0 기둥 18%, 1 갓 도넛 52%, 2 갓 윗부분 12%, 3 바닥 먼지 고리 18%
        for (let i = 0; i < n; i++) {
            const f = i / n;
            this.kind[i] = f < 0.18 ? 0 : f < 0.7 ? 1 : f < 0.82 ? 2 : 3;
            this.u[i] = Math.random() * Math.PI * 2;
            this.v[i] = Math.random();
            this.w[i] = Math.random() * Math.PI * 2;
            this.r[i] = 0.75 + Math.random() * 0.5;
            this.rot[i] = Math.random() * 6.28;
        }
        this.points.geometry.attributes.aRot.needsUpdate = true;
        this.points.visible = true;
    }

    update(dt, t) {
        const s = this.s, n = this.n;
        const ease = k => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
        const H = this.H;
        const capY = this.y + 6 * s + H * ease(t / 4.5);
        this.capY = capY;
        // 갓 크기도 높이에 맞춰 (높이가 크면 갓도 큼)
        const k = H / (48 * s);
        const Rc = (5 + 11 * ease(t / 4.5)) * s * Math.sqrt(k), rc = (4 + 4 * ease(t / 3)) * s * Math.sqrt(k);
        const roll = t * 0.7;
        const heat = Math.max(0, 1 - t / 3.2);
        const fade = t < 8 ? 1 : Math.max(0, 1 - (t - 8) / 3);
        const appear = Math.min(1, t / 0.35);
        for (let i = 0; i < n; i++) {
            const k = this.kind[i], u = this.u[i], v = this.v[i], i3 = i * 3;
            let x, y, z, size, a = 0.85, hot;
            if (k === 0) {
                // 기둥: 위로 갈수록 살짝 굵어지고 천천히 꼬이며 올라감
                const h = v * (capY - this.y - rc * 0.5);
                const rr = (3 + 2.4 * v) * s * Math.sqrt(k) * this.r[i];
                const ang = u + t * 0.5 + v * 2;
                x = this.x + Math.cos(ang) * rr; z = this.z + Math.sin(ang) * rr; y = this.y + h;
                size = (6 + 3 * v) * s * Math.sqrt(k); hot = heat * (0.6 + 0.4 * v);
                a *= Math.min(1, (capY - this.y) / (6 * s) + 0.2);
            } else if (k === 1) {
                // 갓 도넛: 둘레로 돌며 안쪽에서 바깥 위로 말려 올라감
                const ph = this.w[i] + roll;
                const R = Rc + rc * Math.cos(ph) * this.r[i];
                x = this.x + Math.cos(u) * R; z = this.z + Math.sin(u) * R;
                y = capY + rc * Math.sin(ph) * 0.75;
                size = (8 + 3.5 * this.r[i]) * s * Math.sqrt(k) * (0.55 + 0.45 * ease(t / 2.5)); hot = heat;
            } else if (k === 2) {
                // 갓 윗부분: 도넛 가운데를 덮는 둥근 머리
                const R = Rc * 0.75 * Math.sqrt(v);
                x = this.x + Math.cos(u) * R; z = this.z + Math.sin(u) * R;
                y = capY + rc * (0.7 + 0.35 * (1 - v));
                size = 10 * s * Math.sqrt(k) * (0.5 + 0.5 * ease(t / 2.5)); hot = heat * 0.8;
            } else {
                // 바닥 먼지 고리: 빠르게 밖으로 퍼지며 옅어짐
                const R = (4 + 26 * ease(t / 2.2)) * s * (0.85 + 0.3 * v);
                x = this.x + Math.cos(u) * R; z = this.z + Math.sin(u) * R; y = this.y + (1 + 2 * this.r[i]) * s;
                size = (5 + 3 * v) * s; hot = heat * 0.3;
                a *= Math.max(0, 1 - t / 6);
            }
            this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
            this.size[i] = size;
            this.alpha[i] = a * fade * appear;
            // 달아오른 주황 → 회갈색 연기 (위쪽 덩어리는 조금 더 밝게)
            const g = 0.55 + 0.12 * this.r[i] + (k === 3 ? 0.12 : 0);
            this.col[i3] = g * (1 - hot) + 1.0 * hot;
            this.col[i3 + 1] = g * 0.94 * (1 - hot) + 0.55 * hot;
            this.col[i3 + 2] = g * 0.88 * (1 - hot) + 0.22 * hot;
        }
        const at = this.points.geometry.attributes;
        at.position.needsUpdate = at.aColor.needsUpdate = at.aSize.needsUpdate = at.aAlpha.needsUpdate = true;
        if (fade <= 0) this.points.visible = false;
    }
}

export class FX {
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.mobile = !!opts.mobile;
        this.time = 0;
        this._initDust();
        this._initPapers();
        this._initShards();
        this._initChunks();
        this._initBlasts();
        const tex = this.puffTex = puffTexture();
        this.flames = new PuffLayer(scene, this.mobile ? 700 : 1400, tex, true);
        this.smoke = new PuffLayer(scene, this.mobile ? 380 : 800, tex, false);
        this.burns = [];
        this.clouds = [];
        // 타는 자리를 비추는 일렁이는 불빛 (빛 개수가 바뀌면 셰이더를 다시 만드니 처음부터 하나 둠). 폰은 빛 하나가 화면 전체를 무겁게 해서 뺌
        this.fireLight = null;
        if (!this.mobile) {
            this.fireLight = new THREE.PointLight(0xff7a2a, 0, 40, 1.6);
            scene.add(this.fireLight);
        }
    }

    /** 불꽃 한 줌 (빛나는 불 + 가끔 연기) */
    flameAt(x, y, z, size = 1.4, power = 1) {
        this.flames.spawn(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size * 0.5, z + (Math.random() - 0.5) * size,
            (Math.random() - 0.5) * 2 * power, (1 + Math.random() * 2.5) * power, (Math.random() - 0.5) * 2 * power,
            size * (0.9 + Math.random() * 0.6), 0.45 + Math.random() * 0.4, 0.75, Math.random(), 0.4);
        if (Math.random() < 0.18) this.smokeAt(x, y + size, z, size * 1.6);
    }

    smokeAt(x, y, z, size = 2, alpha = 0.55) {
        this.smoke.spawn(x + (Math.random() - 0.5) * size * 0.5, y, z + (Math.random() - 0.5) * size * 0.5,
            (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5,
            size * (0.8 + Math.random() * 0.5), 2.2 + Math.random() * 1.6, alpha, 0.14 + Math.random() * 0.16, 0.9);
    }

    /**
     * 한동안 계속 타는 자리 (나무·차·무너진 자리). dur 초 동안 불과 연기를 내고, 끝나면 연기만 조금 더.
     * @returns 타는 자리 (위치를 옮기려면 x,y,z 를 바꾸면 됨)
     */
    burn(x, y, z, dur = 4, scale = 1) {
        if (this.burns.length >= (this.mobile ? 24 : 48)) this.burns.shift();
        const b = { x, y, z, t: 0, dur, scale, acc: 0, sacc: 0 };
        this.burns.push(b);
        return b;
    }

    /**
     * 버섯구름. 불덩이가 부풀며 떠오르고, 기둥 위로 도넛처럼 말려 올라가는 갓이 생겨 10초 가까이 남음.
     * 구름 모양은 연기 덩어리를 정해진 자리(기둥·갓·바닥 고리)에 붙여 움직여서 늘 버섯 모양을 지킴.
     * scale 1 = 핵폭탄, 2 이상 = 필살기
     */
    mushroom(x, y, z, scale = 1, height = 0) {
        if (this.clouds.length >= 2) { const o = this.clouds.shift(); o.ball.visible = false; o.cloud.points.visible = false; }
        const ball = this._fireball();
        ball.userData.boom = null;
        ball.position.set(x, Math.max(y, 1), z);
        ball.scale.setScalar(0.1);
        ball.visible = true;
        const cloud = this._cloudMesh();
        cloud.start(x, 0, z, scale, height);
        this.clouds.push({ x, y: Math.max(y, 0.5), z, s: scale, t: 0, ball, cloud });
        this.ring(x, 0.3, z, 34 * scale, 0xffffff);
        this.ring(x, 0.3, z, 20 * scale, 0xffb347);
        this.light.position.set(x, y + 8 * scale, z);
        this.light.intensity = 900 * scale;
        this.light.distance = 180 * scale;
        this.lightT = 1.8;
        // 불티
        for (let k = 0; k < (this.mobile ? 20 : 40); k++) {
            const a = Math.random() * Math.PI * 2, v = (10 + Math.random() * 18) * scale;
            this.flames.spawn(x, y + 2, z, Math.cos(a) * v, 6 + Math.random() * 12 * scale, Math.sin(a) * v, 1.4 * scale, 0.6 + Math.random() * 0.5, 0.9, Math.random(), 0.2);
        }
    }

    _cloudMesh() {
        if (!this._cloudPool) this._cloudPool = [];
        const free = this._cloudPool.find(c => !c.points.visible);
        if (free) return free;
        const c = new MushroomCloud(this.scene, this.puffTex, this.mobile ? 110 : 190);
        if (this.pointScale) c.mat.uniforms.uScale.value = this.pointScale;
        this._cloudPool.push(c);
        return c;
    }

    /**
     * 보통 폭발 한 방: 작은 불덩이 + 불꽃·연기·불티 + 충격 고리 + 번쩍임.
     * r 은 반지름(칸). ring=false 면 바닥 고리 없음 (벽 중간에서 터질 때)
     */
    explosion(x, y, z, r = 3, opt = {}) {
        const b = this._fireball();
        b.position.set(x, y, z);
        b.scale.setScalar(0.1);
        b.visible = true;
        b.userData.boom = { t: 0, r: r * (opt.ball || 1.1), dur: 0.6 + r * 0.03 };
        const u = b.material.uniforms;
        u.uT.value = Math.random() * 10; u.uHeat.value = 1.2; u.uFade.value = 1;
        const n = Math.round((this.mobile ? 6 : 12) + r * (this.mobile ? 2 : 4));
        for (let k = 0; k < n; k++) {
            const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 1, v = (6 + Math.random() * 10) * Math.sqrt(r);
            this.flames.spawn(x, y, z, Math.cos(a) * v * Math.sqrt(1 - e * e), Math.abs(e) * v + 2, Math.sin(a) * v * Math.sqrt(1 - e * e),
                (0.8 + Math.random()) * r * 0.45, 0.35 + Math.random() * 0.35, 0.9, Math.random(), 0.8);
        }
        for (let k = 0; k < Math.round(n * 0.4); k++) this.smokeAt(x + (Math.random() - 0.5) * r, y + Math.random() * r * 0.5, z + (Math.random() - 0.5) * r, r * 0.9, 0.55);
        this.sparks(x, y, z, Math.round(n * 0.6));
        if (opt.ring !== false && y < 3) this.ring(x, 0.3, z, r * 2.6, opt.color || 0xffe0a0);
        this.light.position.set(x, y + 1, z);
        this.light.distance = 40 + r * 8;
        this.light.intensity = 50 * r;
        this.lightT = 0.35;
        this.dust(x, Math.max(0.5, y - 1), z, Math.round(4 + r * 2), r, r / 3);
    }

    /**
     * 처음 터질 때 멈칫하지 않게 미리 만들어 둠: 불덩이·버섯구름·자주 쓰는 만화 글자.
     * (그리는 법은 main 이 한 번에 미리 준비시킴)
     */
    warm() {
        for (let i = 0; i < 2; i++) this._fireball();
        this._cloudMesh();
        for (const [w, c] of [['퍽!', '#ffd23f'], ['쾅!', '#ffd23f'], ['빡!', '#ffd23f'], ['팍!', '#ffd23f'], ['퍽퍽!', '#ffd23f'],
            ['펑!', '#ffffff'], ['쾅!', '#fee500'], ['쿵!', '#ffd23f'], ['콰광!!', '#ffd23f'], ['와르르!', '#ffffff'], ['쾅!!', '#f2b630'], ['펑!!', '#e9d5ff']]) {
            this.pow(0, -500, 0, w, 1, c);
        }
        if (this._pows) for (const p of this._pows) p.visible = false;
    }

    /** 만화 글자 ("쾅!" "퍽!") 가 튀어나왔다 사라짐 */
    pow(x, y, z, text, size = 3, color = '#ffd23f') {
        if (!this._pows) {
            this._pows = [];
            this._powTex = new Map();
        }
        const key = text + color;
        let tex = this._powTex.get(key);
        if (!tex) {
            const c = document.createElement('canvas');
            c.width = 256; c.height = 128;
            const g = c.getContext('2d');
            g.font = `900 92px ${POW_FONT}`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.lineJoin = 'round';
            g.lineWidth = 18; g.strokeStyle = '#1b1b1f'; g.strokeText(text, 128, 68);
            g.fillStyle = color; g.fillText(text, 128, 68);
            tex = new THREE.CanvasTexture(c);
            tex.colorSpace = THREE.SRGBColorSpace;
            this._powTex.set(key, tex);
        }
        let sp = this._pows.find(p => !p.visible);
        if (!sp) {
            if (this._pows.length >= 8) sp = this._pows.reduce((a, b) => (a.userData.t > b.userData.t ? a : b));
            else {
                sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
                sp.renderOrder = 10;
                this.scene.add(sp);
                this._pows.push(sp);
            }
        }
        sp.material.map = tex;
        sp.material.rotation = (Math.random() - 0.5) * 0.5;
        sp.material.needsUpdate = true;
        sp.position.set(x, y, z);
        sp.visible = true;
        sp.userData = { t: 0, size };
    }

    _stepPows(dt) {
        if (!this._pows) return;
        for (const sp of this._pows) {
            if (!sp.visible) continue;
            const u = sp.userData;
            u.t += dt;
            // 툭 튀어나왔다가 살짝 줄고, 위로 뜨며 사라짐
            const k = u.t < 0.1 ? u.t / 0.1 * 1.35 : u.t < 0.2 ? 1.35 - (u.t - 0.1) * 3.5 : 1;
            sp.scale.set(u.size * 2 * k, u.size * k, 1);
            sp.position.y += dt * 1.5;
            sp.material.opacity = u.t < 0.45 ? 1 : Math.max(0, 1 - (u.t - 0.45) / 0.25);
            if (u.t > 0.7) sp.visible = false;
        }
    }

    _fireball() {
        const free = this._balls && this._balls.find(m => !m.visible);
        if (free) return free;
        if (!this._balls) this._balls = [];
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), new THREE.ShaderMaterial({
            uniforms: { uT: { value: 0 }, uHeat: { value: 1 }, uFade: { value: 1 } },
            vertexShader: `
                varying vec3 vP; varying vec3 vN; varying vec3 vV;
                void main() {
                    vP = position; vN = normalize(normalMatrix * normal);
                    vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz);
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: `
                uniform float uT; uniform float uHeat; uniform float uFade;
                varying vec3 vP; varying vec3 vN; varying vec3 vV;
                float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
                float n3(vec3 p) {
                    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                               mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
                }
                void main() {
                    vec3 p = vP * 2.5 + vec3(0.0, -uT * 1.6, 0.0);
                    float n = n3(p) * 0.55 + n3(p * 2.1) * 0.3 + n3(p * 4.3) * 0.15;
                    float rim = 1.0 - abs(dot(vN, vV));
                    float heat = clamp(uHeat * (1.25 - rim * 0.9) + (n - 0.5) * 0.6, 0.0, 1.0);
                    vec3 col = mix(vec3(0.16, 0.12, 0.11), vec3(0.85, 0.25, 0.05), smoothstep(0.1, 0.45, heat));
                    col = mix(col, vec3(1.0, 0.72, 0.25), smoothstep(0.45, 0.75, heat));
                    col = mix(col, vec3(1.0, 0.97, 0.85), smoothstep(0.78, 1.0, heat));
                    // 식은 부분은 투명해져 연기에 묻힘 (공처럼 떠 있지 않게), 가장자리는 부드럽게
                    float a = uFade * smoothstep(0.0, 0.3, uHeat) * smoothstep(0.12, 0.45, heat) * (1.0 - smoothstep(0.45, 0.95, rim));
                    gl_FragColor = vec4(col, a);
                }`,
            transparent: true,
            depthWrite: false,
        }));
        m.renderOrder = 3;
        this.scene.add(m);
        this._balls.push(m);
        return m;
    }

    _stepBurns(dt, cam) {
        let best = null, bd = Infinity;
        for (let i = this.burns.length - 1; i >= 0; i--) {
            const b = this.burns[i];
            b.t += dt;
            const smokeOnly = b.t > b.dur;
            if (b.t > b.dur + 5) { this.burns.splice(i, 1); continue; }
            // 타오르다 끝물엔 사그라듦
            const k = smokeOnly ? 0 : Math.min(1, b.t * 3) * (b.t > b.dur - 1 ? Math.max(0.2, b.dur - b.t) : 1);
            b.acc += dt * k * (this.mobile ? 16 : 30) * b.scale;
            while (b.acc >= 1) { b.acc -= 1; this.flameAt(b.x, b.y, b.z, 1.1 * b.scale, 0.9); }
            b.sacc += dt * (smokeOnly ? 1.5 : 4) * b.scale;
            while (b.sacc >= 1) { b.sacc -= 1; this.smokeAt(b.x, b.y + 1.5 * b.scale, b.z, 2.2 * b.scale, smokeOnly ? 0.35 : 0.5); }
            if (!smokeOnly && cam) {
                const d = Math.hypot(b.x - cam.x, b.z - cam.z) - b.scale * 20;
                if (d < bd) { bd = d; best = b; }
            }
        }
        // 카메라에서 가까운 큰 불 하나를 일렁이는 불빛으로
        if (!this.fireLight) return;
        if (best) {
            this.fireLight.position.set(best.x, best.y + 1.5, best.z);
            this.fireLight.intensity = (40 + Math.sin(this.time * 23) * 10 + Math.sin(this.time * 37) * 8) * Math.min(2, best.scale);
        } else this.fireLight.intensity *= Math.pow(0.02, dt);
    }

    _stepClouds(dt) {
        for (let i = this.clouds.length - 1; i >= 0; i--) {
            const c = this.clouds[i], s = c.s;
            c.t += dt;
            const t = c.t;
            c.cloud.update(dt, t);
            // 불덩이: 순식간에 부풀었다가 갓 자리로 떠오르며 식고, 갓 연기 속으로 사라짐
            const R = (t < 0.45 ? 1 - Math.pow(1 - t / 0.45, 3) : 1 + (t - 0.45) * 0.15) * 10 * s;
            const capY = c.cloud.capY;
            c.ball.scale.set(R, R * (t < 0.8 ? 1 : 0.75), R);
            c.ball.position.set(c.x, t < 0.35 ? c.y + R * 0.25 : Math.max(c.y + R * 0.25, capY), c.z);
            const u = c.ball.material.uniforms;
            u.uT.value = t;
            u.uHeat.value = Math.max(0, 1.25 - t * 0.42);
            u.uFade.value = t < 1.2 ? 1 : Math.max(0, 1 - (t - 1.2) / 1.6);
            if (u.uFade.value <= 0) c.ball.visible = false;
            // 기둥 속 불티와 피어오르는 연기 조금
            if (t < 2.2 && Math.random() < dt * 30) this.flames.spawn(c.x + (Math.random() - 0.5) * 3 * s, c.y + Math.random() * (capY - c.y), c.z + (Math.random() - 0.5) * 3 * s, 0, 8 * s, 0, 2.6 * s, 0.5, 0.7, Math.random(), 0.3);
            if (!c.cloud.points.visible) { c.ball.visible = false; this.clouds.splice(i, 1); }
        }
        // 보통 폭발 불덩이
        if (this._balls) for (const b of this._balls) {
            const bo = b.userData.boom;
            if (!bo || !b.visible) continue;
            bo.t += dt;
            const k = bo.t / bo.dur;
            if (k >= 1) { b.visible = false; b.userData.boom = null; continue; }
            const e = 1 - Math.pow(1 - Math.min(1, k * 2.2), 3);
            b.scale.setScalar(0.2 + bo.r * e);
            b.position.y += dt * bo.r * 0.8;
            const u = b.material.uniforms;
            u.uT.value += dt * 2;
            u.uHeat.value = 1.35 - k * 1.1;
            u.uFade.value = 1 - Math.max(0, (k - 0.6) / 0.4);
        }
        this._stepPows(dt);
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
        const k = viewportHeightPx / (2 * Math.tan(fovDeg * Math.PI / 360));
        this.dustMat.uniforms.uScale.value = k;
        if (this.flames) { this.flames.mat.uniforms.uScale.value = k; this.smoke.mat.uniforms.uScale.value = k; }
        this.pointScale = k;
        if (this._cloudPool) for (const c of this._cloudPool) c.mat.uniforms.uScale.value = k;
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
            this.flames.spawn(
                x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * 8 * power, Math.random() * 6 * power, (Math.random() - 0.5) * 8 * power,
                2 + Math.random() * 2.5 * power, 0.45 + Math.random() * 0.5, 0.8, Math.random(), 0.6);
            if (Math.random() < 0.25) this.smokeAt(x, y + spread * 0.5, z, 1.5 + spread);
        }
    }

    sparks(x, y, z, n = 4) {
        for (let k = 0; k < n; k++) {
            this._spawnDust(x, y, z, (Math.random() - 0.5) * 14, Math.random() * 9, (Math.random() - 0.5) * 14,
                0.25 + Math.random() * 0.3, 0.18 + Math.random() * 0.15, 1, 0.9, 0.5, 1);
        }
    }

    flame(x, y, z, vx, vy, vz, size) {
        this.flames.spawn(x, y, z, vx + (Math.random() - 0.5) * 3, vy + Math.random() * 2, vz + (Math.random() - 0.5) * 3,
            size, 0.28 + Math.random() * 0.22, 0.85, Math.random(), 1.6);
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

    /** 효과용 콘크리트 덩어리 (진짜 블록이 아니라 예산과 상관없음). 튀었다가 바닥에 굴러 사라짐 */
    _initChunks() {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        this.chunkMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), CHUNK_MAX);
        this.chunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.chunkMesh.frustumCulled = false;
        this.cp = new Float32Array(CHUNK_MAX * 3); this.cv = new Float32Array(CHUNK_MAX * 3);
        this.cr = new Float32Array(CHUNK_MAX * 3); this.cs = new Float32Array(CHUNK_MAX); this.cl = new Float32Array(CHUNK_MAX);
        this.cNext = 0;
        const c = new THREE.Color();
        for (let i = 0; i < CHUNK_MAX; i++) {
            _m.makeScale(0, 0, 0); this.chunkMesh.setMatrixAt(i, _m);
            this.chunkMesh.setColorAt(i, c.setHSL(0.08, 0.06, 0.45 + Math.random() * 0.3));
        }
        this.scene.add(this.chunkMesh);
    }

    chunks(x, y, z, n = 10, spread = 4, power = 1, size = 1) {
        if (this.mobile) n = Math.ceil(n * 0.6);
        for (let k = 0; k < n; k++) {
            const i = this.cNext;
            this.cNext = (i + 1) % CHUNK_MAX;
            this.cp.set([x + (Math.random() - 0.5) * spread, y + Math.random() * spread * 0.3, z + (Math.random() - 0.5) * spread], i * 3);
            const a = Math.random() * Math.PI * 2, v = (4 + Math.random() * 8) * power;
            this.cv.set([Math.cos(a) * v, (4 + Math.random() * 9) * power, Math.sin(a) * v], i * 3);
            this.cr.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
            this.cs[i] = size * (0.4 + Math.random() * 0.9);
            this.cl[i] = 1.6 + Math.random() * 1.2;
        }
    }

    _stepChunks(dt) {
        for (let i = 0; i < CHUNK_MAX; i++) {
            if (this.cl[i] <= 0) continue;
            this.cl[i] -= dt;
            const i3 = i * 3, p = this.cp, v = this.cv;
            v[i3 + 1] -= 24 * dt;
            p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
            if (p[i3 + 1] < this.cs[i] * 0.5) { p[i3 + 1] = this.cs[i] * 0.5; v[i3 + 1] *= -0.25; v[i3] *= 0.6; v[i3 + 2] *= 0.6; }
            this.cr[i3] += 5 * dt; this.cr[i3 + 1] += 4 * dt;
            const s = this.cs[i] * Math.min(1, this.cl[i] * 2);
            _e.set(this.cr[i3], this.cr[i3 + 1], this.cr[i3 + 2]);
            _m.compose(_p.set(p[i3], p[i3 + 1], p[i3 + 2]), _q.setFromEuler(_e), _s.set(s, s, s));
            this.chunkMesh.setMatrixAt(i, _m);
        }
        this.chunkMesh.instanceMatrix.needsUpdate = true;
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
        this.light.distance = 80;
        this.light.intensity = 60 * r;
        this.lightT = 0.35;
        this.fire(x, y, z, Math.round(10 + r * 6), r * 0.5, r / 3);
        this.dust(x, y, z, Math.round(8 + r * 4), r, r / 3);
    }

    update(dt, cam) {
        this.time += dt;
        this._stepBurns(dt, cam);
        this._stepClouds(dt);
        this._stepChunks(dt);
        this.flames.update(dt, this.time);
        this.smoke.update(dt, this.time);
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
