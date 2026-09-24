import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Card, ErrorText, Input, ListItem, Screen, Txt } from '../../components/ui';
import { RoleBadge } from '../../components/Avatar';
import { useAuth } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { joinInstitution } from '../../lib/api';
import { errMsg } from '../../lib/notify';
import { ROLE_LABELS } from '../../theme/facets';

/** Окно ввода кода при выборе грани Студ. Можно пропустить — тогда доступен только рейтинг вузов. */
export default function StudJoin() {
  const { memberships, refresh } = useAuth();
  const { setInstitutionId, institution, setStudSkipped } = useFacet();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const inst = await joinInstitution(code);
      await refresh();
      setInstitutionId(inst);
      router.back();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false}>
      <Txt v="h2">Код учебного заведения</Txt>
      <Txt v="dim">
        Код вуза даёт постоянный доступ. Гостевой код от лидера открывает страницу на время. Отметка на мероприятиях всё равно
        идёт через ваш общий Player ID.
      </Txt>
      <Input value={code} onChangeText={setCode} placeholder="Например, 7F3A9C" autoCapitalize="characters" autoFocus />
      <ErrorText error={error} />
      <Button title="Войти" onPress={join} loading={busy} disabled={code.trim().length < 4} />
      <Button
        kind="ghost"
        title="Пропустить"
        onPress={() => {
          setStudSkipped(true);
          router.back();
        }}
      />

      {memberships.length ? (
        <Card>
          <Txt v="label">Мои учебные заведения</Txt>
          {memberships.map((m) => (
            <ListItem
              key={m.institution_id}
              title={m.institution?.name ?? ''}
              subtitle={
                m.role === 'guest' && m.guest_until
                  ? `Гость до ${new Date(m.guest_until).toLocaleString('ru-RU')}`
                  : m.institution?.city ?? undefined
              }
              right={
                <RoleBadge
                  label={institution?.id === m.institution_id ? 'Открыто' : ROLE_LABELS[m.role]}
                  color={m.institution?.color_primary}
                />
              }
              onPress={() => {
                setInstitutionId(m.institution_id);
                router.back();
              }}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
