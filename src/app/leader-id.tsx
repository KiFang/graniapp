import { View } from 'react-native';
import { GraniCard } from '../components/GraniCard';
import { Empty, Row, Screen, Txt } from '../components/ui';
import { useMe } from '../context/AuthProvider';
import { leaderPasses } from '../lib/leader';
import { PERMISSION_LABELS } from '../theme/facets';

/** Все Leader ID пользователя — у каждой грани/вуза своё свечение */
export default function LeaderIdScreen() {
  const { profile, staff, memberships } = useMe();
  const passes = leaderPasses(staff, memberships);
  return (
    <Screen topInset={false}>
      {passes.length === 0 ? <Empty icon="🪪" title="Вы пока не лидер" hint="Роль выдаёт Основатель или президент вуза" /> : null}
      {passes.map((pass) => (
        <View key={pass.key} style={{ gap: 10, marginBottom: 18 }}>
          <GraniCard flat kind="leader" profile={profile} scope={pass.scope} position={pass.position} validUntil={pass.validUntil} />
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {pass.permissions.map((perm) => (
              <Txt key={perm} v="small" color={pass.scope.accent} style={{ borderWidth: 1, borderColor: pass.scope.accent + '55', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                {PERMISSION_LABELS[perm] ?? perm}
              </Txt>
            ))}
          </Row>
        </View>
      ))}
    </Screen>
  );
}
