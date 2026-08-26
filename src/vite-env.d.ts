/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SLEEPER_LEAGUE_ID?: string
  readonly VITE_SLEEPER_USERNAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
