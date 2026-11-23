type Avatar = { id?: unknown; type?: unknown; url?: unknown };

function officialAvatarUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['web.hycdn.cn', 'bbs.hycdn.cn'].includes(url.hostname) ? url.href : '';
  } catch { return ''; }
}

/** Game avatars are independent of secretary portraits. */
export function gameAvatar(statusAvatar: unknown, cardAvatar: unknown, fallback: string): string {
  const status: Avatar = statusAvatar && typeof statusAvatar === 'object' ? statusAvatar : {};
  const card: Avatar = cardAvatar && typeof cardAvatar === 'object' ? cardAvatar : {};
  for (const value of [status.url, typeof statusAvatar === 'string' ? statusAvatar : undefined, card.url, typeof cardAvatar === 'string' ? cardAvatar : undefined]) {
    const url = officialAvatarUrl(value);
    if (url) return url;
  }
  for (const avatar of [status, card]) {
    if (typeof avatar.id !== 'string' || !avatar.id || avatar.id === '-1') continue;
    const category = avatar.type === 'ICON' ? 'avatar' : avatar.id.startsWith('char_') ? 'char_skin/avatar' : '';
    if (category) return `https://web.hycdn.cn/arknights/game/assets/${category}/${encodeURIComponent(avatar.id).replace(/'/g, '%27')}.png`;
  }
  return fallback;
}
