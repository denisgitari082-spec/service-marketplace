import { createClient } from '@supabase/supabase-js'

// These values come from your Supabase project (API URL + anon key)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)
