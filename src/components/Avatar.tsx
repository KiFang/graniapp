import { LinearGradient } from 'expo-linear-gradient';
import { Image, Text, View } from 'react-native';
import { usePalette } from '../context/FacetProvider';
import type { ShopItem } from '../lib/types';

interface Props {
  name: string;
  url?: string | null;
  size?: number;
  frame?: ShopItem | null;
}

export function Avatar({ name, url, size = 44, frame }: Props) {
  const p = usePalette();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
  const inner = url ? (
    <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: p.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: p.accent, fontWeight: '800', fontSize: size * 0.38 }}>{initials || '?'}</Text>
    </View>
  );
  const colors = frame?.data.colors;
  if (!colors || colors.length === 0) return inner;
  const w = frame?.data.width ?? 3;
  const grad = (colors.length === 1 ? [colors[0], colors[0]] : colors) as [string, string, ...string[]];
  return (
    <LinearGradient
      colors={grad}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ padding: w, borderRadius: (size + w * 2) / 2 }}
    >
      <View style={{ padding: 2, borderRadius: (size + 4) / 2, backgroundColor: p.bg }}>{inner}</View>
    </LinearGradient>
  );
}

export function TitleBadge({ item }: { item?: ShopItem | null }) {
  if (!item?.data.text) return null;
  const c = item.data.color ?? '#fff';
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: c,
        backgroundColor: c + '1A',
      }}
    >
      <Text style={{ color: c, fontSize: 12, fontWeight: '700' }}>{item.data.text}</Text>
    </View>
  );
}

export function RoleBadge({ label, color }: { label: string; color?: string }) {
  const p = usePalette();
  const c = color ?? p.accent;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: c + '26' }}>
      <Text style={{ color: c, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
    </View>
  );
}
