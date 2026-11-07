# 07. DSP Spec

## Chain order

```
ExoPlayer decode → [sink: Sonic speed/pitch]
  → MidSideVocalProcessor      (karaoke)
  → ParametricEqualizerProcessor (preamp + 10 bands)
  → EchoDelayProcessor
  → ConvolutionReverbProcessor
  → Spatial8DProcessor
  → DynamicsCompressorProcessor (night mode + limiter)
  → AudioTrack
```

All processors: float PCM (`ENCODING_PCM_FLOAT`), stereo, any sample rate. Each is bypassed (returns input buffer untouched) when disabled, so the master bypass costs nothing.

## Real-time rules

- No allocation, locks, logging, or JNI calls inside `queueInput`. Preallocate all buffers in `onConfigure`.
- Parameters: a UI thread writes to `@Volatile` fields; the audio thread reads each block and smooths toward the target (one-pole, ~20 ms) to avoid zipper noise and clicks.
- Denormals: add `1e-20f` offset or flush values < 1e-15 in feedback paths.
- Clip guard: hard clamp to ±1.0 at the end of the chain.
- On format change or seek, call `onFlush()` to clear delay lines and filter states.

## Base skeleton

```kotlin
abstract class FxProcessor : BaseAudioProcessor() {
  @Volatile var enabled = false
  override fun onConfigure(f: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
    if (f.encoding != C.ENCODING_PCM_FLOAT || f.channelCount != 2)
      throw AudioProcessor.UnhandledAudioFormatException(f)
    prepare(f.sampleRate); return f
  }
  override fun queueInput(input: ByteBuffer) {
    val out = replaceOutputBuffer(input.remaining())
    if (!enabled) { out.put(input); out.flip(); return }
    val inF = input.asFloatBuffer(); val outF = out.asFloatBuffer()
    process(inF, outF, input.remaining() / 8)
    out.position(0).limit(input.remaining()); input.position(input.limit())
  }
  abstract fun prepare(sampleRate: Int)
  abstract fun process(inp: FloatBuffer, out: FloatBuffer, frames: Int)
}
```

If a source is mono or other channel layouts, upmix before the chain (a tiny `ChannelMixingAudioProcessor` first in the list).

## 1. Karaoke / Mid-Side (`MidSideVocalProcessor`)

`amount` in [-1, +1]. `M = (L+R)/2`.
- amount ≥ 0 (suppression): `L' = L − a·M`, `R' = R − a·M` (a = 1 gives the side signal only).
- amount < 0 (vocal solo): `s = |amount|`, `L' = (1−s)·L + s·M`, `R' = (1−s)·R + s·M`.
- Optional: high-pass the removed mid below ~120 Hz and add it back to keep bass and kick (bass-preserve toggle).

## 2. 10-Band EQ (`ParametricEqualizerProcessor`)

Bands: 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz, gain ±12 dB, Q ≈ 1.41 (octave spacing). Peaking biquad (RBJ):

```
A  = 10^(gainDb/40);  w0 = 2π·f/fs;  α = sin(w0)/(2Q)
b0 = 1+α·A   b1 = −2cos(w0)   b2 = 1−α·A
a0 = 1+α/A   a1 = −2cos(w0)   a2 = 1−α/A       (divide all by a0)
```

Direct Form II Transposed, one state pair per band per channel. Optional: make band 1 a low shelf and band 10 a high shelf. Preamp gain = −(max positive band gain) dB to prevent clipping. Recompute coefficients only when a gain changes (on the UI-thread side into a double-buffered array, swap atomically).

## 3. Echo (`EchoDelayProcessor`)

Params: `delayMs` 50-1000, `feedback` 0-0.9, `mix` 0-1. Circular buffer sized for 1 s at 48 kHz stereo. `y = x + mix·d`; `d[n] = x[n−D] + feedback·d[n−D]`. Low-pass the feedback path (~6 kHz one-pole) for natural decay. Smooth `delayMs` changes with interpolated read to avoid pitch glitches.

## 4. Convolution Reverb (`ConvolutionReverbProcessor`)

- IRs in `assets/ir/{studio,room,cathedral,warehouse}.wav` (stereo, 48 kHz, trimmed to ≤ 2.5 s). Resample to device rate at load, on a background thread.
- Algorithm: uniform partitioned FFT convolution (block 512 or 1024 frames) using JTransforms or a small native FFT. Frequency-domain delay line, one complex multiply-accumulate per partition per block.
- Latency: one block (≈ 10-20 ms) on the wet path; compensate by not delaying dry or accept (reverb is tolerant).
- `wet` 0-1 equal-power crossfade: `out = cos(wet·π/2)·dry + sin(wet·π/2)·wet`.
- Preset switch: load new IR off-thread, then swap pointer at a block boundary with a 50 ms crossfade.
- If CPU is too high on weak devices, use a shorter IR (1.5 s) or a Schroeder/FDN algorithmic fallback.

## 5. 8D Spatial (`Spatial8DProcessor`)

Params: `enabled`, `clockwise`, `speedHz` (0.02-0.5, default 0.1).
1. `M = (L+R)/2` (optionally keep 30% of original stereo width).
2. Phase `θ += ±2π·speedHz/fs` per sample.
3. `pan = sin θ`; equal-power gains `gL = cos((pan+1)·π/4)`, `gR = sin((pan+1)·π/4)`.
4. Interaural delay: up to 0.6 ms on the far ear (`delay = 0.6 ms · |pan|`), fractional delay line.
5. Behind-the-head cue: `rear = max(0, −cos θ)`; one-pole low-pass cutoff lerps 20 kHz → 5 kHz and gain 1 → 0.85 as `rear → 1`.
6. Smooth enable/disable by crossfading the processed signal against the original over 100 ms.

Recommended to be used with headphones; show a hint in the UI.

## 6. Dynamics / Night Mode (`DynamicsCompressorProcessor`)

Feed-forward compressor with look-free peak detection:
- Params: `thresholdDb` (-40…0, default -18), `ratio` (1…20, default 4), `attackMs` 10, `releaseMs` 120, auto makeup gain `= −threshold·(1 − 1/ratio)·0.5`.
- Envelope on max(|L|,|R|); gain computer in dB: `over = envDb − threshold; gr = over·(1 − 1/ratio)` when over > 0.
- Final soft limiter: `tanh`-style at ±0.98 or a 2 ms-lookahead brickwall.
- Night Mode preset = threshold −30, ratio 6, makeup on.

## Presets

| Preset | 32 | 64 | 125 | 250 | 500 | 1k | 2k | 4k | 8k | 16k | Other |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Flat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | |
| Bass Boost | +6 | +5 | +4 | +2 | 0 | 0 | 0 | 0 | 0 | 0 | |
| Treble Boost | 0 | 0 | 0 | 0 | 0 | +1 | +3 | +4 | +5 | +6 | |
| Vocal Boost | −2 | −2 | −1 | 0 | +2 | +4 | +4 | +2 | 0 | −1 | |
| EDM | +6 | +5 | +2 | 0 | −2 | 0 | +1 | +3 | +5 | +5 | |
| Acoustic | +3 | +3 | +2 | +1 | +1 | +1 | +2 | +3 | +3 | +2 | |
| Night Mode | −2 | −1 | 0 | 0 | 0 | +1 | +1 | 0 | −1 | −2 | Compressor on |

## Testing the DSP

- Offline harness: JVM unit tests feed a sine sweep and impulse through each processor; assert frequency response of EQ bands (±0.5 dB), no NaN/Inf, no output > 1.0.
- Click test: sweep every slider while playing a 1 kHz sine; record output; check for discontinuities > 0.05 between samples.
- Karaoke check: center-panned test signal reduces ≥ 20 dB at amount = 1.
- CPU: Perfetto trace; audio callback should use < 10% of its period on a mid-range phone with all FX enabled.
- Latency/underrun: monitor `AudioTrack.getUnderrunCount()` during stress (should stay 0).
