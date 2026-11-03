// Every sound is synthesized with Web Audio, so the game ships no audio files.
export type Sfx =
  | "pistol" | "shotgun" | "smg" | "empty" | "reload" | "pump" | "perfect" | "fumble"
  | "hit" | "head" | "sever" | "ping" | "kill" | "boom" | "hurt" | "pickup" | "rescue"
  | "lost" | "groan" | "spit" | "splat" | "sting" | "roar" | "clear" | "thud" | "heart" | "break";

export class Audio {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  /** Call from a click or key press; browsers only start audio after a gesture. */
  unlock(): void {
    try {
      if (!this.ac) {
        const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        this.ac = new Ctx();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.55;
        const comp = this.ac.createDynamicsCompressor();
        this.master.connect(comp).connect(this.ac.destination);
        const len = this.ac.sampleRate;
        this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ac.state === "suspended") void this.ac.resume();
    } catch {
      /* no audio */
    }
  }

  private noise(dur: number, freq: number, vol: number, type: BiquadFilterType = "lowpass", delay = 0, q = 0.7): void {
    const ac = this.ac!, t = ac.currentTime + delay;
    const s = ac.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    const ac = this.ac!, t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  play(n: Sfx): void {
    if (this.muted || !this.ac || this.ac.state !== "running") return;
    try {
      switch (n) {
        case "pistol": this.noise(0.16, 2600, 0.7); this.tone(220, 60, 0.09, "square", 0.18); break;
        case "smg": this.noise(0.09, 3200, 0.45); this.tone(300, 90, 0.05, "square", 0.1); break;
        case "shotgun": this.noise(0.45, 1300, 1); this.tone(110, 35, 0.25, "sine", 0.6); break;
        case "empty": this.tone(1300, 1100, 0.03, "square", 0.08); break;
        case "reload": this.tone(520, 300, 0.05, "square", 0.08); break;
        case "pump": this.noise(0.08, 2500, 0.3, "bandpass", 0, 3); this.noise(0.08, 1800, 0.3, "bandpass", 0.12, 3); break;
        case "perfect": this.tone(880, 880, 0.08, "triangle", 0.2); this.tone(1320, 1320, 0.16, "triangle", 0.18, 0.07); break;
        case "fumble": this.tone(200, 120, 0.2, "square", 0.12); break;
        case "hit": this.noise(0.07, 900, 0.35, "bandpass", 0, 2); break;
        case "head": this.noise(0.12, 600, 0.6, "bandpass", 0, 1.5); this.tone(180, 60, 0.12, "sine", 0.3); break;
        case "sever": this.noise(0.18, 500, 0.5, "bandpass", 0, 1); break;
        case "ping": this.tone(2400, 1900, 0.12, "triangle", 0.15); this.tone(3100, 2800, 0.08, "sine", 0.08); break;
        case "kill": this.tone(140, 55, 0.35, "sawtooth", 0.08); break;
        case "boom": this.noise(0.9, 400, 1); this.tone(80, 25, 0.8, "sine", 0.7); break;
        case "hurt": this.tone(260, 60, 0.35, "sawtooth", 0.25); this.noise(0.2, 1200, 0.3); break;
        case "pickup": this.tone(660, 1320, 0.12, "triangle", 0.18); this.tone(990, 1980, 0.14, "triangle", 0.12, 0.08); break;
        case "rescue": [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.14, "triangle", 0.14, i * 0.08)); break;
        case "lost": this.tone(400, 180, 0.6, "sawtooth", 0.1); break;
        case "groan": this.tone(95 + Math.random() * 40, 60, 0.6, "sawtooth", 0.05); break;
        case "spit": this.noise(0.25, 700, 0.35, "bandpass", 0, 4); break;
        case "splat": this.noise(0.3, 400, 0.6); break;
        case "sting": this.tone(1600, 1500, 0.25, "sawtooth", 0.08); this.tone(1700, 1620, 0.25, "sawtooth", 0.08); break;
        case "roar": this.tone(70, 45, 1.2, "sawtooth", 0.3); this.noise(1.0, 300, 0.4); break;
        case "clear": [392, 523, 659].forEach((f, i) => this.tone(f, f, 0.22, "square", 0.08, i * 0.1)); break;
        case "thud": this.tone(90, 40, 0.18, "sine", 0.5); this.noise(0.12, 300, 0.4); break;
        case "heart": this.tone(60, 40, 0.12, "sine", 0.35); this.tone(55, 38, 0.12, "sine", 0.25, 0.16); break;
        case "break": this.noise(0.3, 1800, 0.5, "highpass"); this.tone(300, 120, 0.15, "square", 0.08); break;
      }
    } catch {
      /* ignore */
    }
  }
}
