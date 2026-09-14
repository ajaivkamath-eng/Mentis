import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const ExpoSecureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey,
  { auth: { storage: ExpoSecureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } },
);
