const XLSX = require('xlsx');

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// --- Filas planas (CSV / Excel) -------------------------------------------------
// Una fila por alumno, con una columna por cada campo de cada competencia.
function buildRows(students, competencias) {
  return students.map((s) => {
    const p = s.proyectoAsignado || {};
    const contenido = p.competencias || {};

    const row = {
      id: s.id,
      nombre: s.nombre || '',
      grupo: s.grupo || '',
      nivel: s.nivel || '',
      edad: s.edad ?? '',
      diagnostico: s.diagnostico || '',
      intereses: s.intereses || '',
      fortalezas: s.fortalezas || '',
      areasMejora: s.areasMejora || '',
      materia: p.materia || '',
      dominioDisciplinar: p.dominioDisciplinar || '',
      metaGeneral: p.metaGeneral || '',
    };

    competencias.forEach((c) => {
      const data = contenido[c.id] || {};
      row[`${c.nombre} · Perfil`] = data.perfil || '';
      row[`${c.nombre} · Trimestre 1`] = data.trimestre1 || '';
      row[`${c.nombre} · Trimestre 2`] = data.trimestre2 || '';
      row[`${c.nombre} · Trimestre 3`] = data.trimestre3 || '';
      row[`${c.nombre} · Meta`] = data.metaGeneral || '';
    });

    return row;
  });
}

// --- CSV ----------------------------------------------------------------------
function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCSV(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvCell).join(',')];
  rows.forEach((row) => lines.push(headers.map((h) => csvCell(row[h])).join(',')));
  // BOM para que Excel detecte UTF-8 (acentos y ñ).
  return '\uFEFF' + lines.join('\r\n');
}

// --- XML ----------------------------------------------------------------------
function toXML(students, competencias) {
  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(
    `<alumnos generado="${new Date().toISOString()}" total="${students.length}">`
  );

  students.forEach((s) => {
    const p = s.proyectoAsignado || {};
    const contenido = p.competencias || {};
    parts.push(
      `  <alumno id="${escapeXml(s.id)}" grupo="${escapeXml(s.grupo)}" nivel="${escapeXml(
        s.nivel
      )}" edad="${escapeXml(s.edad ?? '')}">`
    );
    parts.push(`    <nombre>${escapeXml(s.nombre)}</nombre>`);
    parts.push(`    <diagnostico>${escapeXml(s.diagnostico)}</diagnostico>`);
    parts.push(`    <intereses>${escapeXml(s.intereses)}</intereses>`);
    parts.push(`    <fortalezas>${escapeXml(s.fortalezas)}</fortalezas>`);
    parts.push(`    <areasMejora>${escapeXml(s.areasMejora)}</areasMejora>`);
    parts.push(
      `    <proyecto materia="${escapeXml(p.materia)}" dominioDisciplinar="${escapeXml(
        p.dominioDisciplinar
      )}">`
    );
    parts.push(`      <metaGeneral>${escapeXml(p.metaGeneral)}</metaGeneral>`);
    parts.push('      <competencias>');
    competencias.forEach((c) => {
      const data = contenido[c.id] || {};
      parts.push(
        `        <competencia id="${escapeXml(c.id)}" nombre="${escapeXml(c.nombre)}">`
      );
      parts.push(`          <perfil>${escapeXml(data.perfil)}</perfil>`);
      parts.push(`          <trimestre1>${escapeXml(data.trimestre1)}</trimestre1>`);
      parts.push(`          <trimestre2>${escapeXml(data.trimestre2)}</trimestre2>`);
      parts.push(`          <trimestre3>${escapeXml(data.trimestre3)}</trimestre3>`);
      parts.push(`          <metaGeneral>${escapeXml(data.metaGeneral)}</metaGeneral>`);
      parts.push('        </competencia>');
    });
    parts.push('      </competencias>');
    parts.push('    </proyecto>');
    parts.push('  </alumno>');
  });

  parts.push('</alumnos>');
  return parts.join('\n');
}

// --- Excel (.xlsx) -------------------------------------------------------------
function toXLSX(rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Alumnos');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

// --- JSON (estructurado, sirve de respaldo) -------------------------------------
function toJSON(students) {
  return JSON.stringify(students, null, 2);
}

// --- Documento individual en Excel (mismo contenido del PDF oficial TIA) ------
const COLUMNAS_TIA = [
  'Dominio disciplinar de aprendizaje',
  'Descripción detallada de su evaluación diagnóstica',
  'Materia',
  'Primer Trimestre',
  'Segundo Trimestre',
  'Tercer Trimestre',
  'Meta general',
];

function generateStudentXLSX(student, options = {}) {
  const competencias = options.competencias || [];
  const grupos = options.grupos || [];
  const p = student.proyectoAsignado || {};
  const contenido = p.competencias || {};
  // La materia del alumno; vacía -> CODE como respaldo (igual que el PDF).
  const materia =
    p.materia !== null && p.materia !== undefined && String(p.materia).trim() !== ''
      ? String(p.materia).trim()
      : 'CODE';
  const grupoCfg = grupos.find((g) => g.codigo === student.grupo);
  const grupoTxt = [student.grupo, grupoCfg && grupoCfg.etiqueta ? grupoCfg.etiqueta : '']
    .filter(Boolean)
    .join(' ');

  const aoa = [
    ['Plan de Proyecto Educativo Individual (TIA)'],
    [],
    ['1. Datos Generales del Estudiante'],
    ['Nombre Completo', student.nombre || ''],
    ['Grupo', grupoTxt],
    [],
    ['2. Perfil del Estudiante'],
    ['Intereses y Motivaciones', student.intereses || ''],
    ['Estilo de Aprendizaje Predominante', student.estiloAprendizaje || ''],
    ['Fortalezas Identificadas', student.fortalezas || ''],
    ['Áreas de Mejora', student.areasMejora || ''],
    [],
    COLUMNAS_TIA,
  ];

  const filas = competencias.length
    ? competencias
    : [{ id: '', nombre: '' }];
  filas.forEach((c) => {
    const d = contenido[c.id] || {};
    aoa.push([
      c.nombre || '',
      d.perfil || '',
      materia,
      d.trimestre1 || '',
      d.trimestre2 || '',
      d.trimestre3 || '',
      d.metaGeneral || '',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 34 },
    { wch: 55 },
    { wch: 16 },
    { wch: 42 },
    { wch: 42 },
    { wch: 42 },
    { wch: 42 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'TIA');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildRows, toCSV, toXML, toXLSX, toJSON, generateStudentXLSX };
