import { mix, readableOn, type Palette } from './facets';

/** Цвет Player ID выбирает сам игрок (profiles.card_theme = { c1, c2 }) */
export interface CardTheme {
  c1: string;
  c2: string;
}

export const CARD_PRESETS: (CardTheme & { name: string })[] = [
  { name: 'Аквамарин', c1: '#80FFF8', c2: '#2BB8B4' },
  { name: 'Неон', c1: '#8B6CFF', c2: '#3446FF' },
  { name: 'Закат', c1: '#FF4F00', c2: '#7B3FE4' },
  { name: 'Роза', c1: '#FF6FB5', c2: '#8B2CF5' },
  { name: 'Лава', c1: '#FF3D3D', c2: '#FFB347' },
  { name: 'Лес', c1: '#4CE0A0', c2: '#0B6E4F' },
  { name: 'Лёд', c1: '#E8F1FF', c2: '#7AA2FF' },
  { name: 'Золото', c1: '#FFE08A', c2: '#C9971C' },
  { name: 'Графит', c1: '#9AA3B2', c2: '#2A2F3A' },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export function cardTheme(raw: unknown): CardTheme {
  const t = (raw ?? {}) as Partial<CardTheme>;
  return {
    c1: t.c1 && HEX.test(t.c1) ? t.c1 : CARD_PRESETS[0].c1,
    c2: t.c2 && HEX.test(t.c2) ? t.c2 : CARD_PRESETS[0].c2,
  };
}

/** Палитра карты из выбранных игроком цветов */
export function cardPalette(t: CardTheme): Palette {
  return {
    bg: '#000000',
    surface: mix(t.c1, '#000000', 0.82),
    surfaceAlt: mix(t.c1, '#000000', 0.7),
    border: mix(t.c1, '#000000', 0.5),
    text: '#FFFFFF',
    textDim: '#C4C8D0',
    accent: t.c1,
    accent2: t.c2,
    onAccent: readableOn(t.c1),
    danger: '#FF5C7A',
    success: '#4CE0A0',
  };
}
