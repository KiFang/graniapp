import { LeaderCard } from '../components/LeaderCard';
import { Empty, Screen, Txt } from '../components/ui';
import { useMe } from '../context/AuthProvider';
import { leaderPasses } from '../lib/leader';

/** Leader ID — удостоверения лидера во всех гранях, где пользователь лидер */
export default function LeaderIdScreen() {
  const { profile, staff, memberships } = useMe();
  const passes = leaderPasses(staff, memberships);
  return (
    <Screen topInset={false}>
      {passes.length === 0 ? <Empty icon="🪪" title="Вы пока не лидер" hint="Роль выдаёт Основатель или президент вуза" /> : null}
      {passes.map((pass) => (
        <LeaderCard key={pass.scope} profile={profile} pass={pass} />
      ))}
      {passes.length ? <Txt v="small">QR на Leader ID — тот же Player ID: по нему вас отмечают как участника.</Txt> : null}
    </Screen>
  );
}
