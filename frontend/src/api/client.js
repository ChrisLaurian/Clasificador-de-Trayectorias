import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Mensaje de error legible desde cualquier respuesta fallida
export const errMsg = (err, fallback = 'Ocurrió un error inesperado') =>
  err?.response?.data?.error || err?.message || fallback;

// --- Catálogo completo (grupos + competencias + proyectos) ---
export const getCatalog = () => api.get('/projects').then((r) => r.data);
export const saveCatalog = (catalog) => api.put('/projects', catalog).then((r) => r.data);

// --- Alumnos ---
export const getStudents = (params = {}) => api.get('/students', { params }).then((r) => r.data);
export const createStudent = (data) => api.post('/students', data).then((r) => r.data);
export const updateStudent = (id, data) => api.put(`/students/${id}`, data).then((r) => r.data);
export const reclassifyStudent = (id) => api.post(`/students/${id}/reclasificar`).then((r) => r.data);
export const deleteStudent = (id) => api.delete(`/students/${id}`);
export const deleteAllStudents = () => api.delete('/students');

// --- Carga masiva ---
export const uploadStudentsFile = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api
    .post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};

// --- Documentos ---
export const downloadStudentPDF = async (id, nombre) => {
  const res = await api.get(`/documents/student/${id}`, { responseType: 'blob' });
  triggerDownload(res.data, filenameFromResponse(res, `${nombre || 'alumno'}.pdf`));
};

export const downloadGroupZIP = async (grupo, nivel) => {
  const res = await api.get(`/documents/group/${grupo}`, {
    params: nivel ? { nivel } : {},
    responseType: 'blob',
  });
  triggerDownload(
    res.data,
    filenameFromResponse(res, `grupo_${grupo}${nivel ? '_' + nivel : ''}.zip`)
  );
};

// --- Exportación masiva (csv | xlsx | json | xml) ---
export const downloadExport = async (format, params = {}) => {
  const res = await api.get('/export', {
    params: { format, ...params },
    responseType: 'blob',
  });
  triggerDownload(res.data, filenameFromResponse(res, `alumnos.${format}`));
};

function filenameFromResponse(res, fallback) {
  const disposition = res.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match ? match[1] : fallback;
}

function triggerDownload(blobData, filename) {
  const url = window.URL.createObjectURL(new Blob([blobData]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default api;
