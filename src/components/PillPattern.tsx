import { View } from 'react-native';

// Фирменный узор из капсул (как на лидерпасе): белый · цвет · белый · второй цвет · белый · цвет
const SHAPES = [
  { rot: 8, c: 'w' },
  { rot: -36, c: 'a' },
  { rot: -2, c: 'w' },
  { rot: 52, c: 'b' },
  { rot: -4, c: 'w' },
  { rot: -40, c: 'a' },
] as const;

export function PillPattern({ width, a, b }: { width: number; a: string; b: string }) {
  const pw = width * 0.155;
  const ph = width * 0.27;
  const step = (width - pw) / (SHAPES.length - 1);
  return (
    <View style={{ width, height: ph * 1.02, marginVertical: 4 }}>
      {SHAPES.map((s, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: i * step,
            top: 0,
            width: pw,
            height: ph,
            borderRadius: pw / 2,
            backgroundColor: s.c === 'w' ? '#FFFFFF' : s.c === 'a' ? a : b,
            transform: [{ rotate: `${s.rot}deg` }],
          }}
        />
      ))}
    </View>
  );
}
