import { useState } from 'react';
import { View } from 'react-native';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { grantPoints } from '../lib/api';
import { errMsg, notify } from '../lib/notify';
import { FACET_META } from '../theme/facets';
import { Button, Card, Input, Row, Txt } from './ui';

/** Ручное начисление очков: видно лидерам с правом «Результаты и очки» в текущей грани */
export function GrantPoints({ userId, name, onDone }: { userId: string; name: string; onDone?: () => void }) {
  const { profile: me } = useMe();
  const { facet, institution, can, isFounder, palette: p } = useFacet();
  const [amount, setAmount] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  if (!can('manage_matches') || (facet === 'stud' && !institution)) return null;
  if (userId === me.id && !isFounder) return null;

  const n = parseInt(amount.replace(/[^0-9-]/g, ''), 10);
  const valid = Number.isFinite(n) && n !== 0 && why.trim().length > 0;
  const where = facet === 'stud' ? (institution?.short_name ?? 'Студ') : FACET_META[facet].name;

  const submit = async (sign: 1 | -1) => {
    if (!valid) return;
    const value = Math.abs(n) * sign;
    setBusy(true);
    try {
      await grantPoints(userId, value, why.trim(), facet, facet === 'stud' ? (institution?.id ?? null) : null);
      notify(value > 0 ? 'Очки начислены' : 'Очки списаны', `${name}: ${value > 0 ? '+' : '−'}${Math.abs(value)} · ${why.trim()}`);
      setAmount('');
      setWhy('');
      onDone?.();
    } catch (e) {
      notify('Ошибка', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Txt v="label">Очки · {where}</Txt>
      <Txt v="small">Игрок получит уведомление с причиной. Очки попадут в рейтинг этой грани.</Txt>
      <Row>
        <View style={{ width: 110 }}>
          <Input value={amount} onChangeText={setAmount} placeholder="Сколько" keyboardType="number-pad" maxLength={5} />
        </View>
        <View style={{ flex: 1 }}>
          <Input value={why} onChangeText={setWhy} placeholder="За что" maxLength={80} />
        </View>
      </Row>
      <Row>
        <Button title="Начислить" icon="+" style={{ flex: 1 }} onPress={() => submit(1)} loading={busy} disabled={!valid} />
        <Button title="Списать" kind="secondary" style={{ flex: 1 }} onPress={() => submit(-1)} disabled={!valid || busy} />
      </Row>
      <Txt v="small" color={p.textDim}>
        Очки за отметку на встрече и за победу в партии начисляются сами.
      </Txt>
    </Card>
  );
}
