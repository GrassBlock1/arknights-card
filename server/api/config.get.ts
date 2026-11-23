import { defineHandler } from 'nitro';
import { setResponseHeader } from 'nitro/h3';
import { publicConfiguration } from '../utils/single-user';

export default defineHandler(event => {
  setResponseHeader(event, 'Cache-Control', 'no-store');
  return publicConfiguration();
});
