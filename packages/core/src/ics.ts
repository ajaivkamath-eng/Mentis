/* ICS export: per-staff and per-venue upcoming sessions (default 8 weeks). */
export interface IcsEvent { uid: string; title: string; startsAt: string; endsAt: string; location?: string; description?: string }
const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
export function buildICS(calendarName: string, events: IcsEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mentis//Kingfisher TTC//EN',
    `X-WR-CALNAME:${esc(calendarName)}`,
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT', `UID:${e.uid}@mentis.kingfishertabletennisclub.com`,
      `DTSTAMP:${fmt(new Date().toISOString())}`, `DTSTART:${fmt(e.startsAt)}`, `DTEND:${fmt(e.endsAt)}`,
      `SUMMARY:${esc(e.title)}`,
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
export function upcomingWindow(events: IcsEvent[], weeks = 8, now = new Date()): IcsEvent[] {
  const end = now.getTime() + weeks * 7 * 86_400_000;
  return events.filter((e) => {
    const t = Date.parse(e.startsAt);
    return t >= now.getTime() && t <= end;
  });
}
