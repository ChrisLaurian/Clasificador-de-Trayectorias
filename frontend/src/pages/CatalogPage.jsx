import React, { useEffect, useState } from 'react';
import { Save, LayoutGrid, Loader2, CheckCircle2, AlertTriangle, Plus, Trash2, Users, Sparkles } from 'lucide-react';
import { getCatalog, saveCatalog, errMsg } from '../api/client';
import { LEVELS, LEVEL_LABEL, LEVEL_BADGE_COLOR } from '../constants';
import Modal from '../components/Modal.jsx';

const GRUPO_CODE_RE = /^[A-Za-z0-9]{1,12}$/;

const emptyCell = (grupo, nivel) => ({
  id: `${grupo}-${nivel}`,
  grupo,
  nivel,
  materia: '',
  dominioDisciplinar: '',
  metaGeneral: '',
  contenido: {},
});

const slug = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// Código de grupo derivado del nombre: sin acentos ni símbolos, en mayúsculas
// ("1° Primaria" -> "1PRIMARIA", "A1" -> "A1")
const codeFromNombre = (nombre) =>
  nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const tieneContenido = (entry) =>
  entry && [entry.perfil, entry.trimestre1, entry.trimestre2, entry.trimestre3, entry.metaGeneral]
    .some((v) => v && String(v).trim());

export default function CatalogPage() {
  const [catalog, setCatalog] = useState({ grupos: [], competencias: [], proyectos: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const [activeCell, setActiveCell] = useState(null); // {grupo, nivel}
  const [modalCell, setModalCell] = useState(false); // modal de edición de celda
  const [grupoModal, setGrupoModal] = useState(false); // modal "Añadir grupo"
  const [nombreGrupo, setNombreGrupo] = useState('');
  const [newComp, setNewComp] = useState('');
  const [grupoDraft, setGrupoDraft] = useState({}); // código temporal mientras se escribe

  useEffect(() => {
    getCatalog()
      .then((data) => setCatalog(data))
      .catch((err) => setError(errMsg(err, 'No se pudo cargar el catálogo')))
      .finally(() => setLoading(false));
  }, []);

  const getCell = (grupo, nivel) =>
    catalog.proyectos.find((p) => p.grupo === grupo && p.nivel === nivel) || emptyCell(grupo, nivel);

  const updateCell = (grupo, nivel, patch) =>
    setCatalog((c) => ({
      ...c,
      proyectos: c.proyectos.map((p) =>
        p.grupo === grupo && p.nivel === nivel ? { ...p, ...patch } : p
      ),
    }));

  const updateContenido = (grupo, nivel, compId, field, value) =>
    setCatalog((c) => ({
      ...c,
      proyectos: c.proyectos.map((p) => {
        if (p.grupo !== grupo || p.nivel !== nivel) return p;
        const contenido = { ...(p.contenido || {}) };
        contenido[compId] = {
          perfil: '', trimestre1: '', trimestre2: '', trimestre3: '', metaGeneral: '',
          ...(contenido[compId] || {}),
          [field]: value,
        };
        return { ...p, contenido };
      }),
    }));

  // --- Grupos ---
  const crearGrupo = (codigo, etiqueta, edad = null) =>
    setCatalog((c) => ({
      ...c,
      grupos: [...c.grupos, { codigo, etiqueta, edad }],
      proyectos: [...c.proyectos, ...LEVELS.map((n) => emptyCell(codigo, n))],
    }));

  // Modal "Añadir grupo": solo pide el nombre y listo
  const confirmarGrupo = () => {
    const nombre = nombreGrupo.trim();
    if (!nombre) {
      setError('Escribe el nombre del grupo');
      return;
    }
    const codigo = codeFromNombre(nombre);
    if (!codigo || codigo.length > 12) {
      setError(
        'Nombre inválido: debe generar un código de hasta 12 letras/números, p. ej. "1° Primaria" o "A1"'
      );
      return;
    }
    if (catalog.grupos.some((g) => g.codigo === codigo)) {
      setError(`El grupo ${codigo} ya existe`);
      return;
    }
    setError('');
    // Si el nombre ya es el código (p. ej. "A1"), no hace falta etiqueta
    crearGrupo(codigo, codigo === nombre.toUpperCase() ? '' : nombre);
    setNombreGrupo('');
    setGrupoModal(false);
  };

  const updateGrupo = (codigo, patch) =>
    setCatalog((c) => ({
      ...c,
      grupos: c.grupos.map((g) => (g.codigo === codigo ? { ...g, ...patch } : g)),
    }));

  const commitRenameGrupo = (oldCode) => {
    const rawNew = grupoDraft[oldCode];
    setGrupoDraft((d) => {
      const next = { ...d };
      delete next[oldCode];
      return next;
    });
    if (rawNew === undefined) return;
    const newCode = String(rawNew).trim().toUpperCase();
    if (!newCode || newCode === oldCode) return;
    if (!GRUPO_CODE_RE.test(newCode)) {
      setError('Código de grupo inválido: usa solo letras y números (máx. 12), p. ej. A1, A2, B3');
      return;
    }
    if (catalog.grupos.some((g) => g.codigo === newCode)) {
      setError(`El grupo ${newCode} ya existe`);
      return;
    }
    setError('');
    setCatalog((c) => ({
      ...c,
      grupos: c.grupos.map((g) => (g.codigo === oldCode ? { ...g, codigo: newCode } : g)),
      proyectos: c.proyectos.map((p) =>
        p.grupo === oldCode ? { ...p, grupo: newCode, id: `${newCode}-${p.nivel}` } : p
      ),
    }));
    if (activeCell?.grupo === oldCode) setActiveCell({ ...activeCell, grupo: newCode });
  };

  const removeGrupo = (codigo) => {
    if (!window.confirm(`¿Eliminar el grupo ${codigo} y sus proyectos?`)) return;
    setCatalog((c) => ({
      ...c,
      grupos: c.grupos.filter((g) => g.codigo !== codigo),
      proyectos: c.proyectos.filter((p) => p.grupo !== codigo),
    }));
    if (activeCell?.grupo === codigo) setActiveCell(null);
  };

  // --- Competencias ---
  const addCompetencia = () => {
    const nombre = newComp.trim();
    if (!nombre) return;
    let id = slug(nombre) || `competencia_${Date.now()}`;
    if (catalog.competencias.some((c) => c.id === id)) id = `${id}_${Date.now()}`;
    setCatalog((c) => ({ ...c, competencias: [...c.competencias, { id, nombre, core: false }] }));
    setNewComp('');
  };

  const renameCompetencia = (id, nombre) =>
    setCatalog((c) => ({
      ...c,
      competencias: c.competencias.map((x) => (x.id === id ? { ...x, nombre } : x)),
    }));

  const removeCompetencia = (comp) => {
    if (comp.core) return;
    if (!window.confirm(`¿Eliminar la competencia "${comp.nombre}" del catálogo?`)) return;
    setCatalog((c) => ({
      ...c,
      competencias: c.competencias.filter((x) => x.id !== comp.id),
      proyectos: c.proyectos.map((p) => {
        if (!p.contenido) return p;
        const contenido = { ...p.contenido };
        delete contenido[comp.id];
        return { ...p, contenido };
      }),
    }));
  };

  // --- Guardar ---
  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await saveCatalog(catalog);
      setCatalog(saved);
      setFlash('Catálogo guardado correctamente.');
      setTimeout(() => setFlash(''), 2500);
      return true;
    } catch (err) {
      setError(errMsg(err, 'No se pudo guardar el catálogo'));
      return false;
    } finally {
      setSaving(false);
    }
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
      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="text-brand-600" size={22} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Catálogo de Proyectos</h1>
            <p className="text-sm text-gray-500">
              Grupos, competencias obligatorias y proyectos por Grupo × Nivel.
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

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {flash && (
        <div className="mb-4 flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg text-sm">
          <CheckCircle2 size={16} /> {flash}
        </div>
      )}

      <div className="space-y-6">
          {/* ---------- Grupos ---------- */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-brand-600" />
              <h2 className="text-sm font-semibold text-gray-800">Grupos</h2>
              <span className="text-xs text-gray-400">(añade subgrupos como A1, A2, A3)</span>
            </div>

            <div className="space-y-2">
              {catalog.grupos.map((g) => (
                <div key={g.codigo} className="flex items-center gap-2 flex-wrap">
                  <input
                    value={grupoDraft[g.codigo] ?? g.codigo}
                    onChange={(e) =>
                      setGrupoDraft((d) => ({ ...d, [g.codigo]: e.target.value.toUpperCase() }))
                    }
                    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                    onBlur={() => commitRenameGrupo(g.codigo)}
                    className="w-20 text-sm border border-gray-300 rounded-lg px-2 py-1.5 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase"
                    title="Código del grupo (se aplica al salir del campo)"
                  />
                  <input
                    value={g.etiqueta || ''}
                    placeholder="Etiqueta (opcional)"
                    onChange={(e) => updateGrupo(g.codigo, { etiqueta: e.target.value })}
                    className="flex-1 min-w-[160px] text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={g.edad ?? ''}
                    placeholder="Edad"
                    onChange={(e) =>
                      updateGrupo(g.codigo, {
                        edad: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="w-20 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    title="Edad aproximada (aparece en el PDF)"
                  />
                  <button
                    onClick={() => removeGrupo(g.codigo)}
                    className="text-gray-400 hover:text-rose-600 p-1.5"
                    title="Eliminar grupo"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => {
                  setNombreGrupo('');
                  setError('');
                  setGrupoModal(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium bg-brand-50 text-brand-700 hover:bg-brand-100 px-3 py-2 rounded-lg"
              >
                <Plus size={14} /> Añadir grupo
              </button>
            </div>
          </section>

          {/* ---------- Competencias ---------- */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-brand-600" />
              <h2 className="text-sm font-semibold text-gray-800">Competencias</h2>
              <span className="text-xs text-gray-400">
                (las 5 obligatorias no se pueden eliminar)
              </span>
            </div>

            <div className="space-y-2">
              {catalog.competencias.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <input
                    value={c.nombre}
                    onChange={(e) => renameCompetencia(c.id, e.target.value)}
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  {c.core ? (
                    <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Obligatoria
                    </span>
                  ) : (
                    <button
                      onClick={() => removeCompetencia(c)}
                      className="text-gray-400 hover:text-rose-600 p-1.5"
                      title="Eliminar competencia"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
              <input
                value={newComp}
                placeholder="Nueva competencia (ej. Creatividad digital)"
                onChange={(e) => setNewComp(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCompetencia()}
                className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                onClick={addCompetencia}
                className="inline-flex items-center gap-1 text-xs font-medium bg-brand-50 text-brand-700 hover:bg-brand-100 px-3 py-2 rounded-lg"
              >
                <Plus size={14} /> Añadir
              </button>
            </div>
          </section>

          {/* ---------- Matriz ---------- */}
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
                {catalog.grupos.map((grupo) => (
                  <tr key={grupo.codigo} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {grupo.etiqueta || grupo.codigo}
                      <span className="block text-[11px] text-gray-400 font-normal">
                        Grupo {grupo.codigo}
                      </span>
                    </td>
                    {LEVELS.map((nivel) => {
                      const cell = getCell(grupo.codigo, nivel);
                      const isActive =
                        activeCell?.grupo === grupo.codigo && activeCell?.nivel === nivel;
                      const listos = catalog.competencias.filter((c) =>
                        tieneContenido(cell.contenido?.[c.id])
                      ).length;
                      return (
                        <td key={nivel} className="px-4 py-3">
                          <button
                            onClick={() => {
                              setActiveCell({ grupo: grupo.codigo, nivel });
                              setModalCell(true);
                            }}
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
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {listos}/{catalog.competencias.length} competencias
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
        </div>

        {/* ---------- Modal de edición de la celda (proyecto + competencias) ---------- */}
        {modalCell && active && (
          <Modal
            title={`Grupo ${activeCell.grupo} · ${LEVEL_LABEL[activeCell.nivel]}`}
            subtitle="Materia, dominio, meta general y competencias del proyecto."
            onClose={() => setModalCell(false)}
            footer={
              <>
                <button
                  onClick={() => setModalCell(false)}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-300"
                >
                  Cerrar
                </button>
                <button
                  onClick={async () => {
                    const ok = await handleSave();
                    if (ok) setModalCell(false);
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-2 text-sm font-medium bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg"
                >
                  {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
                  Guardar y cerrar
                </button>
              </>
            }
          >
            <div className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Field
                label="Materia"
                value={active.materia}
                onChange={(v) => updateCell(activeCell.grupo, activeCell.nivel, 'materia', v)}
              />
              <Field
                label="Dominio disciplinar (aparece en la tabla)"
                value={active.dominioDisciplinar}
                onChange={(v) =>
                  updateCell(activeCell.grupo, activeCell.nivel, 'dominioDisciplinar', v)
                }
              />
              <TextArea
                label="Meta general del proyecto"
                value={active.metaGeneral}
                onChange={(v) => updateCell(activeCell.grupo, activeCell.nivel, 'metaGeneral', v)}
              />

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-700 mb-2">
                  Competencias ({catalog.competencias.length})
                </p>
                <p className="text-[11px] text-gray-400 mb-3">
                  En "Descripción del alumno" puedes usar {'{{nombre}}'}, {'{{grupo}}'},{' '}
                  {'{{nivel}}'} y {'{{edad}}'}: se reemplazan por cada alumno.
                </p>

                <div className="space-y-2">
                  {catalog.competencias.map((c, i) => (
                    <details key={c.id} className="border border-gray-200 rounded-lg group">
                      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg flex items-center justify-between">
                        <span>
                          <span className="text-gray-400 mr-2 text-xs">{i + 1}.</span>
                          {c.nombre}
                        </span>
                        <span className="text-gray-400 text-xs group-open:hidden">▾</span>
                        <span className="text-gray-400 text-xs hidden group-open:inline">▴</span>
                      </summary>
                      <div className="px-3 pb-3 pt-1 space-y-2">
                        <TextArea
                          label="Descripción del alumno (texto base)"
                          rows={2}
                          value={active.contenido?.[c.id]?.perfil}
                          onChange={(v) =>
                            updateContenido(activeCell.grupo, activeCell.nivel, c.id, 'perfil', v)
                          }
                        />
                        <TextArea
                          label="Trimestre 1"
                          rows={2}
                          value={active.contenido?.[c.id]?.trimestre1}
                          onChange={(v) =>
                            updateContenido(
                              activeCell.grupo, activeCell.nivel, c.id, 'trimestre1', v
                            )
                          }
                        />
                        <TextArea
                          label="Trimestre 2"
                          rows={2}
                          value={active.contenido?.[c.id]?.trimestre2}
                          onChange={(v) =>
                            updateContenido(
                              activeCell.grupo, activeCell.nivel, c.id, 'trimestre2', v
                            )
                          }
                        />
                        <TextArea
                          label="Trimestre 3"
                          rows={2}
                          value={active.contenido?.[c.id]?.trimestre3}
                          onChange={(v) =>
                            updateContenido(
                              activeCell.grupo, activeCell.nivel, c.id, 'trimestre3', v
                            )
                          }
                        />
                        <TextArea
                          label="Meta"
                          rows={2}
                          value={active.contenido?.[c.id]?.metaGeneral}
                          onChange={(v) =>
                            updateContenido(
                              activeCell.grupo, activeCell.nivel, c.id, 'metaGeneral', v
                            )
                          }
                        />
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          </Modal>
        )}

        {/* ---------- Modal: añadir grupo (solo el nombre) ---------- */}
        {grupoModal && (
          <Modal
            title="Añadir grupo"
            subtitle="Escribe el nombre del grupo y listo; el código se genera automáticamente."
            onClose={() => setGrupoModal(false)}
            size="max-w-md"
            footer={
              <>
                <button
                  onClick={() => setGrupoModal(false)}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-300"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarGrupo}
                  className="inline-flex items-center gap-2 text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg"
                >
                  <Plus size={15} /> Añadir
                </button>
              </>
            }
          >
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Nombre del grupo</span>
              <input
                autoFocus
                value={nombreGrupo}
                onChange={(e) => setNombreGrupo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmarGrupo()}
                placeholder='p. ej. "A1" o "1° Primaria"'
                className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            {nombreGrupo.trim() && (
              <p className="text-[11px] text-gray-400 mt-2">
                Código resultante:{' '}
                <span className="font-mono font-medium text-gray-600">
                  {codeFromNombre(nombreGrupo) || '—'}
                </span>
              </p>
            )}
            {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
          </Modal>
        )}
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

function TextArea({ label, value, onChange, rows = 3 }) {
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
