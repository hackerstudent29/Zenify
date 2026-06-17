import { spawn } from 'child_process';
import path from 'path';
import { FastifyReply } from 'fastify';
import { Readable } from 'stream';

export class AudioProcessorService {
    /**
     * Maps frontend preset names and speed to FFmpeg filter graphs.
     */
    private static getFilterGraph(fx: string, speed: number, direction8D: string, freq8D: number): string | null {
        const filters: string[] = [];
        const activeFx = fx.split(',').filter(f => f.trim() !== '' && f.trim() !== 'flat');

        if (activeFx.includes('bassboost')) {
            filters.push('bass=g=10:f=110:w=0.5');
        }

        if (activeFx.includes('8d')) {
            const panFilter = direction8D === 'counter-clockwise' 
                ? `apulsator=mode=sine:hz=${freq8D}:width=1:offset_l=0.5:offset_r=0`
                : `apulsator=mode=sine:hz=${freq8D}:width=1:offset_l=0:offset_r=0.5`;
            
            // 8D audio requires a room simulation (reverb) to sound authentic and spatial
            if (!activeFx.includes('reverb')) {
                filters.push(`${panFilter},aecho=0.8:0.9:1000:0.3`);
            } else {
                filters.push(panFilter);
            }
        }

        if (activeFx.includes('reverb')) {
            filters.push('aecho=0.8:0.9:1000:0.3');
        }

        // Speed modifications
        if (speed !== 1.0) {
            // Handle speed adjustment via atempo (preserves pitch)
            // FFmpeg atempo only supports 0.5 to 2.0, which matches our slider perfectly.
            filters.push(`atempo=${speed}`);
        }

        // Support legacy nightcore/daycore if passed explicitly
        if (activeFx.includes('nightcore') && speed === 1.0) {
            filters.push('asetrate=44100*1.25,aresample=44100,atempo=1.1');
        }
        if (activeFx.includes('daycore') && speed === 1.0) {
            filters.push('asetrate=44100*0.8,aresample=44100,atempo=0.9');
        }

        return filters.length > 0 ? filters.join(',') : null;
    }

    /**
     * Gets the output codec and format arguments for FFmpeg.
     */
    private static getFormatArgs(format: string): string[] {
        switch (format) {
            case 'wav':
                return ['-f', 'wav', '-acodec', 'pcm_s16le'];
            case 'flac':
                return ['-f', 'flac', '-acodec', 'flac'];
            case 'm4a':
                return ['-f', 'mp4', '-acodec', 'aac', '-b:a', '256k'];
            case 'mp3':
            default:
                return ['-f', 'mp3', '-acodec', 'libmp3lame', '-b:a', '320k'];
        }
    }

    /**
     * Processes an audio stream from an input URL using FFmpeg, applying the selected FX,
     * and pipes the output directly to the Fastify reply.
     */
    public static async processAndStream(
        inputUrl: string, 
        format: string, 
        fx: string, 
        speed: number,
        direction8D: string,
        freq8D: number,
        reply: FastifyReply,
        filename: string
    ): Promise<void> {
        const formatArgs = this.getFormatArgs(format);
        const filterGraph = this.getFilterGraph(fx, speed, direction8D, freq8D);

        // FFmpeg command arguments
        const args = [
            '-hide_banner',
            '-loglevel', 'error',
            '-i', inputUrl, // Input can be an HTTP URL
            '-vn', // Disable video
            ...formatArgs
        ];

        // Apply audio filters if needed
        if (filterGraph) {
            args.push('-af', filterGraph);
        }

        // Pipe output to stdout
        args.push('pipe:1');

        console.log(`[AudioProcessor] Spawning FFmpeg: ffmpeg ${args.join(' ')}`);

        const ffmpeg = spawn('ffmpeg', args);

        // Set response headers
        const ext = format === 'm4a' ? 'm4a' : format === 'flac' ? 'flac' : format === 'wav' ? 'wav' : 'mp3';
        const contentType = ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : ext === 'flac' ? 'audio/flac' : 'audio/mp4';
        
        reply.raw.setHeader('Content-Type', contentType);
        // encodeURIComponent to handle special characters in filename
        reply.raw.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.${ext}`);

        // Pipe FFmpeg stdout to the response
        ffmpeg.stdout.pipe(reply.raw);

        // Handle errors
        ffmpeg.stderr.on('data', (data) => {
            console.error(`[FFmpeg Error]: ${data}`);
        });

        return new Promise((resolve, reject) => {
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    console.log(`[AudioProcessor] Stream completed successfully.`);
                    resolve();
                } else {
                    console.error(`[AudioProcessor] FFmpeg exited with code ${code}`);
                    // If headers haven't been sent, we could send an error, but the stream might be dead.
                    if (!reply.raw.headersSent) {
                        reply.status(500).send({ error: 'Audio processing failed' });
                    }
                    reject(new Error(`FFmpeg exited with code ${code}`));
                }
            });

            reply.raw.on('close', () => {
                // If the client disconnects prematurely, kill FFmpeg
                console.log('[AudioProcessor] Client disconnected, killing FFmpeg process.');
                ffmpeg.kill('SIGKILL');
                resolve();
            });
        });
    }

    /**
     * Converts an incoming WAV audio stream to the requested format (mp3, m4a, flac)
     * using FFmpeg and streams the converted audio directly to the Fastify reply.
     */
    public static async convertFormat(
        wavStream: Readable,
        format: string,
        reply: FastifyReply,
        filename: string
    ): Promise<void> {
        const formatArgs = this.getFormatArgs(format);
        const args = [
            '-hide_banner',
            '-loglevel', 'error',
            '-i', 'pipe:0', // Read WAV from stdin
            '-vn', // Disable video
            ...formatArgs,
            'pipe:1' // Write output to stdout
        ];

        console.log(`[AudioProcessor] Spawning FFmpeg converter: ffmpeg ${args.join(' ')}`);

        const ffmpeg = spawn('ffmpeg', args);

        const ext = format === 'm4a' ? 'm4a' : format === 'flac' ? 'flac' : 'mp3';
        const contentType = ext === 'mp3' ? 'audio/mpeg' : ext === 'flac' ? 'audio/flac' : 'audio/mp4';
        
        reply.raw.setHeader('Content-Type', contentType);
        reply.raw.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.${ext}`);

        // Pipe WAV stream to FFmpeg stdin
        wavStream.pipe(ffmpeg.stdin);

        // Pipe FFmpeg stdout to Fastify response
        ffmpeg.stdout.pipe(reply.raw);

        // Handle errors
        ffmpeg.stderr.on('data', (data) => {
            console.error(`[FFmpeg Converter Error]: ${data}`);
        });

        return new Promise((resolve, reject) => {
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    console.log(`[AudioProcessor] Conversion completed successfully.`);
                    resolve();
                } else {
                    console.error(`[AudioProcessor] FFmpeg converter exited with code ${code}`);
                    if (!reply.raw.headersSent) {
                        reply.status(500).send({ error: 'Audio conversion failed' });
                    }
                    reject(new Error(`FFmpeg converter exited with code ${code}`));
                }
            });

            reply.raw.on('close', () => {
                console.log('[AudioProcessor] Client disconnected, killing converter FFmpeg.');
                ffmpeg.kill('SIGKILL');
                resolve();
            });
        });
    }
}
