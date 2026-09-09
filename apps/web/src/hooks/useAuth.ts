import type { PropsWithChildren } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL, apiRequest } from '../lib/api';

export type AuthUser = {
  id: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
};

type Credentials = {
  email?: string;
  phone?: string;
  password: string;
};

type Registration = Credentials & {
  name: string;
};

export function AuthProvider({ children }: PropsWithChildren) {
  return children;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<{ user: AuthUser | null }>('/api/auth/me'),
    staleTime: 60_000,
    retry: false,
  });

  const login = useMutation({
    mutationFn: (data: Credentials) =>
      apiRequest<{ user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => queryClient.setQueryData(['auth', 'me'], data),
  });

  const register = useMutation({
    mutationFn: (data: Registration) =>
      apiRequest<{ user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => queryClient.setQueryData(['auth', 'me'], data),
  });

  const logout = useMutation({
    mutationFn: () => apiRequest<void>('/api/auth/logout', { method: 'POST' }),
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
