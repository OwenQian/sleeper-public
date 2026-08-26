export type AppRoute =
  | { page: 'board' }
  | { page: 'drafts' }
  | { page: 'draft'; draftId: string }

export function parseAppRoute(pathname: string): AppRoute {
  const match = pathname.match(/^\/drafts\/([^/]+)\/?$/)
  if (match) return { page: 'draft', draftId: decodeURIComponent(match[1]) }
  if (/^\/drafts\/?$/.test(pathname)) return { page: 'drafts' }
  return { page: 'board' }
}
