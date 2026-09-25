import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { eventWants, listGames, toggleWant } from '../lib/api';
import { errMsg, notify } from '../lib/notify';
import type { GEvent } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { F } from '../theme/fonts';
import { Card, Row, Txt } from './ui';

const MAX_WANTS = 3;
const COLLAPSED = 5;

/**
 * Хочуметр игротеки: до начала встречи каждый может кинуть «Хочу» в 1–3 игры.
 * Самые желанные — сверху, у лидера больше шансов взять их с собой.
 */
export function WantMeter({ event }: { event: GEvent }) {
  const { profile } = useMe();
  const { palette: p } = useFacet();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const started = Date.parse(event.starts_at) <= Date.now();

  const { data, reload } = useAsync(async () => {
    const [games, wants] = await Promise.all([listGames(event.facet, event.institution_id), eventWants(event.id)]);
    return { games, wants };
  }, [event.id]);

  if (!data?.games.length) return null;
  const { games, wants } = data;
  const count = (g: string) => wants.filter((w) => w.game_id === g).length;
  const mine = new Set(wants.filter((w) => w.user_id === profile.id).map((w) => w.game_id));
  const voters = new Set(wants.map((w) => w.user_id)).size;
  const ranked = [...games].sort((a, b) => count(b.id) - count(a.id) || a.title.localeCompare(b.title, 'ru'));
  const top = Math.max(1, ...ranked.map((g) => count(g.id)));
  const shown = open ? ranked : ranked.slice(0, COLLAPSED);

  const toggle = async (gameId: string) => {
    if (started) return;
    if (!mine.has(gameId) && mine.size >= MAX_WANTS) {
      return notify('Хватит трёх', `Можно выбрать до ${MAX_WANTS} игр — снимите «Хочу» с одной, чтобы выбрать другую.`);
    }
    setBusy(gameId);
    try {
      await toggleWant(event.id, gameId);
      await reload();
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="label">Хочуметр игротеки</Txt>
        <Txt v="small">
          {voters} {plural(voters, 'голос', 'голоса', 'голосов')}
        </Txt>
      </Row>
      <Txt v="small">
        {started
          ? 'Голосование закрыто — встреча уже началась.'
          : `Кинь «Хочу» в игры, в которые хочешь сыграть (до ${MAX_WANTS}). Самые популярные скорее возьмут на встречу.`}
      </Txt>
      {shown.map((g, i) => {
        const n = count(g.id);
        const on = mine.has(g.id);
        return (
          <Pressable
            key={g.id}
            onPress={() => toggle(g.id)}
            disabled={started || busy === g.id}
            style={({ pressed }) => ({
              opacity: pressed || busy === g.id ? 0.7 : 1,
            })}
          >
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: on ? p.accent : p.border,
                backgroundColor: p.surfaceAlt,
                overflow: 'hidden',
              }}
            >
              {/* полоска популярности */}
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${(n / top) * 100}%`,
                  backgroundColor: p.accent + (i === 0 && n > 0 ? '38' : '1f'),
                }}
              />
              <Row style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 15, width: 22 }}>{i === 0 && n > 0 ? '🔥' : '🎲'}</Text>
                <Txt v="h3" style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
                  {g.title}
                </Txt>
                <Txt v="small" color={n ? p.text : undefined}>
                  {n}
                </Txt>
                {!started ? (
                  <View
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      backgroundColor: on ? p.accent : 'transparent',
                      borderWidth: 1,
                      borderColor: on ? p.accent : p.border,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: F.bold,
                        fontSize: 12,
                        color: on ? p.onAccent : p.textDim,
                      }}
                    >
                      {on ? '✓ Хочу' : 'Хочу'}
                    </Text>
                  </View>
                ) : null}
              </Row>
            </View>
          </Pressable>
        );
      })}
      {ranked.length > COLLAPSED ? (
        <Pressable onPress={() => setOpen(!open)} style={{ alignSelf: 'center', paddingVertical: 4 }}>
          <Txt v="small" color={p.accent}>
            {open ? 'Свернуть' : `Все игры (${ranked.length})`}
          </Txt>
        </Pressable>
      ) : null}
    </Card>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
