import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
const execPromise = promisify(exec);

let isFfmpegAvailable = false;

// Async check for FFmpeg availability on load
execPromise('ffmpeg -version')
  .then(() => {
    isFfmpegAvailable = true;
    console.log('[Transcoder] FFmpeg is available on system. Audio transcoding enabled.');
  })
  .catch(() => {
    console.warn('[Transcoder] Warning: FFmpeg is not installed or not in PATH. Audio transcoding will be skipped (fallback to raw streams).');
  });

/**
 * Transcodes an audio file to standard 128kbps audio format (MP3/M4A).
 * @param inputPath Path to the raw downloaded/uploaded file
 * @param outputPath Target path to write the transcoded file
 * @returns Path to the processed file (either transcoded or input file path if FFmpeg is missing)
 */
export async function transcodeTo128kbps(inputPath: string, outputPath: string): Promise<string> {
  if (!isFfmpegAvailable) {
    return inputPath;
  }

  console.log(`[Transcoder] Transcoding ${path.basename(inputPath)} -> 128kbps streaming profile`);
  
  try {
    // -y: overwrite output
    // -i: input file
    // -vn: disable video stream (stripping YT video content)
    // -b:a 128k: audio bitrate 128k
    const cmd = `ffmpeg -y -i "${inputPath}" -vn -b:a 128k "${outputPath}"`;
    await execPromise(cmd);
    console.log(`[Transcoder] Transcode successful: ${outputPath}`);
    return outputPath;
  } catch (err: any) {
    console.error('[Transcoder] FFmpeg transcode failed, uploading raw stream:', err.message);
    return inputPath;
  }
}

/**
 * Probes an audio file to determine its duration in seconds.
 * @param filePath Path to the audio file
 * @returns Duration in seconds (rounded), or null if probe failed
 */
export async function getAudioDuration(filePath: string): Promise<number | null> {
  if (!isFfmpegAvailable) {
    return null;
  }
  try {
    // Try ffprobe first
    const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    const val = parseFloat(stdout.trim());
    if (!isNaN(val) && val > 0) {
      console.log(`[Transcoder] ffprobe resolved duration: ${val}s`);
      return Math.round(val);
    }
  } catch (err: any) {
    console.warn(`[Transcoder] ffprobe failed:`, err.message);
  }

  // Fallback: Try running ffmpeg -i and parsing the output
  try {
    // ffmpeg outputs info to stderr when run on a file
    const res = await execPromise(`ffmpeg -i "${filePath}"`).catch(e => e); 
    const output = (res.stderr || res.stdout || '') as string;
    const match = /Duration:\s*(\d+):(\d+):(\d+)(?:\.(\d+))?/.exec(output);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const seconds = parseInt(match[3]);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      console.log(`[Transcoder] ffmpeg resolved duration: ${totalSeconds}s`);
      return totalSeconds;
    }
  } catch (err: any) {
    console.warn(`[Transcoder] ffmpeg duration probe failed:`, err.message);
  }

  return null;
}
