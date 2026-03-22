"use client";

class ZenAudioEngine {
    private static instance: ZenAudioEngine;
    private context: AudioContext | null = null;
    private sourceA: MediaElementAudioSourceNode | null = null;
    private sourceB: MediaElementAudioSourceNode | null = null;

    // Stable Nodes (Created once)
    private inputMixer: GainNode | null = null;
    private gainA: GainNode | null = null;
    private gainB: GainNode | null = null;
    private equalizer: BiquadFilterNode[] = [];
    private reverb: ConvolverNode | null = null;
    private reverbMix: GainNode | null = null;
    private dryMix: GainNode | null = null;
    private panner: PannerNode | null = null;
    private compressor: DynamicsCompressorNode | null = null;
    private masterGain: GainNode | null = null;

    private audioA: HTMLAudioElement | null = null;
    private audioB: HTMLAudioElement | null = null;
    private activeElement: 'A' | 'B' = 'A';
    private initialized = false;

    // 8D State & LFOs
    private lfoX: OscillatorNode | null = null;
    private lfoZ: OscillatorNode | null = null;
    private lfoGainX: GainNode | null = null;
    private lfoGainZ: GainNode | null = null;
    private _is8DEnabled = false;
    private _8dDirection: 'clockwise' | 'counter-clockwise' = 'clockwise';
    private _currentReverb = 'none';

    private constructor() { }

    static getInstance() {
        if (!ZenAudioEngine.instance) {
            ZenAudioEngine.instance = new ZenAudioEngine();
        }
        return ZenAudioEngine.instance;
    }

    init(audioA: HTMLAudioElement, audioB: HTMLAudioElement) {
        // Prevent re-init if same elements are provided
        if (this.audioA === audioA && this.audioB === audioB && this.initialized) return;
        
        console.log("🎵 ZenAudioEngine: Hooking Audio Elements");
        this.audioA = audioA;
        this.audioB = audioB;
        this.setupGraph();
    }

    private setupGraph() {
        if (!this.audioA || !this.audioB) return;

        if (!this.context) {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            this.context = new AudioContextClass({ latencyHint: 'interactive' });
        }

        const ctx = this.context!;

        // 1. Create Nodes if they don't exist
        if (!this.inputMixer) {
            console.log("🎵 ZenAudioEngine: Creating Node Chain");
            this.gainA = ctx.createGain();
            this.gainB = ctx.createGain();
            this.inputMixer = ctx.createGain();

            this.equalizer = [60, 1000, 12000].map(freq => {
                const filter = ctx.createBiquadFilter();
                filter.type = freq === 60 ? 'lowshelf' : freq === 12000 ? 'highshelf' : 'peaking';
                filter.frequency.value = freq;
                filter.Q.value = 1;
                filter.gain.value = 0;
                return filter;
            });

            this.reverb = ctx.createConvolver();
            this.reverbMix = ctx.createGain();
            this.dryMix = ctx.createGain();
            this.panner = ctx.createPanner();
            this.panner.panningModel = 'equalpower';
            this.panner.distanceModel = 'linear';
            this.panner.positionX.value = 0;
            this.panner.positionY.value = 0;
            this.panner.positionZ.value = 0;

            this.compressor = ctx.createDynamicsCompressor();
            this.compressor.threshold.setTargetAtTime(-1, ctx.currentTime, 0.1);
            this.compressor.knee.setTargetAtTime(10, ctx.currentTime, 0.1);
            this.compressor.ratio.setTargetAtTime(20, ctx.currentTime, 0.1);
            this.compressor.attack.setTargetAtTime(0.001, ctx.currentTime, 0.1);
            this.compressor.release.setTargetAtTime(0.1, ctx.currentTime, 0.1);

            this.masterGain = ctx.createGain();
            this.masterGain.gain.value = 1.0;
        }

        // 2. Safely Rebuild Sources
        try {
            // ONLY create source once per element to avoid DOMException
            if (!this.sourceA && this.audioA) {
                this.sourceA = ctx.createMediaElementSource(this.audioA);
            }
            if (!this.sourceB && this.audioB && this.audioA !== this.audioB) {
                this.sourceB = ctx.createMediaElementSource(this.audioB);
            }
        } catch (e) {
            console.warn("⚠️ ZenAudioEngine: Source creation error (likely already attached):", e);
        }

        this.disconnectAll();

        // 3. Rebuild Chain
        try {
            if (this.sourceA && this.gainA) this.sourceA.connect(this.gainA);
            if (this.sourceB && this.gainB) this.sourceB.connect(this.gainB);
            if (this.gainA && this.inputMixer) this.gainA.connect(this.inputMixer);
            if (this.gainB && this.inputMixer) this.gainB.connect(this.inputMixer);

            let lastNode: AudioNode = this.inputMixer!;
            this.equalizer.forEach(filter => {
                lastNode.connect(filter);
                lastNode = filter;
            });

            if (this.dryMix && this.reverb && this.reverbMix && this.panner && this.compressor && this.masterGain) {
                lastNode.connect(this.dryMix);
                lastNode.connect(this.reverb);
                this.reverb.connect(this.reverbMix);
                this.dryMix.connect(this.panner);
                this.reverbMix.connect(this.panner);
                this.panner.connect(this.compressor);
                this.compressor.connect(this.masterGain);
                this.masterGain.connect(ctx.destination);
            }
        } catch (e) {
            console.error("⚠️ ZenAudioEngine: Signal path rebuild failed:", e);
        }

        this.initialized = true;
        this.updateActiveGains();
    }

    private disconnectAll() {
        this.sourceA?.disconnect();
        this.sourceB?.disconnect();
        this.gainA?.disconnect();
        this.gainB?.disconnect();
        this.inputMixer?.disconnect();
        this.equalizer.forEach(f => f.disconnect());
        this.reverb?.disconnect();
        this.reverbMix?.disconnect();
        this.dryMix?.disconnect();
        this.panner?.disconnect();
        this.compressor?.disconnect();
        this.masterGain?.disconnect();
    }

    private updateActiveGains() {
        if (!this.gainA || !this.gainB) return;
        this.gainA.gain.setTargetAtTime(this.activeElement === 'A' ? 1 : 0, this.context!.currentTime, 0.05);
        this.gainB.gain.setTargetAtTime(this.activeElement === 'B' ? 1 : 0, this.context!.currentTime, 0.05);
    }

    resetAll() {
        this.resume();
        this.setEq(0, 0);
        this.setEq(1, 0);
        this.setEq(2, 0);
        this.setReverb('none');
        this.setReverbMix(0);
        this.toggle8D(false);
        this.setPlaybackSpeed(1);
    }

    setActiveElement(type: 'A' | 'B') {
        this.activeElement = type;
        this.updateActiveGains();
    }

    getActiveAudioElement() {
        return this.activeElement === 'A' ? this.audioA : this.audioB;
    }

    setEq(index: number, gain: number) {
        this.resume();
        if (this.equalizer[index] && this.context) {
            this.equalizer[index].gain.setTargetAtTime(gain, this.context.currentTime, 0.1);
        }
    }

    setVolume(val: number) {
        const ctx = this.context;
        if (!ctx || !this.masterGain) return;
        this.resume();

        const now = ctx.currentTime;
        const safeVal = Math.max(0, Math.min(val, 1));
        this.masterGain.gain.setTargetAtTime(safeVal, now, 0.05);
    }

    resume() {
        if (this.context?.state === 'suspended') {
            this.context.resume().catch(() => {});
        }
    }

    toggle8D(enabled: boolean, direction: 'clockwise' | 'counter-clockwise' = 'clockwise') {
        this.resume();
        const wasEnabled = this._is8DEnabled;
        this._is8DEnabled = enabled;
        this._8dDirection = direction;

        if (!enabled) { this.stop8D(); return; }
        if (this.context && this.panner) {
            const ctx = this.context;
            if (wasEnabled && this.lfoGainZ) {
                const now = ctx.currentTime;
                const targetGain = direction === 'clockwise' ? 3.5 : -3.5;
                this.lfoGainZ.gain.setTargetAtTime(targetGain, now, 0.2);
                return;
            }
            this.stop8D();
            this.panner.panningModel = 'HRTF';
            this.lfoGainX = ctx.createGain();
            this.lfoGainZ = ctx.createGain();
            this.lfoGainX.gain.value = 3.5;
            this.lfoGainZ.gain.value = direction === 'clockwise' ? 3.5 : -3.5;
            this.lfoX = ctx.createOscillator();
            this.lfoZ = ctx.createOscillator();
            const freq = 0.15;
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
            this.lfoX.start(); this.lfoZ.start();
        }
    }

    private stop8D() {
        if (this.lfoX) { try { this.lfoX.stop(); this.lfoX.disconnect(); } catch (e) { } this.lfoX = null; }
        if (this.lfoZ) { try { this.lfoZ.stop(); this.lfoZ.disconnect(); } catch (e) { } this.lfoZ = null; }
        if (this.lfoGainX) { try { this.lfoGainX.disconnect(); } catch (e) { } this.lfoGainX = null; }
        if (this.lfoGainZ) { try { this.lfoGainZ.disconnect(); } catch (e) { } this.lfoGainZ = null; }
        if (this.panner && this.context) {
            this.panner.panningModel = 'equalpower';
            const now = this.context.currentTime;
            this.panner.positionX.setTargetAtTime(0, now, 0.1);
            this.panner.positionY.setTargetAtTime(0, now, 0.1);
            this.panner.positionZ.setTargetAtTime(0, now, 0.1);
        }
    }

    async setReverb(type: string) {
        this.resume();
        if (!this.context || !this.reverb || type === this._currentReverb) return;
        this._currentReverb = type;
        if (type === 'none') { this.reverb.buffer = null; return; }
        const duration = type === 'cathedral' ? 3.5 : 1.5;
        const sampleRate = this.context.sampleRate;
        const length = sampleRate * duration;
        const impulse = this.context.createBuffer(2, length, sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
            }
        }
        this.reverb.buffer = impulse;
    }

    setReverbMix(wetAmount: number) {
        this.resume();
        if (this.dryMix && this.reverbMix && this.context) {
            const now = this.context.currentTime;
            this.dryMix.gain.setTargetAtTime(1.0, now, 0.05);
            this.reverbMix.gain.setTargetAtTime(wetAmount, now, 0.05);
        }
    }

    setPlaybackSpeed(speed: number, preservePitch: boolean = true) {
        this.resume();
        [this.audioA, this.audioB].forEach(el => {
            if (el) {
                el.playbackRate = speed;
                // @ts-ignore
                el.preservesPitch = preservePitch;
            }
        });
    }
}

export const audioEngine = ZenAudioEngine.getInstance();
