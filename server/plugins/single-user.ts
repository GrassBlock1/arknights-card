import { definePlugin } from 'nitro';
import { singleUserEnabled } from '../utils/single-user';

export default definePlugin(() => {
  if (singleUserEnabled() && !process.env.CARD_SKLAND_CREDENTIAL?.trim()) {
    console.warn('[arknights-card] 单用户模式未设置 CARD_SKLAND_CREDENTIAL（token 或 cred）：环境账号同步不可用，手动配置仍可使用。');
  }
});
