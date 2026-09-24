import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Text } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { DifficultyBar, ScoreBadge } from '../../components/Recommendations';
import { ReviewForm } from '../../components/ReviewForm';
import { Button, Card, Empty, ErrorText, Loading, Row, Screen, Txt } from '../../components/ui';
import { useFacet } from '../../context/FacetProvider';
import { useAuth } from '../../context/AuthProvider';
import { deleteGame, getGame, getRecommendation, listRatings } from '../../lib/api';
import { timeAgo } from '../../lib/date';
import { F } from '../../theme/fonts';
import { confirm, errMsg, notify } from '../../lib/notify';
import { useAsync } from '../../lib/useAsync';

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette: p, can } = useFacet();
  const { profile, staff } = useAuth();
  const { data, error, loading, reload } = useAsync(async () => {
    const game = await getGame(id);
    const [ratings, rec] = await Promise.all([
      listRatings(game.facet, game.institution_id, game.id, 'elo'),
      game.facet === 'into' ? getRecommendation(id) : Promise.resolve(null),
    ]);
    return { game, ratings, rec };
  }, [id]);

  if (!data) return <Screen topInset={false}>{loading ? <Loading /> : <ErrorText error={error} />}</Screen>;
  const { game, ratings, rec } = data;
  const mine = rec?.reviews.find((r) => r.author_id === profile?.id);

  return (
    <Screen topInset={false} refreshing={loading} onRefresh={reload}>
      <Stack.Screen options={{ title: game.title }} />
      <Card>
        <Txt v="h1">{game.is_pc ? '🎮' : '🎲'} {game.title}</Txt>
        <Txt v="dim">
          {[game.genre, game.platform, `${game.min_players}–${game.max_players} игроков`, game.play_minutes ? `~${game.play_minutes} мин` : null]
            .filter(Boolean)
            .join(' · ')}
        </Txt>
        {game.description ? <Txt>{game.description}</Txt> : null}
      </Card>
      {rec ? (
        <>
          <Card>
            <Row gap={16}>
              <ScoreBadge score={rec.avgScore} size={72} />
              <View style={{ flex: 1, gap: 8 }}>
                <Txt v="label">Оценка лидеров · {rec.reviews.length}</Txt>
                <DifficultyBar value={rec.avgDifficulty} />
              </View>
            </Row>
          </Card>
          {rec.reviews.map((r) => (
            <Card key={r.author_id}>
              <Row>
                <Avatar name={r.author?.display_name ?? '?'} url={r.author?.avatar_url} size={34} />
                <View style={{ flex: 1 }}>
                  <Txt v="h3">{r.author?.display_name}</Txt>
                  <Txt v="small">{timeAgo(r.updated_at)}</Txt>
                </View>
                <Text style={{ color: p.accent, fontFamily: F.black, fontSize: 22 }}>{r.score}/10</Text>
              </Row>
              <DifficultyBar value={r.difficulty} />
              {r.review ? <Txt>{r.review}</Txt> : null}
              {r.tags.length ? <Txt v="small" color={p.accent2}>{r.tags.map((t) => `#${t}`).join('  ')}</Txt> : null}
            </Card>
          ))}
          {staff && profile ? (
            <ReviewForm key={mine?.updated_at ?? 'new'} gameId={game.id} authorId={profile.id} mine={mine} onSaved={reload} />
          ) : (
            <Txt v="small">Оценки и отзывы оставляют лидеры гильдии.</Txt>
          )}
        </>
      ) : null}
      <Row>
        {can('manage_matches') ? (
          <Button
            style={{ flex: 1 }}
            icon="⚔"
            title="Результат матча"
            onPress={() => router.push({ pathname: '/game/match', params: { gameId: game.id } })}
          />
        ) : null}
        {can('manage_games') ? (
          <>
            <Button small kind="secondary" title="Изменить" onPress={() => router.push({ pathname: '/game/edit', params: { id: game.id } })} />
            <Button
              small
              kind="danger"
              title="Удалить"
              onPress={async () => {
                if (!(await confirm('Удалить игру?', game.title, 'Удалить'))) return;
                try {
                  await deleteGame(game.id);
                  router.back();
                } catch (e) {
                  notify('Ошибка', errMsg(e));
                }
              }}
            />
          </>
        ) : null}
      </Row>
      {!rec || ratings.length ? <Txt v="label">Рейтинг ELO по игре</Txt> : null}
      {!rec && ratings.length === 0 ? <Empty icon="📈" title="Матчей ещё не было" /> : null}
      {ratings.map((r, i) => (
        <Card key={r.id} onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.user_id } })}>
          <Row>
            <Txt v="h3" color={i < 3 ? p.accent : p.textDim} style={{ width: 28 }}>
              {i + 1}
            </Txt>
            <Avatar name={r.profile?.display_name ?? '?'} url={r.profile?.avatar_url} size={32} />
            <View style={{ flex: 1 }}>
              <Txt v="h3">{r.profile?.display_name}</Txt>
              <Txt v="small">
                {r.wins}П · {r.losses}Пр · {r.matches} матчей
              </Txt>
            </View>
            <Txt v="h2" color={p.accent}>
              {r.elo}
            </Txt>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
