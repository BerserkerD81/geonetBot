import { useState, useEffect, useRef, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Bot, Lock, Mail, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';

export function LoginPage() {
  const { login, setup2fa, verify2faSetup, verify2faLogin } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'credentials' | 'setup2fa' | 'verify2fa'>('credentials');
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  
  const tokenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step !== 'credentials') {
      setTimeout(() => tokenInputRef.current?.focus(), 100);
    }
  }, [step]);

  // Si el token llega a 6 dígitos, enviamos automáticamente para mejorar la UX
  useEffect(() => {
    if (twoFactorToken.length === 6 && step !== 'credentials') {
      handleVerify2fa(new Event('submit') as unknown as FormEvent<HTMLFormElement>);
    }
  }, [twoFactorToken]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (!result.ok) {
        setError(result.error || 'Credenciales inválidas');
        setIsLoading(false);
        return;
      }

      if (result.requires2faSetup) {
        setPendingUserId(result.userId ?? null);
        const setup = await setup2fa();
        if ('error' in setup) throw new Error(setup.error);
        setQrImage(setup.qr);
        setStep('setup2fa');
      } else if (result.requires2faVerify) {
        setPendingUserId(result.userId ?? null);
        setStep('verify2fa');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Error de conexión');
      } else {
        setError('Error de conexión');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2fa = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');
    setIsLoading(true);

    let success = false;
    if (step === 'setup2fa') {
      success = await verify2faSetup(twoFactorToken);
    } else {
      if (!pendingUserId) {
        setStep('credentials');
        setIsLoading(false);
        return;
      }
      success = await verify2faLogin(pendingUserId, twoFactorToken);
    }

    if (!success) {
      setError('Código incorrecto');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo y Título */}
        <div className="flex flex-col items-center mb-10">
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Bot className="text-emerald-500 size-6" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">GeoNetBot</h1>
          </motion.div>
          <p className="text-neutral-500 text-sm mt-2">Panel de Control de Infraestructura</p>
        </div>

        <div className="bg-neutral-900/30 border border-neutral-800 rounded-2xl p-8 shadow-sm">
          <AnimatePresence mode="wait">
            {step === 'credentials' ? (
              <motion.form
                key="login"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-medium text-neutral-400 ml-1">Email corporativo</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-600" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 bg-neutral-950 border-neutral-800 text-white focus:border-emerald-500/50 h-11 transition-all"
                        placeholder="usuario@geonet.com"
                        required
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" university-className="text-xs font-medium text-neutral-400 ml-1">Contraseña</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-600" />
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 bg-neutral-950 border-neutral-800 text-white focus:border-emerald-500/50 h-11 transition-all"
                        placeholder="••••••••"
                        required
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-lg text-red-500 text-xs">
                    <AlertCircle className="size-4 shrink-0" />
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-all"
                >
                  {isLoading ? <Loader2 className="animate-spin size-5" /> : 'Iniciar Sesión'}
                </Button>
              </motion.form>
            ) : (
              <motion.form
                key="2fa"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                onSubmit={handleVerify2fa}
                className="space-y-6"
              >
                <div className="text-center">
                  <h2 className="text-white font-semibold">Doble Factor</h2>
                  <p className="text-xs text-neutral-500 mt-1">
                    {step === 'setup2fa' ? 'Configura tu autenticador' : 'Ingresa el código de seguridad'}
                  </p>
                </div>

                {step === 'setup2fa' && qrImage && (
                  <div className="flex justify-center p-2 bg-white rounded-xl w-fit mx-auto shadow-lg">
                    <img src={qrImage} alt="QR" className="w-32 h-32" />
                  </div>
                )}

                <Input
                  ref={tokenInputRef}
                  type="text"
                  maxLength={6}
                  value={twoFactorToken}
                  onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, ''))}
                  className="bg-neutral-950 border-neutral-800 text-white text-center text-2xl tracking-[0.4em] font-mono h-14 focus:border-emerald-500/50"
                  placeholder="000000"
                  required
                  disabled={isLoading}
                />

                <Button
                  type="submit"
                  disabled={isLoading || twoFactorToken.length < 6}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg"
                >
                  {isLoading ? <Loader2 className="animate-spin size-5" /> : 'Verificar Código'}
                </Button>

                <button
                  type="button"
                  onClick={() => setStep('credentials')}
                  className="w-full flex items-center justify-center gap-2 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                >
                  <ArrowLeft className="size-3" />
                  Cancelar
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
        
        <p className="text-center text-[10px] text-neutral-700 mt-8 tracking-widest uppercase">
          Acceso Restringido - Personal Autorizado
        </p>
      </div>
    </div>
  );
}