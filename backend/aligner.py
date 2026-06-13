import sys
import json
import os
import time

# Add WinGet Links directory to PATH for local Windows development before importing pydub
winget_links = r"C:\Users\sthir\AppData\Local\Microsoft\WinGet\Links"
if os.path.exists(winget_links) and winget_links not in os.environ["PATH"]:
    os.environ["PATH"] += os.pathsep + winget_links

from pydub import AudioSegment
import speech_recognition as sr

def text_similarity(a, b):
    # Strip punctuation and normalize whitespace
    a = "".join(c for c in a.lower() if c.isalnum() or c.isspace())
    b = "".join(c for c in b.lower() if c.isalnum() or c.isspace())
    
    a_words = a.split()
    b_words = b.split()
    
    if not a_words and not b_words:
        return 1.0
    if not a_words or not b_words:
        return 0.0
        
    # Bigram overlap (Dice coefficient)
    def get_bigrams(words):
        bigrams = set()
        for w in words:
            for i in range(len(w) - 1):
                bigrams.add(w[i:i+2])
        return bigrams

    bigrams_a = get_bigrams(a_words)
    bigrams_b = get_bigrams(b_words)
    
    if not bigrams_a and not bigrams_b:
        # Fallback to word set overlap if no character bigrams (very short words)
        a_set = set(a_words)
        b_set = set(b_words)
        intersection = a_set.intersection(b_set)
        return (2.0 * len(intersection)) / (len(a_set) + len(b_set))
        
    intersection = bigrams_a.intersection(bigrams_b)
    return (2.0 * len(intersection)) / (len(bigrams_a) + len(bigrams_b))

def align_lyrics(audio_path, lyrics_path, lang_code="en-US"):
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    if not os.path.exists(lyrics_path):
        raise FileNotFoundError(f"Lyrics file not found: {lyrics_path}")

    # Read lyrics lines
    with open(lyrics_path, "r", encoding="utf-8") as f:
        lyrics_lines = [line.strip() for line in f.readlines() if line.strip() and not line.strip().startswith("[")]

    if not lyrics_lines:
        return []

    # Load audio file using pydub
    audio = AudioSegment.from_file(audio_path)
    duration_secs = len(audio) / 1000.0

    # Initialize speech recognizer
    recognizer = sr.Recognizer()

    # Split audio into 10-second chunks with 2-second overlap
    chunk_size_ms = 10000
    overlap_ms = 2000
    step_ms = chunk_size_ms - overlap_ms

    matched_timestamps = {} # line_index -> list of (timestamp, score)

    print(f"Aligning {len(lyrics_lines)} lines over {duration_secs:.1f}s audio...", file=sys.stderr)

    # Temporary chunk filename template
    temp_wav = f"temp_chunk_{int(time.time() * 1000)}.wav"

    for start_ms in range(0, len(audio), step_ms):
        end_ms = min(start_ms + chunk_size_ms, len(audio))
        chunk = audio[start_ms:end_ms]
        
        # Export chunk to temporary WAV file for speech_recognition
        try:
            chunk.export(temp_wav, format="wav")
            
            with sr.AudioFile(temp_wav) as source:
                audio_data = recognizer.record(source)
            
            # Transcribe via Google Speech Recognition API (free, no credentials required)
            transcription = recognizer.recognize_google(audio_data, language=lang_code)
            
            # Match transcribed words against original lyrics lines within a sliding search window
            for i, line in enumerate(lyrics_lines):
                score = text_similarity(transcription, line)
                if score >= 0.2:
                    if i not in matched_timestamps:
                        matched_timestamps[i] = []
                    matched_timestamps[i].append((start_ms / 1000.0, score))
                    
        except sr.UnknownValueError:
            # Speech recognition did not understand the audio segment
            pass
        except Exception as e:
            # Log connection/API warnings to stderr so we don't pollute stdout
            print(f"Warning: Chunk at {start_ms/1000.0}s failed: {str(e)}", file=sys.stderr)
        finally:
            if os.path.exists(temp_wav):
                try:
                    os.remove(temp_wav)
                except:
                    pass

    # Build initial timestamps list
    aligned = []
    last_time = 0.0

    for i, line in enumerate(lyrics_lines):
        if i in matched_timestamps:
            # Sort matches by score descending and take the best timestamp
            best_time = sorted(matched_timestamps[i], key=lambda x: -x[1])[0][0]
            # Ensure timestamps are strictly increasing
            if best_time <= last_time:
                best_time = last_time + 0.8
            aligned.append({"time": round(best_time, 1), "text": line})
            last_time = best_time
        else:
            # Interpolation placeholder
            aligned.append({"time": None, "text": line})

    # Proportional interpolation of unmatched lines
    for i in range(len(aligned)):
        if aligned[i]["time"] is None:
            # Find previous anchor time
            prev_time = 0.0
            for j in range(i - 1, -1, -1):
                if aligned[j]["time"] is not None:
                    prev_time = aligned[j]["time"]
                    break
            # Find next anchor time
            next_time = duration_secs
            for j in range(i + 1, len(aligned)):
                if aligned[j]["time"] is not None:
                    next_time = aligned[j]["time"]
                    break
            # Distribute time proportionally in the gap
            gap = next_time - prev_time
            count_unmapped = 0
            for j in range(i, len(aligned)):
                if aligned[j]["time"] is None:
                    count_unmapped += 1
                else:
                    break
            interval = gap / (count_unmapped + 1)
            for j in range(i, i + count_unmapped):
                aligned[j]["time"] = round((prev_time + interval * (j - i + 1)) * 10) / 10
            last_time = aligned[i]["time"]

    return aligned

if __name__ == "__main__":
    import time
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python aligner.py <audio_path> <lyrics_path> [lang_code]"}))
        sys.exit(1)
        
    audio_path = sys.argv[1]
    lyrics_path = sys.argv[2]
    lang_code = sys.argv[3] if len(sys.argv) > 3 else "en-US"
    
    try:
        results = align_lyrics(audio_path, lyrics_path, lang_code)
        print(json.dumps(results))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
