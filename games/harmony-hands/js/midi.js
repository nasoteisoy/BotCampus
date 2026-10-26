// Web MIDI out: sends the active chord (note-offs for the old chord, note-ons for the new one).
export const midiSupported = () => typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
export class MidiOut {
  constructor(onList) { this.onList = onList; this.access = null; this.out = null; this.held = []; this.ch = 0; }
  async init() {
    if (!midiSupported()) return false;
    try { this.access = await navigator.requestMIDIAccess({ sysex: false }); } catch (e) { console.info('[midi] no access', e && e.name); return false; }
    this.access.onstatechange = () => this.refresh();
    this.refresh(); return true;
  }
  list() { return this.access ? [...this.access.outputs.values()].filter((o) => o.state !== 'disconnected') : []; }
  refresh() {
    const outs = this.list();
    if (this.out && !outs.includes(this.out)) this.out = null;
    if (!this.outId && outs.length && this.outId !== '') this.select(outs[0].id);
    this.onList(outs, this.out ? this.out.id : '');
  }
  select(id) {
    this.allOff(); this.outId = id;
    this.out = id ? this.list().find((o) => o.id === id) || null : null;
    if (this.out && this.held.length === 0 && this.pending) this.sendChord(this.pending);
  }
  sendChord(notes) {
    this.pending = notes.slice();
    if (!this.out) return;
    for (const n of this.held) this.out.send([0x80 | this.ch, n, 0]);
    for (const n of notes) this.out.send([0x90 | this.ch, n, 90]);
    this.held = notes.slice();
  }
  allOff() {
    if (this.out) { for (const n of this.held) this.out.send([0x80 | this.ch, n, 0]); this.out.send([0xb0 | this.ch, 123, 0]); }
    this.held = [];
  }
}
