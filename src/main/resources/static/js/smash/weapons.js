import * as THREE from 'three';
import { labelTexture, FONT } from './props.js';
import { sfx } from './audio.js';

// hold: 누르고 있으면 cool 간격으로 계속 쏜다.
export const WEAPONS = [
    // 빡침 펀치 (예전 망치 자리. 기록·통계 호환 때문에 id 는 hammer 그대로)
    { id: 'hammer', icon: '👊', cool: 0.075, hold: true, radius: 2.6, force: 15 },
    { id: 'gun', icon: '📎', cool: 0.065, hold: true, radius: 1.1, force: 7 },
    // 터지면 작은 사직서들이 사방으로 튀어 연쇄로 터짐
    { id: 'bomb', icon: '✉️', cool: 0.6, hold: true, radius: 5.6, force: 26, vaporize: 0.25 },
    { id: 'flame', icon: '🔥', cool: 0.05, hold: true, radius: 2.6, force: 0 },
    // 덤프트럭이 건물 1층을 뚫고 지나감. 아래가 비면 위층이 통째로 주저앉음
    { id: 'truck', icon: '🚚', cool: 3.5, hold: false, radius: 4.6, force: 30, vaporize: 0.1 },
    // 미사일이 떨어져 버섯구름을 피움 (필살기의 작은 판)
    { id: 'nuke', icon: '☢️', cool: 5, hold: false, radius: 14, force: 46, vaporize: 0.45 },
    { id: 'hole', icon: '🌀', cool: 7, hold: false, radius: 13, force: 30 },
    // 철거 현장의 쇠공: 크레인에 매달려 옆으로 휘두르며 지나가는 자리를 한 줄로 부순다
    { id: 'ball', icon: '🏗️', cool: 1.5, hold: true, radius: 3.8, force: 28 },
];
export const NUKE = { id: 'nuke', radius: 16, force: 48, vaporize: 0.5 };

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const PUNCH_WORDS = ['퍽!', '쾅!', '빡!', '팍!', '퍽퍽!'];

function stamp(text, bg, fg, border, w = 256, h = 128, size = 64) {
    return labelTexture(w, h, (g) => {
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); }
        g.fillStyle = fg;
        g.font = `900 ${size}px ${FONT}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, w / 2, h / 2 + 4);
    });
}

/**
 * @param game {hit(point, spec, dir), ignite(point, r), pull(point, r, strength, dt), shake(n), camera}
 */
export class Weapons {
    constructor(scene, fx, game) {
        this.scene = scene;
        this.fx = fx;
        this.game = game;
        this.cool = WEAPONS.map(() => 0);
        this.active = [];
        // 주먹 여러 개를 돌려 써서 꾹 누르면 다다다다 연타
        this.fists = [];
        for (let i = 0; i < 6; i++) { this._makeHammer(); this.fists.push(this.hammer); }
        this.hammer = this.fists[0];
        this.punchN = 0;
        const top = new THREE.MeshLambertMaterial({ map: stamp('사직서', '#fffdf6', '#c8102e', '#c8102e') });
        const side = new THREE.MeshLambertMaterial({ color: 0xf4efe2 });
        this.bombGeo = new THREE.BoxGeometry(1.3, 0.16, 0.9);
        this.bombMats = [side, side, top, side, side, side];
        this.missile = this._makeMissile();
        this.truck = this._makeTruck();
        // 총구 불꽃: 더해 그리는 별 모양
        const fl = labelTexture(64, 64, (g) => {
            const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
            gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.35, 'rgba(255,190,80,0.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
            g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
            g.fillStyle = 'rgba(255,240,200,0.9)';
            for (let k = 0; k < 4; k++) { g.save(); g.translate(32, 32); g.rotate(k * Math.PI / 4); g.fillRect(-30, -2, 60, 4); g.restore(); }
        });
        this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: fl, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        this.flash.visible = false;
        this.flash.renderOrder = 5;
        this.scene.add(this.flash);
        this.flashT = 0;
        const badge = labelTexture(128, 128, (g) => {
            g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#fff'; g.font = `900 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('999+', 64, 68);
        });
        this.badgeMat = new THREE.SpriteMaterial({ map: badge });
        // 스테이플러 탄: 짧은 선
        this.tracers = [];
        const tg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
        for (let i = 0; i < 10; i++) {
            const l = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, blending: THREE.AdditiveBlending }));
            l.visible = false; l.frustumCulled = false;
            scene.add(l);
            this.tracers.push({ line: l, t: 0 });
        }
        this.tracerNext = 0;
        // 블랙홀
        // 블랙홀: 검은 핵 + 빛나는 강착 원반(더해 그리기) + 보랏빛 후광
        this.holeCore = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x050308 }));
        const add = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const diskTex = labelTexture(256, 256, (g) => {
            const gr = g.createRadialGradient(128, 128, 40, 128, 128, 128);
            gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.12, 'rgba(255,240,255,1)'); gr.addColorStop(0.35, 'rgba(216,140,255,0.9)');
            gr.addColorStop(0.7, 'rgba(120,60,220,0.45)'); gr.addColorStop(1, 'rgba(60,20,140,0)');
            g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
            // 소용돌이 줄무늬
            g.globalCompositeOperation = 'destination-out';
            for (let k = 0; k < 7; k++) {
                g.beginPath();
                for (let a = 0; a < 5; a += 0.05) { const r = 50 + a * 15; g.lineTo(128 + Math.cos(a + k * 0.9) * r, 128 + Math.sin(a + k * 0.9) * r); }
                g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.stroke();
            }
        });
        const dm = add(0xffffff, 0.95); dm.map = diskTex;
        this.holeRing = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), dm);
        this.holeRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 8, 48), add(0xf5d0fe, 0.95));
        const haloTex = labelTexture(128, 128, (g) => {
            const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
            gr.addColorStop(0, 'rgba(190,120,255,0.7)'); gr.addColorStop(1, 'rgba(90,30,180,0)');
            g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        });
        this.holeHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        this.holeHalo.scale.setScalar(14);
        this.hole = new THREE.Group();
        this.hole.add(this.holeHalo, this.holeRing, this.holeRing2, this.holeCore);
        this.hole.visible = false;
        scene.add(this.hole);
        // 레킹볼: 쇠공 + 쇠사슬(선 하나)
        this.ball = new THREE.Group();
        const iron = new THREE.MeshLambertMaterial({ color: 0x30343b });
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(2.2, 22, 16), iron);
        sphere.castShadow = true;
        // 고리와 띠
        const band = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.16, 8, 32), new THREE.MeshLambertMaterial({ color: 0x55595f }));
        band.rotation.x = Math.PI / 2;
        const lug = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.16, 8, 16), iron);
        lug.position.y = 2.5;
        this.ball.add(sphere, band, lug);
        this.ball.visible = false;
        // 굵은 쇠줄 (길이 1 짜리 원기둥을 늘려 씀)
        const cg = new THREE.CylinderGeometry(0.16, 0.16, 1, 8);
        cg.translate(0, -0.5, 0);
        this.chain = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ color: 0x1f2328 }));
        this.chain.frustumCulled = false;
        this.chain.visible = false;
        scene.add(this.ball, this.chain);
    }

    /** 거대한 권투 장갑 + 정장 소매. 카메라 쪽에서 날아와 벽을 때리고 돌아감 (그룹 앞쪽 = +z = 카메라 쪽) */
    _makeHammer() {
        const g = new THREE.Group();
        const fist = new THREE.Group();
        g.add(fist);
        const red = new THREE.MeshLambertMaterial({ color: 0xd8232a, emissive: 0x2a0000 });
        const white = new THREE.MeshLambertMaterial({ color: 0xf4f1ea });
        const sleeve = new THREE.MeshLambertMaterial({ color: 0x23324a });
        const glove = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), red);
        glove.scale.set(1.15, 1, 1.35);
        const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), red);
        thumb.position.set(0.85, -0.25, 0.25);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.7, 16), white);
        cuff.rotation.x = Math.PI / 2; cuff.position.z = 1.5;
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 4, 12), sleeve);
        arm.rotation.x = Math.PI / 2; arm.position.z = 3.8;
        const lace = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.9), white);
        lace.position.set(0, 0.95, 0.9);
        fist.add(glove, thumb, cuff, arm, lace);
        for (const m of fist.children) m.castShadow = true;
        g.visible = false;
        this.scene.add(g);
        this.hammer = { group: g, pivot: fist, t: -1, n: 0 };
    }

    /** 덤프트럭: 노란 운전석 + 회색 짐칸 + 바퀴 6개 (앞 = -z) */
    _makeTruck() {
        const g = new THREE.Group();
        const yellow = new THREE.MeshLambertMaterial({ color: 0xf2b630 });
        const gray = new THREE.MeshLambertMaterial({ color: 0x6b7280 });
        const dark = new THREE.MeshLambertMaterial({ color: 0x1f2328 });
        const glass = new THREE.MeshLambertMaterial({ color: 0x9cc7e6, emissive: 0x1a2a38 });
        const cab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3, 2.6), yellow);
        cab.position.set(0, 2.4, -3.4);
        const win = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.1, 0.1), glass);
        win.position.set(0, 3.1, -4.72);
        const bed = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 5.6), gray);
        bed.position.set(0, 2.3, 0.9);
        bed.rotation.x = -0.12;
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 9), dark);
        chassis.position.set(0, 0.95, -0.6);
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.7, 0.5), dark);
        bumper.position.set(0, 1.1, -4.9);
        g.add(cab, win, bed, chassis, bumper);
        const wg = new THREE.CylinderGeometry(0.75, 0.75, 0.6, 14);
        wg.rotateZ(Math.PI / 2);
        this.wheels = [];
        for (const z of [-3.4, 0.4, 2.4]) for (const x of [-1.55, 1.55]) {
            const w = new THREE.Mesh(wg, dark);
            w.position.set(x, 0.75, z);
            g.add(w);
            this.wheels.push(w);
        }
        for (const m of g.children) m.castShadow = true;
        g.visible = false;
        this.scene.add(g);
        return g;
    }

    /** 핵미사일: 흰 몸통 + 빨간 머리 + 꼬리 날개 (머리가 -y 쪽) */
    _makeMissile() {
        const g = new THREE.Group();
        const white = new THREE.MeshLambertMaterial({ color: 0xf2f2ee });
        const red = new THREE.MeshLambertMaterial({ color: 0xc8102e });
        const yellow = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x3a2a00 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 4.2, 14), white);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 14), red);
        nose.rotation.x = Math.PI; nose.position.y = -2.8;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.5, 14), yellow);
        band.position.y = -1.2;
        g.add(body, nose, band);
        for (let k = 0; k < 4; k++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 1.1), red);
            fin.position.set(Math.cos(k * Math.PI / 2) * 0.6, 1.7, Math.sin(k * Math.PI / 2) * 0.6);
            fin.rotation.y = -k * Math.PI / 2;
            g.add(fin);
        }
        g.visible = false;
        this.scene.add(g);
        return g;
    }

    _stepFist(h, dt) {
        if (h.t < 0) return;
        h.t += dt;
        const IN = 0.05, HOLD = 0.05, OUT = 0.1;
        if (h.t < IN) {
            // 뒤로 젖혔다가 쭉 뻗음
            const e = h.t / IN;
            h.pivot.position.z = 6 * (1 - e * e) + 0.6;
            return;
        }
        h.pivot.position.z = 0.6;
        if (!h.hit) {
            h.hit = true;
            h.n++;
            sfx.hammer();
            const p = h.point;
            // 주먹이 닿은 자리에서 맞음 (흩어 친 경우 그 자리)
            this.game.hit(h.group.position.clone(), WEAPONS[0], h.dir);
            this.fx.dust(p.x, p.y, p.z, 3, 1.1 * h.scale, 1.1);
            this.fx.sparks(p.x, p.y, p.z, 4);
            if (Math.random() < 0.2) this.fx.pow(h.group.position.x, h.group.position.y + 1.2 * h.scale, h.group.position.z, PUNCH_WORDS[Math.floor(Math.random() * PUNCH_WORDS.length)], 1.5 * h.scale);
            this.game.shake(0.09);
        }
        if (h.t > IN + HOLD) {
            const e = Math.min(1, (h.t - IN - HOLD) / OUT);
            h.pivot.position.z = 0.6 + e * 5;
            h.group.scale.setScalar(h.scale * (1 - e));
            if (e >= 1) { h.t = -1; h.group.visible = false; }
        }
    }

    /** 폭발 그림 배율 (회사 건물이 크면 크게) */
    _fs() { return this.game.fxScale ? this.game.fxScale() : 1; }

    coolRatio(k) { return Math.max(0, this.cool[k] / WEAPONS[k].cool); }
    holeActive() { return this.active.some(a => a.kind === 'hole'); }

    /** 화면 아래쪽(손 위치)에서 출발하는 점 */
    _muzzle(camPos, dir, out) {
        const right = _v2.crossVectors(dir, UP).normalize();
        return out.copy(camPos).addScaledVector(dir, 3).addScaledVector(UP, -1.6).addScaledVector(right, 1.2);
    }

    fire(k, point, dir, camPos) {
        if (this.cool[k] > 0) return false;
        const w = WEAPONS[k];
        this.cool[k] = w.cool;
        switch (w.id) {
            case 'hammer': {
                const h = this.fists.find(f => f.t < 0) || this.fists.reduce((a, b) => (a.t > b.t ? a : b));
                const s = Math.max(1.1, camPos.distanceTo(point) / 28) * (0.85 + Math.random() * 0.3);
                // 연타는 조준점 둘레로 조금씩 흩어서 (주먹이 겹쳐 보이지 않게)
                const spread = this.punchN++ % 2 ? 1.6 * s : 0;
                const right = _v2.crossVectors(dir, UP).normalize();
                h.group.position.copy(point).addScaledVector(right, (Math.random() - 0.5) * spread).addScaledVector(UP, (Math.random() - 0.5) * spread * 0.7);
                // 카메라 쪽을 보게 (살짝 기울여 매번 다른 각도로)
                h.group.lookAt(camPos);
                h.group.rotateZ((Math.random() - 0.5) * 0.9);
                h.group.visible = true;
                h.scale = s;
                h.group.scale.setScalar(s);
                h.t = 0; h.hit = false;
                h.point = point.clone(); h.dir = dir.clone();
                break;
            }
            case 'gun': {
                const from = this._muzzle(camPos, dir, new THREE.Vector3());
                const tr = this.tracers[this.tracerNext];
                this.tracerNext = (this.tracerNext + 1) % this.tracers.length;
                tr.line.position.copy(from);
                tr.line.scale.set(1, 1, from.distanceTo(point));
                tr.line.lookAt(point);
                tr.line.visible = true; tr.t = 0.07;
                sfx.gun();
                // 총구 불꽃과 맞은 자리 불티·먼지
                this.flash.position.copy(from);
                this.flash.scale.setScalar(1.2 + Math.random() * 0.8);
                this.flash.material.rotation = Math.random() * 3;
                this.flash.visible = true; this.flashT = 0.04;
                this.fx.sparks(point.x, point.y, point.z, 7);
                if (Math.random() < 0.5) this.fx.dust(point.x, point.y, point.z, 1, 0.6, 0.6);
                this.fx.flames.spawn(point.x, point.y, point.z, 0, 0, 0, 0.9, 0.08, 0.9, Math.random(), 0);
                this.game.shake(0.025);
                this.game.hit(point, w, dir);
                break;
            }
            case 'bomb': {
                const m = new THREE.Mesh(this.bombGeo, this.bombMats.map(x => x.clone()));
                m.castShadow = true;
                const from = this._muzzle(camPos, dir, new THREE.Vector3());
                m.position.copy(from);
                this.scene.add(m);
                // 멀리 던져도 0.9초 안에 닿게
                this.active.push({ kind: 'bomb', mesh: m, from, to: point.clone(), dir: dir.clone(), t: 0, dur: Math.min(0.9, 0.3 + from.distanceTo(point) * 0.004), fuse: 0.4, spin: 10 + Math.random() * 6 });
                sfx.toss();
                break;
            }
            case 'flame': {
                const from = this._muzzle(camPos, dir, new THREE.Vector3());
                const d = _v.subVectors(point, from);
                const L = d.length();
                d.normalize();
                // 불줄기: 총구 쪽은 가늘고 밝게, 갈수록 굵게 퍼지며 식음
                const n = this.fx.mobile ? 5 : 8;
                for (let i = 0; i < n; i++) {
                    const t = Math.pow(Math.random(), 0.7);
                    const p = _v2.copy(from).addScaledVector(d, L * t);
                    const j = 0.4 + t * 2.2;
                    this.fx.flames.spawn(p.x + (Math.random() - 0.5) * j, p.y + (Math.random() - 0.5) * j, p.z + (Math.random() - 0.5) * j,
                        d.x * 26 + (Math.random() - 0.5) * 4, d.y * 26 + Math.random() * 3, d.z * 26 + (Math.random() - 0.5) * 4,
                        0.5 + t * 2.4, 0.16 + Math.random() * 0.14 + t * 0.12, 0.9, Math.random(), 2.4);
                }
                // 맞은 자리에서 튀는 불과 검은 연기
                for (let i = 0; i < 2; i++) this.fx.flameAt(point.x, point.y, point.z, 1.6, 1.4);
                if (Math.random() < 0.35) this.fx.smokeAt(point.x, point.y + 1.5, point.z, 2.4, 0.5);
                this.flameT = (this.flameT || 0) + w.cool;
                if (this.flameT > 0.12) {
                    this.flameT = 0;
                    this.game.ignite(point, w.radius);
                    // 쏘고 난 뒤에도 잠깐 타오름
                    if (!this.lastBurn || this.lastBurn.t > 0.4 || Math.hypot(this.lastBurn.x - point.x, this.lastBurn.z - point.z) > 2.5) {
                        this.lastBurn = this.fx.burn(point.x, point.y, point.z, 1.8 + Math.random(), 0.9);
                    }
                }
                sfx.flame();
                break;
            }
            case 'truck': {
                // 카메라 쪽에서 출발해 조준한 건물 1층을 뚫고 반대편으로 빠져나감
                if (this.active.some(a => a.kind === 'truck')) { this.cool[k] = 0; return false; }
                // 화면 옆에서 비스듬히 들어오게 (카메라 바로 아래서 출발하면 트럭이 안 보임)
                const fwd = new THREE.Vector3(dir.x, 0, dir.z).normalize().applyAxisAngle(UP, (Math.random() < 0.5 ? -1 : 1) * 0.75);
                // 건물을 들이받는 맛이 나게 크게 (예전의 약 2.6배). 회사 건물이 크면 더 크게
                const sc = 2.6 * Math.min(2, Math.max(1, this._fs()));
                const at = new THREE.Vector3(point.x, 0, point.z);
                const from = at.clone().addScaledVector(fwd, -28 * sc), to = at.clone().addScaledVector(fwd, 22 * sc);
                this.truck.scale.setScalar(sc);
                this.truck.position.copy(from);
                this.truck.lookAt(_v.copy(from).sub(fwd));
                this.truck.visible = true;
                this.active.push({ kind: 'truck', from, to, fwd, dir: dir.clone(), t: 0, dur: 1.7, hitT: 0, sc, honk: false });
                if (this.game.clip) this.game.clip(3);
                sfx.whoosh(1.4);
                break;
            }
            case 'nuke': {
                // 하늘 높이서 비스듬히 내리꽂힘. 한 번에 하나만
                if (this.active.some(a => a.kind === 'missile')) { this.cool[k] = 0; return false; }
                const m = this.missile;
                const s = Math.max(1, camPos.distanceTo(point) / 45);
                m.scale.setScalar(s);
                const from = point.clone().add(_v.set(-dir.x * 18 + 10, 85, -dir.z * 18 - 8));
                m.position.copy(from);
                m.lookAt(point);
                m.rotateX(-Math.PI / 2);
                m.visible = true;
                this.active.push({ kind: 'missile', from, to: point.clone(), dir: dir.clone(), t: 0, dur: 1.15, s });
                sfx.whoosh(1.2);
                break;
            }
            case 'ball': {
                // 화면 가로 방향으로 휘두른다. 멀리서 보면 쇠공·줄도 크게
                const s = Math.max(1, camPos.distanceTo(point) / 30);
                const right = new THREE.Vector3().crossVectors(dir, UP).setY(0).normalize();
                const side = Math.random() < 0.5 ? 1 : -1;
                const L = 18 * s;
                this.ball.scale.setScalar(s);
                this.ball.visible = this.chain.visible = true;
                this.active.push({ kind: 'ball', pivot: point.clone().addScaledVector(UP, L), right: right.multiplyScalar(side), L, s,
                    t: 0, dur: 0.95, hitT: 0, first: true, spec: { id: 'ball', radius: w.radius * Math.min(1.8, s), force: w.force } });
                sfx.whoosh(0.8);
                break;
            }
            case 'hole': {
                const at = point.clone();
                at.y = Math.max(at.y, 3) + 3;
                this.hole.position.copy(at);
                this.hole.visible = true;
                this.hole.scale.setScalar(0.01);
                this.active.push({ kind: 'hole', at, t: 0, dur: 3.4, dir: dir.clone() });
                if (this.game.clip) this.game.clip(3);
                sfx.vortex(3.4);
                break;
            }
        }
        return true;
    }

    nuke(point, dir) {
        const at = point.clone();
        at.y = Math.max(0.5, at.y);
        this.active.push({ kind: 'nukefall', mesh: null, to: at, dir: dir.clone(), t: 0, dur: 0.55 });
        sfx.whoosh(0.6);
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3, 10), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xd8333a, emissiveIntensity: 0.6 }));
        s.rotation.x = Math.PI;
        s.position.copy(at).add(_v.set(0, 70, 0));
        this.scene.add(s);
        this.active[this.active.length - 1].mesh = s;
        this.active[this.active.length - 1].from = s.position.clone();
    }

    update(dt) {
        for (let k = 0; k < this.cool.length; k++) this.cool[k] -= dt;
        if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
        for (const tr of this.tracers) {
            if (!tr.line.visible) continue;
            tr.t -= dt;
            tr.line.material.opacity = Math.max(0, tr.t / 0.06);
            if (tr.t <= 0) tr.line.visible = false;
        }
        for (const h of this.fists) this._stepFist(h, dt);
        for (let i = this.active.length - 1; i >= 0; i--) {
            const a = this.active[i];
            a.t += dt;
            if (a.kind === 'bomb') {
                if (a.t < a.dur) {
                    const e = a.t / a.dur;
                    a.mesh.position.lerpVectors(a.from, a.to, e);
                    a.mesh.position.y += Math.sin(e * Math.PI) * 3;
                    a.mesh.rotation.y += a.spin * dt;
                    a.mesh.rotation.x += a.spin * 0.5 * dt;
                } else {
                    a.mesh.position.copy(a.to);
                    a.fuse -= dt;
                    a.mesh.material[2].color.setHex(Math.sin(a.fuse * 40) > 0 ? 0xff5555 : 0xffffff);
                    a.mesh.scale.setScalar(1 + (0.4 - a.fuse) * 1.5);
                    if (!a.ticked) { a.ticked = true; sfx.tick(); }
                    if (a.fuse <= 0) {
                        this._remove(i, a);
                        // 벽 속에 묻히지 않게 카메라 쪽으로 조금 당겨서 터뜨림
                        const R = 4.2 * this._fs();
                        _v.copy(a.to).addScaledVector(a.dir, -R * 1.4);
                        this.fx.explosion(_v.x, _v.y, _v.z, R, { ball: 1.7 });
                        this.fx.papersBurst(a.to.x, a.to.y, a.to.z, this.fx.mobile ? 20 : 34, 1.8);
                        this.fx.pow(a.to.x, a.to.y + 3, a.to.z, '펑!', 2.4, '#ffffff');
                        sfx.boom(false);
                        this.game.shake(0.55);
                        if (this.game.hitStop) this.game.hitStop(0.06);
                        this.game.hit(a.to, WEAPONS[2], a.dir);
                        // 연쇄: 작은 사직서들이 튀어나감
                        const n = this.fx.mobile ? 3 : 5, sp = R * 1.4;
                        for (let k = 0; k < n; k++) {
                            const ang = k / n * Math.PI * 2 + Math.random() * 0.6;
                            const right = _v2.crossVectors(a.dir, UP).normalize();
                            const to = a.to.clone().addScaledVector(right, Math.cos(ang) * sp).addScaledVector(UP, Math.sin(ang) * sp * 0.6 + 0.5);
                            to.y = Math.max(0.5, to.y);
                            const m = new THREE.Mesh(this.bombGeo, this.bombMats);
                            m.scale.setScalar(0.7);
                            m.position.copy(_v);
                            this.scene.add(m);
                            this.active.push({ kind: 'letter', mesh: m, from: _v.clone(), to, dir: a.dir, t: -k * 0.05, dur: 0.32 + Math.random() * 0.1, R: R * 0.6 });
                        }
                    }
                }
            } else if (a.kind === 'letter') {
                if (a.t < 0) continue;
                const e = Math.min(1, a.t / a.dur);
                a.mesh.position.lerpVectors(a.from, a.to, e);
                a.mesh.position.y += Math.sin(e * Math.PI) * 2;
                a.mesh.rotation.y += dt * 18; a.mesh.rotation.x += dt * 9;
                if (e >= 1) {
                    this._remove(i, a);
                    _v.copy(a.to).addScaledVector(a.dir, -a.R);
                    this.fx.explosion(_v.x, _v.y, _v.z, a.R, { ball: 1.3 });
                    this.fx.papersBurst(a.to.x, a.to.y, a.to.z, this.fx.mobile ? 4 : 8, 1.3);
                    sfx.boom(false);
                    this.game.shake(0.18);
                    this.game.hit(a.to, { id: 'letter', radius: 3.4, force: 18, vaporize: 0.15 }, a.dir);
                }
            } else if (a.kind === 'truck') {
                // 빠르게 달려 들어감 (처음 0.3초는 가속)
                const e = Math.min(1, a.t / a.dur);
                const k2 = e < 0.18 ? (e / 0.18) * (e / 0.18) * 0.18 : e;
                const tp = this.truck.position.lerpVectors(a.from, a.to, k2);
                tp.y = Math.sin(a.t * 40) * 0.08 * a.sc;
                for (const w of this.wheels) w.rotation.x -= dt * 25;
                if (Math.random() < 0.7) this.fx.dust(tp.x - a.fwd.x * 4 * a.sc, 0.6, tp.z - a.fwd.z * 4 * a.sc, 2, 2 * a.sc, 1.2);
                a.hitT -= dt;
                if (a.hitT <= 0) {
                    a.hitT = 0.09;
                    // 범퍼 앞 1층·2층 높이를 같이 밀어냄
                    const front = _v.copy(tp).addScaledVector(a.fwd, 5 * a.sc);
                    // 트럭이 커진 만큼 범위도 넓게 (너무 커지면 한 번에 다 날아가니 0.6배)
                    const spec = { id: 'truck', radius: WEAPONS[4].radius * a.sc * 0.6, force: WEAPONS[4].force, vaporize: WEAPONS[4].vaporize };
                    const side = _v2.crossVectors(a.fwd, UP).normalize();
                    for (const h of [1.2, 3.2]) for (const o of [-1, 1]) this.game.hit(new THREE.Vector3(front.x + side.x * o * a.sc, h * a.sc, front.z + side.z * o * a.sc), spec, a.fwd);
                    if (this.game.solidAt && this.game.solidAt(front.x, 2 * a.sc, front.z)) {
                        if (!a.honk) { a.honk = true; sfx.thump(14); this.fx.pow(front.x, 7 * a.sc, front.z, '쾅!!', 2.6 * a.sc, '#f2b630'); this.game.shake(0.45); }
                        this.fx.sparks(front.x, 2 * a.sc, front.z, 6);
                        this.game.shake(0.06);
                    }
                }
                if (e >= 1) { this.truck.visible = false; this.active.splice(i, 1); }
            } else if (a.kind === 'missile') {
                const e = Math.min(1, a.t / a.dur);
                const m = this.missile;
                m.position.lerpVectors(a.from, a.to, e * e);
                // 꼬리 불꽃과 하얀 연기 줄
                _v.subVectors(a.from, a.to).normalize().multiplyScalar(2.6 * a.s).add(m.position);
                this.fx.flames.spawn(_v.x, _v.y, _v.z, 0, 0, 0, 1.6 * a.s, 0.22, 0.9, Math.random(), 0.2);
                this.fx.smoke.spawn(_v.x, _v.y, _v.z, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), 1.8 * a.s, 1.6, 0.45, 0.78, 0.9);
                if (e >= 1) {
                    m.visible = false;
                    this.active.splice(i, 1);
                    this.game.miniNuke(a.to, a.dir);
                }
            } else if (a.kind === 'hole') {
                const e = a.t / a.dur;
                // 커지면서 빨아들이다가 마지막 0.25초에 확 오그라든 뒤 터짐
                const grow = Math.min(1, a.t * 2.5);
                const end = e > 0.93 ? Math.max(0.05, 1 - (e - 0.93) / 0.07) : 1;
                this.hole.scale.setScalar(grow * end * (1 + Math.sin(a.t * 30) * 0.04));
                this.holeRing.rotation.x = -Math.PI / 2 + 0.35 + Math.sin(a.t * 1.7) * 0.15;
                this.holeRing.rotation.z -= dt * 5;
                this.holeRing2.rotation.x = Math.PI / 2.3;
                this.holeRing2.rotation.z += dt * 3;
                this.holeHalo.material.opacity = 0.7 + Math.sin(a.t * 12) * 0.2;
                this.fx.swirl(a.at.x, a.at.y, a.at.z, 12, this.fx.mobile ? 2 : 4);
                // 빨려 들어가는 빛줄기
                if (Math.random() < 0.6) {
                    const ang = Math.random() * Math.PI * 2, r = 9 + Math.random() * 5;
                    this.fx.flames.spawn(a.at.x + Math.cos(ang) * r, a.at.y + (Math.random() - 0.5) * 4, a.at.z + Math.sin(ang) * r,
                        -Math.cos(ang) * 22 - Math.sin(ang) * 10, 0, -Math.sin(ang) * 22 + Math.cos(ang) * 10, 0.9, 0.45, 0.7, 0.2, 0);
                }
                this.game.pull(a.at, WEAPONS[6].radius, 70, dt);
                this.game.shake(0.08);
                if (e >= 1) {
                    this.active.splice(i, 1);
                    this.hole.visible = false;
                    this.fx.explosion(a.at.x, a.at.y, a.at.z, 7 * this._fs(), { ring: false });
                    this.fx.ring(a.at.x, Math.max(0.3, a.at.y - 3), a.at.z, 22, 0xe9d5ff);
                    this.fx.pow(a.at.x, a.at.y + 4, a.at.z, '펑!!', 3.2, '#e9d5ff');
                    sfx.boom(true);
                    this.game.shake(0.8);
                    if (this.game.hitStop) this.game.hitStop(0.08);
                    this.game.hit(a.at, { id: 'holeblast', radius: 7, force: WEAPONS[6].force, vaporize: 0.3 }, a.dir);
                }
            } else if (a.kind === 'ball') {
                // 진자처럼: 양 끝에서 느리고 가운데(조준한 곳)에서 가장 빠르다
                const e = Math.min(1, a.t / a.dur);
                const ang = -1.15 * Math.cos(Math.PI * e);
                const p = this.ball.position.copy(a.pivot).addScaledVector(a.right, Math.sin(ang) * a.L).addScaledVector(UP, -Math.cos(ang) * a.L);
                this.ball.quaternion.setFromUnitVectors(UP, _v2.subVectors(a.pivot, p).normalize());
                // 쇠줄: 매단 점에서 쇠공 고리까지
                _v.subVectors(p, a.pivot);
                const L = _v.length() - 2.5 * a.s;
                this.chain.position.copy(a.pivot);
                this.chain.quaternion.setFromUnitVectors(_v2.set(0, -1, 0), _v.normalize());
                this.chain.scale.set(a.s, Math.max(0.1, L), a.s);
                a.hitT -= dt;
                if (Math.abs(ang) < 0.6 && a.hitT <= 0) {
                    // 너무 자주 부수면 계산이 몰려 끊김 → 0.08초마다
                    a.hitT = 0.08;
                    if (a.first) {
                        a.first = false;
                        sfx.hammer(); sfx.thump(14);
                        this.game.shake(0.5);
                        this.fx.pow(p.x, p.y + 3 * a.s, p.z, '쿵!', 2.6 * a.s, '#ffd23f');
                        this.fx.dust(p.x, p.y, p.z, 14, 3 * a.s, 2);
                    }
                    if (Math.random() < 0.4) this.fx.dust(p.x, p.y, p.z, 3, 2 * a.s, 1.4);
                    this.game.hit(p.clone(), a.spec, a.right);
                }
                if (e >= 1) {
                    this.active.splice(i, 1);
                    this.ball.visible = this.chain.visible = false;
                }
            } else if (a.kind === 'nukefall') {
                const e = Math.min(1, a.t / a.dur);
                a.mesh.position.lerpVectors(a.from, a.to, e * e);
                if (e >= 1) {
                    this._remove(i, a);
                    this.game.nukeBlast(a.to, a.dir);
                }
            }
        }
    }

    _remove(i, a) {
        if (a.mesh) this.scene.remove(a.mesh);
        this.active.splice(i, 1);
    }

    clear() {
        for (const a of this.active) if (a.mesh) this.scene.remove(a.mesh);
        this.active.length = 0;
        for (const h of this.fists) { h.t = -1; h.group.visible = false; }
        this.hole.visible = false;
        this.ball.visible = this.chain.visible = false;
        this.missile.visible = false;
        this.truck.visible = false;
        this.flash.visible = false;
    }
}
