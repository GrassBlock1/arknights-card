import assert from 'node:assert/strict';
import test from 'node:test';
import { CardImageCache, cardCacheKey, cardCacheTtlMs } from '../server/utils/card-cache.ts';

const bytes = (...values) => new Uint8Array(values);

test('cache policy defaults to 900 seconds and accepts zero', () => {
  const original = process.env.CARD_CACHE_TTL_SECONDS;
  try {
    delete process.env.CARD_CACHE_TTL_SECONDS;
    assert.equal(cardCacheTtlMs(), 900_000);
    process.env.CARD_CACHE_TTL_SECONDS = '0';
    assert.equal(cardCacheTtlMs(), 0);
    process.env.CARD_CACHE_TTL_SECONDS = '30';
    assert.equal(cardCacheTtlMs(), 30_000);
    process.env.CARD_CACHE_TTL_SECONDS = '-1';
    assert.equal(cardCacheTtlMs(), 900_000);
  } finally {
    if (original === undefined) delete process.env.CARD_CACHE_TTL_SECONDS;
    else process.env.CARD_CACHE_TTL_SECONDS = original;
  }
});

test('keys canonicalize public objects and JSON fields, excluding generated timestamps', () => {
  const profile = { name: 'Doctor', updatedAt: '2026-01-01', stats: { operators: 1 } };
  const key = cardCacheKey({ name: 'Doctor', stats: '{"skins":2,"operators":1}' }, profile, 'large', 'png');
  assert.equal(key, cardCacheKey({ stats: { operators: 1, skins: 2 }, name: 'Doctor' }, { ...profile, updatedAt: '2026-01-02' }, 'large', 'png'));
  assert.notEqual(key, cardCacheKey({ name: 'Different' }, profile, 'large', 'png'));
  assert.notEqual(key, cardCacheKey({ name: 'Doctor', stats: '{"skins":2,"operators":1}' }, { ...profile, stats: { operators: 2 } }, 'large', 'png'));
  assert.notEqual(key, cardCacheKey({ name: 'Doctor', stats: '{"skins":2,"operators":1}' }, profile, 'compact', 'png'));
  assert.notEqual(key, cardCacheKey({ name: 'Doctor', stats: '{"skins":2,"operators":1}' }, profile, 'large', 'webp'));
});

test('entries expire, repeat requests hit, and disabled caching bypasses reuse', async () => {
  let now = 0;
  let calls = 0;
  const cache = new CardImageCache(16, 4, () => now);
  const render = async () => bytes(++calls);
  assert.equal((await cache.getOrCreate('a', render, 100)).status, 'MISS');
  now = 99;
  assert.equal((await cache.getOrCreate('a', render, 100)).status, 'HIT');
  assert.equal(calls, 1);
  now = 100;
  assert.equal((await cache.getOrCreate('a', render, 100)).status, 'MISS');
  assert.equal((await cache.getOrCreate('a', render, 0)).status, 'BYPASS');
  assert.equal(calls, 3);
});

test('singleflight shares work and failed generations can retry', async () => {
  const cache = new CardImageCache(16, 4);
  let resolve;
  let calls = 0;
  const work = new Promise(done => { resolve = done; });
  const render = () => { calls++; return work; };
  const first = cache.getOrCreate('a', render, 100);
  const second = cache.getOrCreate('a', render, 100);
  resolve(bytes(1));
  const results = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.strictEqual(results[0].bytes, results[1].bytes);
  const error = new Error('render failed');
  await assert.rejects(cache.getOrCreate('failure', async () => { throw error; }, 100), error);
  assert.equal((await cache.getOrCreate('failure', async () => bytes(2), 100)).status, 'MISS');
});

test('byte and entry limits evict the least recently used image', async () => {
  const cache = new CardImageCache(3, 2);
  const render = async () => bytes(1);
  await cache.getOrCreate('a', render, 1000);
  await cache.getOrCreate('b', render, 1000);
  await cache.getOrCreate('a', render, 1000);
  await cache.getOrCreate('c', render, 1000);
  assert.equal((await cache.getOrCreate('a', render, 1000)).status, 'HIT');
  assert.equal((await cache.getOrCreate('b', render, 1000)).status, 'MISS');
  await cache.getOrCreate('large', async () => bytes(1, 2, 3), 1000);
  assert.equal((await cache.getOrCreate('large', render, 1000)).status, 'HIT');
  assert.equal((await cache.getOrCreate('a', render, 1000)).status, 'MISS');
  assert.equal((await cache.getOrCreate('oversize', async () => bytes(1, 2, 3, 4), 1000)).status, 'MISS');
  assert.equal((await cache.getOrCreate('oversize', render, 1000)).status, 'MISS');
});
