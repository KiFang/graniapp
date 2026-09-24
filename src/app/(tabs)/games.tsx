import { router } from 'expo-router';
import { View } from 'react-native';
import { FacetHeader } from '../../components/FacetHeader';
import { Recommendations } from '../../components/Recommendations';
import { StudGate } from '../../components/StudGate';
import { Button, Card, Empty, ErrorText, Loading, Row, Screen, Txt } from '../../components/ui';
import { useFacet } from '../../context/FacetProvider';
import { listGames } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';

/** Игротека с рейтингами (Студ, Изнанка) / Рекомендации лидеров (Инто) */
export default function GamesScreen() {
  const { facet, institution } = useFacet();
  const locked = facet === 'stud' && !institution;
  return (
    <Screen>
      <FacetHeader title={facet === 'into' ? 'Рекомендации' : 'Игротека'} />
      {locked ? <StudGate /> : facet === 'into' ? <Recommendations /> : <Library />}
    </Screen>
  );
}

function Library() {
  const { facet, institution, can, palette: p } = useFacet();
  const instId = institution?.id ?? null;
  const { data, error, loading } = useAsync(() => listGames(facet, instId), [facet, instId]);
  return (
    <View style={{ gap: 12 }}>
      <Row>
        {can('manage_games') ? (
          <Button small kind="secondary" icon="＋" title="Игра" style={{ flex: 1 }} onPress={() => router.push('/game/edit')} />
        ) : null}
        {can('manage_matches') ? (
          <Button small kind="secondary" icon="⚔" title="Результат матча" style={{ flex: 1 }} onPress={() => router.push('/game/match')} />
        ) : null}
      </Row>
      <Txt v="label">Игры с рейтингами</Txt>
      <ErrorText error={error} />
      {loading && !data ? <Loading /> : null}
      {data && data.length === 0 ? <Empty icon="🎲" title="Игротека пуста" /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {data?.map((g) => (
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
    </View>
  );
}
