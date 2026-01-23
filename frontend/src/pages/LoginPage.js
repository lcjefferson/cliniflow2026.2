import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import api from "../services/api";

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
        setAppVersion({ version: "2.0" });
      }
    };
    loadVersion();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-100 via-sky-100 to-blue-200 opacity-60"></div>
      
      <div className="relative w-full max-w-md">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-blue-600 mb-2">CliniFlow</h1>
            <p className="text-gray-600">Sistema de Gestão de Clínicas</p>
            {appVersion && (
              <p className="mt-2 text-xs text-gray-500">
                Versão: {appVersion.version}
                {appVersion.commit ? ` • ${String(appVersion.commit).slice(0,7)}` : ""}
                {appVersion.date ? ` • ${new Date(appVersion.date).toLocaleString('pt-BR')}` : ""}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} data-testid="login-form" className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="email-input"
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="password-input"
                  className="input-field pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              data-testid="submit-button"
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? "Processando..." : "Entrar"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Não tem acesso? Contate o administrador do sistema.
          </div>
        </div>
      </div>
    </div>
  );
}
