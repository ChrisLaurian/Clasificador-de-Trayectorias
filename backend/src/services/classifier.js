const { GROUP_AGE_MAP } = require('../data/db');

/**
 * Asocia a un alumno el bloque de proyecto correspondiente según su Grupo y Nivel.
 * Guarda una copia (snapshot) del proyecto en `proyectoAsignado` para permitir
 * ediciones individuales sin alterar el catálogo maestro.
 */
function classifyStudent(student, projects) {
  const match = projects.find(
    (p) => p.grupo === student.grupo && p.nivel === student.nivel
  );

  const proyectoAsignado = match
    ? {
        materia: match.materia,
        dominioDisciplinar: match.dominioDisciplinar,
        trimestre1: match.trimestre1,
        trimestre2: match.trimestre2,
        trimestre3: match.trimestre3,
        metaGeneral: match.metaGeneral,
      }
    : {
        materia: '',
        dominioDisciplinar: '',
        trimestre1: '',
        trimestre2: '',
        trimestre3: '',
        metaGeneral: '',
      };

  return {
    ...student,
    edad: GROUP_AGE_MAP[student.grupo] || null,
    proyectoAsignado,
    clasificado: Boolean(match),
  };
}

module.exports = { classifyStudent };
