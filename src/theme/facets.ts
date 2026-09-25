import type { Facet, Institution } from '../lib/types';

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textDim: string;
  accent: string;   // основной цвет грани
  accent2: string;  // второй цвет (градиенты, правый треугольник логотипа)
  onAccent: string; // текст на акцентной кнопке
  danger: string;
  success: string;
}

const base = {
  text: '#F5F7FA',
  textDim: '#8C8C93',
  danger: '#FF5C7A',
  success: '#4CE0A0',
};

export const FACET_META: Record<Facet, { name: string; tagline: string }> = {
  stud: { name: 'Студ', tagline: 'Грань учебных заведений' },
  inside: { name: 'Изнанка', tagline: 'Открытая грань для всех' },
  into: { name: 'Инто', tagline: 'Турниры и ПК-гейминг' },
};

// Базa как в старом приложении: чистый чёрный, тонкие рамки, яркий акцент грани
const dark = {
  bg: '#000000',
  surface: '#0B0B0C',
  surfaceAlt: '#151517',
  border: '#1F1F22',
};

export const PALETTES: Record<Facet, Palette> = {
  // Изнанка — аквамарин (цвета логотипа)
  inside: { ...base, ...dark, accent: '#80FFF8', accent2: '#2BB8B4', onAccent: '#021413' },
  // Инто — тёмно-синий / фиолетовый
  into: { ...base, ...dark, accent: '#8B6CFF', accent2: '#3446FF', onAccent: '#FFFFFF' },
  // Студ — цвета задаёт учебное заведение; по умолчанию оранжевый/фиолетовый из ТГ-аппы
  stud: { ...base, ...dark, accent: '#FF4F00', accent2: '#7B3FE4', onAccent: '#FFFFFF' },
};

/** Чёрный или белый текст поверх цвета — по яркости. */
export function readableOn(hex: string): string {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#050505' : '#FFFFFF';
}

export function paletteFor(facet: Facet, inst?: Institution | null): Palette {
  const p = PALETTES[facet];
  if (facet !== 'stud' || !inst) return p;
  return {
    ...p,
    accent: inst.color_primary,
    accent2: inst.color_secondary,
    onAccent: readableOn(inst.color_primary),
  };
}

export function mix(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const c = pa.map((v, i) => Math.round(v * (1 - t) + pb[i] * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): number[] {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) || 0);
}

export const RARITY_COLORS = {
  common: '#9AA3B2',
  rare: '#4FC3F7',
  epic: '#B388FF',
  legendary: '#FFD166',
  special: '#FF7AD9',
} as const;

export const RARITY_LABELS = {
  common: 'Обычный',
  rare: 'Редкий',
  epic: 'Эпический',
  legendary: 'Легендарный',
  special: 'Особый',
} as const;

export const ROLE_LABELS = {
  president: 'Президент',
  vice_president: 'Заместитель президента',
  leader: 'Лидер',
  member: 'Участник',
  guest: 'Гость',
  founder: 'Основатель',
} as const;

export const PERMISSION_LABELS: Record<string, string> = {
  manage_events: 'Мероприятия',
  check_in: 'Отметка участников',
  manage_games: 'Игротека',
  manage_matches: 'Результаты и очки',
  manage_roles: 'Роли',
  manage_shop: 'Магазин наград',
  view_users: 'Просмотр всех пользователей',
  ban: 'Баны',
  important_events: 'Важные события',
  leader_scan: 'Сканер Leader ID',
  manage_access: 'Коды и гостевой доступ',
};
