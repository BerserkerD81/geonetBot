import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { 
  Shield, UserCircle2, X, Trash2, Loader2, 
  CheckCircle2, AlertCircle, UserPlus, Edit3, RotateCcw 
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface AdminUser {
  id: number;
  email: string;
  name?: string;
  role: 'user' | 'admin';
  isTwoFactorEnabled: boolean;
}

interface CreateUserForm {
  email: string;
  name: string;
  password?: string;
  role: 'user' | 'admin';
}

interface AdminUserPanelProps {
  onClose: () => void;
}

const INITIAL_FORM_STATE: CreateUserForm = {
  email: '',
  name: '',
  password: '',
  role: 'user',
};

export function AdminUserPanel({ onClose }: AdminUserPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [formData, setFormData] = useState<CreateUserForm>(INITIAL_FORM_STATE);
  const [editingId, setEditingId] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const showFeedback = useCallback((type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, []);

  const loadUsers = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/users`, {
        signal: abortControllerRef.current.signal,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar');
      setUsers(data.users ?? []);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      showFeedback('error', 'Error de sincronización.');
    } finally {
      setLoading(false);
    }
  }, [showFeedback]);

  useEffect(() => {
    void loadUsers();
    return () => abortControllerRef.current?.abort();
  }, [loadUsers]);

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM_STATE);
  };

  const onEditClick = (user: AdminUser) => {
    setEditingId(user.id);
    setFormData({
      email: user.email,
      name: user.name || '',
      role: user.role,
      password: '',
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const isEditing = editingId !== null;
    try {
      const res = await fetch(isEditing ? `${API_BASE}/admin/users/${editingId}` : `${API_BASE}/admin/users`, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error();
      showFeedback('success', isEditing ? 'Usuario actualizado' : 'Usuario creado');
      handleCancelEdit();
      await loadUsers();
    } catch {
      showFeedback('error', 'Error en la operación.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId: number) => {
    if (!window.confirm('¿Eliminar usuario?')) return;
    try {
      await fetch(`${API_BASE}/admin/users/${userId}`, { method: 'DELETE', credentials: 'include' });
      setUsers(prev => prev.filter(u => u.id !== userId));
      showFeedback('success', 'Eliminado');
    } catch {
      showFeedback('error', 'Error al eliminar');
    }
  };

  return (
    <div className="absolute inset-0 z-30 bg-neutral-950 flex flex-col animate-in fade-in duration-300">
      
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Shield className="size-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-white uppercase">Panel de Control</h2>
            <p className="text-[11px] text-neutral-500 font-medium">Gestión de usuarios y accesos</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose} 
          className="rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          <X className="size-5" />
        </Button>
      </header>

      {/* NOTIFICACIONES */}
      {feedback && (
        <div className={`fixed top-20 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl animate-in slide-in-from-right-5 ${
          feedback.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-red-500/10 border-red-500/50 text-red-400'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
          <p className="text-xs font-bold uppercase tracking-wide">{feedback.message}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-10">
        
        {/* FORM SECTION */}
        <div ref={formRef} className="max-w-5xl mx-auto">
          <Card className={`transition-all duration-500 border border-neutral-800 bg-neutral-900 overflow-hidden ${
            editingId ? 'ring-1 ring-emerald-500/30 shadow-2xl shadow-emerald-500/5' : ''
          }`}>
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-800/30">
              <div className="flex items-center gap-2">
                {editingId ? <Edit3 className="size-4 text-emerald-500" /> : <UserPlus className="size-4 text-emerald-500" />}
                <h3 className="text-xs font-black uppercase tracking-widest text-neutral-200">
                  {editingId ? 'Editar Perfil' : 'Añadir Usuario'}
                </h3>
              </div>
              {editingId && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleCancelEdit} 
                  // FIX: Agregado hover:bg-neutral-800 para evitar el fondo blanco
                  className="h-7 text-[10px] font-bold text-neutral-400 hover:bg-neutral-800 hover:text-white transition-all"
                >
                  <RotateCcw className="size-3 mr-1" /> CANCELAR
                </Button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-neutral-500 uppercase ml-1">Email</Label>
                  <Input 
                    required 
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="bg-neutral-950 border-neutral-800 text-white focus:border-emerald-500/50 transition-all placeholder:text-neutral-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-neutral-500 uppercase ml-1">Nombre</Label>
                  <Input 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="bg-neutral-950 border-neutral-800 text-white focus:border-emerald-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-neutral-500 uppercase ml-1">Password</Label>
                  <Input 
                    type="password"
                    placeholder={editingId ? "••••••" : "Obligatorio"}
                    required={!editingId}
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="bg-neutral-950 border-neutral-800 text-white focus:border-emerald-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-neutral-500 uppercase ml-1">Rol</Label>
                  <select 
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value as 'user' | 'admin'})}
                    className="flex h-10 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-emerald-500/50 appearance-none"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </div>

              <Button 
                disabled={loading}
                className="w-full mt-6 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-xs h-11 transition-all shadow-lg shadow-emerald-900/20"
              >
                {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {editingId ? 'Confirmar Cambios' : 'Registrar'}
              </Button>
            </form>
          </Card>
        </div>

        {/* LIST SECTION */}
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center gap-3 px-2">
            <UserCircle2 className="size-5 text-neutral-500" />
            <h3 className="text-sm font-bold uppercase text-neutral-300">Usuarios Registrados</h3>
            <span className="px-2 py-0.5 rounded bg-neutral-800 text-[10px] font-black text-neutral-400 border border-neutral-700">
              {users.length}
            </span>
          </div>

          <div className="grid gap-3">
            {users.map((u) => (
              <div 
                key={u.id}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${
                  editingId === u.id 
                    ? 'border-emerald-500/50 bg-emerald-500/10' 
                    : 'border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                    u.role === 'admin' ? 'border-purple-500/30 bg-purple-500/10 text-purple-400' : 'border-neutral-700 bg-neutral-800 text-neutral-400'
                  }`}>
                    <span className="text-xs font-black">{u.name?.charAt(0) || u.email.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-white">{u.name || 'Sin nombre'}</p>
                      {u.role === 'admin' && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-black border border-purple-500/20">ADMIN</span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500">{u.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`hidden md:block text-[9px] font-black tracking-tight ${u.isTwoFactorEnabled ? 'text-emerald-500/70' : 'text-neutral-600'}`}>
                    {u.isTwoFactorEnabled ? '2FA ACTIVO' : '2FA INACTIVO'}
                  </span>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => onEditClick(u)}
                    // bg-neutral-800 y hover:bg-neutral-700 para consistencia oscura
                    className="h-8 px-4 bg-neutral-800 hover:bg-neutral-700 text-white text-[11px] font-bold uppercase border-none transition-colors"
                  >
                    Editar
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleDelete(u.id)}
                    className="h-8 w-8 text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}