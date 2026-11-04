import axios from 'axios';

// Prefer explicit backend URL in development to avoid dev-server relative path issues
export const API_BASE = process.env.REACT_APP_BACKEND_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : 'https://clinicflow-lucj.onrender.com');
export const MEDIA_BASE = API_BASE; // para URLs de mídia (ex: /media/...)
const API_URL = `${API_BASE}/api`;

const api = axios.create({
  baseURL: API_URL,
});

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
  (error) => {
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
