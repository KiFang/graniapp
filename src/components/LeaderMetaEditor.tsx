import { useState } from 'react';
import { View } from 'react-native';
import { useFacet } from '../context/FacetProvider';
import { leaderPassesAdmin, reissueLeaderCode, setLeaderMeta, type LeaderPassInfo } from '../lib/api';
import { confirm, errMsg, notify } from '../lib/notify';
import { useAsync } from '../lib/useAsync';
import { FACET_META, ROLE_LABELS } from '../theme/facets';
import { Button, Card, Divider, Input, Row, Txt } from './ui';

/**
 * Основатель настраивает Leader ID человека — для каждого удостоверения отдельно:
 * должность, срок (дата ДД.ММ.ГГГГ — после неё сканер покажет «недействителен») и описание (что положено лидеру).
 */
export function LeaderMetaEditor({ userId }: { userId: string }) {
  const { isFounder } = useFacet();
  const { data, reload } = useAsync(() => (isFounder ? leaderPassesAdmin(userId) : Promise.resolve([])), [userId, isFounder]);
  if (!isFounder || !data?.length) return null;
  return (
    <Card>
      <Txt v="label">Leader ID · настройка</Txt>
      <Txt v="small">Видно владельцу на удостоверении и тем, кто его сканирует.</Txt>
      {data.map((pass, i) => (
        <View key={pass.pass_key}>
          {i > 0 ? <Divider /> : null}
          <PassForm userId={userId} pass={pass} onSaved={reload} />
        </View>
      ))}
    </Card>
  );
}

function PassForm({ userId, pass, onSaved }: { userId: string; pass: LeaderPassInfo; onSaved: () => void }) {
  const { palette: p } = useFacet();
  const [position, setPosition] = useState(pass.position_title ?? '');
  const [valid, setValid] = useState(pass.valid_until ?? '');
  const [info, setInfo] = useState(pass.info ?? '');
  const [busy, setBusy] = useState(false);
  const where = pass.facet === 'stud' ? (pass.inst_name ?? 'Студ') : FACET_META[pass.facet].name;
  const expired = pass.expires_on ? Date.parse(pass.expires_on) < Date.now() - 864e5 : false;

  const save = async () => {
    setBusy(true);
    try {
      await setLeaderMeta(userId, pass.pass_key, position, valid, info);
      onSaved();
      notify('Сохранено', `Leader ID · ${where}`);
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8, paddingVertical: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">
          {where} · {ROLE_LABELS[pass.role as keyof typeof ROLE_LABELS] ?? pass.role}
        </Txt>
        {expired ? (
          <Txt v="small" color={p.danger}>
            срок истёк
          </Txt>
        ) : null}
      </Row>
      <Input label="Должность (какой лидер)" value={position} onChangeText={setPosition} placeholder="Организатор турниров" />
      <Input label="Действует до" value={valid} onChangeText={setValid} placeholder="31.08.2027 или «Выпуска»" />
      <Input label="Описание: чем занимается, что положено" value={info} onChangeText={setInfo} multiline placeholder="Бесплатный вход на платные встречи Изнанки" />
      <Row>
        <Button small title="Сохранить" loading={busy} onPress={save} style={{ flex: 1 }} />
        <Button
          small
          kind="ghost"
          title="Новый код"
          style={{ flex: 1 }}
          onPress={async () => {
            if (!(await confirm('Перевыпустить код?', 'Старый QR этого удостоверения перестанет действовать.', 'Перевыпустить'))) return;
            try {
              await reissueLeaderCode(pass.pass_key, userId);
              notify('Готово', 'У владельца новый код');
            } catch (e) {
              notify('Не получилось', errMsg(e));
            }
          }}
        />
      </Row>
      <Txt v="small">Дата в формате ДД.ММ.ГГГГ проверяется при сканировании: после неё удостоверение недействительно.</Txt>
    </View>
  );
}
