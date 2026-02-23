"use client";

class ZenAudioEngine {
    private static instance: ZenAudioEngine;
    private context: AudioContext | null = null;
    private sourceA: MediaElementAudioSourceNode | null = null;
    private sourceB: MediaElementAudioSourceNode | null = null;
    private gainA: GainNode | null = null;
    private gainB: GainNode | null = null;

    // Nodes
    private masterGain: GainNode | null = null;
    private dryGain: GainNode | null = null;
    private wetGain: GainNode | null = null;
    private equalizer: BiquadFilterNode[] = [];
    private reverb: ConvolverNode | null = null;
    private panner: PannerNode | null = null;

    // Elements
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
        if (this.initialized) return;

        this.initialized = true;
        this.audioA = audioA;
        this.audioB = audioB;

        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        this.context = new AudioContext();

        // Disconnect if previously setup
        if (this.sourceA) this.sourceA.disconnect();
        if (this.sourceB) this.sourceB.disconnect();

        this.sourceA = this.context.createMediaElementSource(audioA);
        this.sourceB = this.context.createMediaElementSource(audioB);
        this.gainA = this.context.createGain();
        this.gainB = this.context.createGain();
        this.gainA.gain.value = 1;
        this.gainB.gain.value = 0;

        // Equalizer
        const frequencies = [60, 1000, 12000];
        this.equalizer = frequencies.map((freq) => {
            const filter = this.context!.createBiquadFilter();
            filter.type = freq === 60 ? 'lowshelf' : freq === 12000 ? 'highshelf' : 'peaking';
            filter.frequency.value = freq;
            filter.gain.value = 0;
            return filter;
        });

        this.reverb = this.context.createConvolver();
        this.panner = this.context.createPanner();
        this.panner.panningModel = 'HRTF';
        this.panner.distanceModel = 'inverse';

        this.masterGain = this.context.createGain();
        this.dryGain = this.context.createGain();
        this.wetGain = this.context.createGain();
        this.wetGain.gain.value = 0;

        this.sourceA.connect(this.gainA);
        this.sourceB.connect(this.gainB);

        const inputMixer = this.context.createGain();
        this.gainA.connect(inputMixer);
        this.gainB.connect(inputMixer);

        let eqChain: AudioNode = inputMixer;
        this.equalizer.forEach(filter => {
            eqChain.connect(filter);
            eqChain = filter;
        });

        eqChain.connect(this.dryGain);
        eqChain.connect(this.reverb);
        this.reverb.connect(this.wetGain);

        this.dryGain.connect(this.panner);
        this.wetGain.connect(this.panner);
        this.panner.connect(this.masterGain);
        this.masterGain.connect(this.context.destination);
    }

    setActiveElement(type: 'A' | 'B') {
        this.activeElement = type;
    }

    async crossfade(toA: boolean, duration: number = 5) {
        if (!this.context || !this.gainA || !this.gainB) return;
        const now = this.context.currentTime;
        if (toA) {
            this.gainA.gain.setTargetAtTime(1, now, duration / 4);
            this.gainB.gain.setTargetAtTime(0, now, duration / 4);
            this.activeElement = 'A';
        } else {
            this.gainA.gain.setTargetAtTime(0, now, duration / 4);
            this.gainB.gain.setTargetAtTime(1, now, duration / 4);
            this.activeElement = 'B';
        }
    }

    setEq(index: number, gain: number) {
        if (this.equalizer[index]) {
            this.equalizer[index].gain.setTargetAtTime(gain, this.context!.currentTime, 0.1);
        }
    }

    setPanning(x: number, y: number, z: number) {
        if (this.panner) {
            this.panner.positionX.setTargetAtTime(x, this.context!.currentTime, 0.1);
            this.panner.positionY.setTargetAtTime(y, this.context!.currentTime, 0.1);
            this.panner.positionZ.setTargetAtTime(z, this.context!.currentTime, 0.1);
        }
    }

    setVolume(val: number) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(val, this.context!.currentTime, 0.1);
        }
    }

    resume() {
        if (this.context?.state === 'suspended') {
            this.context.resume();
        }
    }

    private pannerInterval: any = null;
    private angle = 0;

    toggle8D(enabled: boolean) {
        if (this.pannerInterval) {
            clearInterval(this.pannerInterval);
            this.pannerInterval = null;
        }

        if (enabled) {
            this.pannerInterval = setInterval(() => {
                this.angle += 0.05;
                const x = Math.sin(this.angle) * 1.5;
                const z = Math.cos(this.angle) * 1.5;
                this.setPanning(x, 0, z);
            }, 50);
        } else {
            this.setPanning(0, 0, 0);
        }
    }

    async setReverb(type: string) {
        if (!this.context || !this.reverb) return;
        if (type === 'none') {
            this.reverb.buffer = null;
            return;
        }
        const duration = type === 'cathedral' ? 4.5 : type === 'warehouse' ? 1.5 : 0.8;
        const decay = type === 'cathedral' ? 6 : type === 'warehouse' ? 3 : 2;
        const sampleRate = this.context.sampleRate;
        const length = sampleRate * duration;
        const impulse = this.context.createBuffer(2, length, sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }
        this.reverb.buffer = impulse;
    }

    setReverbMix(wetAmount: number) {
        if (this.dryGain && this.wetGain && this.context) {
            const dryAmount = 1 - wetAmount;
            this.dryGain.gain.setTargetAtTime(dryAmount, this.context.currentTime, 0.1);
            this.wetGain.gain.setTargetAtTime(wetAmount, this.context.currentTime, 0.1);
        }
    }

    setPlaybackSpeed(speed: number, preservePitch: boolean = true) {
        const el = this.activeElement === 'A' ? this.audioA : this.audioB;
        if (el) {
            el.playbackRate = speed;
            // @ts-ignore
            if ('preservesPitch' in el) {
                el.preservesPitch = preservePitch;
            } else if ('webkitPreservesPitch' in el) {
                (el as any).webkitPreservesPitch = preservePitch;
            }
        }
    }
}

export const audioEngine = ZenAudioEngine.getInstance();
