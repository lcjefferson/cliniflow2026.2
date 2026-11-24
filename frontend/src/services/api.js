import axios from 'axios';

// Prefer explicit backend URL in development to avoid dev-server relative path issues
export const API_BASE = process.env.REACT_APP_BACKEND_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : 'https://clinicflow-lucj.onrender.com');
export const MEDIA_BASE = API_BASE; // para URLs de mídia (ex: /media/...)
const API_URL = `${API_BASE}/api`;

// Timeout evita requisições penduradas para sempre com internet instável.
// Uploads de documentos usam um timeout maior (ver PatientDetailDialog).
export const DEFAULT_TIMEOUT_MS = 45000;
export const UPLOAD_TIMEOUT_MS = 180000;

const api = axios.create({
  baseURL: API_URL,
  timeout: DEFAULT_TIMEOUT_MS,
});

// Repete automaticamente apenas LEITURAS (GET) quando a rede falha ou o servidor está
// momentaneamente indisponível. Gravações nunca são repetidas automaticamente, para não duplicar dados.
const MAX_GET_RETRIES = 2;
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    const method = String(config?.method || '').toLowerCase();
    const isNetworkFailure = !error.response && (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || !!error.request);
    const isRetryableStatus = !!error.response && RETRYABLE_STATUS.has(error.response.status);
    if (config && method === 'get' && (isNetworkFailure || isRetryableStatus)) {
      config.__retryCount = (config.__retryCount || 0) + 1;
      if (config.__retryCount <= MAX_GET_RETRIES) {
        await sleep(800 * config.__retryCount);
        return api(config);
      }
    }
    if (error.response?.status === 401) {
      // Token inválido ou expirado
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // Redirecionar para login apenas se não estiver já na página de login
      if (!window.location.pathname.includes('/login')) {
        // Avisa o usuário (na própria tela de login, após o redirecionamento) de que a
        // sessão expirou, já que dados ainda não salvos em formulários abertos serão perdidos.
        try {
          sessionStorage.setItem(
            'sessionExpiredMessage',
            'Sua sessão expirou. Faça login novamente — qualquer informação não salva em um formulário aberto foi perdida.'
          );
        } catch (_) {}
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
