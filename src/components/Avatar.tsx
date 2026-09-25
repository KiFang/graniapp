import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { SvgUri } from 'react-native-svg';
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
  const [broken, setBroken] = useState(false);
  const isSvg = Boolean(url && /\.svg(\?|$)/i.test(url));
  const inner = url && !broken ? (
    isSvg ? (
      // аватарки из Telegram (t.me/i/userpic/…) — SVG
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
        <SvgUri uri={url} width={size} height={size} onError={() => setBroken(true)} />
      </View>
    ) : (
      <Image
        source={{ uri: url }}
        onError={() => setBroken(true)}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    )
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

/** Титул: цвет, градиент (data.gradient) и свечение (data.glow). lg — крупно, для витрины магазина */
export function TitleBadge({ item, center, size = 'md' }: { item?: Pick<ShopItem, 'data'> | null; center?: boolean; size?: 'md' | 'lg' }) {
  if (!item?.data.text) return null;
  const c = item.data.color ?? '#fff';
  const grad = item.data.gradient && item.data.gradient.length >= 2 ? item.data.gradient : null;
  const lg = size === 'lg';
  return (
    <View
      style={[
        {
          alignSelf: center ? 'center' : 'flex-start',
          borderRadius: 999,
          borderWidth: 1,
          borderColor: c,
          overflow: 'hidden',
        },
        item.data.glow ? { shadowColor: c, shadowOpacity: 0.8, shadowRadius: lg ? 14 : 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 } : null,
      ]}
    >
      {grad ? (
        <LinearGradient colors={grad.map((x) => x + '38') as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', inset: 0 }} />
      ) : (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: c + '1A' }} />
      )}
      <Text style={{ color: c, fontSize: lg ? 15 : 12, fontWeight: '800', paddingHorizontal: lg ? 14 : 10, paddingVertical: lg ? 6 : 3, letterSpacing: lg ? 0.3 : 0 }}>
        {item.data.text}
      </Text>
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
