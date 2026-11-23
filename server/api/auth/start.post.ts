import { defineHandler, HTTPError } from 'nitro';
import QRCode from 'qrcode';
import { protect, sessionFor, saveSession } from '../../utils/store';
import { startScan } from '../../utils/skland';
export default defineHandler(async event => {
  protect(event, true);
  const { id, session } = await sessionFor(event, true);
  if (session.scanExpires && session.scanExpires > Date.now() + 90000) throw new HTTPError('请使用当前二维码，或稍后重试', { status: 429 });
  const scan = await startScan();
  session.scanId = scan.scanId;
  session.scanExpires = Date.now() + 180000;
  await saveSession(id, session);
  return { qr: await QRCode.toDataURL(scan.scanUrl, { width: 256, margin: 2 }) };
});
