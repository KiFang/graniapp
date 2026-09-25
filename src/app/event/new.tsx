import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Button, Chip, ErrorText, Input, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { createEvent, getEvent, listGames, updateEvent, type EventInput } from '../../lib/api';
import { canMarkOfficial } from '../../lib/leader';
import { addDays, parseInputValue, toInputValue } from '../../lib/date';
import { errMsg } from '../../lib/notify';
import type { CheckinMode, Game } from '../../lib/types';
import { FACET_META } from '../../theme/facets';

const MODES: { mode: CheckinMode; label: string }[] = [
  { mode: 'qr', label: 'Player ID (QR)' },
  { mode: 'manual', label: 'Вручную' },
  { mode: 'both', label: 'QR и вручную' },
];

/** Создание и редактирование мероприятия в текущей грани */
export default function EventForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile, staff } = useMe();
  const { facet, institution, membership } = useFacet();
  const canOfficial = canMarkOfficial(facet, staff, membership);
  const defaultStart = addDays(new Date(), 1);
  defaultStart.setHours(19, 0, 0, 0);

  const [games, setGames] = useState<Game[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [gameId, setGameId] = useState<string | null>(null);
  const [starts, setStarts] = useState(toInputValue(defaultStart));
  const [hours, setHours] = useState('3');
  const [capacity, setCapacity] = useState('');
  const [points, setPoints] = useState('10');
  const [tournament, setTournament] = useState(facet === 'into');
  const [elo, setElo] = useState(facet === 'into');
  const [bracket, setBracket] = useState(false);
  const [official, setOfficial] = useState(false);
  // Студ и Изнанка — по Player ID; Инто — вручную, если не указано иное
  const [mode, setMode] = useState<CheckinMode>(facet === 'into' ? 'manual' : 'qr');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listGames(facet, institution?.id ?? null).then(setGames).catch(() => {});
    if (!id) return;
    getEvent(id)
      .then((e) => {
        setTitle(e.title);
        setDescription(e.description);
        setLocation(e.location);
        setGameId(e.game_id);
        setStarts(toInputValue(new Date(e.starts_at)));
        if (e.ends_at) setHours(String(Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 36e5 * 10) / 10));
        setCapacity(e.capacity ? String(e.capacity) : '');
        setPoints(String(e.points_reward));
        setTournament(e.is_tournament);
        setElo(e.elo_enabled);
        setBracket(e.bracket_enabled);
        setOfficial(Boolean(e.is_official));
        setMode(e.checkin_mode);
      })
      .catch((err) => setError(errMsg(err)));
  }, [id, facet, institution?.id]);

  const save = async () => {
    setError(null);
    const start = parseInputValue(starts);
    if (!title.trim()) return setError('Укажите название');
    if (!start) return setError('Дата в формате ГГГГ-ММ-ДД ЧЧ:ММ');
    const h = parseFloat(hours.replace(',', '.'));
    const input: EventInput = {
      facet,
      institution_id: facet === 'stud' ? (institution?.id ?? null) : null,
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      game_id: gameId,
      starts_at: start.toISOString(),
      ends_at: h > 0 ? new Date(start.getTime() + h * 36e5).toISOString() : null,
      capacity: capacity ? parseInt(capacity, 10) : null,
      points_reward: parseInt(points, 10) || 0,
      is_tournament: tournament,
      elo_enabled: elo,
      bracket_enabled: tournament && facet === 'into' && bracket,
      ...(canOfficial ? { is_official: official } : {}),
      checkin_mode: mode,
      host_id: profile.id,
    };
    setBusy(true);
    try {
      if (id) {
        const { host_id: _h, facet: _f, institution_id: _i, ...patch } = input;
        await updateEvent(id, patch);
        router.back();
      } else {
        const newId = await createEvent(profile.id, input);
        router.replace({ pathname: '/event/[id]', params: { id: newId } });
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false}>
      <Stack.Screen options={{ title: id ? 'Изменить мероприятие' : 'Новое мероприятие' }} />
      <Txt v="label">
        {FACET_META[facet].name}
        {facet === 'stud' && institution ? ` · ${institution.short_name}` : ''}
      </Txt>
      <Input label="Название" value={title} onChangeText={setTitle} placeholder={facet === 'into' ? 'Мини-турнир CS2 2×2' : 'Вечер настолок'} />
      <Input label="Описание" value={description} onChangeText={setDescription} multiline />
      <Input label="Место" value={location} onChangeText={setLocation} placeholder="Ауд. 305 / Discord" />
      <Row>
        <Input label="Начало" value={starts} onChangeText={setStarts} style={{ minWidth: 190 }} placeholder="2026-10-01 19:00" />
        <Input label="Часов" value={hours} onChangeText={setHours} keyboardType="decimal-pad" style={{ width: 80 }} />
      </Row>
      <Row>
        <Input label="Мест (пусто — без лимита)" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" style={{ width: 170 }} />
        <Input label="Очки за участие" value={points} onChangeText={setPoints} keyboardType="number-pad" style={{ width: 130 }} />
      </Row>
      {games.length ? (
        <>
          <Txt v="label">Игра</Txt>
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            <Chip label="Без игры" active={!gameId} onPress={() => setGameId(null)} />
            {games.map((g) => (
              <Chip key={g.id} label={g.title} active={gameId === g.id} onPress={() => setGameId(g.id)} />
            ))}
          </ScrollView>
        </>
      ) : null}
      <Txt v="label">Формат</Txt>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        <Chip label="🏁 Турнир" active={tournament} onPress={() => setTournament(!tournament)} />
        <Chip label="📈 Влияет на ELO" active={elo} onPress={() => setElo(!elo)} />
        {tournament && facet === 'into' ? <Chip label="🗂 Турнирная сетка" active={bracket} onPress={() => setBracket(!bracket)} /> : null}
      </Row>
      {tournament && facet === 'into' && bracket ? (
        <Txt v="small">
          На странице турнира появится сетка на выбывание: посев по ELO, победителей отмечает лидер
          {elo ? ', результаты сразу идут в ELO' : ''}. Участникам придёт, кто их соперник.
        </Txt>
      ) : null}
      {canOfficial ? (
        <>
          <Txt v="label">Важное событие</Txt>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <Chip label="📣 Создано админом" active={official} onPress={() => setOfficial(!official)} />
          </Row>
          <Txt v="small">
            {official
              ? `Уведомление с кнопкой «Записаться» придёт ${facet === 'stud' ? 'всем участникам вуза' : 'всем игрокам гильдии'}. Участники метку не видят.`
              : 'Для по-настоящему важных встреч: о них узнает каждый.'}
          </Txt>
        </>
      ) : null}
      <Txt v="label">Отметка участников</Txt>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {MODES.map((m) => (
          <Chip key={m.mode} label={m.label} active={mode === m.mode} onPress={() => setMode(m.mode)} />
        ))}
      </Row>
      {facet === 'into' ? <Txt v="small">В Инто по умолчанию отметка только вручную — QR можно включить здесь.</Txt> : null}
      <ErrorText error={error} />
      <Button title={id ? 'Сохранить' : 'Создать'} onPress={save} loading={busy} />
    </Screen>
  );
}
