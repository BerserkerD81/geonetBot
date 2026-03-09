import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Lock, Mail, AlertCircle, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react';

import favicon from '../../public/favicon.svg';

export function LoginPage() {
    const [showPassword, setShowPassword] = useState(false);
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

  // Focus automático al cambiar a 2FA
  useEffect(() => {
    if (step !== 'credentials') {
      setTimeout(() => tokenInputRef.current?.focus(), 100);
    }
  }, [step]);

  // Auto-envío al completar 6 dígitos
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
      setError(err instanceof Error ? err.message : 'Error de conexión');
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
    try {
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
        setError('Código incorrecto. Verifica tu autenticador.');
        setTwoFactorToken(''); // Limpiamos para facilitar reintento
        tokenInputRef.current?.focus();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? `Error al validar el código: ${err.message}` : 'Error al validar el código');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50/30 flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        {/* Logo y Título */}
        <div className="flex flex-col items-center mb-8">
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 mb-2"
          >
            <div className="h-11 w-11 flex items-center justify-center rounded-xl bg-gradient-to-b from-[#234c9f] to-[#142a66] shadow-[0_8px_20px_rgba(30,58,138,0.35)] border border-white/15 backdrop-blur-md overflow-hidden">
              <img src={favicon} alt="GeoNetBot Logo" className="w-8 h-8 object-contain relative z-10" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">GeoNetBot</h1>
          </motion.div>
          <p className="text-gray-400 text-sm">Panel de control de infraestructura</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-xl shadow-gray-200/60 overflow-hidden">
          {/* Orange top accent bar */}
          <div className="h-1 bg-gradient-to-r from-orange-500 to-orange-400" />
          <div className="p-8">
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
                    <Label htmlFor="email" className="text-xs font-medium text-gray-500 ml-1">Email corporativo</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 bg-white border-gray-200 text-gray-900 focus:border-orange-300 h-11 transition-all"
                        placeholder="usuario@geonet.com"
                        required
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-xs font-medium text-gray-500 ml-1">Contraseña</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 bg-white border-gray-200 text-gray-900 focus:border-orange-300 h-11 transition-all"
                        placeholder="••••••••"
                        required
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1e3a8a] hover:text-[#f5831f] focus:outline-none"
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs"
                  >
                    <AlertCircle className="size-4 shrink-0" />
                    {error}
                  </motion.div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white font-semibold rounded-lg transition-all border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md"
                >
                  {isLoading ? <Loader2 className="animate-spin size-5" /> : 'Iniciar Sesión'}
                </Button>
              </motion.form>
            ) : (
              <motion.form
                key="2fa"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  x: error ? [0, -10, 10, -10, 10, 0] : 0 // Efecto de vibración si falla
                }}
                exit={{ opacity: 0, scale: 0.98 }}
                onSubmit={handleVerify2fa}
                className="space-y-6"
              >
                <div className="text-center">
                  <div className="inline-flex items-center justify-center p-2 bg-[#1e3a8a]/10 rounded-full mb-3">
                    <ShieldCheck className="text-[#f5831f] size-5" />
                  </div>
                  <h2 className="text-gray-900 font-semibold italic">Doble Factor</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    {step === 'setup2fa' ? 'Configura tu autenticador' : 'Ingresa el código de seguridad'}
                  </p>
                </div>

                {step === 'setup2fa' && qrImage && (
                  <div className="flex justify-center p-2 bg-white rounded-xl w-fit mx-auto shadow-lg border-4 border-gray-200">
                    <img src={qrImage} alt="QR" className="w-32 h-32" />
                  </div>
                )}

                <div className="space-y-4">
                  <Input
                    ref={tokenInputRef}
                    type="text"
                    maxLength={6}
                    value={twoFactorToken}
                    onChange={(e) => {
                      if (error) setError('');
                      setTwoFactorToken(e.target.value.replace(/\D/g, ''));
                    }}
                    className={`bg-white text-center text-2xl tracking-[0.4em] font-mono h-14 transition-all duration-300 ${
                      error 
                        ? 'border-red-500 text-red-600 focus:border-red-500' 
                        : 'border-gray-200 text-gray-900 focus:border-orange-300'
                    }`}
                    placeholder="000000"
                    required
                    disabled={isLoading}
                  />

                  {error && (
                    <motion.p 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center text-red-600 text-xs font-medium"
                    >
                      {error}
                    </motion.p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isLoading || twoFactorToken.length < 6}
                  className={`w-full h-11 font-semibold rounded-lg transition-all text-white bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] hover:text-white border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md ${
                    error ? 'ring-2 ring-red-300/70' : ''
                  }`}
                >
                  {isLoading ? <Loader2 className="animate-spin size-5" /> : 'Verificar Código'}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setStep('credentials');
                  }}
                  className="w-full flex items-center justify-center gap-2 text-xs text-[#1e3a8a] hover:text-[#f5831f] transition-colors"
                >
                  <ArrowLeft className="size-3" />
                  Volver al inicio
                </button>
              </motion.form>
            )}
          </AnimatePresence>
          </div>
        </div>
        
        <p className="text-center text-[10px] text-gray-400 mt-6 tracking-widest uppercase">
          Acceso Restringido · Personal Autorizado
        </p>
      </div>
    </div>
  );
}