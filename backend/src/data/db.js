// db.js
// Persistencia simple en archivos JSON (fácil de migrar a SQLite/PostgreSQL después).
// Se eligió este enfoque por simplicidad, tal como pide el alcance del proyecto.

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F'];
const LEVELS = ['B', 'I', 'A']; // Básico, Intermedio, Avanzado

// Edad aproximada por grupo (A = 1° Primaria ~6 años, F ~15 años)
const GROUP_AGE_MAP = {
  A: 6,
  B: 8,
  C: 10,
  D: 12,
  E: 13,
  F: 15,
};

function ensureFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
  }
}

function buildDefaultProjects() {
  // Crea la matriz Grupo x Nivel vacía por defecto (6 grupos x 3 niveles = 18 filas)
  const projects = [];
  GROUPS.forEach((grupo) => {
    LEVELS.forEach((nivel) => {
      projects.push({
        id: `${grupo}-${nivel}`,
        grupo,
        nivel,
        materia: '',
        dominioDisciplinar: '',
        trimestre1: '',
        trimestre2: '',
        trimestre3: '',
        metaGeneral: '',
      });
    });
  });
  return projects;
}

ensureFile(STUDENTS_FILE, []);
ensureFile(PROJECTS_FILE, buildDefaultProjects());

function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw || '[]');
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = {
  GROUPS,
  LEVELS,
  GROUP_AGE_MAP,
  getStudents: () => readJSON(STUDENTS_FILE),
  saveStudents: (data) => writeJSON(STUDENTS_FILE, data),
  getProjects: () => readJSON(PROJECTS_FILE),
  saveProjects: (data) => writeJSON(PROJECTS_FILE, data),
};
