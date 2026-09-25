const db = require('../data/db');

function parseCookies(header) {
  const out = {};
  String(header || '')
    .split(';')
    .forEach((part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return;
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    });
  return out;
}

function getToken(req) {
  return parseCookies(req.headers.cookie).sid || null;
}

function authError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Exige una sesión válida y adjunta req.user / req.sessionToken.
function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return next(authError(401, 'No autenticado'));

  db.getSession(token)
    .then((session) => (session ? db.getUser(session.userId) : null))
    .then((user) => {
      if (!user) throw authError(401, 'No autenticado');
      req.user = user;
      req.sessionToken = token;
      next();
    })
    .catch(next);
}

// Cabecera Set-Cookie de sesión (httpOnly; Secure en HTTPS).
function sessionCookie(req, token) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `sid=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${db.SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie() {
  return 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

module.exports = { parseCookies, getToken, requireAuth, sessionCookie, clearCookie };
