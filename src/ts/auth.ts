// Auth Module - Authentication with type safety
import { Api } from './api';
import type { Session, User } from './types';

const SESSION_KEY = 'current';

interface RegisterData {
  name: string;
  email: string;
  password: string;
  upiId: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface PasswordStrength {
  label: string;
  cls: string;
}

class AuthManager {
  private refreshInterval: number | null = null;

  async getSession(): Promise<Session | null> {
    try {
      const db = await indexedDB.openDB('esplitterDB', 4, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('session')) {
            db.createObjectStore('session', { keyPath: 'id' });
          }
        },
      });
      const session = await db.get('session', SESSION_KEY);
      return session as Session | null;
    } catch {
      return null;
    }
  }

  async saveSession(session: Session): Promise<void> {
    const db = await indexedDB.openDB('esplitterDB', 4, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session', { keyPath: 'id' });
        }
      },
    });
    await db.put('session', { ...session, id: SESSION_KEY });
  }

  async clearSession(): Promise<void> {
    const db = await indexedDB.openDB('esplitterDB', 4);
    await db.delete('session', SESSION_KEY);
  }

  authHeader(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async register(name: string, email: string, password: string, upiId: string): Promise<void> {
    const response = await Api.post<{ user: User; token: string }>('/api/auth/register', {
      name,
      email,
      password,
      upiId,
    });
    await this.saveSession({
      user: response.user,
      token: response.token,
    });
  }

  async login(email: string, password: string): Promise<void> {
    const response = await Api.post<{ user: User; token: string }>('/api/auth/login', {
      email,
      password,
    });
    await this.saveSession({
      user: response.user,
      token: response.token,
    });
  }

  async logout(): Promise<void> {
    try {
      await Api.post('/api/auth/logout');
    } catch {
      // Continue even if server logout fails
    }
    this.stopAutoRefresh();
    await this.clearSession();
  }

  startAutoRefresh(): void {
    if (this.refreshInterval) return;
    
    // Refresh token every 25 minutes
    this.refreshInterval = window.setInterval(async () => {
      try {
        const response = await Api.post<{ token: string }>('/api/auth/refresh');
        const session = await this.getSession();
        if (session) {
          session.token = response.token;
          await this.saveSession(session);
        }
      } catch {
        // Token refresh failed, user will need to re-login
        this.stopAutoRefresh();
      }
    }, 25 * 60 * 1000);
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async updateProfile(name: string, phone: string): Promise<User> {
    const response = await Api.patch<{ user: User }>('/api/user/profile', { name, phone });
    const session = await this.getSession();
    if (session) {
      session.user = response.user;
      await this.saveSession(session);
    }
    return response.user;
  }

  async updateUpiId(upiId: string): Promise<void> {
    await Api.patch('/api/user/upi', { upiId });
    const session = await this.getSession();
    if (session) {
      session.user.upiId = upiId;
      await this.saveSession(session);
    }
  }

  checkPasswordStrength(password: string): PasswordStrength {
    let score = 0;
    
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    if (score <= 1) {
      return { label: 'Weak', cls: 'weak' };
    } else if (score <= 2) {
      return { label: 'Fair', cls: 'fair' };
    } else if (score <= 3) {
      return { label: 'Good', cls: 'good' };
    }
    return { label: 'Strong', cls: 'strong' };
  }
}

export const Auth = new AuthManager();
export default Auth;