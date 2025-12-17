import axios from 'axios';

// Prefer explicit backend URL in development to avoid dev-server relative path issues
const API_BASE = process.env.REACT_APP_BACKEND_URL || (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8000' : 'https://clinicflow-lucj.onrender.com');
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
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
