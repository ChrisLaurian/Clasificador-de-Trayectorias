import React, { useEffect, useMemo, useState } from 'react';
import { Users, FileDown, FolderDown, Loader2, Search } from 'lucide-react';
import { getStudents, downloadStudentPDF, downloadGroupZIP } from '../api/client';
import { GROUPS, LEVELS, LEVEL_LABEL, LEVEL_BADGE_COLOR } from '../constants';
import StudentEditPanel from '../components/StudentEditPanel.jsx';

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterGrupo, setFilterGrupo] = useState('');
  const [filterNivel, setFilterNivel] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [zipLoading, setZipLoading] = useState(false);

  const load = () => {
    setLoading(true);
    getStudents().then((data) => {
      setStudents(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (filterGrupo && s.grupo !== filterGrupo) return false;
      if (filterNivel && s.nivel !== filterNivel) return false;
      if (search && !s.nombre.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [students, filterGrupo, filterNivel, search]);

  const handleDownloadOne = async (student) => {
    setDownloadingId(student.id);
    await downloadStudentPDF(student.id, student.nombre);
    setDownloadingId(null);
  };

  const handleDownloadZip = async () => {
    if (!filterGrupo) return;
    setZipLoading(true);
    await downloadGroupZIP(filterGrupo, filterNivel || undefined);
    setZipLoading(false);
  };

  const handleUpdated = (updated) => {
    setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setSelected(updated);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users className="text-brand-600" size={22} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Alumnos</h1>
            <p className="text-sm text-gray-500">
              Revisa los alumnos cargados, sus proyectos asignados y genera documentos.
            </p>
          </div>
        </div>

        <button
          onClick={handleDownloadZip}
          disabled={!filterGrupo || zipLoading}
          title={!filterGrupo ? 'Selecciona un grupo para habilitar la descarga' : ''}
          className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          {zipLoading ? <Loader2 className="animate-spin" size={16} /> : <FolderDown size={16} />}
          Descargar ZIP del grupo {filterGrupo || ''}
        </button>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre..."
            className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 w-56"
          />
        </div>

        <select
          value={filterGrupo}
          onChange={(e) => setFilterGrupo(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Todos los grupos</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              Grupo {g}
            </option>
          ))}
        </select>

        <select
          value={filterNivel}
          onChange={(e) => setFilterNivel(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Todos los niveles</option>
          {LEVELS.map((n) => (
            <option key={n} value={n}>
              {LEVEL_LABEL[n]}
            </option>
          ))}
        </select>

        <span className="text-xs text-gray-500 ml-auto">
          {filtered.length} alumno(s)
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-10">
          <Loader2 className="animate-spin" size={18} /> Cargando alumnos...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-sm text-gray-500">
          No hay alumnos que coincidan con los filtros. Carga un archivo en el módulo
          <span className="font-medium"> Carga Masiva</span>.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                <th className="text-left font-medium px-4 py-3">Nombre</th>
                <th className="text-left font-medium px-4 py-3">Grupo</th>
                <th className="text-left font-medium px-4 py-3">Nivel</th>
                <th className="text-left font-medium px-4 py-3">Materia asignada</th>
                <th className="text-left font-medium px-4 py-3">Meta general</th>
                <th className="text-right font-medium px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelected(s)}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{s.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{s.grupo}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${LEVEL_BADGE_COLOR[s.nivel]}`}
                    >
                      {LEVEL_LABEL[s.nivel]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                    {s.proyectoAsignado?.materia || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-sm truncate">
                    {s.proyectoAsignado?.metaGeneral || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadOne(s);
                      }}
                      disabled={downloadingId === s.id}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                    >
                      {downloadingId === s.id ? (
                        <Loader2 className="animate-spin" size={13} />
                      ) : (
                        <FileDown size={13} />
                      )}
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StudentEditPanel
        student={selected}
        onClose={() => setSelected(null)}
        onUpdated={handleUpdated}
      />
    </div>
  );
}
