import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFacet } from '../context/FacetProvider';
import { deleteReview, saveReview } from '../lib/api';
import { confirm, errMsg } from '../lib/notify';
import type { GameReview } from '../lib/types';
import { F } from '../theme/fonts';
import { DIFFICULTY_LABELS } from './Recommendations';
import { Button, Card, ErrorText, Input, Row, Txt } from './ui';

const SUGGESTED_TAGS = ['для новичков', 'кооп', 'соревновательная', 'сюжет', 'на вечер', 'с друзьями', 'бесплатная', 'для турнира'];

/** Оценка лидера: балл 1–10, сложность 1–5, короткий отзыв, теги */
export function ReviewForm({ gameId, authorId, mine, onSaved }: { gameId: string; authorId: string; mine?: GameReview; onSaved: () => void }) {
  const { palette: p } = useFacet();
  const [score, setScore] = useState(mine?.score ?? 8);
  const [difficulty, setDifficulty] = useState(mine?.difficulty ?? 3);
  const [review, setReview] = useState(mine?.review ?? '');
  const [tags, setTags] = useState<string[]>(mine?.tags ?? []);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (t: string) => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t].slice(0, 5));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveReview({ game_id: gameId, author_id: authorId, score, difficulty, review: review.trim(), tags });
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const cell = (active: boolean) => ({
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: active ? p.accent : p.surfaceAlt,
  });

  return (
    <Card style={{ borderColor: p.accent + '55' }}>
      <Txt v="label">{mine ? 'Ваша оценка' : 'Оценить игру'}</Txt>
      <Txt v="small">Балл</Txt>
      <Row gap={4}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable key={n} onPress={() => setScore(n)} style={cell(n <= score)}>
            <Text style={{ color: n <= score ? p.onAccent : p.textDim, fontFamily: F.bold, fontSize: 13 }}>{n}</Text>
          </Pressable>
        ))}
      </Row>
      <Txt v="small">Сложность: {DIFFICULTY_LABELS[difficulty]}</Txt>
      <Row gap={6}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setDifficulty(n)} style={[cell(n <= difficulty), n <= difficulty && { backgroundColor: p.accent2 }]}>
            <Text style={{ color: n <= difficulty ? '#fff' : p.textDim, fontFamily: F.bold, fontSize: 13 }}>{n}</Text>
          </Pressable>
        ))}
      </Row>
      <Input
        label={`Короткий отзыв · ${review.length}/400`}
        value={review}
        onChangeText={(t) => setReview(t.slice(0, 400))}
        multiline
        placeholder="Чем цепляет, кому зайдёт, на что обратить внимание"
      />
      <Txt v="small">Теги (до 5)</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {[...new Set([...SUGGESTED_TAGS, ...tags])].map((t) => (
          <Pressable
            key={t}
            onPress={() => toggle(t)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: tags.includes(t) ? p.accent2 : p.border,
              backgroundColor: tags.includes(t) ? p.accent2 + '22' : 'transparent',
            }}
          >
            <Text style={{ color: tags.includes(t) ? '#fff' : p.textDim, fontFamily: F.semibold, fontSize: 12 }}>#{t}</Text>
          </Pressable>
        ))}
      </View>
      <Row>
        <View style={{ flex: 1 }}>
          <Input value={custom} onChangeText={setCustom} placeholder="Свой тег" autoCapitalize="none" />
        </View>
        <Button
          small
          kind="secondary"
          title="＋"
          onPress={() => {
            const t = custom.trim().toLowerCase().replace(/^#/, '');
            if (t) toggle(t);
            setCustom('');
          }}
        />
      </Row>
      <ErrorText error={error} />
      <Row>
        <Button title={mine ? 'Обновить' : 'Опубликовать'} style={{ flex: 1 }} loading={busy} onPress={save} />
        {mine ? (
          <Button
            kind="ghost"
            title="Удалить"
            onPress={async () => {
              if (await confirm('Удалить отзыв?', '', 'Удалить')) {
                await deleteReview(gameId, authorId).catch((e) => setError(errMsg(e)));
                onSaved();
              }
            }}
          />
        ) : null}
      </Row>
    </Card>
  );
}
