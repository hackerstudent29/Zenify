import sys
import json
import os
import re
import traceback
from difflib import SequenceMatcher

def normalize(text):
    return " ".join("".join(c for c in text.lower() if c.isalnum() or c.isspace()).split())

def align_lyrics(audio_path, lyrics_path, lang_code="en-US"):
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    if not os.path.exists(lyrics_path):
        raise FileNotFoundError(f"Lyrics file not found: {lyrics_path}")

    with open(lyrics_path, "r", encoding="utf-8") as f:
        raw_lines = [line.strip() for line in f if line.strip()]

    lyrics_lines = [re.sub(r"^\[\d+:\d+[\.\d]*\]\s*", "", ln) for ln in raw_lines]
    lyrics_lines = [ln for ln in lyrics_lines if ln and not re.match(r"^\[.*\]$", ln.strip())]

    if not lyrics_lines:
        return []

    print(f"[Aligner] {len(lyrics_lines)} lyric lines loaded.", file=sys.stderr)

    lang_map = {"en-US": "en", "en-GB": "en", "ta-IN": "ta", "hi-IN": "hi"}
    fw_lang = lang_map.get(lang_code, lang_code.split("-")[0])

    from faster_whisper import WhisperModel
    model_cache = os.path.join(os.path.expanduser("~"), ".cache", "faster_whisper")
    os.makedirs(model_cache, exist_ok=True)
    model = WhisperModel("base", device="cpu", compute_type="int8", cpu_threads=4, download_root=model_cache)

    print("[Aligner] Transcribing with faster-whisper...", file=sys.stderr)
    segments, info = model.transcribe(
        audio_path, language=fw_lang, word_timestamps=True, vad_filter=False, beam_size=5, condition_on_previous_text=True, temperature=0
    )

    transcribed_words = []
    for seg in segments:
        if seg.words:
            for w in seg.words:
                norm = normalize(w.word)
                if norm:
                    transcribed_words.append({"word": norm, "start": w.start, "end": w.end})

    if not transcribed_words:
        print("[Aligner] WARNING: 0 words transcribed.", file=sys.stderr)
        return [{"time": round((info.duration / len(lyrics_lines)) * i, 2), "text": ln} for i, ln in enumerate(lyrics_lines)]

    # Flatten lyrics into words, keeping track of which line each word belongs to
    lyric_words = []
    line_indices = []
    for i, line in enumerate(lyrics_lines):
        words = normalize(line).split()
        for w in words:
            lyric_words.append(w)
            line_indices.append(i)

    # Use SequenceMatcher to find the longest contiguous matching subsequences
    print("[Aligner] Matching transcript to lyrics using SequenceMatcher DP...", file=sys.stderr)
    seq_matcher = SequenceMatcher(None, [w["word"] for w in transcribed_words], lyric_words)
    
    line_timestamps = {}
    for tag, i1, i2, j1, j2 in seq_matcher.get_opcodes():
        if tag == 'equal':
            # transcribed_words[i1:i2] perfectly matches lyric_words[j1:j2]
            for i, j in zip(range(i1, i2), range(j1, j2)):
                line_idx = line_indices[j]
                if line_idx not in line_timestamps:
                    line_timestamps[line_idx] = transcribed_words[i]["start"]
                else:
                    # Keep the earliest start time for the line
                    line_timestamps[line_idx] = min(line_timestamps[line_idx], transcribed_words[i]["start"])

    # Interpolate missing lines
    aligned = [{"time": None, "text": ln} for ln in lyrics_lines]
    for i, ts in line_timestamps.items():
        aligned[i]["time"] = round(ts, 2)

    audio_duration = info.duration if info else transcribed_words[-1]["end"]
    avg_line_dur = 3.0

    first_idx = next((i for i in range(len(aligned)) if aligned[i]["time"] is not None), None)
    last_idx = next((i for i in range(len(aligned) - 1, -1, -1) if aligned[i]["time"] is not None), None)

    if first_idx is not None and first_idx > 0:
        anchor_t = aligned[first_idx]["time"]
        for i in range(first_idx - 1, -1, -1):
            aligned[i]["time"] = round(max(0.0, anchor_t - (first_idx - i) * avg_line_dur), 2)

    if last_idx is not None and last_idx < len(aligned) - 1:
        anchor_t = aligned[last_idx]["time"]
        for i in range(last_idx + 1, len(aligned)):
            aligned[i]["time"] = round(min(audio_duration, anchor_t + (i - last_idx) * avg_line_dur), 2)

    i = 0
    while i < len(aligned):
        if aligned[i]["time"] is None:
            prev_t = aligned[i - 1]["time"] if i > 0 else 0.0
            next_idx = next((j for j in range(i + 1, len(aligned)) if aligned[j]["time"] is not None), None)
            next_t = aligned[next_idx]["time"] if next_idx is not None else audio_duration
            j = i
            while j < len(aligned) and aligned[j]["time"] is None:
                j += 1
            count = j - i
            interval = (next_t - prev_t) / (count + 1)
            for k in range(count):
                aligned[i + k]["time"] = round(prev_t + interval * (k + 1), 2)
            i = j
        else:
            i += 1

    last_t = -1.0
    for item in aligned:
        if item["time"] <= last_t:
            item["time"] = round(last_t + 0.5, 2)
        last_t = item["time"]

    print(f"[Aligner] Successfully aligned {len(aligned)} lines.", file=sys.stderr)
    return aligned

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python aligner.py <audio_path> <lyrics_path> [lang_code]"}))
        sys.exit(1)
    try:
        results = align_lyrics(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "en-US")
        print(json.dumps(results))
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
