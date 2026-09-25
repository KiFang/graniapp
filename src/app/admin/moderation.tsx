import { router } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { Button, Card, Empty, ErrorText, Loading, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { moderateApproveAvatar, moderateRemoveAvatar, moderateRestoreAvatar, moderationQueue } from '../../lib/api';
import { timeAgo } from '../../lib/date';
import { isModerator } from '../../lib/leader';
import { errMsg, notify } from '../../lib/notify';
import { useAsync } from '../../lib/useAsync';

const SOURCE_LABEL = { reports: 'по жалобам', moderator: 'модератором', auto: 'автопроверкой' };

/** Модерация аватарок: жалобы игроков и история снятых картинок (с возможностью вернуть) */
export default function ModerationScreen() {
  const { staff } = useMe();
  const { palette: p } = useFacet();
  const [busy, setBusy] = useState<string | null>(null);
  const allowed = isModerator(staff);
  const { data, error, loading, reload } = useAsync(() => (allowed ? moderationQueue() : Promise.resolve(null)), [allowed]);

  if (!allowed) return <Screen topInset={false}><Empty icon="🛡" title="Нет доступа" hint="Модерация — для основателя и лидеров с правом «Баны»" /></Screen>;

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await reload();
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen topInset={false} refreshing={loading} onRefresh={reload}>
      <Txt v="dim">
        Три жалобы от разных игроков скрывают аватар сами. Здесь — картинки, на которые жалуются, и всё, что уже скрыто: ошибочно
        скрытое можно вернуть, тогда картинка больше не проверяется.
      </Txt>
      <ErrorText error={error} />
      {loading && !data ? <Loading /> : null}

      <Txt v="label">Жалобы · {data?.reports.length ?? 0}</Txt>
      {data && !data.reports.length ? <Txt v="dim">Жалоб нет 🎉</Txt> : null}
      {data?.reports.map((r) => (
        <Card key={r.user_id + r.avatar_url}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Image source={{ uri: r.avatar_url }} style={{ width: 84, height: 84, borderRadius: 14, backgroundColor: p.surfaceAlt }} blurRadius={12} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="h3" numberOfLines={1}>
                {r.display_name}
              </Txt>
              <Txt v="small">@{r.username}</Txt>
              <Txt v="small" color={p.danger}>
                ⚑ {r.count} из 3 · {r.reasons.join(', ')}
              </Txt>
              <Txt v="small">{timeAgo(r.last)}</Txt>
            </View>
          </Row>
          <Txt v="small">Картинка размыта. Откройте профиль, чтобы посмотреть без размытия.</Txt>
          <Row>
            <Button small kind="secondary" title="Профиль" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.user_id } })} />
            <Button
              small
              kind="secondary"
              title="Норм ✓"
              style={{ flex: 1 }}
              loading={busy === 'ok' + r.avatar_url}
              onPress={() => act('ok' + r.avatar_url, () => moderateApproveAvatar(r.avatar_url))}
            />
            <Button
              small
              kind="danger"
              title="Убрать"
              style={{ flex: 1 }}
              loading={busy === 'rm' + r.avatar_url}
              onPress={() => act('rm' + r.avatar_url, () => moderateRemoveAvatar(r.user_id, r.avatar_url, r.reasons[0] ?? '18+'))}
            />
          </Row>
        </Card>
      ))}

      <Txt v="label">Скрытые аватарки</Txt>
      {data && !data.removed.length ? <Txt v="dim">Пока ничего не скрывали</Txt> : null}
      {data?.removed.map((r) => (
        <Card key={r.id} style={r.restored_at ? { opacity: 0.6 } : undefined}>
          <Row>
            <Image source={{ uri: r.avatar_url }} style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: p.surfaceAlt }} blurRadius={14} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="h3" style={{ fontSize: 14 }} numberOfLines={1}>
                {r.display_name} · @{r.username}
              </Txt>
              <Txt v="small">
                Скрыт {SOURCE_LABEL[r.source]}
                {r.reason ? ` · ${r.reason}` : ''}
                {r.score != null ? ` · ${Math.round(r.score * 100)}%` : ''} · {timeAgo(r.created_at)}
              </Txt>
            </View>
            {r.restored_at ? (
              <Txt v="small" color={p.success}>
                возвращён
              </Txt>
            ) : (
              <Button small kind="secondary" title="Вернуть" loading={busy === r.id} onPress={() => act(r.id, () => moderateRestoreAvatar(r.id))} />
            )}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
