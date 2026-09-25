// db.js
// Persistencia simple en archivos JSON (fácil de migrar a SQLite/PostgreSQL después).
// Se eligió este enfoque por simplicidad, tal como pide el alcance del proyecto.

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

const LEVELS = ['B', 'I', 'A']; // Básico, Intermedio, Avanzado
const LEVEL_LABEL = { B: 'Básico', I: 'Intermedio', A: 'Avanzado' };

// Grupos por defecto (se pueden añadir/editar/eliminar desde el frontend:
// p. ej. subgrupos A1, A2, A3 dentro del grupo principal A).
const DEFAULT_GRUPOS = [
  { codigo: 'A', etiqueta: 'A · 1° Primaria', edad: 6 },
  { codigo: 'B', etiqueta: '', edad: 8 },
  { codigo: 'C', etiqueta: '', edad: 10 },
  { codigo: 'D', etiqueta: '', edad: 12 },
  { codigo: 'E', etiqueta: '', edad: 13 },
  { codigo: 'F', etiqueta: 'F · ~15 años', edad: 15 },
];

// Competencias obligatorias (si o si deben existir; no se pueden eliminar).
const CORE_COMPETENCIAS = [
  { id: 'abstraccion', nombre: 'Abstracción', core: true },
  { id: 'pensamiento_logico', nombre: 'Pensamiento lógico-matemático', core: true },
  { id: 'pensamiento_computacional', nombre: 'Pensamiento computacional', core: true },
  { id: 'implementacion_tecnica', nombre: 'Implementación técnica', core: true },
  { id: 'competencias_digitales', nombre: 'Competencias digitales', core: true },
];

function emptyContenido() {
  return { perfil: '', trimestre1: '', trimestre2: '', trimestre3: '', metaGeneral: '' };
}

function emptyProyecto(grupo, nivel) {
  return {
    id: `${grupo}-${nivel}`,
    grupo,
    nivel,
    materia: '',
    dominioDisciplinar: '',
    metaGeneral: '',
    contenido: {},
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    writeJSON(filePath, defaultData);
  }
}

function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw || '[]');
}

function writeJSON(filePath, data) {
  // Escritura atómica (tmp + rename) para no corromper el archivo si el
  // proceso muere a mitad de escritura.
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

// --- Normalización del catálogo -------------------------------------------------

function ensureContenido(proyecto, competencias) {
  if (!proyecto.contenido || typeof proyecto.contenido !== 'object') {
    proyecto.contenido = {};
  }
  competencias.forEach((c) => {
    if (!proyecto.contenido[c.id]) proyecto.contenido[c.id] = emptyContenido();
  });
  return proyecto;
}

// Convierte el formato antiguo (arreglo plano de celdas) al nuevo
// { grupos, competencias, proyectos }. Conserva los campos legacy
// (trimestre1..3, metaGeneral) por si se necesita recuperarlos.
function migrateLegacyCatalog(lista) {
  const grupos = [];
  const vistos = new Set();
  lista.forEach((p) => {
    if (p.grupo && !vistos.has(p.grupo)) {
      vistos.add(p.grupo);
      const def = DEFAULT_GRUPOS.find((g) => g.codigo === p.grupo);
      grupos.push({
        codigo: p.grupo,
        etiqueta: def ? def.etiqueta : '',
        edad: def ? def.edad : null,
      });
    }
  });
  return {
    grupos: grupos.length ? grupos : clone(DEFAULT_GRUPOS),
    competencias: clone(CORE_COMPETENCIAS),
    proyectos: lista.map((p) => ({ ...p, contenido: {} })),
  };
}

function normalizeCatalog(raw) {
  let dirty = false;

  if (Array.isArray(raw)) {
    raw = migrateLegacyCatalog(raw);
    dirty = true;
  }
  if (!raw || typeof raw !== 'object') raw = {};

  if (!Array.isArray(raw.grupos) || raw.grupos.length === 0) {
    raw.grupos = clone(DEFAULT_GRUPOS);
    dirty = true;
  }
  raw.grupos = raw.grupos.map((g) => ({
    codigo: String(g.codigo || '').trim().toUpperCase(),
    etiqueta: String(g.etiqueta || ''),
    edad: g.edad === null || g.edad === undefined || g.edad === '' ? null : Number(g.edad),
  }));

  if (!Array.isArray(raw.competencias) || raw.competencias.length === 0) {
    raw.competencias = clone(CORE_COMPETENCIAS);
    dirty = true;
  }
  // Las competencias obligatorias siempre están presentes.
  CORE_COMPETENCIAS.forEach((core) => {
    if (!raw.competencias.some((c) => c.id === core.id)) {
      raw.competencias.unshift(clone(core));
      dirty = true;
    }
  });

  if (!Array.isArray(raw.proyectos)) {
    raw.proyectos = [];
    dirty = true;
  }

  const codigos = new Set(raw.grupos.map((g) => g.codigo));
  const antes = raw.proyectos.length;
  raw.proyectos = raw.proyectos.filter(
    (p) => codigos.has(p.grupo) && LEVELS.includes(p.nivel)
  );
  if (raw.proyectos.length !== antes) dirty = true;

  // Completa las celdas Grupo x Nivel que falten.
  raw.grupos.forEach((g) => {
    LEVELS.forEach((nivel) => {
      const existe = raw.proyectos.find((p) => p.grupo === g.codigo && p.nivel === nivel);
      if (!existe) {
        raw.proyectos.push(emptyProyecto(g.codigo, nivel));
        dirty = true;
      }
    });
  });

  raw.proyectos.forEach((p) => {
    if (!p.contenido || typeof p.contenido !== 'object') dirty = true;
    ensureContenido(p, raw.competencias);
  });

  return { catalog: raw, dirty };
}

function buildDefaultCatalog() {
  return { grupos: clone(DEFAULT_GRUPOS), competencias: clone(CORE_COMPETENCIAS), proyectos: [] };
}

function loadCatalog() {
  let raw;
  try {
    raw = readJSON(PROJECTS_FILE);
  } catch (err) {
    throw new Error(`No se pudo leer el catálogo (projects.json): ${err.message}`);
  }
  const { catalog, dirty } = normalizeCatalog(raw);
  if (dirty) writeJSON(PROJECTS_FILE, catalog);
  return catalog;
}

ensureFile(STUDENTS_FILE, []);
ensureFile(PROJECTS_FILE, buildDefaultCatalog());

const catalog = loadCatalog();

module.exports = {
  LEVELS,
  LEVEL_LABEL,
  DEFAULT_GRUPOS,
  CORE_COMPETENCIAS,
  getCatalog: () => catalog,
  getGrupos: () => catalog.grupos,
  getCompetencias: () => catalog.competencias,
  getProjects: () => catalog.proyectos,
  getStudents: () => {
    const students = readJSON(STUDENTS_FILE);
    return Array.isArray(students) ? students : [];
  },
  saveStudents: (data) => writeJSON(STUDENTS_FILE, data),
  saveCatalog: ({ grupos, competencias, proyectos }) => {
    const next = normalizeCatalog({
      grupos: grupos || catalog.grupos,
      competencias: competencias || catalog.competencias,
      proyectos: proyectos || catalog.proyectos,
    }).catalog;
    writeJSON(PROJECTS_FILE, next);
    // Actualiza el catálogo en memoria (mismo objeto vivo).
    catalog.grupos = next.grupos;
    catalog.competencias = next.competencias;
    catalog.proyectos = next.proyectos;
    return catalog;
  },
};
