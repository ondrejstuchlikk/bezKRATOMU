import { supabase } from '../lib/supabase'
import { createDemoBackend } from './demoBackend'
import { createSupabaseBackend } from './supabaseBackend'
import type { Backend } from './types'

// Real Supabase backend when configured at build time, otherwise demo mode.
export const backend: Backend = supabase ? createSupabaseBackend(supabase) : createDemoBackend()

export * from './types'
