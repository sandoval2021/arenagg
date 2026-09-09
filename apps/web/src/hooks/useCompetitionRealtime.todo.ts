// TODO(Realtime): wire this hook into CompetitionDetailPageLight once client-side
// authorization is defined for Supabase Realtime.
//
// Intended behavior:
// 1. Subscribe to UPDATE/INSERT on public."Match" and public."MatchStats" for
//    the current competition/matches.
// 2. Treat each Realtime event as an invalidation signal, not as the source of
//    truth: invalidate ['competition', competitionId], ['standings', competitionId]
//    and ['match-stats', competitionId] so the Hono API re-fetches authorized data.
// 3. Cleanup the channel on unmount/competitionId change to avoid duplicate
//    subscriptions.
// 4. Never expose SUPABASE_SERVICE_ROLE_KEY in the browser.
//
// Security note: Chavea authenticates users with its own HttpOnly Session cookie,
// not Supabase Auth JWTs. Before enabling this hook in the browser, add a safe
// Realtime authorization strategy (RLS + custom JWT or a server-side Broadcast
// bridge). The database publication is enabled now, but the frontend subscription
// stays intentionally fail-closed until that authorization layer exists.
export function useCompetitionRealtimeTodo(_competitionId: string): void {
  // Intentionally not connected yet. See TODO above.
}
