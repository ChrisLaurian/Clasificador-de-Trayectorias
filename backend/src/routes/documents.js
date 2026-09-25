const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const db = require('../data/db');
const asyncHandler = require('../asyncHandler');
const { generateStudentPDF } = require('../services/pdfGenerator');

function safeFileName(name) {
  return (name || 'alumno')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

function pdfOptions(catalog) {
  return { competencias: catalog.competencias, grupos: catalog.grupos };
}

// GET /api/documents/student/:id -> PDF individual
router.get(
  '/student/:id',
  asyncHandler(async (req, res, next) => {
    const students = await db.getStudents();
    const student = students.find((s) => s.id === req.params.id);
    if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });

    const catalog = await db.getCatalog();
    const pdfBuffer = await generateStudentPDF(student, pdfOptions(catalog));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFileName(student.nombre)}_${student.grupo}${student.nivel}.pdf"`
    );
    res.send(pdfBuffer);
  })
);

// GET /api/documents/group/:grupo -> ZIP con todos los PDFs del grupo (filtro opcional ?nivel=)
router.get(
  '/group/:grupo',
  asyncHandler(async (req, res, next) => {
    const { grupo } = req.params;
    const { nivel } = req.query;

    const students = (await db.getStudents()).filter((s) => s.grupo === grupo);
    const filtrados = nivel ? students.filter((s) => s.nivel === nivel) : students;

    if (filtrados.length === 0) {
      return res.status(404).json({ error: 'No hay alumnos para ese grupo/nivel' });
    }

    try {
      const catalog = await db.getCatalog();
      const options = pdfOptions(catalog);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="grupo_${grupo}${nivel ? '_' + nivel : ''}.zip"`
      );

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        if (!res.headersSent) res.status(500).json({ error: 'Error construyendo el ZIP' });
        else res.destroy(err);
      });
      archive.pipe(res);

      for (const student of filtrados) {
        const pdfBuffer = await generateStudentPDF(student, options);
        archive.append(pdfBuffer, {
          name: `${safeFileName(student.nombre)}_${student.grupo}${student.nivel}.pdf`,
        });
      }

      await archive.finalize();
    } catch (err) {
      if (!res.headersSent) return next(err);
      res.destroy(err);
    }
  })
);

module.exports = router;
