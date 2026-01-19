import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { Shield, UserCircle2, X, KeyRound } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface UserAccountPanelProps {
  onClose: () => void;
}

export function UserAccountPanel({ onClose }: UserAccountPanelProps) {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState(user?.name ?? '');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as any).error || 'No se pudo actualizar el perfil');
        return;
      }
      setSuccess('Perfil actualizado correctamente.');
      await refreshUser();
    } catch (err) {
      console.error(err);
      setError('Error de red al actualizar perfil');
    } finally {
      setLoading(false);
    }
  };

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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as any).error || 'No se pudo cambiar la contraseña');
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
    <div className="absolute inset-0 z-30 bg-neutral-950/90 backdrop-blur-xl flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800/70 bg-gradient-to-r from-neutral-950 to-neutral-900/90">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/40">
            <UserCircle2 className="size-4 text-emerald-400" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-white">Mi cuenta</h2>
            <p className="text-[11px] text-neutral-400">Actualiza tu perfil y contraseña</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 rounded-full hover:bg-neutral-800/80 text-neutral-400 hover:text-neutral-100 transition-colors"
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {/* Tarjeta resumen superior */}
        <Card className="bg-neutral-900/80 border-neutral-800/80 p-4 sm:p-5 shadow-lg shadow-black/40">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarImage src={undefined} alt={user?.name || user?.email || 'Usuario'} />
              <AvatarFallback className="bg-emerald-600/20 text-emerald-300 text-sm">
                {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {user?.name || 'Tu perfil'}
              </div>
              <div className="text-xs text-neutral-400 truncate">
                {user?.email}
              </div>
            </div>
          </div>
        </Card>
        {/* D        <Card className="bg-neutral-900/80 border-neutral-800/80 p-4 sm:p-5 space-y-4 shadow-lg shadow-black/40">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Datos personales</h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">Actualiza tu nombre visible en la aplicación.</p>
            </div>
          </div>
          <form onSubmit={handleUpdateProfile} className="grid gap-3 md:grid-cols-3 items-end">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="profile-email" className="text-xs text-neutral-300">Correo</Label>
              <Input
                id="profile-email"
                type="email"
                value={user?.email ?? ''}
                readOnly
                className="h-9 text-sm bg-neutral-900/80 border-neutral-700/80 text-neutral-400"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-name" className="text-xs text-neutral-300">Nombre</Label>
              <Input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="h-9 text-sm bg-neutral-900/80 border-neutral-700/80 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-emerald-500/60"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="md:col-span-3 h-9 text-xs bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-md shadow-emerald-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </form>
        </Card>atos personales siempre visibles */}


        <Card className="bg-neutral-900/80 border-neutral-800/80 p-5 sm:p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <KeyRound className="size-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white leading-tight">
                  Cambiar contraseña
                </h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                  Por seguridad, introduce tu contraseña actual y define una nueva.
                </p>
              </div>
            </div>
          </div>

          <div className="h-px bg-neutral-800/80" />

          {/* Form */}
          <form onSubmit={handleChangePassword} className="grid gap-4 md:grid-cols-3 items-end">

            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="current-password" className="text-xs text-neutral-400">
                Contraseña actual
              </Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={loading}
                className="h-10 text-sm bg-neutral-950 border-neutral-800 text-neutral-100
                   focus-visible:ring-emerald-500/50"
              />
            </div>

            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="new-password" className="text-xs text-neutral-400">
                Nueva contraseña
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
                className="h-10 text-sm bg-neutral-950 border-neutral-800 text-neutral-100
                   focus-visible:ring-emerald-500/50"
              />
            </div>

            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="confirm-password" className="text-xs text-neutral-400">
                Confirmar contraseña
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className="h-10 text-sm bg-neutral-950 border-neutral-800 text-neutral-100
                   focus-visible:ring-emerald-500/50"
              />
            </div>

            {/* CTA */}
            <div className="md:col-span-3 pt-2 flex justify-end">
              <Button
                type="submit"
                disabled={loading}
                className="h-10 px-6 text-sm font-medium
                   bg-gradient-to-r from-emerald-500 to-green-600
                   hover:from-emerald-600 hover:to-green-700
                   shadow-lg shadow-emerald-500/20"
              >
                {loading ? 'Guardando cambios…' : 'Actualizar contraseña'}
              </Button>
            </div>
          </form>
        </Card>


        {(error || success) && (
          <Alert
            className={`border ${error
                ? 'border-red-500/60 bg-red-950/40 text-red-400'
                : 'border-green-500/60 bg-green-950/40 text-green-400'
              }`}
          >
            <AlertTitle className={error ? 'text-red-300' : 'text-green-300'}>
              {error ? 'Error' : 'Éxito'}
            </AlertTitle>

            <AlertDescription className={error ? 'text-red-400/90' : 'text-green-400/90'}>
              {error || success}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
