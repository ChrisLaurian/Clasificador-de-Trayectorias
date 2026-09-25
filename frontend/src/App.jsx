import React from 'react';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { GraduationCap, LayoutGrid, UploadCloud, Users } from 'lucide-react';
import CatalogPage from './pages/CatalogPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import StudentsPage from './pages/StudentsPage.jsx';

const navItems = [
  { to: '/catalogo', label: 'Catálogo de Proyectos', icon: LayoutGrid },
  { to: '/carga', label: 'Carga Masiva', icon: UploadCloud },
  { to: '/alumnos', label: 'Alumnos', icon: Users },
];

export default function App() {
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
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/catalogo" replace />} />
          <Route path="/catalogo" element={<CatalogPage />} />
          <Route path="/carga" element={<UploadPage />} />
          <Route path="/alumnos" element={<StudentsPage />} />
        </Routes>
      </main>
    </div>
  );
}
