import { createHash } from 'node:crypto';

function configuredInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER / 1000 ? parsed : fallback;
}

export function cardCacheTtlMs(): number {
  return configuredInteger('CARD_CACHE_TTL_SECONDS', 900) * 1000;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

export function cardCacheKey<T extends { updatedAt: string }>(input: Record<string, unknown>, profile: T, style: string, format: string): string {
  const { updatedAt: _updatedAt, ...snapshot } = profile;
  const publicInput: Record<string, unknown> = { ...input, style, format };
  for (const key of ['stats', 'assists'] as const) {
    const value = publicInput[key];
    if (typeof value === 'string') publicInput[key] = JSON.parse(value);
  }
  return createHash('sha256').update(JSON.stringify(canonical({ input: publicInput, snapshot }))).digest('hex');
}

type Bytes = Uint8Array<ArrayBuffer>;
type Entry = { bytes: Bytes; expires: number };
type Result = { bytes: Bytes; status: 'HIT' | 'MISS' | 'BYPASS' };

export class CardImageCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<Bytes>>();
  private byteLength = 0;

  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    maxBytes = configuredInteger('CARD_CACHE_MAX_BYTES', 64 * 1024 * 1024),
    maxEntries = configuredInteger('CARD_CACHE_MAX_ENTRIES', 128),
    now = Date.now,
  ) {
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
    this.now = now;
  }

  private remove(key: string, entry: Entry): void {
    this.entries.delete(key);
    this.byteLength -= entry.bytes.byteLength;
  }

  async getOrCreate(key: string, create: () => Promise<Bytes>, ttlMs = cardCacheTtlMs()): Promise<Result> {
    if (ttlMs <= 0 || this.maxBytes <= 0 || this.maxEntries <= 0) {
      return { bytes: await create(), status: 'BYPASS' };
    }
    const now = this.now();
    for (const [id, entry] of this.entries) {
      if (entry.expires <= now) this.remove(id, entry);
    }
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return { bytes: cached.bytes, status: 'HIT' };
    }
    const existing = this.pending.get(key);
    if (existing) return { bytes: await existing, status: 'HIT' };
    const work = Promise.resolve().then(create).then((rendered) => {
      if (rendered.byteLength <= this.maxBytes) {
        const bytes = rendered.buffer.byteLength === rendered.byteLength ? rendered : new Uint8Array(rendered);
        while (this.entries.size >= this.maxEntries || this.byteLength + bytes.byteLength > this.maxBytes) {
          const oldest = this.entries.entries().next().value;
          if (!oldest) break;
          this.remove(...oldest);
        }
        this.entries.set(key, { bytes, expires: this.now() + ttlMs });
        this.byteLength += bytes.byteLength;
        return bytes;
      }
      return rendered;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return { bytes: await work, status: 'MISS' };
  }
}

export const cardImageCache = new CardImageCache();
