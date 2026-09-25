import React, { useEffect, useState } from 'react';
import { X, Save, RefreshCcw, FileDown, Loader2, AlertTriangle } from 'lucide-react';
import { updateStudent, reclassifyStudent, downloadStudentPDF, errMsg } from '../api/client';
import { LEVEL_LABEL, LEVEL_BADGE_COLOR } from '../constants';

export default function StudentEditPanel({ student, competencias: catalogoCompetencias = [], onClose, onUpdated }) {
  const [form, setForm] = useState(student);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setForm(student), [student]);

  if (!student) return null;

  const setPerfil = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const setProyecto = (field, value) =>
    setForm((f) => ({ ...f, proyectoAsignado: { ...f.proyectoAsignado, [field]: value } }));

  const setCompetencia = (compId, field, value) =>
    setForm((f) => ({
      ...f,
      proyectoAsignado: {
        ...f.proyectoAsignado,
        competencias: {
          ...(f.proyectoAsignado?.competencias || {}),
          [compId]: {
            perfil: '', trimestre1: '', trimestre2: '', trimestre3: '', metaGeneral: '',
            ...(f.proyectoAsignado?.competencias?.[compId] || {}),
            [field]: value,
          },
        },
      },
    }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await updateStudent(student.id, form);
      onUpdated(updated);
    } catch (err) {
      setError(errMsg(err, 'No se pudieron guardar los cambios'));
    } finally {
      setSaving(false);
    }
  };

  const handleReclassify = async () => {
    if (!window.confirm('Se descartarán tus ediciones individuales y volverá al catálogo. ¿Continuar?')) {
      return;
    }
    setReclassifying(true);
    setError('');
    try {
      const updated = await reclassifyStudent(student.id);
      setForm(updated);
      onUpdated(updated);
    } catch (err) {
      setError(errMsg(err, 'No se pudo restaurar desde el catálogo'));
    } finally {
      setReclassifying(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      await downloadStudentPDF(student.id, student.nombre);
    } catch (err) {
      setError(errMsg(err, 'No se pudo generar el PDF'));
    } finally {
      setDownloading(false);
    }
  };

  const p = form.proyectoAsignado || {};
  const snapshot = p.competencias || {};
  const vacia = { perfil: '', trimestre1: '', trimestre2: '', trimestre3: '', metaGeneral: '' };
  // Une el orden/nombres del catálogo con las ediciones individuales del alumno
  const competencias = [
    ...catalogoCompetencias.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      data: { ...vacia, ...(snapshot[c.id] || {}) },
    })),
    ...Object.keys(snapshot)
      .filter((id) => !catalogoCompetencias.some((c) => c.id === id))
      .map((id) => ({ id, nombre: id, data: { ...vacia, ...snapshot[id] } })),
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-semibold text-gray-900">{form.nombre}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-500">Grupo {form.grupo}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${LEVEL_BADGE_COLOR[form.nivel]}`}
              >
                {LEVEL_LABEL[form.nivel]}
              </span>
              {form.edad !== null && form.edad !== undefined && (
                <span className="text-xs text-gray-500">{form.edad} años</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {error && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Perfil del alumno</h3>
            <TextArea label="Diagnóstico" value={form.diagnostico} onChange={(v) => setPerfil('diagnostico', v)} />
            <TextArea label="Intereses" value={form.intereses} onChange={(v) => setPerfil('intereses', v)} />
            <TextArea label="Fortalezas" value={form.fortalezas} onChange={(v) => setPerfil('fortalezas', v)} />
            <TextArea label="Áreas de mejora" value={form.areasMejora} onChange={(v) => setPerfil('areasMejora', v)} />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Proyecto asignado</h3>
              <button
                onClick={handleReclassify}
                disabled={reclassifying}
                className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
                title="Restaurar desde el catálogo (descarta ediciones individuales)"
              >
                {reclassifying ? <Loader2 className="animate-spin" size={12} /> : <RefreshCcw size={12} />}
                Restaurar del catálogo
              </button>
            </div>
            <Field label="Materia" value={p.materia} onChange={(v) => setProyecto('materia', v)} />
            <Field
              label="Dominio disciplinar"
              value={p.dominioDisciplinar}
              onChange={(v) => setProyecto('dominioDisciplinar', v)}
            />
            <TextArea label="Meta general del proyecto" value={p.metaGeneral} onChange={(v) => setProyecto('metaGeneral', v)} />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Competencias ({competencias.length})
            </h3>
            <p className="text-[11px] text-gray-400">
              Edita cada competencia de este alumno de forma individual. Al restaurar del catálogo
              se vuelven a los valores maestros.
            </p>

            {competencias.length === 0 && (
              <p className="text-xs text-gray-400">
                Sin competencias. Guarda el catálogo para sincronizarlas.
              </p>
            )}

            {competencias.map(({ id: compId, nombre, data }, i) => (
              <details key={compId} className="border border-gray-200 rounded-lg group">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg flex items-center justify-between">
                  <span>
                    <span className="text-gray-400 mr-2 text-xs">{i + 1}.</span>
                    {nombre}
                  </span>
                  <span className="text-gray-400 text-xs group-open:hidden">▾</span>
                  <span className="text-gray-400 text-xs hidden group-open:inline">▴</span>
                </summary>
                <div className="px-3 pb-3 pt-1 space-y-2">
                  <TextArea
                    label="Descripción del alumno"
                    rows={2}
                    value={data.perfil}
                    onChange={(v) => setCompetencia(compId, 'perfil', v)}
                  />
                  <TextArea
                    label="Trimestre 1"
                    rows={2}
                    value={data.trimestre1}
                    onChange={(v) => setCompetencia(compId, 'trimestre1', v)}
                  />
                  <TextArea
                    label="Trimestre 2"
                    rows={2}
                    value={data.trimestre2}
                    onChange={(v) => setCompetencia(compId, 'trimestre2', v)}
                  />
                  <TextArea
                    label="Trimestre 3"
                    rows={2}
                    value={data.trimestre3}
                    onChange={(v) => setCompetencia(compId, 'trimestre3', v)}
                  />
                  <TextArea
                    label="Meta"
                    rows={2}
                    value={data.metaGeneral}
                    onChange={(v) => setCompetencia(compId, 'metaGeneral', v)}
                  />
                </div>
              </details>
            ))}
          </section>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {downloading ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
            Descargar PDF
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 2 }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <textarea
        rows={rows}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
      />
    </label>
  );
}
