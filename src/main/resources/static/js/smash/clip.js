// 하이라이트 영상: 큰 장면(핵폭탄·필살기·트럭·블랙홀·붕괴)이 터질 때 6초를 녹화해 두고,
// 한 판에서 가장 큰 장면 하나만 남김. 결과 공유 창에서 사진 대신 영상으로 저장·공유.
// 브라우저가 캔버스 녹화를 못 하면 아무것도 안 함 (게임은 그대로)

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
        this.bps = mobile ? 2_200_000 : 4_000_000;
        this.rec = null;
        this.best = null;   // { blob, weight, ext, type }
    }

    /** 새 판: 남긴 영상 비움 */
    reset() {
        this._stop(true);
        this.best = null;
    }

    /** 큰 장면. weight 가 클수록 더 볼만한 장면 (지금 녹화 중이면 무게만 올림) */
    trigger(weight) {
        if (!this.ok) return;
        if (this.rec) { this.cur.weight = Math.max(this.cur.weight, weight); return; }
        // 이미 더 큰 장면을 찍어 뒀으면 작은 장면은 안 찍음 (괜히 녹화로 무겁지 않게)
        if (this.best && this.best.weight > weight) return;
        let stream;
        try {
            stream = this.canvas.captureStream(30);
            const a = this.audio && this.audio();
            if (a) for (const t of a.getAudioTracks()) stream.addTrack(t);
            this.rec = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: this.bps });
        } catch (e) {
            this.ok = false;
            this.rec = null;
            return;
        }
        const chunks = [];
        const cur = this.cur = { weight, start: performance.now() };
        this.rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        this.rec.onstop = () => {
            stream.getVideoTracks().forEach(t => t.stop());
            if (cur.discard || !chunks.length) return;
            // 2초도 안 찍혔으면 버림
            if (performance.now() - cur.start < 2000) return;
            if (!this.best || cur.weight >= this.best.weight) {
                const type = this.mime.split(';')[0];
                this.best = { blob: new Blob(chunks, { type }), weight: cur.weight, type, ext: type === 'video/mp4' ? 'mp4' : 'webm' };
            }
        };
        this.rec.start(500);
        this.timer = setTimeout(() => this._stop(false), CLIP_SEC * 1000);
    }

    /** 판이 끝날 때: 녹화 중이면 지금까지 찍은 걸로 마무리. 다 되면 resolve */
    finish() {
        if (!this.rec) return Promise.resolve(this.best);
        return new Promise(res => {
            const r = this.rec;
            const prev = r.onstop;
            r.onstop = (e) => { prev && prev(e); res(this.best); };
            this._stop(false);
        });
    }

    _stop(discard) {
        clearTimeout(this.timer);
        if (!this.rec) return;
        if (discard && this.cur) this.cur.discard = true;
        try { if (this.rec.state !== 'inactive') this.rec.stop(); } catch (e) { /* 이미 멈춤 */ }
        this.rec = null;
    }
}
