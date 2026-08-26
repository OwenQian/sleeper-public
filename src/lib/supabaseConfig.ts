interface SupabaseBrowserEnvironment {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export interface SupabaseBrowserConfig {
  url: string
  key: string
}

export function readSupabaseBrowserConfig(
  env: SupabaseBrowserEnvironment,
): SupabaseBrowserConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
    || env.VITE_SUPABASE_ANON_KEY?.trim()
  return url && key ? { url, key } : null
}
