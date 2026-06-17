"use client";

import React, { useState, useEffect } from 'react';
import { useUIStore } from "@/store/ui";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Play, Pause, Activity, Waves, Settings2, Sparkles, AlertTriangle, Disc, X } from "lucide-react";
import * as Slider from "@radix-ui/react-slider";
import { cn, getMediaUrl, getApiBaseUrl } from "@/lib/utils";
import { usePlayerStore } from '@/store/player';
import { audioEngine } from '@/lib/audio-engine';

const FORMATS = [
 { id: 'mp3', name: 'MP3', desc: '320kbps • Standard', badge: 'Fastest' },
 { id: 'm4a', name: 'M4A', desc: '256kbps • AAC', badge: 'Apple' },
 { id: 'wav', name: 'WAV', desc: 'Lossless Uncompressed', badge: 'Pro' },
 { id: 'flac', name: 'FLAC', desc: 'Lossless Compressed', badge: 'Audiophile' }
];

const FX_PRESETS = [
 { id: 'bassboost', name: 'Bass Boosted', desc: 'Heavy low-end punch', icon: Waves, eq: [8, 1, 3], reverb: 'none', is8D: false },
 { id: 'nightcore', name: 'Nightcore', desc: 'Sped up & pitched up', icon: Sparkles, eq: [2, 4, 2], reverb: 'none', is8D: false },
 { id: 'daycore', name: 'Daycore', desc: 'Slowed & pitched down', icon: Settings2, eq: [4, -2, -2], reverb: 'warehouse', is8D: false },
 { id: '8d', name: '8D Spatial', desc: 'Immersive auto-panning', icon: Activity, eq: [0, 0, 0], reverb: 'warehouse', is8D: true },
 { id: 'reverb', name: 'Concert Hall', desc: 'Massive acoustic space', icon: Waves, eq: [-2, 4, 4], reverb: 'cathedral', is8D: false }
];

function encodeWAV(buf: AudioBuffer): Blob {
  const numCh = Math.min(buf.numberOfChannels, 2);
  const sr = buf.sampleRate;
  const n = buf.length;
  const blockAlign = numCh * 2;
  const dataBytes = n * blockAlign;
  const ab = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(ab);
  const ws = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true);
  ws(8, 'WAVE');
  ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * blockAlign, true); v.setUint16(32, blockAlign, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, dataBytes, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buf.getChannelData(ch)[i] ?? 0));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

export function DownloadModal() {
 const { isDownloadModalOpen, downloadTrack, closeDownloadModal } = useUIStore();
 const { currentTrack, isPlaying, setTrack, togglePlay, setFx } = usePlayerStore();
 
 const [selectedFormat, setSelectedFormat] = useState('mp3');
 const [activeFx, setActiveFx] = useState<string[]>([]);
 const [direction8D, setDirection8D] = useState<'clockwise' | 'counter-clockwise'>('clockwise');
 const [freq8D, setFreq8D] = useState(0.125);
 const [customSpeed, setCustomSpeed] = useState(1);
 const [isProcessing, setIsProcessing] = useState(false);
 const [statusText, setStatusText] = useState("Processing Engine...");

 // Prevent body scroll when open
 useEffect(() => {
 if (isDownloadModalOpen) {
 document.body.style.overflow = 'hidden';
 setSelectedFormat('mp3');
 setActiveFx([]);
 setDirection8D('clockwise');
 setFreq8D(0.125);
 setCustomSpeed(1);
 setIsProcessing(false);
 } else {
 document.body.style.overflow = 'unset';
 }
 return () => {
 document.body.style.overflow = 'unset';
 };
 }, [isDownloadModalOpen]);

 if (!downloadTrack) return null;

 const isCurrentTrack = currentTrack?.id === downloadTrack.id;

 const toggleFx = (id: string) => {
 if (id === 'flat') {
 setActiveFx([]);
 setCustomSpeed(1);
 return;
 }

 if (activeFx.includes(id)) {
 setActiveFx(activeFx.filter(f => f !== id));
 } else {
 // Daycore and Nightcore are mutually exclusive
 if (id === 'nightcore' && activeFx.includes('daycore')) {
 setActiveFx([...activeFx.filter(f => f !== 'daycore'), id]);
 } else if (id === 'daycore' && activeFx.includes('nightcore')) {
 setActiveFx([...activeFx.filter(f => f !== 'nightcore'), id]);
 } else {
 setActiveFx([...activeFx, id]);
 }
 }
 };

 const handlePreview = () => {
 if (isCurrentTrack) {
 togglePlay();
 } else {
 setTrack(downloadTrack);
 }

 audioEngine.resume();
 audioEngine.resetAll();

 let finalEq = [0, 0, 0];
 let finalReverb = 'none';
 let final8D = false;
 let finalSpeed = customSpeed;
 let finalPitch = 1;

 // Apply selected presets sequentially
 activeFx.forEach(fxId => {
 const preset = FX_PRESETS.find(p => p.id === fxId);
 if (preset) {
 if (preset.eq.some(val => val !== 0)) finalEq = preset.eq;
 if (preset.reverb !== 'none') finalReverb = preset.reverb;
 if (preset.is8D) final8D = true;
 
 if (fxId === 'nightcore') {
 finalSpeed = 1.25;
 finalPitch = 1.25;
 }
 if (fxId === 'daycore') {
 finalSpeed = 0.8;
 finalPitch = 0.8;
 }
 }
 });

 // Apply to Web Audio API
 finalEq.forEach((val, i) => audioEngine.setEq(i, val));
 
 // If they manually changed the speed slider, it overrides the preset speed
 if (customSpeed !== 1) {
 audioEngine.setPlaybackSpeed(customSpeed, true); // true = preserve pitch
 } else {
 audioEngine.setPlaybackSpeed(finalSpeed, finalPitch === 1);
 }

 audioEngine.setReverb(finalReverb as any);
 audioEngine.setReverbMix(finalReverb === 'none' ? 0 : 0.6);
 audioEngine.toggle8D(final8D, direction8D, freq8D);

 setFx({
 eq: finalEq,
 speed: customSpeed !== 1 ? customSpeed : finalSpeed,
 pitch: finalPitch,
 reverb: finalReverb as any,
 is8D: final8D,
 direction8D: direction8D
 });
 };

  const handleDownload = async () => {
    try {
      setIsProcessing(true);
      
      const baseUrl = getApiBaseUrl();
      const cleanUrl = baseUrl.replace(/\/+$/, '');
      
      // Get the correct proxied URL to bypass CORS
      const proxiedUrl = getMediaUrl(downloadTrack.audioUrl, 'audio');
      if (!proxiedUrl) {
        throw new Error("Invalid track audio URL");
      }
      
      // 1. Fetch the raw audio file
      setStatusText("Fetching original audio...");
      const response = await fetch(proxiedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio file: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      
      // 2. Decode the audio data
      setStatusText("Analyzing audio frequencies...");
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const tempCtx = new AudioContextClass();
      const decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      await tempCtx.close();
      
      // 3. Set up OfflineAudioContext
      setStatusText("Running StudioFX engine...");
      
      // Calculate speed and pitch parameters
      let finalEq = [0, 0, 0];
      let finalReverb = 'none';
      let final8D = false;
      let finalSpeed = customSpeed;
      let finalPitch = 1;

      // Apply selected presets sequentially
      activeFx.forEach(fxId => {
        const preset = FX_PRESETS.find(p => p.id === fxId);
        if (preset) {
          if (preset.eq.some(val => val !== 0)) finalEq = preset.eq;
          if (preset.reverb !== 'none') finalReverb = preset.reverb;
          if (preset.is8D) final8D = true;
          
          if (fxId === 'nightcore') {
            finalSpeed = 1.25;
            finalPitch = 1.25;
          }
          if (fxId === 'daycore') {
            finalSpeed = 0.8;
            finalPitch = 0.8;
          }
        }
      });
      
      // In offline rendering, if customSpeed was modified, it takes precedence
      const renderSpeed = customSpeed !== 1.0 ? customSpeed : finalSpeed;
      
      // Duration adjusted for speed
      const duration = decodedBuffer.duration / renderSpeed;
      const sampleRate = decodedBuffer.sampleRate;
      const length = Math.floor(duration * sampleRate);
      
      const offlineCtx = new OfflineAudioContext(
        decodedBuffer.numberOfChannels,
        length,
        sampleRate
      );
      
      // Create source
      const source = offlineCtx.createBufferSource();
      source.buffer = decodedBuffer;
      
      // Set playbackRate
      source.playbackRate.setValueAtTime(renderSpeed, 0);
      
      let lastNode: AudioNode = source;
      
      // Apply EQ
      const equalizer = [60, 1000, 12000].map((freq, i) => {
        const filter = offlineCtx.createBiquadFilter();
        filter.type = freq === 60 ? 'lowshelf' : freq === 12000 ? 'highshelf' : 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1;
        filter.gain.value = finalEq[i];
        return filter;
      });
      equalizer.forEach(filter => {
        lastNode.connect(filter);
        lastNode = filter;
      });
      
      // Reverb Nodes
      const dryMix = offlineCtx.createGain();
      dryMix.gain.value = 1.0;
      
      const reverbMix = offlineCtx.createGain();
      reverbMix.gain.value = finalReverb === 'none' ? 0 : 0.6;
      
      const reverb = offlineCtx.createConvolver();
      
      if (finalReverb !== 'none') {
        const reverbDur = finalReverb === 'cathedral' ? 3.5 : 1.5;
        const impulseLength = sampleRate * reverbDur;
        const impulse = offlineCtx.createBuffer(2, impulseLength, sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const data = impulse.getChannelData(channel);
          for (let i = 0; i < impulseLength; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 2.5);
          }
        }
        reverb.buffer = impulse;
        lastNode.connect(reverb);
        reverb.connect(reverbMix);
      }
      
      // Panner Node (8D Spatial Audio)
      const panner = offlineCtx.createPanner();
      panner.panningModel = final8D ? 'HRTF' : 'equalpower';
      panner.distanceModel = 'linear';
      panner.positionX.value = 0;
      panner.positionY.value = 0;
      panner.positionZ.value = 0;
      
      lastNode.connect(dryMix);
      dryMix.connect(panner);
      if (finalReverb !== 'none') {
        reverbMix.connect(panner);
      }
      
      // 8D spatialization LFO modulation
      if (final8D) {
        const lfoX = offlineCtx.createOscillator();
        const lfoZ = offlineCtx.createOscillator();
        lfoX.frequency.value = freq8D;
        lfoZ.frequency.value = freq8D;

        const lfoGainX = offlineCtx.createGain();
        const lfoGainZ = offlineCtx.createGain();
        lfoGainX.gain.value = 3.5;
        lfoGainZ.gain.value = direction8D === 'clockwise' ? 3.5 : -3.5;

        const sineWave = offlineCtx.createPeriodicWave(new Float32Array([0, 0]), new Float32Array([0, 1]));
        const cosWave = offlineCtx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0]));
        lfoX.setPeriodicWave(sineWave);
        lfoZ.setPeriodicWave(cosWave);

        lfoX.connect(lfoGainX);
        lfoGainX.connect(panner.positionX);
        lfoZ.connect(lfoGainZ);
        lfoGainZ.connect(panner.positionZ);

        lfoX.start(0);
        lfoZ.start(0);
      }
      
      // Dynamics Compressor
      const compressor = offlineCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-1, 0);
      compressor.knee.setValueAtTime(10, 0);
      compressor.ratio.setValueAtTime(20, 0);
      compressor.attack.setValueAtTime(0.001, 0);
      compressor.release.setValueAtTime(0.1, 0);
      
      panner.connect(compressor);
      compressor.connect(offlineCtx.destination);
      
      // Start rendering
      source.start(0);
      const renderedBuffer = await offlineCtx.startRendering();
      
      // 4. Encode as WAV
      setStatusText("Encoding high-quality audio...");
      const wavBlob = encodeWAV(renderedBuffer);
      
      // Format filename
      const artistName = downloadTrack.artist?.name || 'Unknown Artist';
      const safeTitle = downloadTrack.title.replace(/[^a-zA-Z0-9 -]/g, '');
      const safeArtist = artistName.replace(/[^a-zA-Z0-9 -]/g, '');
      const fxParam = activeFx.length > 0 ? activeFx.join(',') : 'flat';
      const fxSuffix = (fxParam !== 'flat' || renderSpeed !== 1.0) ? ` (${fxParam.toUpperCase()}${renderSpeed !== 1.0 ? ` ${renderSpeed.toFixed(2)}x` : ''})` : '';
      const filename = `${safeTitle} - ${safeArtist}${fxSuffix}`;
      
      // Increment download stats on the server
      fetch(`${cleanUrl}/tracks/${downloadTrack.id}/download`, { method: 'POST' }).catch(() => {});
      
      if (selectedFormat === 'wav') {
        setStatusText("Saving WAV file...");
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // 5. Convert to requested format using the server converter
        setStatusText(`Converting to ${selectedFormat.toUpperCase()}...`);
        const formData = new FormData();
        formData.append('audio', wavBlob, `${filename}.wav`);
        
        const convertResponse = await fetch(`${cleanUrl}/tracks/convert-format?format=${selectedFormat}&filename=${encodeURIComponent(filename)}`, {
          method: 'POST',
          body: formData,
        });
        
        if (!convertResponse.ok) {
          throw new Error(`Format conversion failed on the server: ${convertResponse.statusText}`);
        }
        
        const convertedBlob = await convertResponse.blob();
        
        setStatusText("Saving file...");
        const url = URL.createObjectURL(convertedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.${selectedFormat === 'm4a' ? 'm4a' : selectedFormat === 'flac' ? 'flac' : 'mp3'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      
      setIsProcessing(false);
      closeDownloadModal();
    } catch (err: any) {
      console.error("StudioFX rendering and download failed:", err);
      alert(`Download failed: ${err.message || err}`);
      setIsProcessing(false);
    }
  };

 return (
 <AnimatePresence>
 {isDownloadModalOpen && (
 <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-end md:justify-center p-0 md:p-6 sm:p-2 overflow-y-auto custom-scrollbar">
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={closeDownloadModal}
 className="fixed inset-0 bg-black/80 backdrop-blur-xl"
 />

 <motion.div
 initial={{ opacity: 0, y: 100, scale: 0.95 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: 100, scale: 0.95 }}
 transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
 className="relative w-full max-w-4xl bg-[#0a0a0b] md:rounded-[2rem] rounded-t-[2rem] border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
 onClick={(e) => e.stopPropagation()}
 >
 {/* Header */}
 <div className="flex items-center justify-between p-4 md:px-8 md:pt-8 border-b border-white/5 sticky top-0 bg-[#0a0a0b]/90 backdrop-blur-md z-50">
 <div>
 <h1 className="text-xl md:text-2xl font-black font-brand tracking-tight text-white">Download Studio</h1>
 <p className="text-[11px] md:text-xs text-white/40 font-medium mt-1">Select formats and combine multiple StudioFX effects.</p>
 </div>
 <button onClick={closeDownloadModal} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors">
 <X size={20} />
 </button>
 </div>

 {/* Content */}
 <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
 <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
 
 {/* Left Column: Settings */}
 <div className="space-y-8">
 <section>
 <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 mb-3 flex items-center gap-2">
 <Disc size={12} /> 1. Select Quality
 </h2>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {FORMATS.map(fmt => (
 <button
 key={fmt.id}
 onClick={() => setSelectedFormat(fmt.id)}
 className={cn(
 "p-4 rounded-xl border transition-all text-left relative overflow-hidden group",
 selectedFormat === fmt.id 
 ? "bg-brand/10 border-brand/40 shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.15)]"
 : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
 )}
 >
 {selectedFormat === fmt.id && (
 <div className="absolute inset-0 bg-gradient-to-br from-brand/20 to-transparent opacity-50" />
 )}
 <div className="relative z-10 flex justify-between items-center">
 <div>
 <div className="flex items-center gap-2 mb-0.5">
 <span className={cn("text-sm font-black", selectedFormat === fmt.id ? "text-brand" : "text-white")}>{fmt.name}</span>
 {fmt.badge && (
 <span className={cn(
 "text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border",
 selectedFormat === fmt.id ? "bg-zinc-900/20 border-brand/30 text-brand" : "bg-white/10 border-white/10 text-brand/50"
 )}>
 {fmt.badge}
 </span>
 )}
 </div>
 <p className={cn("text-[9px] md:text-[10px] font-medium", selectedFormat === fmt.id ? "text-brand/70" : "text-white/40")}>{fmt.desc}</p>
 </div>
 </div>
 </button>
 ))}
 </div>
 </section>

 <section>
 <div className="flex items-center justify-between mb-3">
 <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-2">
 <Activity size={12} /> 2. Combine StudioFX
 </h2>
 <button 
 onClick={() => toggleFx('flat')}
 className={cn("text-[9px] font-bold uppercase tracking-widest transition-colors", activeFx.length === 0 && customSpeed === 1 ? "text-brand" : "text-white/40 hover:text-white")}
 >
 Reset All
 </button>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
 {FX_PRESETS.map(fx => {
 const isActive = activeFx.includes(fx.id);
 return (
 <button
 key={fx.id}
 onClick={() => toggleFx(fx.id)}
 className={cn(
 "p-3 rounded-xl border transition-all text-left flex items-start gap-3",
 isActive 
 ? "bg-blue-500/10 border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.15)]"
 : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
 )}
 >
 <div className={cn("p-2 rounded-lg shrink-0 mt-0.5", isActive ? "bg-blue-500/20 text-blue-400" : "bg-white/10 text-white/40")}>
 <fx.icon size={14} />
 </div>
 <div>
 <h3 className={cn("text-sm font-bold", isActive ? "text-blue-400" : "text-white")}>{fx.name}</h3>
 <p className={cn("text-[10px] font-medium mt-0.5 leading-snug", isActive ? "text-blue-400/70" : "text-white/40")}>{fx.desc}</p>
 </div>
 </button>
 );
 })}
 </div>

 {/* 8D Customization */}
 {activeFx.includes('8d') && (
 <div className="bg-white/5 border border-white/5 p-4 rounded-xl space-y-5 mb-6">
 <div>
 <div className="flex items-center justify-between mb-3">
 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80 flex items-center gap-2">
 <Activity size={12} className="text-white/40" /> 8D Direction
 </h3>
 </div>
 <div className="flex bg-black/50 p-1 rounded-lg">
 <button
 onClick={() => setDirection8D('clockwise')}
 className={cn(
 "flex-1 py-1.5 text-[10px] font-bold rounded-md uppercase tracking-widest transition-all",
 direction8D === 'clockwise' ? "bg-white/20 text-white shadow-sm" : "text-white/40 hover:text-white/80"
 )}
 >
 Clockwise
 </button>
 <button
 onClick={() => setDirection8D('counter-clockwise')}
 className={cn(
 "flex-1 py-1.5 text-[10px] font-bold rounded-md uppercase tracking-widest transition-all",
 direction8D === 'counter-clockwise' ? "bg-white/20 text-white shadow-sm" : "text-white/40 hover:text-white/80"
 )}
 >
 Anti-Clockwise
 </button>
 </div>
 </div>

 <div>
 <div className="flex items-center justify-between mb-3">
 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80 flex items-center gap-2">
 <Activity size={12} className="text-white/40" /> 8D Speed
 </h3>
 <span className="text-[10px] font-bold text-brand">{freq8D.toFixed(3)} Hz</span>
 </div>
 <Slider.Root
 className="relative flex items-center select-none h-4 cursor-pointer"
 value={[freq8D]}
 max={0.5}
 min={0.05}
 step={0.025}
 onValueChange={([val]) => {
 setFreq8D(val);
 if (isPlaying && isCurrentTrack) {
 audioEngine.set8DFrequency(val);
 }
 }}
 onDoubleClick={() => setFreq8D(0.125)}
 >
 <Slider.Track className="bg-white/10 relative grow rounded-full h-[4px]">
 <Slider.Range className="absolute bg-brand h-full" />
 </Slider.Track>
 <Slider.Thumb
 className="block w-4 h-4 bg-white rounded-full shadow-2xl focus:outline-none active:scale-125 transition-transform"
 aria-label="8D Speed"
 />
 </Slider.Root>
 </div>
 </div>
 )}

 {/* Speed Slider */}
 <div className="bg-white/5 border border-white/5 p-4 rounded-xl space-y-4">
 <div className="flex items-center justify-between">
 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80 flex items-center gap-2">
 <Settings2 size={12} className="text-white/40" /> Speed Control
 </h3>
 <span className="text-[10px] font-bold text-brand">{customSpeed.toFixed(2)}x</span>
 </div>
 <Slider.Root
 className="relative flex items-center select-none h-4 cursor-pointer"
 value={[customSpeed]}
 max={2}
 min={0.5}
 step={0.05}
 onValueChange={([val]) => {
 setCustomSpeed(val);
 if (isPlaying && isCurrentTrack) {
 audioEngine.setPlaybackSpeed(val, true);
 }
 }}
 onDoubleClick={() => setCustomSpeed(1)}
 >
 <Slider.Track className="bg-white/10 relative grow rounded-full h-[4px]">
 <Slider.Range className="absolute bg-brand h-full" />
 </Slider.Track>
 <Slider.Thumb
 className="block w-4 h-4 bg-white rounded-full shadow-2xl focus:outline-none active:scale-125 transition-transform"
 aria-label="Speed"
 />
 </Slider.Root>
 </div>
 </section>
 </div>

 {/* Right Column: Preview & Action */}
 <div className="flex flex-col gap-5 lg:border-l lg:border-white/5 lg:pl-8">
 <div className="aspect-square w-full max-w-[200px] mx-auto rounded-2xl overflow-hidden shadow-2xl relative bg-zinc-900 group">
 <img 
 src={getMediaUrl(downloadTrack.coverUrl) || `https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=400&q=80`} 
 alt={downloadTrack.title} 
 className={cn("w-full h-full object-cover transition-transform duration-700", (isCurrentTrack && isPlaying) ? "scale-105" : "scale-100")} 
 />
 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
 <button 
 onClick={handlePreview}
 className="w-12 h-12 rounded-full bg-zinc-900 text-brand flex items-center justify-center shadow-2xl active:scale-95 transition-all"
 >
 {isCurrentTrack && isPlaying ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} className="ml-1" />}
 </button>
 </div>
 </div>

 <div className="text-center">
 <h2 className="text-lg font-bold text-white truncate px-4">{downloadTrack.title}</h2>
 <p className="text-xs font-medium text-white/50 truncate px-4 mt-1">{downloadTrack.artist?.name || 'Unknown Artist'}</p>
 </div>

 <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-2 mt-auto">
 <div className="flex items-center justify-between">
 <span className="text-[9px] uppercase font-black tracking-widest text-white/40">Active FX</span>
 <span className="text-xs font-bold text-blue-400">
 {activeFx.length === 0 && customSpeed === 1 ? "Original" : `${activeFx.length} filter${activeFx.length > 1 || activeFx.length === 0 ? 's' : ''}${customSpeed !== 1 ? ' + Speed' : ''}`}
 </span>
 </div>
 <button 
 onClick={handlePreview}
 className={cn(
 "w-full py-2 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all",
 isCurrentTrack && isPlaying ? "bg-white/10 text-white" : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
 )}
 >
 {isCurrentTrack && isPlaying ? 'Stop Preview' : 'Preview Changes'}
 </button>
 </div>

 {(activeFx.length > 0 || customSpeed !== 1) && (
 <div className="flex items-start gap-2 p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
 <AlertTriangle size={14} className="shrink-0 mt-0.5" />
 <p className="text-[9px] font-medium leading-relaxed">
 Combining multiple FX filters requires heavy server rendering. The download may take several seconds to begin.
 </p>
 </div>
 )}

 <button
 onClick={handleDownload}
 disabled={isProcessing}
 className={cn(
 "w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl",
 isProcessing 
 ? "bg-white/10 text-brand/50 cursor-not-allowed" 
 : "bg-zinc-900 text-brand hover:scale-[1.02] active:scale-95 shadow-[0_5px_20px_rgba(var(--accent-brand-rgb),0.3)]"
 )}
 >
 {isProcessing ? (
 <>
 <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
 <Activity size={18} />
 </motion.div>
 {statusText}
 </>
 ) : (
 <>
 <Download size={18} />
 Generate & Download
 </>
 )}
 </button>
 </div>
 </div>
 </div>
 </motion.div>
 </div>
 )}
 </AnimatePresence>
 );
}
