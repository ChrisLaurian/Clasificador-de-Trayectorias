import React, { useEffect, useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { uploadStudentsFile, getCatalog, errMsg } from '../api/client';

export default function UploadPage() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [grupos, setGrupos] = useState([]);

  useEffect(() => {
    getCatalog()
      .then((cat) => setGrupos(cat.grupos.map((g) => g.codigo)))
      .catch(() => setGrupos([]));
  }, []);

  const handleSelect = (e) => {
    setFile(e.target.files[0] || null);
    setResult(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await uploadStudentsFile(file);
      setResult(data);
    } catch (err) {
      setError(errMsg(err, 'Ocurrió un error al procesar el archivo.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <UploadCloud className="text-brand-600" size={22} />
          <h1 className="text-xl font-semibold text-gray-900">Carga Masiva y Clasificación</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Sube un archivo Excel o CSV con columnas: <code className="bg-gray-100 px-1 rounded">nombre</code>,{' '}
          <code className="bg-gray-100 px-1 rounded">grupo</code>,{' '}
          <code className="bg-gray-100 px-1 rounded">nivel</code>,{' '}
          <code className="bg-gray-100 px-1 rounded">diagnostico</code>,{' '}
          <code className="bg-gray-100 px-1 rounded">intereses</code>,{' '}
          <code className="bg-gray-100 px-1 rounded">fortalezas</code>,{' '}
          <code className="bg-gray-100 px-1 rounded">areasMejora</code>. Cada alumno se clasificará
          automáticamente con el proyecto de su Grupo y Nivel.
        </p>
        {grupos.length > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            Grupos válidos: <span className="font-medium text-gray-600">{grupos.join(', ')}</span>
          </p>
        )}
      </header>

      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 hover:border-brand-400 rounded-xl p-10 text-center cursor-pointer bg-white transition-colors"
      >
        <FileSpreadsheet className="mx-auto text-gray-400 mb-3" size={36} />
        {file ? (
          <p className="text-sm font-medium text-gray-800">{file.name}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700">Haz clic para seleccionar un archivo</p>
            <p className="text-xs text-gray-400 mt-1">.xlsx, .xls o .csv</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleSelect}
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || loading}
        className="mt-4 inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
      >
        {loading ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
        Cargar y clasificar
      </button>

      {error && (
        <div className="mt-6 flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-lg">
            <CheckCircle2 size={16} />
            <span>
              {result.insertados} alumno(s) cargados y clasificados correctamente.
              {result.conErrores > 0 && ` ${result.conErrores} fila(s) con errores.`}
            </span>
          </div>

          {result.errores?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <p className="px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-200">
                Filas con errores
              </p>
              <ul className="divide-y divide-gray-100">
                {result.errores.map((e, i) => (
                  <li key={i} className="px-4 py-2 text-sm text-gray-700">
                    Fila {e.fila}: <span className="text-rose-600">{e.motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-sm text-gray-500">
            Ve al módulo <span className="font-medium text-gray-700">Alumnos</span> para revisar y
            personalizar los proyectos asignados.
          </p>
        </div>
      )}
    </div>
  );
}
