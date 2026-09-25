import React, { useEffect, useState } from 'react';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { GraduationCap, LayoutGrid, UploadCloud, Users, LogOut, Loader2 } from 'lucide-react';
import CatalogPage from './pages/CatalogPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import StudentsPage from './pages/StudentsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import { me, logout } from './api/client';

const navItems = [
  { to: '/catalogo', label: 'Catálogo de Proyectos', icon: LayoutGrid },
  { to: '/carga', label: 'Carga Masiva', icon: UploadCloud },
  { to: '/alumnos', label: 'Alumnos', icon: Users },
];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<AuthGuard />} />
    </Routes>
  );
}

// Exige sesión: mientras carga muestra un spinner y, si no hay sesión,
// redirige a /login (el cliente también re-dirige en cualquier 401).
function AuthGuard() {
  const [estado, setEstado] = useState('cargando'); // cargando | ok | sin
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    me()
      .then((data) => {
        setUsuario(data.user);
        setEstado('ok');
      })
      .catch(() => setEstado('sin'));
  }, []);

  if (estado === 'cargando') {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-gray-500">
        <Loader2 className="animate-spin" size={18} /> Cargando...
      </div>
    );
  }
  if (estado === 'sin') return <Navigate to="/login" replace />;
  return <Shell usuario={usuario} />;
}

function Shell({ usuario }) {
  const cerrarSesion = async () => {
    try {
      await logout();
    } finally {
      window.location.assign('/login');
    }
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-200">
          <GraduationCap className="text-brand-600" size={26} />
          <div>
            <p className="font-semibold text-gray-900 leading-tight">Proyectos Educativos</p>
            <p className="text-xs text-gray-500">Gestión y generación masiva</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-gray-200">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate" title={usuario?.username}>
                {usuario?.username}
              </p>
              <p className="text-[11px] text-gray-400">Sesión activa</p>
            </div>
            <button
              onClick={cerrarSesion}
              title="Cerrar sesión"
              className="text-gray-400 hover:text-rose-600 p-2 rounded-lg hover:bg-gray-50"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/catalogo" replace />} />
          <Route path="/catalogo" element={<CatalogPage />} />
          <Route path="/carga" element={<UploadPage />} />
          <Route path="/alumnos" element={<StudentsPage />} />
          <Route
            path="*"
            element={
              <div className="p-10 text-center text-sm text-gray-500">
                Página no encontrada.{' '}
                <a href="/catalogo" className="text-brand-600 hover:underline">
                  Volver al catálogo
                </a>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
