import { execFile, ExecFileOptions } from 'child_process';
import { URL } from 'url';

/**
 * Validate that a URL uses public HTTP/HTTPS and does not target internal or private networks (SSRF prevention).
 */
export function isSafePublicUrl(urlStr: string): boolean {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
        const u = new URL(urlStr.trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

        const host = u.hostname.toLowerCase();
        if (
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '::1' ||
            host === '0.0.0.0' ||
            host.endsWith('.local') ||
            host.endsWith('.internal') ||
            host.endsWith('.localhost')
        ) {
            return false;
        }

        // IPv4 private & link-local ranges check
        const parts = host.split('.').map(Number);
        if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
            if (parts[0] === 10) return false; // 10.0.0.0/8
            if (parts[0] === 127) return false; // 127.0.0.0/8
            if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false; // 172.16.0.0/12
            if (parts[0] === 192 && parts[1] === 168) return false; // 192.168.0.0/16
            if (parts[0] === 169 && parts[1] === 254) return false; // 169.254.0.0/16 (Cloud Metadata)
            if (parts[0] === 0) return false; // 0.0.0.0/8
            if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false; // CGNAT
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Execute a binary directly without spawning a shell, preventing command injection.
 */
export function safeExecFile(
    file: string,
    args: string[],
    options?: ExecFileOptions
): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        execFile(
            file,
            args,
            {
                maxBuffer: options?.maxBuffer ?? 10 * 1024 * 1024,
                timeout: options?.timeout ?? 25000,
                ...options,
            },
            (error, stdout, stderr) => {
                if (error) {
                    return reject(Object.assign(error, { stdout, stderr }));
                }
                resolve({
                    stdout: typeof stdout === 'string' ? stdout : (stdout ? stdout.toString('utf8') : ''),
                    stderr: typeof stderr === 'string' ? stderr : (stderr ? stderr.toString('utf8') : ''),
                });
            }
        );
    });
}
