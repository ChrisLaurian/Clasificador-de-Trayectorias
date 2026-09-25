// server.js — punto de entrada para desarrollo local (npm run dev).
// En Vercel el entrypoint es api/index.js en la raíz del repo.
const app = require('./src/app');
const db = require('./src/data/db');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT} (datos: ${db.isKV() ? 'Vercel KV' : 'JSON local'})`);
});
