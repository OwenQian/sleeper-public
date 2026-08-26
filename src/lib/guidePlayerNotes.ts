// Draft-guide player notes are private intelligence and live outside the
// code in guide/player-notes.json, which public copies of this repository
// do not track. When the file is absent every lookup returns undefined and
// imported players simply start without a pre-populated note.
const noteModules = import.meta.glob('../../guide/player-notes.json', {
  import: 'default',
  eager: true,
}) as Record<string, Record<string, string>>

function normalizePlayerName(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/, '')
    .replace(/[^a-z0-9]/g, '')
}

export function buildGuideNoteLookup(
  notes: Record<string, string>,
): (name: string) => string | undefined {
  const normalized = new Map(
    Object.entries(notes).map(([name, note]) => [normalizePlayerName(name), note]),
  )
  return (name) => normalized.get(normalizePlayerName(name))
}

const defaultLookup = buildGuideNoteLookup(
  Object.assign({}, ...Object.values(noteModules)) as Record<string, string>,
)

export function guidePlayerNote(name: string): string | undefined {
  return defaultLookup(name)
}
