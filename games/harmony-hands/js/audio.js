// Mic -> harmonizer AudioWorklet (pitch detect + pitch-shifted voices) -> speakers / headphones.
export const MIC = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, latency: 0 };
export class Engine {
  constructor(ctx) { this.ctx = ctx; this.node = null; this.master = ctx.createGain(); this.master.connect(ctx.destination); this.onStatus = () => {}; }
  async start(stream) {
    const ctx = this.ctx;
    await ctx.audioWorklet.addModule(new URL('./harmonizer-worklet.js', import.meta.url));
    this.node = new AudioWorkletNode(ctx, 'harmonizer', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 1, channelCountMode: 'explicit' });
    this.node.port.onmessage = (e) => this.onStatus(e.data);
    this.src = ctx.createMediaStreamSource(stream);
    this.src.connect(this.node); this.node.connect(this.master);
    this.track = stream.getAudioTracks()[0];
  }
  set(p) { if (this.node) this.node.port.postMessage(p); }
  /** rough mic-to-ear latency in ms: browser in + out buffers + harmony grain delay */
  latencyMs() {
    const c = this.ctx; const s = (this.track && this.track.getSettings && this.track.getSettings()) || {};
    const inL = typeof s.latency === 'number' ? s.latency : 0.01;
    return Math.round(((c.baseLatency || 0) + (c.outputLatency || 0) + inL) * 1000 + 15);
  }
}
