import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { dailyCheckin, getStreak } from '../lib/api';
import { errMsg, notify } from '../lib/notify';
import { useAsync } from '../lib/useAsync';
import { FACET_META } from '../theme/facets';
import { Flame, streakTier } from './Flame';
import { F } from '../theme/fonts';

/**
 * Серия дней: «Отметиться» раз в сутки (по Москве), справа — сколько дней подряд.
 * Отметка: +2 ELO в текущей грани и очки — 1, с 20-го дня 2, со 100-го 3.
 */
export function StreakButton({ onDone }: { onDone?: () => void }) {
  const { profile } = useMe();
  const { facet, institution, palette: p } = useFacet();
  const [busy, setBusy] = useState(false);
  const { data, reload } = useAsync(() => getStreak(profile.id), [profile.id]);
  const studLocked = facet === 'stud' && !institution;
  const done = data?.checked_today ?? false;
  const streak = data?.streak ?? 0;
  const where = facet === 'stud' ? (institution?.short_name ?? 'Студ') : FACET_META[facet].name;

  const press = async () => {
    if (studLocked) return notify('Нужен вуз', 'Чтобы отметиться в Студ, войдите по коду вуза — или переключитесь на другую грань.');
    setBusy(true);
    try {
      const r = await dailyCheckin(facet, facet === 'stud' ? (institution?.id ?? null) : null);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await reload();
      onDone?.();
      const tier = streakTier(r.streak);
      const newTier = tier.from === r.streak && r.streak > 1 ? `\n\nОгонёк стал: ${tier.name}!` : '';
      const milestone = (r.streak === 20 || r.streak === 100 ? `\n\nНовый уровень серии: теперь ${r.points} очка за день!` : '') + newTier;
      notify(`🔥 День ${r.streak}`, `+${r.points} 🪙 · +${r.elo} ELO (${where})${milestone}`);
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
      <Pressable
        onPress={press}
        disabled={done || busy || !data}
        style={({ pressed }) => ({
          flex: 1,
          borderRadius: 16,
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: done ? p.surfaceAlt : p.accent,
          opacity: pressed || busy ? 0.8 : 1,
          justifyContent: 'center',
        })}
      >
        <Text style={{ color: done ? p.textDim : p.onAccent, fontFamily: F.bold, fontSize: 15 }}>
          {done ? '✓ Отмечено сегодня' : busy ? 'Отмечаем…' : 'Отметиться'}
        </Text>
        <Text style={{ color: done ? p.textDim : p.onAccent, fontFamily: F.regular, fontSize: 11, opacity: 0.85 }}>
          {done ? `Завтра: +${data?.next_points ?? 1} 🪙 · +2 ELO` : `+${data?.next_points ?? 1} 🪙 · +2 ELO · ${where}`}
        </Text>
      </Pressable>
      <View
        style={{
          minWidth: 86,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: streak > 0 ? streakTier(streak).color : p.border,
          backgroundColor: p.surface,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Flame streak={streak} size={22} />
          <Text style={{ color: streak > 0 ? streakTier(streak).color : p.textDim, fontFamily: F.black, fontSize: 20 }}>{streak}</Text>
        </View>
        <Text style={{ color: p.textDim, fontFamily: F.semibold, fontSize: 10 }}>{dayWord(streak)} подряд</Text>
      </View>
    </View>
  );
}

function dayWord(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
  return 'дней';
}
