import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ImageField } from '../../components/ImageField';
import { Button, Chip, ErrorText, Input, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { getGame, saveGame } from '../../lib/api';
import { removeImage } from '../../lib/media';
import { errMsg } from '../../lib/notify';

export default function GameEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile } = useMe();
  const { facet, institution } = useFacet();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [minP, setMinP] = useState('2');
  const [maxP, setMaxP] = useState('6');
  const [minutes, setMinutes] = useState('');
  const [isPc, setIsPc] = useState(facet === 'into');
  const [genre, setGenre] = useState('');
  const [platform, setPlatform] = useState(facet === 'into' ? 'ПК' : '');
  const [cover, setCover] = useState<string | null>(null);
  const [initialCover, setInitialCover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getGame(id).then((g) => {
      setTitle(g.title);
      setDescription(g.description);
      setMinP(String(g.min_players));
      setMaxP(String(g.max_players));
      setMinutes(g.play_minutes ? String(g.play_minutes) : '');
      setIsPc(g.is_pc);
      setCover(g.cover_url);
      setInitialCover(g.cover_url);
      setGenre(g.genre ?? '');
      setPlatform(g.platform ?? '');
    });
  }, [id]);

  const save = async () => {
    if (!title.trim()) return setError('Укажите название');
    setBusy(true);
    try {
      await saveGame(
        {
          id,
          facet,
          institution_id: facet === 'stud' ? (institution?.id ?? null) : null,
          title: title.trim(),
          description: description.trim(),
          min_players: parseInt(minP, 10) || 1,
          max_players: parseInt(maxP, 10) || 2,
          play_minutes: minutes ? parseInt(minutes, 10) : null,
          is_pc: isPc,
          cover_url: cover,
          genre: genre.trim() || null,
          platform: platform.trim() || null,
        },
        profile.id,
      );
      if (initialCover && initialCover !== cover) removeImage(initialCover);
      router.back();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false}>
      <Stack.Screen options={{ title: id ? 'Изменить игру' : 'Новая игра' }} />
      <Input label="Название" value={title} onChangeText={setTitle} />
      <ImageField
        label="Обложка"
        kind="game"
        ownerId={profile.id}
        value={cover}
        onChange={setCover}
        placeholder={isPc ? '🎮' : '🎲'}
      />
      <Input label="Описание" value={description} onChangeText={setDescription} multiline />
      {facet === 'into' ? (
        <Row>
          <View style={{ flex: 1 }}>
            <Input label="Жанр" value={genre} onChangeText={setGenre} placeholder="Тактический шутер" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Платформа" value={platform} onChangeText={setPlatform} placeholder="ПК / PS5" />
          </View>
        </Row>
      ) : null}
      <Row>
        <Input label="Мин. игроков" value={minP} onChangeText={setMinP} keyboardType="number-pad" style={{ width: 110 }} />
        <Input label="Макс." value={maxP} onChangeText={setMaxP} keyboardType="number-pad" style={{ width: 90 }} />
        <Input label="Минут" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" style={{ width: 90 }} />
      </Row>
      <Txt v="label">Тип</Txt>
      <Row gap={8}>
        <Chip label="🎲 Настольная" active={!isPc} onPress={() => setIsPc(false)} />
        <Chip label="🎮 ПК / видеоигра" active={isPc} onPress={() => setIsPc(true)} />
      </Row>
      <ErrorText error={error} />
      <Button title="Сохранить" onPress={save} loading={busy} />
    </Screen>
  );
}
