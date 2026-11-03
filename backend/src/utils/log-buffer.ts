import { EventEmitter } from 'events';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  category: 'HTTP' | 'DATABASE' | 'AUTH' | 'WORKER' | 'SYSTEM';
  message: string;
  details?: Record<string, any>;
}

class LogBufferService extends EventEmitter {
  private buffer: LogEntry[] = [];
  private readonly maxEntries = 1000;
  private idCounter = 0;

  /**
   * Sanitizes sensitive fields like passwords, tokens, API keys, and authorization headers
   */
  private sanitize(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sanitize(item));

    const sanitized: Record<string, any> = {};
    const SENSITIVE_KEYS = /password|token|authorization|secret|cookie|key|credential|jwt/i;

    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.test(k)) {
        sanitized[k] = '[REDACTED]';
      } else if (typeof v === 'object' && v !== null) {
        sanitized[k] = this.sanitize(v);
      } else {
        sanitized[k] = v;
      }
    }
    return sanitized;
  }

  /**
   * Adds an entry to the in-memory ring buffer and emits an event for SSE listeners
   */
  add(entry: Omit<LogEntry, 'id' | 'timestamp'> & { timestamp?: string }) {
    const logItem: LogEntry = {
      id: `log-${Date.now()}-${++this.idCounter}`,
      timestamp: entry.timestamp || new Date().toISOString(),
      level: entry.level,
      category: entry.category,
      message: entry.message,
      details: entry.details ? this.sanitize(entry.details) : undefined
    };

    this.buffer.push(logItem);
    if (this.buffer.length > this.maxEntries) {
      this.buffer.shift();
    }

    this.emit('log', logItem);
    return logItem;
  }

  /**
   * Queries logs with level, category, text search, and pagination
   */
  getLogs(options?: {
    limit?: number;
    level?: string;
    category?: string;
    search?: string;
    sinceId?: string;
  }): LogEntry[] {
    const limit = Math.min(options?.limit || 100, 500);
    let result = [...this.buffer];

    if (options?.sinceId) {
      const idx = result.findIndex(l => l.id === options.sinceId);
      if (idx !== -1) {
        result = result.slice(idx + 1);
      }
    }

    if (options?.level && options.level !== 'ALL') {
      const targetLevel = options.level.toUpperCase();
      result = result.filter(l => l.level === targetLevel);
    }

    if (options?.category && options.category !== 'ALL') {
      const targetCat = options.category.toUpperCase();
      result = result.filter(l => l.category === targetCat);
    }

    if (options?.search) {
      const q = options.search.toLowerCase().trim();
      result = result.filter(l =>
        l.message.toLowerCase().includes(q) ||
        (l.details && JSON.stringify(l.details).toLowerCase().includes(q))
      );
    }

    // Return newest first
    return result.slice(-limit).reverse();
  }

  /**
   * Returns recent N logs (newest first)
   */
  getRecent(count: number = 50): LogEntry[] {
    const limit = Math.min(count, this.maxEntries);
    return [...this.buffer].slice(-limit).reverse();
  }

  /**
   * Returns total buffered entries count
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Clears in-memory buffer
   */
  clear() {
    this.buffer = [];
    this.emit('clear');
  }

  /**
   * Gets buffer statistics
   */
  getStats() {
    return {
      totalBuffered: this.buffer.length,
      maxCapacity: this.maxEntries,
      errorCount: this.buffer.filter(l => l.level === 'ERROR').length,
      warnCount: this.buffer.filter(l => l.level === 'WARN').length,
      infoCount: this.buffer.filter(l => l.level === 'INFO').length,
    };
  }
}

export const logBuffer = new LogBufferService();
