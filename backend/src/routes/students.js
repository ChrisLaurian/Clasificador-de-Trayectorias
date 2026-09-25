const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../data/db');
const { classifyStudent, syncStudentCompetencias } = require('../services/classifier');

function validateGrupoNivel(grupo, nivel) {
  if (!grupo || !db.getGrupos().some((g) => g.codigo === grupo)) {
    return `Grupo inválido o inexistente: "${grupo || ''}"`;
  }
  if (!db.LEVELS.includes(nivel)) {
    return `Nivel inválido: "${nivel || ''}" (usa B, I o A)`;
  }
  return null;
}

// GET /api/students?grupo=A&nivel=B -> lista con filtros opcionales
router.get('/', (req, res) => {
  const { grupo, nivel } = req.query;
  let students = db.getStudents();
  if (grupo) students = students.filter((s) => s.grupo === grupo);
  if (nivel) students = students.filter((s) => s.nivel === nivel);
  res.json(students);
});

// GET /api/students/:id
router.get('/:id', (req, res) => {
  const student = db.getStudents().find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });
  res.json(student);
});

// POST /api/students -> alta individual (opcional, además de carga masiva)
router.post('/', (req, res) => {
  const body = req.body || {};
  if (!String(body.nombre || '').trim()) {
    return res.status(400).json({ error: 'El nombre del alumno es obligatorio' });
  }
  const error = validateGrupoNivel(body.grupo, body.nivel);
  if (error) return res.status(400).json({ error });

  const students = db.getStudents();
  const nuevo = {
    id: uuidv4(),
    nombre: String(body.nombre).trim(),
    grupo: body.grupo,
    nivel: body.nivel,
    diagnostico: body.diagnostico || '',
    intereses: body.intereses || '',
    fortalezas: body.fortalezas || '',
    areasMejora: body.areasMejora || '',
  };
  const clasificado = classifyStudent(nuevo, db.getProjects());
  students.push(clasificado);
  db.saveStudents(students);
  res.status(201).json(clasificado);
});

// PUT /api/students/:id -> edición individual (incluye override de proyecto asignado)
router.put('/:id', (req, res) => {
  const students = db.getStudents();
  const idx = students.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Alumno no encontrado' });

  const body = { ...(req.body || {}) };
  delete body.id;

  const original = students[idx];
  const cambioUbicacion =
    (body.grupo !== undefined && body.grupo !== original.grupo) ||
    (body.nivel !== undefined && body.nivel !== original.nivel);

  if (body.grupo !== undefined || body.nivel !== undefined) {
    const error = validateGrupoNivel(
      body.grupo !== undefined ? body.grupo : original.grupo,
      body.nivel !== undefined ? body.nivel : original.nivel
    );
    if (error) return res.status(400).json({ error });
  }

  if (cambioUbicacion) {
    // Cambiar de grupo/nivel implica un proyecto nuevo: se reclasifica primero
    // y se descarta el snapshot anterior para no mezclar proyectos.
    const base = { ...original, ...body, id: original.id };
    delete base.proyectoAsignado;
    students[idx] = classifyStudent(base, db.getProjects());
  } else {
    students[idx] = { ...original, ...body, id: original.id };
  }

  // Garantiza que el snapshot tenga exactamente las competencias del catálogo.
  students[idx] = syncStudentCompetencias(
    students[idx],
    db.getCompetencias(),
    db.getProjects()
  );

  db.saveStudents(students);
  res.json(students[idx]);
});

// POST /api/students/:id/reclasificar -> reasigna el proyecto de catálogo (descarta ediciones manuales)
router.post('/:id/reclasificar', (req, res) => {
  const students = db.getStudents();
  const idx = students.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Alumno no encontrado' });

  students[idx] = classifyStudent(students[idx], db.getProjects());
  db.saveStudents(students);
  res.json(students[idx]);
});

// DELETE /api/students/:id
router.delete('/:id', (req, res) => {
  const students = db.getStudents().filter((s) => s.id !== req.params.id);
  db.saveStudents(students);
  res.status(204).end();
});

// DELETE /api/students -> vaciar todo (útil para volver a cargar el Excel)
router.delete('/', (req, res) => {
  db.saveStudents([]);
  res.status(204).end();
});

module.exports = router;
