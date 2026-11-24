import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as unknown as { env: Record<string, string> }).env
  .VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as unknown as { env: Record<string, string> }).env
  .VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: { eventsPerSecond: 20 },
  },
});

export async function ensureAnonAuth() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return session.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user!;
}
