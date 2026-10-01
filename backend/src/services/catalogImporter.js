// Importa el contenido del catálogo desde un archivo CSV/Excel.
//
// Detecta las columnas por nombre (sin distinguir mayúsculas ni acentos):
//   Nivel | Competencia | Diagnóstico | Trimestre 1 | Trimestre 2 | Trimestre 3 | Meta General
//   (opcionales: Grupo)
// y rellena cada celda (grupo × nivel) de las competencias indicadas.
// "Diagnóstico" se guarda como `perfil` ("Descripción del alumno" en la matriz).
const XLSX = require('xlsx');
const { LEVELS, LEVEL_LABEL } = require('../constants');

function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Campo interno -> encabezados aceptados (ya normalizados con norm())
const CAMPOS = [
  { campo: 'nivel', opciones: ['nivel'] },
  { campo: 'grupo', opciones: ['grupo', 'grupo destino'], requerido: false },
  { campo: 'competencia', opciones: ['competencia', 'area competencia', 'eje'] },
  { campo: 'perfil', opciones: ['diagnostico', 'descripcion', 'descripcion del alumno', 'perfil'] },
  { campo: 'trimestre1', opciones: ['trimestre 1', 't1', 'primer trimestre'] },
  { campo: 'trimestre2', opciones: ['trimestre 2', 't2', 'segundo trimestre'] },
  { campo: 'trimestre3', opciones: ['trimestre 3', 't3', 'tercer trimestre'] },
  { campo: 'metaGeneral', opciones: ['meta general', 'meta'] },
];

const CAMPOS_CONTENIDO = ['perfil', 'trimestre1', 'trimestre2', 'trimestre3', 'metaGeneral'];

const NIVELES = (() => {
  const m = {};
  LEVELS.forEach((n) => {
    m[norm(LEVEL_LABEL[n])] = n; // basico -> B
    m[n] = n; // b -> B
  });
  return m;
})();

function toNivel(v) {
  return NIVELES[norm(v)] || null;
}

// El texto del archivo puede venir en UTF-8 o Latin-1; se decide por contenido.
function bufferToText(buffer) {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString('utf8');
  }
  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  return buffer.toString('latin1');
}

function readMatrix(buffer, filename = '') {
  const esExcel = /\.xlsx?$/i.test(filename) || buffer.slice(0, 2).toString() === 'PK';
  if (esExcel) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('El archivo no tiene hojas legibles');
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  }
  const workbook = XLSX.read(bufferToText(buffer), { type: 'string' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no tiene contenido legible');
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
}

function findHeaderRow(matrix) {
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const celdas = (matrix[i] || []).map(norm);
    if (celdas.includes('nivel') && celdas.some((c) => CAMPOS[2].opciones.includes(c))) return i;
  }
  return -1;
}

function detectColumns(headerRow) {
  const celdas = headerRow.map((c) => norm(c));
  const columnas = {}; // campo -> indice
  const etiquetas = {}; // campo -> encabezado original
  for (const { campo, opciones } of CAMPOS) {
    const idx = celdas.findIndex((c) => c && opciones.includes(c));
    if (idx !== -1) {
      columnas[campo] = idx;
      etiquetas[campo] = String(headerRow[idx] ?? '').trim();
    }
  }
  return { columnas, etiquetas };
}

// Analiza el archivo y devuelve las filas listas para aplicar.
function parseFile(buffer, filename = '') {
  const matrix = readMatrix(buffer, filename);
  if (!matrix.length) throw new Error('El archivo está vacío');

  const headerIdx = findHeaderRow(matrix);
  if (headerIdx === -1) {
    const headers = (matrix[0] || []).map((c) => String(c).trim()).filter(Boolean).join(', ');
    throw new Error(
      `No se detectaron las columnas "Nivel" y "Competencia". Encabezados encontrados: ${headers || '(ninguno)'}`
    );
  }

  const { columnas, etiquetas } = detectColumns(matrix[headerIdx]);
  if (columnas.nivel === undefined || columnas.competencia === undefined) {
    const headers = (matrix[headerIdx] || []).map((c) => String(c).trim()).filter(Boolean).join(', ');
    const falta = columnas.nivel === undefined ? '"Nivel"' : '"Competencia"';
    throw new Error(`Falta la columna ${falta}. Encabezados encontrados: ${headers}`);
  }

  const filas = [];
  let descartadas = 0;
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const nivel = toNivel(row[columnas.nivel]);
    const competencia = String(row[columnas.competencia] ?? '').trim();
    if (!nivel || !competencia) {
      if (row.some((c) => String(c ?? '').trim())) descartadas++;
      continue;
    }
    const fila = { nivel, competencia, grupo: '' };
    if (columnas.grupo !== undefined) {
      fila.grupo = String(row[columnas.grupo] ?? '').trim().toUpperCase();
    }
    for (const campo of CAMPOS_CONTENIDO) {
      fila[campo] = String(row[columnas[campo]] ?? '').trim();
    }
    filas.push(fila);
  }

  return { columnas: etiquetas, filas, descartadas };
}

// Aplica las filas al catálogo (se muta una copia) y devuelve un resumen.
function applyToCatalog(catalog, filas, gruposDestino = []) {
  const resumen = {
    grupos: [],
    filas: filas.length,
    niveles: [],
    competenciasCreadas: [],
    celdas: 0,
    descartadas: 0,
  };

  const porNombre = new Map(catalog.competencias.map((c) => [norm(c.nombre), c]));
  const ids = new Set(catalog.competencias.map((c) => c.id));
  const gruposSet = new Set(catalog.grupos.map((g) => g.codigo));
  const gruposFila = new Set();

  for (const f of filas) {
    // Competencia por nombre (con/sin acentos); si no existe, se crea.
    let comp = porNombre.get(norm(f.competencia));
    if (!comp) {
      let base = norm(f.competencia).replace(/ /g, '_') || 'competencia';
      let id = base;
      let n = 2;
      while (ids.has(id)) id = `${base}_${n++}`;
      comp = { id, nombre: f.competencia };
      catalog.competencias.push(comp);
      ids.add(id);
      porNombre.set(norm(comp.nombre), comp);
      resumen.competenciasCreadas.push(comp.nombre);
    }

    // Grupos destino: los de la columna "Grupo" o los seleccionados.
    const objetivos = f.grupo
      ? gruposSet.has(f.grupo)
        ? [f.grupo]
        : []
      : gruposDestino;
    if (f.grupo && !gruposSet.has(f.grupo)) resumen.descartadas++;
    if (!f.grupo && !gruposDestino.length) continue;

    for (const codigo of objetivos) {
      const proyecto = catalog.proyectos.find((p) => p.grupo === codigo && p.nivel === f.nivel);
      if (!proyecto) continue;
      if (!proyecto.contenido || typeof proyecto.contenido !== 'object') proyecto.contenido = {};
      const previo = proyecto.contenido[comp.id] || {};
      const next = { ...previo };
      for (const campo of CAMPOS_CONTENIDO) {
        if (f[campo]) next[campo] = f[campo];
      }
      proyecto.contenido[comp.id] = next;
      resumen.celdas++;
      gruposFila.add(codigo);
    }

    if (!resumen.niveles.includes(f.nivel)) resumen.niveles.push(f.nivel);
  }

  resumen.grupos = [...gruposFila].sort();
  return resumen;
}

module.exports = { parseFile, applyToCatalog, norm, toNivel };
