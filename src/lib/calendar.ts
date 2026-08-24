import type { DayItem } from '@/lib/types';

export type CalendarPayload = {
  title: string;
  date: string; // YYYY-MM-DD
  heureDebut: string;
  heureFin: string;
  description: string;
  location: string;
  url: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function normalizeTime(h: string): string {
  const m = (h || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${pad2(Number(m[1]))}:${m[2]}`;
}

function shiftMinutes(
  dateIso: string,
  timeHHmm: string,
  addMinutes: number,
): { date: string; time: string } {
  const [y, mo, d] = dateIso.split('-').map(Number);
  const [hh, mm] = timeHHmm.split(':').map(Number);
  const dt = new Date(y, mo - 1, d, hh, mm);
  dt.setMinutes(dt.getMinutes() + addMinutes);
  return {
    date: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`,
    time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`,
  };
}

function toCompact(dateIso: string, timeHHmm?: string): string {
  const [y, m, d] = dateIso.split('-');
  if (!timeHHmm) return `${y}${m}${d}`;
  const [hh, mm] = timeHHmm.split(':');
  return `${y}${m}${d}T${hh}${mm}00`;
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function calendarPayloadFromDayItem(item: DayItem): CalendarPayload | null {
  if (item.kind === 'programme') {
    const { programme: p, evenement: ev, lieu } = item;
    if (!p.date) return null;
    const location = [lieu?.nom, lieu?.adresse, lieu?.commune]
      .filter(Boolean)
      .join(', ');
    const description = [
      ev?.titre && ev.titre !== p.nom_item ? ev.titre : '',
      p.description_item ||
        ev?.description_longue ||
        ev?.description_courte ||
        '',
      p.notes || '',
      p.billetterie_url ||
        p.url ||
        ev?.billetterie_url ||
        ev?.url_source ||
        '',
    ]
      .filter(Boolean)
      .join('\n\n');
    return {
      title: p.nom_item || ev?.titre || 'Événement',
      date: p.date,
      heureDebut: normalizeTime(p.heure_debut),
      heureFin: normalizeTime(p.heure_fin),
      description,
      location,
      url:
        p.billetterie_url ||
        p.url ||
        ev?.billetterie_url ||
        ev?.url_source ||
        '',
    };
  }

  const { evenement: event, lieu } = item;
  const date = item.dayIso || event.date_debut;
  if (!date) return null;
  const location = [lieu?.nom, lieu?.adresse, lieu?.commune]
    .filter(Boolean)
    .join(', ');
  return {
    title: event.titre || 'Événement',
    date,
    heureDebut: normalizeTime(event.heure_debut),
    heureFin: normalizeTime(event.heure_fin),
    description: [
      event.description_longue || event.description_courte || '',
      event.billetterie_url || event.url_source || '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    location,
    url: event.billetterie_url || event.url_source || '',
  };
}

export function googleCalendarUrl(payload: CalendarPayload): string {
  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', payload.title);
  params.set('ctz', 'Europe/Paris');

  if (payload.heureDebut) {
    const end =
      payload.heureFin
        ? { date: payload.date, time: payload.heureFin }
        : shiftMinutes(payload.date, payload.heureDebut, 120);
    params.set(
      'dates',
      `${toCompact(payload.date, payload.heureDebut)}/${toCompact(end.date, end.time)}`,
    );
  } else {
    const next = shiftMinutes(payload.date, '00:00', 24 * 60);
    params.set('dates', `${toCompact(payload.date)}/${toCompact(next.date)}`);
  }

  if (payload.description) params.set('details', payload.description);
  if (payload.location) params.set('location', payload.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcs(payload: CalendarPayload): string {
  const uid = `${payload.date}-${payload.title.slice(0, 24).replace(/\W+/g, '-')}-${Date.now()}@cultureconnect`;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

  let dtStart: string;
  let dtEnd: string;
  if (payload.heureDebut) {
    const end =
      payload.heureFin
        ? { date: payload.date, time: payload.heureFin }
        : shiftMinutes(payload.date, payload.heureDebut, 120);
    dtStart = `DTSTART;TZID=Europe/Paris:${toCompact(payload.date, payload.heureDebut)}`;
    dtEnd = `DTEND;TZID=Europe/Paris:${toCompact(end.date, end.time)}`;
  } else {
    const next = shiftMinutes(payload.date, '00:00', 24 * 60);
    dtStart = `DTSTART;VALUE=DATE:${toCompact(payload.date)}`;
    dtEnd = `DTEND;VALUE=DATE:${toCompact(next.date)}`;
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CultureConnect//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${icsEscape(payload.title)}`,
  ];
  if (payload.description) lines.push(`DESCRIPTION:${icsEscape(payload.description)}`);
  if (payload.location) lines.push(`LOCATION:${icsEscape(payload.location)}`);
  if (payload.url) lines.push(`URL:${payload.url}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(payload: CalendarPayload): void {
  const blob = new Blob([buildIcs(payload)], {
    type: 'text/calendar;charset=utf-8',
  });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${payload.title.replace(/[^\w\u00C0-\u024F]+/g, '-').slice(0, 40) || 'evenement'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
