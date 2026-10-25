import * as THREE from 'three';

const GRAV = -24;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export function labelTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}

export const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';

function fitFont(g, text, maxW, size, weight = 900) {
    let s = size;
    do {
        g.font = `${weight} ${s}px ${FONT}`;
        s -= 2;
    } while (g.measureText(text).width > maxW && s > 10);
}

/** 바닥(발)이 원점인 물체를 떨어뜨리고 굴린다. 딛는 면은 월드가 알려준다. */
class Rigid {
    constructor(obj) {
        this.obj = obj;
        this.vel = new THREE.Vector3();
        this.ang = new THREE.Vector3();
        this.flying = false;
    }

    launch(vx, vy, vz, spin) {
        this.flying = true;
        this.vel.set(vx, vy, vz);
        this.ang.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
    }

    /** 반환: 착지 속도 (착지 안 했으면 0) */
    step(dt, world, gravScale = 1, drag = 0) {
        if (!this.flying) return 0;
        const p = this.obj.position;
        this.vel.y += GRAV * gravScale * dt;
        if (drag) this.vel.multiplyScalar(1 - drag * dt);
        const ny = p.y + this.vel.y * dt;
        const nx = p.x + this.vel.x * dt;
        const nz = p.z + this.vel.z * dt;
        if (world.blocked(nx, Math.max(ny, p.y) + 0.5, nz, null) && this.vel.y > -2) {
            this.vel.x *= -0.3; this.vel.z *= -0.3;
        } else {
            p.x = nx; p.z = nz;
        }
        const top = world.surface(p.x, Math.max(p.y, ny + 0.3), p.z, null);
        if (ny <= top && this.vel.y <= 0) {
            p.y = top;
            const sp = -this.vel.y;
            if (sp > 7) {
                this.vel.y = sp * 0.3;
                this.vel.x *= 0.6; this.vel.z *= 0.6;
                this.ang.multiplyScalar(0.6);
                return sp;
            }
            this.flying = false;
            this.vel.set(0, 0, 0);
            return Math.max(sp, 0.01);
        }
        p.y = ny;
        const w = this.ang.length();
        if (w > 0.01) {
            _q.setFromAxisAngle(_v.copy(this.ang).divideScalar(w), w * dt);
            this.obj.quaternion.premultiply(_q);
        }
        if (p.y < -30) { p.y = 0; this.flying = false; }
        return 0;
    }
}

const SUIT = 0x283247, SKIN = 0xf2c39b, SHIRT = 0xffffff, TIE = 0xd8333a;

export class Boss {
    constructor(scene) {
        const g = this.group = new THREE.Group();
        const lam = c => new THREE.MeshLambertMaterial({ color: c });
        const box = (w, h, d, c, x, y, z, parent) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c));
            m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
        };
        this.body = new THREE.Group();
        g.add(this.body);
        const B = this.body;
        box(0.34, 0.85, 0.38, 0x1d2333, -0.22, 0.43, 0, B);
        box(0.34, 0.85, 0.38, 0x1d2333, 0.22, 0.43, 0, B);
        box(0.4, 0.16, 0.56, 0x111111, -0.22, 0.08, 0.07, B);
        box(0.4, 0.16, 0.56, 0x111111, 0.22, 0.08, 0.07, B);
        this.suitMat = lam(SUIT);
        const belly = new THREE.Mesh(new THREE.SphereGeometry(0.66, 20, 14), this.suitMat);
        belly.scale.set(1, 1.05, 0.88); belly.position.set(0, 1.42, 0); belly.castShadow = true; B.add(belly);
        this.belly = belly;
        const shirt = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), lam(SHIRT));
        shirt.rotation.x = Math.PI / 2 - 0.25; shirt.position.set(0, 1.62, 0.36); shirt.scale.set(0.7, 1, 0.6); B.add(shirt);
        this.tie = box(0.13, 0.55, 0.06, TIE, 0, 1.5, 0.6, B);
        // 목걸이 (여성 상사)
        this.necklace = new THREE.Group();
        for (let i = 0; i < 9; i++) {
            const a = -0.9 + i * 0.225;
            const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), lam(0xf5f0e6));
            pearl.position.set(Math.sin(a) * 0.3, 1.78 - Math.cos(a) * 0.16 + 0.08, 0.42 + Math.cos(a) * 0.05);
            this.necklace.add(pearl);
        }
        this.necklace.visible = false;
        B.add(this.necklace);
        this.armL = new THREE.Group(); this.armL.position.set(-0.68, 1.8, 0); B.add(this.armL);
        this.armR = new THREE.Group(); this.armR.position.set(0.68, 1.8, 0); B.add(this.armR);
        const arm = (parent) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.28), this.suitMat);
            m.position.set(0, -0.38, 0); m.castShadow = true; parent.add(m);
        };
        arm(this.armL);
        box(0.22, 0.2, 0.22, SKIN, 0, -0.84, 0, this.armL);
        arm(this.armR);
        box(0.22, 0.2, 0.22, SKIN, 0, -0.84, 0, this.armR);
        this.head = new THREE.Group(); this.head.position.set(0, 2.42, 0); B.add(this.head);
        const H = this.head;
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.46, 22, 16), new THREE.MeshPhongMaterial({ color: SKIN, shininess: 60 }));
        skull.castShadow = true; H.add(skull);
        // 눈 + 찡그린 눈썹 (안경을 벗겨도 얼굴이 비지 않게)
        const eyeMat = lam(0x1a1a1a), whiteMat = lam(0xffffff);
        for (const s of [-1, 1]) {
            const white = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), whiteMat);
            white.scale.set(1, 0.8, 0.4); white.position.set(s * 0.16, 0.05, 0.43); H.add(white);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), eyeMat);
            pupil.scale.set(1, 1, 0.5); pupil.position.set(s * 0.155, 0.045, 0.46); H.add(pupil);
            const brow = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.03), lam(0x2b2420));
            brow.position.set(s * 0.17, 0.2, 0.43); brow.rotation.z = s * 0.32; H.add(brow);
        }
        this.glasses = new THREE.Group();
        for (const x of [-0.16, 0.16]) {
            const r = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 16), lam(0x111111));
            r.position.set(x, 0.05, 0.42); this.glasses.add(r);
        }
        box(0.1, 0.025, 0.02, 0x111111, 0, 0.06, 0.43, this.glasses);
        H.add(this.glasses);
        this.mustache = box(0.34, 0.09, 0.08, 0x3b2a20, 0, -0.14, 0.42, H);
        this.mouthMat = lam(0x7a1f1f);
        this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), this.mouthMat);
        this.mouth.position.set(0, -0.25, 0.42); H.add(this.mouth);
        this.hair = null;
        // 이름표: 머리 위에 늘 카메라를 보는 판
        this.plateMat = new THREE.SpriteMaterial({ transparent: true });
        this.plate = new THREE.Sprite(this.plateMat);
        this.plate.position.set(0, 3.55, 0);
        this.plate.scale.set(2.6, 0.62, 1);
        this.plate.visible = false;
        g.add(this.plate);
        this.setLook({});
        this.stars = new THREE.Group(); this.stars.position.set(0, 3.05, 0); g.add(this.stars);
        for (let i = 0; i < 3; i++) {
            const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
            s.position.set(Math.cos(i * 2.09) * 0.5, 0, Math.sin(i * 2.09) * 0.5);
            this.stars.add(s);
        }
        this.stars.visible = false;
        this.size = 1.6;
        g.scale.setScalar(this.size);
        scene.add(g);
        this.rigid = new Rigid(g);
        this.meshes = [];
        g.traverse(o => { if (o.isMesh) this.meshes.push(o); });
    }

    reset(x, y, z, size = 1.6) {
        this.size = size;
        this.group.scale.setScalar(size);
        this.group.position.set(x, y, z);
        this.group.quaternion.identity();
        this.rigid.flying = false;
        this.state = 'stand';
        this.timer = 0;
        this.talk = 0;
        this.hitCool = 0;
        this.stars.visible = false;
        this.stars.position.set(0, 3.05, 0);
    }

    /**
     * 상사 꾸미기. look = { gender: 'm'|'f', hair, glasses: bool, suit, label }
     * hair: bald 대머리 | part 가르마 | slick 올백 | perm 파마 | bob 단발 | long 긴머리 | pony 묶음
     */
    setLook(look) {
        const L = { gender: 'm', hair: 'bald', glasses: true, suit: 'navy', label: '', ...look };
        const SUITS = { navy: 0x283247, gray: 0x6b7280, black: 0x1a1a1f, brown: 0x6d4c41, wine: 0x7b2d3b };
        this.suitMat.color.setHex(SUITS[L.suit] || SUITS.navy);
        const f = L.gender === 'f';
        this.glasses.visible = !!L.glasses;
        this.mustache.visible = !f;
        this.tie.visible = !f;
        this.necklace.visible = f;
        this.mouthMat.color.setHex(f ? 0xd0344a : 0x7a1f1f);
        this.belly.scale.set(f ? 0.86 : 1, f ? 1.0 : 1.05, f ? 0.78 : 0.88);
        if (this.hair) { this.head.remove(this.hair); this.hair.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
        this.hair = hairMesh(L.hair, L.hair === 'bald' ? 0x5a5a5a : (f ? 0x2b201b : 0x24211f));
        this.head.add(this.hair);
        if (this.plateMat.map) this.plateMat.map.dispose();
        this.plateMat.map = L.label ? labelTexture(512, 120, (g, w, h) => {
            g.fillStyle = 'rgba(216,51,58,0.95)'; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 30); g.fill();
            g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
            fitFont(g, L.label, w - 50, 70);
            g.fillText(L.label, w / 2, h / 2 + 3);
        }) : null;
        this.plateMat.needsUpdate = true;
        this.plate.visible = !!L.label;
        this.meshes = [];
        this.group.traverse(o => { if (o.isMesh) this.meshes.push(o); });
    }

    say() { this.talk = 1.6; }

    headPos(out) { return out.set(0, this.plate.visible ? 4.05 : 3.25, 0).applyMatrix4(this.group.matrixWorld); }
    center(out) { return out.set(0, 1.4, 0).applyMatrix4(this.group.matrixWorld); }

    knock(dir, force) {
        if (this.hitCool > 0) return false;
        this.hitCool = 0.3;
        this.state = 'fly';
        this.stars.visible = false;
        this.rigid.launch(dir.x * force * 0.7, 7 + force * 0.45, dir.z * force * 0.7, 10);
        return true;
    }

    /** 블랙홀 등 외부 힘. 날고 있지 않으면 띄운다 */
    push(vx, vy, vz) {
        if (this.state !== 'fly') { this.state = 'fly'; this.rigid.launch(0, 2, 0, 6); this.stars.visible = false; }
        this.rigid.vel.x += vx; this.rigid.vel.y += vy; this.rigid.vel.z += vz;
    }

    /** 반환: 'fall' | 'land' | 'bounce' | 'up' | null */
    update(dt, time, world, camPos) {
        this.hitCool -= dt;
        const g = this.group;
        let ev = null;
        if (this.talk > 0) {
            this.talk -= dt;
            this.mouth.scale.y = 1 + Math.abs(Math.sin(time * 22)) * 3;
        } else this.mouth.scale.y = 1;

        if (this.state === 'stand') {
            const p = g.position;
            const top = world.surface(p.x, p.y + 0.05, p.z, null);
            if (top < p.y - 0.25) {
                this.state = 'fly';
                this.rigid.launch(0, 0, 0, 2);
                ev = 'fall';
            } else {
                p.y = Math.max(p.y, top);
                const yaw = Math.atan2(camPos.x - p.x, camPos.z - p.z);
                _q.setFromAxisAngle(UP, yaw);
                g.quaternion.slerp(_q, Math.min(1, dt * 4));
                this.body.position.y = Math.abs(Math.sin(time * 3)) * 0.06;
                this.armR.rotation.z = 2.4 + Math.sin(time * 6) * 0.35;
                this.armR.rotation.x = -0.3;
                this.armL.rotation.z = -0.25 + Math.sin(time * 3) * 0.1;
                this.head.rotation.z = Math.sin(time * 2.2) * 0.08;
            }
        }
        if (this.state === 'fly') {
            this.armR.rotation.z = 2.6 + Math.sin(time * 30) * 0.6;
            this.armL.rotation.z = -2.6 - Math.sin(time * 30) * 0.6;
            const land = this.rigid.step(dt, world);
            if (land > 0 && !this.rigid.flying) {
                this.state = 'down';
                this.timer = 2.2;
                this.stars.visible = true;
                _e.set(-Math.PI / 2, Math.random() * Math.PI * 2, 0, 'YXZ');
                this.lieQ = new THREE.Quaternion().setFromEuler(_e);
                ev = 'land';
            } else if (land > 0) ev = 'bounce';
        }
        if (this.state === 'down') {
            g.quaternion.slerp(this.lieQ, Math.min(1, dt * 10));
            this.armR.rotation.z = 1.2; this.armL.rotation.z = -1.2;
            this.stars.rotation.y += dt * 6;
            this.stars.position.set(0, 0.6, 2.9);
            this.timer -= dt;
            const p = g.position;
            if (world.surface(p.x, p.y + 0.05, p.z, null) < p.y - 0.25) { this.rigid.launch(0, 0, 0, 1); this.state = 'fly'; }
            else if (this.timer <= 0) { this.state = 'rise'; this.timer = 0.5; this.stars.visible = false; ev = 'up'; }
        }
        if (this.state === 'rise') {
            const yaw = Math.atan2(camPos.x - g.position.x, camPos.z - g.position.z);
            _q2.setFromAxisAngle(UP, yaw);
            g.quaternion.slerp(_q2, Math.min(1, dt * 8));
            this.timer -= dt;
            if (this.timer <= 0) { this.state = 'stand'; this.stars.position.set(0, 3.05, 0); }
        }
        return ev;
    }
}

/** 머리 모양. 머리 그룹 기준 좌표(머리 반지름 0.46, 얼굴은 +z) */
function hairMesh(style, color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color });
    const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); m.castShadow = true;
        g.add(m);
        return m;
    };
    // 정수리 덮개: 위쪽 반구, 앞이마는 조금 열어 둔다
    const cap = (theta = Math.PI * 0.42, r = 0.49) => add(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, theta), 0, 0.02, -0.02, -0.18);
    // 얼굴만 뚫린 옆·뒷머리 (원통의 앞쪽을 비운다. three.js 원통은 각도 0 이 +z)
    const skirt = (h, y, r0 = 0.5, r1 = 0.53) => add(new THREE.CylinderGeometry(r0, r1, h, 20, 1, true, 0.95, Math.PI * 2 - 1.9), 0, y, -0.02);
    switch (style) {
        case 'part':
            cap();
            add(new THREE.BoxGeometry(0.03, 0.02, 0.4), -0.15, 0.47, 0.05, -0.2);
            add(new THREE.BoxGeometry(0.1, 0.3, 0.34), -0.44, -0.02, -0.06);
            add(new THREE.BoxGeometry(0.1, 0.3, 0.34), 0.44, -0.02, -0.06);
            break;
        case 'slick':
            cap(Math.PI * 0.46, 0.485).rotation.x = -0.32;
            add(new THREE.BoxGeometry(0.36, 0.26, 0.14), 0, -0.02, -0.42);
            break;
        case 'perm':
            for (let i = 0; i < 22; i++) {
                const a = i * 2.39996, t = Math.acos(1 - (i + 0.5) / 22 * 1.15);
                if (Math.cos(a) > 0.55 && t > 0.75) continue;
                add(new THREE.SphereGeometry(0.15, 8, 6), Math.sin(t) * Math.sin(a) * 0.47, Math.cos(t) * 0.47 + 0.04, Math.sin(t) * Math.cos(a) * 0.47 - 0.04);
            }
            break;
        case 'bob':
            cap(Math.PI * 0.5);
            skirt(0.5, -0.18);
            add(new THREE.SphereGeometry(0.5, 16, 8, Math.PI / 2 - 0.95, 1.9, 0.3, 0.55), 0, 0.03, 0.02);
            break;
        case 'long':
            cap(Math.PI * 0.5);
            skirt(1.0, -0.42, 0.5, 0.58);
            add(new THREE.SphereGeometry(0.5, 16, 8, Math.PI / 2 - 0.95, 1.9, 0.3, 0.55), 0, 0.03, 0.02);
            break;
        case 'pony':
            cap(Math.PI * 0.5);
            add(new THREE.SphereGeometry(0.15, 10, 8), 0, 0.12, -0.52);
            add(new THREE.CylinderGeometry(0.1, 0.05, 0.6, 8), 0, -0.2, -0.6, 0.25);
            break;
        default: // bald: 옆·뒤만 희끗
            add(new THREE.BoxGeometry(0.12, 0.32, 0.36), -0.44, -0.02, -0.06);
            add(new THREE.BoxGeometry(0.12, 0.32, 0.36), 0.44, -0.02, -0.06);
            add(new THREE.BoxGeometry(0.36, 0.2, 0.12), 0, 0, -0.42);
    }
    return g;
}

/** 옥상 간판. 다리 밑이 꺼지면 떨어진다. */
export class Sign {
    constructor(scene) {
        this.group = new THREE.Group();
        this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const dark = new THREE.MeshLambertMaterial({ color: 0x1f2a44 });
        this.board = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, 0.35), [dark, dark, dark, dark, this.mat, dark]);
        this.board.castShadow = true;
        this.group.add(this.board);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x444b55 });
        this.legs = [0, 1].map(() => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), legMat);
            this.group.add(leg);
            return leg;
        });
        scene.add(this.group);
        this.rigid = new Rigid(this.group);
        this.meshes = [this.board];
    }

    setName(text) {
        if (this.mat.map) this.mat.map.dispose();
        this.mat.map = labelTexture(1024, 192, (g, w, h) => {
            g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, h);
            g.fillStyle = '#d8333a'; g.fillRect(0, h - 18, w, 18);
            g.fillStyle = '#1f2a44';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            fitFont(g, text, w - 60, 120);
            g.fillText(text, w / 2, h / 2 - 6);
        });
        this.mat.needsUpdate = true;
    }

    /** 대상 건물 옥상, 카메라 반대쪽 가장자리에 카메라를 향해 세운다 */
    reset(b, camDir) {
        const s = Math.min(3, Math.max(1, b.top / 30));
        this.group.scale.setScalar(s);
        const w = Math.min(16, Math.max(6, Math.sqrt(b.area) * 0.75)) / s;
        this.w = w;
        this.board.scale.x = w;
        this.board.position.y = 2.3;
        this.legs[0].position.set(-w / 2 + 0.8, 0.55, 0);
        this.legs[1].position.set(w / 2 - 0.8, 0.55, 0);
        // 중심에서 카메라 반대 방향으로 지붕 안쪽 끝을 찾는다
        // 양쪽 다리와 가운데가 모두 지붕 안에 드는 데까지만 뒤로 물러난다
        const rx = camDir.z, rz = -camDir.x, half = (w / 2 - 0.8) * s;
        const fits = (x, z) => pointInRoof(b, x, z) && pointInRoof(b, x + rx * half, z + rz * half) && pointInRoof(b, x - rx * half, z - rz * half);
        let x = b.cx, z = b.cz;
        for (let d = 0; d < 60; d += 0.5) {
            const tx = b.cx - camDir.x * d, tz = b.cz - camDir.z * d;
            if (!fits(tx, tz)) break;
            x = tx; z = tz;
        }
        if (d0(x, z, b) > 1.5 * s) { x += camDir.x * 1.5 * s; z += camDir.z * 1.5 * s; }
        this.group.position.set(x, b.top, z);
        this.group.quaternion.setFromAxisAngle(UP, Math.atan2(camDir.x, camDir.z));
        this.rigid.flying = false;
        this.down = false;
        this.group.visible = true;
    }

    knock(dir, force) {
        if (this.rigid.flying) return false;
        this.rigid.launch(dir.x * force * 0.5, 5 + force * 0.3, dir.z * force * 0.5, 4);
        return true;
    }

    /** 반환: 'fall' 처음 떨어질 때 */
    update(dt, world) {
        let ev = null;
        if (!this.rigid.flying && !this.down) {
            const p = this.group.position;
            let lost = 0;
            for (const leg of [...this.legs, this.board]) {
                _v.copy(leg.position).setY(0).multiplyScalar(this.group.scale.x).applyQuaternion(this.group.quaternion).add(p);
                if (world.surface(_v.x, p.y + 0.05, _v.z, null) < p.y - 0.4) lost++;
            }
            if (lost >= 1) this.rigid.launch((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2, 2.5);
        }
        if (this.rigid.flying && !this.down) { this.down = true; ev = 'fall'; }
        this.rigid.step(dt, world);
        return ev;
    }
}

/** 지붕 가장자리까지 거리 (밖이면 0) */
function d0(x, z, b) {
    if (!pointInRoof(b, x, z)) return 0;
    let best = Infinity;
    const p = b.poly, n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = p[j * 2], az = p[j * 2 + 1], dx = p[i * 2] - ax, dz = p[i * 2 + 1] - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
    }
    return best;
}

function pointInRoof(b, x, z) {
    let inside = false;
    const p = b.poly, n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

/** 외벽 현수막. 매단 벽이 무너지면 펄럭이며 떨어진다. */
export class Banner {
    constructor(scene) {
        this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 16, 1), this.mat);
        this.group = new THREE.Group();
        this.group.add(this.mesh);
        scene.add(this.group);
        this.rigid = new Rigid(this.group);
        this.base = this.mesh.geometry.attributes.position.array.slice();
    }

    setText(top, name, bottom) {
        if (this.mat.map) this.mat.map.dispose();
        this.mat.map = labelTexture(1024, 140, (g, w, h) => {
            g.fillStyle = '#d8333a'; g.fillRect(0, 0, w, h);
            g.fillStyle = '#fff';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            const s = name.replace(/\s/g, '').includes(top.replace(/\s/g, '')) ? `${name} — ${bottom}` : `${top} ${name} — ${bottom}`;
            fitFont(g, s, w - 50, 64, 800);
            g.fillText(s, w / 2, h / 2 + 2);
        });
        this.mat.needsUpdate = true;
    }

    /** 카메라 쪽을 가장 많이 보는 긴 벽에 건다 */
    reset(b, camDir) {
        const p = b.poly, n = p.length / 2;
        const sign = signedArea(p) < 0 ? 1 : -1;
        let best = null, bestScore = -Infinity;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
            const L = Math.hypot(bx - ax, bz - az);
            if (L < 5) continue;
            const nx = sign * -(bz - az) / L, nz = sign * (bx - ax) / L;
            const face = nx * camDir.x + nz * camDir.z;
            const score = face * Math.min(L, 30);
            if (score > bestScore) { bestScore = score; best = { ax, az, bx, bz, L, nx, nz }; }
        }
        this.group.visible = !!best && bestScore > 0;
        this.down = false;
        this.rigid.flying = false;
        if (!this.group.visible) return;
        const w = Math.min(best.L * 0.8, 28);
        const h = Math.max(1.4, w * 0.09);
        this.mesh.scale.set(w, h, 1);
        this.mesh.position.y = -h / 2;
        const mx = (best.ax + best.bx) / 2, mz = (best.az + best.bz) / 2;
        const y = Math.max(h + 2, b.top * 0.72);
        const out = b.vs * 0.5 + 0.12, depth = b.vs * 0.75 + 0.3;
        this.group.position.set(mx + best.nx * out, y, mz + best.nz * out);
        this.group.quaternion.setFromAxisAngle(UP, Math.atan2(best.nx, best.nz));
        // 매단 점: 현수막 양 끝 위, 벽 살짝 안쪽
        const ux = (best.bx - best.ax) / best.L, uz = (best.bz - best.az) / best.L;
        this.anchors = [-1, 1].map(s => ({ x: mx + ux * s * w * 0.45 - best.nx * depth, y: y - 0.3, z: mz + uz * s * w * 0.45 - best.nz * depth }));
        this.w = w;
    }

    update(dt, time, world) {
        let ev = null;
        if (!this.group.visible) return null;
        if (!this.down) {
            const held = this.anchors.filter(a => world.blocked(a.x, a.y, a.z, null)).length;
            if (held < 2) {
                this.down = true;
                this.rigid.launch((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 3);
                ev = 'fall';
            }
        }
        if (this.down) this.rigid.step(dt, world, 0.35, 1.2);
        const pos = this.mesh.geometry.attributes.position;
        const amp = this.down && this.rigid.flying ? 0.5 : 0.04;
        for (let i = 0; i < pos.count; i++) {
            const x = this.base[i * 3];
            pos.array[i * 3 + 2] = Math.sin(x * 9 + time * (this.down ? 9 : 2.5)) * amp / Math.max(1, this.w * 0.05);
        }
        pos.needsUpdate = true;
        return ev;
    }
}

function signedArea(p) {
    let a = 0;
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
    }
    return a / 2;
}
