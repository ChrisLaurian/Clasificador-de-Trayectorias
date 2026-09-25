import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Loader2, AlertTriangle, LogIn, UserPlus } from 'lucide-react';
import { login, register, errMsg } from '../api/client';

export default function LoginPage() {
  const [modo, setModo] = useState('login'); // login | registro
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const cambiarModo = (m) => {
    setModo(m);
    setError('');
    setPassword2('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Escribe tu usuario y contraseña');
      return;
    }
    if (modo === 'registro' && password !== password2) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      if (modo === 'login') await login(username.trim(), password);
      else await register(username.trim(), password);
      navigate('/catalogo', { replace: true });
    } catch (err) {
      setError(errMsg(err, modo === 'login' ? 'No se pudo iniciar sesión' : 'No se pudo crear la cuenta'));
    } finally {
      setLoading(false);
    }
  };

  const esLogin = modo === 'login';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <GraduationCap className="text-brand-600" size={30} />
          <div>
            <p className="font-semibold text-gray-900 leading-tight">Proyectos Educativos</p>
            <p className="text-xs text-gray-500">Gestión y generación masiva</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-5">
            <button
              onClick={() => cambiarModo('login')}
              className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${
                esLogin ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => cambiarModo('registro')}
              className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${
                !esLogin ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Crear cuenta
            </button>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Usuario</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="tu_usuario"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={esLogin ? 'current-password' : 'new-password'}
                className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="••••••••"
              />
            </label>

            {!esLogin && (
              <label className="block">
                <span className="text-xs font-medium text-gray-500">Repetir contraseña</span>
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="••••••••"
                />
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : esLogin ? (
                <LogIn size={16} />
              ) : (
                <UserPlus size={16} />
              )}
              {esLogin ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>

          <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
            {esLogin
              ? 'Cada usuario tiene su propia lista de alumnos y su propia configuración.'
              : 'Al crear la cuenta obtienes tu propio espacio. El primer usuario en registrarse hereda los datos existentes.'}
          </p>
        </div>
      </div>
    </div>
  );
}
