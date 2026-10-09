import { createHmac } from 'node:crypto';

export function rtcConfig(accountId, env = process.env, now = Date.now()) {
  const urls = (env.TURN_URLS || env.TURN_URL || '').split(',').map(s=>s.trim()).filter(Boolean);
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  const expiresAt = now + 60 * 60 * 1000;
  if (urls.length && env.TURN_SECRET) {
    const username = `${Math.floor(expiresAt/1000)}:${accountId}`;
    iceServers.push({urls, username, credential:createHmac('sha1',env.TURN_SECRET).update(username).digest('base64')});
  } else if (urls.length && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    iceServers.push({urls,username:env.TURN_USERNAME,credential:env.TURN_CREDENTIAL});
  }
  return { iceServers, iceTransportPolicy:env.RTC_RELAY_ONLY === 'true' ? 'relay' : 'all', expiresAt };
}
export function validateProduction(env = process.env) {
  if(env.NODE_ENV !== 'production') return;
  const missing=[];
  try { if(new URL(env.APP_ORIGIN).protocol!=='https:') missing.push('HTTPS APP_ORIGIN'); } catch { missing.push('HTTPS APP_ORIGIN'); }
  if(!env.SMTP_HOST || !env.MAIL_FROM) missing.push('SMTP_HOST and MAIL_FROM');
  if(!(env.TURN_URLS || env.TURN_URL) || (env.TURN_SECRET?.length || 0)<32) missing.push('TURN_URLS and a TURN_SECRET of at least 32 characters');
  if(env.REQUIRE_EMAIL_VERIFICATION === 'false') missing.push('email verification enabled');
  if(missing.length) throw new Error(`Production configuration requires: ${missing.join('; ')}`);
}
export function securityHeaders(req,res,next) {
  res.set({ 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer',
    'Permissions-Policy':'camera=(self), microphone=(self), display-capture=(self), geolocation=()' });
  if(process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security','max-age=31536000');
    res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self' wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  }
  next();
}
