import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Divider, ErrorText, Input, ListItem, Row, Screen, Txt } from '../../components/ui';
import { useAuth } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { allInstitutions, createInstitution, searchProfiles } from '../../lib/api';
import { errMsg, notify } from '../../lib/notify';
import type { Profile } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

/** Основатель: список всех вузов (вход в любую Студ-страницу) и добавление нового */
export default function InstitutionsAdmin() {
  const { isFounder, openInstitution } = useFacet();
  const { refresh } = useAuth();
  const list = useAsync(allInstitutions, []);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [city, setCity] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const [president, setPresident] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isFounder) return <Screen topInset={false}><Txt>Только для Основателя</Txt></Screen>;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await createInstitution(slug.trim().toLowerCase(), name.trim(), short.trim() || name.trim(), city.trim(), president?.id);
      notify('Вуз добавлен', president ? `Президент: ${president.display_name}` : 'Вы назначены президентом — передайте роль позже');
      setSlug(''); setName(''); setShort(''); setCity(''); setPresident(null);
      await refresh();
      list.reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false}>
      <Card>
        <Txt v="label">Добавить учебное заведение</Txt>
        <Input label="Название" value={name} onChangeText={setName} placeholder="Московский физико-технический институт" />
        <Row>
          <View style={{ flex: 1 }}>
            <Input label="Кратко" value={short} onChangeText={setShort} placeholder="МФТИ" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Адрес (slug)" value={slug} onChangeText={setSlug} placeholder="mipt" autoCapitalize="none" />
          </View>
        </Row>
        <Input label="Город" value={city} onChangeText={setCity} />
        <Input
          label={president ? `Президент: ${president.display_name}` : 'Президент (необязательно)'}
          value={q}
          onChangeText={(t) => {
            setQ(t);
            if (t.trim().length >= 2) searchProfiles(t).then(setFound).catch(() => {});
            else setFound([]);
          }}
          placeholder="Найти по нику"
          autoCapitalize="none"
        />
        {found.map((u) => (
          <ListItem key={u.id} title={u.display_name} subtitle={`@${u.username}`} onPress={() => { setPresident(u); setFound([]); setQ(''); }} />
        ))}
        <ErrorText error={error} />
        <Button title="Добавить" onPress={create} loading={busy} disabled={!name || !slug} />
      </Card>

      <Txt v="label">Все учебные заведения</Txt>
      <Card>
        {list.data?.map((i, idx) => (
          <View key={i.id}>
            {idx > 0 ? <Divider /> : null}
            <ListItem
              left={<View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i.color_primary }} />}
              title={i.name}
              subtitle={`${i.short_name}${i.city ? ' · ' + i.city : ''}`}
              right={<Txt v="dim">Открыть ›</Txt>}
              onPress={() => {
                openInstitution(i);
                router.navigate('/');
              }}
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
