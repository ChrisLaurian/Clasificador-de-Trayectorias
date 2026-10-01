const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const db = require('../data/db');
const asyncHandler = require('../asyncHandler');
const { classifyStudent } = require('../services/classifier');
const { bufferToText } = require('../services/catalogImporter');

// Límite de 4 MB: Vercel corta el cuerpo de la petición en ~4.5 MB, así que
// avisamos antes con un mensaje claro.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

// Encabezados esperados (tolerante a mayúsculas y acentos):
// nombre | grupo | nivel | diagnostico | intereses | fortalezas | areasMejora
const HEADER_KEYS = {
  nombre: ['nombre', 'nombre completo', 'alumno'],
  grupo: ['grupo'],
  nivel: ['nivel'],
  diagnostico: ['diagnostico', 'diagnóstico'],
  intereses: ['intereses'],
  fortalezas: ['fortalezas'],
  areasMejora: ['areasmejora', 'areas de mejora', 'áreas de mejora'],
};

// Busca la fila de encabezados en cualquier posición inicial (algunos
// archivos traen títulos como "GRUPO A1" antes de los encabezados).
function findHeaderRow(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const celdas = (aoa[i] || []).map((c) => String(c ?? '').trim().toLowerCase());
    if (celdas.some((c) => HEADER_KEYS.nombre.includes(c))) return i;
  }
  return -1;
}

function columnMap(headerRow) {
  const map = {};
  headerRow.forEach((celda, idx) => {
    const k = String(celda ?? '').trim().toLowerCase();
    if (!k) return;
    for (const [campo, opciones] of Object.entries(HEADER_KEYS)) {
      if (map[campo] === undefined && opciones.includes(k)) map[campo] = idx;
    }
  });
  return map;
}

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo supera el límite de 4 MB' });
      }
      return res.status(400).json({ error: `No se pudo recibir el archivo: ${err.message}` });
    }
    next();
  });
}

// POST /api/upload -> carga masiva + clasificación automática
router.post(
  '/',
  handleUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    let aoa;
    try {
      const esExcel = /\.(xlsx|xls)$/i.test(req.file.originalname || '') || req.file.buffer.slice(0, 2).toString() === 'PK';
      const workbook = esExcel
        ? XLSX.read(req.file.buffer, { type: 'buffer' })
        : XLSX.read(bufferToText(req.file.buffer), { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    } catch (err) {
      return res.status(400).json({ error: 'No se pudo leer el archivo. Verifica el formato (.xlsx, .xls, .csv).' });
    }

    if (!Array.isArray(aoa) || aoa.length === 0) {
      return res.status(400).json({ error: 'El archivo está vacío o no tiene filas con encabezados.' });
    }

    const headerIdx = findHeaderRow(aoa);
    if (headerIdx === -1) {
      return res
        .status(400)
        .json({ error: 'No se encontró la fila de encabezados: debe incluir la columna "nombre" (nombre, grupo, nivel).' });
    }
    const map = columnMap(aoa[headerIdx]);

    const catalog = await db.getCatalog(req.user.id);
    const existing = await db.getStudents(req.user.id);
    const gruposValidos = catalog.grupos.map((g) => g.codigo);
    const errores = [];
    const nuevos = [];

    for (let i = headerIdx + 1; i < aoa.length; i++) {
      const row = aoa[i] || [];
      const linea = i + 1;
      const val = (idx) => (idx === undefined ? '' : String(row[idx] ?? '').trim());
      const nombre = val(map.nombre);
      const grupo = val(map.grupo).toUpperCase();
      const nivelTxt = val(map.nivel);
      const nivel = nivelTxt.toUpperCase().charAt(0); // "Básico"/"basico" -> "B", "Intermeio" -> "I"
      const extra = {
        diagnostico: val(map.diagnostico),
        intereses: val(map.intereses),
        fortalezas: val(map.fortalezas),
        areasMejora: val(map.areasMejora),
      };

      if (!nombre && !grupo && !nivelTxt && !Object.values(extra).some(Boolean)) continue; // fila vacía
      if (!nombre) {
        errores.push({ fila: linea, motivo: 'Falta el nombre del alumno' });
        continue;
      }
      if (!grupo || !nivelTxt) {
        errores.push({ fila: linea, motivo: 'Faltan campos obligatorios (nombre, grupo o nivel)' });
        continue;
      }
      if (!gruposValidos.includes(grupo)) {
        errores.push({
          fila: linea,
          motivo: `Grupo inválido: "${grupo}". Grupos disponibles: ${gruposValidos.join(', ')}`,
        });
        continue;
      }
      if (!db.LEVELS.includes(nivel)) {
        errores.push({ fila: linea, motivo: `Nivel inválido: "${nivelTxt}" (usa B, I o A)` });
        continue;
      }

      const student = classifyStudent({ id: uuidv4(), nombre, grupo, nivel, ...extra }, catalog);
      nuevos.push(student);
    }

    const students = [...existing, ...nuevos];
    await db.saveStudents(req.user.id, students);

    res.json({
      insertados: nuevos.length,
      conErrores: errores.length,
      errores,
      alumnos: nuevos,
    });
  })
);

module.exports = router;
