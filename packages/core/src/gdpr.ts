/* GDPR toolkit (rule 26): full record export + erasure with financial retention. */
export interface MemberRecordExport {
  profile: Record<string, unknown>;
  consents: unknown[];
  attendance: unknown[];
  feedbackSummary: unknown[];
  rankings: unknown[];
  matches: unknown[];
  debits: unknown[];
}
export function buildRecordExport(sections: MemberRecordExport): MemberRecordExport {
  return sections;
}
export function exportToCSV(section: string, rows: Record<string, unknown>[]): string {
  if (!rows.length) return `${section}\n(no records)\n`;
  const headers = Object.keys(rows[0]);
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [`${section}`, headers.join(','), ...rows.map((r) => headers.map((h) => q(r[h])).join(','))].join('\n');
}
/** Erasure: anonymise personal data; retain aggregated financial records (UK tax retention). */
export interface ErasableMember {
  id: string; name?: string; photoRef?: string;
  specialNeeds?: string; nokName?: string; nokPhone?: string;
  [k: string]: unknown;
}
export function anonymiseMember(member: ErasableMember): ErasableMember {
  return {
    ...member,
    name: `Erased member ${member.id.slice(0, 8)}`,
    photoRef: undefined, specialNeeds: undefined, nokName: undefined, nokPhone: undefined,
    erasedAt: new Date().toISOString(),
  };
}
