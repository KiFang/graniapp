import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../context/FacetProvider';
import { GraniLogo } from './GraniLogo';

const ICONS: Record<string, string> = {
  index: '📅',
  games: '🎲',
  rating: '🏆',
  profile: '👤',
};

/** Нижняя панель: 4 вкладки + центральная кнопка Player ID */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const routes = state.routes;
  const half = Math.ceil(routes.length / 2);

  const renderTab = (route: (typeof routes)[number], index: number) => {
    const focused = state.index === index;
    const { options } = descriptors[route.key];
    const label = (options.title ?? route.name) as string;
    return (
      <Pressable
        key={route.key}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        }}
        style={{ flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 }}
      >
        <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{ICONS[route.name] ?? '•'}</Text>
        <Text style={{ fontSize: 11, fontWeight: '700', color: focused ? p.accent : p.textDim }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: Math.max(insets.bottom, 10),
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: p.surface + 'F2',
        borderRadius: 26,
        borderWidth: 1,
        borderColor: p.border,
        paddingHorizontal: 6,
      }}
    >
      {routes.slice(0, half).map((r, i) => renderTab(r, i))}
      <Pressable
        accessibilityLabel="Открыть Player ID"
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          router.push('/player-id');
        }}
        style={({ pressed }) => ({
          width: 64,
          height: 64,
          marginTop: -28,
          borderRadius: 22,
          backgroundColor: '#000',
          borderWidth: 2,
          borderColor: p.accent,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.94 : 1 }],
          shadowColor: p.accent,
          shadowOpacity: 0.5,
          shadowRadius: 12,
          elevation: 8,
        })}
      >
        <GraniLogo size={40} left={p.accent} right={p.accent2} />
      </Pressable>
      {routes.slice(half).map((r, i) => renderTab(r, i + half))}
    </View>
  );
}
