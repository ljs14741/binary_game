// 효과음은 Web Audio 로 합성한다. 상사 비명(voices.json)과 배경음악만 파일을 쓴다 (static/assets/smash).
let ctx = null, master = null, noiseBuf = null, muted = false;
const VOL = 0.7;
const last = {};

/**
 * 상사 비명 녹음 파일. /assets/smash/voices.json 에 파일 이름을 적어 두면 그걸 쓰고, 없거나 비어 있으면 합성음으로 낸다.
 *   { "m": { "hit": ["m-hit-1.mp3"], "fly": ["m-fly-1.mp3"] }, "f": { "hit": [...], "fly": [...] } }
 * hit = 맞을 때 짧은 "윽/아악", fly = 날아갈 때 긴 "으아아아악". 처음 소리를 켤 때 한 번 받는다.
 */
const VOICE_DIR = '/assets/smash/';
const voices = { m: { hit: [], fly: [] }, f: { hit: [], fly: [] } };
const lastVoice = {};
let voiceSrc = null;

function loadVoices() {
    fetch(VOICE_DIR + 'voices.json', { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null))
        .then(list => {
            if (!list) return;
            for (const g of ['m', 'f']) for (const k of ['hit', 'fly']) {
                for (const name of (list[g] && list[g][k]) || []) {
                    fetch(VOICE_DIR + encodeURIComponent(name))
                        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
                        .then(buf => new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej)))
                        .then(b => voices[g][k].push(b))
                        .catch(() => { /* 파일 하나가 깨져도 나머지·합성음으로 */ });
                }
            }
        })
        .catch(() => {});
}

let outNode = null, recDest = null;
/** 하이라이트 영상에 넣을 게임 소리 (소리를 아직 안 켰으면 null) */
export function audioStream() {
    if (!ctx || !outNode || !ctx.createMediaStreamDestination) return null;
    if (!recDest) { recDest = ctx.createMediaStreamDestination(); outNode.connect(recDest); }
    return recDest.stream;
}

export function initAudio() {
    if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        // 터치의 pointerdown 처럼 "허락" 이 안 되는 동작에서 처음 불렸으면 음악 재생이 막혔다 — 다음 동작에서 다시
        if (bgmVol > 0 && !muted && (!bgmEl || bgmEl.paused)) startBgm();
        return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOL;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    outNode = comp;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    loadVoices();
    if (bgmVol > 0) startBgm();
}

/*
 * 배경음악. 3분 반짜리 노래를 반복한다. 소리를 처음 켤 때(사용자 동작) 받기 시작해서 첫 화면 로딩을 막지 않는다.
 * 효과음과 같은 master 로 보내서 🔊 끄기에 같이 꺼지고, 🎵 슬라이더로 음악 볼륨만 따로 정한다 (0 이면 멈춤).
 */
const BGM_URL = VOICE_DIR + 'bgm-soyeon.mp3';
/** 슬라이더 100% 일 때 음악 크기. 효과음을 덮지 않을 만큼 */
const BGM_MAX = 0.65;
let bgmEl = null, bgmGain = null, bgmVol = 0.3;

function applyBgmVol() {
    if (bgmGain) bgmGain.gain.value = BGM_MAX * bgmVol;
    else if (bgmEl) bgmEl.volume = Math.min(1, BGM_MAX * bgmVol);
}

function startBgm() {
    if (!ctx) return;
    if (!bgmEl) {
        bgmEl = new Audio(BGM_URL);
        bgmEl.loop = true;
        bgmEl.preload = 'auto';
        try {
            const src = ctx.createMediaElementSource(bgmEl);
            bgmGain = ctx.createGain();
            src.connect(bgmGain);
            bgmGain.connect(master);
        } catch (e) {
            bgmGain = null;   // Web Audio 로 못 묶으면 그냥 재생 (element 볼륨으로)
        }
        applyBgmVol();
    }
    if (!muted && !document.hidden) bgmEl.play().catch(() => { /* 사용자 동작 전이면 다음 initAudio 때 */ });
}

function stopBgm() { if (bgmEl) bgmEl.pause(); }

/** v: 0~1. 0 이면 멈춘다 */
export function setBgmVolume(v) {
    bgmVol = Math.max(0, Math.min(1, +v || 0));
    applyBgmVol();
    if (bgmVol > 0) startBgm(); else stopBgm();
}

export function bgmVolume() { return bgmVol; }

// 탭을 숨기면 음악도 멈춘다
document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopBgm();
    else if (bgmVol > 0 && ctx) startBgm();
});

/** 합성 비명: 톱니파를 "아" 모음 대역(두 포먼트)에 통과시키고 음을 확 올렸다 떨군다. 녹음 파일이 없을 때만 */
function synthScream(female, long) {
    const t = ctx.currentTime;
    const dur = long ? 1.15 : 0.32 + Math.random() * 0.12;
    const base = (female ? 330 : 170) * (0.92 + Math.random() * 0.16);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * (long ? 2.3 : 1.9), t + dur * 0.22);
    o.frequency.exponentialRampToValueAtTime(base * (long ? 1.2 : 1.1), t + dur);
    // 떨리는 목소리
    const lfo = ctx.createOscillator();
    lfo.frequency.value = long ? 9 : 13;
    const lg = ctx.createGain();
    lg.gain.value = base * 0.06;
    lfo.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.03);
    g.gain.setValueAtTime(0.32, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f, q, v] of [[female ? 950 : 750, 6, 1], [female ? 1500 : 1200, 8, 0.6], [female ? 2900 : 2500, 10, 0.25]]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const fg = ctx.createGain();
        fg.gain.value = v;
        o.connect(bp); bp.connect(fg); fg.connect(g);
    }
    g.connect(master);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    noise(dur * 0.8, 'bandpass', female ? 2400 : 1800, 1.2, 0.05, 0.02);
}

export function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : VOL;
    // 꺼 둔 동안은 음악을 내려받지도 재생하지도 않는다
    if (m) stopBgm(); else if (bgmVol > 0) startBgm();
}

export function isMuted() { return muted; }

function ok(key, ms) {
    if (!ctx || muted) return false;
    const n = performance.now();
    if (key && last[key] && n - last[key] < ms) return false;
    if (key) last[key] = n;
    return true;
}

function noise(dur, type, freq, q, vol, attack = 0.003, delay = 0) {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.05);
    return { f, t };
}

function tone(type, f0, f1, dur, vol, delay = 0) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
}

export const sfx = {
    hammer() {
        if (!ok('hammer', 40)) return;
        tone('sine', 170, 42, 0.28, 0.9);
        noise(0.16, 'lowpass', 1100, 0.7, 0.7);
    },
    crash(n = 1) {
        if (!ok('crash', 60)) return;
        noise(0.3 + Math.min(n, 30) * 0.01, 'bandpass', 380 + Math.random() * 500, 0.7, Math.min(0.2 + n * 0.03, 0.75));
    },
    rumble(n) {
        if (!ok('rumble', 400)) return;
        noise(1.4, 'lowpass', 220, 0.6, Math.min(0.3 + n * 0.006, 0.95), 0.05);
        tone('sine', 70, 35, 1.2, 0.5);
    },
    glass(n = 1) {
        if (!ok('glass', 70)) return;
        noise(0.28, 'highpass', 3800, 0.5, Math.min(0.15 + n * 0.04, 0.45));
        for (let i = 0; i < 3; i++) {
            const f = 2400 + Math.random() * 3200;
            tone('triangle', f, f * 0.9, 0.1 + Math.random() * 0.12, 0.05, Math.random() * 0.08);
        }
    },
    boom(big) {
        if (!ok(null)) return;
        noise(big ? 2.0 : 1.2, 'lowpass', big ? 240 : 420, 0.5, 1.0, 0.004);
        noise(0.35, 'bandpass', 900, 0.6, 0.5);
        tone('sine', big ? 80 : 110, 28, big ? 1.4 : 0.8, 0.95);
    },
    whoosh(dur) {
        if (!ok(null)) return;
        const { f, t } = noise(dur, 'bandpass', 250, 1.4, 0.35, dur * 0.85);
        f.frequency.exponentialRampToValueAtTime(2200, t + dur);
    },
    toss() {
        if (!ok('toss', 80)) return;
        noise(0.22, 'bandpass', 1400, 1.2, 0.18, 0.04);
    },
    tick() {
        if (!ok(null)) return;
        tone('square', 1300, 1300, 0.04, 0.05);
    },
    thump(v) {
        if (!ok('thump', 50)) return;
        tone('sine', 95, 40, 0.14, Math.min(0.08 + v * 0.012, 0.35));
    },
    voice(n = 6) {
        if (!ok('voice', 300)) return;
        for (let i = 0; i < n; i++) {
            tone('square', 150 + Math.random() * 110, 120 + Math.random() * 80, 0.06, 0.05, i * 0.075);
        }
    },
    ouch() {
        if (!ok('ouch', 150)) return;
        tone('square', 520, 180, 0.28, 0.09);
        tone('sine', 300, 90, 0.2, 0.3);
    },
    /** 상사 비명. gender 'm'|'f', kind 'hit'(짧게)|'fly'(길게). 같은 파일이 연달아 나오지 않게 고른다 */
    scream(gender, kind) {
        // 맞자마자 날아가도 긴 비명은 나와야 해서 간격은 종류마다 따로 잰다
        if (!ok('scream' + kind, kind === 'fly' ? 500 : 260)) return;
        const g = gender === 'f' ? 'f' : 'm';
        const list = voices[g][kind];
        if (!list.length) { synthScream(g === 'f', kind === 'fly'); return; }
        let i = Math.floor(Math.random() * list.length);
        const key = g + kind;
        if (list.length > 1 && i === lastVoice[key]) i = (i + 1) % list.length;
        lastVoice[key] = i;
        // 앞 비명이 아직 나오면 끊는다 — 겹치면 시끄럽다
        if (voiceSrc) { try { voiceSrc.stop(); } catch (e) { /* 이미 끝남 */ } }
        const s = ctx.createBufferSource();
        s.buffer = list[i];
        // 직접 녹음한 목소리가 그대로 들리게 높낮이는 아주 조금만 흔든다
        s.playbackRate.value = 0.97 + Math.random() * 0.06;
        const v = ctx.createGain();
        v.gain.value = 0.9;
        s.connect(v); v.connect(master);
        s.start();
        voiceSrc = s;
        s.onended = () => { if (voiceSrc === s) voiceSrc = null; };
    },
    gun() {
        if (!ok('gun', 45)) return;
        noise(0.07, 'highpass', 1800, 0.8, 0.35);
        tone('square', 900, 200, 0.05, 0.06);
    },
    flame() {
        if (!ok('flame', 110)) return;
        noise(0.2, 'bandpass', 700 + Math.random() * 300, 0.5, 0.28, 0.02);
    },
    vortex(dur) {
        if (!ok(null)) return;
        const { f, t } = noise(dur, 'bandpass', 120, 2, 0.6, dur * 0.6);
        f.frequency.exponentialRampToValueAtTime(900, t + dur);
        tone('sawtooth', 50, 160, dur, 0.08);
    },
    nuke() {
        if (!ok(null)) return;
        noise(3.5, 'lowpass', 160, 0.4, 1.0, 0.01);
        noise(1.2, 'bandpass', 600, 0.5, 0.7);
        tone('sine', 60, 20, 3, 1.0);
    },
    cheer() {
        if (!ok('cheer', 1500)) return;
        noise(1.1, 'bandpass', 1500, 0.7, 0.16, 0.15);
        for (let i = 0; i < 6; i++) {
            const f = 500 + Math.random() * 500;
            tone('triangle', f, f * 1.25, 0.25, 0.025, Math.random() * 0.5);
        }
    },
    rank() {
        if (!ok(null)) return;
        [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.16, 0.12, i * 0.07));
    },
    fanfare() {
        if (!ok(null)) return;
        [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.14, i * 0.11));
    },
};
