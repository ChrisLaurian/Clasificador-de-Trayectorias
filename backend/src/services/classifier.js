const { LEVEL_LABEL } = require('../constants');

// Reemplaza plantillas dentro de los textos del catálogo al clasificar:
// {{nombre}}, {{grupo}}, {{nivel}}, {{edad}}
function applyTemplate(text, student) {
  if (typeof text !== 'string' || text.indexOf('{{') === -1) return text || '';
  return text
    .replace(/\{\{nombre\}\}/gi, student.nombre || '')
    .replace(/\{\{grupo\}\}/gi, student.grupo || '')
    .replace(/\{\{nivel\}\}/gi, LEVEL_LABEL[student.nivel] || student.nivel || '')
    .replace(/\{\{edad\}\}/gi, student.edad !== null && student.edad !== undefined ? String(student.edad) : '');
}

function buildCompetenciasSnapshot(match, student, competencias) {
  const contenido = (match && match.contenido) || {};
  const snapshot = {};
  competencias.forEach((c) => {
    const src = contenido[c.id] || {};
    snapshot[c.id] = {
      perfil: applyTemplate(src.perfil, student),
      trimestre1: applyTemplate(src.trimestre1, student),
      trimestre2: applyTemplate(src.trimestre2, student),
      trimestre3: applyTemplate(src.trimestre3, student),
      metaGeneral: applyTemplate(src.metaGeneral, student),
    };
  });
  return snapshot;
}

/**
 * Asocia a alumno el proyecto correspondiente según su Grupo y Nivel.
 * Guarda una copia (snapshot) del proyecto en `proyectoAsignado` para permitir
 * ediciones individuales sin alterar el catálogo maestro.
 *
 * @param student alumno a clasificar
 * @param catalog catálogo completo { grupos, competencias, proyectos }
 */
function classifyStudent(student, catalog) {
  const grupos = (catalog && catalog.grupos) || [];
  const competencias = (catalog && catalog.competencias) || [];
  const projects = (catalog && catalog.proyectos) || [];

  const grupoCfg = grupos.find((g) => g.codigo === student.grupo);
  const edad = grupoCfg ? grupoCfg.edad : null;

  const match = projects.find(
    (p) => p.grupo === student.grupo && p.nivel === student.nivel
  );

  const base = { materia: '', dominioDisciplinar: '', metaGeneral: '', contenido: {} };
  const src = match || base;

  return {
    ...student,
    edad,
    proyectoAsignado: {
      ...(student.proyectoAsignado || {}), // conserva campos legacy de versiones anteriores
      materia: src.materia || '',
      dominioDisciplinar: src.dominioDisciplinar || '',
      metaGeneral: src.metaGeneral || '',
      competencias: buildCompetenciasSnapshot(src, { ...student, edad }, competencias),
    },
    clasificado: Boolean(match),
  };
}

const CAMPOS_COMPETENCIA = ['perfil', 'trimestre1', 'trimestre2', 'trimestre3', 'metaGeneral'];

/**
 * Sincroniza el snapshot de un alumno con la lista actual de competencias
 * del catálogo cuando ésta cambia:
 *  - conserva las ediciones individuales del alumno (campo con contenido),
 *  - rellena desde el catálogo los campos vacíos (p. ej. alumnos cargados
 *    antes de importar las trayectorias),
 *  - elimina las competencias que ya no existen.
 */
function syncStudentCompetencias(student, competencias, projects) {
  const snap = student.proyectoAsignado || {};
  const existing = snap.competencias || {};
  const match = projects.find(
    (p) => p.grupo === student.grupo && p.nivel === student.nivel
  );

  const next = {};
  competencias.forEach((c) => {
    const previo = existing[c.id] || {};
    const src = (match && match.contenido && match.contenido[c.id]) || {};
    const merged = {};
    CAMPOS_COMPETENCIA.forEach((campo) => {
      merged[campo] = String(previo[campo] ?? '').trim()
        ? previo[campo]
        : applyTemplate(src[campo], student);
    });
    next[c.id] = { ...previo, ...merged };
  });

  return { ...student, proyectoAsignado: { ...snap, competencias: next } };
}

module.exports = { classifyStudent, syncStudentCompetencias, applyTemplate };
