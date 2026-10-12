import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

// Null until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are provided at build time.
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // Keep users logged in on this device until they explicitly log out.
          persistSession: true,
          autoRefreshToken: true,
          storage: window.localStorage,
          detectSessionInUrl: false,
        },
      })
    : null
