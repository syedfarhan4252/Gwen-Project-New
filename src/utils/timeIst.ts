export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export const SUPPORTED_TIMEZONES: Array<{ id: string; label: string; offset: string }> = [
  { id: 'Asia/Kolkata', label: 'Indian Standard Time (IST — Default)', offset: 'UTC+05:30' },
  { id: 'UTC', label: 'Coordinated Universal Time (UTC)', offset: 'UTC+00:00' },
  { id: 'Asia/Dubai', label: 'Gulf Standard Time (GST)', offset: 'UTC+04:00' },
  { id: 'Europe/London', label: 'London (GMT/BST)', offset: 'UTC+00:00' },
  { id: 'America/New_York', label: 'Eastern Time (ET)', offset: 'UTC-05:00' },
  { id: 'America/Los_Angeles', label: 'Pacific Time (PT)', offset: 'UTC-08:00' },
  { id: 'Asia/Singapore', label: 'Singapore Time (SGT)', offset: 'UTC+08:00' },
  { id: 'Asia/Tokyo', label: 'Japan Standard Time (JST)', offset: 'UTC+09:00' },
];

export function safeTimeZone(tz?: string): string {
  const candidate = tz?.trim() || DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-IN', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function formatTimeInZone(dateInput: Date | string, tz?: string): string {
  const zone = safeTimeZone(tz);
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return zone === DEFAULT_TIMEZONE ? `${formatted} IST` : formatted;
}

export function formatDateTimeInZone(dateInput: Date | string, tz?: string): string {
  const zone = safeTimeZone(tz);
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return zone === DEFAULT_TIMEZONE ? `${formatted} IST` : formatted;
}

export function getHourMinute24(date: Date, tz?: string): { hour: number; minute: number; hhmm: string } {
  const zone = safeTimeZone(tz);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { hour, minute, hhmm };
}

export function getDateKeyInZone(date: Date, tz?: string): string {
  const zone = safeTimeZone(tz);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function getGreetingForZone(tz?: string): string {
  const { hour } = getHourMinute24(new Date(), tz);
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}
