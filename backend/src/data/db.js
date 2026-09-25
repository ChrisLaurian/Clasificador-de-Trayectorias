// db.js
// Único punto de acceso a los datos: usuarios, sesiones y los datos de
// CADA usuario (catálogo propio + lista propia de alumnos).
//
// Dos drivers con la MISMA interfaz asíncrona:
//   - KV (Vercel KV / Upstash): en producción (Vercel) — JSON completo por clave.
//   - Archivos JSON locales: en desarrollo (`npm run dev` en backend/).
//     DATA_DIR permite redirigir los archivos (usado por los tests).
//
// Semillas (solo lectura): students.json y projects.json. El primer usuario
// registrado hereda los alumnos de students.json; todos los usuarios nuevos
// arrancan con una copia del catálogo de projects.json.

const fs = require('fs');
const path = require('path');
const { LEVELS, LEVEL_LABEL } = require('../constants');
const { kvAvailable, kvGet, kvSet, kvDel } = require('./kvClient');
const { syncStudentCompetencias } = require('../services/classifier');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const SEED_STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const SEED_PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const USERS_KEY = 'clasificador:users:v1';
const sessionKey = (t) => `clasificador:session:${t}`;
const catalogKey = (uid) => `clasificador:catalog:${uid}`;
const studentsKey = (uid) => `clasificador:students:${uid}`;

const userCatalogFile = (uid) => path.join(DATA_DIR, `catalog.${uid}.json`);
const userStudentsFile = (uid) => path.join(DATA_DIR, `students.${uid}.json`);

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 días

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

// --- Almacenamiento genérico (KV o archivos locales) -----------------------------

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
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // En Vercel el filesystem es de solo lectura: si no hay KV, avisar claro.
    if (err.code === 'EROFS' || err.code === 'EACCES' || err.code === 'EPERM') {
      const e = new Error(
        'El servidor no permite escribir archivos locales: falta el almacén KV. ' +
          'Crea y conecta el almacén KV en Vercel (Storage → KV) y vuelve a desplegar.'
      );
      e.status = 503;
      throw e;
    }
    throw err;
  }
}

async function readKV(key) {
  return kvGet(key);
}
async function writeKV(key, value, ttl) {
  return kvSet(key, value, ttl);
}

// --- Usuarios ---------------------------------------------------------------------

async function getUsersList() {
  if (useKV()) return (await readKV(USERS_KEY)) || [];
  return readJSONFile(USERS_FILE) || [];
}

async function saveUsersList(list) {
  if (useKV()) return writeKV(USERS_KEY, list);
  writeJSONFile(USERS_FILE, list);
}

async function findUser(username) {
  const lower = String(username || '').trim().toLowerCase();
  const list = await getUsersList();
  return list.find((u) => u.usernameLower === lower) || null;
}

async function getUser(id) {
  const list = await getUsersList();
  return list.find((u) => u.id === id) || null;
}

async function createUser(user) {
  const list = await getUsersList();
  const lower = String(user.username || '').trim().toLowerCase();
  if (list.some((u) => u.usernameLower === lower)) {
    const err = new Error('Ese nombre de usuario ya está en uso');
    err.status = 409;
    throw err;
  }
  const nuevo = { ...user, usernameLower: lower, esPrimero: list.length === 0 };
  list.push(nuevo);
  await saveUsersList(list);
  await seedUserData(nuevo);
  return nuevo;
}

// Copia las semillas empaquetadas a los archivos/claves del usuario nuevo.
async function seedUserData(user) {
  const bruto = readJSONFile(SEED_PROJECTS_FILE);
  const { catalog } = normalizeCatalog(bruto || buildDefaultCatalog());
  await writeUserCatalog(user.id, catalog);

  const alumnos = user.esPrimero ? readJSONFile(SEED_STUDENTS_FILE) || [] : [];
  const sincronizados = alumnos.map((s) =>
    syncStudentCompetencias(s, catalog.competencias, catalog.proyectos)
  );
  await writeUserStudents(user.id, sincronizados);
}

// --- Sesiones ---------------------------------------------------------------------

async function setSession(token, userId) {
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  if (useKV()) return writeKV(sessionKey(token), { userId, exp }, SESSION_TTL_SECONDS);
  const all = readJSONFile(SESSIONS_FILE) || {};
  const ahora = Date.now();
  Object.keys(all).forEach((t) => {
    if (all[t] && all[t].exp && all[t].exp < ahora) delete all[t];
  });
  all[token] = { userId, exp };
  writeJSONFile(SESSIONS_FILE, all);
}

async function getSession(token) {
  if (!token) return null;
  let rec;
  if (useKV()) rec = await readKV(sessionKey(token));
  else rec = (readJSONFile(SESSIONS_FILE) || {})[token] || null;
  if (!rec) return null;
  if (rec.exp && rec.exp < Date.now()) {
    await delSession(token);
    return null;
  }
  return rec;
}

async function delSession(token) {
  if (!token) return;
  if (useKV()) return kvDel(sessionKey(token));
  const all = readJSONFile(SESSIONS_FILE) || {};
  delete all[token];
  writeJSONFile(SESSIONS_FILE, all);
}

// --- Datos por usuario --------------------------------------------------------------

async function readUserCatalog(uid) {
  if (useKV()) return readKV(catalogKey(uid));
  return readJSONFile(userCatalogFile(uid));
}

async function writeUserCatalog(uid, data) {
  if (useKV()) return writeKV(catalogKey(uid), data);
  writeJSONFile(userCatalogFile(uid), data);
}

async function readUserStudents(uid) {
  if (useKV()) return readKV(studentsKey(uid));
  return readJSONFile(userStudentsFile(uid));
}

async function writeUserStudents(uid, data) {
  if (useKV()) return writeKV(studentsKey(uid), data);
  writeJSONFile(userStudentsFile(uid), data);
}

async function loadCatalog(uid) {
  let raw = await readUserCatalog(uid);
  if (raw === null || raw === undefined) raw = readJSONFile(SEED_PROJECTS_FILE);
  if (raw === null || raw === undefined) raw = buildDefaultCatalog();

  const { catalog, dirty } = normalizeCatalog(raw);
  if (dirty) await writeUserCatalog(uid, catalog);
  return catalog;
}

async function loadStudents(uid) {
  const raw = await readUserStudents(uid);
  return Array.isArray(raw) ? raw : [];
}

module.exports = {
  LEVELS,
  LEVEL_LABEL,
  DEFAULT_GRUPOS,
  CORE_COMPETENCIAS,
  emptyContenido,
  SESSION_TTL_SECONDS,
  isKV: useKV,

  // usuarios y sesiones
  findUser,
  getUser,
  createUser,
  setSession,
  getSession,
  delSession,

  // datos por usuario
  getCatalog: loadCatalog,
  saveCatalog: async (uid, { grupos, competencias, proyectos }) => {
    const actual = await loadCatalog(uid);
    const next = normalizeCatalog({
      grupos: grupos || actual.grupos,
      competencias: competencias || actual.competencias,
      proyectos: proyectos || actual.proyectos,
    }).catalog;
    await writeUserCatalog(uid, next);
    return next;
  },
  getStudents: loadStudents,
  saveStudents: async (uid, data) => writeUserStudents(uid, Array.isArray(data) ? data : []),
};
