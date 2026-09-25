// app.js — aplicación Express sin `listen` (la usa server.js en local
// y api/index.js en Vercel/Functions).
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const authRouter = require('./routes/auth');
const projectsRouter = require('./routes/projects');
const studentsRouter = require('./routes/students');
const uploadRouter = require('./routes/upload');
const documentsRouter = require('./routes/documents');
const exportRouter = require('./routes/export');
const db = require('./data/db');
const { requireAuth, isAuthDisabled, fallbackUser } = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Público: estado del servicio (avisa si en Vercel falta el KV)
app.get('/api/health', (req, res) =>
  res.json({
    status: 'ok',
    storage: db.isKV() ? 'kv' : 'json',
    ...(process.env.VERCEL && !db.isKV()
      ? { warning: 'KV no configurado: la escritura fallará (filesystem de solo lectura)' }
      : {}),
  })
);

// Autenticación (registro abierto, login, logout, sesión actual)
app.use('/api/auth', authRouter);

// Todo lo demás exige sesión: cada usuario ve sus propios datos.
// Con AUTH_DISABLED=1 se entra en modo invitado (sin login, temporal).
app.use('/api', (req, res, next) =>
  (isAuthDisabled() ? fallbackUser : requireAuth)(req, res, next)
);

app.use('/api/projects', projectsRouter);
app.use('/api/students', studentsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/export', exportRouter);

// 404 en JSON para rutas /api desconocidas
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// Manejo de errores centralizado
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = Number(err.status) || Number(err.statusCode) || 500;
  if (status >= 500) console.error(err); // los 4xx (auth, validaciones) son esperados
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Error subiendo el archivo: ${err.message}` });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido en el cuerpo de la petición' });
  }
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
});

module.exports = app;
