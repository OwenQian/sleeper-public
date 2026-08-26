import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RELEVANT_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SLEEPER_LEAGUE_ID',
  'VITE_SLEEPER_USERNAME',
  'VITE_DRAFT_LEAGUE_SIZE',
  'VITE_DRAFT_SLOT',
  'OPENAI_API_KEY',
  'OPENAI_COACH_MODEL',
]

function parseEnvFile(contents) {
  const parsed = {}
  for (const rawLine of contents.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      const quote = value[0]
      value = value.slice(1, -1)
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    } else {
      value = value.replace(/\s+#.*$/, '').trim()
    }
    parsed[match[1]] = value
  }
  return parsed
}

export function loadEnvironment(directory = process.cwd(), processEnvironment = process.env) {
  const env = {}
  const sources = []
  for (const filename of ['.env', '.env.local']) {
    const path = resolve(directory, filename)
    if (!existsSync(path)) continue
    Object.assign(env, parseEnvFile(readFileSync(path, 'utf8')))
    sources.push(filename)
  }

  const processValues = Object.fromEntries(
    RELEVANT_KEYS
      .filter((key) => processEnvironment[key] !== undefined)
      .map((key) => [key, processEnvironment[key]]),
  )
  if (Object.keys(processValues).length > 0) {
    Object.assign(env, processValues)
    sources.push('process environment')
  }
  return { env, sources }
}

function value(env, key) {
  return typeof env[key] === 'string' ? env[key].trim() : ''
}

function positiveInteger(rawValue, fallback) {
  if (!rawValue) return fallback
  const parsed = Number(rawValue)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function isValidHttpUrl(rawValue) {
  try {
    const url = new URL(rawValue)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function jwtRole(key) {
  const parts = key.split('.')
  if (parts.length !== 3) return ''
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload.role === 'string' ? payload.role : ''
  } catch {
    return ''
  }
}

function isUnsafeBrowserKey(key) {
  return key.startsWith('sb_secret_')
    || key.toLowerCase().includes('service_role')
    || jwtRole(key) === 'service_role'
}

export function validateEnvironment(env, sources = []) {
  const errors = []
  const warnings = []
  const supabaseUrl = value(env, 'VITE_SUPABASE_URL')
  const publishableKey = value(env, 'VITE_SUPABASE_PUBLISHABLE_KEY')
  const anonKey = value(env, 'VITE_SUPABASE_ANON_KEY')
  const browserKey = publishableKey || anonKey
  const leagueId = value(env, 'VITE_SLEEPER_LEAGUE_ID')
  const username = value(env, 'VITE_SLEEPER_USERNAME')
  const openAiKey = value(env, 'OPENAI_API_KEY')
  const configuredCoachModel = value(env, 'OPENAI_COACH_MODEL')
  const leagueSizeValue = value(env, 'VITE_DRAFT_LEAGUE_SIZE')
  const draftSlotValue = value(env, 'VITE_DRAFT_SLOT')

  if (sources.length === 0 && !RELEVANT_KEYS.some((key) => value(env, key))) {
    errors.push('No .env or .env.local file, or relevant process environment variables, were found.')
  }

  if (supabaseUrl && !browserKey) {
    errors.push('VITE_SUPABASE_URL is set, but VITE_SUPABASE_PUBLISHABLE_KEY (or legacy VITE_SUPABASE_ANON_KEY) is missing.')
  }
  if (!supabaseUrl && browserKey) {
    errors.push('A Supabase browser key is set, but VITE_SUPABASE_URL is missing.')
  }
  if (supabaseUrl && !isValidHttpUrl(supabaseUrl)) {
    errors.push('VITE_SUPABASE_URL must be a valid HTTP or HTTPS URL.')
  }
  if (browserKey && isUnsafeBrowserKey(browserKey)) {
    errors.push('The configured Supabase browser key appears to be a secret or service-role key. Use a publishable or legacy anon key instead.')
  }
  if (publishableKey && anonKey) {
    warnings.push('Both Supabase browser key variables are set; VITE_SUPABASE_PUBLISHABLE_KEY takes precedence.')
  } else if (anonKey) {
    warnings.push('VITE_SUPABASE_ANON_KEY is legacy; use VITE_SUPABASE_PUBLISHABLE_KEY when available.')
  }

  const parsedLeagueSize = Number(leagueSizeValue)
  const parsedDraftSlot = Number(draftSlotValue)
  if (leagueSizeValue && (!Number.isInteger(parsedLeagueSize) || parsedLeagueSize <= 0)) {
    errors.push('VITE_DRAFT_LEAGUE_SIZE must be a positive integer.')
  }
  if (draftSlotValue && (!Number.isInteger(parsedDraftSlot) || parsedDraftSlot <= 0)) {
    errors.push('VITE_DRAFT_SLOT must be a positive integer.')
  }
  const leagueSize = positiveInteger(leagueSizeValue, 12)
  const requestedDraftSlot = positiveInteger(draftSlotValue, 1)
  if (draftSlotValue && requestedDraftSlot > leagueSize) {
    errors.push('VITE_DRAFT_SLOT cannot be greater than VITE_DRAFT_LEAGUE_SIZE.')
  }
  const draftSlot = Math.min(leagueSize, requestedDraftSlot)

  const supabaseValid = Boolean(
    supabaseUrl
    && browserKey
    && isValidHttpUrl(supabaseUrl)
    && !isUnsafeBrowserKey(browserKey),
  )
  if (leagueId && !username) {
    warnings.push('VITE_SLEEPER_LEAGUE_ID is set without VITE_SLEEPER_USERNAME; the board is league-scoped, but draft history is disabled.')
  }
  if (username && !leagueId) {
    warnings.push('VITE_SLEEPER_USERNAME is set without VITE_SLEEPER_LEAGUE_ID; draft history is available, but league scoping and practice mock imports are disabled.')
  }
  if (openAiKey && !supabaseValid) {
    warnings.push('OPENAI_API_KEY is set, but the coach remains disabled until valid Supabase browser settings are configured.')
  }
  if (configuredCoachModel && !openAiKey) {
    warnings.push('OPENAI_COACH_MODEL is set, but the coach remains disabled until OPENAI_API_KEY is configured.')
  }

  const features = [
    { name: 'CSV rankings import', enabled: true, detail: 'Browser file selection; no environment values required.' },
    { name: 'Browser local-storage fallback', enabled: true, detail: 'Always available when Supabase is disabled or unreachable.' },
    { name: 'Sleeper live data and draft sync', enabled: true, detail: 'Uses Sleeper public APIs; no credential required.' },
    { name: 'Supabase board persistence', enabled: supabaseValid, detail: supabaseValid ? 'URL and browser-safe key configured.' : 'Requires VITE_SUPABASE_URL and a publishable or anon key.' },
    { name: 'League-scoped board', enabled: supabaseValid && Boolean(leagueId), detail: leagueId ? 'Sleeper league ID configured.' : 'Requires VITE_SLEEPER_LEAGUE_ID.' },
    { name: 'User-scoped draft history', enabled: supabaseValid && Boolean(username), detail: username ? 'Sleeper username configured; resolved at runtime.' : 'Requires VITE_SLEEPER_USERNAME and Supabase.' },
    { name: 'Practice mock imports', enabled: supabaseValid && Boolean(username) && Boolean(leagueId), detail: 'Requires Supabase, Sleeper username, and league ID.' },
    { name: 'AI draft coach', enabled: supabaseValid && Boolean(openAiKey), detail: openAiKey ? 'Configured; run npm run coach:serve alongside the app.' : 'Requires Supabase and server-only OPENAI_API_KEY.' },
  ]

  return {
    valid: errors.length === 0,
    sources,
    errors,
    warnings,
    features,
    settings: {
      leagueSize,
      draftSlot,
      coachModel: configuredCoachModel || 'gpt-5.6',
    },
  }
}

export function formatEnvironmentReport(report) {
  const lines = [
    `Environment validation: ${report.valid ? 'PASS' : 'FAIL'}`,
    `Environment sources: ${report.sources.length > 0 ? report.sources.join(', ') : 'none'}`,
    '',
    'Features:',
    ...report.features.map((feature) => `  [${feature.enabled ? 'enabled' : 'disabled'}] ${feature.name} — ${feature.detail}`),
    '',
    `Draft settings: ${report.settings.leagueSize} teams, slot ${report.settings.draftSlot}`,
    `Coach model: ${report.settings.coachModel}`,
  ]
  if (report.warnings.length > 0) {
    lines.push('', 'Warnings:', ...report.warnings.map((warning) => `  - ${warning}`))
  }
  if (report.errors.length > 0) {
    lines.push('', 'Errors:', ...report.errors.map((error) => `  - ${error}`))
  }
  return lines.join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const loaded = loadEnvironment()
  const report = validateEnvironment(loaded.env, loaded.sources)
  console.log(formatEnvironmentReport(report))
  if (!report.valid) process.exitCode = 1
}
