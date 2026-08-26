import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findCoachEnvFile } from './serve-coach.mjs'

const temporaryDirectories: string[] = []

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'sleeper-coach-env-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true })
})

describe('findCoachEnvFile', () => {
  it('uses .env when that is the configured file', () => {
    const directory = temporaryDirectory()
    writeFileSync(join(directory, '.env'), 'OPENAI_API_KEY=test\n')

    expect(findCoachEnvFile(directory)).toBe('.env')
  })

  it('prefers .env.local when both files exist', () => {
    const directory = temporaryDirectory()
    writeFileSync(join(directory, '.env'), 'OPENAI_API_KEY=base\n')
    writeFileSync(join(directory, '.env.local'), 'OPENAI_API_KEY=local\n')

    expect(findCoachEnvFile(directory)).toBe('.env.local')
  })

  it('explains how to create configuration when neither file exists', () => {
    expect(() => findCoachEnvFile(temporaryDirectory())).toThrow('Copy .env.example to .env or .env.local')
  })
})
