const express = require('express');
const cors = require('cors');
const multer = require('multer');

const projectsRouter = require('./src/routes/projects');
const studentsRouter = require('./src/routes/students');
const uploadRouter = require('./src/routes/upload');
const documentsRouter = require('./src/routes/documents');
const exportRouter = require('./src/routes/export');
const db = require('./src/data/db');
const { syncStudentCompetencias } = require('./src/services/classifier');

const app = express();
const PORT = process.env.PORT || 4000;

// Migración/sincronización de snapshots de alumnos al arrancar
// (alumnos cargados antes de existir las competencias).
(function syncExistingStudents() {
  const students = db.getStudents();
  const synced = students.map((s) =>
    syncStudentCompetencias(s, db.getCompetencias(), db.getProjects())
  );
  if (JSON.stringify(synced) !== JSON.stringify(students)) {
    db.saveStudents(synced);
    console.log(`Sincronizados ${students.length} alumno(s) con el catálogo de competencias`);
  }
})();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

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
  console.error(err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Error subiendo el archivo: ${err.message}` });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido en el cuerpo de la petición' });
  }
  const status = Number(err.status) || Number(err.statusCode) || 500;
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
