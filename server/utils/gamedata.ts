import { HTTPError } from 'nitro';

type Row = Record<string, any>;
export type GameData = { characters: Record<string, Row>; skins: Record<string, Row>; skills: Record<string, Row>; modules: Record<string, Row>; factions: Record<string, Row>; avatars: Row[] };
const base = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/';
const assets = 'https://web.hycdn.cn/arknights/game/assets';
let cached: GameData | undefined;
let expires = 0;
let pending: Promise<GameData> | undefined;

export function getGameData(): Promise<GameData> {
  if (cached && Date.now() < expires) return Promise.resolve(cached);
  if (pending) return pending;
  pending = (async () => {
    try {
      const tables = await Promise.all(['character_table', 'skin_table', 'skill_table', 'uniequip_table', 'handbook_team_table', 'player_avatar_table'].map(async (table) => {
        const response = await fetch(`${base}${table}.json`, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`Game data HTTP ${response.status}`);
        return await response.json() as Row;
      }));
      cached = { characters: tables[0]!, skins: tables[1]!.charSkins, skills: tables[2]!, modules: tables[3]!.equipDict, factions: tables[4]!, avatars: tables[5]!.avatarList };
      expires = Date.now() + 6 * 60 * 60 * 1000;
      return cached;
    } catch {
      if (cached) { expires = Date.now() + 60_000; return cached; }
      throw new HTTPError('游戏数据暂时不可用，请稍后重试', { status: 503 });
    } finally { pending = undefined; }
  })();
  return pending;
}

export function operatorArt(data: GameData, id: string, skinId = '') {
  const skin = data.skins[skinId] ?? data.skins[`${id}#1`];
  const artId = String(skin?.skinId ?? id);
  const category = skin ? 'char_skin' : 'char';
  return {
    avatar: id ? `${assets}/${category}/avatar/${encodeURIComponent(artId)}.png` : '',
    portrait: id ? `${assets}/${category}/portrait/${encodeURIComponent(artId)}.png` : '',
  };
}

export function skillArt(icon: string): string {
  return icon ? `${assets}/char_skill/${encodeURIComponent(icon)}.png` : '';
}
