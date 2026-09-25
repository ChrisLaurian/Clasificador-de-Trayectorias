// Cliente mínimo para Vercel KV (Upstash Redis) usando la API REST.
// No requiere dependencias extra: usa el fetch global de Node 18+.
//
// Variables de entorno (las inyecta Vercel al conectar el store KV):
//   KV_REST_API_URL / KV_REST_API_TOKEN   (Vercel KV)
//   UPSTASH_REDIS_REST_URL / ..._TOKEN    (Upstash directo)

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function kvAvailable() {
  return Boolean(KV_URL && KV_TOKEN);
}

async function command(...args) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Error KV (HTTP ${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Error KV: ${data.error}`);
  return data.result;
}

// GET con JSON.parse (guardamos objetos completos, igual que los .json de antes)
async function kvGet(key) {
  const raw = await command('GET', key);
  if (raw === null || raw === undefined) return null;
  return JSON.parse(raw);
}

async function kvSet(key, value) {
  await command('SET', key, JSON.stringify(value));
}

async function kvDel(key) {
  await command('DEL', key);
}

module.exports = { kvAvailable, kvGet, kvSet, kvDel, command };
