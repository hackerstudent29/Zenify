import { execFile, ExecFileOptions } from 'child_process';
import { URL } from 'url';
import net from 'net';
import dns from 'dns';

/**
 * Checks if an IP address (IPv4 or IPv6) is loopback, private, link-local, or reserved.
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
    if (!rawIp) return true;
    let ip = rawIp.trim().toLowerCase();

    // Strip enclosing brackets if passed as [::1]
    if (ip.startsWith('[') && ip.endsWith(']')) {
        ip = ip.slice(1, -1);
    }

    // Check for IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (ip.startsWith('::ffff:')) {
        const mapped = ip.slice(7);
        if (net.isIPv4(mapped)) {
            return isPrivateOrReservedIp(mapped);
        }
        const hexParts = mapped.split(':');
        if (hexParts.length === 2) {
            const high = parseInt(hexParts[0], 16);
            const low = parseInt(hexParts[1], 16);
            if (!isNaN(high) && !isNaN(low)) {
                const b1 = (high >> 8) & 0xff;
                const b2 = high & 0xff;
                const b3 = (low >> 8) & 0xff;
                const b4 = low & 0xff;
                return isPrivateOrReservedIp(`${b1}.${b2}.${b3}.${b4}`);
            }
        }
    }

    // IPv6 checks
    if (net.isIPv6(ip)) {
        // Loopback & Unspecified
        if (ip === '::1' || ip === '0:0:0:0:0:0:0:1' || ip === '::' || ip === '0:0:0:0:0:0:0:0') return true;
        // Unique Local Address (ULA) fc00::/7 (fc.. or fd..)
        if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
        // Link-Local fe80::/10
        if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return true;
        // Discard prefix 100::/64
        if (ip.startsWith('100:')) return true;
        // IPv4-IPv6 translation 64:ff9b::/96
        if (ip.startsWith('64:ff9b:')) return true;
        return false;
    }

    // IPv4 checks
    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
            const [b0, b1] = parts;
            if (b0 === 0) return true; // 0.0.0.0/8
            if (b0 === 10) return true; // 10.0.0.0/8
            if (b0 === 127) return true; // 127.0.0.0/8 (Loopback)
            if (b0 === 169 && b1 === 254) return true; // 169.254.0.0/16 (Link-Local & Cloud Metadata)
            if (b0 === 172 && b1 >= 16 && b1 <= 31) return true; // 172.16.0.0/12
            if (b0 === 192 && b1 === 168) return true; // 192.168.0.0/16
            if (b0 === 100 && b1 >= 64 && b1 <= 127) return true; // 100.64.0.0/10 (CGNAT)
            if (b0 === 192 && b1 === 0) return true; // 192.0.0.0/24 (IETF Protocol Assignments)
            if (b0 === 198 && (b1 === 18 || b1 === 19)) return true; // 198.18.0.0/15 (Benchmarking)
            if (b0 >= 224) return true; // 224.0.0.0/4 Multicast & 240.0.0.0/4 Reserved
        }
    }

    // Integer/hex IPv4 representations (e.g. 2130706433 or 0x7f000001)
    const num = Number(ip);
    if (!isNaN(num) && num >= 0 && num <= 4294967295) {
        const b0 = (num >>> 24) & 255;
        const b1 = (num >>> 16) & 255;
        if (b0 === 0 || b0 === 10 || b0 === 127 || (b0 === 169 && b1 === 254) || (b0 === 172 && b1 >= 16 && b1 <= 31) || (b0 === 192 && b1 === 168) || b0 >= 224) {
            return true;
        }
    }

    return false;
}

/**
 * Synchronously validate that a URL uses public HTTP/HTTPS and does not target internal/private hostnames or IPs.
 */
export function isSafePublicUrl(urlStr: string): boolean {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
        const u = new URL(urlStr.trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

        let host = u.hostname.toLowerCase();
        if (host.startsWith('[') && host.endsWith(']')) {
            host = host.slice(1, -1);
        }

        if (
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '0.0.0.0' ||
            host === '::1' ||
            host === '::' ||
            host.endsWith('.local') ||
            host.endsWith('.internal') ||
            host.endsWith('.localhost') ||
            host.endsWith('.localdomain') ||
            host.endsWith('.home.arpa')
        ) {
            return false;
        }

        if (isPrivateOrReservedIp(host)) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Asynchronously validate that a URL resolves exclusively to public, non-private IP addresses (SSRF & DNS rebinding protection).
 */
export async function assertSafePublicUrl(urlStr: string): Promise<boolean> {
    if (!isSafePublicUrl(urlStr)) return false;

    try {
        const u = new URL(urlStr.trim());
        let host = u.hostname.toLowerCase();
        if (host.startsWith('[') && host.endsWith(']')) {
            host = host.slice(1, -1);
        }

        // If hostname is already an IP, it has passed isPrivateOrReservedIp above
        if (net.isIP(host)) {
            return true;
        }

        // Resolve DNS and verify every returned record
        const records = await dns.promises.lookup(host, { all: true });
        if (!records || records.length === 0) return false;

        for (const record of records) {
            if (isPrivateOrReservedIp(record.address)) {
                return false;
            }
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
