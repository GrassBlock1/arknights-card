import type { CardStyle } from '../../server/utils/render-html';
import type { CardFormat } from '../../server/utils/render-image';

export type { CardStyle, CardFormat };
export type SourceMode = 'custom' | 'skland' | 'environment';

export interface AssistSlot {
  id: string;
  name: string;
  avatar: string;
  level: number | undefined;
  elite: number;
  skillIndex: number;
  mastery: number;
  module: string;
  skinId: string;
}

export interface ProfileForm {
  name: string;
  uid: string;
  level: number | undefined;
  server: string;
  signature: string;
  registered: string;
  secretary: string;
  secretaryName: string;
  avatarId: string;
  avatarType: string;
  avatarName: string;
  operators: number | undefined;
  skins: number | undefined;
  furniture: number | undefined;
  modules: number | undefined;
  moduleStage3: number | undefined;
  moduleOperators: number | undefined;
  assists: AssistSlot[];
}

export function createAssistSlot(partial: Partial<AssistSlot> = {}): AssistSlot {
  return {
    id: partial.id ?? 'char_002_amiya',
    name: partial.name ?? '阿米娅',
    avatar: partial.avatar ?? 'https://web.hycdn.cn/arknights/game/assets/char_skin/avatar/char_002_amiya%231.png',
    level: partial.level ?? 80,
    elite: partial.elite ?? 2,
    skillIndex: partial.skillIndex ?? 1,
    mastery: partial.mastery ?? 3,
    module: partial.module ?? '',
    skinId: partial.skinId ?? '',
  };
}

export function defaultProfile(): ProfileForm {
  return {
    name: 'Dr.罗德岛',
    uid: '12345678',
    level: 120,
    server: '官服',
    signature: '愿我们终有一天，能在没有硝烟的天空下重逢。',
    registered: '2019-05-01',
    secretary: 'char_002_amiya',
    secretaryName: '阿米娅',
    avatarId: '',
    avatarType: '',
    avatarName: '',
    operators: 280,
    skins: 156,
    furniture: 420,
    modules: 86,
    moduleStage3: 42,
    moduleOperators: 63,
    assists: [createAssistSlot()],
  };
}

export function cardParameters(
  profile: ProfileForm,
  mode: SourceMode,
  shareId: string,
  style: CardStyle,
  format: CardFormat,
): URLSearchParams {
  const params = new URLSearchParams({ style, format });
  if (mode !== 'custom') {
    if (!shareId.trim()) throw new Error('请输入有效的分享 ID，或先登录并绑定账号。');
    params.set('id', shareId.trim());
    return params;
  }
  if (profile.level !== undefined && (!Number.isInteger(profile.level) || profile.level < 1 || profile.level > 120)) {
    throw new Error('等级须为 1–120。');
  }
  for (const key of ['name', 'uid', 'level', 'server', 'signature', 'registered', 'secretary', 'avatarId', 'avatarType'] as const) {
    const value = profile[key];
    if (value !== undefined && String(value).trim()) params.set(key, String(value).trim());
  }
  const stats: Record<string, number> = {};
  for (const key of ['operators', 'skins', 'furniture', 'modules', 'moduleStage3', 'moduleOperators'] as const) {
    const value = profile[key];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0) throw new Error('收藏数量须为非负整数。');
    stats[key] = value;
  }
  params.set('stats', JSON.stringify(stats));
  if (!Array.isArray(profile.assists) || profile.assists.length > 3) {
    throw new Error('最多配置 3 位助战干员。');
  }
  const serializedAssists = profile.assists.map((slot, index) => {
    const id = slot.id.trim();
    if (!id) throw new Error(`第 ${index + 1} 位助战干员缺少干员 ID。`);
    if (slot.level !== undefined && (!Number.isInteger(slot.level) || slot.level < 1 || slot.level > 90)) {
      throw new Error(`第 ${index + 1} 位助战干员等级须为 1–90。`);
    }
    if (!Number.isInteger(slot.elite) || slot.elite < 0 || slot.elite > 2) {
      throw new Error(`第 ${index + 1} 位助战干员精英化阶段须为 0–2。`);
    }
    if (!Number.isInteger(slot.skillIndex) || slot.skillIndex < 1 || slot.skillIndex > 3) {
      throw new Error(`第 ${index + 1} 位助战干员技能槽位须为 1–3。`);
    }
    if (!Number.isInteger(slot.mastery) || slot.mastery < 0 || slot.mastery > 3) {
      throw new Error(`第 ${index + 1} 位助战干员技能专精须为 0–3。`);
    }
    const item: Record<string, string | number> = {
      id,
      elite: slot.elite,
      skillIndex: slot.skillIndex,
      mastery: slot.mastery,
    };
    if (slot.level !== undefined) item.level = slot.level;
    if (slot.module.trim()) item.module = slot.module.trim();
    if (slot.skinId.trim()) item.skinId = slot.skinId.trim();
    return item;
  });
  params.set('assists', JSON.stringify(serializedAssists));
  return params;
}
