import Feather from '@expo/vector-icons/Feather';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../context/FacetProvider';
import { F } from '../theme/fonts';

export const TAB_BAR_HEIGHT = 66;

const ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  index: 'credit-card',
  events: 'calendar',
  games: 'grid',
  rating: 'bar-chart-2',
  shop: 'shopping-bag',
};

/** Нижняя панель как в ТГ-аппе: Карта · Встречи · Игротека · Рейтинг · Магазин */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: '#000',
        borderTopWidth: 1,
        borderTopColor: '#161618',
        height: TAB_BAR_HEIGHT + Math.max(insets.bottom, 8),
        paddingBottom: Math.max(insets.bottom, 8),
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const color = focused ? '#FFFFFF' : '#5E5E66';
        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 }}
          >
            {/* индикатор активной вкладки — свечение цвета грани */}
            <View
              style={[
                { position: 'absolute', top: 0, width: 26, height: 3, borderRadius: 2, backgroundColor: focused ? p.accent : 'transparent' },
                focused
                  ? Platform.select({
                      web: { boxShadow: `0 0 12px ${p.accent}` } as object,
                      default: { shadowColor: p.accent, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
                    })
                  : null,
              ]}
            />
            <Feather name={ICONS[route.name] ?? 'circle'} size={24} color={color} />
            <Text style={{ fontSize: 12, fontFamily: F.semibold, color }}>{(options.title ?? route.name) as string}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
