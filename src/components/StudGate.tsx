import { router } from 'expo-router';
import { View } from 'react-native';
import { institutionLeaderboard } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Button, Card, Empty, ErrorText, Loading, Row, Txt } from './ui';

/** Грань Студ без кода: доступна только страница рейтинга учебных заведений */
export function StudGate() {
  return (
    <View style={{ gap: 14 }}>
      <Card>
        <Txt v="h3">Нет доступа к странице вуза</Txt>
        <Txt v="dim">
          Введите код своего учебного заведения или гостевой код от лидера — откроются игротека, встречи, рейтинг и Карта
          Студента.
        </Txt>
        <Button title="Ввести код" onPress={() => router.push('/stud/join')} />
      </Card>
      <InstitutionLeaderboard />
    </View>
  );
}

export function InstitutionLeaderboard() {
  const { data, error, loading } = useAsync(institutionLeaderboard, []);
  return (
    <View style={{ gap: 10 }}>
      <Txt v="label">Рейтинг учебных заведений</Txt>
      <ErrorText error={error} />
      {loading && !data ? <Loading /> : null}
      {data && data.length === 0 ? <Empty title="Пока нет учебных заведений" /> : null}
      {data?.map((inst, i) => (
        <Card key={inst.id} style={{ borderColor: inst.color_primary + '55' }}>
          <Row>
            <Txt v="h2" color={i < 3 ? inst.color_primary : undefined} style={{ width: 36 }}>
              {i + 1}
            </Txt>
            <View style={{ flex: 1 }}>
              <Txt v="h3">{inst.short_name}</Txt>
              <Txt v="small">
                {inst.name}
                {inst.city ? ` · ${inst.city}` : ''}
              </Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt v="h3" color={inst.color_primary}>
                {inst.total_points}
              </Txt>
              <Txt v="small">
                {inst.members} уч. · {inst.events_held} встреч
              </Txt>
            </View>
          </Row>
        </Card>
      ))}
    </View>
  );
}
