# Draft guide intelligence

`player-notes.json` in this directory maps player names to private draft-guide
takes. Every player imported from a rankings CSV whose name matches an entry
(ignoring case, punctuation, and accents) starts with that take as a
pre-populated, resettable note.

```json
{
  "Player Name": "One or two declarative sentences about the player."
}
```

This file is **private intelligence**: it is tracked only in the private
repository and must stay gitignored in any public copy (see
`docs/dual-repo.md`). The app degrades gracefully without it — imported
players simply start without a note.
