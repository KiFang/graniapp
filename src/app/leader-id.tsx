import { useState } from 'react';
import { View } from 'react-native';
import { GraniCard } from '../components/GraniCard';
import { Button, Card, Empty, ErrorText, Loading, Row, Screen, Txt } from '../components/ui';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { myLeaderPasses, reissueLeaderCode } from '../lib/api';
import { leaderPasses } from '../lib/leader';
import { confirm, errMsg, notify } from '../lib/notify';
import { leaderQr } from '../lib/qr';
import { useAsync } from '../lib/useAsync';
import { PERMISSION_LABELS } from '../theme/facets';

/**
 * Все Leader ID пользователя — у каждой грани/вуза своё свечение и свой секретный код.
 * Код никак не связан с Player ID: по Leader ID дают плюшки, его проверяют сканером Leader ID.
 */
export default function LeaderIdScreen() {
  const { profile, staff, memberships } = useMe();
  const { facet, institution, palette: p } = useFacet();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: server, error, loading, reload } = useAsync(() => myLeaderPasses(), [profile.id]);

  const current = (x: { facet: string; institutionId: string | null }) =>
    x.facet === facet && (facet !== 'stud' || x.institutionId === institution?.id);
  // удостоверение текущей грани — первым
  const passes = leaderPasses(staff, memberships).sort((a, b) => Number(current(b)) - Number(current(a)));

  const reissue = async (key: string) => {
    if (!(await confirm('Перевыпустить код?', 'Старый QR перестанет действовать — например, если его сфотографировали и переслали.', 'Перевыпустить'))) return;
    setBusy(key);
    try {
      await reissueLeaderCode(key);
      await reload();
      notify('Готово', 'Новый код уже на карте');
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen topInset={false} refreshing={loading} onRefresh={reload}>
      {passes.length === 0 ? <Empty icon="🪪" title="Вы пока не лидер" hint="Роль выдаёт Основатель или президент вуза" /> : null}
      <ErrorText error={error} />
      {passes.map((pass) => {
        const s = server?.find((x) => x.pass_key === pass.key);
        return (
          <View key={pass.key} style={{ gap: 10, marginBottom: 18 }}>
            {s ? (
              <GraniCard
                flat
                kind="leader"
                profile={profile}
                scope={pass.scope}
                position={s.position_title || pass.position}
                validUntil={s.valid_until || pass.validUntil}
                qrValue={leaderQr(s.code)}
                codeText={s.code.replace(/(.{4})(?=.)/g, '$1 ')}
              />
            ) : loading ? (
              <Loading />
            ) : null}
            {s?.expired ? (
              <Card style={{ borderColor: p.danger }}>
                <Txt color={p.danger}>Срок удостоверения истёк — сканер покажет его недействительным. Продлить может Основатель.</Txt>
              </Card>
            ) : null}
            {s?.info ? (
              <Card>
                <Txt v="label">О лидерстве</Txt>
                <Txt>{s.info}</Txt>
              </Card>
            ) : null}
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {pass.permissions.map((perm) => (
                <Txt
                  key={perm}
                  v="small"
                  color={pass.scope.accent}
                  style={{ borderWidth: 1, borderColor: pass.scope.accent + '55', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}
                >
                  {PERMISSION_LABELS[perm] ?? perm}
                </Txt>
              ))}
            </Row>
            {s ? (
              <Button small kind="ghost" title="Перевыпустить код" loading={busy === pass.key} onPress={() => reissue(pass.key)} style={{ alignSelf: 'flex-start' }} />
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}
