import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSingleUserShare, publicConfiguration, singleUserEnabled } from '../server/utils/single-user.ts';

const names = ['CARD_SINGLE_USER', 'CARD_SKLAND_CREDENTIAL_TYPE', 'CARD_SKLAND_CREDENTIAL', 'CARD_SKLAND_UID', 'CARD_SINGLE_USER_SHARE_ID'];
function environment(run) {
  const saved = names.map(name => process.env[name]);
  for (const name of names) delete process.env[name];
  try { run(); }
  finally { names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; }); }
}
function configured() {
  Object.assign(process.env, {
    CARD_SINGLE_USER: 'true', CARD_SKLAND_CREDENTIAL_TYPE: 'cred',
    CARD_SKLAND_CREDENTIAL: 'private-test-credential', CARD_SKLAND_UID: '123456',
    CARD_SINGLE_USER_SHARE_ID: 'private-fixed-share-id-123456789',
  });
}

test('single-user isolation stays enabled unless explicitly disabled', () => environment(() => {
  assert.equal(singleUserEnabled(), true);
  process.env.CARD_SINGLE_USER = 'false';
  assert.equal(singleUserEnabled(), false);
  process.env.CARD_SINGLE_USER = 'true';
  assert.equal(singleUserEnabled(), true);
  for (const value of ['', 'TRUE', '1', ' true ']) {
    process.env.CARD_SINGLE_USER = value;
    assert.throws(singleUserEnabled, /单用户配置无效/);
  }
}));

test('public config contains only mode even when credentials are incomplete', () => environment(() => {
  assert.deepEqual(publicConfiguration(), { singleUser: true });
  process.env.CARD_SINGLE_USER = 'true';
  assert.deepEqual(publicConfiguration(), { singleUser: true });
  configured();
  assert.deepEqual(publicConfiguration(), { singleUser: true });
}));

test('fixed ID takes precedence over stored-shaped IDs and invalid credentials stay private', () => environment(() => {
  configured();
  const id = process.env.CARD_SINGLE_USER_SHARE_ID;
  assert.doesNotThrow(() => assertSingleUserShare(id));
  for (const value of ['a'.repeat(48), id + 'x', '', id.toUpperCase()]) assert.throws(() => assertSingleUserShare(value), /卡片不存在或已撤销/);
  for (const name of ['CARD_SKLAND_CREDENTIAL_TYPE', 'CARD_SKLAND_CREDENTIAL', 'CARD_SKLAND_UID']) {
    const saved = process.env[name];
    process.env[name] = 'secret-invalid value';
    assert.throws(() => assertSingleUserShare(id), error => {
      assert.match(error.message, /单用户配置无效/);
      assert.doesNotMatch(error.message, /secret|private|123456/);
      return true;
    });
    assert.throws(() => assertSingleUserShare('a'.repeat(48)), /卡片不存在或已撤销/);
    process.env[name] = saved;
  }
  process.env.CARD_SINGLE_USER_SHARE_ID = 'short';
  assert.throws(() => assertSingleUserShare('short'), /卡片不存在或已撤销/);
}));
