const PDFDocument = require('pdfkit');

const NIVEL_LABEL = { B: 'Básico', I: 'Intermedio', A: 'Avanzado' };

/**
 * Genera el PDF de un alumno y devuelve un Buffer.
 * Encabezado institucional + tabla de trimestres + meta general.
 */
function generateStudentPDF(student, institucion = 'Institución Educativa') {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const p = student.proyectoAsignado || {};

      // --- Encabezado institucional ---
      doc
        .fontSize(16)
        .fillColor('#1f2937')
        .text(institucion, { align: 'center' })
        .moveDown(0.2);

      doc
        .fontSize(13)
        .fillColor('#374151')
        .text('Plan de Proyecto Educativo Individual', { align: 'center' })
        .moveDown(1);

      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#d1d5db').stroke();
      doc.moveDown(0.8);

      doc.fontSize(11).fillColor('#111827');
      const headerRow = (label, value) => {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(value || '—');
      };

      headerRow('Nombre completo', student.nombre);
      headerRow('Grupo', `${student.grupo}${student.edad ? ` (aprox. ${student.edad} años)` : ''}`);
      headerRow('Nivel', NIVEL_LABEL[student.nivel] || student.nivel);
      headerRow('Materia', p.materia);
      headerRow('Dominio disciplinar', p.dominioDisciplinar);
      doc.moveDown(0.5);

      // --- Perfil del alumno ---
      doc.font('Helvetica-Bold').fontSize(12).text('Perfil del alumno');
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10.5);
      headerRow('Diagnóstico', student.diagnostico);
      headerRow('Intereses', student.intereses);
      headerRow('Fortalezas', student.fortalezas);
      headerRow('Áreas de mejora', student.areasMejora);
      doc.moveDown(1);

      // --- Tabla de trimestres ---
      doc.font('Helvetica-Bold').fontSize(12).text('Plan por Trimestre');
      doc.moveDown(0.4);

      const tableTop = doc.y;
      const colX = { trimestre: 50, contenido: 140 };
      const colWidth = 545 - colX.contenido;
      const rowHeight = 20;

      // Encabezado de tabla
      doc
        .rect(50, tableTop, 495, rowHeight)
        .fill('#111827');
      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Trimestre', colX.trimestre + 5, tableTop + 6)
        .text('Contenido / Objetivo', colX.contenido + 5, tableTop + 6);

      let y = tableTop + rowHeight;
      const trimestres = [
        ['Trimestre 1', p.trimestre1],
        ['Trimestre 2', p.trimestre2],
        ['Trimestre 3', p.trimestre3],
      ];

      trimestres.forEach(([label, content], i) => {
        const text = content || '—';
        const textHeight = doc.heightOfString(text, { width: colWidth - 10 });
        const cellHeight = Math.max(rowHeight, textHeight + 10);

        doc
          .rect(50, y, 495, cellHeight)
          .fillAndStroke(i % 2 === 0 ? '#f9fafb' : '#ffffff', '#e5e7eb');

        doc
          .fillColor('#111827')
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(label, colX.trimestre + 5, y + 5, { width: colX.contenido - colX.trimestre - 10 });

        doc
          .font('Helvetica')
          .fontSize(10)
          .text(text, colX.contenido + 5, y + 5, { width: colWidth - 10 });

        y += cellHeight;
      });

      doc.moveDown(1.5);
      doc.y = y + 20;

      // --- Meta general ---
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Meta General');
      doc.moveDown(0.3);
      doc
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor('#374151')
        .text(p.metaGeneral || '—', { width: 495 });

      // --- Pie de página ---
      doc.moveDown(2);
      doc
        .fontSize(8)
        .fillColor('#9ca3af')
        .text(`Generado el ${new Date().toLocaleDateString('es-MX')}`, { align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateStudentPDF };
