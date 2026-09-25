const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { buildRows, toCSV, toXML, toXLSX, toJSON } = require('../services/exporters');

const FORMATS = {
  csv: { ext: 'csv', mime: 'text/csv; charset=utf-8' },
  json: { ext: 'json', mime: 'application/json; charset=utf-8' },
  xml: { ext: 'xml', mime: 'application/xml; charset=utf-8' },
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
};

function safeName(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase();
}

// GET /api/export?format=csv|json|xml|xlsx&grupo=&nivel=&nombre=
router.get('/', (req, res) => {
  const format = String(req.query.format || 'csv').toLowerCase();
  if (!FORMATS[format]) {
    return res
      .status(400)
      .json({ error: `Formato no soportado: "${format}". Usa csv, json, xml o xlsx.` });
  }

  const { grupo, nivel, nombre } = req.query;
  let students = db.getStudents();
  if (grupo) students = students.filter((s) => s.grupo === grupo);
  if (nivel) students = students.filter((s) => s.nivel === nivel);
  if (nombre) {
    const q = String(nombre).toLowerCase();
    students = students.filter((s) => String(s.nombre || '').toLowerCase().includes(q));
  }

  if (students.length === 0) {
    return res.status(404).json({ error: 'No hay alumnos para esos filtros' });
  }

  const competencias = db.getCompetencias();
  const stamp = new Date().toISOString().slice(0, 10);
  const parts = ['alumnos', grupo || 'todos', nivel || '', stamp].filter(Boolean);
  const filename = `${parts.join('_')}.${FORMATS[format].ext}`;

  let payload;
  if (format === 'csv') payload = toCSV(buildRows(students, competencias));
  else if (format === 'json') payload = toJSON(students);
  else if (format === 'xml') payload = toXML(students, competencias);
  else payload = toXLSX(buildRows(students, competencias));

  res.setHeader('Content-Type', FORMATS[format].mime);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(payload);
});

module.exports = router;
