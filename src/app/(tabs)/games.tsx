import { router } from 'expo-router';
import { View } from 'react-native';
import { EventCard } from '../../components/EventCard';
import { FacetHeader } from '../../components/FacetHeader';
import { StudGate } from '../../components/StudGate';
import { Button, Card, Empty, ErrorText, Loading, Row, Screen, Txt } from '../../components/ui';
import { useFacet } from '../../context/FacetProvider';
import { listEvents, listGames } from '../../lib/api';
import { addDays } from '../../lib/date';
import { useAsync } from '../../lib/useAsync';

/** Игротека (Студ, Изнанка) / Турниры и игры (Инто) */
export default function GamesScreen() {
  const { facet, institution, can, palette: p } = useFacet();
  const instId = institution?.id ?? null;
  const locked = facet === 'stud' && !institution;

  const { data, error, loading, reload } = useAsync(async () => {
    if (locked) return { games: [], tournaments: [] };
    const now = new Date();
    const [games, upcoming] = await Promise.all([
      listGames(facet, instId),
      facet === 'into' ? listEvents('into', null, addDays(now, -1), addDays(now, 60)) : Promise.resolve([]),
    ]);
    return { games, tournaments: upcoming.filter((e) => e.is_tournament) };
  }, [facet, instId, locked]);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <FacetHeader title={facet === 'into' ? 'Турниры' : 'Игротека'} />
      {locked ? (
        <StudGate />
      ) : (
        <>
          <Row>
            {can('manage_games') ? (
              <Button
                small
                kind="secondary"
                icon="＋"
                title="Игра"
                style={{ flex: 1 }}
                onPress={() => router.push('/game/edit')}
              />
            ) : null}
            {can('manage_matches') ? (
              <Button
                small
                kind="secondary"
                icon="⚔"
                title="Результат матча"
                style={{ flex: 1 }}
                onPress={() => router.push('/game/match')}
              />
            ) : null}
          </Row>
          <ErrorText error={error} />
          {loading && !data ? <Loading /> : null}

          {facet === 'into' ? (
            <>
              <Txt v="label">Ближайшие мини-турниры</Txt>
              {data?.tournaments.length === 0 ? (
                <Empty icon="🏁" title="Турниров пока нет" hint="За участие — очки и ELO" />
              ) : null}
              {data?.tournaments.map((e) => (
                <EventCard key={e.id} event={e} onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })} />
              ))}
              <Txt v="label">Дисциплины</Txt>
            </>
          ) : (
            <Txt v="label">Игры с рейтингами</Txt>
          )}

          {data && data.games.length === 0 ? <Empty icon="🎲" title="Игротека пуста" /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {data?.games.map((g) => (
              <Card
                key={g.id}
                style={{ width: '48%', flexGrow: 1, minHeight: 110 }}
                onPress={() => router.push({ pathname: '/game/[id]', params: { id: g.id } })}
              >
                <Txt v="h1">{g.is_pc ? '🎮' : '🎲'}</Txt>
                <Txt v="h3" numberOfLines={2}>
                  {g.title}
                </Txt>
                <Txt v="small" color={p.accent}>
                  {g.min_players}–{g.max_players} игроков{g.play_minutes ? ` · ${g.play_minutes} мин` : ''}
                </Txt>
              </Card>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
