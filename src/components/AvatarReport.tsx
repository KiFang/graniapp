import { useState } from 'react';
import { View } from 'react-native';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { moderateRemoveAvatar, reportAvatar } from '../lib/api';
import { isModerator } from '../lib/leader';
import { confirm, errMsg, notify } from '../lib/notify';
import { Button, Card, Chip, Row, Txt } from './ui';

const REASONS = ['18+', 'Жестокость', 'Оскорбления', 'Чужое фото'];

/**
 * Жалоба на аватар (18+ и прочее): три жалобы от разных игроков скрывают картинку до проверки.
 * Модератор (основатель или лидер с правом «Баны») убирает аватар сразу.
 */
export function AvatarReport({ userId, avatarUrl, onDone }: { userId: string; avatarUrl: string | null; onDone?: () => void }) {
  const { profile, staff } = useMe();
  const { palette: p } = useFacet();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  if (!avatarUrl || userId === profile.id) return null;
  const mod = isModerator(staff);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      setSent(done);
      setOpen(false);
      onDone?.();
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent === avatarUrl) {
    return (
      <Txt v="small" style={{ textAlign: 'center' }}>
        Спасибо — жалоба отправлена модераторам
      </Txt>
    );
  }
  if (!open) {
    return (
      <View style={{ alignItems: 'center' }}>
        <Button small kind="ghost" icon="⚑" title={mod ? 'Аватар: жалоба / убрать' : 'Пожаловаться на аватар'} onPress={() => setOpen(true)} />
      </View>
    );
  }
  return (
    <Card style={{ borderColor: p.danger + '66' }}>
      <Txt v="label">Что не так с аватаром?</Txt>
      <Row style={{ flexWrap: 'wrap' }} gap={8}>
        {REASONS.map((r) => (
          <Chip key={r} label={r} active={reason === r} color={p.danger} onPress={() => setReason(r)} />
        ))}
      </Row>
      <Txt v="small">Жалоба анонимна. Если пожалуются трое — картинка скроется, пока модератор не проверит.</Txt>
      <Row>
        <Button small kind="secondary" title="Отмена" style={{ flex: 1 }} onPress={() => setOpen(false)} />
        <Button
          small
          kind="danger"
          title="Пожаловаться"
          style={{ flex: 1 }}
          loading={busy}
          onPress={() => run(() => reportAvatar(userId, avatarUrl, reason), avatarUrl)}
        />
      </Row>
      {mod ? (
        <Button
          small
          kind="danger"
          icon="🛡"
          title="Убрать аватар сейчас (модератор)"
          loading={busy}
          onPress={async () => {
            if (await confirm('Убрать аватар?', `Причина: ${reason}. Игрок получит уведомление; вернуть можно в «Модерации».`, 'Убрать')) {
              await run(() => moderateRemoveAvatar(userId, avatarUrl, reason), '');
            }
          }}
        />
      ) : null}
    </Card>
  );
}
