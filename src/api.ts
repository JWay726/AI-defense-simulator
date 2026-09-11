const API_BASE = 'http://localhost:3001/api';

let authToken = '';

export function setToken(token: string) {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export function getToken(): string {
  if (!authToken) {
    authToken = localStorage.getItem('auth_token') || '';
  }
  return authToken;
}

// 检查后端是否可用
let serverAvailable: boolean | null = null;
async function checkServer(): Promise<boolean> {
  if (serverAvailable !== null) return serverAvailable;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    serverAvailable = res.ok;
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '请求失败');
  }
  return data;
}

// ============================================================
// 文档文本提取（上传到后端，由 Node 可靠地抽取文本）
// ============================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

export interface ExtractResult {
  text: string;
  method: 'pdfjs' | 'docx' | 'pptx' | 'text' | 'none';
  error?: string;
  pageCount?: number;
  /** 该文件没有文字层，需要走 OCR */
  needOCR?: boolean;
}

export async function extractDocumentText(fileName: string, buffer: ArrayBuffer): Promise<ExtractResult> {
  const base64 = arrayBufferToBase64(buffer);
  const res = await fetch(`${API_BASE}/extract-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, data: base64 }),
  });
  const data = await res.json();
  return {
    text: data.text || '',
    method: data.method || 'none',
    error: data.error,
    pageCount: data.pageCount,
    needOCR: Boolean(data.needOCR),
  };
}

// ============================================================
// OCR：扫描件 / 图片版 PPT / 纯图片
// 后端异步任务 + 前端轮询进度
// ============================================================

export interface OcrJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number;
  message: string;
  error?: string;
  result?: {
    text: string;
    method: 'ocr' | 'pptx';
    provider: string;
    pageCount: number;
    truncated: boolean;
  };
}

export interface OcrConfig {
  primary: string;
  vision: boolean;
  baidu: boolean;
  lang: string;
  maxPages: number;
}

export async function getOcrConfig(): Promise<OcrConfig | null> {
  try {
    const res = await fetch(`${API_BASE}/ocr/config`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function startOcrJob(fileName: string, buffer: ArrayBuffer): Promise<string> {
  const base64 = arrayBufferToBase64(buffer);
  const res = await fetch(`${API_BASE}/ocr/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, data: base64 }),
  });
  const data = await res.json();
  if (!res.ok || !data.jobId) throw new Error(data.error || 'OCR 任务启动失败');
  return data.jobId;
}

export async function getOcrStatus(jobId: string): Promise<OcrJobStatus> {
  const res = await fetch(`${API_BASE}/ocr/status/${jobId}`);
  if (!res.ok) throw new Error('OCR 任务状态查询失败');
  return await res.json();
}

export async function cancelOcrJob(jobId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/ocr/status/${jobId}`, { method: 'DELETE' });
  } catch {
    // 清理失败不影响主流程
  }
}

// ============================================================
// 本地存储降级模式（无后端 / 无 MySQL 时使用）
// ============================================================

interface LocalUser {
  id: number;
  username: string;
  password: string;
  avatar: string;
  isAdmin: boolean;
  subscriptionTier: string;
  subscriptionExpiresAt: string | null;
  monthlyQuestionCount: number;
  monthlyResetDate: string | null;
}

function getLocalUsers(): Record<string, LocalUser> {
  try {
    const data = JSON.parse(localStorage.getItem('local_users') || '{}');
    // 预置管理员账号（首次使用时自动创建）
    if (!data['admin']) {
      data['admin'] = { id: 1, username: 'admin', password: 'admin123', avatar: '管', isAdmin: true, subscriptionTier: 'free', subscriptionExpiresAt: null, monthlyQuestionCount: 0, monthlyResetDate: null };
      localStorage.setItem('local_users', JSON.stringify(data));
    }
    return data;
  } catch {
    return {};
  }
}

function saveLocalUsers(users: Record<string, LocalUser>) {
  localStorage.setItem('local_users', JSON.stringify(users));
}

function getCurrentLocalUserId(): number | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.userId;
  } catch {
    return null;
  }
}

// 简单 base64 编码模拟 token（不含密钥，仅本地演示用）
function makeLocalToken(userId: number, username: string, isAdmin: boolean): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ userId, username, isAdmin, exp: Date.now() + 7 * 86400000 }));
  return `${header}.${payload}.local`;
}

function localRegister(username: string, password: string) {
  const users = getLocalUsers();
  if (users[username]) {
    throw new Error('用户名已存在');
  }
  const id = Date.now();
  users[username] = { id, username, password, avatar: username.charAt(0).toUpperCase(), isAdmin: false, subscriptionTier: 'free', subscriptionExpiresAt: null, monthlyQuestionCount: 0, monthlyResetDate: null };
  saveLocalUsers(users);
  const token = makeLocalToken(id, username, false);
  return { token, user: { id, username, avatar: username.charAt(0).toUpperCase(), isAdmin: false, subscription: { tier: 'free', expiresAt: null } } };
}

function localLogin(username: string, password: string) {
  const users = getLocalUsers();
  const user = users[username];
  if (!user) {
    throw new Error('用户名不存在');
  }
  if (user.password !== password) {
    throw new Error('密码错误');
  }
  const token = makeLocalToken(user.id, username, user.isAdmin);
  return { token, user: { id: user.id, username: user.username, avatar: user.avatar, isAdmin: user.isAdmin, subscription: { tier: user.subscriptionTier || 'free', expiresAt: user.subscriptionExpiresAt || null } } };
}

function localUpdateProfile(userId: number, data: { username?: string; avatar?: string }) {
  const users = getLocalUsers();
  const entry = Object.entries(users).find(([, u]) => u.id === userId);
  if (!entry) throw new Error('用户不存在');
  const [oldName, user] = entry;

  if (data.username && data.username !== oldName) {
    if (users[data.username]) throw new Error('用户名已被占用');
    delete users[oldName];
    user.username = data.username;
    users[data.username] = user;
  }
  if (data.avatar) {
    user.avatar = data.avatar;
  }
  saveLocalUsers(users);
  return { user: { id: user.id, username: user.username, avatar: user.avatar } };
}

function localChangePassword(userId: number, oldPassword: string, newPassword: string) {
  const users = getLocalUsers();
  const entry = Object.entries(users).find(([, u]) => u.id === userId);
  if (!entry) throw new Error('用户不存在');
  const [, user] = entry;
  if (user.password !== oldPassword) throw new Error('旧密码不正确');
  user.password = newPassword;
  saveLocalUsers(users);
  return { message: '密码修改成功' };
}

function localListUsers() {
  const users = getLocalUsers();
  return Object.values(users).map((u) => ({
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    isAdmin: u.isAdmin,
    createdAt: '',
  }));
}

function localDeleteUser(userId: number) {
  const users = getLocalUsers();
  const entry = Object.entries(users).find(([, u]) => u.id === userId);
  if (!entry) throw new Error('用户不存在');
  if (entry[1].isAdmin) throw new Error('不能删除管理员账号');
  delete users[entry[0]];
  saveLocalUsers(users);
  return { message: '删除成功' };
}

function localGetSubscription(userId: number) {
  const users = getLocalUsers();
  const user = Object.values(users).find((u) => u.id === userId);
  if (!user) throw new Error('用户不存在');
  return { subscription: { tier: user.subscriptionTier || 'free', expiresAt: user.subscriptionExpiresAt || null } };
}

function localSubscribe(userId: number, tier: string) {
  const users = getLocalUsers();
  const entry = Object.entries(users).find(([, u]) => u.id === userId);
  if (!entry) throw new Error('用户不存在');
  const now = new Date();
  let expiresAt: string;
  if (tier === 'monthly') {
    expiresAt = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
  } else {
    expiresAt = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString();
  }
  entry[1].subscriptionTier = tier;
  entry[1].subscriptionExpiresAt = expiresAt;
  saveLocalUsers(users);
  return { subscription: { tier, expiresAt } };
}

function localGetUsage(userId: number) {
  const users = getLocalUsers();
  const user = Object.values(users).find((u) => u.id === userId);
  if (!user) throw new Error('用户不存在');
  return { monthlyQuestionCount: user.monthlyQuestionCount || 0, monthlyResetDate: user.monthlyResetDate || null };
}

function localIncrementUsage(userId: number) {
  const users = getLocalUsers();
  const entry = Object.entries(users).find(([, u]) => u.id === userId);
  if (!entry) throw new Error('用户不存在');
  const today = new Date().toISOString().slice(0, 10);
  // 新月重置
  if (!entry[1].monthlyResetDate || entry[1].monthlyResetDate !== today) {
    entry[1].monthlyQuestionCount = 0;
    entry[1].monthlyResetDate = today;
  }
  entry[1].monthlyQuestionCount = (entry[1].monthlyQuestionCount || 0) + 1;
  saveLocalUsers(users);
  return { monthlyQuestionCount: entry[1].monthlyQuestionCount, monthlyResetDate: today };
}

// ============================================================
// 本地存储：聊天记录
// ============================================================

function getLocalChatKey(userId: number): string {
  return `local_chat_${userId}`;
}

function getLocalChatSessions(userId: number): Record<string, { title: string; messages: any[]; updatedAt: string }> {
  try {
    return JSON.parse(localStorage.getItem(getLocalChatKey(userId)) || '{}');
  } catch {
    return {};
  }
}

function saveLocalChatSessions(userId: number, sessions: Record<string, any>) {
  localStorage.setItem(getLocalChatKey(userId), JSON.stringify(sessions));
}

function localListChatSessions(userId: number) {
  const sessions = getLocalChatSessions(userId);
  return Object.entries(sessions).map(([sessionId, data]) => ({
    session_id: sessionId,
    title: data.title || '',
    updated_at: data.updatedAt || '',
  })).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

function localLoadChatHistory(userId: number, sessionId: string) {
  const sessions = getLocalChatSessions(userId);
  const session = sessions[sessionId];
  if (!session) return { messages: [], title: '' };
  return { messages: session.messages || [], title: session.title || '' };
}

function localSaveChatHistory(userId: number, sessionId: string, messages: any[], title: string) {
  const sessions = getLocalChatSessions(userId);
  sessions[sessionId] = { title, messages, updatedAt: new Date().toISOString() };
  saveLocalChatSessions(userId, sessions);
  return { success: true };
}

function localDeleteChatSession(userId: number, sessionId: string) {
  const sessions = getLocalChatSessions(userId);
  delete sessions[sessionId];
  saveLocalChatSessions(userId, sessions);
  return { success: true };
}

// ============================================================
// 统一 API：优先请求后端，失败则降级到本地存储
// ============================================================

export const api = {
  register: async (username: string, password: string) => {
    if (await checkServer()) {
      return request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    }
    return localRegister(username, password);
  },

  login: async (username: string, password: string) => {
    if (await checkServer()) {
      return request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    }
    return localLogin(username, password);
  },

  getProfile: async () => {
    if (await checkServer()) return request('/user/profile');
    const userId = getCurrentLocalUserId();
    if (!userId) throw new Error('未登录');
    const users = getLocalUsers();
    const user = Object.values(users).find((u) => u.id === userId);
    if (!user) throw new Error('用户不存在');
    return { user: { id: user.id, username: user.username, avatar: user.avatar } };
  },

  updateProfile: async (data: { username?: string; avatar?: string }) => {
    if (await checkServer()) {
      return request('/user/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    }
    const userId = getCurrentLocalUserId();
    if (!userId) throw new Error('未登录');
    return localUpdateProfile(userId, data);
  },

  changePassword: async (oldPassword: string, newPassword: string) => {
    if (await checkServer()) {
      return request('/user/password', {
        method: 'PUT',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
    }
    const userId = getCurrentLocalUserId();
    if (!userId) throw new Error('未登录');
    return localChangePassword(userId, oldPassword, newPassword);
  },

  // 管理员：查看所有用户
  listUsers: async () => {
    if (await checkServer()) {
      return request('/admin/users');
    }
    return { users: localListUsers() };
  },

  // 管理员：删除用户
  deleteUser: async (userId: number) => {
    if (await checkServer()) {
      return request(`/admin/users/${userId}`, { method: 'DELETE' });
    }
    return localDeleteUser(userId);
  },

  // 订阅
  getSubscription: async () => {
    if (await checkServer()) {
      const data = await request('/user/profile');
      return { subscription: data.user.subscription };
    }
    const userId = getCurrentLocalUserId();
    if (!userId) throw new Error('未登录');
    return localGetSubscription(userId);
  },

  subscribe: async (tier: 'monthly' | 'yearly') => {
    if (await checkServer()) {
      return request('/user/subscribe', {
        method: 'POST',
        body: JSON.stringify({ tier }),
      });
    }
    const userId = getCurrentLocalUserId();
    if (!userId) throw new Error('未登录');
    return localSubscribe(userId, tier);
  },

  // 使用量
  getUsage: async () => {
    if (await checkServer()) {
      const data = await request('/user/profile');
      return { monthlyQuestionCount: data.user.usage?.monthlyQuestionCount || 0, monthlyResetDate: data.user.usage?.monthlyResetDate || null };
    }
    const userId = getCurrentLocalUserId();
    if (!userId) throw new Error('未登录');
    return localGetUsage(userId);
  },

  incrementUsage: async () => {
    if (await checkServer()) {
      return request('/user/usage/increment', { method: 'POST' });
    }
    const userId = getCurrentLocalUserId();
    if (!userId) throw new Error('未登录');
    return localIncrementUsage(userId);
  },

  // 聊天记录
  listChatSessions: async () => {
    if (await checkServer()) {
      return request('/chat/sessions');
    }
    const userId = getCurrentLocalUserId();
    if (!userId) throw new Error('未登录');
    return { sessions: localListChatSessions(userId) };
  },

  loadChatHistory: async (sessionId: string) => {
    if (await checkServer()) {
      return request(`/chat/history/${sessionId}`);
    }
    const userId = getCurrentLocalUserId();
    if (!userId) throw new Error('未登录');
    return localLoadChatHistory(userId, sessionId);
  },

  saveChatHistory: async (sessionId: string, messages: any[], title: string) => {
    if (await checkServer()) {
      return request(`/chat/history/${sessionId}`, {
        method: 'POST',
        body: JSON.stringify({ messages, title }),
      });
    }
    const userId = getCurrentLocalUserId();
    if (!userId) throw new Error('未登录');
    return localSaveChatHistory(userId, sessionId, messages, title);
  },

  deleteChatSession: async (sessionId: string) => {
    if (await checkServer()) {
      return request(`/chat/history/${sessionId}`, { method: 'DELETE' });
    }
    const userId = getCurrentLocalUserId();
    if (!userId) throw new Error('未登录');
    return localDeleteChatSession(userId, sessionId);
  },
};