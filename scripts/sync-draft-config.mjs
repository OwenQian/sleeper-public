import { readFile, writeFile } from 'node:fs/promises'
import { deriveDraftConfig } from '../src/lib/draftConfig.ts'

const sleeperApi = 'https://api.sleeper.app/v1'
const configUrl = new URL('../src/data/draft-config.json', import.meta.url)
const fallback = JSON.parse(await readFile(configUrl, 'utf8'))
const username = process.env.VITE_SLEEPER_USERNAME?.trim()
const leagueId = process.env.VITE_SLEEPER_LEAGUE_ID?.trim()

if (!username || !leagueId) {
  console.log('Draft config sync skipped: set VITE_SLEEPER_USERNAME and VITE_SLEEPER_LEAGUE_ID.')
  process.exit(0)
}

async function fetchJson(path) {
  const response = await fetch(`${sleeperApi}${path}`)
  if (!response.ok) throw new Error(`Sleeper request failed (${response.status}): ${path}`)
  return response.json()
}

const user = await fetchJson(`/user/${encodeURIComponent(username)}`)
if (!user?.user_id) throw new Error(`Sleeper user "${username}" was not found.`)

const [league, drafts] = await Promise.all([
  fetchJson(`/league/${encodeURIComponent(leagueId)}`),
  fetchJson(`/league/${encodeURIComponent(leagueId)}/drafts`),
])
if (!league?.league_id) throw new Error(`Sleeper league "${leagueId}" was not found.`)

const config = deriveDraftConfig({ league, user, drafts, fallback })
await writeFile(configUrl, `${JSON.stringify(config, null, 2)}\n`)
console.log(
  `Draft config synced: ${config.leagueSize} teams, slot ${config.draftSlot}, draft ${config.draftId ?? 'unassigned'}.`,
)
