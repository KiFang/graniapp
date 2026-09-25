import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { FacetHeader } from '../../components/FacetHeader';
import { InstitutionLeaderboard, StudGate } from '../../components/StudGate';
import { Button, Card, Chip, Empty, ErrorText, Input, Loading, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { endSeason, listGames, listRatings, listSeasons, seasonLeaderboard, startSeason, streakLeaderboard } from '../../lib/api';
import { Flame, streakTier } from '../../components/Flame';
import { fmtDate } from '../../lib/date';
import { confirm, errMsg, notify } from '../../lib/notify';
import type { Season } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

/** Рейтинг: очки за сезон или за всё время, ELO по грани/вузу/игре; в Студ — ещё и рейтинг вузов */
export default function RatingScreen() {
  const { profile } = useMe();
  const { facet, institution, palette: p, isFounder } = useFacet();
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

  // сезон: по умолчанию текущий (если идёт); null — «всё время»
  const seasons = useAsync(listSeasons, []);
  const current = seasons.data?.find((x) => !x.ends_at) ?? null;
  const [seasonPick, setSeasonPick] = useState<string | 'all' | 'streak' | null>(null);
  const streakMode = seasonPick === 'streak';
  const seasonId = seasonPick === 'all' || streakMode ? null : (seasonPick ?? current?.id ?? null);
  const streaks = useAsync(() => (streakMode ? streakLeaderboard() : Promise.resolve([])), [streakMode]);
  const season = seasons.data?.find((x) => x.id === seasonId) ?? null;
  const seasonRows = useAsync(
    () => (locked || !seasonId ? Promise.resolve([]) : seasonLeaderboard(seasonId, facet, instId)),
    [seasonId, facet, instId, locked],
  );
  const seasonMode = Boolean(season);

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
            {(seasons.data ?? []).slice(0, 4).map((x) => (
              <Chip key={x.id} label={`🏁 ${x.name}${x.ends_at ? '' : ' · идёт'}`} active={seasonId === x.id} onPress={() => setSeasonPick(x.id)} />
            ))}
            <Chip label="Всё время" active={!seasonMode && !streakMode} onPress={() => setSeasonPick('all')} />
            <Chip label="🔥 Серия" active={streakMode} onPress={() => setSeasonPick('streak')} />
          </ScrollView>
          {streakMode ? <StreakList rows={streaks} meId={profile.id} /> : seasonMode ? <SeasonList season={season!} rows={seasonRows} meId={profile.id} /> : (
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
        </>
      )}
      {isFounder ? <SeasonAdmin current={current} onChanged={() => { setSeasonPick(null); seasons.reload(); }} /> : null}
    </Screen>
  );
}

function StreakList({ rows, meId }: { rows: ReturnType<typeof useAsync<Awaited<ReturnType<typeof streakLeaderboard>>>>; meId: string }) {
  const { palette: p } = useFacet();
  return (
    <>
      <Txt v="small">Самые длинные живые серии: отмечаются в профиле каждый день. Серия у всех общая, не по граням.</Txt>
      <ErrorText error={rows.error} />
      {rows.loading && !rows.data ? <Loading /> : null}
      {rows.data?.length === 0 ? <Empty icon="🔥" title="Ни у кого не горит огонёк" hint="Нажмите «Отметиться» в профиле — и вы первый" /> : null}
      {rows.data?.map((r, i) => {
        const t = streakTier(r.streak);
        return (
          <Card
            key={r.user_id}
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.user_id } })}
            style={r.user_id === meId ? { borderColor: p.accent } : undefined}
          >
            <Row>
              <Txt v="h3" color={i < 3 ? t.color : p.textDim} style={{ width: 30 }}>
                {i + 1}
              </Txt>
              <Avatar name={r.display_name} url={r.avatar_url} size={36} />
              <View style={{ flex: 1 }}>
                <Txt v="h3" numberOfLines={1}>
                  {r.display_name || 'Игрок'}
                </Txt>
                <Txt v="small">
                  {r.checked_today ? 'сегодня ✓' : 'ещё не отметился сегодня'}
                  {r.best > r.streak ? ` · рекорд ${r.best}` : ''}
                </Txt>
              </View>
              <Row gap={4}>
                <Flame streak={r.streak} size={24} />
                <Txt v="h2" color={t.color}>
                  {r.streak}
                </Txt>
              </Row>
            </Row>
          </Card>
        );
      })}
    </>
  );
}

function SeasonList({
  season,
  rows,
  meId,
}: {
  season: Season;
  rows: ReturnType<typeof useAsync<Awaited<ReturnType<typeof seasonLeaderboard>>>>;
  meId: string;
}) {
  const { palette: p } = useFacet();
  return (
    <>
      <Txt v="small">
        Очки за сезон «{season.name}»: с {fmtDate(new Date(season.starts_at))}
        {season.ends_at ? ` по ${fmtDate(new Date(season.ends_at))}` : ' · идёт сейчас'}. Покупки в магазине не вычитаются.
      </Txt>
      <ErrorText error={rows.error} />
      {rows.loading && !rows.data ? <Loading /> : null}
      {rows.data?.length === 0 ? <Empty icon="🏁" title="В этом сезоне пока нет очков" hint="Отмечайтесь на встречах и в профиле каждый день" /> : null}
      {rows.data?.map((r, i) => (
        <Card
          key={r.user_id}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.user_id } })}
          style={r.user_id === meId ? { borderColor: p.accent } : undefined}
        >
          <Row>
            <Txt v="h3" color={i < 3 ? p.accent : p.textDim} style={{ width: 30 }}>
              {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
            </Txt>
            <Avatar name={r.display_name} url={r.avatar_url} size={36} />
            <View style={{ flex: 1 }}>
              <Txt v="h3" numberOfLines={1}>
                {r.display_name || 'Игрок'}
              </Txt>
              <Txt v="small">@{r.username}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt v="h2" color={p.accent}>
                {r.points}
              </Txt>
              <Txt v="small">очков</Txt>
            </View>
          </Row>
        </Card>
      ))}
    </>
  );
}

/** Основатель: начать новый сезон (текущий закроется) или завершить текущий */
function SeasonAdmin({ current, onChanged }: { current: Season | null; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      setName('');
      onChanged();
      notify(done);
    } catch (e) {
      notify('Ошибка', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Txt v="label">Сезоны · только основатель</Txt>
      <Txt v="small">
        {current
          ? `Идёт сезон «${current.name}» с ${fmtDate(new Date(current.starts_at))}. Новый сезон закроет текущий — его таблица сохранится.`
          : 'Сейчас сезона нет — в рейтинге только «Всё время».'}
      </Txt>
      <Input value={name} onChangeText={setName} placeholder="Название, например «Осень 2026»" maxLength={40} />
      <Button
        title="Начать новый сезон"
        icon="🏁"
        disabled={!name.trim()}
        loading={busy}
        onPress={async () => {
          if (current && !(await confirm('Начать новый сезон?', `Сезон «${current.name}» будет завершён.`, 'Начать'))) return;
          await run(() => startSeason(name.trim()), 'Сезон начался');
        }}
      />
      {current ? (
        <Button
          small
          kind="ghost"
          title="Завершить текущий сезон"
          disabled={busy}
          onPress={async () => {
            if (await confirm('Завершить сезон?', `«${current.name}» закроется, таблица сохранится.`, 'Завершить')) {
              await run(endSeason, 'Сезон завершён');
            }
          }}
        />
      ) : null}
    </Card>
  );
}
