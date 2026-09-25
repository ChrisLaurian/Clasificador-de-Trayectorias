const crypto = require('crypto');

// Hash con scrypt (nativo de Node, sin dependencias): "salt:hash" en hex.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch (e) {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
