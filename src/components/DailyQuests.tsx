import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFacet } from '../context/FacetProvider';
import { claimQuest, dailyQuests } from '../lib/api';
import { errMsg, notify } from '../lib/notify';
import { useAsync } from '../lib/useAsync';
import { F } from '../theme/fonts';
import { Card, Row, Txt } from './ui';

/**
 * Ежедневные задания: «Отметься» каждый день + два меняющихся, а в день встречи — «Приди» и «Сыграй».
 * Выполненное засчитывается само (по тому, что игрок сделал), награду забирают кнопкой — очки идут в текущую грань.
 * `bump` — меняется после отметки серии, чтобы задание «Отметься» сразу стало выполненным.
 */
export function DailyQuests({ bump = 0, onClaim }: { bump?: number; onClaim?: () => void }) {
  const { facet, institution, palette: p } = useFacet();
  const { data, reload } = useAsync(() => dailyQuests(), []);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (bump) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bump]);

  if (!data?.length) return null;
  const doneCount = data.filter((q) => q.claimed).length;

  const claim = async (code: string) => {
    if (facet === 'stud' && !institution)
      return notify('Нужен вуз', 'Чтобы получить очки в Студ, войдите по коду вуза — или переключитесь на другую грань.');
    setBusy(code);
    try {
      const pts = await claimQuest(code, facet, facet === 'stud' ? (institution?.id ?? null) : null);
      await reload();
      onClaim?.();
      notify('Задание выполнено', `+${pts} 🪙`);
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="label">Задания на сегодня</Txt>
        <Txt v="small" color={doneCount === data.length ? p.accent : undefined}>
          {doneCount} / {data.length}
        </Txt>
      </Row>
      {/* полоска общего прогресса */}
      <View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: p.surfaceAlt,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: 4,
            width: `${(doneCount / data.length) * 100}%`,
            backgroundColor: p.accent,
          }}
        />
      </View>
      {data.map((q) => (
        <Row key={q.code} style={{ paddingVertical: 4 }}>
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: q.claimed ? p.accent : 'transparent',
              borderWidth: 1.5,
              borderColor: q.done ? p.accent : p.border,
            }}
          >
            {q.claimed ? <Text style={{ color: p.onAccent, fontFamily: F.bold, fontSize: 13 }}>✓</Text> : null}
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Txt
              v="h3"
              style={{
                fontSize: 14,
                opacity: q.claimed ? 0.55 : 1,
                textDecorationLine: q.claimed ? 'line-through' : 'none',
              }}
            >
              {q.title}
            </Txt>
            {!q.done ? <Txt v="small">{q.hint}</Txt> : null}
          </View>
          {q.done && !q.claimed ? (
            <Pressable
              onPress={() => claim(q.code)}
              disabled={busy === q.code}
              style={({ pressed }) => ({
                backgroundColor: p.accent,
                borderRadius: 12,
                paddingVertical: 7,
                paddingHorizontal: 12,
                opacity: pressed || busy === q.code ? 0.7 : 1,
              })}
            >
              <Text style={{ color: p.onAccent, fontFamily: F.bold, fontSize: 13 }}>Забрать +{q.reward}</Text>
            </Pressable>
          ) : (
            <Txt v="small" color={q.claimed ? p.textDim : p.accent}>
              +{q.reward} 🪙
            </Txt>
          )}
        </Row>
      ))}
    </Card>
  );
}
