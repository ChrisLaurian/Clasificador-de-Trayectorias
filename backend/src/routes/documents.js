const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const db = require('../data/db');
const { generateStudentPDF } = require('../services/pdfGenerator');

function safeFileName(name) {
  return (name || 'alumno')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

// GET /api/documents/student/:id -> PDF individual
router.get('/student/:id', async (req, res) => {
  const student = db.getStudents().find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });

  try {
    const pdfBuffer = await generateStudentPDF(student);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFileName(student.nombre)}_${student.grupo}${student.nivel}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error generando el PDF del alumno' });
  }
});

// GET /api/documents/group/:grupo -> ZIP con todos los PDFs del grupo (filtro opcional ?nivel=)
router.get('/group/:grupo', async (req, res) => {
  const { grupo } = req.params;
  const { nivel } = req.query;

  let students = db.getStudents().filter((s) => s.grupo === grupo);
  if (nivel) students = students.filter((s) => s.nivel === nivel);

  if (students.length === 0) {
    return res.status(404).json({ error: 'No hay alumnos para ese grupo/nivel' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="grupo_${grupo}${nivel ? '_' + nivel : ''}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error(err);
    res.status(500).end();
  });
  archive.pipe(res);

  for (const student of students) {
    const pdfBuffer = await generateStudentPDF(student);
    archive.append(pdfBuffer, {
      name: `${safeFileName(student.nombre)}_${student.grupo}${student.nivel}.pdf`,
    });
  }

  archive.finalize();
});

module.exports = router;
