import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { QR_PREFIX } from '../../lib/qr';
import { Button, Card, Divider, ErrorText, Input, ListItem, Loading, Row, Screen, Txt } from '../../components/ui';
import { useFacet } from '../../context/FacetProvider';
import {
  checkInByCode,
  checkInManual,
  eventRegistrations,
  getEvent,
  searchProfiles,
  type CheckInResult,
} from '../../lib/api';
import { errMsg } from '../../lib/notify';
import type { Profile } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

/** Отметка: сканер Player ID (Студ, Изнанка) и/или ручная отметка (Инто) */
export default function CheckInScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette: p } = useFacet();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const cooldown = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const { data, error, loading, reload } = useAsync(async () => {
    const [event, regs] = await Promise.all([getEvent(id), eventRegistrations(id)]);
    return { event, regs };
  }, [id]);

  const report = (r: CheckInResult) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setLast({ ok: true, text: r.already ? `${r.display_name} уже отмечен` : `${r.display_name} отмечен · +${r.points} очков` });
    reload();
  };
  const fail = (e: unknown) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setLast({ ok: false, text: errMsg(e) });
  };

  const byCode = async (raw: string) => {
    const c = raw.startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length) : raw;
    if (!c.trim()) return;
    const now = Date.now();
    if (cooldown.current.code === c && now - cooldown.current.at < 3000) return;
    cooldown.current = { code: c, at: now };
    try {
      report(await checkInByCode(id, c));
      setCode('');
    } catch (e) {
      fail(e);
    }
  };

  const manual = async (uid: string) => {
    try {
      report(await checkInManual(id, uid));
    } catch (e) {
      fail(e);
    }
  };

  if (!data) return <Screen topInset={false}>{loading ? <Loading /> : <ErrorText error={error} />}</Screen>;
  const { event, regs } = data;
  const allowQr = event.checkin_mode !== 'manual';
  const allowManual = event.checkin_mode !== 'qr';
  const checked = regs.filter((r) => r.status === 'checked_in').length;

  return (
    <Screen topInset={false} refreshing={loading} onRefresh={reload}>
      <Txt v="h2">{event.title}</Txt>
      <Txt v="dim">
        Отмечено {checked} из {regs.length} записавшихся
      </Txt>

      {last ? (
        <Card style={{ borderColor: last.ok ? p.success : p.danger }}>
          <Txt color={last.ok ? p.success : p.danger} style={{ fontWeight: '700' }}>
            {last.ok ? '✅' : '⛔'} {last.text}
          </Txt>
        </Card>
      ) : null}

      {allowQr ? (
        <Card>
          <Txt v="label">Сканер Player ID</Txt>
          {scanning && permission?.granted ? (
            <View style={{ height: 300, borderRadius: 16, overflow: 'hidden' }}>
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={(r) => byCode(r.data)}
              />
            </View>
          ) : null}
          <Button
            kind={scanning ? 'secondary' : 'primary'}
            icon="📷"
            title={scanning ? 'Остановить сканер' : 'Сканировать QR'}
            onPress={async () => {
              if (!scanning && !permission?.granted) {
                const r = await requestPermission();
                if (!r.granted) return fail(new Error('Нет доступа к камере'));
              }
              setScanning(!scanning);
            }}
          />
          <Row>
            <View style={{ flex: 1 }}>
              <Input value={code} onChangeText={setCode} placeholder="Код с карты: A1B2C3D4" autoCapitalize="characters" />
            </View>
            <Button title="OK" onPress={() => byCode(code)} />
          </Row>
        </Card>
      ) : (
        <Txt v="small">Для этого мероприятия отметка по QR выключена — только вручную.</Txt>
      )}

      {allowManual ? (
        <>
          <Txt v="label">Ручная отметка</Txt>
          <Card>
            {regs.length === 0 ? <Txt v="dim">Никто не записан — найдите игрока ниже</Txt> : null}
            {regs.map((r, i) => (
              <View key={r.user_id}>
                {i > 0 ? <Divider /> : null}
                <ListItem
                  left={<Avatar name={r.profile?.display_name ?? '?'} url={r.profile?.avatar_url} size={34} />}
                  title={r.profile?.display_name ?? 'Игрок'}
                  subtitle={`@${r.profile?.username}`}
                  right={
                    r.status === 'checked_in' ? (
                      <Txt color={p.success}>✓</Txt>
                    ) : (
                      <Button small title="Отметить" onPress={() => manual(r.user_id)} />
                    )
                  }
                />
              </View>
            ))}
          </Card>
          <Card>
            <Txt v="label">Пришёл без записи</Txt>
            <Input
              value={q}
              onChangeText={(t) => {
                setQ(t);
                if (t.trim().length >= 2) searchProfiles(t).then(setFound).catch(() => {});
                else setFound([]);
              }}
              placeholder="Ник или имя"
              autoCapitalize="none"
            />
            {found.map((u) => (
              <ListItem
                key={u.id}
                left={<Avatar name={u.display_name} url={u.avatar_url} size={30} />}
                title={u.display_name}
                subtitle={`@${u.username}`}
                right={<Button small title="Отметить" onPress={() => manual(u.id)} />}
              />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
