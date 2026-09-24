import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { generateBracket, getBracket, profilesByIds, setBracketWinner, undoBracketWinner } from '../lib/api';
import { confirm, errMsg, notify } from '../lib/notify';
import type { BracketMatch, GEvent } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { F } from '../theme/fonts';
import { Button, Card, ErrorText, Loading, Txt } from './ui';

const CARD_H = 76;
const CARD_W = 172;
const GAP = 12;

export function roundLabel(round: number, total: number) {
  const left = total - round;
  if (left === 0) return 'Финал';
  if (left === 1) return 'Полуфинал';
  if (left === 2) return '1/4 финала';
  if (left === 3) return '1/8 финала';
  return `Раунд ${round}`;
}

/** Турнирная сетка на выбывание: смотрят все, победителей отмечает лидер с правом «Результаты и очки» */
export function Bracket({ event }: { event: GEvent }) {
  const { profile } = useMe();
  const { can, palette: p } = useFacet();
  const manage = can('manage_matches');
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const matches = await getBracket(event.id);
    const ids = [...new Set(matches.flatMap((m) => [m.player1, m.player2]).filter(Boolean) as string[])];
    const people = await profilesByIds(ids);
    return { matches, names: new Map(people.map((x) => [x.id, x.display_name || x.username])) };
  }, [event.id]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return loading ? <Loading /> : <ErrorText error={error} />;
  const { matches, names } = data;
  const rounds = matches.reduce((m, x) => Math.max(m, x.round), 0);
  const firstRound = matches.filter((m) => m.round === 1).length;
  const final = matches.find((m) => m.round === rounds);
  const hasResults = matches.some((m) => m.winner && !m.is_bye);
  const name = (id: string | null) => (id ? (names.get(id) ?? 'Игрок') : null);

  const build = () =>
    run(async () => {
      const n = await generateBracket(event.id);
      notify('Сетка готова', `Участников: ${n}. Каждому придёт уведомление о сопернике.`);
    });

  const pick = async (m: BracketMatch, winner: string) => {
    const ok = await confirm(
      `Победитель: ${name(winner)}?`,
      event.elo_enabled ? 'Результат сразу уйдёт в ELO — отменить будет нельзя.' : 'Победитель пройдёт в следующий раунд.',
      'Да, победил',
    );
    if (ok) await run(() => setBracketWinner(m.id, winner));
  };

  if (!matches.length) {
    return (
      <Card>
        <Txt v="label">Турнирная сетка</Txt>
        <Txt v="dim">
          {manage
            ? 'Составьте сетку, когда участники соберутся: в неё попадут отмеченные (или все записавшиеся, если отмечено меньше двух). Сильные по ELO разводятся по разным половинам.'
            : 'Сетка появится, когда лидер её составит.'}
        </Txt>
        {manage ? <Button title="Составить сетку" icon="🗂" onPress={build} loading={busy} /> : null}
      </Card>
    );
  }

  const columnH = firstRound * (CARD_H + GAP);

  return (
    <View style={{ gap: 10 }}>
      <Txt v="label">Турнирная сетка</Txt>
      {final?.winner ? (
        <Card style={{ borderColor: p.accent, alignItems: 'center' }}>
          <Txt v="small">Победитель турнира</Txt>
          <Txt v="h2" color={p.accent}>
            🏆 {name(final.winner)}
          </Txt>
        </Card>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 16 }}>
        {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
          <View key={r} style={{ width: CARD_W, gap: 8 }}>
            <Text style={{ color: p.textDim, fontFamily: F.bold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {roundLabel(r, rounds)}
            </Text>
            <View style={{ height: columnH, justifyContent: 'space-around' }}>
              {matches
                .filter((m) => m.round === r)
                .map((m) => {
                  const open = manage && !m.winner && m.player1 && m.player2;
                  const row = (id: string | null, seed: number | null, top: boolean) => {
                    const won = m.winner != null && m.winner === id;
                    const lost = m.winner != null && id != null && m.winner !== id;
                    const me = id === profile.id;
                    return (
                      <Pressable
                        disabled={!open || !id || busy}
                        onPress={() => id && pick(m, id)}
                        onLongPress={() => id && router.push({ pathname: '/user/[id]', params: { id } })}
                        style={({ pressed }) => ({
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingHorizontal: 10,
                          backgroundColor: won ? p.accent + '33' : pressed ? p.surfaceAlt : 'transparent',
                          borderTopLeftRadius: top ? 12 : 0,
                          borderTopRightRadius: top ? 12 : 0,
                          borderBottomLeftRadius: top ? 0 : 12,
                          borderBottomRightRadius: top ? 0 : 12,
                        })}
                      >
                        <Text style={{ color: p.textDim, fontFamily: F.bold, fontSize: 10, width: 14 }}>{seed ?? ''}</Text>
                        <Text
                          numberOfLines={1}
                          style={{
                            flex: 1,
                            color: id ? (lost ? p.textDim : p.text) : p.textDim,
                            fontFamily: won || me ? F.bold : F.regular,
                            fontSize: 13,
                            textDecorationLine: lost ? 'line-through' : 'none',
                          }}
                        >
                          {id ? name(id) : m.is_bye && r === 1 ? '— проход —' : '…'}
                        </Text>
                        {won ? <Text style={{ color: p.accent, fontSize: 12 }}>✓</Text> : null}
                      </Pressable>
                    );
                  };
                  const mine = m.player1 === profile.id || m.player2 === profile.id;
                  return (
                    <View key={m.id}>
                      <View
                        style={{
                          height: CARD_H,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: open ? p.accent : mine ? p.accent2 : p.border,
                          backgroundColor: p.surface,
                          opacity: m.is_bye ? 0.55 : 1,
                        }}
                      >
                        {row(m.player1, m.seed1, true)}
                        <View style={{ height: 1, backgroundColor: p.border }} />
                        {row(m.player2, m.seed2, false)}
                      </View>
                      {manage && m.winner && !m.is_bye && !m.match_id ? (
                        <Pressable
                          onPress={async () => {
                            if (await confirm('Отменить результат?', `${name(m.winner)} вернётся в этот матч.`, 'Отменить')) {
                              await run(() => undoBracketWinner(m.id));
                            }
                          }}
                          hitSlop={6}
                          style={{ position: 'absolute', right: 6, bottom: -14 }}
                        >
                          <Text style={{ color: p.textDim, fontFamily: F.semibold, fontSize: 10 }}>отменить</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
            </View>
          </View>
        ))}
      </ScrollView>
      {manage && !final?.winner ? (
        <Txt v="small">Нажмите на имя, чтобы отметить победителя матча. Долгое нажатие — профиль игрока.</Txt>
      ) : null}
      {manage && !hasResults ? <Button small kind="ghost" title="Пересобрать сетку" onPress={build} loading={busy} /> : null}
    </View>
  );
}
