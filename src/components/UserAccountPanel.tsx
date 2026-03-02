import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { UserCircle2, X, KeyRound } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface UserAccountPanelProps {
  onClose: () => void;
}

export function UserAccountPanel({ onClose }: UserAccountPanelProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword || !newPassword) {
      setError('Completa la contraseña actual y la nueva.');
      return;
    }
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/auth/password/change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({} as unknown));
      if (!res.ok) {
        let message = 'No se pudo cambiar la contraseña';
        if (typeof data === 'object' && data !== null && 'error' in data) {
          const errVal = (data as { error?: unknown }).error;
          if (typeof errVal === 'string') {
            message = errVal;
          }
        }
        setError(message);
        return;
      }
      setSuccess('Contraseña actualizada correctamente.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error(err);
      setError('Error de red al cambiar la contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-gray-50 flex flex-col">
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e3a8a]">
            <UserCircle2 className="size-4 text-orange-500" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-gray-900 leading-tight">Mi cuenta</h2>
            <p className="text-[11px] text-gray-400">Actualiza tu perfil y contraseña</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 rounded-full hover:bg-[#1e3a8a]/10 text-[#1e3a8a] hover:text-[#f5831f] transition-colors"
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        {/* Profile summary */}
        <Card className="bg-white border-gray-200 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarImage src={undefined} alt={user?.name || user?.email || 'Usuario'} />
              <AvatarFallback className="bg-[#1e3a8a]/10 text-[#f5831f] text-sm font-semibold border border-[#1e3a8a]/20">
                {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {user?.name || 'Tu perfil'}
              </div>
              <div className="text-xs text-gray-400 truncate">
                {user?.email}
              </div>
            </div>
          </div>
        </Card>
        {/* D        <Card className="bg-white border-gray-200 p-4 sm:p-5 space-y-4 shadow-lg shadow-black/40">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Datos personales</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">Actualiza tu nombre visible en la aplicación.</p>
            </div>
          </div>
          <form onSubmit={handleUpdateProfile} className="grid gap-3 md:grid-cols-3 items-end">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="profile-email" className="text-xs text-gray-700">Correo</Label>
              <Input
                id="profile-email"
                type="email"
                value={user?.email ?? ''}
                readOnly
                className="h-9 text-sm bg-gray-50/80 border-gray-300 text-gray-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-name" className="text-xs text-gray-700">Nombre</Label>
              <Input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="h-9 text-sm bg-gray-50/80 border-gray-300 text-gray-900 placeholder:text-gray-400 focus-visible:ring-orange-400/60"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="md:col-span-3 h-9 text-xs bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-gray-900 shadow-md shadow-orange-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </form>
        </Card>atos personales siempre visibles */}


        <Card className="bg-white border-gray-200 p-5 sm:p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#1e3a8a]/10 border border-[#1e3a8a]/20 flex items-center justify-center shrink-0">
              <KeyRound className="size-4 text-[#f5831f]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 leading-tight">
                Cambiar contraseña
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Por seguridad, introduce tu contraseña actual y define una nueva.
              </p>
            </div>
          </div>

          <div className="h-px bg-gray-200" />

          {/* Form */}
          <form onSubmit={handleChangePassword} className="grid gap-4 md:grid-cols-3 items-end">

            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="current-password" className="text-xs text-gray-500">
                Contraseña actual
              </Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={loading}
                className="h-10 text-sm bg-white border-gray-200 text-gray-900
                   focus-visible:ring-orange-400/50"
              />
            </div>

            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="new-password" className="text-xs text-gray-500">
                Nueva contraseña
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
                className="h-10 text-sm bg-white border-gray-200 text-gray-900
                   focus-visible:ring-orange-400/50"
              />
            </div>

            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="confirm-password" className="text-xs text-gray-500">
                Confirmar contraseña
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className="h-10 text-sm bg-white border-gray-200 text-gray-900
                   focus-visible:ring-orange-400/50"
              />
            </div>

            {/* CTA */}
            <div className="md:col-span-3 pt-2 flex justify-end">
              <Button
                type="submit"
                disabled={loading}
                className="h-10 px-6 text-sm font-semibold bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md transition-all"
              >
                {loading ? 'Guardando cambios…' : 'Actualizar contraseña'}
              </Button>
            </div>
          </form>
        </Card>


        {(error || success) && (
          <Alert
            className={`border ${error
                ? 'border-red-300 bg-red-50 text-red-600'
                : 'border-green-300 bg-green-50 text-green-600'
              }`}
          >
            <AlertTitle className={error ? 'text-red-500' : 'text-green-600'}>
              {error ? 'Error' : 'Éxito'}
            </AlertTitle>

            <AlertDescription className={error ? 'text-red-600/90' : 'text-green-600/90'}>
              {error || success}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}