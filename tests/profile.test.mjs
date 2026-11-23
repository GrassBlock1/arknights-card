import assert from 'node:assert/strict';
import test from 'node:test';
import { cardParameters, createAssistSlot, defaultProfile } from '../app/lib/profile.ts';

test('cardParameters serializes default custom profile and visual assist slots', () => {
  const profile = defaultProfile();
  const params = cardParameters(profile, 'custom', '', 'large', 'png');
  assert.equal(params.get('style'), 'large');
  assert.equal(params.get('format'), 'png');
  assert.equal(params.get('name'), 'Dr.罗德岛');
  assert.equal(params.get('server'), '官服');
  assert.equal(params.get('secretary'), 'char_002_amiya');
  assert.deepEqual(JSON.parse(params.get('stats') ?? '{}'), {
    operators: 280,
    skins: 156,
    furniture: 420,
    modules: 86,
    moduleStage3: 42,
    moduleOperators: 63,
  });
  assert.deepEqual(JSON.parse(params.get('assists') ?? '[]'), [
    { id: 'char_002_amiya', level: 80, elite: 2, skillIndex: 1, mastery: 3 },
  ]);
});

test('cardParameters validates level, collection counts, and assist slot bounds', () => {
  const invalidLevel = defaultProfile();
  invalidLevel.level = 121;
  assert.throws(() => cardParameters(invalidLevel, 'custom', '', 'large', 'png'), /等级须为 1–120/);

  const negativeStats = defaultProfile();
  negativeStats.operators = -1;
  assert.throws(() => cardParameters(negativeStats, 'custom', '', 'large', 'png'), /收藏数量须为非负整数/);

  const tooManyAssists = defaultProfile();
  tooManyAssists.assists = [
    createAssistSlot({ id: 'char_002_amiya' }),
    createAssistSlot({ id: 'char_103_angel' }),
    createAssistSlot({ id: 'char_010_chen' }),
    createAssistSlot({ id: 'char_003_kalts' }),
  ];
  assert.throws(() => cardParameters(tooManyAssists, 'custom', '', 'large', 'png'), /最多配置 3 位助战干员/);

  const emptyAssistId = defaultProfile();
  emptyAssistId.assists = [createAssistSlot({ id: '   ' })];
  assert.throws(() => cardParameters(emptyAssistId, 'custom', '', 'large', 'png'), /第 1 位助战干员缺少干员 ID/);
});

test('cardParameters isolates synced shareId parameters in non-custom modes', () => {
  const profile = defaultProfile();
  assert.throws(() => cardParameters(profile, 'skland', '  ', 'compact', 'svg'), /请输入有效的分享 ID/);
  const params = cardParameters(profile, 'environment', 'fixed-share-id-12345678901234', 'compact', 'svg');
  assert.equal(params.toString(), 'style=compact&format=svg&id=fixed-share-id-12345678901234');
});
