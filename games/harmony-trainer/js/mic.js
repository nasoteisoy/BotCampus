import { PitchTracker } from './pitch.js';

const MIC_CONSTRAINTS = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  },
  video: false,
};

export class MicPitch {
  constructor(audioCtx) {
    this.ctx = audioCtx;
    this.stream = null;
    this.source = null;
    this.tracker = null;
    this.status = 'idle'; // idle | pending | live | denied | error
    this.onStatus = null;
    this._raf = 0;
    this.onPitch = null;
  }

  async request() {
    this.status = 'pending';
    this._emit();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    } catch (err) {
      this.status = err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') ? 'denied' : 'error';
      this._emit();
      return false;
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.tracker = new PitchTracker(this.ctx);
    this.tracker.connect(this.source);
    this.status = 'live';
    this._emit();
    this._loop();
    return true;
  }

  _loop() {
    cancelAnimationFrame(this._raf);
    const step = () => {
      if (this.status !== 'live' || !this.tracker) return;
      const p = this.tracker.poll();
      if (this.onPitch) this.onPitch(p);
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  stop() {
    cancelAnimationFrame(this._raf);
    if (this.tracker) this.tracker.disconnect();
    if (this.source) try { this.source.disconnect(); } catch (_) {}
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
    this.tracker = null;
    this.status = 'idle';
    this._emit();
  }

  _emit() {
    if (this.onStatus) this.onStatus(this.status);
  }
}
