// API Module - Typed HTTP client
import type { Session, ApiResponse } from './types';

interface RequestOptions extends RequestInit {
  auth?: boolean;
  parseJson?: boolean;
  body?: unknown;
}

class ApiClient {
  private baseUrl = '';

  private async request<T = unknown>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const {
      auth = true,
      parseJson = true,
      body,
      ...fetchOptions
    } = options;

    const headers: HeadersInit = {
      ...(options.headers || {}),
    };

    if (auth) {
      const session = await this.getSession();
      if (session?.token) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${session.token}`;
      }
    }

    if (body && !options.method) {
      fetchOptions.method = 'POST';
    }

    if (body) {
      (headers as Record<string, string>)['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(this.baseUrl + endpoint, {
      ...fetchOptions,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = 'Request failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      const error = new Error(errorMessage) as Error & { status: number };
      error.status = response.status;
      throw error;
    }

    if (parseJson && response.status !== 204) {
      return response.json();
    }

    return {} as T;
  }

  private async getSession(): Promise<Session | null> {
    try {
      const sessionData = await indexedDB.openDB('esplitterDB', 4, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('session')) {
            db.createObjectStore('session', { keyPath: 'id' });
          }
        },
      }).then(async (db) => {
        return db.get('session', 'current');
      });
      return sessionData as Session | null;
    } catch {
      return null;
    }
  }

  get<T = unknown>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  patch<T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  delete<T = unknown>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  head(endpoint: string): Promise<boolean> {
    return this.request(endpoint, { 
      method: 'HEAD', 
      parseJson: false,
      auth: false 
    }).then(() => true).catch(() => false);
  }
}

export const Api = new ApiClient();
export default Api;