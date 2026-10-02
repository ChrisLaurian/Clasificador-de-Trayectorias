const PDFDocument = require('pdfkit');

const MARGIN = 40;
const CELL_PAD = 4;

// Tabla oficial TIA: 7 columnas (total = 761.89 pt = A4 apaisado - márgenes)
const COLUMNS = [
  { label: 'Dominio disciplinar de aprendizaje', width: 85 },
  { label: 'Descripción detallada de su evaluación diagnóstica', width: 165 },
  { label: 'Materia', width: 70 },
  { label: 'Primer Trimestre', width: 110 },
  { label: 'Segundo Trimestre', width: 110 },
  { label: 'Tercer Trimestre', width: 110 },
  { label: 'Meta general', width: 111.89 },
];

// Estilo por columna (como en la plantilla oficial):
// col 0 azul con texto azul en negrita, col 2 (Materia) rosa con texto rojo,
// el resto en azul muy claro.
const COL_STYLES = [
  { bg: '#e9eefb', color: '#1d3a8f', bold: true },
  { bg: '#ffffff', color: '#111827', bold: false },
  { bg: '#fdeaea', color: '#c81e1e', bold: true },
  { bg: '#eef2fb', color: '#111827', bold: false },
  { bg: '#eef2fb', color: '#111827', bold: false },
  { bg: '#eef2fb', color: '#111827', bold: false },
  { bg: '#eef2fb', color: '#111827', bold: false },
];

const BORDER = '#4b5563';
const NAVY = '#1f3864';

// Por ahora todas las trayectorias del programa son de la materia CODE:
// se muestra fija en la tabla aunque la celda del catálogo no tenga materia.
const MATERIA = 'CODE';

function colX(index) {
  let x = MARGIN;
  for (let i = 0; i < index; i += 1) x += COLUMNS[i].width;
  return x;
}

const dash = (v) => (v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : '—');

/**
 * Genera el PDF individual en el formato oficial "Plan de Proyecto Educativo
 * Individual" (TIA): 1. Datos Generales, 2. Perfil del Estudiante y la tabla
 * de competencias con columna de Materia combinada.
 */
function generateStudentPDF(student, options = {}) {
  const competencias = options.competencias || [];
  const grupos = options.grupos || [];
  const institucion = options.institucion || 'Institución Educativa';

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: MARGIN,
        bufferPages: true,
        info: { Title: `Plan de Proyecto Educativo Individual - ${student.nombre || ''}` },
      });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const p = student.proyectoAsignado || {};
      const contenido = p.competencias || {};
      const pageBottom = () => doc.page.height - MARGIN - 18;
      const pageWidth = doc.page.width - MARGIN * 2;

      const kv = (label, value) => {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(dash(value));
      };

      const bar = (title) => {
        if (doc.y + 26 > pageBottom()) doc.addPage();
        const y = doc.y;
        doc.rect(MARGIN, y, pageWidth, 17).fill(NAVY);
        doc
          .fillColor('#ffffff')
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(title, MARGIN + 8, y + 4, { width: pageWidth - 16, lineBreak: false });
        doc.fillColor('#111827');
        doc.y = y + 17 + 7;
      };

      // --- Encabezado institucional ---
      doc.fontSize(15).fillColor('#1f2937').text(institucion, MARGIN, MARGIN, {
        width: pageWidth,
        align: 'center',
      });
      doc.moveDown(0.15);
      doc.fontSize(12).fillColor('#374151').text('Plan de Proyecto Educativo Individual', {
        width: pageWidth,
        align: 'center',
      });
      doc.moveDown(0.4);
      doc.moveTo(MARGIN, doc.y).lineTo(doc.page.width - MARGIN, doc.y).strokeColor('#d1d5db').stroke();
      doc.moveDown(0.5);

      // --- 1. Datos Generales del Estudiante ---
      bar('1. Datos Generales del Estudiante');
      const grupoCfg = grupos.find((g) => g.codigo === student.grupo);
      const grupoTxt = [student.grupo, grupoCfg && grupoCfg.etiqueta ? grupoCfg.etiqueta : '']
        .filter(Boolean)
        .join(' ');

      kv('Nombre Completo', student.nombre);
      kv('Grupo', grupoTxt);
      doc.y += 8;

      // --- 2. Perfil del Estudiante ---
      bar('2. Perfil del Estudiante');
      kv('Intereses y Motivaciones', student.intereses);
      kv('Estilo de Aprendizaje Predominante', student.estiloAprendizaje);
      kv('Fortalezas Identificadas', student.fortalezas);
      kv('Áreas de Mejora', student.areasMejora);
      doc.y += 12;

      // --- Tabla de competencias (con columna Materia combinada) ---
      let filas = competencias.map((c) => {
        const data = contenido[c.id] || {};
        return {
          nombre: c.nombre,
          perfil: data.perfil || '',
          t1: data.trimestre1 || '',
          t2: data.trimestre2 || '',
          t3: data.trimestre3 || '',
          meta: data.metaGeneral || '',
        };
      });
      if (filas.length === 0) filas = [{ nombre: '', perfil: '', t1: '', t2: '', t3: '', meta: '' }];

      doc.font('Helvetica-Bold').fontSize(7.5);
      const headerH = Math.max(
        22,
        ...COLUMNS.map((c) => doc.heightOfString(c.label, { width: c.width - CELL_PAD * 2, align: 'center' }) + CELL_PAD * 2)
      );

      const heights = filas.map((f) => {
        const valores = [f.nombre, f.perfil, MATERIA, f.t1, f.t2, f.t3, f.meta];
        let max = 18;
        valores.forEach((v, i) => {
          doc.font(COL_STYLES[i].bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
          const h = doc.heightOfString(dash(v), { width: COLUMNS[i].width - CELL_PAD * 2 }) + CELL_PAD * 2;
          if (h > max) max = h;
        });
        return max;
      });

      const drawRowHeader = (y) => {
        COLUMNS.forEach((col, i) => {
          doc.rect(colX(i), y, col.width, headerH).fill(NAVY);
          const th = doc.heightOfString(col.label, { width: col.width - CELL_PAD * 2, align: 'center' });
          doc
            .fillColor('#ffffff')
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .text(col.label, colX(i) + CELL_PAD, y + (headerH - th) / 2, {
              width: col.width - CELL_PAD * 2,
              align: 'center',
            });
        });
        doc.fillColor('#111827');
        return y + headerH;
      };

      const drawMateriaSpan = (fromY, toY) => {
        if (toY <= fromY) return;
        const x = colX(2);
        const w = COLUMNS[2].width;
        doc.rect(x, fromY, w, toY - fromY).fillAndStroke('#fdeaea', BORDER);
        const text = MATERIA;
        const tw = w - CELL_PAD * 2;
        const th = doc.heightOfString(text, { width: tw, align: 'center' });
        doc
          .fillColor('#c81e1e')
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(text, x + CELL_PAD, fromY + (toY - fromY - th) / 2, { width: tw, align: 'center' });
        doc.fillColor('#111827');
      };

      if (doc.y + headerH + 40 > pageBottom()) doc.addPage();

      // Una fila nunca debe superar el alto útil de una página.
      const maxRowH = doc.page.height - MARGIN * 2 - headerH - 18;

      let y = drawRowHeader(doc.y);
      let spanStart = y;

      filas.forEach((fila, idx) => {
        const rowH = Math.min(heights[idx], maxRowH);
        if (y + rowH > pageBottom()) {
          drawMateriaSpan(spanStart, y);
          doc.addPage();
          y = drawRowHeader(MARGIN);
          spanStart = y;
        }

        const valores = [fila.nombre, fila.perfil, null, fila.t1, fila.t2, fila.t3, fila.meta];
        valores.forEach((value, i) => {
          if (i === 2) return; // la celda de Materia se dibuja combinada
          const col = COLUMNS[i];
          const style = COL_STYLES[i];
          const x = colX(i);
          doc.rect(x, y, col.width, rowH).fillAndStroke(style.bg, BORDER);
          doc
            .fillColor(style.color)
            .font(style.bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8)
            .text(dash(value), x + CELL_PAD, y + CELL_PAD, {
              width: col.width - CELL_PAD * 2,
              align: 'left',
            });
        });

        y += rowH;
      });

      drawMateriaSpan(spanStart, y);
      doc.fillColor('#111827');
      doc.y = y + 14;

      // --- Pie de página (número de página + fecha) ---
      const range = doc.bufferedPageRange();
      const fecha = new Date().toLocaleDateString('es-MX');
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        const pw = doc.page.width;
        const py = doc.page.height - MARGIN - 14;
        doc.font('Helvetica').fontSize(7.5).fillColor('#9ca3af');
        doc.text(`Generado el ${fecha}`, MARGIN, py, { width: pw - MARGIN * 2, lineBreak: false });
        doc.text(
          `Página ${i + 1} de ${range.count}`,
          MARGIN,
          py,
          { width: pw - MARGIN * 2, align: 'right', lineBreak: false }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateStudentPDF };
