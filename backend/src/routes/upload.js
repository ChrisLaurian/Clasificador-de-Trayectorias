const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const db = require('../data/db');
const { classifyStudent } = require('../services/classifier');

const upload = multer({ storage: multer.memoryStorage() });

// Normaliza encabezados esperados en el Excel/CSV:
// nombre | grupo | nivel | diagnostico | intereses | fortalezas | areasMejora
function normalizeRow(row) {
  const get = (...keys) => {
    for (const k of keys) {
      const found = Object.keys(row).find(
        (rk) => rk.trim().toLowerCase() === k.toLowerCase()
      );
      if (found) return String(row[found] ?? '').trim();
    }
    return '';
  };

  return {
    nombre: get('nombre', 'nombre completo', 'alumno'),
    grupo: get('grupo').toUpperCase(),
    nivel: get('nivel').toUpperCase().charAt(0), // admite "Básico" -> "B", "Intermedio" -> "I", etc.
    diagnostico: get('diagnostico', 'diagnóstico'),
    intereses: get('intereses'),
    fortalezas: get('fortalezas'),
    areasMejora: get('areasmejora', 'areas de mejora', 'áreas de mejora'),
  };
}

// POST /api/upload -> carga masiva + clasificación automática
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

  let rows;
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch (err) {
    return res.status(400).json({ error: 'No se pudo leer el archivo. Verifica el formato (.xlsx, .xls, .csv).' });
  }

  const projects = db.getProjects();
  const existing = db.getStudents();
  const errores = [];
  const nuevos = [];

  rows.forEach((raw, index) => {
    const normalized = normalizeRow(raw);

    if (!normalized.nombre || !normalized.grupo || !normalized.nivel) {
      errores.push({ fila: index + 2, motivo: 'Faltan campos obligatorios (nombre, grupo o nivel)' });
      return;
    }
    if (!db.GROUPS.includes(normalized.grupo)) {
      errores.push({ fila: index + 2, motivo: `Grupo inválido: "${normalized.grupo}"` });
      return;
    }
    if (!db.LEVELS.includes(normalized.nivel)) {
      errores.push({ fila: index + 2, motivo: `Nivel inválido: "${normalized.nivel}"` });
      return;
    }

    const student = classifyStudent({ id: uuidv4(), ...normalized }, projects);
    nuevos.push(student);
  });

  const students = [...existing, ...nuevos];
  db.saveStudents(students);

  res.json({
    insertados: nuevos.length,
    conErrores: errores.length,
    errores,
    alumnos: nuevos,
  });
});

module.exports = router;
