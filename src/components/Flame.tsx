import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * Цвет огонька серии по уровню: 1–9, 10–19, 20–39, 40–69, 70–99, 100+.
 * 0 — серия не горит.
 */
export const STREAK_TIERS = [
  { from: 100, color: '#FFD166', hot: '#FFF3C4', name: 'Легендарный' },
  { from: 70, color: '#3DE0C8', hot: '#C9FFF6', name: 'Бирюзовый' },
  { from: 40, color: '#3D8BFF', hot: '#BFD8FF', name: 'Синий' },
  { from: 20, color: '#B45CFF', hot: '#E9CCFF', name: 'Фиолетовый' },
  { from: 10, color: '#FF3D5A', hot: '#FFB3BF', name: 'Алый' },
  { from: 1, color: '#FF8A3D', hot: '#FFD2A8', name: 'Оранжевый' },
] as const;

export function streakTier(n: number) {
  return STREAK_TIERS.find((t) => n >= t.from) ?? { from: 0, color: '#55555C', hot: '#8C8C93', name: 'Не горит' };
}

/** Огонёк серии, цвет зависит от длины серии */
export function Flame({ streak, size = 22 }: { streak: number; size?: number }) {
  const t = streakTier(streak);
  const id = `flame${t.from}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={id} x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={t.color} />
          <Stop offset="1" stopColor={t.hot} />
        </LinearGradient>
      </Defs>
      <Path
        fill={`url(#${id})`}
        d="M12 2c.6 3.2-1 5-2.6 6.7C7.8 10.4 6 12.2 6 15a6 6 0 0 0 12 0c0-2.2-.9-3.8-2-5.2-.3 1.4-1 2.4-2.1 2.9.4-3.3-.5-7.2-1.9-10.7Z"
      />
      <Path fill={t.hot} opacity={0.9} d="M12 21a3 3 0 0 1-3-3c0-1.6 1-2.6 2-3.6.2 1 .8 1.7 1.6 2 .2-.9.6-1.7 1.3-2.3.7.9 1.1 1.9 1.1 3A3 3 0 0 1 12 21Z" />
    </Svg>
  );
}
