import { describe, expect, it } from 'vitest'
import { readSupabaseBrowserConfig } from './supabaseConfig'

describe('readSupabaseBrowserConfig', () => {
  it('uses the browser-safe publishable key', () => {
    expect(readSupabaseBrowserConfig({
      VITE_SUPABASE_URL: ' https://project.supabase.co ',
      VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_example ',
    })).toEqual({
      url: 'https://project.supabase.co',
      key: 'sb_publishable_example',
    })
  })

  it('accepts the legacy anon key as a compatibility fallback', () => {
    expect(readSupabaseBrowserConfig({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'legacy-anon',
    })).toEqual({
      url: 'http://127.0.0.1:54321',
      key: 'legacy-anon',
    })
  })

  it('disables Supabase when the URL or browser key is missing', () => {
    expect(readSupabaseBrowserConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321' })).toBeNull()
    expect(readSupabaseBrowserConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'key' })).toBeNull()
  })
})
