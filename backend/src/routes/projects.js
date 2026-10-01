const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../data/db');
const asyncHandler = require('../asyncHandler');
const { syncStudentCompetencias } = require('../services/classifier');
const catalogImporter = require('../services/catalogImporter');

const CODE_RE = /^[A-Za-z0-9]{1,12}$/;

// Límite de 4 MB (Vercel corta en ~4.5 MB).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } });

function handleImportUpload(req, res, next) {
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

// GET /api/projects -> catálogo completo { grupos, competencias, proyectos }
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await db.getCatalog(req.user.id));
  })
);

function validateGrupos(grupos) {
  if (!Array.isArray(grupos) || grupos.length === 0) {
    return 'Debe existir al menos un grupo';
  }
  const codes = grupos.map((g) => String(g.codigo || '').trim().toUpperCase());
  if (codes.some((c) => !c)) return 'Todos los grupos deben tener un código';
  if (new Set(codes).size !== codes.length) return 'Hay códigos de grupo duplicados';
  if (codes.some((c) => !CODE_RE.test(c))) {
    return 'Código de grupo inválido: usa solo letras y números (máx. 12), p. ej. A1, A2, B3';
  }
  for (const g of grupos) {
    if (g.edad !== null && g.edad !== undefined && g.edad !== '') {
      const edad = Number(g.edad);
      if (!Number.isFinite(edad) || edad < 0 || edad > 100) {
        return `Edad inválida para el grupo ${g.codigo}`;
      }
    }
  }
  return null;
}

function validateCompetencias(competencias) {
  if (!Array.isArray(competencias) || competencias.length === 0) {
    return 'Debe haber al menos una competencia';
  }
  const ids = competencias.map((c) => String(c.id || '').trim());
  if (ids.some((id) => !id)) return 'Todas las competencias deben tener un id';
  if (new Set(ids).size !== ids.length) return 'Hay competencias con id duplicado';
  if (competencias.some((c) => !String(c.nombre || '').trim())) {
    return 'Todas las competencias deben tener nombre';
  }
  const faltantes = db.CORE_COMPETENCIAS.filter(
    (core) => !competencias.some((c) => c.id === core.id)
  );
  if (faltantes.length) {
    return `No se pueden eliminar las competencias obligatorias: ${faltantes
      .map((c) => c.nombre)
      .join(', ')}`;
  }
  return null;
}

function validateProyectos(proyectos, grupos) {
  if (!Array.isArray(proyectos)) return 'Se esperaba una lista de proyectos';
  const codes = new Set(grupos.map((g) => g.codigo));
  for (const p of proyectos) {
    if (!codes.has(p.grupo)) return `Proyecto con grupo desconocido: "${p.grupo}"`;
    if (!db.LEVELS.includes(p.nivel)) return `Proyecto con nivel inválido: "${p.nivel}"`;
    if (
      p.contenido !== undefined &&
      (typeof p.contenido !== 'object' || p.contenido === null || Array.isArray(p.contenido))
    ) {
      return 'El contenido de un proyecto debe ser un objeto';
    }
  }
  return null;
}

// PUT /api/projects -> guarda el catálogo completo { grupos, competencias, proyectos }
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const esArreglo = Array.isArray(body); // compatibilidad con el formato antiguo
    const actual = await db.getCatalog(req.user.id);

    const nextGrupos = esArreglo ? actual.grupos : body.grupos || actual.grupos;
    const nextCompetencias = esArreglo ? actual.competencias : body.competencias || actual.competencias;
    const nextProyectos = esArreglo ? body : body.proyectos || actual.proyectos;

    const error =
      validateGrupos(nextGrupos) ||
      validateCompetencias(nextCompetencias) ||
      validateProyectos(nextProyectos, nextGrupos);
    if (error) return res.status(400).json({ error });

    // Bloquea la eliminación de un grupo que todavía tiene alumnos.
    const codigos = new Set(nextGrupos.map((g) => g.codigo));
    const students = await db.getStudents(req.user.id);
    const huerfanos = students.filter((s) => !codigos.has(s.grupo));
    if (huerfanos.length) {
      const gruposPeligro = [...new Set(huerfanos.map((s) => s.grupo))].join(', ');
      return res.status(409).json({
        error: `No se puede eliminar el grupo ${gruposPeligro}: tiene ${huerfanos.length} alumno(s). Muévelos o elimínalos primero.`,
      });
    }

    const catalog = await db.saveCatalog(req.user.id, {
      grupos: nextGrupos,
      competencias: nextCompetencias,
      proyectos: nextProyectos,
    });

    // Sincroniza los snapshots de los alumnos con la lista de competencias.
    const studentsSync = students.map((s) =>
      syncStudentCompetencias(s, catalog.competencias, catalog.proyectos)
    );
    if (JSON.stringify(studentsSync) !== JSON.stringify(students)) {
      await db.saveStudents(req.user.id, studentsSync);
    }

    res.json(catalog);
  })
);

// POST /api/projects/import -> importa contenido desde CSV/Excel
// Archivo (columnas detectadas: Nivel, Competencia, Diagnóstico, Trimestre 1-3,
// Meta General y opcionalmente Grupo) + grupos destino ("B1,B2" o columna "Grupo").
router.post(
  '/import',
  handleImportUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const gruposDestino = String(req.body?.grupos || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    let parsed;
    try {
      parsed = catalogImporter.parseFile(req.file.buffer, req.file.originalname || '');
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    if (!parsed.filas.length) {
      return res.status(400).json({ error: 'El archivo no contiene filas válidas con Nivel y Competencia' });
    }
    const usaColumnaGrupo = parsed.filas.some((f) => f.grupo);
    if (!usaColumnaGrupo && !gruposDestino.length) {
      return res.status(400).json({ error: 'Selecciona al menos un grupo destino' });
    }

    const actual = await db.getCatalog(req.user.id);
    const codigos = new Set(actual.grupos.map((g) => g.codigo));
    const faltan = gruposDestino.filter((g) => !codigos.has(g));
    if (faltan.length) {
      return res.status(400).json({ error: `Grupos inexistentes: ${faltan.join(', ')}` });
    }

    const catalog = JSON.parse(JSON.stringify(actual));
    const resumen = catalogImporter.applyToCatalog(catalog, parsed.filas, gruposDestino);
    if (!resumen.celdas) {
      return res.status(400).json({
        error: 'No se escribió ninguna celda: revisa que los grupos/niveles del archivo existan en el catálogo',
      });
    }

    const guardado = await db.saveCatalog(req.user.id, catalog);

    // Sincroniza competencias nuevas con los alumnos (igual que el PUT).
    const students = await db.getStudents(req.user.id);
    const studentsSync = students.map((s) =>
      syncStudentCompetencias(s, guardado.competencias, guardado.proyectos)
    );
    if (JSON.stringify(studentsSync) !== JSON.stringify(students)) {
      await db.saveStudents(req.user.id, studentsSync);
    }

    res.json({
      ...resumen,
      descartadas: parsed.descartadas + resumen.descartadas,
      columnas: parsed.columnas,
      catalog: guardado,
    });
  })
);

module.exports = router;
