/**
 * 程序化音效：WebAudio 合成（无外部音频文件）。
 * 首次用户交互后才会创建 AudioContext（浏览器策略）。
 */
export type SfxName =
  | 'dig'
  | 'build'
  | 'pickup'
  | 'deposit'
  | 'craft'
  | 'hurt'
  | 'mdie'
  | 'spell'
  | 'night'
  | 'dawn'
  | 'msg'
  | 'die'
  | 'equip'
  | 'trap'
  | 'click'
  | 'error'
  | 'save';

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.7;

  /** 必须在用户手势中调用 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  private tone(freq0: number, freq1: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq0), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  play(name: SfxName): void {
    if (!this.ctx) return;
    switch (name) {
      case 'dig':
        this.noise(0.09, 0.5, 700 + Math.random() * 300);
        this.tone(160, 90, 0.08, 'square', 0.1);
        break;
      case 'build':
        this.tone(320, 260, 0.06, 'square', 0.22);
        this.tone(420, 340, 0.06, 'square', 0.2, 0.09);
        break;
      case 'pickup':
        this.tone(660, 990, 0.09, 'square', 0.16);
        break;
      case 'deposit':
        this.tone(520, 780, 0.08, 'triangle', 0.18);
        this.tone(780, 1040, 0.1, 'triangle', 0.14, 0.08);
        break;
      case 'craft':
        this.tone(523, 523, 0.09, 'square', 0.16);
        this.tone(659, 659, 0.09, 'square', 0.16, 0.1);
        this.tone(784, 784, 0.14, 'square', 0.18, 0.2);
        break;
      case 'hurt':
        this.tone(300, 110, 0.14, 'sawtooth', 0.22);
        break;
      case 'mdie':
        this.tone(220, 60, 0.25, 'sawtooth', 0.2);
        this.noise(0.15, 0.25, 400, 0.05);
        break;
      case 'spell':
        this.tone(440, 880, 0.18, 'sine', 0.2);
        this.tone(660, 1320, 0.22, 'triangle', 0.14, 0.06);
        break;
      case 'night':
        this.tone(180, 90, 0.7, 'sawtooth', 0.16);
        this.tone(120, 60, 0.9, 'sine', 0.18, 0.15);
        break;
      case 'dawn':
        this.tone(392, 392, 0.16, 'triangle', 0.16);
        this.tone(494, 494, 0.16, 'triangle', 0.16, 0.14);
        this.tone(587, 587, 0.24, 'triangle', 0.18, 0.28);
        break;
      case 'msg':
        this.tone(880, 880, 0.05, 'sine', 0.12);
        break;
      case 'die':
        this.tone(300, 80, 0.6, 'sawtooth', 0.25);
        break;
      case 'equip':
        this.tone(700, 1050, 0.1, 'square', 0.18);
        this.tone(1050, 1400, 0.12, 'square', 0.14, 0.1);
        break;
      case 'trap':
        this.noise(0.12, 0.4, 1400);
        this.tone(500, 200, 0.12, 'square', 0.15);
        break;
      case 'click':
        this.tone(880, 780, 0.045, 'square', 0.12);
        break;
      case 'error':
        this.tone(220, 180, 0.12, 'square', 0.16);
        break;
      case 'save':
        this.tone(587, 880, 0.12, 'triangle', 0.16);
        break;
    }
  }
}

export const sfx = new Sfx();
