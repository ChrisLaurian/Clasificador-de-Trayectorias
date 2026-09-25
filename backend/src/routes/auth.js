const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../data/db');
const asyncHandler = require('../asyncHandler');
const { hashPassword, verifyPassword } = require('../services/passwords');
const { getToken, sessionCookie, clearCookie } = require('../middleware/auth');

const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const PASS_MIN = 6;

function publicUser(u) {
  return { id: u.id, username: u.username };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function startSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.setSession(token, user.id);
  res.setHeader('Set-Cookie', sessionCookie(req, token));
  return token;
}

// POST /api/auth/register -> registro abierto (crea usuario + sus datos)
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    const name = String(username || '').trim();

    if (!USERNAME_RE.test(name)) {
      throw httpError(
        400,
        'Usuario inválido: usa 3–32 caracteres (letras, números, punto, guion o guion bajo)'
      );
    }
    if (String(password || '').length < PASS_MIN) {
      throw httpError(400, `La contraseña debe tener al menos ${PASS_MIN} caracteres`);
    }
    if (await db.findUser(name)) throw httpError(409, 'Ese nombre de usuario ya está en uso');

    const user = await db.createUser({
      id: crypto.randomUUID(),
      username: name,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    });

    await startSession(req, res, user);
    res.status(201).json({ user: publicUser(user) });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    const user = await db.findUser(String(username || '').trim());
    if (!user || !verifyPassword(String(password || ''), user.passwordHash)) {
      throw httpError(401, 'Usuario o contraseña incorrectos');
    }
    await startSession(req, res, user);
    res.json({ user: publicUser(user) });
  })
);

// POST /api/auth/logout
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await db.delSession(getToken(req));
    res.setHeader('Set-Cookie', clearCookie());
    res.status(204).end();
  })
);

// GET /api/auth/me -> usuario de la sesión actual
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const token = getToken(req);
    const session = token ? await db.getSession(token) : null;
    const user = session ? await db.getUser(session.userId) : null;
    if (!user) throw httpError(401, 'No autenticado');
    res.json({ user: publicUser(user) });
  })
);

module.exports = router;
