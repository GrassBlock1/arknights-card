import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
import { getGameData, operatorArt } from '../utils/gamedata';
import { rejectSecretParameters } from '../utils/card-data';

export default defineHandler(async (event) => {
  const query = getQuery(event);
  rejectSecretParameters(query);
  const search = typeof query.q === 'string' ? query.q.trim().toLocaleLowerCase().slice(0, 80) : '';
  const data = await getGameData();
  return Object.entries(data.characters)
    .filter(([id, char]) => id.startsWith('char_') && !char.isNotObtainable && char.profession !== 'TOKEN' && char.profession !== 'TRAP'
      && (!search || `${id} ${char.name} ${char.appellation ?? ''}`.toLocaleLowerCase().includes(search)))
    .slice(0, 40)
    .map(([id, char]) => ({ id, name: String(char.name), avatar: operatorArt(data, id).avatar }));
});
