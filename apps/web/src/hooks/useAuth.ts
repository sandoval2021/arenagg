import type { PropsWithChildren } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type AuthUser = {
  id: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
};

type Credentials = { email?: string; phone?: string; password: string };
type Registration = Credentials & { name: string };

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: 'REQUEST_FAILED' }))) as { error?: string };
    throw new Error(body.error ?? 'REQUEST_FAILED');
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function AuthProvider({ children }: PropsWithChildren) {
  return children;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => request<{ user: AuthUser | null }>('/api/auth/me'),
    staleTime: 60_000,
    retry: false,
  });
  const login = useMutation({
    mutationFn: (data: Credentials) => request<{ user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (data) => queryClient.setQueryData(['auth', 'me'], data),
  });
  const register = useMutation({
    mutationFn: (data: Registration) => request<{ user: AuthUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (data) => queryClient.setQueryData(['auth', 'me'], data),
  });
  const logout = useMutation({
    mutationFn: () => request<void>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => queryClient.setQueryData(['auth', 'me'], { user: null }),
  });

  return {
    user: me.data?.user ?? null,
    isLoading: me.isLoading,
    isAuthenticated: Boolean(me.data?.user),
    login,
    register,
    logout,
    googleLoginUrl: `${API_URL}/api/auth/google`,
  };
}
