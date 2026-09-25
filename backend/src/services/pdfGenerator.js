const PDFDocument = require('pdfkit');
const db = require('../data/db');

const NIVEL_LABEL = { B: 'Básico', I: 'Intermedio', A: 'Avanzado' };

const MARGIN = 40;
const CELL_PAD = 4;
const HEADER_ROW_H = 22;

// Columnas de la tabla de competencias (total = 762 pt = A4 apaisado - márgenes)
const COLUMNS = [
  { key: 'competencia', label: 'Competencia', width: 90 },
  { key: 'perfil', label: 'Descripción del alumno', width: 140 },
  { key: 'dominio', label: 'Dominio', width: 65 },
  { key: 't1', label: 'Trimestre 1', width: 112 },
  { key: 't2', label: 'Trimestre 2', width: 112 },
  { key: 't3', label: 'Trimestre 3', width: 112 },
  { key: 'meta', label: 'Meta', width: 131 },
];

function colX(index) {
  let x = MARGIN;
  for (let i = 0; i < index; i += 1) x += COLUMNS[i].width;
  return x;
}

/**
 * Genera el PDF de un alumno y devuelve un Buffer.
 * Encabezado institucional + perfil + tabla de competencias
 * (Abstracción, Pensamiento lógico, ... Competencias digitales).
 */
function generateStudentPDF(student, options = {}) {
  const competencias = options.competencias || db.getCompetencias();
  const institucion = options.institucion || 'Institución Educativa';

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: MARGIN,
        bufferPages: true,
        info: { Title: `Plan de proyecto - ${student.nombre || ''}` },
      });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const p = student.proyectoAsignado || {};
      const contenido = p.competencias || {};
      const pageBottom = () => doc.page.height - MARGIN - 18;
      const pageWidth = doc.page.width - MARGIN * 2;

      const headerRow = (label, value) => {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(value || '—');
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

      // --- Datos generales ---
      const grupoCfg = db.getGrupos().find((g) => g.codigo === student.grupo);
      const grupoTxt = [
        student.grupo,
        grupoCfg && grupoCfg.etiqueta ? grupoCfg.etiqueta : '',
        student.edad !== null && student.edad !== undefined ? `(aprox. ${student.edad} años)` : '',
      ]
        .filter(Boolean)
        .join(' ');

      doc.fontSize(10).fillColor('#111827');
      headerRow('Nombre completo', student.nombre);
      headerRow('Grupo', grupoTxt);
      headerRow('Nivel', NIVEL_LABEL[student.nivel] || student.nivel);
      headerRow('Materia', p.materia);
      headerRow('Dominio disciplinar', p.dominioDisciplinar);
      doc.moveDown(0.3);

      // --- Perfil del alumno ---
      doc.font('Helvetica-Bold').fontSize(11).text('Perfil del alumno');
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10);
      headerRow('Diagnóstico', student.diagnostico);
      headerRow('Intereses', student.intereses);
      headerRow('Fortalezas', student.fortalezas);
      headerRow('Áreas de mejora', student.areasMejora);
      doc.moveDown(0.6);

      // --- Tabla de competencias ---
      const filas = competencias.map((c) => {
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

      const heights = filas.map((f) => {
        const valores = [f.nombre, f.perfil, f.t1, f.t2, f.t3, f.meta];
        const dominio = p.dominioDisciplinar || '—';
        let max = 0;
        valores.forEach((text, i) => {
          const colIndex = i === 0 ? 0 : i + 1; // el dominio es la columna 2
          const w = COLUMNS[colIndex].width - CELL_PAD * 2;
          const h = doc.heightOfString(text || '—', { width: w }) + CELL_PAD * 2;
          if (h > max) max = h;
        });
        const hDom = doc.heightOfString(dominio, { width: COLUMNS[2].width - CELL_PAD * 2 }) + CELL_PAD * 2;
        if (hDom > max) max = hDom;
        return Math.max(max, 18);
      });

      const drawRowHeader = (y) => {
        COLUMNS.forEach((col, i) => {
          doc.rect(colX(i), y, col.width, HEADER_ROW_H).fill('#111827');
          doc
            .fillColor('#ffffff')
            .font('Helvetica-Bold')
            .fontSize(8)
            .text(col.label, colX(i) + CELL_PAD, y + HEADER_ROW_H / 2 - 5, {
              width: col.width - CELL_PAD * 2,
              align: 'center',
            });
        });
        doc.fillColor('#111827');
        return y + HEADER_ROW_H;
      };

      const drawDomainSpan = (fromY, toY) => {
        if (toY <= fromY) return;
        const x = colX(2);
        const w = COLUMNS[2].width;
        doc.rect(x, fromY, w, toY - fromY).fillAndStroke('#dcfce7', '#9ca3af');
        const text = p.dominioDisciplinar || '—';
        const tw = w - CELL_PAD * 2;
        const th = doc.heightOfString(text, { width: tw, align: 'center' });
        doc
          .fillColor('#166534')
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(text, x + CELL_PAD, fromY + (toY - fromY - th) / 2, {
            width: tw,
            align: 'center',
          });
        doc.fillColor('#111827');
      };

      if (doc.y + HEADER_ROW_H + 40 > pageBottom()) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Plan por competencias');
      doc.moveDown(0.3);

      // Una fila nunca debe superar el alto útil de una página.
      const maxRowH = doc.page.height - MARGIN * 2 - HEADER_ROW_H - 18;

      let y = drawRowHeader(doc.y);
      let spanStart = y;

      filas.forEach((fila, idx) => {
        const rowH = Math.min(heights[idx], maxRowH);
        if (y + rowH > pageBottom()) {
          drawDomainSpan(spanStart, y);
          doc.addPage();
          y = drawRowHeader(MARGIN);
          spanStart = y;
        }

        const cellBg = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
        const valores = [fila.nombre, fila.perfil, null, fila.t1, fila.t2, fila.t3, fila.meta];

        valores.forEach((value, i) => {
          if (i === 2) return; // la celda de dominio se dibuja mergeada
          const col = COLUMNS[i];
          const x = colX(i);
          doc.rect(x, y, col.width, rowH).fillAndStroke(cellBg, '#d1d5db');
          doc
            .fillColor('#111827')
            .font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8.5)
            .text(value || '—', x + CELL_PAD, y + CELL_PAD, {
              width: col.width - CELL_PAD * 2,
              align: 'left',
            });
        });

        y += rowH;
      });

      drawDomainSpan(spanStart, y);
      doc.y = y + 14;

      // --- Meta general del proyecto ---
      if (p.metaGeneral) {
        if (doc.y + 40 > pageBottom()) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Meta general del proyecto');
        doc.moveDown(0.2);
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor('#374151')
          .text(p.metaGeneral, { width: pageWidth });
        doc.y += 6;
      }

      // --- Pie de página (número de página + fecha) ---
      // Ojo: si el texto cae por debajo del margen, pdfkit crea una página nueva.
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
