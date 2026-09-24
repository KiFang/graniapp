import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { FacetHeader } from '../../components/FacetHeader';
import { InstitutionLeaderboard, StudGate } from '../../components/StudGate';
import { Card, Chip, Empty, ErrorText, Loading, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { listGames, listRatings } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';

/** Рейтинг: очки и ELO по грани/вузу/игре; в Студ — ещё и рейтинг вузов */
export default function RatingScreen() {
  const { profile } = useMe();
  const { facet, institution, palette: p } = useFacet();
  const [studTab, setStudTab] = useState<'mine' | 'all'>('mine');
  const [sort, setSort] = useState<'points' | 'elo'>(facet === 'into' ? 'elo' : 'points');
  const [gameId, setGameId] = useState<string | null>(null);
  const instId = facet === 'stud' ? (institution?.id ?? null) : null;
  const locked = facet === 'stud' && !institution;

  const games = useAsync(() => (locked ? Promise.resolve([]) : listGames(facet, instId)), [facet, instId, locked]);
  const ratings = useAsync(
    () => (locked ? Promise.resolve([]) : listRatings(facet, instId, gameId, gameId ? 'elo' : sort)),
    [facet, instId, gameId, sort, locked],
  );

  const showInstitutions = facet === 'stud' && (locked || studTab === 'all');

  return (
    <Screen refreshing={ratings.loading} onRefresh={ratings.reload}>
      <FacetHeader title="Рейтинг" />
      {facet === 'stud' && !locked ? (
        <Row>
          <Chip label={institution?.short_name ?? 'Мой вуз'} active={studTab === 'mine'} onPress={() => setStudTab('mine')} />
          <Chip label="Рейтинг вузов" active={studTab === 'all'} onPress={() => setStudTab('all')} />
        </Row>
      ) : null}

      {locked ? <StudGate /> : showInstitutions ? <InstitutionLeaderboard /> : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="Очки" active={!gameId && sort === 'points'} onPress={() => { setGameId(null); setSort('points'); }} />
            <Chip label="ELO общий" active={!gameId && sort === 'elo'} onPress={() => { setGameId(null); setSort('elo'); }} />
            {games.data?.map((g) => (
              <Chip key={g.id} label={g.title} active={gameId === g.id} onPress={() => setGameId(g.id)} />
            ))}
          </ScrollView>
          <ErrorText error={ratings.error} />
          {ratings.loading && !ratings.data ? <Loading /> : null}
          {ratings.data?.length === 0 ? <Empty icon="🏆" title="Рейтинг пока пуст" hint="Приходите на встречи и играйте!" /> : null}
          {ratings.data?.map((r, i) => {
            const me = r.user_id === profile.id;
            const value = gameId || sort === 'elo' ? r.elo : r.points;
            return (
              <Card
                key={r.id}
                onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.user_id } })}
                style={me ? { borderColor: p.accent } : undefined}
              >
                <Row>
                  <Txt v="h3" color={i < 3 ? p.accent : p.textDim} style={{ width: 30 }}>
                    {i + 1}
                  </Txt>
                  <Avatar name={r.profile?.display_name ?? '?'} url={r.profile?.avatar_url} size={36} />
                  <View style={{ flex: 1 }}>
                    <Txt v="h3" numberOfLines={1}>
                      {r.profile?.display_name ?? 'Игрок'}
                    </Txt>
                    <Txt v="small">
                      {r.matches > 0 ? `${r.wins}П · ${r.losses}Пр${r.draws ? ` · ${r.draws}Н` : ''}` : `@${r.profile?.username}`}
                    </Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Txt v="h2" color={p.accent}>
                      {value}
                    </Txt>
                    <Txt v="small">{gameId || sort === 'elo' ? 'ELO' : 'очков'}</Txt>
                  </View>
                </Row>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
