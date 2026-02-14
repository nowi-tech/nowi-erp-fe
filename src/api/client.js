import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add JWT token to requests
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses (token expired)
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (username, password) =>
    client.post('/api/auth/login', { username, password }),
  me: () =>
    client.get('/api/auth/me'),
  logout: () =>
    client.post('/api/auth/logout')
};

// Users API
export const usersAPI = {
  list: () => client.get('/api/users'),
  create: (data) => client.post('/api/users', data),
  update: (id, data) => client.patch(`/api/users/${id}`, data),
  delete: (id) => client.delete(`/api/users/${id}`)
};

// Stages API
export const stagesAPI = {
  list: () => client.get('/api/stages'),
  create: (data) => client.post('/api/stages', data),
  update: (id, data) => client.patch(`/api/stages/${id}`, data)
};

// Lots API
export const lotsAPI = {
  list: (params) => client.get('/api/lots', { params }),
  create: (data) => client.post('/api/lots', data),
  get: (lotNo) => client.get(`/api/lots/${lotNo}`),
  getRemaining: (lotNo, stageId) => client.get(`/api/lots/${lotNo}/remaining/${stageId}`),
  generateNumber: () => client.get('/api/lots/generate-number'),
  downloadChallan: (lotNo) => client.get(`/api/lots/${lotNo}/challan`, { responseType: 'blob' })
};

// SKU Config API (Admin)
export const skuConfigAPI = {
  // Brands
  getBrands: () => client.get('/api/sku-config/brands'),
  createBrand: (data) => client.post('/api/sku-config/brands', data),
  updateBrand: (id, data) => client.patch(`/api/sku-config/brands/${id}`, data),
  deleteBrand: (id) => client.delete(`/api/sku-config/brands/${id}`),
  // Genders
  getGenders: () => client.get('/api/sku-config/genders'),
  createGender: (data) => client.post('/api/sku-config/genders', data),
  updateGender: (id, data) => client.patch(`/api/sku-config/genders/${id}`, data),
  deleteGender: (id) => client.delete(`/api/sku-config/genders/${id}`),
  // Categories
  getCategories: () => client.get('/api/sku-config/categories'),
  createCategory: (data) => client.post('/api/sku-config/categories', data),
  updateCategory: (id, data) => client.patch(`/api/sku-config/categories/${id}`, data),
  deleteCategory: (id) => client.delete(`/api/sku-config/categories/${id}`),
  // SKUs (autocomplete)
  getSkus: (search) => client.get('/api/sku-config/skus', { params: { search } }),
  // Sizes
  getSizes: () => client.get('/api/sku-config/sizes')
};

// Fabric Types API
export const fabricTypesAPI = {
  list: (search) => client.get('/api/fabric-types', { params: { search } }),
  create: (name) => client.post('/api/fabric-types', { name })
};

// Receipts API
export const receiptsAPI = {
  getAvailable: (stageId) => client.get(`/api/receipts/available/${stageId}`),
  create: (data) => client.post('/api/receipts', data),
  getForLot: (lotNo) => client.get(`/api/receipts/lot/${lotNo}`),
  getHistory: (params) => client.get('/api/receipts/history', { params }),
  downloadChallan: (lotNo, stageId, timestamp) => client.get(`/api/receipts/challan/${lotNo}/${stageId}/${timestamp}`, { responseType: 'blob' })
};

// Reports API
export const reportsAPI = {
  getLot: (lotNo) => client.get(`/api/reports/lot/${lotNo}`),
  getSku: (sku) => client.get(`/api/reports/sku/${sku}`),
  getStage: (stageId) => client.get(`/api/reports/stage/${stageId}`),
  getSummary: () => client.get('/api/reports/summary'),
  download: () => client.get('/api/reports/download', { responseType: 'blob' })
};

// SKU Links API (Operator only)
export const skuLinksAPI = {
  list: (params) => client.get('/api/sku-links', { params }),
  getSkus: (search) => client.get('/api/sku-links/skus', { params: { search } }),
  create: (data) => client.post('/api/sku-links', data),
  bulkUpload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/api/sku-links/bulk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  downloadTemplate: () => client.get('/api/sku-links/template', { responseType: 'blob' }),
  update: (id, data) => client.patch(`/api/sku-links/${id}`, data),
  delete: (id) => client.delete(`/api/sku-links/${id}`)
};

export default client;
