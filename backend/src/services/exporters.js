const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

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

// --- Documento individual en Excel (mismo contenido y estilo del PDF TIA) -----
const COLUMNAS_TIA = [
  'Dominio disciplinar de aprendizaje',
  'Descripción detallada de su evaluación diagnóstica',
  'Materia',
  'Primer Trimestre',
  'Segundo Trimestre',
  'Tercer Trimestre',
  'Meta general',
];

// Mismos colores del PDF oficial TIA
const TIA_NAVY = 'FF1F3864';
const TIA_TITULO_BG = 'FFE9EEFB';
const TIA_COL0_BG = 'FFE9EEFB';
const TIA_COL0_FG = 'FF1D3A8F';
const TIA_MATERIA_BG = 'FFFDEAEA';
const TIA_MATERIA_FG = 'FFC81E1E';
const TIA_FILA_BG = 'FFEEF2FB';
const TIA_LABEL_BG = 'FFF3F4F6';
const TIA_TEXTO = 'FF111827';
const TIA_BORDE_FINA = { style: 'thin', color: { argb: 'FFD1D5DB' } };
const TIA_BORDE = {
  top: TIA_BORDE_FINA,
  left: TIA_BORDE_FINA,
  bottom: TIA_BORDE_FINA,
  right: TIA_BORDE_FINA,
};
const TIA_ANCHOS = [32, 50, 14, 36, 36, 36, 36];

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

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Clasificador de Trayectorias';
  const ws = wb.addWorksheet('TIA', {
    // Congela el documento y la cabecera de la tabla; sin cuadrícula.
    views: [{ state: 'frozen', ySplit: 13, showGridLines: false }],
  });
  ws.columns = TIA_ANCHOS.map((width) => ({ width }));

  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const alto = (textos) => {
    let lineas = 1;
    textos.forEach(([texto, ancho]) => {
      const n = Math.max(1, Math.ceil(String(texto || '').length / ancho));
      if (n > lineas) lineas = n;
    });
    return Math.min(409, Math.max(18, lineas * 14.5 + 4));
  };
  const bordear = (fila) => {
    for (let c = 1; c <= 7; c += 1) ws.getCell(fila, c).border = TIA_BORDE;
  };

  let f = 1;
  const barra = (texto) => {
    ws.mergeCells(f, 1, f, 7);
    const celda = ws.getCell(f, 1);
    celda.value = texto;
    celda.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    celda.fill = fill(TIA_NAVY);
    celda.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(f).height = 21;
    f += 1;
  };
  const kv = (label, valor) => {
    const a = ws.getCell(f, 1);
    a.value = label;
    a.font = { bold: true, size: 10, color: { argb: TIA_TEXTO } };
    a.fill = fill(TIA_LABEL_BG);
    a.alignment = { vertical: 'middle', wrapText: true };
    ws.mergeCells(f, 2, f, 7);
    const b = ws.getCell(f, 2);
    b.value = valor || '';
    b.font = { size: 10, color: { argb: TIA_TEXTO } };
    b.alignment = { vertical: 'middle', wrapText: true };
    bordear(f);
    ws.getRow(f).height = alto([[label, 30], [valor, 195]]);
    f += 1;
  };
  const vacia = (altoFila) => {
    ws.getRow(f).height = altoFila;
    f += 1;
  };

  // Título
  ws.mergeCells(1, 1, 1, 7);
  const titulo = ws.getCell(1, 1);
  titulo.value = 'Plan de Proyecto Educativo Individual (TIA)';
  titulo.font = { bold: true, size: 13, color: { argb: TIA_NAVY } };
  titulo.fill = fill(TIA_TITULO_BG);
  titulo.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;
  f = 2;
  vacia(6);

  barra('1. Datos Generales del Estudiante');
  kv('Nombre Completo', student.nombre);
  kv('Grupo', grupoTxt);
  vacia(6);

  barra('2. Perfil del Estudiante');
  kv('Intereses y Motivaciones', student.intereses);
  kv('Estilo de Aprendizaje Predominante', student.estiloAprendizaje);
  kv('Fortalezas Identificadas', student.fortalezas);
  kv('Áreas de Mejora', student.areasMejora);
  vacia(6);

  // Cabecera de la tabla (fila 13: coincide con el panel congelado)
  const filaHeader = f;
  COLUMNAS_TIA.forEach((t, i) => {
    const c = ws.getCell(filaHeader, i + 1);
    c.value = t;
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    c.fill = fill(TIA_NAVY);
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = TIA_BORDE;
  });
  ws.getRow(filaHeader).height = 34;
  f += 1;

  const filas = competencias.length ? competencias : [{ id: '', nombre: '' }];
  const primeraDato = f;
  filas.forEach((c) => {
    const d = contenido[c.id] || {};
    const valores = [
      c.nombre || '',
      d.perfil || '',
      null,
      d.trimestre1 || '',
      d.trimestre2 || '',
      d.trimestre3 || '',
      d.metaGeneral || '',
    ];
    valores.forEach((v, i) => {
      if (i === 2) return; // la materia se dibuja combinada al final
      const celda = ws.getCell(f, i + 1);
      celda.value = v;
      celda.border = TIA_BORDE;
      celda.alignment = { vertical: i === 0 ? 'middle' : 'top', wrapText: true };
      if (i === 0) {
        celda.font = { bold: true, size: 10, color: { argb: TIA_COL0_FG } };
        celda.fill = fill(TIA_COL0_BG);
      } else {
        celda.font = { size: 10, color: { argb: TIA_TEXTO } };
        celda.fill = fill(TIA_FILA_BG);
      }
    });
    ws.getRow(f).height = alto([
      [valores[0], 28],
      [valores[1], 46],
      [valores[3], 33],
      [valores[4], 33],
      [valores[5], 33],
      [valores[6], 33],
    ]);
    f += 1;
  });
  const ultimaDato = f - 1;

  // Materia combinada en vertical sobre toda la tabla (como en el PDF)
  if (ultimaDato > primeraDato) ws.mergeCells(primeraDato, 3, ultimaDato, 3);
  for (let r = primeraDato; r <= ultimaDato; r += 1) ws.getCell(r, 3).border = TIA_BORDE;
  const celdaMateria = ws.getCell(primeraDato, 3);
  celdaMateria.value = materia;
  celdaMateria.font = { bold: true, size: 11, color: { argb: TIA_MATERIA_FG } };
  celdaMateria.fill = fill(TIA_MATERIA_BG);
  celdaMateria.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  return wb.xlsx.writeBuffer().then((buffer) => Buffer.from(buffer));
}

// --- Vista en navegador (HTML) del mismo documento TIA ------------------------
function escapeHtml(valor) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateStudentHTML(student, options = {}) {
  const competencias = options.competencias || [];
  const grupos = options.grupos || [];
  const p = student.proyectoAsignado || {};
  const contenido = p.competencias || {};
  const materia =
    p.materia !== null && p.materia !== undefined && String(p.materia).trim() !== ''
      ? String(p.materia).trim()
      : 'CODE';
  const grupoCfg = grupos.find((g) => g.codigo === student.grupo);
  const grupoTxt = [student.grupo, grupoCfg && grupoCfg.etiqueta ? grupoCfg.etiqueta : '']
    .filter(Boolean)
    .join(' ');
  const e = escapeHtml;
  const kv = (k, v) =>
    `<div class="kv"><div class="k">${e(k)}</div><div class="v">${e(v)}</div></div>`;

  const filas = competencias.length ? competencias : [{ id: '', nombre: '' }];
  const filasHtml = filas
    .map((c, i) => {
      const d = contenido[c.id] || {};
      const materiaCelda =
        i === 0
          ? `<td class="materia" rowspan="${filas.length}">${e(materia)}</td>`
          : '';
      return (
        '<tr>' +
        `<td class="dom">${e(c.nombre)}</td>` +
        `<td>${e(d.perfil)}</td>` +
        materiaCelda +
        `<td>${e(d.trimestre1)}</td>` +
        `<td>${e(d.trimestre2)}</td>` +
        `<td>${e(d.trimestre3)}</td>` +
        `<td class="meta">${e(d.metaGeneral)}</td>` +
        '</tr>'
      );
    })
    .join('\n        ');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(student.nombre)} — Plan de Proyecto Educativo Individual (TIA)</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 24px; background: #f3f4f6; color: #111827; }
  .doc { max-width: 1180px; margin: 0 auto; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; padding: 24px 28px 28px; }
  .titulo { text-align: center; font-size: 17px; font-weight: 700; color: #1f3864; background: #e9eefb; margin: 0 0 14px; padding: 12px; border-radius: 4px; }
  .seccion { background: #1f3864; color: #fff; font-weight: 700; font-size: 14px; padding: 7px 12px; border-radius: 4px; margin: 16px 0 8px; }
  .kv { display: flex; border: 1px solid #d1d5db; margin-top: -1px; }
  .kv .k { flex: 0 0 250px; background: #f3f4f6; font-weight: 700; font-size: 13px; padding: 8px 10px; border-right: 1px solid #d1d5db; display: flex; align-items: center; }
  .kv .v { flex: 1; font-size: 13px; padding: 8px 10px; white-space: pre-wrap; }
  table.tia { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 8px; }
  table.tia th { background: #1f3864; color: #fff; font-size: 12.5px; font-weight: 700; padding: 8px 6px; border: 1px solid #9ca3af; text-align: center; }
  table.tia td { border: 1px solid #d1d5db; padding: 8px 6px; font-size: 13px; vertical-align: top; background: #eef2fb; white-space: pre-wrap; word-break: break-word; }
  table.tia td.dom { background: #e9eefb; color: #1d3a8f; font-weight: 700; vertical-align: middle; }
  table.tia td.materia { background: #fdeaea; color: #c81e1e; font-weight: 700; text-align: center; vertical-align: middle; }
  @media print { body { background: #fff; padding: 0; } .doc { border: 0; border-radius: 0; padding: 0; } }
</style>
</head>
<body>
  <div class="doc">
    <h1 class="titulo">Plan de Proyecto Educativo Individual (TIA)</h1>

    <div class="seccion">1. Datos Generales del Estudiante</div>
    ${kv('Nombre Completo', student.nombre)}
    ${kv('Grupo', grupoTxt)}

    <div class="seccion">2. Perfil del Estudiante</div>
    ${kv('Intereses y Motivaciones', student.intereses)}
    ${kv('Estilo de Aprendizaje Predominante', student.estiloAprendizaje)}
    ${kv('Fortalezas Identificadas', student.fortalezas)}
    ${kv('Áreas de Mejora', student.areasMejora)}

    <table class="tia">
      <colgroup>
        <col style="width:17%"><col style="width:25%"><col style="width:8%">
        <col style="width:13%"><col style="width:13%"><col style="width:13%"><col style="width:11%">
      </colgroup>
      <thead>
        <tr>
          <th>Dominio disciplinar de aprendizaje</th>
          <th>Descripción detallada de su evaluación diagnóstica</th>
          <th>Materia</th>
          <th>Primer Trimestre</th>
          <th>Segundo Trimestre</th>
          <th>Tercer Trimestre</th>
          <th>Meta general</th>
        </tr>
      </thead>
      <tbody>
        ${filasHtml}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

module.exports = { buildRows, toCSV, toXML, toXLSX, toJSON, generateStudentXLSX, generateStudentHTML };
