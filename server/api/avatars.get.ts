import { defineHandler } from 'nitro';
import { getGameData } from '../utils/gamedata';
import { rejectSecretParameters } from '../utils/card-data';
import { gameAvatar } from '../utils/avatar';

export default defineHandler(async event => {
  const query = Object.fromEntries(event.url.searchParams);
  rejectSecretParameters(query);
  const search = (query.q ?? '').trim().toLocaleLowerCase().slice(0, 80);
  const data = await getGameData();
  const skins = Object.entries(data.skins).flatMap(([id, skin]) => {
    const character = data.characters[skin.charId];
    if (!character || character.isNotObtainable) return [];
    return [{ id, type: 'ASSISTANT', name: `${character.name} · ${skin.displaySkin?.skinName || (id.endsWith('#2') ? '精英二' : '默认服装')}` }];
  });
  const icons = data.avatars.filter(avatar => avatar.avatarType !== 'ASSISTANT').map(avatar => ({ id: String(avatar.avatarId), type: 'ICON', name: String(avatar.avatarItemName) }));
  return [...icons, ...skins].filter(avatar => !search || `${avatar.name} ${avatar.id}`.toLocaleLowerCase().includes(search)).slice(0, 40).map(avatar => ({ ...avatar, avatar: gameAvatar(avatar, {}, '') }));
});
