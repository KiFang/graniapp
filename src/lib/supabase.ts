import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: {
    storage: Platform.OS === 'web' && typeof window === 'undefined' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
  // Браузер (особенно WebView Telegram) может закэшировать ответ-ошибку и потом отдавать её без запроса к серверу.
  // Данные приложения всегда живые — кэш браузера не используем.
  global: Platform.OS === 'web' ? { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) } : undefined,
});

/** Бросает понятную ошибку, если запрос вернул error. */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
