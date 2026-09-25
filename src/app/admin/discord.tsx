import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Button, Card, Empty, ErrorText, Input, Loading, Row, Screen, Txt } from '../../components/ui';
import { useFacet } from '../../context/FacetProvider';
import { getDiscordHook, setDiscordHook, testDiscordHook } from '../../lib/api';
import { errMsg, notify } from '../../lib/notify';
import { useAsync } from '../../lib/useAsync';
import { FACET_META } from '../../theme/facets';

/**
 * Discord-канал грани: турниры, результаты сетки и победители (по желанию — все встречи) уходят в канал через вебхук.
 * Настраивают те, у кого есть право «Мероприятия» в этой грани.
 */
export default function DiscordScreen() {
  const { facet, institution, palette: p, can } = useFacet();
  const inst = facet === 'stud' ? (institution?.id ?? null) : null;
  const allowed = can('manage_events') && (facet !== 'stud' || Boolean(inst));
  const where = facet === 'stud' ? (institution?.short_name ?? 'Студ') : FACET_META[facet].name;
  const { data, error, loading } = useAsync(() => (allowed ? getDiscordHook(facet, inst) : Promise.resolve(null)), [facet, inst, allowed]);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState(false);
  const [results, setResults] = useState(true);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setUrl(data.url);
    setEvents(data.post_events);
    setResults(data.post_results);
    setSaved(true);
  }, [data]);

  if (!allowed) return <Screen topInset={false}><Empty icon="🔒" title="Нет доступа" hint="Discord настраивают лидеры с правом «Мероприятия» в этой грани" /></Screen>;

  const save = async () => {
    setBusy('save');
    try {
      await setDiscordHook(facet, inst, url, events, results);
      setSaved(Boolean(url.trim()));
      notify(url.trim() ? 'Сохранено' : 'Discord отключён', url.trim() ? 'Нажмите «Проверить» — в канал придёт тестовое сообщение.' : '');
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      await testDiscordHook(facet, inst);
      notify('Отправлено', 'Проверьте канал в Discord');
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen topInset={false}>
      <Txt v="h2">Discord · {where}</Txt>
      <Txt v="dim">Новые турниры, результаты матчей сетки и победители сами появятся в вашем канале Discord.</Txt>
      <ErrorText error={error} />
      {loading ? <Loading /> : null}
      <Card>
        <Txt v="label">Как подключить</Txt>
        <Txt v="small">1. В Discord: настройки канала → «Интеграции» → «Вебхуки» → «Новый вебхук».</Txt>
        <Txt v="small">2. «Копировать URL вебхука» и вставить сюда.</Txt>
        <Txt v="small">3. Сохранить и нажать «Проверить».</Txt>
      </Card>
      <Card>
        <Input
          label="Ссылка вебхука"
          value={url}
          onChangeText={(t) => {
            setUrl(t);
            setSaved(false);
          }}
          placeholder="https://discord.com/api/webhooks/…"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Toggle label="Результаты сетки и победитель" hint="Кто прошёл дальше, кто выиграл турнир" value={results} onChange={setResults} accent={p.accent} />
        <Toggle label="Все новые встречи" hint="Турниры публикуются всегда; это — ещё и обычные встречи" value={events} onChange={setEvents} accent={p.accent} />
        <Row>
          <Button title="Сохранить" style={{ flex: 1 }} loading={busy === 'save'} onPress={save} />
          <Button kind="secondary" title="Проверить" style={{ flex: 1 }} disabled={!saved} loading={busy === 'test'} onPress={test} />
        </Row>
        {data ? <Txt v="small">Чтобы отключить — очистите ссылку и сохраните.</Txt> : null}
      </Card>
      <Txt v="small">Ссылка вебхука — как пароль: её видят только лидеры с правом «Мероприятия».</Txt>
    </Screen>
  );
}

function Toggle({ label, hint, value, onChange, accent }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void; accent: string }) {
  return (
    <Row style={{ paddingVertical: 4 }}>
      <View style={{ flex: 1 }}>
        <Txt v="h3" style={{ fontSize: 14 }}>
          {label}
        </Txt>
        <Txt v="small">{hint}</Txt>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: accent }} />
    </Row>
  );
}
