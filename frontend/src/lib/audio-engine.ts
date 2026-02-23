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

    private constructor() { }

    static getInstance() {
        if (!ZenAudioEngine.instance) {
            ZenAudioEngine.instance = new ZenAudioEngine();
        }
        return ZenAudioEngine.instance;
    }

    init(audioA: HTMLAudioElement, audioB: HTMLAudioElement) {
        if (this.audioA === audioA && this.audioB === audioB) return;
        console.log("🎵 ZenAudioEngine: Hooking Audio Elements");
        this.audioA = audioA;
        this.audioB = audioB;
        this.setupGraph();
    }

    private setupGraph() {
        if (!this.audioA || !this.audioB) return;

        if (!this.context) {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            this.context = new AudioContextClass();
        }

        const ctx = this.context!;

        // 1. Create Nodes if they don't exist (CRITICAL: Only create once)
        if (!this.initialized) {
            console.log("🎵 ZenAudioEngine: Creating Node Chain");
            this.gainA = ctx.createGain();
            this.gainB = ctx.createGain();
            this.inputMixer = ctx.createGain();

            this.equalizer = [60, 1000, 12000].map(freq => {
                const filter = ctx.createBiquadFilter();
                filter.type = freq === 60 ? 'lowshelf' : freq === 12000 ? 'highshelf' : 'peaking';
                filter.frequency.value = freq;
                return filter;
            });

            this.reverb = ctx.createConvolver();
            this.reverbMix = ctx.createGain();
            this.dryMix = ctx.createGain();
            this.panner = ctx.createPanner();
            this.panner.panningModel = 'equalpower';
            this.panner.distanceModel = 'linear';
            this.panner.rolloffFactor = 0; // Disable distance attenuation (Fixes 8D volume drop)

            this.compressor = ctx.createDynamicsCompressor();
            this.compressor.threshold.setTargetAtTime(-1.5, ctx.currentTime, 0.1); // Slightly safer threshold
            this.compressor.knee.setTargetAtTime(5, ctx.currentTime, 0.1); // Harder knee for limiting
            this.compressor.ratio.setTargetAtTime(20, ctx.currentTime, 0.1);
            this.compressor.attack.setTargetAtTime(0.001, ctx.currentTime, 0.1); // Fast attack
            this.compressor.release.setTargetAtTime(0.1, ctx.currentTime, 0.1);

            this.masterGain = ctx.createGain();
            this.masterGain.gain.value = 0.95; // Master headroom to prevent DAC clipping
            this.initialized = true;
        }

        // 2. Disconnect everything to prevent signal summation (The "Noise" cause)
        this.disconnectAll();

        // 3. Create/Reconnect Sources
        try {
            if (!this.sourceA) this.sourceA = ctx.createMediaElementSource(this.audioA);
            if (!this.sourceB) this.sourceB = ctx.createMediaElementSource(this.audioB);
        } catch (e) {
            // Sources already exist for these elements
        }

        console.log("🎵 ZenAudioEngine: Building Signal Path (v2.2-Shielded)");

        // 4. Rebuild the Clean Chain (Shielded)
        try {
            if (this.sourceA && this.gainA) this.sourceA.connect(this.gainA);
            if (this.sourceB && this.gainB) this.sourceB.connect(this.gainB);

            if (this.gainA && this.inputMixer) this.gainA.connect(this.inputMixer);
            if (this.gainB && this.inputMixer) this.gainB.connect(this.inputMixer);
        } catch (e) { }

        if (!this.inputMixer || this.equalizer.length === 0) return;

        let lastNode: AudioNode = this.inputMixer;
        this.equalizer.forEach(filter => {
            lastNode.connect(filter);
            lastNode = filter;
        });

        // Parallel Reverb Path
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

        this.updateActiveGains();
    }

    private disconnectAll() {
        try {
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
        } catch (e) { }
    }

    private _is8DEnabled = false;
    private _8dDirection: 'clockwise' | 'counter-clockwise' = 'clockwise';
    private _currentReverb = 'none';
    private _8dAnimationFrame: number | null = null;
    private angle = 0;

    private updateActiveGains() {
        if (!this.gainA || !this.gainB) return;
        this.gainA.gain.value = this.activeElement === 'A' ? 1 : 0;
        this.gainB.gain.value = this.activeElement === 'B' ? 1 : 0;
    }

    resetAll() {
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

    setEq(index: number, gain: number) {
        if (this.equalizer[index] && this.context) {
            this.equalizer[index].gain.setTargetAtTime(gain, this.context.currentTime, 0.1);
        }
    }

    setVolume(val: number) {
        if (this.masterGain && this.context) {
            const safeVal = Math.max(0, Math.min(val, 1));
            this.masterGain.gain.setTargetAtTime(safeVal, this.context.currentTime, 0.1);
        }
    }

    resume() {
        if (this.context?.state === 'suspended') {
            this.context.resume().catch(console.error);
        }
    }

    toggle8D(enabled: boolean, direction: 'clockwise' | 'counter-clockwise' = 'clockwise') {
        const wasEnabled = this._is8DEnabled;
        this._is8DEnabled = enabled;
        this._8dDirection = direction;

        // If we are just changing direction while already enabled, 
        // don't restart the animation loop as it causes UI layout/main-thread jitter
        if (enabled && wasEnabled) return;

        if (this._8dAnimationFrame) {
            cancelAnimationFrame(this._8dAnimationFrame);
            this._8dAnimationFrame = null;
        }

        if (enabled && this.panner && this.context) {
            console.log(`🎵 ZenAudioEngine: 8D Active (${direction})`);
            this.panner.panningModel = 'HRTF';

            const animate = () => {
                if (!this._is8DEnabled || !this.panner || !this.context) return;

                // Adjust angle based on direction
                const speed = 0.02;
                this.angle += (this._8dDirection === 'clockwise' ? speed : -speed);

                const now = this.context.currentTime;
                // Higher precision movement
                this.panner.positionX.setTargetAtTime(Math.sin(this.angle) * 3.5, now, 0.05);
                this.panner.positionZ.setTargetAtTime(Math.cos(this.angle) * 3.5, now, 0.05);

                this._8dAnimationFrame = requestAnimationFrame(animate);
            };
            this._8dAnimationFrame = requestAnimationFrame(animate);
        } else if (this.panner && this.context) {
            console.log("🎵 ZenAudioEngine: 8D Disabled & Reset");
            this.panner.panningModel = 'equalpower';
            const now = this.context.currentTime;
            this.panner.positionX.setTargetAtTime(0, now, 0.1);
            this.panner.positionY.setTargetAtTime(0, now, 0.1);
            this.panner.positionZ.setTargetAtTime(0, now, 0.1);
        }
    }

    async setReverb(type: string) {
        if (!this.context || !this.reverb || type === this._currentReverb) return;
        this._currentReverb = type;

        if (type === 'none') {
            this.reverb.buffer = null;
            return;
        }

        const duration = type === 'cathedral' ? 3.5 : 1.5;
        const sampleRate = this.context.sampleRate;
        const length = sampleRate * duration;
        const impulse = this.context.createBuffer(2, length, sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                // High-quality white noise decay with cleaner release
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
            }
        }
        this.reverb.buffer = impulse;
    }

    setReverbMix(wetAmount: number) {
        if (this.dryMix && this.reverbMix && this.context) {
            const now = this.context.currentTime;
            // Crossfade dry/wet to maintain constant power/gain
            this.reverbMix.gain.setTargetAtTime(wetAmount, now, 0.1);
            this.dryMix.gain.setTargetAtTime(1 - wetAmount, now, 0.1);
        }
    }

    setPlaybackSpeed(speed: number, preservePitch: boolean = true) {
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
