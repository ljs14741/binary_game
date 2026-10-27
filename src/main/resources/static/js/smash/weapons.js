import * as THREE from 'three';
import { labelTexture, FONT } from './props.js';
import { sfx } from './audio.js';

// hold: 누르고 있으면 cool 간격으로 계속 쏜다.
export const WEAPONS = [
    { id: 'hammer', icon: '🔨', cool: 0.12, hold: true, radius: 2.3, force: 12 },
    { id: 'gun', icon: '📎', cool: 0.065, hold: true, radius: 1.1, force: 7 },
    { id: 'bomb', icon: '✉️', cool: 0.55, hold: true, radius: 4.8, force: 22, vaporize: 0.2 },
    { id: 'flame', icon: '🔥', cool: 0.05, hold: true, radius: 2.6, force: 0 },
    { id: 'strike', icon: '💬', cool: 3.2, hold: false, radius: 4, force: 21, vaporize: 0.15 },
    // 미사일이 떨어져 버섯구름을 피움 (필살기의 작은 판)
    { id: 'nuke', icon: '☢️', cool: 3.5, hold: false, radius: 9.5, force: 40, vaporize: 0.4 },
    { id: 'hole', icon: '🌀', cool: 7, hold: false, radius: 13, force: 30 },
    // 철거 현장의 쇠공: 크레인에 매달려 옆으로 휘두르며 지나가는 자리를 한 줄로 부순다
    { id: 'ball', icon: '🏗️', cool: 1.5, hold: true, radius: 3.2, force: 26 },
];
export const NUKE = { id: 'nuke', radius: 16, force: 48, vaporize: 0.5 };

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

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
        const badge = labelTexture(128, 128, (g) => {
            g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#fff'; g.font = `900 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('999+', 64, 68);
        });
        this.badgeMat = new THREE.SpriteMaterial({ map: badge });
        // 스테이플러 탄: 짧은 선
        this.tracers = [];
        const tg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
        for (let i = 0; i < 10; i++) {
            const l = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true }));
            l.visible = false; l.frustumCulled = false;
            scene.add(l);
            this.tracers.push({ line: l, t: 0 });
        }
        this.tracerNext = 0;
        // 블랙홀
        this.holeCore = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x0a0612 }));
        this.holeRing = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.35, 10, 48), new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.85 }));
        this.holeRing2 = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.18, 8, 48), new THREE.MeshBasicMaterial({ color: 0xff7ad9, transparent: true, opacity: 0.6 }));
        this.hole = new THREE.Group();
        this.hole.add(this.holeCore, this.holeRing, this.holeRing2);
        this.hole.visible = false;
        scene.add(this.hole);
        // 레킹볼: 쇠공 + 쇠사슬(선 하나)
        this.ball = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 14), new THREE.MeshLambertMaterial({ color: 0x2b2f36 }));
        this.ball.castShadow = true;
        this.ball.visible = false;
        this.chain = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]),
            new THREE.LineBasicMaterial({ color: 0x1f2328 }));
        this.chain.frustumCulled = false;
        this.chain.visible = false;
        scene.add(this.ball, this.chain);
    }

    _makeHammer() {
        const g = new THREE.Group();
        const pivot = new THREE.Group();
        pivot.position.set(0, 0.5, 2.4);
        g.add(pivot);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 10), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
        handle.rotation.x = Math.PI / 2;
        handle.position.set(0, -0.25, -1.2);
        const faceMat = new THREE.MeshLambertMaterial({ map: stamp('야근', '#3a3f47', '#ffd23f', '#ffd23f') });
        const steel = new THREE.MeshLambertMaterial({ color: 0x4a5059 });
        const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.8), [faceMat, faceMat, steel, steel, steel, steel]);
        head.position.set(0, -0.5, -2.4);
        pivot.add(handle, head);
        g.visible = false;
        this.scene.add(g);
        this.hammer = { group: g, pivot, t: -1 };
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
                h.group.rotation.set(0, Math.atan2(camPos.x - point.x, camPos.z - point.z), 0);
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
                tr.line.visible = true; tr.t = 0.06;
                sfx.gun();
                this.fx.sparks(point.x, point.y, point.z, 4);
                this.game.hit(point, w, dir);
                break;
            }
            case 'bomb': {
                const m = new THREE.Mesh(this.bombGeo, this.bombMats.map(x => x.clone()));
                m.castShadow = true;
                const from = this._muzzle(camPos, dir, new THREE.Vector3());
                m.position.copy(from);
                this.scene.add(m);
                this.active.push({ kind: 'bomb', mesh: m, from, to: point.clone(), dir: dir.clone(), t: 0, dur: 0.3 + from.distanceTo(point) * 0.006, fuse: 0.5, spin: 10 + Math.random() * 6 });
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
                // 화면 가로 방향으로 한 줄
                const right = new THREE.Vector3().crossVectors(dir, UP).normalize();
                for (let i = 0; i < 8; i++) {
                    const off = (i - 3.5) * 3.6;
                    const to = point.clone().addScaledVector(right, off);
                    to.y = Math.max(point.y + (Math.random() - 0.5) * 2, 0.5);
                    const s = new THREE.Sprite(this.badgeMat);
                    s.scale.setScalar(2.2);
                    const from = to.clone().add(_v.set(-dir.x * 8, 40 + i * 2, -dir.z * 8));
                    s.position.copy(from);
                    this.scene.add(s);
                    this.active.push({ kind: 'strike', mesh: s, from, to, dir: dir.clone(), t: -i * 0.12, dur: 0.75 });
                }
                sfx.whoosh(1.2);
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
        for (const tr of this.tracers) {
            if (!tr.line.visible) continue;
            tr.t -= dt;
            tr.line.material.opacity = Math.max(0, tr.t / 0.06);
            if (tr.t <= 0) tr.line.visible = false;
        }
        const h = this.hammer;
        if (h.t >= 0) {
            h.t += dt;
            const SWING = 0.075, HOLD = 0.09, OUT = 0.14;
            if (h.t < SWING) {
                const e = h.t / SWING;
                h.pivot.rotation.x = 1.7 * (1 - e * e);
            } else {
                h.pivot.rotation.x = 0;
                if (!h.hit) {
                    h.hit = true;
                    sfx.hammer();
                    this.game.hit(h.point, WEAPONS[0], h.dir);
                }
                if (h.t > SWING + HOLD) {
                    const e = Math.min(1, (h.t - SWING - HOLD) / OUT);
                    h.pivot.rotation.x = e * 0.9;
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
                    a.mesh.scale.setScalar(1 + (0.5 - a.fuse) * 1.2);
                    if (!a.ticked) { a.ticked = true; sfx.tick(); }
                    if (a.fuse <= 0) {
                        this._remove(i, a);
                        this.fx.blast(a.to.x, a.to.y, a.to.z, WEAPONS[2].radius);
                        this.fx.papersBurst(a.to.x, a.to.y, a.to.z, 14, 1.4);
                        sfx.boom(false);
                        this.game.shake(0.5);
                        this.game.hit(a.to, WEAPONS[2], a.dir);
                    }
                }
            } else if (a.kind === 'strike') {
                if (a.t < 0) continue;
                const e = Math.min(1, a.t / a.dur);
                a.mesh.position.lerpVectors(a.from, a.to, e * e);
                if (e >= 1) {
                    this._remove(i, a);
                    this.fx.blast(a.to.x, a.to.y, a.to.z, WEAPONS[4].radius);
                    sfx.boom(false);
                    this.game.shake(0.35);
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
                const grow = Math.min(1, a.t * 3);
                this.hole.scale.setScalar(grow * (1 + Math.sin(a.t * 30) * 0.04));
                this.holeRing.rotation.x = Math.PI / 2 + Math.sin(a.t * 2) * 0.3;
                this.holeRing.rotation.z += dt * 6;
                this.holeRing2.rotation.y += dt * 4;
                this.holeRing2.rotation.x = Math.PI / 2.4;
                this.fx.swirl(a.at.x, a.at.y, a.at.z, 12, 3);
                this.game.pull(a.at, WEAPONS[6].radius, 70, dt);
                this.game.shake(0.08);
                if (e >= 1) {
                    this.active.splice(i, 1);
                    this.hole.visible = false;
                    this.fx.blast(a.at.x, a.at.y, a.at.z, 7, 0xc084fc);
                    this.fx.ring(a.at.x, Math.max(0.3, a.at.y - 3), a.at.z, 18, 0xe9d5ff);
                    sfx.boom(true);
                    this.game.shake(0.7);
                    this.game.hit(a.at, { id: 'holeblast', radius: 6.5, force: WEAPONS[6].force, vaporize: 0.3 }, a.dir);
                }
            } else if (a.kind === 'ball') {
                // 진자처럼: 양 끝에서 느리고 가운데(조준한 곳)에서 가장 빠르다
                const e = Math.min(1, a.t / a.dur);
                const ang = -1.15 * Math.cos(Math.PI * e);
                const p = this.ball.position.copy(a.pivot).addScaledVector(a.right, Math.sin(ang) * a.L).addScaledVector(UP, -Math.cos(ang) * a.L);
                this.ball.rotation.z += dt * 3;
                const pos = this.chain.geometry.attributes.position;
                pos.setXYZ(0, a.pivot.x, a.pivot.y, a.pivot.z);
                pos.setXYZ(1, p.x, p.y, p.z);
                pos.needsUpdate = true;
                a.hitT -= dt;
                if (Math.abs(ang) < 0.6 && a.hitT <= 0) {
                    a.hitT = 0.045;
                    if (a.first) { a.first = false; sfx.hammer(); this.game.shake(0.35); }
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
    }
}
