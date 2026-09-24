import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';
import { useFacet } from '../context/FacetProvider';
import type { Facet } from '../lib/types';
import { FACET_META, PALETTES } from '../theme/facets';

const ORDER: Facet[] = ['stud', 'inside', 'into'];

/** Смена трёх граней: Студ · Изнанка · Инто */
export function FacetSwitcher() {
  const { facet, setFacet, palette, institution, membership } = useFacet();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: palette.surface,
        borderRadius: 16,
        padding: 4,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      {ORDER.map((f) => {
        const active = f === facet;
        const color = f === 'stud' ? (institution?.color_primary ?? '#FFFFFF') : PALETTES[f].accent;
        return (
          <Pressable
            key={f}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
              setFacet(f);
              // Студ без доступа к вузу — предлагаем ввести код (можно пропустить)
              if (f === 'stud' && !membership && f !== facet) router.push('/stud/join');
            }}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: 'center',
              backgroundColor: active ? color + '22' : 'transparent',
              borderWidth: active ? 1 : 0,
              borderColor: color,
            }}
          >
            <Text style={{ color: active ? color : palette.textDim, fontWeight: '800', fontSize: 14 }}>
              {FACET_META[f].name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
