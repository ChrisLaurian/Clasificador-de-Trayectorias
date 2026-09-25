import React, { useEffect, useState } from 'react';
import { Save, LayoutGrid, Loader2, CheckCircle2 } from 'lucide-react';
import { getProjects, saveAllProjects } from '../api/client';
import { GROUPS, LEVELS, GROUP_LABEL, LEVEL_LABEL, LEVEL_BADGE_COLOR } from '../constants';

export default function CatalogPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [activeCell, setActiveCell] = useState(null); // {grupo, nivel}

  useEffect(() => {
    getProjects().then((data) => {
      setProjects(data);
      setLoading(false);
    });
  }, []);

  const getCell = (grupo, nivel) =>
    projects.find((p) => p.grupo === grupo && p.nivel === nivel) || {};

  const updateCell = (grupo, nivel, field, value) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.grupo === grupo && p.nivel === nivel ? { ...p, [field]: value } : p
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    await saveAllProjects(projects);
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const active = activeCell ? getCell(activeCell.grupo, activeCell.nivel) : null;

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-gray-500">
        <Loader2 className="animate-spin" size={18} /> Cargando catálogo...
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <LayoutGrid className="text-brand-600" size={22} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Catálogo de Proyectos</h1>
            <p className="text-sm text-gray-500">
              Configura la matriz de proyectos por Grupo (A–F) y Nivel (Básico, Intermedio, Avanzado).
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          Guardar catálogo
        </button>
      </header>

      {savedFlash && (
        <div className="mb-4 flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg text-sm">
          <CheckCircle2 size={16} /> Catálogo guardado correctamente.
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-6">
        {/* Matriz resumen: clic en una celda para editar el detalle */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left font-medium text-gray-500 px-4 py-3">Grupo</th>
                {LEVELS.map((nivel) => (
                  <th key={nivel} className="text-left font-medium text-gray-500 px-4 py-3">
                    {LEVEL_LABEL[nivel]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((grupo) => (
                <tr key={grupo} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-800">{GROUP_LABEL[grupo]}</td>
                  {LEVELS.map((nivel) => {
                    const cell = getCell(grupo, nivel);
                    const isActive = activeCell?.grupo === grupo && activeCell?.nivel === nivel;
                    return (
                      <td key={nivel} className="px-4 py-3">
                        <button
                          onClick={() => setActiveCell({ grupo, nivel })}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                            isActive
                              ? 'border-brand-500 bg-brand-50'
                              : 'border-gray-200 hover:border-brand-300'
                          }`}
                        >
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mb-1 ${LEVEL_BADGE_COLOR[nivel]}`}
                          >
                            {LEVEL_LABEL[nivel]}
                          </span>
                          <p className="text-gray-700 truncate">
                            {cell.materia || 'Sin materia configurada'}
                          </p>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Panel de edición de la celda seleccionada */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 h-fit sticky top-6">
          {!active ? (
            <p className="text-sm text-gray-500">
              Selecciona una celda de la matriz (Grupo × Nivel) para editar su proyecto.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">
                  Grupo {activeCell.grupo}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${LEVEL_BADGE_COLOR[activeCell.nivel]}`}
                >
                  {LEVEL_LABEL[activeCell.nivel]}
                </span>
              </div>

              <Field
                label="Materia"
                value={active.materia}
                onChange={(v) => updateCell(activeCell.grupo, activeCell.nivel, 'materia', v)}
              />
              <Field
                label="Dominio disciplinar"
                value={active.dominioDisciplinar}
                onChange={(v) =>
                  updateCell(activeCell.grupo, activeCell.nivel, 'dominioDisciplinar', v)
                }
              />
              <TextArea
                label="Trimestre 1"
                value={active.trimestre1}
                onChange={(v) => updateCell(activeCell.grupo, activeCell.nivel, 'trimestre1', v)}
              />
              <TextArea
                label="Trimestre 2"
                value={active.trimestre2}
                onChange={(v) => updateCell(activeCell.grupo, activeCell.nivel, 'trimestre2', v)}
              />
              <TextArea
                label="Trimestre 3"
                value={active.trimestre3}
                onChange={(v) => updateCell(activeCell.grupo, activeCell.nivel, 'trimestre3', v)}
              />
              <TextArea
                label="Meta general"
                value={active.metaGeneral}
                onChange={(v) => updateCell(activeCell.grupo, activeCell.nivel, 'metaGeneral', v)}
              />
            </div>
          )}
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

function TextArea({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <textarea
        rows={3}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
      />
    </label>
  );
}
