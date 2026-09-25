import React, { useEffect } from 'react';
import { X } from 'lucide-react';

// Modal genérico: cierra con Escape o clic fuera del panel.
export default function Modal({ title, subtitle, onClose, children, footer, size = 'max-w-3xl' }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-xl w-full ${size} max-h-[90vh] flex flex-col`}>
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 -m-1"
            title="Cerrar"
          >
            <X size={18} />
          </button>
        </header>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <footer className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
