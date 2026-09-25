const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../data/db');
const { classifyStudent } = require('../services/classifier');

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
  const students = db.getStudents();
  const projects = db.getProjects();
  const nuevo = {
    id: uuidv4(),
    nombre: req.body.nombre || '',
    grupo: req.body.grupo,
    nivel: req.body.nivel,
    diagnostico: req.body.diagnostico || '',
    intereses: req.body.intereses || '',
    fortalezas: req.body.fortalezas || '',
    areasMejora: req.body.areasMejora || '',
  };
  const clasificado = classifyStudent(nuevo, projects);
  students.push(clasificado);
  db.saveStudents(students);
  res.status(201).json(clasificado);
});

// PUT /api/students/:id -> edición individual (incluye override de proyecto asignado)
router.put('/:id', (req, res) => {
  const students = db.getStudents();
  const idx = students.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Alumno no encontrado' });

  students[idx] = {
    ...students[idx],
    ...req.body,
    id: students[idx].id, // el id nunca cambia
  };
  db.saveStudents(students);
  res.json(students[idx]);
});

// POST /api/students/:id/reclasificar -> reasigna el proyecto de catálogo (descarta ediciones manuales)
router.post('/:id/reclasificar', (req, res) => {
  const students = db.getStudents();
  const idx = students.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Alumno no encontrado' });

  const projects = db.getProjects();
  students[idx] = classifyStudent(students[idx], projects);
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
