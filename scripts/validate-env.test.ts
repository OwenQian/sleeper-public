import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  formatEnvironmentReport,
  loadEnvironment,
  validateEnvironment,
} from './validate-env.mjs'

const temporaryDirectories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'sleeper-env-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true }))
})

describe('loadEnvironment', () => {
  it('loads .env.local over .env and process variables over both', () => {
    const directory = temporaryDirectory()
    writeFileSync(join(directory, '.env'), 'VITE_DRAFT_SLOT=2\nVITE_SLEEPER_USERNAME=base-user\n')
    writeFileSync(join(directory, '.env.local'), 'VITE_SLEEPER_USERNAME="local-user"\n')

    const loaded = loadEnvironment(directory, { VITE_DRAFT_SLOT: '7' })

    expect(loaded.sources).toEqual(['.env', '.env.local', 'process environment'])
    expect(loaded.env).toMatchObject({
      VITE_DRAFT_SLOT: '7',
      VITE_SLEEPER_USERNAME: 'local-user',
    })
  })
})

describe('validateEnvironment', () => {
  it('reports all configured feature groups and draft settings', () => {
    const report = validateEnvironment({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      VITE_SLEEPER_LEAGUE_ID: 'league-1',
      VITE_SLEEPER_USERNAME: 'sam',
      VITE_DRAFT_LEAGUE_SIZE: '14',
      VITE_DRAFT_SLOT: '9',
      OPENAI_API_KEY: 'sk-example',
      OPENAI_COACH_MODEL: 'gpt-test',
    }, ['.env'])

    expect(report.valid).toBe(true)
    expect(report.errors).toEqual([])
    expect(report.settings).toEqual({ leagueSize: 14, draftSlot: 9, coachModel: 'gpt-test' })
    expect(Object.fromEntries(report.features.map((feature) => [feature.name, feature.enabled])))
      .toMatchObject({
        'CSV rankings import': true,
        'Browser local-storage fallback': true,
        'Sleeper live data and draft sync': true,
        'Supabase board persistence': true,
        'League-scoped board': true,
        'User-scoped draft history': true,
        'Practice mock imports': true,
        'AI draft coach': true,
      })
  })

  it('treats missing optional groups as disabled without failing validation', () => {
    const report = validateEnvironment({}, ['.env'])
    const features = Object.fromEntries(report.features.map((feature) => [feature.name, feature.enabled]))

    expect(report.valid).toBe(true)
    expect(report.settings).toEqual({ leagueSize: 12, draftSlot: 1, coachModel: 'gpt-5.6' })
    expect(features['CSV rankings import']).toBe(true)
    expect(features['Browser local-storage fallback']).toBe(true)
    expect(features['Sleeper live data and draft sync']).toBe(true)
    expect(features['Supabase board persistence']).toBe(false)
    expect(features['User-scoped draft history']).toBe(false)
    expect(features['AI draft coach']).toBe(false)
  })

  it('rejects incomplete Supabase settings, unsafe keys, and invalid draft numbers', () => {
    const serviceRolePayload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')
    const report = validateEnvironment({
      VITE_SUPABASE_URL: 'not-a-url',
      VITE_SUPABASE_PUBLISHABLE_KEY: `header.${serviceRolePayload}.signature`,
      VITE_DRAFT_LEAGUE_SIZE: 'zero',
      VITE_DRAFT_SLOT: '0',
    }, ['.env'])

    expect(report.valid).toBe(false)
    expect(report.errors.join('\n')).toMatch(/valid HTTP or HTTPS URL/)
    expect(report.errors.join('\n')).toMatch(/secret or service-role key/)
    expect(report.errors.join('\n')).toMatch(/VITE_DRAFT_LEAGUE_SIZE/)
    expect(report.errors.join('\n')).toMatch(/VITE_DRAFT_SLOT/)
  })

  it('fails when no env file or relevant process configuration exists', () => {
    const report = validateEnvironment({}, [])

    expect(report.valid).toBe(false)
    expect(report.errors).toContain('No .env or .env.local file, or relevant process environment variables, were found.')
  })

  it('formats a readable enabled and disabled feature report without printing secrets', () => {
    const report = validateEnvironment({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_do-not-print',
    }, ['.env.local'])

    const formatted = formatEnvironmentReport(report)

    expect(formatted).toContain('Environment sources: .env.local')
    expect(formatted).toContain('[enabled] Supabase board persistence')
    expect(formatted).toContain('[disabled] AI draft coach')
    expect(formatted).toContain('Draft settings: 12 teams, slot 1')
    expect(formatted).not.toContain('do-not-print')
  })
})
