import { Pressable, Text, View } from 'react-native';
import { usePalette } from '../context/FacetProvider';
import { addDays, dayShort, sameDay, weekRangeLabel } from '../lib/date';
import type { GEvent } from '../lib/types';

interface Props {
  monday: Date;
  selected: Date | null;
  events: GEvent[];
  onSelect: (d: Date | null) => void;
  onShiftWeek: (delta: number) => void;
}

/** Шкала недели: все мероприятия недели по дням (Изнанка, Инто, Студ) */
export function WeekStrip({ monday, selected, events, onSelect, onShiftWeek }: Props) {
  const p = usePalette();
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => onShiftWeek(-1)} hitSlop={12}>
          <Text style={{ color: p.textDim, fontSize: 20, paddingHorizontal: 6 }}>‹</Text>
        </Pressable>
        <Pressable onPress={() => onSelect(null)}>
          <Text style={{ color: p.text, fontWeight: '700' }}>{weekRangeLabel(monday)}</Text>
        </Pressable>
        <Pressable onPress={() => onShiftWeek(1)} hitSlop={12}>
          <Text style={{ color: p.textDim, fontSize: 20, paddingHorizontal: 6 }}>›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {days.map((d) => {
          const count = events.filter((e) => sameDay(new Date(e.starts_at), d)).length;
          const isSel = selected ? sameDay(selected, d) : false;
          const isToday = sameDay(today, d);
          return (
            <Pressable
              key={d.toISOString()}
              onPress={() => onSelect(isSel ? null : d)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: isSel ? p.accent : p.surface,
                borderWidth: 1,
                borderColor: isToday && !isSel ? p.accent : p.border,
                gap: 4,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: isSel ? p.onAccent : p.textDim }}>
                {dayShort(d)}
              </Text>
              <Text style={{ fontSize: 17, fontWeight: '800', color: isSel ? p.onAccent : p.text }}>{d.getDate()}</Text>
              <View style={{ flexDirection: 'row', gap: 2, height: 6 }}>
                {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                  <View
                    key={i}
                    style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isSel ? p.onAccent : p.accent }}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
