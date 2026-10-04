import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, Loader2, CalendarDays, MessageSquare, BellRing } from "lucide-react";
import api from "../services/api";

const FEATURES = [
  { icon: CalendarDays, title: "Agenda inteligente", text: "Profissionais, salas e serviços organizados em um só lugar." },
  { icon: MessageSquare, title: "Atendimento omnichannel", text: "Conversas do WhatsApp integradas ao histórico do paciente." },
  { icon: BellRing, title: "Follow-ups automáticos", text: "Lembretes e retornos enviados no momento certo." },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const { login } = useAuth();
  const [appVersion, setAppVersion] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
      await Promise.race([login(email, password), timeout]);
      toast.success("Login realizado com sucesso!");
      navigate("/");
    } catch (error) {
      const msg =
        error.message === 'timeout'
          ? 'Tempo de conexão esgotado. Verifique o backend.'
          : (error.response?.data?.detail || (error.request && !error.response ? 'Falha de conexão com o backend (CORS/rede).' : 'Erro ao processar requisição'));
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadVersion = async () => {
      try {
        const { data } = await api.get("/version");
        setAppVersion(data);
      } catch (err) {
        setAppVersion({ version: "3.0" });
      }
    };
    loadVersion();
  }, []);

  const versionLabel = appVersion
    ? [
        `Versão ${appVersion.version || "3.0"}`,
        appVersion.commit ? String(appVersion.commit).slice(0, 7) : null,
        appVersion.date ? new Date(appVersion.date).toLocaleDateString('pt-BR') : null,
      ].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="min-h-screen flex bg-white">
      {/* Painel da marca */}
      <aside className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(37,99,235,0.45),transparent_45%),radial-gradient(circle_at_85%_90%,rgba(14,165,233,0.25),transparent_40%)]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }}
        />

        <div className="relative z-10 flex flex-col justify-between w-full p-12 xl:p-16">
          <div className="text-2xl font-semibold tracking-tight">
            Clini<span className="text-blue-400">Flow</span>
          </div>

          <div className="max-w-md">
            <h2 className="text-4xl xl:text-5xl font-semibold leading-[1.1] tracking-tight">
              A gestão da sua clínica, em um só lugar.
            </h2>
            <p className="mt-4 text-base text-slate-300">
              Agenda, atendimento e relacionamento com pacientes trabalhando juntos.
            </p>

            <ul className="mt-10 space-y-5">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                    <Icon className="h-5 w-5 text-blue-300" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-white">{title}</span>
                    <span className="block text-sm text-slate-400">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} CliniFlow{versionLabel ? ` · ${versionLabel}` : ""}
          </p>
        </div>
      </aside>

      {/* Formulário */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10 bg-slate-50 lg:bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden text-center mb-8">
            <div className="text-3xl font-semibold tracking-tight text-slate-900">
              Clini<span className="text-blue-600">Flow</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">Sistema de Gestão de Clínicas</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 lg:border-0 lg:shadow-none lg:p-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Entrar</h1>
            <p className="mt-1 text-sm text-slate-500">Acesse sua conta para continuar.</p>

            <form onSubmit={handleSubmit} data-testid="login-form" className="mt-8 space-y-5">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    data-testid="email-input"
                    className="input-field h-11 pl-10"
                    placeholder="voce@clinica.com.br"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    data-testid="password-input"
                    className="input-field h-11 pl-10 pr-11"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                data-testid="submit-button"
                className="btn-primary w-full h-11"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Não tem acesso? Contate o administrador do sistema.
            </p>
          </div>

          {versionLabel && (
            <p className="lg:hidden mt-6 text-center text-xs text-slate-400">{versionLabel}</p>
          )}
        </div>
      </main>
    </div>
  );
}
