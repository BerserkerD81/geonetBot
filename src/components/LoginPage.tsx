import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Bot, Lock, User, AlertCircle } from 'lucide-react';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const success = await login(username, password);

    if (!success) {
      setError('Credenciales inválidas. Intenta de nuevo.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-green-500/30 mb-4">
            <Bot className="size-8 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2">
            ISP Service Assistant
          </h1>
          <p className="text-sm text-neutral-400">
            Verifica disponibilidad de servicios y gestiona clientes
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-neutral-900/50 border border-neutral-800/50 rounded-2xl p-6 sm:p-8 backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm text-neutral-300">
                Usuario
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
                <Input
                  id="username"
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 bg-neutral-800/50 border-neutral-700/50 text-white placeholder:text-neutral-500 focus:border-emerald-500 h-11"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-neutral-300">
                Contraseña
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-neutral-800/50 border-neutral-700/50 text-white placeholder:text-neutral-500 focus:border-emerald-500 h-11"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertCircle className="size-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-medium shadow-lg shadow-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 pt-6 border-t border-neutral-800/50">
            <p className="text-xs text-neutral-500 mb-3 text-center">
              Credenciales de prueba:
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between bg-neutral-800/30 px-3 py-2 rounded-lg">
                <span className="text-neutral-400">Usuario:</span>
                <code className="text-emerald-400 font-mono">admin</code>
              </div>
              <div className="flex items-center justify-between bg-neutral-800/30 px-3 py-2 rounded-lg">
                <span className="text-neutral-400">Contraseña:</span>
                <code className="text-emerald-400 font-mono">admin123</code>
              </div>
            </div>
            <p className="text-xs text-neutral-600 mt-3 text-center">
              También: soporte/soporte123, tecnico/tecnico123
            </p>
          </div>
        </div>

        <p className="text-xs text-neutral-600 text-center mt-6">
          Sistema de autenticación simulado para pruebas
        </p>
      </div>
    </div>
  );
}
