// Constantes compartidas por backend (sin dependencias: evita ciclos de imports).

const LEVELS = ['B', 'I', 'A']; // Básico, Intermedio, Avanzado
const LEVEL_LABEL = { B: 'Básico', I: 'Intermedio', A: 'Avanzado' };

module.exports = { LEVELS, LEVEL_LABEL };
