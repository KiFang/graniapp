import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useFacet } from '../context/FacetProvider';
import { listRecommendations } from '../lib/api';
import type { Recommendation } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { F } from '../theme/fonts';
import { Avatar } from './Avatar';
import { Button, Card, Chip, Empty, ErrorText, Loading, Row, Txt } from './ui';

export const DIFFICULTY_LABELS = ['', 'Легко зайти', 'Несложно', 'Средне', 'Сложно', 'Хардкор'];

/** Балл лидеров (1–10) в круге цвета грани */
export function ScoreBadge({ score, size = 58 }: { score: number | null; size?: number }) {
  const { palette: p } = useFacet();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2.5,
        borderColor: score == null ? p.border : p.accent,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: score == null ? 'transparent' : p.accent + '18',
      }}
    >
      <Text style={{ color: score == null ? p.textDim : '#fff', fontFamily: F.black, fontSize: size * 0.36 }}>
        {score == null ? '—' : score.toFixed(score % 1 ? 1 : 0)}
      </Text>
    </View>
  );
}

/** Сложность: 5 делений */
export function DifficultyBar({ value }: { value: number | null }) {
  const { palette: p } = useFacet();
  const v = value == null ? 0 : Math.round(value);
  return (
    <Row gap={6}>
      <Row gap={3}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ width: 14, height: 6, borderRadius: 3, backgroundColor: i <= v ? p.accent2 : p.border }} />
        ))}
      </Row>
      <Txt v="small">{v ? DIFFICULTY_LABELS[v] : 'Сложность не оценена'}</Txt>
    </Row>
  );
}

type Sort = 'top' | 'fresh' | 'easy' | 'hard';

/** Инто → Рекомендации: игры, которые оценили лидеры */
export function Recommendations() {
  const { can, palette: p } = useFacet();
  const [sort, setSort] = useState<Sort>('top');
  const [tag, setTag] = useState<string | null>(null);
  const { data, error, loading } = useAsync(listRecommendations, []);

  const tags = useMemo(() => {
    const all = new Map<string, number>();
    data?.forEach((g) => g.reviews.forEach((r) => r.tags.forEach((t) => all.set(t, (all.get(t) ?? 0) + 1))));
    return [...all.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  }, [data]);

  const list = useMemo(() => {
    const rows = (data ?? []).filter((g) => !tag || g.reviews.some((r) => r.tags.includes(tag)));
    const last = (g: Recommendation) => Math.max(0, ...g.reviews.map((r) => Date.parse(r.updated_at)));
    const cmp: Record<Sort, (a: Recommendation, b: Recommendation) => number> = {
      top: (a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1),
      fresh: (a, b) => last(b) - last(a),
      easy: (a, b) => (a.avgDifficulty ?? 9) - (b.avgDifficulty ?? 9),
      hard: (a, b) => (b.avgDifficulty ?? -1) - (a.avgDifficulty ?? -1),
    };
    return [...rows].sort(cmp[sort]);
  }, [data, sort, tag]);

  return (
    <View style={{ gap: 12 }}>
      <Txt v="dim">Игры, которые лидеры советуют попробовать: оценка, короткий отзыв и сложность.</Txt>
      {can('manage_games') ? (
        <Button small kind="secondary" icon="＋" title="Добавить игру" onPress={() => router.push('/game/edit')} />
      ) : null}
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        <Chip label="Лучшие" active={sort === 'top'} onPress={() => setSort('top')} />
        <Chip label="Свежие отзывы" active={sort === 'fresh'} onPress={() => setSort('fresh')} />
        <Chip label="Для новичков" active={sort === 'easy'} onPress={() => setSort('easy')} />
        <Chip label="Хардкор" active={sort === 'hard'} onPress={() => setSort('hard')} />
      </Row>
      {tags.length ? (
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {tags.map((t) => (
            <Chip key={t} label={`#${t}`} color={p.accent2} active={tag === t} onPress={() => setTag(tag === t ? null : t)} />
          ))}
        </Row>
      ) : null}
      <ErrorText error={error} />
      {loading && !data ? <Loading /> : null}
      {data && list.length === 0 ? <Empty icon="⭐" title="Рекомендаций пока нет" hint="Лидеры скоро оценят первые игры" /> : null}
      {list.map((g) => {
        const top = [...g.reviews].sort((a, b) => b.review.length - a.review.length)[0];
        return (
          <Card key={g.id} onPress={() => router.push({ pathname: '/game/[id]', params: { id: g.id } })}>
            <Row gap={14} style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Txt v="h3">{g.title}</Txt>
                <Txt v="small" color={p.accent}>
                  {[g.genre, g.platform ?? (g.is_pc ? 'ПК' : null), `${g.min_players}–${g.max_players} игр.`].filter(Boolean).join(' · ')}
                </Txt>
                <DifficultyBar value={g.avgDifficulty} />
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <ScoreBadge score={g.avgScore} />
                <Txt v="small">
                  {g.reviews.length} {g.reviews.length === 1 ? 'отзыв' : g.reviews.length >= 2 && g.reviews.length <= 4 ? 'отзыва' : 'отзывов'}
                </Txt>
              </View>
            </Row>
            {top?.review ? (
              <Row gap={10} style={{ alignItems: 'flex-start', marginTop: 4 }}>
                <Avatar name={top.author?.display_name ?? '?'} url={top.author?.avatar_url} size={26} />
                <Text style={{ flex: 1, color: '#C9C9CF', fontFamily: F.regular, fontSize: 13, lineHeight: 18 }} numberOfLines={3}>
                  «{top.review}» <Text style={{ color: p.textDim }}>— {top.author?.display_name}</Text>
                </Text>
              </Row>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}
