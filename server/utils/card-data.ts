import { HTTPError } from 'nitro';
import { getSharedProfile } from './store';
import { getGameData, operatorArt, skillArt } from './gamedata';
import { gameAvatar } from './avatar';

import type { CardProfile } from '../../shared/card.ts';
export type { CardProfile } from '../../shared/card.ts';
type Row = Record<string, any>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const list = (value: unknown): Row[] => Array.isArray(value) ? value.map(row) : [];
const text = (value: unknown, max = 160): string => typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, max) : '';
const number = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? Math.floor(result) : null;
};
function json(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { throw new HTTPError('assists 和 stats 必须为有效 JSON', { status: 400 }); }
}
export function rejectSecretParameters(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:token|cred|cookie|authorization|password|signing|session)/i.test(key) || /^(?:secret|clientSecret|apiKey|accessKey)$/i.test(key)) {
      throw new HTTPError('请勿提交任何凭据；请使用扫码绑定', { status: 400 });
    }
    if (key === 'stats' || key === 'assists') rejectSecretParameters(json(child));
    else if (child && typeof child === 'object') rejectSecretParameters(child);
  }
}

export async function resolveCard(input: Record<string, unknown>): Promise<CardProfile> {
  rejectSecretParameters(input);
  const data = await getGameData();
  const raw = input.id ? row(await getSharedProfile(text(input.id, 128))) : {};
  const root = row(raw.data ?? raw);
  const status = row(root.status);
  const cultivate = row(root.cultivate);
  const chars = list(cultivate.characters ?? root.chars ?? root.characters);
  const alternateForms: Record<string, true> = { char_1001_amiya2: true, char_1037_amiya3: true };
  const owned = new Set(chars.map(char => text(char.charId ?? char.id)).filter(id => Boolean(id) && !alternateForms[id]));
  const furniture = row(root.building).furniture;
  const counts: CardProfile['stats'] = { operators: chars.length ? owned.size : number(status.charCnt), skins: Array.isArray(root.skins) ? root.skins.length : number(status.skinCnt), furniture: number(row(furniture).total ?? furniture ?? status.furnitureCnt), modules: chars.length ? 0 : null, moduleStage3: chars.length ? 0 : null, moduleOperators: chars.length ? 0 : null };
  for (const char of chars) {
    const equips: Row[] = Array.isArray(char.equips) ? list(char.equips) : Object.entries(row(char.equips)).map(([id, value]) => ({ id, ...row(value) }));
    let hasModule = false;
    for (const equip of equips) {
      const id = text(equip.id ?? equip.equipId ?? equip.uniEquipId);
      const meta = data.modules[id];
      const stage = number(equip.level ?? equip.stage) ?? 0;
      if (stage < 1 || !meta || meta.type === 'INITIAL' || meta.typeIcon === 'original') continue;
      counts.modules = (counts.modules ?? 0) + 1;
      if (stage >= 3) counts.moduleStage3 = (counts.moduleStage3 ?? 0) + 1;
      hasModule = true;
    }
    if (hasModule) counts.moduleOperators = (counts.moduleOperators ?? 0) + 1;
  }
  const statOverrides = row(json(input.stats));
  for (const key of Object.keys(counts) as (keyof typeof counts)[]) {
    if (input[key] !== undefined || statOverrides[key] !== undefined) counts[key] = number(input[key] ?? statOverrides[key]);
  }
  const cards = Array.isArray(root.cards) ? list(root.cards) : list(row(root.cards).list ?? row(root.cards).cards);
  const accountUid = text(status.uid ?? root.uid);
  const matchedCard = accountUid ? cards.find(entry => text(row(entry.arknights).uid ?? entry.uid ?? row(entry.role).uid) === accountUid) : undefined;
  const card = row(matchedCard?.arknights ?? matchedCard);
  const secretary = row(status.secretary ?? card.secretary ?? root.secretary);
  const secretaryId = text(input.secretary ?? secretary.charId ?? status.secretary ?? root.secretary, 100);
  const secretarySkin = text(input.skinId ?? secretary.skinId ?? status.secretarySkinId, 120);
  const secretaryArt = operatorArt(data, secretaryId, secretarySkin);
  const sourceAssists = input.assists !== undefined ? json(input.assists) : card.assistChars ?? status.assistChars ?? root.assistChars;
  if (sourceAssists !== undefined && !Array.isArray(sourceAssists)) throw new HTTPError('assists 必须是数组', { status: 400 });
  const assists = list(sourceAssists).slice(0, 3).map(assist => {
    const id = text(assist.id ?? assist.charId, 100);
    const skillId = text(assist.skillId ?? data.characters[id]?.skills?.[Math.max(0, (number(assist.skillIndex) ?? 1) - 1)]?.skillId, 100);
    const skill = data.skills[skillId];
    const equip = row(assist.equip);
    const moduleId = text(assist.module ?? equip.id ?? assist.currentEquip, 100);
    const moduleLevel = number(equip.level);
    const moduleName = text(data.modules[moduleId]?.uniEquipName ?? moduleId);
    return { id, name: text(data.characters[id]?.name ?? id), avatar: operatorArt(data, id, text(assist.skinId)).avatar,
      level: number(assist.level), elite: number(assist.elite ?? assist.evolvePhase),
      skillName: text(skill?.levels?.[0]?.name ?? ''), skillIcon: skillArt(text(skill?.iconId ?? skillId)),
      mastery: number(assist.mastery ?? assist.specializeLevel), module: moduleName && moduleLevel !== null ? `${moduleName} Lv.${moduleLevel}` : moduleName };
  });
  const factionCounts = new Map<string, { name: string; owned: number; total: number }>();
  for (const [id, char] of Object.entries(data.characters)) {
    if (!id.startsWith('char_') || alternateForms[id] || char.isNotObtainable || char.profession === 'TOKEN' || char.profession === 'TRAP') continue;
    for (const factionId of new Set([char.nationId, char.groupId, char.teamId].filter((id): id is string => typeof id === 'string' && id !== 'none'))) {
      const entry = factionCounts.get(factionId) ?? { name: text(data.factions[factionId]?.powerName ?? factionId), owned: 0, total: 0 };
      entry.total++;
      if (owned.has(id)) entry.owned++;
      factionCounts.set(factionId, entry);
    }
  }
  const registeredRaw = input.registered ?? status.registerTs ?? root.registerTs;
  const timestamp = typeof registeredRaw === 'number' || (typeof registeredRaw === 'string' && /^\d{9,13}$/.test(registeredRaw)) ? Number(registeredRaw) * (Number(registeredRaw) < 1e12 ? 1000 : 1) : Date.parse(text(registeredRaw));
  const validDate = Number.isFinite(timestamp) && timestamp > 0;
  let avatar = gameAvatar(status.avatar, card.avatar, secretaryArt.avatar);
  if (input.avatarId) {
    const id = text(input.avatarId, 120);
    const type = input.avatarType;
    const known = type === 'ICON' ? data.avatars.some(entry => entry.avatarType !== 'ASSISTANT' && entry.avatarId === id) : type === 'ASSISTANT' && Boolean(data.skins[id]);
    if (!known) throw new HTTPError('请选择有效的游戏头像', { status: 400 });
    avatar = gameAvatar({ id, type }, {}, secretaryArt.avatar);
  }
  return {
    name: text(input.name ?? status.name ?? root.name) || '博士', uid: text(input.uid ?? status.uid ?? root.uid, 40),
    level: number(input.level ?? status.level ?? root.level), server: text(input.server ?? status.serverName ?? root.server, 40),
    signature: text(input.signature ?? status.resume ?? card.resume ?? root.signature, 240),
    registered: validDate ? new Date(timestamp).toISOString().slice(0, 10) : '',
    days: input.days !== undefined ? number(input.days) : validDate ? Math.max(0, Math.floor((Date.now() - timestamp) / 86400000)) : null,
    avatar,
    secretary: { id: secretaryId, name: text(data.characters[secretaryId]?.name ?? secretaryId), ...secretaryArt },
    stats: counts, assists,
    factions: owned.size ? [...factionCounts.values()].sort((a, b) => b.owned - a.owned || b.total - a.total) : [],
    updatedAt: new Date().toISOString(),
  };
}
