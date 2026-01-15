import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { Shield, UserCircle2, History, X, Trash2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface AdminUser {
  id: number;
  email: string;
   name?: string;
  role: 'user' | 'admin';
  isTwoFactorEnabled: boolean;
}

interface AdminUserPanelProps {
  onClose: () => void;
  onOpenUserHistory?: (user: { id: number; email: string; name?: string }) => void;
}

export function AdminUserPanel({ onClose, onOpenUserHistory }: AdminUserPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');

  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user');

  const [selectedUserForHistory, setSelectedUserForHistory] = useState<AdminUser | null>(null);
  const [historyMessages, setHistoryMessages] = useState<
    { id: number; role: 'user' | 'assistant'; content: string; createdAt: string; imageUrl?: string | null }[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${API_BASE}/admin/users`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudieron cargar los usuarios');
        setUsers([]);
        return;
      }
      setUsers(data.users ?? []);
    } catch (err) {
      console.error(err);
      setError('Error de red al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  const openHistory = async (user: AdminUser) => {
    setSelectedUserForHistory(user);
    setHistoryMessages([]);
    setHistoryLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE}/admin/users/${user.id}/messages`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo cargar el historial de chats');
        return;
      }
      setHistoryMessages(data.messages ?? []);
    } catch (err) {
      console.error(err);
      setError('Error de red al cargar historial de chats');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email: newEmail, name: newName || undefined, password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo crear el usuario');
        return;
      }
      setSuccess('Usuario creado correctamente (debe configurar 2FA en su primer inicio de sesión).');
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('user');
      await loadUsers();
    } catch (err) {
      console.error(err);
      setError('Error de red al crear usuario');
    } finally {
      setLoading(false);
    }
  };

  const startEditUser = (user: AdminUser) => {
    setEditUser(user);
    setEditEmail(user.email);
    setEditName(user.name ?? '');
    setEditPassword('');
    setEditRole(user.role);
    setError('');
    setSuccess('');
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setError('');
    setSuccess('');

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/users/${editUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: editEmail,
          name: editName || undefined,
          role: editRole,
          password: editPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo actualizar el usuario');
        return;
      }
      setSuccess('Usuario actualizado correctamente.');
      setEditUser(null);
      await loadUsers();
    } catch (err) {
      console.error(err);
      setError('Error de red al actualizar usuario');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!window.confirm(`¿Eliminar al usuario ${user.email}? Esta acción no se puede deshacer.`)) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/users/${user.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo eliminar el usuario');
        return;
      }
      setSuccess('Usuario eliminado correctamente.');
      if (editUser && editUser.id === user.id) {
        setEditUser(null);
      }
      if (selectedUserForHistory && selectedUserForHistory.id === user.id) {
        setSelectedUserForHistory(null);
        setHistoryMessages([]);
      }
      await loadUsers();
    } catch (err) {
      console.error(err);
      setError('Error de red al eliminar usuario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 bg-neutral-950/90 backdrop-blur-xl flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800/70 bg-gradient-to-r from-neutral-950 to-neutral-900/90">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/40">
            <Shield className="size-4 text-emerald-400" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-white">Panel de administración</h2>
            <p className="text-[11px] text-neutral-400">Gestión de usuarios y revisión de chats</p>
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
        <Card className="bg-neutral-900/80 border-neutral-800/80 p-4 sm:p-5 space-y-4 shadow-lg shadow-black/40">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Crear nuevo usuario</h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Define credenciales iniciales; el usuario activará 2FA en su primer inicio de sesión.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateUser} className="grid gap-3 md:grid-cols-4 items-end">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="new-email" className="text-xs text-neutral-300">
                Correo electrónico
              </Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                disabled={loading}
                className="h-9 text-sm bg-neutral-900/80 border-neutral-700/80 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-emerald-500/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-name" className="text-xs text-neutral-300">
                Nombre (opcional)
              </Label>
              <Input
                id="new-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={loading}
                className="h-9 text-sm bg-neutral-900/80 border-neutral-700/80 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-emerald-500/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs text-neutral-300">
                Contraseña inicial
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={loading}
                className="h-9 text-sm bg-neutral-900/80 border-neutral-700/80 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-emerald-500/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role" className="text-xs text-neutral-300">
                Rol
              </Label>
              <select
                id="new-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'user' | 'admin')}
                disabled={loading}
                className="h-9 text-sm bg-neutral-900/80 border border-neutral-700/80 rounded-md px-2 text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              >
                <option value="user">Usuario</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="md:col-span-4 h-9 text-xs bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-md shadow-emerald-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Guardando...' : 'Crear usuario'}
            </Button>
          </form>
        </Card>

        <Card className="bg-neutral-900/80 border-neutral-800/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-neutral-800/80 flex items-center justify-center">
                <UserCircle2 className="size-4 text-neutral-300" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Usuarios existentes</h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">Gestiona roles, contraseñas y consulta su actividad.</p>
              </div>
            </div>
          </div>
          {loading && users.length === 0 && (
            <p className="text-xs text-neutral-500">Cargando usuarios...</p>
          )}
          {!loading && users.length === 0 && (
            <p className="text-xs text-neutral-500">No hay usuarios registrados.</p>
          )}
          {users.length > 0 && (
            <div className="space-y-2 text-xs">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-800/80 bg-neutral-900/80 px-3 py-2 hover:border-emerald-600/60 hover:bg-neutral-900 transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="text-neutral-200 text-sm">
                      {u.name ? `${u.name} · ${u.email}` : u.email}
                    </span>
                    <span className="text-neutral-500">
                      {u.role === 'admin' ? 'Administrador' : 'Usuario'} • 2FA:{' '}
                      {u.isTwoFactorEnabled ? 'Activo' : 'Pendiente'}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-[11px] text-neutral-300 hover:text-emerald-400 hover:bg-neutral-800/70"
                      onClick={() => {
                        void openHistory(u);
                        onOpenUserHistory?.({ id: u.id, email: u.email, name: u.name });
                      }}
                    >
                      <History className="size-3 mr-1" />
                      Historial
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-[11px] text-neutral-300 hover:text-white hover:bg-neutral-800/70"
                      onClick={() => startEditUser(u)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-900/30"
                      onClick={() => handleDeleteUser(u)}
                      disabled={loading}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {editUser && (
          <Card className="bg-neutral-900/80 border-neutral-800/80 p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">
              Editar usuario: <span className="text-neutral-300">{editUser.email}</span>
            </h3>
            <form onSubmit={handleUpdateUser} className="grid gap-3 md:grid-cols-4 items-end">
              <div className="md:col-span-2 space-y-1.5">
                <Label htmlFor="edit-email" className="text-xs text-neutral-300">
                  Correo electrónico
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-9 text-sm bg-neutral-900/80 border-neutral-700/80 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-emerald-500/60"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs text-neutral-300">
                  Nombre (opcional)
                </Label>
                <Input
                  id="edit-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={loading}
                  className="h-9 text-sm bg-neutral-900/80 border-neutral-700/80 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-emerald-500/60"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-password" className="text-xs text-neutral-300">
                  Nueva contraseña (opcional)
                </Label>
                <Input
                  id="edit-password"
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  disabled={loading}
                  className="h-9 text-sm bg-neutral-900/80 border-neutral-700/80 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-emerald-500/60"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-role" className="text-xs text-neutral-300">
                  Rol
                </Label>
                <select
                  id="edit-role"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as 'user' | 'admin')}
                  disabled={loading}
                  className="h-9 text-sm bg-neutral-900/80 border border-neutral-700/80 rounded-md px-2 text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                >
                  <option value="user">Usuario</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="md:col-span-4 h-9 text-xs bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-md shadow-emerald-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Guardando cambios...' : 'Guardar cambios'}
              </Button>
            </form>
          </Card>
        )}

        {(error || success) && (
          <div className="space-y-2 text-xs">
            {error && (
              <p className="px-3 py-2 rounded-md border border-red-500/40 bg-red-500/10 text-red-300">
                {error}
              </p>
            )}
            {success && (
              <p className="px-3 py-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                {success}
              </p>
            )}
          </div>
        )}

        {selectedUserForHistory && (
          <Card className="bg-neutral-900/90 border-neutral-800/90 p-4 sm:p-5 space-y-3 shadow-inner shadow-black/60">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                Historial de chats de{' '}
                <span className="text-neutral-300">
                  {selectedUserForHistory.name || selectedUserForHistory.email}
                </span>
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-neutral-300 hover:text-white hover:bg-neutral-800/80"
                onClick={() => {
                  setSelectedUserForHistory(null);
                  setHistoryMessages([]);
                }}
              >
                Cerrar historial
              </Button>
            </div>
            {historyLoading && (
              <p className="text-xs text-neutral-500">Cargando historial...</p>
            )}
            {!historyLoading && historyMessages.length === 0 && (
              <p className="text-xs text-neutral-500">
                No hay mensajes registrados para este usuario.
              </p>
            )}
            {!historyLoading && historyMessages.length > 0 && (
              <div className="max-h-80 overflow-y-auto space-y-2 text-xs custom-scrollbar">
                {historyMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border px-3 py-2 whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'border-neutral-700 bg-neutral-900 text-neutral-100'
                        : 'border-emerald-700/70 bg-emerald-900/15 text-emerald-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">
                        {m.role === 'user' ? 'Usuario' : 'Asistente'}
                      </span>
                      <span className="text-[10px] text-neutral-500">
                        {new Date(m.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div>{m.content}</div>
                    {m.imageUrl && (
                      <div className="mt-2">
                        <img
                          src={m.imageUrl}
                          alt="Imagen de chat"
                          className="max-h-40 rounded-lg border border-neutral-700 object-contain bg-neutral-900"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
