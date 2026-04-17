import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Your backend returns: { data: [ ...items... ] }
// Axios wraps it so res.data = { data: [...] }
// Therefore actual array = res.data.data
export function unwrap(res, _key) {
  const d = res?.data
  if (Array.isArray(d?.data)) return d.data
  if (Array.isArray(d)) return d
  return []
}

export const authAPI = {
  login: (body) => api.post('/auth/login', body),
  register: (body) => api.post('/auth/register', body),
  forgotPassword: (body) => api.post('/auth/forgot-password', body),
  me: () => api.get('/auth/me'),
}

export const resourceAPI = {
  getAll: () => api.get('/resources'),
  create: (body) => api.post('/resources', body),
  update: (id, b) => api.put(`/resources/${id}`, b),
  remove: (id) => api.delete(`/resources/${id}`),
}

export const scheduleAPI = {
  getAll: (p) => api.get('/schedules', { params: p }),
  getOne: (id) => api.get(`/schedules/${id}`),
  create: (b) => api.post('/schedules', b),
  update: (id, b) => api.put(`/schedules/${id}`, b),
  cancel: (id) => api.delete(`/schedules/${id}`),
  suggestions: (p) => api.get('/schedules/suggestions', { params: p }),
  analytics: (id) => api.get(`/schedules/analytics/${id}`),
}

export default api