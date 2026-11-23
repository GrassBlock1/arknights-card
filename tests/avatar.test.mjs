import assert from 'node:assert/strict';
import test from 'node:test';
import { gameAvatar } from '../server/utils/avatar.ts';
const assistant = 'https://web.hycdn.cn/arknights/game/assets/char_skin/avatar/char_002_amiya%231.png';

test('game portrait URL is independent from secretary and unsafe URLs are skipped', () => {
  const actual = 'https://bbs.hycdn.cn/game/doctor.png';
  assert.equal(gameAvatar({ url: actual }, {}, assistant), actual);
  assert.equal(gameAvatar({ url: '' }, { url: actual }, assistant), actual);
  assert.equal(gameAvatar({ url: 'https://evil.example/avatar.png' }, { url: actual }, assistant), actual);
  assert.equal(gameAvatar({ url: 'https://web.hycdn.cn@evil.example/a.png' }, {}, assistant), assistant);
});
test('ICON and skin avatars preserve the selected account avatar ID', () => {
  assert.equal(gameAvatar({ type: 'ICON', id: 'avatar_test' }, {}, assistant), 'https://web.hycdn.cn/arknights/game/assets/avatar/avatar_test.png');
  assert.equal(gameAvatar({ type: 'ASSISTANT', id: 'char_103_angel#2' }, {}, assistant), 'https://web.hycdn.cn/arknights/game/assets/char_skin/avatar/char_103_angel%232.png');
  assert.equal(gameAvatar({}, { type: 'ICON', id: 'avatar_test' }, assistant), 'https://web.hycdn.cn/arknights/game/assets/avatar/avatar_test.png');
  assert.equal(gameAvatar({}, {}, assistant), assistant);
});
