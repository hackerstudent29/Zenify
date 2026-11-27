import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Small durable store: one JSON file, serialized updates, atomic replace
 * (write temp then rename) and crash/corruption recovery (a bad file is moved
 * aside, never crashes the server). Fine for gifts/invites/profiles; swap for
 * a database if volume grows.
 */
export class JsonStore<S extends object> {
  private state!: S;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly initial: () => S,
  ) {}

  async init(): Promise<this> {
    await mkdir(dirname(this.file), { recursive: true });
    try {
      this.state = JSON.parse(await readFile(this.file, 'utf8')) as S;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        try {
          await rename(this.file, `${this.file}.corrupt-${Date.now()}`);
        } catch {
          /* ignore */
        }
      }
      this.state = this.initial();
    }
    return this;
  }

  /** Current snapshot. Treat as read-only. */
  read(): Readonly<S> {
    return this.state;
  }

  /** Apply [fn] atomically. If it throws, the state is left untouched. */
  update<T>(fn: (s: S) => T): Promise<T> {
    const run = async (): Promise<T> => {
      const draft = structuredClone(this.state);
      const out = fn(draft);
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(draft), { mode: 0o600 });
      await rename(tmp, this.file);
      this.state = draft;
      return out;
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }
}
