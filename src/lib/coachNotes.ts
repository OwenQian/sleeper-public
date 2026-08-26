export interface CoachNote {
  name: string
  content: string
}

const NOTE_LIMIT = 12
const NOTE_CONTENT_LIMIT = 6000

const noteModules = import.meta.glob('../../coach-notes/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export function loadCoachNotes(modules: Record<string, string> = noteModules): CoachNote[] {
  return Object.entries(modules)
    .map(([path, content]) => ({
      name: path.split('/').pop()?.replace(/\.md$/i, '') ?? path,
      content: content.trim().slice(0, NOTE_CONTENT_LIMIT),
    }))
    .filter((note) => note.name.toLowerCase() !== 'readme' && note.content.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, NOTE_LIMIT)
}
