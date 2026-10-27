import * as THREE from 'three';
import { labelTexture, FONT } from './props.js';
import { sfx } from './audio.js';

// hold: 누르고 있으면 cool 간격으로 계속 쏜다.
export const WEAPONS = [
    // 빡침 펀치 (예전 망치 자리. 기록·통계 호환 때문에 id 는 hammer 그대로)
    { id: 'hammer', icon: '👊', cool: 0.16, hold: true, radius: 2.8, force: 16 },
    { id: 'gun', icon: '📎', cool: 0.065, hold: true, radius: 1.1, force: 7 },
    { id: 'bomb', icon: '✉️', cool: 0.55, hold: true, radius: 5.2, force: 24, vaporize: 0.22 },
    { id: 'flame', icon: '🔥', cool: 0.05, hold: true, radius: 2.6, force: 0 },
    // 전투기가 화면 가로로 지나가며 한 줄로 차례차례 떨어뜨리는 융단폭격
    { id: 'strike', icon: '💬', cool: 4, hold: false, radius: 3.8, force: 22, vaporize: 0.15 },
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
        this._makeHammer();
        const top = new THREE.MeshLambertMaterial({ map: stamp('사직서', '#fffdf6', '#c8102e', '#c8102e') });
        const side = new THREE.MeshLambertMaterial({ color: 0xf4efe2 });
        this.bombGeo = new THREE.BoxGeometry(1.3, 0.16, 0.9);
        this.bombMats = [side, side, top, side, side, side];
        this.missile = this._makeMissile();
        this.plane = this._makePlane();
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

    /** 폭격기: 회색 동체 + 날개 + 꼬리 (앞 = -z) */
    _makePlane() {
        const g = new THREE.Group();
        const gray = new THREE.MeshLambertMaterial({ color: 0x8a96a3 });
        const dark = new THREE.MeshLambertMaterial({ color: 0x4b5563 });
        const yellow = new THREE.MeshLambertMaterial({ color: 0xfee500 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.45, 8, 12), gray);
        body.rotation.x = Math.PI / 2;
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 12), dark);
        nose.rotation.x = -Math.PI / 2; nose.position.z = -5;
        const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.18, 2.2), gray);
        wing.position.z = 0.3;
        const tailW = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 1.1), gray);
        tailW.position.z = 3.6;
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.8, 1.4), yellow);
        fin.position.set(0, 0.9, 3.6);
        g.add(body, nose, wing, tailW, fin);
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
                const h = this.hammer;
                const s = Math.max(1.1, camPos.distanceTo(point) / 28);
                h.group.position.copy(point);
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
            case 'strike': {
                // 화면 가로 방향으로 날아가며 조준한 줄에 10발을 차례로 떨어뜨림
                if (this.active.some(a => a.kind === 'plane')) { this.cool[k] = 0; return false; }
                const right = new THREE.Vector3().crossVectors(dir, UP).setY(0).normalize();
                const sc = Math.max(1, camPos.distanceTo(point) / 50);
                const alt = Math.max(point.y + 22, 34) * Math.min(1.6, sc);
                const span = 60 * sc;
                const from = point.clone().addScaledVector(right, -span).setY(alt);
                const to = point.clone().addScaledVector(right, span).setY(alt);
                const drops = [];
                for (let n = 0; n < 10; n++) drops.push({ off: (n - 4.5) * 3.6 * Math.sqrt(sc), done: false });
                this.plane.scale.setScalar(sc);
                this.plane.position.copy(from);
                this.plane.lookAt(_v.copy(from).sub(right));
                this.plane.visible = true;
                this.active.push({ kind: 'plane', from, to, right, point: point.clone(), dir: dir.clone(), t: 0, dur: 1.9, drops, span, sc });
                sfx.whoosh(1.9);
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
        const h = this.hammer;
        if (h.t >= 0) {
            h.t += dt;
            const IN = 0.07, HOLD = 0.07, OUT = 0.13;
            if (h.t < IN) {
                // 뒤로 젖혔다가 쭉 뻗음
                const e = h.t / IN;
                h.pivot.position.z = 6 * (1 - e * e) + 0.6;
            } else {
                h.pivot.position.z = 0.6;
                if (!h.hit) {
                    h.hit = true;
                    h.n++;
                    sfx.hammer();
                    const p = h.point;
                    this.game.hit(p, WEAPONS[0], h.dir);
                    this.fx.dust(p.x, p.y, p.z, 5, 1.2 * h.scale, 1.2);
                    this.fx.sparks(p.x, p.y, p.z, 5);
                    if (h.n % 2 === 1) this.fx.pow(p.x, p.y + 1.2 * h.scale, p.z, PUNCH_WORDS[Math.floor(Math.random() * PUNCH_WORDS.length)], 1.6 * h.scale);
                    this.game.shake(0.16);
                    if (this.game.hitStop) this.game.hitStop(0.045);
                }
                if (h.t > IN + HOLD) {
                    const e = Math.min(1, (h.t - IN - HOLD) / OUT);
                    h.pivot.position.z = 0.6 + e * 5;
                    h.group.scale.setScalar(h.scale * (1 - e));
                    if (e >= 1) { h.t = -1; h.group.visible = false; }
                }
            }
        }
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
                    }
                }
            } else if (a.kind === 'plane') {
                const e = Math.min(1, a.t / a.dur);
                this.plane.position.lerpVectors(a.from, a.to, e);
                this.plane.rotation.z = Math.sin(a.t * 3) * 0.08;
                const pp = this.plane.position;
                // 날개 끝 하얀 비행운
                if (Math.random() < 0.8) this.fx.smoke.spawn(pp.x - a.right.x * 3 * a.sc, pp.y, pp.z - a.right.z * 3 * a.sc, 0, 0.2, 0, 1.2 * a.sc, 1.4, 0.35, 0.9, 0.6);
                // 조준한 줄 위를 지나갈 때마다 한 발씩
                const along = (e - 0.5) * 2 * a.span;
                for (const d of a.drops) {
                    if (d.done || along < d.off) continue;
                    d.done = true;
                    const x = a.point.x + a.right.x * d.off, z = a.point.z + a.right.z * d.off;
                    const ground = this.game.surface ? this.game.surface(x, z) : 0;
                    const y = Math.max(ground, Math.min(a.point.y, ground + 30)) + 0.3;
                    const s = new THREE.Sprite(this.badgeMat);
                    s.scale.setScalar(2 * a.sc);
                    s.position.copy(pp);
                    this.scene.add(s);
                    this.active.push({ kind: 'drop', mesh: s, from: pp.clone(), to: new THREE.Vector3(x, y, z), dir: a.dir, t: 0, dur: 0.45 });
                }
                if (e >= 1) { this.plane.visible = false; this.active.splice(i, 1); }
            } else if (a.kind === 'drop') {
                const e = Math.min(1, a.t / a.dur);
                a.mesh.position.lerpVectors(a.from, a.to, e * e);
                if (e >= 1) {
                    this._remove(i, a);
                    const R = 3.2 * this._fs();
                    _v.copy(a.to).addScaledVector(a.dir, -R * 1.1);
                    this.fx.explosion(_v.x, _v.y, _v.z, R, { ball: 1.5 });
                    if (Math.random() < 0.35) this.fx.pow(a.to.x, a.to.y + 2.5, a.to.z, '쾅!', 1.8, '#fee500');
                    sfx.boom(false);
                    this.game.shake(0.28);
                    this.game.hit(a.to, WEAPONS[4], a.dir);
                }
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
                    a.hitT = 0.045;
                    if (a.first) {
                        a.first = false;
                        sfx.hammer(); sfx.thump(14);
                        this.game.shake(0.5);
                        if (this.game.hitStop) this.game.hitStop(0.07);
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
        this.hammer.t = -1;
        this.hammer.group.visible = false;
        this.hole.visible = false;
        this.ball.visible = this.chain.visible = false;
        this.missile.visible = false;
        this.plane.visible = false;
        this.flash.visible = false;
    }
}
