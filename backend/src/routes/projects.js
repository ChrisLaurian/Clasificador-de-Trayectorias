const express = require('express');
const router = express.Router();
const db = require('../data/db');

// GET /api/projects -> matriz completa Grupo x Nivel
router.get('/', (req, res) => {
  res.json(db.getProjects());
});

// PUT /api/projects/:id -> actualizar una celda de la matriz (ej: "A-B")
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const projects = db.getProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Proyecto de catálogo no encontrado' });

  projects[idx] = { ...projects[idx], ...req.body, id };
  db.saveProjects(projects);
  res.json(projects[idx]);
});

// PUT /api/projects -> guardar la matriz completa de una sola vez
router.put('/', (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Se esperaba un arreglo de proyectos' });
  }
  db.saveProjects(req.body);
  res.json(req.body);
});

module.exports = router;
