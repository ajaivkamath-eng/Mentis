/* Global search result shaping — queries themselves are RLS-respecting
 * server-side filters (rule 25: no cross-role leakage via search/inbox). */
export type SearchKind = 'member' | 'customer' | 'session' | 'task' | 'event' | 'staff';
export interface SearchResult { kind: SearchKind; id: string; title: string; subtitle?: string }
export function rankResults(query: string, results: SearchResult[]): SearchResult[] {
  const q = query.toLowerCase();
  return [...results].sort((a, b) => {
    const score = (r: SearchResult) =>
      (r.title.toLowerCase().startsWith(q) ? 2 : 0) + (r.title.toLowerCase().includes(q) ? 1 : 0);
    return score(b) - score(a);
  });
}
