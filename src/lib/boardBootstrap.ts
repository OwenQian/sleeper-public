import type { BoardSnapshot } from './boardStore'
import { hydrateGuideNotes } from './rankings'
import { parseRankingsImport } from './rankingsImport'

export const BOARD_STORAGE_KEY = 'draft-room-2026-half-ppr-v1'

interface StorageReader {
  getItem(key: string): string | null
}

export function readLocalBoardSnapshot(
  storage: StorageReader = localStorage,
): BoardSnapshot | null {
  try {
    const stored = storage.getItem(BOARD_STORAGE_KEY)
    if (!stored) return null
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed)) return { players: parsed }
    if (
      typeof parsed === 'object'
      && parsed !== null
      && Array.isArray((parsed as BoardSnapshot).players)
    ) {
      return parsed as BoardSnapshot
    }
    return null
  } catch {
    return null
  }
}

export function selectInitialBoard(
  persisted: BoardSnapshot | null,
  seedCsv = '',
  noteLookup?: (name: string) => string | undefined,
): BoardSnapshot {
  if (persisted) return { players: hydrateGuideNotes(persisted.players, noteLookup) }
  try {
    return { players: parseRankingsImport(seedCsv) }
  } catch {
    return { players: [] }
  }
}
