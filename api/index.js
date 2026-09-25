// api/index.js — entrada serverless de Vercel.
// Vercel reescribe /api/* a /api/index?path=..., así que aquí recuperamos la
// ruta original antes de pasar la petición a Express (igual que en local).
const app = require('../backend/src/app');

const DEST = '/api/index';

module.exports = (req, res) => {
  const raw = req.url || '/';
  const qIdx = raw.indexOf('?');
  const pathname = qIdx === -1 ? raw : raw.slice(0, qIdx);
  const search = qIdx === -1 ? '' : raw.slice(qIdx);

  if (pathname === DEST || pathname.startsWith(`${DEST}/`)) {
    // Llegamos por el destino del rewrite: el path real está en ?path= (o colgando del destino).
    const qs = new URLSearchParams(search);
    const resto = qs.get('path') || pathname.slice(DEST.length).replace(/^\/+/, '');
    qs.delete('path');
    const sufijo = resto ? `/${resto.replace(/^\/+/, '')}` : '';
    const query = qs.toString();
    req.url = `/api${sufijo}${query ? `?${query}` : ''}`;
  } else if (!pathname.startsWith('/api')) {
    // Por si el rewrite entregara el path sin el prefijo /api.
    req.url = `/api${pathname}${search}`;
  }
  // Si pathname ya empieza por /api (la ruta original llegó intacta), no tocamos nada.

  return app(req, res);
};
