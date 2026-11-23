import assert from 'node:assert/strict';
import test from 'node:test';
import { workbenchEnabled } from '../server/utils/frontend.ts';

function environment(run) {
  const saved = process.env.CARD_DISABLE_FRONTEND;
  delete process.env.CARD_DISABLE_FRONTEND;
  try { run(); }
  finally {
    if (saved === undefined) delete process.env.CARD_DISABLE_FRONTEND;
    else process.env.CARD_DISABLE_FRONTEND = saved;
  }
}

test('workbench is disabled only by an explicit true value', () => environment(() => {
  assert.equal(workbenchEnabled(), true);
  process.env.CARD_DISABLE_FRONTEND = 'false';
  assert.equal(workbenchEnabled(), true);
  process.env.CARD_DISABLE_FRONTEND = 'true';
  assert.equal(workbenchEnabled(), false);
  for (const value of ['', 'TRUE', '1', ' true ']) {
    process.env.CARD_DISABLE_FRONTEND = value;
    assert.throws(workbenchEnabled, /CARD_DISABLE_FRONTEND 配置无效/);
  }
}));
