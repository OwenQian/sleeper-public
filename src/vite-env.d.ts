/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SLEEPER_LEAGUE_ID?: string
  readonly VITE_SLEEPER_USERNAME?: string
  readonly VITE_DRAFT_LEAGUE_SIZE?: string
  readonly VITE_DRAFT_SLOT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
