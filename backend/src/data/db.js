// db.js
// Único punto de acceso a los datos.
//
// Dos drivers con la MISMA interfaz asíncrona:
//   - KV (Vercel KV / Upstash): en producción (Vercel) — JSON completo por clave.
//   - Archivos JSON locales: en desarrollo (`npm run dev` en backend/).
//
// Migrar a SQLite/PostgreSQL sigue implicando reescribir solo este archivo.

const fs = require('fs');
const path = require('path');
const { LEVELS, LEVEL_LABEL } = require('../constants');
const { kvAvailable, kvGet, kvSet } = require('./kvClient');

const DATA_DIR = __dirname;
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

const CATALOG_KEY = 'clasificador:catalog:v1';
const STUDENTS_KEY = 'clasificador:students:v1';

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

// --- Helpers de normalización del catálogo -------------------------------------

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

// --- Almacenamiento (KV o archivos locales) ------------------------------------

const useKV = () => kvAvailable();

function readJSONFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw || !raw.trim()) return null;
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`No se pudo leer ${path.basename(filePath)}: ${err.message}`);
  }
}

function writeJSONFile(filePath, data) {
  // Escritura atómica (tmp + rename) para no corromper el archivo local.
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

async function readRawCatalog() {
  if (useKV()) return kvGet(CATALOG_KEY);
  return readJSONFile(PROJECTS_FILE);
}

async function writeRawCatalog(data) {
  if (useKV()) return kvSet(CATALOG_KEY, data);
  writeJSONFile(PROJECTS_FILE, data);
}

async function readRawStudents() {
  if (useKV()) return kvGet(STUDENTS_KEY);
  return readJSONFile(STUDENTS_FILE);
}

async function writeRawStudents(data) {
  if (useKV()) return kvSet(STUDENTS_KEY, data);
  writeJSONFile(STUDENTS_FILE, data);
}

// Semilla: en KV arrancamos con los archivos JSON empaquetados (tus datos actuales).
async function seedStudents() {
  return readJSONFile(STUDENTS_FILE) || [];
}

async function loadCatalog() {
  let raw = await readRawCatalog();
  let sembrado = false;
  // Semilla: si el almacén está vacío (KV recién creado) usamos los JSON empaquetados.
  if (raw === null || raw === undefined) {
    raw = readJSONFile(PROJECTS_FILE);
    sembrado = true;
  }
  if (raw === null || raw === undefined) {
    raw = buildDefaultCatalog();
    sembrado = true;
  }

  const { catalog, dirty } = normalizeCatalog(raw);
  if (dirty || sembrado) await writeRawCatalog(catalog);
  return catalog;
}

async function loadStudents() {
  let raw = await readRawStudents();
  if (raw === null || raw === undefined) {
    raw = await seedStudents();
    if (useKV()) await writeRawStudents(raw); // persiste la semilla en KV
    return raw;
  }
  return Array.isArray(raw) ? raw : [];
}

// Inicialización única por proceso: siembra KV si hace falta y sincroniza los
// snapshots de alumnos creados antes de existir las competencias.
let initPromise = null;
function initOnce() {
  if (!initPromise) {
    initPromise = (async () => {
      const catalog = await loadCatalog();
      const students = await loadStudents();

      const incompletos = students.some(
        (s) => !s.proyectoAsignado || !s.proyectoAsignado.competencias
      );
      if (incompletos) {
        const { syncStudentCompetencias } = require('../services/classifier');
        const sincronizados = students.map((s) =>
          syncStudentCompetencias(s, catalog.competencias, catalog.proyectos)
        );
        await writeRawStudents(sincronizados);
      }
    })().catch((err) => {
      initPromise = null; // reintenta en la siguiente petición
      throw err;
    });
  }
  return initPromise;
}

module.exports = {
  LEVELS,
  LEVEL_LABEL,
  DEFAULT_GRUPOS,
  CORE_COMPETENCIAS,
  emptyContenido,
  isKV: useKV,
  initOnce,

  getCatalog: () => loadCatalog(),

  saveCatalog: async ({ grupos, competencias, proyectos }) => {
    const actual = await loadCatalog();
    const next = normalizeCatalog({
      grupos: grupos || actual.grupos,
      competencias: competencias || actual.competencias,
      proyectos: proyectos || actual.proyectos,
    }).catalog;
    await writeRawCatalog(next);
    return next;
  },

  getStudents: () => loadStudents(),
  saveStudents: async (data) => writeRawStudents(Array.isArray(data) ? data : []),
};
