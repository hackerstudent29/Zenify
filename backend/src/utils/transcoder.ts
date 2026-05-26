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
