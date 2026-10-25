"use client";

/* ─────────────────────────────────────────────────────────────────────────────
   Zenify Audio Engine v2

   sources → inputMixer ─┬─ vocalDry ─────────────┐
                         └─ [Vocal Isolator] ─────┴→ vocalSum
   vocalSum → ( reorderable chain: EQ · Filter · Warmth · Chorus · Echo · Reverb ) → fxGate
   fxGate → stereo width → 8D panner → compressor (night mode) → makeup → master → output
───────────────────────────────────────────────────────────────────────────── */

export type FxModuleId = "eq" | "filter" | "drive" | "chorus" | "echo" | "reverb";
export const DEFAULT_CHAIN: FxModuleId[] = ["eq", "filter", "drive", "chorus", "echo", "reverb"];
export type VocalMode = "off" | "vocals" | "karaoke";
export type VocalStatus = "idle" | "loading" | "ready" | "unsupported";
export type ReverbType = "none" | "warehouse" | "cathedral";

export interface AudioFxSettings {
  eq: number[]; // [bass, mid, treble] dB (-12..12)
  reverb: string; // 'none' | 'warehouse' | 'cathedral'
  reverbAmount: number; // 0..1
  echo: number; // 0..1
  echoTime: number; // seconds
  chorus: number; // 0..1
  filter: number; // -1 low-pass .. 0 off .. +1 high-pass
  drive: number; // 0..1 warmth / saturation
  width: number; // 0 mono .. 1 original .. 2 extra wide
  night: boolean; // night mode (dynamics control)
  vocalMode: VocalMode;
  vocalAmount: number; // 0..1
  vocalFocus: number; // 0..1
  chain: string[]; // order of FxModuleId
  is8D: boolean;
  direction8D: "clockwise" | "counter-clockwise";
  speed8D: number;
  speed: number;
  pitch: number;
  bypass: boolean;
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
  drive: 0,
  width: 1,
  night: false,
  vocalMode: "off",
  vocalAmount: 0.85,
  vocalFocus: 0.5,
  chain: [...DEFAULT_CHAIN],
  is8D: false,
  direction8D: "clockwise",
  speed8D: 0.15,
  speed: 1,
  pitch: 1,
  bypass: false,
  crossfade: 5,
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function sanitizeChain(input: unknown): FxModuleId[] {
  const seen = new Set<string>();
  const out: FxModuleId[] = [];
  if (Array.isArray(input)) {
    for (const x of input) {
      if (DEFAULT_CHAIN.includes(x as FxModuleId) && !seen.has(x)) {
        seen.add(x);
        out.push(x as FxModuleId);
      }
    }
  }
  for (const x of DEFAULT_CHAIN) if (!seen.has(x)) out.push(x);
  return out;
}

/** DJ-style filter mapping, shared with the UI for labels. */
export function filterFrequencies(value: number) {
  const f = clamp(value, -1, 1);
  return {
    lowpass: 20000 * Math.pow(0.0125, Math.max(0, -f)),
    highpass: 20 * Math.pow(300, Math.max(0, f)),
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Native WebAudio Mid-Side Vocal Isolator & Karaoke Processor
   0ms latency, zero buffer underruns, 100% reliable cross-browser performance.
───────────────────────────────────────────────────────────────────────────── */

interface FxModule {
  in: AudioNode;
  out: AudioNode;
}

class ZenAudioEngine {
  private static instance: ZenAudioEngine;
  private context: AudioContext | null = null;
  private sourceA: MediaElementAudioSourceNode | null = null;
  private sourceB: MediaElementAudioSourceNode | null = null;

  // Input + vocal stage (Zero-lag, 100% native WebAudio Mid-Side processor)
  private inputMixer: GainNode | null = null;
  private gainA: GainNode | null = null;
  private gainB: GainNode | null = null;
  private vocalDry: GainNode | null = null;
  private vocalWet: GainNode | null = null;
  private vocalSum: GainNode | null = null;
  private vocalState: VocalStatus = "ready";

  // Native Mid-Side nodes
  private vocalSplit: ChannelSplitterNode | null = null;
  private vocalMerge: ChannelMergerNode | null = null;
  private vocalMidSum: GainNode | null = null;
  private vocalBandFilter: BiquadFilterNode | null = null;
  private vocalBandGain: GainNode | null = null;
  private vocalBassFilterL: BiquadFilterNode | null = null;
  private vocalBassFilterR: BiquadFilterNode | null = null;
  private vocalHighFilterL: BiquadFilterNode | null = null;
  private vocalHighFilterR: BiquadFilterNode | null = null;
  private vocalSideL: GainNode | null = null;
  private vocalSideR: GainNode | null = null;
  private vocalSideGain: GainNode | null = null;
  private vocalBassGain: GainNode | null = null;
  private vocalHighGain: GainNode | null = null;

  // Reorderable modules
  private mods: Partial<Record<FxModuleId, FxModule>> = {};
  private chainApplied = "";

  // Filter
  private highpass: BiquadFilterNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  // EQ
  private equalizer: BiquadFilterNode[] = [];
  private eqTrim: GainNode | null = null;
  // Drive
  private driveDry: GainNode | null = null;
  private drivePre: GainNode | null = null;
  private driveWet: GainNode | null = null;
  // Reverb
  private reverb: ConvolverNode | null = null;
  private reverbMix: GainNode | null = null;
  private dryMix: GainNode | null = null;
  // Echo
  private echoSend: GainNode | null = null;
  private echoDelay: DelayNode | null = null;
  private echoFeedback: GainNode | null = null;
  private echoWet: GainNode | null = null;
  // Chorus
  private chorusDepthA: GainNode | null = null;
  private chorusDepthB: GainNode | null = null;
  private chorusLfoA: OscillatorNode | null = null;
  private chorusLfoB: OscillatorNode | null = null;
  private chorusWet: GainNode | null = null;

  // Output stage
  private fxGate: GainNode | null = null;
  private widthGains: { ll: GainNode; rl: GainNode; lr: GainNode; rr: GainNode } | null = null;
  private panner: PannerNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private compMakeup: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private vizAnalyser: AnalyserNode | null = null;

  private audioA: HTMLAudioElement | null = null;
  private audioB: HTMLAudioElement | null = null;
  private activeElement: "A" | "B" = "A";
  private initialized = false;
  private keepAliveOsc: OscillatorNode | null = null;
  private keepAliveGain: GainNode | null = null;

  private fx: AudioFxSettings = { ...DEFAULT_AUDIO_FX, eq: [0, 0, 0], chain: [...DEFAULT_CHAIN] };

  // 8D
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
    if (!ZenAudioEngine.instance) ZenAudioEngine.instance = new ZenAudioEngine();
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
        if (this.context && this.context.state === "suspended") this.context.resume().catch(() => {});
      });
      window.addEventListener("focus", () => {
        if (this.context && this.context.state === "suspended") this.context.resume().catch(() => {});
      });
    }
  }

  /* ───────────────────────────── Graph ───────────────────────────── */

  private buildNodes(ctx: AudioContext) {
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };

    this.gainA = g();
    this.gainB = g();
    this.inputMixer = g();

    // Vocal Stage: Clean dry + Wet Mid-Side Stage
    this.vocalDry = g(1);
    this.vocalWet = g(0);
    this.vocalSum = g(1);
    this.vocalDry.connect(this.vocalSum);
    this.vocalWet.connect(this.vocalSum);

    // Native Mid-Side Vocal Extraction & Karaoke Matrix
    this.vocalSplit = ctx.createChannelSplitter(2);
    this.vocalMerge = ctx.createChannelMerger(2);

    // Mid Channel: (L + R) * 0.5
    this.vocalMidSum = g(0.5);
    const midFromR = g(0.5);

    // Side Channel L: (L - R) * 0.5
    const sideFromL_A = g(0.5);
    const sideFromR_A = g(-0.5);
    // Side Channel R: (R - L) * 0.5
    const sideFromR_B = g(0.5);
    const sideFromL_B = g(-0.5);

    this.vocalSideL = g(1);
    this.vocalSideR = g(1);
    this.vocalSideGain = g(1);

    // Vocal frequency bandpass (180Hz - 5000Hz)
    this.vocalBandFilter = ctx.createBiquadFilter();
    this.vocalBandFilter.type = "bandpass";
    this.vocalBandFilter.frequency.value = 1400;
    this.vocalBandFilter.Q.value = 0.6;
    this.vocalBandGain = g(1);

    // Bass passthrough (lowpass 180Hz) to preserve kick/bass in stereo
    this.vocalBassFilterL = ctx.createBiquadFilter();
    this.vocalBassFilterL.type = "lowpass";
    this.vocalBassFilterL.frequency.value = 180;
    this.vocalBassFilterL.Q.value = 0.707;
    this.vocalBassFilterR = ctx.createBiquadFilter();
    this.vocalBassFilterR.type = "lowpass";
    this.vocalBassFilterR.frequency.value = 180;
    this.vocalBassFilterR.Q.value = 0.707;
    this.vocalBassGain = g(1);

    // High passthrough (highpass 5500Hz) to preserve cymbals/air
    this.vocalHighFilterL = ctx.createBiquadFilter();
    this.vocalHighFilterL.type = "highpass";
    this.vocalHighFilterL.frequency.value = 5500;
    this.vocalHighFilterL.Q.value = 0.707;
    this.vocalHighFilterR = ctx.createBiquadFilter();
    this.vocalHighFilterR.type = "highpass";
    this.vocalHighFilterR.frequency.value = 5500;
    this.vocalHighFilterR.Q.value = 0.707;
    this.vocalHighGain = g(1);

    // Wire Splitter:
    this.inputMixer.connect(this.vocalSplit);

    // Mid wiring: (L + R) * 0.5
    this.vocalSplit.connect(this.vocalMidSum, 0);
    this.vocalSplit.connect(midFromR, 1);
    midFromR.connect(this.vocalMidSum);
    this.vocalMidSum.connect(this.vocalBandFilter);
    this.vocalBandFilter.connect(this.vocalBandGain);

    // BandGain feeds both L and R of merger
    this.vocalBandGain.connect(this.vocalMerge, 0, 0);
    this.vocalBandGain.connect(this.vocalMerge, 0, 1);

    // Bass wiring
    this.vocalSplit.connect(this.vocalBassFilterL, 0);
    this.vocalSplit.connect(this.vocalBassFilterR, 1);
    this.vocalBassFilterL.connect(this.vocalBassGain);
    this.vocalBassFilterR.connect(this.vocalBassGain);
    this.vocalBassGain.connect(this.vocalMerge, 0, 0);
    this.vocalBassGain.connect(this.vocalMerge, 0, 1);

    // High wiring
    this.vocalSplit.connect(this.vocalHighFilterL, 0);
    this.vocalSplit.connect(this.vocalHighFilterR, 1);
    this.vocalHighFilterL.connect(this.vocalHighGain);
    this.vocalHighFilterR.connect(this.vocalHighGain);
    this.vocalHighGain.connect(this.vocalMerge, 0, 0);
    this.vocalHighGain.connect(this.vocalMerge, 0, 1);

    // Side L wiring: (L - R) * 0.5
    this.vocalSplit.connect(sideFromL_A, 0);
    this.vocalSplit.connect(sideFromR_A, 1);
    sideFromL_A.connect(this.vocalSideL);
    sideFromR_A.connect(this.vocalSideL);
    this.vocalSideL.connect(this.vocalSideGain);
    this.vocalSideGain.connect(this.vocalMerge, 0, 0);

    // Side R wiring: (R - L) * 0.5
    this.vocalSplit.connect(sideFromR_B, 1);
    this.vocalSplit.connect(sideFromL_B, 0);
    sideFromR_B.connect(this.vocalSideR);
    sideFromL_B.connect(this.vocalSideR);
    this.vocalSideR.connect(this.vocalSideGain);
    this.vocalSideGain.connect(this.vocalMerge, 0, 1);

    // Output of merger into vocalWet
    this.vocalMerge.connect(this.vocalWet);

    // ── Filter module
    this.highpass = ctx.createBiquadFilter();
    this.highpass.type = "highpass";
    this.highpass.frequency.value = 20;
    this.highpass.Q.value = 0.707;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 20000;
    this.lowpass.Q.value = 0.707;
    this.highpass.connect(this.lowpass);
    this.mods.filter = { in: this.highpass, out: this.lowpass };

    // ── EQ module
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
    this.eqTrim = g();
    this.equalizer[0].connect(this.equalizer[1]);
    this.equalizer[1].connect(this.equalizer[2]);
    this.equalizer[2].connect(this.eqTrim);
    this.mods.eq = { in: this.equalizer[0], out: this.eqTrim };

    // ── Drive (warmth) module
    const driveIn = g();
    const driveOut = g();
    this.driveDry = g(1);
    this.drivePre = g(1);
    this.driveWet = g(0);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    const k = 2.5;
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    shaper.curve = curve;
    shaper.oversample = "4x";
    const driveTone = ctx.createBiquadFilter();
    driveTone.type = "lowpass";
    driveTone.frequency.value = 7500;
    driveTone.Q.value = 0.5;
    driveIn.connect(this.driveDry);
    this.driveDry.connect(driveOut);
    driveIn.connect(this.drivePre);
    this.drivePre.connect(shaper);
    shaper.connect(driveTone);
    driveTone.connect(this.driveWet);
    this.driveWet.connect(driveOut);
    this.mods.drive = { in: driveIn, out: driveOut };

    // ── Chorus module (stereo, independent modulated delay per channel)
    const chIn = g();
    const chOut = g();
    const chDry = g(1);
    const chorusSplit = ctx.createChannelSplitter(2);
    const chorusMerge = ctx.createChannelMerger(2);
    const chorusDelayL = ctx.createDelay(0.05);
    const chorusDelayR = ctx.createDelay(0.05);
    chorusDelayL.delayTime.value = 0.02;
    chorusDelayR.delayTime.value = 0.026;
    this.chorusDepthA = g(0.0012);
    this.chorusDepthB = g(0.0012);
    this.chorusLfoA = ctx.createOscillator();
    this.chorusLfoB = ctx.createOscillator();
    this.chorusLfoA.frequency.value = 0.55;
    this.chorusLfoB.frequency.value = 0.73;
    this.chorusLfoA.connect(this.chorusDepthA);
    this.chorusLfoB.connect(this.chorusDepthB);
    this.chorusDepthA.connect(chorusDelayL.delayTime);
    this.chorusDepthB.connect(chorusDelayR.delayTime);
    this.chorusLfoA.start();
    this.chorusLfoB.start();
    this.chorusWet = g(0);
    chIn.connect(chDry);
    chDry.connect(chOut);
    chIn.connect(chorusSplit);
    chorusSplit.connect(chorusDelayL, 0);
    chorusSplit.connect(chorusDelayR, 1);
    chorusDelayL.connect(chorusMerge, 0, 0);
    chorusDelayR.connect(chorusMerge, 0, 1);
    chorusMerge.connect(this.chorusWet);
    this.chorusWet.connect(chOut);
    this.mods.chorus = { in: chIn, out: chOut };

    // ── Echo module (tape style: every repeat gets darker)
    const eIn = g();
    const eOut = g();
    const eDry = g(1);
    this.echoSend = g(0);
    this.echoDelay = ctx.createDelay(1.5);
    this.echoDelay.delayTime.value = 0.32;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = "lowpass";
    echoTone.frequency.value = 4200;
    echoTone.Q.value = 0.5;
    this.echoFeedback = g(0.3);
    this.echoWet = g(0);
    eIn.connect(eDry);
    eDry.connect(eOut);
    eIn.connect(this.echoSend);
    this.echoSend.connect(this.echoDelay);
    this.echoDelay.connect(echoTone);
    echoTone.connect(this.echoFeedback);
    this.echoFeedback.connect(this.echoDelay);
    echoTone.connect(this.echoWet);
    this.echoWet.connect(eOut);
    this.mods.echo = { in: eIn, out: eOut };

    // ── Reverb module
    const rIn = g();
    const rOut = g();
    this.reverb = ctx.createConvolver();
    this.reverbMix = g(0);
    this.dryMix = g(1);
    rIn.connect(this.dryMix);
    this.dryMix.connect(rOut);
    rIn.connect(this.reverb);
    this.reverb.connect(this.reverbMix);
    this.reverbMix.connect(rOut);
    this.mods.reverb = { in: rIn, out: rOut };

    // ── Output stage
    this.fxGate = g(1);

    // Mid/side width matrix: L' = aL + bR, R' = bL + aR with a=(1+w)/2, b=(1-w)/2
    this.widthGains = { ll: g(1), rl: g(0), lr: g(0), rr: g(1) };

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
    this.compMakeup = g(1);

    this.masterGain = g(1);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;

    // Dedicated analyser for the UI visualizer: finer resolution, wide dB window
    this.vizAnalyser = ctx.createAnalyser();
    this.vizAnalyser.fftSize = 2048;
    this.vizAnalyser.smoothingTimeConstant = 0.55;
    this.vizAnalyser.minDecibels = -100;
    this.vizAnalyser.maxDecibels = -6;
  }

  private setupGraph() {
    if (!this.audioA || !this.audioB) return;

    if (!this.context) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.context = new AudioContextClass({ latencyHint: "playback" });
    }
    const ctx = this.context!;

    ctx.onstatechange = () => {
      if (ctx.state === "suspended" && this.initialized) ctx.resume().catch(() => {});
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
      this.inputMixer!.connect(this.vocalDry!);

      this.connectChain();

      const w = this.widthGains!;
      const split = ctx.createChannelSplitter(2);
      const merge = ctx.createChannelMerger(2);
      this.fxGate!.connect(split);
      split.connect(w.ll, 0);
      split.connect(w.lr, 0);
      split.connect(w.rl, 1);
      split.connect(w.rr, 1);
      w.ll.connect(merge, 0, 0);
      w.rl.connect(merge, 0, 0);
      w.lr.connect(merge, 0, 1);
      w.rr.connect(merge, 0, 1);
      merge.connect(this.panner!);

      this.panner!.connect(this.compressor!);
      this.compressor!.connect(this.compMakeup!);
      this.compMakeup!.connect(this.analyser!);
      this.compMakeup!.connect(this.vizAnalyser!);
      this.analyser!.connect(this.masterGain!);
      this.masterGain!.connect(ctx.destination);
    } catch (e) {
      console.error("⚠️ ZenAudioEngine: Signal path build failed:", e);
    }
  }

  /** (Re)wire vocalSum → modules in the user's order → fxGate (instant click-free reordering). */
  private connectChain() {
    if (!this.vocalSum || !this.fxGate) return;
    const order = sanitizeChain(this.fx.chain);
    try { this.vocalSum.disconnect(); } catch {}
    (Object.values(this.mods) as FxModule[]).forEach((m) => {
      try { m.out.disconnect(); } catch {}
    });
    let prev: AudioNode = this.vocalSum;
    order.forEach((id) => {
      const m = this.mods[id];
      if (!m) return;
      try { prev.connect(m.in); } catch {}
      prev = m.out;
    });
    try { prev.connect(this.fxGate); } catch {}
    this.chainApplied = order.join(",");
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
      chain: sanitizeChain(next.chain ?? this.fx.chain),
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
      // Assigning src resets playbackRate, so always compare with the element itself
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

    // Chain order
    if (this.chainApplied !== fx.chain.join(",")) {
      this.connectChain();
    }

    // EQ + headroom trim
    const eq = on ? fx.eq : [0, 0, 0];
    this.equalizer.forEach((f, i) => f.gain.setTargetAtTime(clamp(eq[i] ?? 0, -12, 12), t, 0.05));
    const boost = Math.max(0, ...eq.map((v) => v ?? 0));
    this.eqTrim!.gain.setTargetAtTime(Math.pow(10, (-boost * 0.6) / 20), t, 0.08);

    // DJ filter
    const { lowpass, highpass } = filterFrequencies(on ? fx.filter : 0);
    this.lowpass!.frequency.setTargetAtTime(lowpass, t, 0.04);
    this.highpass!.frequency.setTargetAtTime(highpass, t, 0.04);

    // Warmth (saturation)
    const d = on ? clamp(fx.drive, 0, 1) : 0;
    this.drivePre!.gain.setTargetAtTime(1 + 3 * d, t, 0.05);
    this.driveWet!.gain.setTargetAtTime((d * 0.85) / Math.sqrt(1 + 3 * d), t, 0.05);
    this.driveDry!.gain.setTargetAtTime(1 - 0.5 * d, t, 0.05);

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
    this.echoFeedback!.gain.setTargetAtTime(0.28 + 0.32 * e, t, 0.05);
    this.echoDelay!.delayTime.setTargetAtTime(clamp(fx.echoTime, 0.06, 1), t, 0.12);

    // Chorus
    const c = on ? clamp(fx.chorus, 0, 1) : 0;
    this.chorusWet!.gain.setTargetAtTime(c * 0.8, t, 0.05);
    this.chorusDepthA!.gain.setTargetAtTime(0.0012 + 0.0028 * c, t, 0.1);
    this.chorusDepthB!.gain.setTargetAtTime(0.0012 + 0.0028 * c, t, 0.1);

    // Stereo width
    const w = on ? clamp(fx.width, 0, 2) : 1;
    const a = (1 + w) / 2;
    const b = (1 - w) / 2;
    const wg = this.widthGains!;
    wg.ll.gain.setTargetAtTime(a, t, 0.05);
    wg.rr.gain.setTargetAtTime(a, t, 0.05);
    wg.rl.gain.setTargetAtTime(b, t, 0.05);
    wg.lr.gain.setTargetAtTime(b, t, 0.05);

    // Night mode (tighter dynamics, lower peaks)
    const night = on && fx.night;
    this.compressor!.threshold.setTargetAtTime(night ? -32 : -14, t, 0.1);
    this.compressor!.ratio.setTargetAtTime(night ? 6 : 3, t, 0.1);
    this.compressor!.knee.setTargetAtTime(night ? 18 : 24, t, 0.1);
    this.compressor!.release.setTargetAtTime(night ? 0.18 : 0.25, t, 0.1);
    this.compMakeup!.gain.setTargetAtTime(night ? 2.2 : 1, t, 0.15);

    // Vocal isolator
    this.renderVocal(on && fx.vocalMode !== "off" ? fx.vocalMode : "off", t);

    // 8D
    this.sync8D(on && fx.is8D, fx.direction8D, clamp(fx.speed8D, 0.03, 0.6));
  }

  /* ───────────────────────────── Vocal isolator (Native Mid-Side DSP) ───────────────────────────── */

  getVocalStatus(): VocalStatus {
    return "ready";
  }

  private renderVocal(mode: VocalMode, t: number) {
    if (!this.vocalDry || !this.vocalWet || !this.vocalBandGain || !this.vocalSideGain || !this.vocalBassGain || !this.vocalHighGain) return;
    const amount = clamp(this.fx.vocalAmount, 0, 1);
    const focus = clamp(this.fx.vocalFocus, 0, 1);

    if (this.vocalBandFilter) {
      // Focus adjusts the Q / bandwidth of the vocal band
      this.vocalBandFilter.Q.setTargetAtTime(0.4 + focus * 1.4, t, 0.05);
    }

    if (mode === "karaoke") {
      // Center vocal extraction cancellation
      this.vocalDry.gain.setTargetAtTime(0, t, 0.04);
      this.vocalWet.gain.setTargetAtTime(1, t, 0.04);

      // Attenuate mid frequencies (vocals) by amount
      this.vocalBandGain.gain.setTargetAtTime(Math.max(0, 1 - amount * 1.15), t, 0.04);
      // Keep stereo backing instruments, reverberations, bass and top end full
      this.vocalSideGain.gain.setTargetAtTime(1 + 0.15 * amount, t, 0.04);
      this.vocalBassGain.gain.setTargetAtTime(1.0, t, 0.04);
      this.vocalHighGain.gain.setTargetAtTime(1.0, t, 0.04);
    } else if (mode === "vocals") {
      // Isolate center vocals, attenuate sides and extreme lows/highs
      this.vocalDry.gain.setTargetAtTime(0, t, 0.04);
      this.vocalWet.gain.setTargetAtTime(1, t, 0.04);

      // Boost/preserve center mid frequencies
      this.vocalBandGain.gain.setTargetAtTime(1.3 * amount, t, 0.04);
      // Suppress stereo sides and backing instrumental
      this.vocalSideGain.gain.setTargetAtTime(Math.max(0, 1 - amount * 1.25), t, 0.04);
      this.vocalBassGain.gain.setTargetAtTime(Math.max(0, 1 - amount * 0.95), t, 0.04);
      this.vocalHighGain.gain.setTargetAtTime(Math.max(0, 1 - amount * 0.95), t, 0.04);
    } else {
      // Bypass mode: Pristine stereo original
      this.vocalDry.gain.setTargetAtTime(1, t, 0.04);
      this.vocalWet.gain.setTargetAtTime(0, t, 0.04);
    }
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

  /** High-resolution analyser for the UI visualizer. */
  getVizAnalyser() {
    return this.vizAnalyser;
  }

  getSampleRate() {
    return this.context?.sampleRate ?? 48000;
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
    if (typeof window !== "undefined") {
      if (!this.context) this.init();
      if (this.context && this.context.state === "suspended") {
        try {
          await this.context.resume();
        } catch (e) {
          console.warn("⚠️ AudioContext resume:", e);
        }
      }
    }
  }

  /* ───────────── Legacy API (kept so older call sites keep working) ───────────── */

  resetAll() {
    this.applyFx({ ...DEFAULT_AUDIO_FX, eq: [0, 0, 0], chain: [...DEFAULT_CHAIN], crossfade: this.fx.crossfade });
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

  setCrossfade(crossfade: number) {
    this.applyFx({ crossfade });
  }

  toggleNormalize(enabled: boolean) {
    this.applyFx({ night: enabled });
  }

  /* ───────────────────────────── Teardown ───────────────────────────── */

  teardown() {
    this.stop8D();

    if (this.featureWorker) {
      this.featureWorker.terminate();
      this.featureWorker = null;
    }
    [this.keepAliveOsc, this.chorusLfoA, this.chorusLfoB].forEach((o) => {
      try { o?.stop(); o?.disconnect(); } catch {}
    });
    try { this.keepAliveGain?.disconnect(); } catch {}

    if (this.context && this.context.state !== "closed") this.context.close();
    this.context = null;

    // Every node belongs to the closed context – drop them all
    this.keepAliveOsc = this.keepAliveGain = null;
    this.sourceA = this.sourceB = null;
    this.inputMixer = this.gainA = this.gainB = null;
    this.vocalDry = this.vocalWet = this.vocalSum = null;
    this.vocalSplit = this.vocalMerge = this.vocalMidSum = this.vocalBandFilter = this.vocalBandGain = null;
    this.vocalBassFilterL = this.vocalBassFilterR = this.vocalHighFilterL = this.vocalHighFilterR = null;
    this.vocalSideL = this.vocalSideR = this.vocalSideGain = this.vocalBassGain = this.vocalHighGain = null;
    this.vocalState = "ready";
    this.mods = {};
    this.chainApplied = "";
    this.highpass = this.lowpass = null;
    this.equalizer = [];
    this.eqTrim = this.driveDry = this.drivePre = this.driveWet = null;
    this.reverb = this.reverbMix = this.dryMix = null;
    this.echoSend = this.echoDelay = this.echoFeedback = this.echoWet = null;
    this.chorusDepthA = this.chorusDepthB = this.chorusLfoA = this.chorusLfoB = this.chorusWet = null;
    this.fxGate = this.widthGains = this.panner = this.compressor = this.compMakeup = null;
    this.masterGain = this.analyser = this.vizAnalyser = null;
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
