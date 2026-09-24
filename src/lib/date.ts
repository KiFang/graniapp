const DAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

/** Понедельник недели, в которую попадает дата (00:00 локального времени). */
export function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - day);
  return r;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export const dayShort = (d: Date) => DAYS_SHORT[d.getDay()];
export const pad = (n: number) => String(n).padStart(2, '0');
export const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${dayShort(d)}, ${fmtDate(d)} · ${fmtTime(d)}`;
};
export const monthTitle = (d: Date) => `${MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}`;

export function weekRangeLabel(monday: Date) {
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth()) return `${monday.getDate()}–${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
  return `${fmtDate(monday)} – ${fmtDate(sunday)}`;
}

/** «2025-10-01 19:30» <-> Date, для простого ввода даты без нативных пикеров. */
export function toInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${fmtTime(d)}`;
}

export function parseInputValue(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return isNaN(d.getTime()) ? null : d;
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return fmtDate(new Date(iso));
}
