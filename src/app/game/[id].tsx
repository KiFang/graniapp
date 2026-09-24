import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { Button, Card, Empty, ErrorText, Loading, Row, Screen, Txt } from '../../components/ui';
import { useFacet } from '../../context/FacetProvider';
import { deleteGame, getGame, listRatings } from '../../lib/api';
import { confirm, errMsg, notify } from '../../lib/notify';
import { useAsync } from '../../lib/useAsync';

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette: p, can } = useFacet();
  const { data, error, loading, reload } = useAsync(async () => {
    const game = await getGame(id);
    const ratings = await listRatings(game.facet, game.institution_id, game.id, 'elo');
    return { game, ratings };
  }, [id]);

  if (!data) return <Screen topInset={false}>{loading ? <Loading /> : <ErrorText error={error} />}</Screen>;
  const { game, ratings } = data;

  return (
    <Screen topInset={false} refreshing={loading} onRefresh={reload}>
      <Stack.Screen options={{ title: game.title }} />
      <Card>
        <Txt v="h1">{game.is_pc ? '🎮' : '🎲'} {game.title}</Txt>
        <Txt v="dim">
          {game.min_players}–{game.max_players} игроков{game.play_minutes ? ` · ~${game.play_minutes} мин` : ''}
        </Txt>
        {game.description ? <Txt>{game.description}</Txt> : null}
      </Card>
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
      <Txt v="label">Рейтинг ELO по игре</Txt>
      {ratings.length === 0 ? <Empty icon="📈" title="Матчей ещё не было" /> : null}
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
