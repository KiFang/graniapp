import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { Button, Card, Chip, ErrorText, Input, ListItem, Row, Screen, Txt } from '../../components/ui';
import { useFacet } from '../../context/FacetProvider';
import { eventRegistrations, getEvent, listGames, recordMatch, searchProfiles } from '../../lib/api';
import { errMsg, notify } from '../../lib/notify';
import type { Game, Profile } from '../../lib/types';

type Player = Pick<Profile, 'id' | 'display_name' | 'username' | 'avatar_url'> & { placement: number };

/** Внесение результата матча: места игроков -> пересчёт ELO */
export default function MatchScreen() {
  const params = useLocalSearchParams<{ gameId?: string; eventId?: string }>();
  const { facet, institution, palette: p } = useFacet();
  const [games, setGames] = useState<Game[]>([]);
  const [gameId, setGameId] = useState<string | null>(params.gameId || null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [suggest, setSuggest] = useState<Player[]>([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const [winPoints, setWinPoints] = useState('5');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchFacet, setMatchFacet] = useState(facet);
  const [matchInst, setMatchInst] = useState<string | null>(institution?.id ?? null);

  useEffect(() => {
    if (params.eventId) {
      // берём грань, вуз и участников мероприятия
      getEvent(params.eventId)
        .then((e) => {
          setMatchFacet(e.facet);
          setMatchInst(e.institution_id);
          if (!params.gameId && e.game_id) setGameId(e.game_id);
          return Promise.all([listGames(e.facet, e.institution_id), eventRegistrations(e.id)]);
        })
        .then(([g, regs]) => {
          setGames(g);
          setSuggest(regs.filter((r) => r.profile).map((r) => ({ ...r.profile!, placement: 1 })));
        })
        .catch((e) => setError(errMsg(e)));
    } else {
      listGames(facet, institution?.id ?? null).then(setGames).catch(() => {});
    }
  }, [params.eventId, params.gameId, facet, institution?.id]);

  const add = (u: Pick<Profile, 'id' | 'display_name' | 'username' | 'avatar_url'>) => {
    if (players.some((x) => x.id === u.id)) return;
    setPlayers([...players, { ...u, placement: players.length + 1 }]);
  };
  const setPlace = (id: string, placement: number) =>
    setPlayers(players.map((x) => (x.id === id ? { ...x, placement: Math.max(1, placement) } : x)));

  const submit = async () => {
    if (players.length < 2) return setError('Нужно минимум 2 игрока');
    setBusy(true);
    setError(null);
    try {
      await recordMatch(
        matchFacet,
        matchFacet === 'stud' ? matchInst : null,
        gameId,
        params.eventId ?? null,
        players.map((x) => ({ user_id: x.id, placement: x.placement })),
        parseInt(winPoints, 10) || 0,
      );
      notify('Результат сохранён', 'ELO пересчитан');
      router.back();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false}>
      <Txt v="label">Игра</Txt>
      <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
        <Chip label="Общий рейтинг" active={!gameId} onPress={() => setGameId(null)} />
        {games.map((g) => (
          <Chip key={g.id} label={g.title} active={gameId === g.id} onPress={() => setGameId(g.id)} />
        ))}
      </ScrollView>

      <Txt v="label">Игроки и места (1 — победитель, одинаковые места — ничья)</Txt>
      <Card>
        {players.length === 0 ? <Txt v="dim">Добавьте игроков ниже</Txt> : null}
        {[...players].sort((a, b) => a.placement - b.placement).map((x) => (
          <Row key={x.id}>
            <Avatar name={x.display_name} url={x.avatar_url} size={30} />
            <Txt style={{ flex: 1 }}>{x.display_name}</Txt>
            <Button small kind="secondary" title="−" onPress={() => setPlace(x.id, x.placement - 1)} />
            <Txt v="h3" color={x.placement === 1 ? p.accent : undefined} style={{ width: 28, textAlign: 'center' }}>
              {x.placement}
            </Txt>
            <Button small kind="secondary" title="＋" onPress={() => setPlace(x.id, x.placement + 1)} />
            <Button small kind="ghost" title="✕" onPress={() => setPlayers(players.filter((y) => y.id !== x.id))} />
          </Row>
        ))}
      </Card>

      {suggest.length ? (
        <>
          <Txt v="label">Участники мероприятия</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {suggest.map((u) => (
              <Chip key={u.id} label={u.display_name} active={players.some((x) => x.id === u.id)} onPress={() => add(u)} />
            ))}
          </View>
        </>
      ) : null}

      <Card>
        <Input
          value={q}
          onChangeText={(t) => {
            setQ(t);
            if (t.trim().length >= 2) searchProfiles(t).then(setFound).catch(() => {});
            else setFound([]);
          }}
          placeholder="Найти игрока"
          autoCapitalize="none"
        />
        {found.map((u) => (
          <ListItem key={u.id} title={u.display_name} subtitle={`@${u.username}`} onPress={() => add(u)} right={<Txt color={p.accent}>＋</Txt>} />
        ))}
      </Card>

      <Input label="Бонус победителю (очки)" value={winPoints} onChangeText={setWinPoints} keyboardType="number-pad" />
      <ErrorText error={error} />
      <Button title="Сохранить результат" onPress={submit} loading={busy} />
    </Screen>
  );
}
