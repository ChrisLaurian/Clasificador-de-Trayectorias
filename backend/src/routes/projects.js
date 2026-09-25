const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { syncStudentCompetencias } = require('../services/classifier');

const CODE_RE = /^[A-Za-z0-9]{1,12}$/;

// GET /api/projects -> catálogo completo { grupos, competencias, proyectos }
router.get('/', (req, res) => {
  res.json(db.getCatalog());
});

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
    if (p.contenido !== undefined && (typeof p.contenido !== 'object' || p.contenido === null || Array.isArray(p.contenido))) {
      return 'El contenido de un proyecto debe ser un objeto';
    }
  }
  return null;
}

// PUT /api/projects -> guarda el catálogo completo { grupos, competencias, proyectos }
router.put('/', (req, res) => {
  const body = req.body || {};
  const esArreglo = Array.isArray(body); // compatibilidad con el formato antiguo
  const grupos = esArreglo ? undefined : body.grupos;
  const competencias = esArreglo ? undefined : body.competencias;
  const proyectos = esArreglo ? body : body.proyectos;

  const actual = db.getCatalog();
  const nextGrupos = grupos || actual.grupos;
  const nextCompetencias = competencias || actual.competencias;
  const nextProyectos = proyectos || actual.proyectos;

  const error =
    validateGrupos(nextGrupos) ||
    validateCompetencias(nextCompetencias) ||
    validateProyectos(nextProyectos, nextGrupos);
  if (error) return res.status(400).json({ error });

  // Bloquea la eliminación de un grupo que todavía tiene alumnos.
  const codigos = new Set(nextGrupos.map((g) => g.codigo));
  const students = db.getStudents();
  const huerfanos = students.filter((s) => !codigos.has(s.grupo));
  if (huerfanos.length) {
    const gruposPeligro = [...new Set(huerfanos.map((s) => s.grupo))].join(', ');
    return res.status(409).json({
      error: `No se puede eliminar el grupo ${gruposPeligro}: tiene ${huerfanos.length} alumno(s). Muévelos o elimínalos primero.`,
    });
  }

  const catalog = db.saveCatalog({ grupos: nextGrupos, competencias: nextCompetencias, proyectos: nextProyectos });

  // Sincroniza los snapshots de los alumnos con la lista de competencias.
  const proyectosSync = catalog.proyectos;
  const studentsSync = students.map((s) =>
    syncStudentCompetencias(s, catalog.competencias, proyectosSync)
  );
  if (JSON.stringify(studentsSync) !== JSON.stringify(students)) {
    db.saveStudents(studentsSync);
  }

  res.json(catalog);
});

module.exports = router;
