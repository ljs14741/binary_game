// 하이라이트 영상: 큰 장면(핵폭탄·필살기·트럭·블랙홀·붕괴)이 터질 때 6초를 녹화해 두고,
// 한 판에서 가장 큰 장면 하나만 남김. 결과 공유 창에서 사진 대신 영상으로 저장·공유.
// 브라우저가 캔버스 녹화를 못 하면 아무것도 안 함 (게임은 그대로)
//
// 끊김 줄이기: 녹화기는 미리 만들어 일시정지로 대기시키고, 장면이 터지면 이어 찍기만 함.
// 캔버스는 프레임을 직접 넘길 때만 담기게(captureStream(0)) 해서 대기 중엔 부담이 없음.

const CLIP_SEC = 6;

function pickMime() {
    if (!window.MediaRecorder) return null;
    // 아이폰 사파리는 mp4 만, 나머지는 webm
    for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
        if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return null;
}

export class Clip {
    /**
     * @param canvas 게임 캔버스
     * @param audio  () => MediaStream|null (게임 소리. 없으면 소리 없이)
     */
    constructor(canvas, audio, mobile) {
        this.canvas = canvas;
        this.audio = audio;
        this.mime = canvas.captureStream ? pickMime() : null;
        this.ok = !!this.mime;
        this.bps = mobile ? 1_600_000 : 3_500_000;
        this.ready = null;  // 대기 중인 녹화기 { rec, stream, track, chunks }
        this.cur = null;    // 찍는 중 { ...ready, weight, start }
        this.best = null;   // { blob, weight, ext, type }
        this.gen = 0;
    }

    /** 새 판: 남긴 영상 비우고 녹화기를 미리 준비 */
    reset() {
        this.gen++;
        this._drop(this.cur);
        this._drop(this.ready);
        this.cur = this.ready = null;
        this.best = null;
        this._prepare();
    }

    _prepare() {
        if (!this.ok || this.ready) return;
        try {
            let stream = this.canvas.captureStream(0);
            let track = stream.getVideoTracks()[0];
            // 프레임을 직접 못 넘기는 브라우저는 초당 30장 자동으로
            if (!track || typeof track.requestFrame !== 'function') {
                stream.getTracks().forEach(t => t.stop());
                stream = this.canvas.captureStream(30);
                track = stream.getVideoTracks()[0];
            }
            // 소리는 녹화기를 만들 때 붙여야 함 (찍는 도중에 트랙을 더하면 녹화가 멈춤)
            try {
                const a = this.audio && this.audio();
                if (a) for (const t of a.getAudioTracks()) stream.addTrack(t.clone());
            } catch (e) { /* 소리 없이 */ }
            const rec = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: this.bps });
            const r = { rec, stream, track, chunks: [] };
            rec.ondataavailable = e => { if (e.data && e.data.size) r.chunks.push(e.data); };
            rec.start(500);
            rec.pause();
            this.ready = r;
        } catch (e) {
            this.ok = false;
        }
    }

    _drop(r) {
        if (!r) return;
        r.discard = true;
        try { if (r.rec.state !== 'inactive') r.rec.stop(); } catch (e) { /* 이미 멈춤 */ }
        r.stream.getTracks().forEach(t => t.stop());
    }

    /** 매 프레임 (그린 뒤): 찍는 중이면 이 프레임을 녹화기에 넘김 */
    frame() {
        if (this.cur && this.cur.track.requestFrame) this.cur.track.requestFrame();
    }

    /** 큰 장면. weight 가 클수록 더 볼만한 장면 (지금 녹화 중이면 무게만 올림) */
    trigger(weight) {
        if (!this.ok) return;
        if (this.cur) { this.cur.weight = Math.max(this.cur.weight, weight); return; }
        // 이미 더 큰 장면을 찍어 뒀으면 작은 장면은 안 찍음
        if (this.best && this.best.weight > weight) return;
        if (!this.ready) this._prepare();
        const r = this.ready;
        if (!r) return;
        this.ready = null;
        r.weight = weight;
        r.start = performance.now();
        this.cur = r;
        try { r.rec.resume(); } catch (e) { this.cur = null; return; }
        this.timer = setTimeout(() => this._finishCur(), CLIP_SEC * 1000);
    }

    _finishCur() {
        clearTimeout(this.timer);
        const r = this.cur;
        if (!r) return Promise.resolve(this.best);
        this.cur = null;
        const gen = this.gen;
        return new Promise(res => {
            r.rec.onstop = () => {
                r.stream.getTracks().forEach(t => t.stop());
                if (!r.discard && gen === this.gen && r.chunks.length && performance.now() - r.start >= 2000) {
                    if (!this.best || r.weight >= this.best.weight) {
                        const type = this.mime.split(';')[0];
                        this.best = { blob: new Blob(r.chunks, { type }), weight: r.weight, type, ext: type === 'video/mp4' ? 'mp4' : 'webm' };
                    }
                }
                res(this.best);
                // 다음 장면용 녹화기는 한숨 돌린 뒤 준비 (폭발 직후 끊기지 않게)
                if (gen === this.gen) setTimeout(() => { if (gen === this.gen) this._prepare(); }, 1500);
            };
            try { r.rec.stop(); } catch (e) { res(this.best); }
        });
    }

    /** 판이 끝날 때: 녹화 중이면 지금까지 찍은 걸로 마무리 */
    finish() {
        return this.cur ? this._finishCur() : Promise.resolve(this.best);
    }
}
