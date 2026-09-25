// server.js — punto de entrada para desarrollo local (npm run dev).
// En Vercel el entrypoint es api/index.js en la raíz del repo.
const app = require('./src/app');
const db = require('./src/data/db');

const PORT = process.env.PORT || 4000;

db.initOnce()
  .then(() => {
    const modo = db.isKV() ? 'Vercel KV' : 'archivos JSON locales';
    console.log(`Datos listos (${modo})`);
  })
  .catch((err) => console.error('No se pudieron inicializar los datos:', err));

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
