import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  console.warn('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — connect Supabase to go live.');
}

export const supabase = createClient(url ?? 'http://localhost:54321', anon ?? 'anon-key');
export const functionsUrl = (name: string) => `${url?.replace(/\/$/, '')}/functions/v1/${name}`;
