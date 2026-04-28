/**
 * API Service
 * Cliente HTTP con axios y interceptores
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import store from '../store';
import { logout } from '../store/slices/authSlice';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const API_PREFIX = process.env.REACT_APP_API_PREFIX || '/api';

// Crear instancia de axios
const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}${API_PREFIX}`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Interceptor de request - Añadir token JWT
 */
api.interceptors.request.use(
  (config) => {
    const state = store.getState();
    const token = state.auth.token;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

/**
 * Interceptor de response - Manejo de errores
 */
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    // Token expirado - intentar refrescar
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const state = store.getState();
        const refreshResponse = await axios.post(`${API_URL}${API_PREFIX}/auth/refresh`, {}, {
          headers: {
            Authorization: `Bearer ${state.auth.token}`,
          },
        });

        const newToken = refreshResponse.data.token;

        // Actualizar token en store y localStorage
        localStorage.setItem('token', newToken);

        // Reintentar request original
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh falló, hacer logout
        store.dispatch(logout());
        return Promise.reject(refreshError);
      }
    }

    // Token inválido - logout
    if (error.response?.status === 401) {
      store.dispatch(logout());
    }

    // Error no autenticado
    if (error.response?.status === 403) {
      console.error('Access denied:', error.response.data);
    }

    // Error de servidor
    if (error.response?.status === 500) {
      console.error('Server error:', error.response.data);
    }

    return Promise.reject(error);
  }
);

/**
 * Métodos de la API
 */
export default {
  // Auth
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  register: (email: string, password: string, name: string) =>
    api.post('/auth/register', { email, password, name }),

  refresh: () => api.post('/auth/refresh'),

  // Articles
  getArticles: (params: any = {}) =>
    api.get('/articles', { params }),

  searchArticles: (query: string) =>
    api.get('/articles/search', { params: { q: query } }),

  getArticleById: (id: number) =>
    api.get(`/articles/${id}`),

  getCategories: () =>
    api.get('/articles/categories'),

  getTags: () =>
    api.get('/articles/tags'),

  createArticle: (data: any) =>
    api.post('/articles', data),

  updateArticle: (id: number, data: any) =>
    api.put(`/articles/${id}`, data),

  deleteArticle: (id: number) =>
    api.delete(`/articles/${id}`),

  // Catalogs
  getCatalogs: (params: any = {}) =>
    api.get('/catalogs', { params }),

  getCatalogById: (id: number) =>
    api.get(`/catalogs/${id}`),

  getCatalogArticles: (id: number) =>
    api.get(`/catalogs/${id}/articles`),

  createCatalog: (data: any) =>
    api.post('/catalogs', data),

  updateCatalog: (id: number, data: any) =>
    api.put(`/catalogs/${id}`, data),

  publishCatalog: (id: number) =>
    api.post(`/catalogs/${id}/publish`),

  deleteCatalog: (id: number) =>
    api.delete(`/catalogs/${id}`),

  getCatalogVersions: (id: number) =>
    api.get(`/catalogs/${id}/versions`),

  revertCatalog: (id: number, version: number) =>
    api.post(`/catalogs/${id}/revert/${version}`),

  // Orders
  getMyOrders: (params: any = {}) =>
    api.get('/orders/my-orders', { params }),

  getAllOrders: (params: any = {}) =>
    api.get('/orders', { params }),

  getOrderById: (id: number) =>
    api.get(`/orders/${id}`),

  createOrder: (data: any) =>
    api.post('/orders', data),

  addOrderItem: (orderId: number, data: any) =>
    api.post(`/orders/${orderId}/items`, data),

  updateOrderItem: (orderId: number, itemId: number, quantity: number) =>
    api.put(`/orders/${orderId}/items/${itemId}`, { quantity }),

  removeOrderItem: (orderId: number, itemId: number) =>
    api.delete(`/orders/${orderId}/items/${itemId}`),

  confirmOrder: (id: number) =>
    api.post(`/orders/${id}/confirm`),

  generateOrderPDF: (id: number) =>
    api.get(`/orders/${id}/pdf`, { responseType: 'blob' }),

  // Sync
  sync: (data: any) =>
    api.post('/sync', data),

  // Health check
  health: () =>
    axios.get(`${API_URL}/health`),
};
