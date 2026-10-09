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
// | estiloAprendizaje | materia (opcional)
const HEADER_KEYS = {
  nombre: ['nombre', 'nombre completo', 'alumno'],
  grupo: ['grupo'],
  nivel: ['nivel'],
  diagnostico: ['diagnostico', 'diagnóstico'],
  intereses: ['intereses'],
  fortalezas: ['fortalezas'],
  areasMejora: ['areasmejora', 'areas de mejora', 'áreas de mejora'],
  estiloAprendizaje: ['estilo', 'estilo de aprendizaje', 'estiloaprendizaje'],
  materia: ['materia'],
};

// Busca la fila de encabezados en cualquier posición inicial (algunos
// archivos traen títulos como "GRUPO A1" antes de los encabezados).
// Si el archivo no trae columna "nombre", se acepta con "grupo" y "nivel"
// (el nombre del alumno se toma del nombre del archivo).
function findHeaderRow(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const celdas = (aoa[i] || []).map((c) => String(c ?? '').trim().toLowerCase());
    if (celdas.some((c) => HEADER_KEYS.nombre.includes(c))) return i;
    if (celdas.includes('grupo') && celdas.includes('nivel')) return i;
  }
  return -1;
}

// Nombre del alumno a partir del nombre del archivo (sin extensión).
function nombreDeArchivo(originalname) {
  let n = String(originalname || '').replace(/\.[^.]+$/, '').trim();
  // multer puede decodificar el nombre como latin1: se recupera UTF-8.
  if (/[ÃÂ]/.test(n)) {
    const utf8 = Buffer.from(n, 'latin1').toString('utf8');
    if (!utf8.includes('�')) n = utf8.trim();
  }
  return n;
}

const normNombre = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();

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
        .json({ error: 'No se encontró la fila de encabezados: debe incluir las columnas "nombre", "grupo" y "nivel".' });
    }
    const map = columnMap(aoa[headerIdx]);
    const nombreArchivo = nombreDeArchivo(req.file.originalname);
    // Solo se usa el nombre del archivo si el archivo NO trae columna "nombre"
    // (y admite una sola fila: un alumno por archivo).
    const usaNombreArchivo = map.nombre === undefined && Boolean(nombreArchivo);
    let filasPorArchivo = 0;

    const catalog = await db.getCatalog(req.user.id);
    const alumnos = await db.getStudents(req.user.id); // copia de trabajo (inserta o actualiza)
    const gruposValidos = catalog.grupos.map((g) => g.codigo);
    const errores = [];
    const nuevos = [];
    let actualizados = 0;

    for (let i = headerIdx + 1; i < aoa.length; i++) {
      const row = aoa[i] || [];
      const linea = i + 1;
      const val = (idx) => (idx === undefined ? '' : String(row[idx] ?? '').trim());
      const nombreFila = val(map.nombre);
      const grupo = val(map.grupo).toUpperCase();
      const nivelTxt = val(map.nivel);
      const materiaFila = val(map.materia);
      const extra = {
        diagnostico: val(map.diagnostico),
        intereses: val(map.intereses),
        fortalezas: val(map.fortalezas),
        areasMejora: val(map.areasMejora),
        estiloAprendizaje: val(map.estiloAprendizaje),
      };

      if (
        !nombreFila &&
        !grupo &&
        !nivelTxt &&
        !materiaFila &&
        !Object.values(extra).some(Boolean)
      ) {
        continue; // fila vacía
      }

      let nombre = nombreFila;
      if (!nombre && usaNombreArchivo) {
        if (filasPorArchivo > 0) {
          errores.push({
            fila: linea,
            motivo:
              'El archivo no trae columna "nombre": solo se admite una fila por archivo (el nombre se toma del nombre del archivo)',
          });
          continue;
        }
        nombre = nombreArchivo;
        filasPorArchivo += 1;
      }
      if (!nombre) {
        errores.push({ fila: linea, motivo: 'Falta el nombre del alumno' });
        continue;
      }

      // Si el alumno ya existe (mismo nombre), se actualiza en lugar de duplicar.
      const previo = alumnos.find((s) => normNombre(s.nombre) === normNombre(nombre));
      const grupoFinal = grupo || (previo ? previo.grupo : '');
      const nivelFinal = nivelTxt
        ? nivelTxt.toUpperCase().charAt(0) // "Básico"/"basico" -> "B", "Intermeio" -> "I"
        : previo
          ? previo.nivel
          : '';

      if (!grupoFinal || !nivelFinal) {
        errores.push({ fila: linea, motivo: 'Faltan campos obligatorios (nombre, grupo o nivel)' });
        continue;
      }
      if (!gruposValidos.includes(grupoFinal)) {
        errores.push({
          fila: linea,
          motivo: `Grupo inválido: "${grupoFinal}". Grupos disponibles: ${gruposValidos.join(', ')}`,
        });
        continue;
      }
      if (!db.LEVELS.includes(nivelFinal)) {
        errores.push({ fila: linea, motivo: `Nivel inválido: "${nivelTxt || nivelFinal}" (usa B, I o A)` });
        continue;
      }

      const base = {
        id: previo ? previo.id : uuidv4(),
        nombre,
        grupo: grupoFinal,
        nivel: nivelFinal,
        diagnostico: extra.diagnostico || (previo ? previo.diagnostico : ''),
        intereses: extra.intereses || (previo ? previo.intereses : ''),
        fortalezas: extra.fortalezas || (previo ? previo.fortalezas : ''),
        areasMejora: extra.areasMejora || (previo ? previo.areasMejora : ''),
        estiloAprendizaje: extra.estiloAprendizaje || (previo ? previo.estiloAprendizaje : ''),
      };
      const reubicado = Boolean(previo) && (grupoFinal !== previo.grupo || nivelFinal !== previo.nivel);
      if (previo && !reubicado) base.proyectoAsignado = previo.proyectoAsignado;

      let student = classifyStudent(base, catalog);
      const snap = student.proyectoAsignado;
      const materiaPrevia = (previo && previo.proyectoAsignado && previo.proyectoAsignado.materia) || '';
      const snapEdit = (previo && !reubicado && previo.proyectoAsignado) || {};

      // Materia: si la fila ya trae texto se conserva; si no, la que ya tenía
      // el alumno o la de la celda; solo si no hay texto alguno se añade el
      // respaldo del usuario (materiaDefault) o CODE.
      const materiaFinal =
        materiaFila || materiaPrevia || snap.materia || catalog.materiaDefault || 'CODE';
      student = {
        ...student,
        proyectoAsignado: {
          ...snap,
          materia: materiaFinal,
          // Al conservar la ubicación se respetan las ediciones individuales;
          // al reubicar el snapshot se reconstruye desde la celda nueva.
          dominioDisciplinar: snapEdit.dominioDisciplinar || snap.dominioDisciplinar,
          metaGeneral: snapEdit.metaGeneral || snap.metaGeneral,
          competencias:
            snapEdit.competencias && Object.keys(snapEdit.competencias).length
              ? snapEdit.competencias
              : snap.competencias,
        },
      };

      if (previo) {
        alumnos[alumnos.findIndex((s) => s.id === previo.id)] = student;
        actualizados += 1;
      } else {
        alumnos.push(student);
        nuevos.push(student);
      }
    }

    await db.saveStudents(req.user.id, alumnos);

    res.json({
      insertados: nuevos.length,
      actualizados,
      conErrores: errores.length,
      errores,
      alumnos: nuevos,
    });
  })
);

module.exports = router;
