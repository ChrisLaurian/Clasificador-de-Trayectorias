import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, FileDown, FolderDown, Loader2, Search, Download, ChevronDown,
  FileSpreadsheet, FileJson, FileCode2, Table, AlertTriangle, X,
} from 'lucide-react';
import {
  getStudents, getCatalog, downloadStudentPDF, downloadGroupZIP, downloadExport, errMsg,
} from '../api/client';
import { LEVELS, LEVEL_LABEL, LEVEL_BADGE_COLOR } from '../constants';
import StudentEditPanel from '../components/StudentEditPanel.jsx';

const EXPORT_FORMATS = [
  { format: 'csv', label: 'CSV (Excel / hoja de cálculo)', icon: Table },
  { format: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
  { format: 'xml', label: 'XML (intercambio de datos)', icon: FileCode2 },
  { format: 'json', label: 'JSON (respaldo completo)', icon: FileJson },
];

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [catalog, setCatalog] = useState({ grupos: [], competencias: [] });
  const [loading, setLoading] = useState(true);
  const [filterGrupo, setFilterGrupo] = useState('');
  const [filterNivel, setFilterNivel] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [zipLoading, setZipLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getStudents(), getCatalog()])
      .then(([data, cat]) => {
        setStudents(data);
        setCatalog(cat);
      })
      .catch((err) => setError(errMsg(err, 'No se pudieron cargar los alumnos')))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (filterGrupo && s.grupo !== filterGrupo) return false;
      if (filterNivel && s.nivel !== filterNivel) return false;
      if (search && !s.nombre.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [students, filterGrupo, filterNivel, search]);

  const exportParams = () => ({
    ...(filterGrupo ? { grupo: filterGrupo } : {}),
    ...(filterNivel ? { nivel: filterNivel } : {}),
    ...(search ? { nombre: search } : {}),
  });

  const handleDownloadOne = async (student) => {
    setDownloadingId(student.id);
    setError('');
    try {
      await downloadStudentPDF(student.id, student.nombre);
    } catch (err) {
      setError(errMsg(err, 'No se pudo generar el PDF'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadZip = async () => {
    if (!filterGrupo) return;
    setZipLoading(true);
    setError('');
    try {
      await downloadGroupZIP(filterGrupo, filterNivel || undefined);
    } catch (err) {
      setError(errMsg(err, 'No se pudo generar el ZIP'));
    } finally {
      setZipLoading(false);
    }
  };

  const handleExport = async (format) => {
    setExportOpen(false);
    setExporting(format);
    setError('');
    try {
      await downloadExport(format, exportParams());
    } catch (err) {
      setError(errMsg(err, 'No se pudo exportar'));
    } finally {
      setExporting('');
    }
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
              Revisa los alumnos cargados, personaliza cada uno y genera documentos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownloadZip}
            disabled={!filterGrupo || zipLoading}
            title={!filterGrupo ? 'Selecciona un grupo para habilitar la descarga' : ''}
            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {zipLoading ? <Loader2 className="animate-spin" size={16} /> : <FolderDown size={16} />}
            ZIP del grupo {filterGrupo || ''}
          </button>

          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              disabled={!!exporting}
              className="inline-flex items-center gap-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg"
            >
              {exporting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Download size={16} />
              )}
              Exportar datos
              <ChevronDown size={14} />
            </button>

            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                  <p className="px-4 py-2 text-[11px] text-gray-400 border-b border-gray-100">
                    Respeta los filtros actuales
                  </p>
                  {EXPORT_FORMATS.map(({ format, label, icon: Icon }) => (
                    <button
                      key={format}
                      onClick={() => handleExport(format)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Icon size={15} className="text-gray-400" />
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-rose-400 hover:text-rose-600">
            <X size={14} />
          </button>
        </div>
      )}

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
          {catalog.grupos.map((g) => (
            <option key={g.codigo} value={g.codigo}>
              Grupo {g.codigo}
              {g.etiqueta ? ` · ${g.etiqueta}` : ''}
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
                <th className="text-left font-medium px-4 py-3">Dominio</th>
                <th className="text-left font-medium px-4 py-3">Competencias</th>
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
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                    {s.proyectoAsignado?.dominioDisciplinar || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {Object.keys(s.proyectoAsignado?.competencias || {}).length}/
                    {catalog.competencias.length}
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
        competencias={catalog.competencias}
        onClose={() => setSelected(null)}
        onUpdated={handleUpdated}
      />
    </div>
  );
}
