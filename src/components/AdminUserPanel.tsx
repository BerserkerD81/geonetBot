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
    <div className="h-full w-full bg-gray-50 flex flex-col">
      
      {/* HEADER */}
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e3a8a]">
            <Shield className="size-4 text-orange-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Panel de Control</h2>
            <p className="text-[11px] text-gray-400">Gestión de usuarios y accesos</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose} 
          className="rounded-full text-[#1e3a8a] hover:bg-[#1e3a8a]/10 hover:text-[#f5831f] transition-colors"
        >
          <X className="size-5" />
        </Button>
      </header>

      {/* NOTIFICACIONES */}
      {feedback && (
        <div className={`fixed top-16 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl animate-in slide-in-from-right-5 duration-300 ${
          feedback.type === 'success'
            ? 'bg-white border-orange-200 text-orange-600'
            : 'bg-white border-red-200 text-red-600'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
          <p className="text-xs font-semibold">{feedback.message}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-10">
        
        {/* FORM SECTION */}
        <div ref={formRef} className="max-w-5xl mx-auto">
          <Card className={`transition-all duration-300 border border-gray-200 bg-white overflow-hidden ${
            editingId ? 'ring-2 ring-orange-300/60 shadow-lg shadow-orange-100/50' : ''
          }`}>
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
              <div className="flex items-center gap-2">
                {editingId ? <Edit3 className="size-3.5 text-orange-500" /> : <UserPlus className="size-3.5 text-gray-400" />}
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  {editingId ? 'Editar perfil' : 'Añadir usuario'}
                </h3>
              </div>
              {editingId && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleCancelEdit} 
                  // FIX: Agregado hover:bg-gray-100 para evitar el fondo blanco
                  className="h-7 text-[10px] font-bold text-[#1e3a8a] hover:bg-[#1e3a8a]/10 hover:text-[#f5831f] transition-all"
                >
                  <RotateCcw className="size-3 mr-1" /> CANCELAR
                </Button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-gray-400 uppercase ml-1">Email</Label>
                  <Input 
                    required 
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="bg-white border-gray-200 text-gray-900 focus:border-orange-300 transition-all placeholder:text-gray-300"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-gray-400 uppercase ml-1">Nombre</Label>
                  <Input 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="bg-white border-gray-200 text-gray-900 focus:border-orange-300 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-gray-400 uppercase ml-1">Password</Label>
                  <Input 
                    type="password"
                    placeholder={editingId ? "••••••" : "Obligatorio"}
                    required={!editingId}
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="bg-white border-gray-200 text-gray-900 focus:border-orange-300 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-gray-400 uppercase ml-1">Rol</Label>
                  <select 
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value as 'user' | 'admin'})}
                    className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-orange-300 appearance-none"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </div>

              <Button 
                disabled={loading}
                className="w-full mt-6 bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white font-semibold text-sm h-10 transition-all border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md"
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
            <UserCircle2 className="size-5 text-gray-400" />
            <h3 className="text-sm font-bold uppercase text-gray-700">Usuarios Registrados</h3>
            <span className="px-2 py-0.5 rounded bg-gray-100 text-[10px] font-black text-gray-500 border border-gray-300">
              {users.length}
            </span>
          </div>

          <div className="grid gap-3">
            {users.map((u) => (
              <div 
                key={u.id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${
                  editingId === u.id 
                    ? 'border-orange-200 bg-orange-50/50 shadow-sm shadow-orange-100' 
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                    u.role === 'admin' ? 'border-[#cdd8ff] bg-[#e8edff] text-[#1e3a8a]' : 'border-gray-300 bg-gray-100 text-gray-500'
                  }`}>
                    <span className="text-xs font-black">{u.name?.charAt(0) || u.email.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900">{u.name || 'Sin nombre'}</p>
                      {u.role === 'admin' && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#e8edff] text-[#1e3a8a] font-black border border-[#dbe5ff]">ADMIN</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`hidden md:block text-[9px] font-black tracking-tight ${u.isTwoFactorEnabled ? 'text-orange-500/70' : 'text-gray-400'}`}>
                    {u.isTwoFactorEnabled ? '2FA ACTIVO' : '2FA INACTIVO'}
                  </span>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => onEditClick(u)}
                    className="h-8 px-3 bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white text-[11px] font-semibold border border-white/15 transition-colors rounded-lg backdrop-blur-md"
                  >
                    Editar
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleDelete(u.id)}
                    className="h-8 w-8 text-[#1e3a8a] hover:text-[#f5831f] hover:bg-[#1e3a8a]/10 transition-all"
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