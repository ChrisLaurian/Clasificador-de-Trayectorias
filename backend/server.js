const express = require('express');
const cors = require('cors');

const projectsRouter = require('./src/routes/projects');
const studentsRouter = require('./src/routes/students');
const uploadRouter = require('./src/routes/upload');
const documentsRouter = require('./src/routes/documents');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/projects', projectsRouter);
app.use('/api/students', studentsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/documents', documentsRouter);

// Manejo de errores genérico
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
