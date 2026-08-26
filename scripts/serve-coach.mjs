import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

export function findCoachEnvFile(directory = process.cwd()) {
  for (const filename of ['.env.local', '.env']) {
    if (existsSync(resolve(directory, filename))) return filename
  }
  throw new Error('Coach configuration is missing. Copy .env.example to .env or .env.local first.')
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  let envFile
  try {
    envFile = findCoachEnvFile()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }

  console.log(`Starting the coach with ${envFile}…`)
  const result = spawnSync('supabase', ['functions', 'serve', 'coach', '--env-file', envFile, '--no-verify-jwt'], {
    stdio: 'inherit',
  })
  if (result.error) {
    console.error(`Could not start the coach service: ${result.error.message}`)
    process.exit(1)
  }
  process.exit(result.status ?? 1)
}
