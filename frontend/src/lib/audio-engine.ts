"use client";

/* ─────────────────────────────────────────────────────────────────────────────
   Zenify Audio Engine
   Signal path:
   sources → inputMixer → highpass → lowpass → EQ(3) → trim ─┬─ dry ───────────┐
                                                              ├─ reverb ────────┤
                                                              ├─ echo (tape) ───┼→ fxSum → panner(8D)
                                                              └─ chorus (L/R) ──┘      → compressor → analyser → master
───────────────────────────────────────────────────────────────────────────── */

export type ReverbType = "none" | "warehouse" | "cathedral";

export interface AudioFxSettings {
  eq: number[]; // [bass, mid, treble] in dB (-12..12)
  reverb: string; // 'none' | 'warehouse' | 'cathedral'
  reverbAmount: number; // 0..1
  echo: number; // 0..1 (mix)
  echoTime: number; // seconds (0.06..1)
  chorus: number; // 0..1
  filter: number; // -1 (low-pass) .. 0 (off) .. +1 (high-pass)
  is8D: boolean;
  direction8D: "clockwise" | "counter-clockwise";
  speed8D: number; // Hz (rotations per second)
  speed: number; // playback rate
  pitch: number; // 1 = keep pitch, anything else = tape-style (pitch follows speed)
  bypass: boolean; // A/B: disable all tonal effects (tempo is untouched)
  crossfade: number;
}

export const DEFAULT_AUDIO_FX: AudioFxSettings = {
  eq: [0, 0, 0],
  reverb: "none",
  reverbAmount: 0.4,
  echo: 0,
  echoTime: 0.32,
  chorus: 0,
  filter: 0,
  is8D: false,
  direction8D: "clockwise",
  speed8D: 0.15,
  speed: 1,
  pitch: 1,
  bypass: false,
  crossfade: 5,
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** DJ-style filter mapping, shared with the UI for labels. */
export function filterFrequencies(value: number) {
  const f = clamp(value, -1, 1);
  return {
    lowpass: 20000 * Math.pow(0.0125, Math.max(0, -f)), // 20 kHz → 250 Hz
    highpass: 20 * Math.pow(300, Math.max(0, f)), // 20 Hz → 6 kHz
  };
}

class ZenAudioEngine {
  private static instance: ZenAudioEngine;
  private context: AudioContext | null = null;
  private sourceA: MediaElementAudioSourceNode | null = null;
  private sourceB: MediaElementAudioSourceNode | null = null;

  // Stable nodes (created once per context)
  private inputMixer: GainNode | null = null;
  private gainA: GainNode | null = null;
  private gainB: GainNode | null = null;
  private highpass: BiquadFilterNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private equalizer: BiquadFilterNode[] = [];
  private eqTrim: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbMix: GainNode | null = null;
  private dryMix: GainNode | null = null;

  private echoSend: GainNode | null = null;
  private echoDelay: DelayNode | null = null;
  private echoTone: BiquadFilterNode | null = null;
  private echoFeedback: GainNode | null = null;
  private echoWet: GainNode | null = null;

  private chorusSplit: ChannelSplitterNode | null = null;
  private chorusMerge: ChannelMergerNode | null = null;
  private chorusDelayL: DelayNode | null = null;
  private chorusDelayR: DelayNode | null = null;
  private chorusLfoA: OscillatorNode | null = null;
  private chorusLfoB: OscillatorNode | null = null;
  private chorusDepthA: GainNode | null = null;
  private chorusDepthB: GainNode | null = null;
  private chorusWet: GainNode | null = null;

  private fxSum: GainNode | null = null;
  private panner: PannerNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  private audioA: HTMLAudioElement | null = null;
  private audioB: HTMLAudioElement | null = null;
  private activeElement: "A" | "B" = "A";
  private initialized = false;
  private keepAliveOsc: OscillatorNode | null = null;
  private keepAliveGain: GainNode | null = null;

  // Current effect settings (source of truth for the graph)
  private fx: AudioFxSettings = { ...DEFAULT_AUDIO_FX, eq: [0, 0, 0] };

  // 8D state & LFOs
  private lfoX: OscillatorNode | null = null;
  private lfoZ: OscillatorNode | null = null;
  private lfoGainX: GainNode | null = null;
  private lfoGainZ: GainNode | null = null;
  private _is8DEnabled = false;

  // Reverb state
  private _currentReverb = "none";
  private _reverbSwapping = false;
  private reverbToken = 0;
  private impulseCache = new Map<string, AudioBuffer>();

  // Feature extractor (worker)
  private fftBuf: Uint8Array | null = null;
  private currentFeatures = { section: "quiet", bass: 0, mids: 0, treble: 0, rms: 0 };
  private featureWorker: Worker | null = null;
  private workerBusy = false;

  private constructor() {}

  static getInstance() {
    if (!ZenAudioEngine.instance) {
      ZenAudioEngine.instance = new ZenAudioEngine();
    }
    return ZenAudioEngine.instance;
  }

  /* ───────────────────────────── DOM / init ───────────────────────────── */

  private ensureDomAttachment() {
    if (typeof document === "undefined") return;
    try {
      let host = document.getElementById("zenify-audio-host");
      if (!host) {
        host = document.createElement("div");
        host.id = "zenify-audio-host";
        host.style.position = "fixed";
        host.style.width = "0px";
        host.style.height = "0px";
        host.style.opacity = "0";
        host.style.pointerEvents = "none";
        host.style.bottom = "-9999px";
        host.setAttribute("aria-hidden", "true");
        document.body.appendChild(host);
      }
      if (this.audioA && !host.contains(this.audioA)) host.appendChild(this.audioA);
      if (this.audioB && !host.contains(this.audioB)) host.appendChild(this.audioB);
    } catch (e) {
      console.warn("⚠️ ZenAudioEngine: DOM attachment warning:", e);
    }
  }

  init() {
    if (this.initialized) return;

    if (!this.audioA) {
      this.audioA = new Audio();
      this.audioA.crossOrigin = "anonymous";
      this.audioA.preload = "auto";
    }
    if (!this.audioB) {
      this.audioB = new Audio();
      this.audioB.crossOrigin = "anonymous";
      this.audioB.preload = "auto";
    }
    this.ensureDomAttachment();
    this.setupGraph();

    if (typeof window !== "undefined") {
      const unlockAudio = () => {
        this.resume();
        window.removeEventListener("pointerdown", unlockAudio);
        window.removeEventListener("touchstart", unlockAudio);
        window.removeEventListener("keydown", unlockAudio);
        window.removeEventListener("click", unlockAudio);
      };
      window.addEventListener("pointerdown", unlockAudio, { passive: true });
      window.addEventListener("touchstart", unlockAudio, { passive: true });
      window.addEventListener("keydown", unlockAudio, { passive: true });
      window.addEventListener("click", unlockAudio, { passive: true });

      document.addEventListener("visibilitychange", () => {
        this.ensureDomAttachment();
        if (this.context && this.context.state === "suspended") {
          this.context.resume().catch(() => {});
        }
      });
      window.addEventListener("focus", () => {
        if (this.context && this.context.state === "suspended") {
          this.context.resume().catch(() => {});
        }
      });
    }
  }

  /* ───────────────────────────── Graph ───────────────────────────── */

  private buildNodes(ctx: AudioContext) {
    this.gainA = ctx.createGain();
    this.gainB = ctx.createGain();
    this.inputMixer = ctx.createGain();

    // DJ filter pair (neutral at 20 Hz / 20 kHz)
    this.highpass = ctx.createBiquadFilter();
    this.highpass.type = "highpass";
    this.highpass.frequency.value = 20;
    this.highpass.Q.value = 0.707;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 20000;
    this.lowpass.Q.value = 0.707;

    // 3-band EQ: low shelf / mid bell / high shelf
    const bands: Array<[number, BiquadFilterType, number]> = [
      [110, "lowshelf", 0.8],
      [1500, "peaking", 0.8],
      [8000, "highshelf", 0.8],
    ];
    this.equalizer = bands.map(([freq, type, q]) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      f.gain.value = 0;
      return f;
    });
    this.eqTrim = ctx.createGain(); // headroom compensation for EQ boosts

    // Reverb
    this.reverb = ctx.createConvolver();
    this.reverbMix = ctx.createGain();
    this.reverbMix.gain.value = 0;
    this.dryMix = ctx.createGain();

    // Echo (tape-style: each repeat is darker)
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0;
    this.echoDelay = ctx.createDelay(1.5);
    this.echoDelay.delayTime.value = 0.32;
    this.echoTone = ctx.createBiquadFilter();
    this.echoTone.type = "lowpass";
    this.echoTone.frequency.value = 4200;
    this.echoTone.Q.value = 0.5;
    this.echoFeedback = ctx.createGain();
    this.echoFeedback.gain.value = 0.3;
    this.echoWet = ctx.createGain();
    this.echoWet.gain.value = 0;

    // Stereo chorus: independent modulated delay per channel
    this.chorusSplit = ctx.createChannelSplitter(2);
    this.chorusMerge = ctx.createChannelMerger(2);
    this.chorusDelayL = ctx.createDelay(0.05);
    this.chorusDelayR = ctx.createDelay(0.05);
    this.chorusDelayL.delayTime.value = 0.02;
    this.chorusDelayR.delayTime.value = 0.026;
    this.chorusDepthA = ctx.createGain();
    this.chorusDepthB = ctx.createGain();
    this.chorusDepthA.gain.value = 0.0012;
    this.chorusDepthB.gain.value = 0.0012;
    this.chorusLfoA = ctx.createOscillator();
    this.chorusLfoB = ctx.createOscillator();
    this.chorusLfoA.frequency.value = 0.55;
    this.chorusLfoB.frequency.value = 0.73;
    this.chorusLfoA.connect(this.chorusDepthA);
    this.chorusLfoB.connect(this.chorusDepthB);
    this.chorusDepthA.connect(this.chorusDelayL.delayTime);
    this.chorusDepthB.connect(this.chorusDelayR.delayTime);
    this.chorusLfoA.start();
    this.chorusLfoB.start();
    this.chorusWet = ctx.createGain();
    this.chorusWet.gain.value = 0;

    this.fxSum = ctx.createGain();

    this.panner = ctx.createPanner();
    this.panner.panningModel = "equalpower";
    this.panner.distanceModel = "linear";
    this.panner.positionX.value = 0;
    this.panner.positionY.value = 0;
    this.panner.positionZ.value = 0;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.25;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 1.0;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;
  }

  private setupGraph() {
    if (!this.audioA || !this.audioB) return;

    if (!this.context) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.context = new AudioContextClass({ latencyHint: "playback" });
    }
    const ctx = this.context!;

    ctx.onstatechange = () => {
      if (ctx.state === "suspended" && this.initialized) {
        ctx.resume().catch(() => {});
      }
    };

    // Sub-audible keep-alive: stops Chromium from suspending the audio thread in background tabs
    if (!this.keepAliveOsc) {
      try {
        this.keepAliveOsc = ctx.createOscillator();
        this.keepAliveGain = ctx.createGain();
        this.keepAliveOsc.frequency.value = 1;
        this.keepAliveGain.gain.value = 0.00001;
        this.keepAliveOsc.connect(this.keepAliveGain);
        this.keepAliveGain.connect(ctx.destination);
        this.keepAliveOsc.start();
      } catch (e) {
        console.warn("⚠️ ZenAudioEngine: Keep-alive oscillator warning:", e);
      }
    }

    if (!this.inputMixer) this.buildNodes(ctx);

    try {
      if (!this.sourceA && this.audioA) this.sourceA = ctx.createMediaElementSource(this.audioA);
      if (!this.sourceB && this.audioB && this.audioA !== this.audioB) {
        this.sourceB = ctx.createMediaElementSource(this.audioB);
      }
    } catch (e) {
      console.warn("⚠️ ZenAudioEngine: Source creation error (likely already attached):", e);
    }

    this.disconnectAll();
    this.connectGraph(ctx);

    this.initialized = true;
    this.updateActiveGains();
    this.render();
  }

  private connectGraph(ctx: AudioContext) {
    try {
      this.sourceA?.connect(this.gainA!);
      this.sourceB?.connect(this.gainB!);
      this.gainA!.connect(this.inputMixer!);
      this.gainB!.connect(this.inputMixer!);

      // Tone shaping
      this.inputMixer!.connect(this.highpass!);
      this.highpass!.connect(this.lowpass!);
      let last: AudioNode = this.lowpass!;
      this.equalizer.forEach((f) => {
        last.connect(f);
        last = f;
      });
      last.connect(this.eqTrim!);
      const tone = this.eqTrim!;

      // Dry
      tone.connect(this.dryMix!);
      this.dryMix!.connect(this.fxSum!);

      // Reverb
      tone.connect(this.reverb!);
      this.reverb!.connect(this.reverbMix!);
      this.reverbMix!.connect(this.fxSum!);

      // Echo
      tone.connect(this.echoSend!);
      this.echoSend!.connect(this.echoDelay!);
      this.echoDelay!.connect(this.echoTone!);
      this.echoTone!.connect(this.echoFeedback!);
      this.echoFeedback!.connect(this.echoDelay!);
      this.echoTone!.connect(this.echoWet!);
      this.echoWet!.connect(this.fxSum!);

      // Chorus
      tone.connect(this.chorusSplit!);
      this.chorusSplit!.connect(this.chorusDelayL!, 0);
      this.chorusSplit!.connect(this.chorusDelayR!, 1);
      this.chorusDelayL!.connect(this.chorusMerge!, 0, 0);
      this.chorusDelayR!.connect(this.chorusMerge!, 0, 1);
      this.chorusMerge!.connect(this.chorusWet!);
      this.chorusWet!.connect(this.fxSum!);

      // Output
      this.fxSum!.connect(this.panner!);
      this.panner!.connect(this.compressor!);
      this.compressor!.connect(this.analyser!);
      this.analyser!.connect(this.masterGain!);
      this.masterGain!.connect(ctx.destination);
    } catch (e) {
      console.error("⚠️ ZenAudioEngine: Signal path rebuild failed:", e);
    }
  }

  private disconnectAll() {
    const nodes: Array<AudioNode | null> = [
      this.sourceA, this.sourceB, this.gainA, this.gainB, this.inputMixer,
      this.highpass, this.lowpass, ...this.equalizer, this.eqTrim,
      this.reverb, this.reverbMix, this.dryMix,
      this.echoSend, this.echoDelay, this.echoTone, this.echoFeedback, this.echoWet,
      this.chorusSplit, this.chorusMerge, this.chorusDelayL, this.chorusDelayR, this.chorusWet,
      this.fxSum, this.panner, this.compressor, this.analyser, this.masterGain,
    ];
    nodes.forEach((n) => {
      try { n?.disconnect(); } catch {}
    });
  }

  private updateActiveGains() {
    if (!this.gainA || !this.gainB) return;
    const now = this.context ? this.context.currentTime : 0;
    const targetA = this.activeElement === "A" ? 1 : 0;
    const targetB = this.activeElement === "B" ? 1 : 0;
    if (this.context) {
      try {
        this.gainA.gain.cancelScheduledValues(now);
        this.gainB.gain.cancelScheduledValues(now);
        this.gainA.gain.setValueAtTime(targetA, now);
        this.gainB.gain.setValueAtTime(targetB, now);
      } catch {
        this.gainA.gain.value = targetA;
        this.gainB.gain.value = targetB;
      }
    } else {
      this.gainA.gain.value = targetA;
      this.gainB.gain.value = targetB;
    }
  }

  /* ───────────────────────────── FX rendering ───────────────────────────── */

  /** Merge settings and push them into the audio graph (idempotent, click-free). */
  applyFx(next: Partial<AudioFxSettings>) {
    this.fx = {
      ...this.fx,
      ...next,
      eq: next.eq ? [next.eq[0] ?? 0, next.eq[1] ?? 0, next.eq[2] ?? 0] : this.fx.eq,
    };
    this.resume();
    this.render();
  }

  getFx() {
    return this.fx;
  }

  private applyPlaybackRate() {
    const { speed, pitch } = this.fx;
    const preserve = pitch === 1;
    [this.audioA, this.audioB].forEach((el) => {
      if (!el) return;
      // Re-assigning src resets playbackRate, so always compare with the element itself
      if (el.playbackRate !== speed) el.playbackRate = speed;
      const anyEl = el as any;
      if (anyEl.preservesPitch !== preserve) anyEl.preservesPitch = preserve;
      if (anyEl.webkitPreservesPitch !== undefined && anyEl.webkitPreservesPitch !== preserve) anyEl.webkitPreservesPitch = preserve;
      if (anyEl.mozPreservesPitch !== undefined && anyEl.mozPreservesPitch !== preserve) anyEl.mozPreservesPitch = preserve;
    });
  }

  private render() {
    this.applyPlaybackRate();
    const ctx = this.context;
    if (!ctx || !this.initialized || !this.equalizer.length) return;

    const t = ctx.currentTime;
    const fx = this.fx;
    const on = !fx.bypass;

    // EQ + headroom trim (prevents clipping when boosting, keeps A/B loudness fair)
    const eq = on ? fx.eq : [0, 0, 0];
    this.equalizer.forEach((f, i) => f.gain.setTargetAtTime(clamp(eq[i] ?? 0, -12, 12), t, 0.05));
    const boost = Math.max(0, ...eq.map((v) => v ?? 0));
    this.eqTrim!.gain.setTargetAtTime(Math.pow(10, (-boost * 0.6) / 20), t, 0.08);

    // DJ filter
    const { lowpass, highpass } = filterFrequencies(on ? fx.filter : 0);
    this.lowpass!.frequency.setTargetAtTime(lowpass, t, 0.04);
    this.highpass!.frequency.setTargetAtTime(highpass, t, 0.04);

    // Reverb
    const rType = on && fx.reverb && fx.reverb !== "none" ? fx.reverb : "none";
    this.ensureReverbBuffer(rType);
    const wet = rType === "none" ? 0 : clamp(fx.reverbAmount, 0, 1);
    this.reverbMix!.gain.setTargetAtTime(this._reverbSwapping ? 0 : wet * 0.9, t, 0.05);
    this.dryMix!.gain.setTargetAtTime(1 - wet * 0.25, t, 0.05);

    // Echo
    const e = on ? clamp(fx.echo, 0, 1) : 0;
    this.echoSend!.gain.setTargetAtTime(e > 0.001 ? 1 : 0, t, 0.03);
    this.echoWet!.gain.setTargetAtTime(e * 0.85, t, 0.05);
    this.echoFeedback!.gain.setTargetAtTime(0.28 + 0.32 * e, t, 0.05); // max 0.6 – always decays
    this.echoDelay!.delayTime.setTargetAtTime(clamp(fx.echoTime, 0.06, 1), t, 0.12);

    // Chorus
    const c = on ? clamp(fx.chorus, 0, 1) : 0;
    this.chorusWet!.gain.setTargetAtTime(c * 0.8, t, 0.05);
    this.chorusDepthA!.gain.setTargetAtTime(0.0012 + 0.0028 * c, t, 0.1);
    this.chorusDepthB!.gain.setTargetAtTime(0.0012 + 0.0028 * c, t, 0.1);

    // 8D
    this.sync8D(on && fx.is8D, fx.direction8D, clamp(fx.speed8D, 0.03, 0.6));
  }

  /* ───────────────────────────── Reverb ───────────────────────────── */

  private getImpulse(type: string): AudioBuffer | null {
    const ctx = this.context;
    if (!ctx) return null;
    const key = `${type}-${ctx.sampleRate}`;
    const cached = this.impulseCache.get(key);
    if (cached) return cached;

    const cfg =
      type === "cathedral"
        ? { dur: 3.6, decay: 2.2, preDelay: 0.03, damp0: 0.35, damp1: 0.93 }
        : { dur: 1.4, decay: 2.8, preDelay: 0.012, damp0: 0.2, damp1: 0.85 };

    const rate = ctx.sampleRate;
    const length = Math.floor(rate * cfg.dur);
    const pre = Math.floor(rate * cfg.preDelay);
    const buffer = ctx.createBuffer(2, length, rate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < length; i++) {
        const tt = (i - pre) / (length - pre);
        const env = Math.pow(1 - tt, cfg.decay);
        // High frequencies die faster than lows → natural, warm tail
        const damp = cfg.damp0 + (cfg.damp1 - cfg.damp0) * tt;
        lp = lp * damp + (Math.random() * 2 - 1) * (1 - damp);
        data[i] = lp * env;
      }
    }
    this.impulseCache.set(key, buffer);
    return buffer;
  }

  private ensureReverbBuffer(type: string) {
    if (!this.reverb || !this.context || type === this._currentReverb) return;
    this._currentReverb = type;
    const token = ++this.reverbToken;

    const swap = () => {
      if (token !== this.reverbToken || !this.reverb) return;
      this.reverb.buffer = type === "none" ? null : this.getImpulse(type);
      this._reverbSwapping = false;
      this.render();
    };

    if (this.reverb.buffer) {
      // Fade the wet bus out before swapping the impulse → no click
      this._reverbSwapping = true;
      this.reverbMix?.gain.setTargetAtTime(0, this.context.currentTime, 0.015);
      setTimeout(swap, 70);
    } else {
      swap();
    }
  }

  /* ───────────────────────────── 8D ───────────────────────────── */

  private sync8D(enabled: boolean, direction: "clockwise" | "counter-clockwise", freq: number) {
    const ctx = this.context;
    const wasEnabled = this._is8DEnabled;
    this._is8DEnabled = enabled;

    if (!enabled) {
      if (wasEnabled || this.lfoX) this.stop8D();
      return;
    }
    if (!ctx || !this.panner) return;

    const dirGain = direction === "clockwise" ? 3.5 : -3.5;
    if (wasEnabled && this.lfoGainZ && this.lfoX && this.lfoZ) {
      const now = ctx.currentTime;
      this.lfoGainZ.gain.setTargetAtTime(dirGain, now, 0.2);
      this.lfoX.frequency.setTargetAtTime(freq, now, 0.1);
      this.lfoZ.frequency.setTargetAtTime(freq, now, 0.1);
      return;
    }

    this.stop8D();
    this.panner.panningModel = "HRTF";
    this.lfoGainX = ctx.createGain();
    this.lfoGainZ = ctx.createGain();
    this.lfoGainX.gain.value = 3.5;
    this.lfoGainZ.gain.value = dirGain;
    this.lfoX = ctx.createOscillator();
    this.lfoZ = ctx.createOscillator();
    this.lfoX.frequency.value = freq;
    this.lfoZ.frequency.value = freq;
    const sineWave = ctx.createPeriodicWave(new Float32Array([0, 0]), new Float32Array([0, 1]));
    const cosWave = ctx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0]));
    this.lfoX.setPeriodicWave(sineWave);
    this.lfoZ.setPeriodicWave(cosWave);
    this.lfoX.connect(this.lfoGainX);
    this.lfoGainX.connect(this.panner.positionX);
    this.lfoZ.connect(this.lfoGainZ);
    this.lfoGainZ.connect(this.panner.positionZ);
    this.lfoX.start();
    this.lfoZ.start();
  }

  private stop8D() {
    if (this.lfoX) { try { this.lfoX.stop(); this.lfoX.disconnect(); } catch {} this.lfoX = null; }
    if (this.lfoZ) { try { this.lfoZ.stop(); this.lfoZ.disconnect(); } catch {} this.lfoZ = null; }
    if (this.lfoGainX) { try { this.lfoGainX.disconnect(); } catch {} this.lfoGainX = null; }
    if (this.lfoGainZ) { try { this.lfoGainZ.disconnect(); } catch {} this.lfoGainZ = null; }
    if (this.panner && this.context) {
      this.panner.panningModel = "equalpower";
      const now = this.context.currentTime;
      this.panner.positionX.setTargetAtTime(0, now, 0.1);
      this.panner.positionY.setTargetAtTime(0, now, 0.1);
      this.panner.positionZ.setTargetAtTime(0, now, 0.1);
    }
  }

  /* ───────────────────────────── Analysis ───────────────────────────── */

  getAnalyser() {
    return this.analyser;
  }

  private initWorker() {
    if (!this.featureWorker && typeof window !== "undefined") {
      this.featureWorker = new Worker(new URL("../workers/audio-features.worker.ts", import.meta.url), { type: "module" });
      this.featureWorker.onmessage = (e) => {
        this.currentFeatures = e.data;
        this.workerBusy = false;
      };
    }
  }

  getAudioFeatures() {
    if (!this.analyser) return this.currentFeatures;
    this.initWorker();
    if (this.workerBusy) return this.currentFeatures;

    if (!this.fftBuf || this.fftBuf.length !== this.analyser.frequencyBinCount) {
      this.fftBuf = new Uint8Array(this.analyser.frequencyBinCount);
    }
    this.analyser.getByteFrequencyData(this.fftBuf as any);
    const bufCopy = this.fftBuf.slice().buffer;
    this.workerBusy = true;
    this.featureWorker?.postMessage(bufCopy, [bufCopy]);
    return this.currentFeatures;
  }

  /* ───────────────────────────── Transport / volume ───────────────────────────── */

  setActiveElement(type: "A" | "B") {
    this.activeElement = type;
    this.updateActiveGains();
  }

  getActiveAudioElement() {
    return this.activeElement === "A" ? this.audioA : this.audioB;
  }

  setVolume(val: number) {
    const ctx = this.context;
    if (!ctx || !this.masterGain) return;
    this.resume();
    const now = ctx.currentTime;
    const safeVal = Math.max(0, Math.min(val, 1));
    try {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(safeVal, now);
    } catch {
      this.masterGain.gain.value = safeVal;
    }
  }

  fadeVolume(targetVal: number, durationSec: number = 2) {
    const ctx = this.context;
    if (!ctx || !this.masterGain) return;
    this.resume();
    const now = ctx.currentTime;
    const safeVal = Math.max(0, Math.min(targetVal, 1));
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(safeVal, now + Math.max(0.1, durationSec));
  }

  fadeIn(targetVol: number, durationSec: number = 1.5) {
    const ctx = this.context;
    if (!ctx || !this.masterGain) return;
    this.resume();
    const now = ctx.currentTime;
    const safeTarget = Math.max(0.01, Math.min(targetVol, 1));
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0.01, now);
    this.masterGain.gain.linearRampToValueAtTime(safeTarget, now + Math.max(0.1, durationSec));
  }

  async resume(): Promise<void> {
    if (typeof window === "undefined") return;
    if (!this.context) this.init();
    if (this.context && this.context.state === "suspended") {
      try {
        await this.context.resume();
      } catch (e) {
        console.warn("⚠️ AudioContext resume:", e);
      }
    }
  }

  /* ───────────── Legacy API (kept so older call sites keep working) ───────────── */

  resetAll() {
    this.applyFx({ ...DEFAULT_AUDIO_FX, eq: [0, 0, 0], crossfade: this.fx.crossfade });
  }

  setEq(index: number, gain: number) {
    const eq = [...this.fx.eq];
    eq[index] = gain;
    this.applyFx({ eq });
  }

  setReverb(type: string) {
    this.applyFx({ reverb: type });
  }

  setReverbMix(wetAmount: number) {
    this.applyFx({ reverbAmount: wetAmount });
  }

  toggle8D(enabled: boolean, direction: "clockwise" | "counter-clockwise" = "clockwise", freq: number = 0.15) {
    this.applyFx({ is8D: enabled, direction8D: direction, speed8D: freq });
  }

  set8DFrequency(freq: number) {
    this.applyFx({ speed8D: freq });
  }

  setPlaybackSpeed(speed: number, preservePitch: boolean = true) {
    this.applyFx({ speed, pitch: preservePitch ? 1 : speed });
  }

  /* ───────────────────────────── Teardown ───────────────────────────── */

  teardown() {
    this.stop8D();
    this.disconnectAll();

    if (this.featureWorker) {
      this.featureWorker.terminate();
      this.featureWorker = null;
    }
    [this.keepAliveOsc, this.chorusLfoA, this.chorusLfoB].forEach((o) => {
      try { o?.stop(); o?.disconnect(); } catch {}
    });
    try { this.keepAliveGain?.disconnect(); } catch {}
    this.keepAliveOsc = null;
    this.keepAliveGain = null;

    if (this.context && this.context.state !== "closed") {
      this.context.close();
    }
    this.context = null;

    // Drop every node: they belong to the closed context
    this.sourceA = this.sourceB = null;
    this.inputMixer = this.gainA = this.gainB = null;
    this.highpass = this.lowpass = null;
    this.equalizer = [];
    this.eqTrim = this.reverb = this.reverbMix = this.dryMix = null;
    this.echoSend = this.echoDelay = this.echoTone = this.echoFeedback = this.echoWet = null;
    this.chorusSplit = this.chorusMerge = this.chorusDelayL = this.chorusDelayR = null;
    this.chorusLfoA = this.chorusLfoB = this.chorusDepthA = this.chorusDepthB = this.chorusWet = null;
    this.fxSum = this.panner = this.compressor = this.masterGain = this.analyser = null;
    this.impulseCache.clear();
    this._currentReverb = "none";
    this._reverbSwapping = false;
    this._is8DEnabled = false;

    this.initialized = false;
    this.audioA = null;
    this.audioB = null;
  }
}

export const audioEngine = ZenAudioEngine.getInstance();
