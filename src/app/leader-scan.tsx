import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Button, Card, Empty, Input, Row, Screen, Txt } from '../components/ui';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { scanLeader, type LeaderScanResult } from '../lib/api';
import { canScanLeaders } from '../lib/leader';
import { errMsg } from '../lib/notify';
import { scanQrInTelegram, tgHaptic } from '../lib/telegram';
import { FACET_META, PERMISSION_LABELS, ROLE_LABELS } from '../theme/facets';

/**
 * Сканер Leader ID: основатель, президенты и лидеры с правом «Сканер Leader ID» проверяют удостоверение —
 * действует ли оно, чьё, какая должность, до какого срока и что положено (например, бесплатный вход).
 */
export default function LeaderScanScreen() {
  const { staff, memberships } = useMe();
  const { palette: p } = useFacet();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<LeaderScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cooldown = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  if (!canScanLeaders(staff, memberships)) {
    return (
      <Screen topInset={false}>
        <Empty icon="🔒" title="Нет доступа" hint="Сканер Leader ID — для основателя, президентов и лидеров с правом «Сканер Leader ID»" />
      </Screen>
    );
  }

  const check = async (raw: string) => {
    const c = raw.replace(/\s+/g, '');
    if (!c) return;
    const now = Date.now();
    if (cooldown.current.code === c && now - cooldown.current.at < 3000) return;
    cooldown.current = { code: c, at: now };
    setError(null);
    try {
      const r = await scanLeader(c);
      setResult(r);
      setScanning(false);
      setCode('');
      if (Platform.OS !== 'web') Haptics.notificationAsync(r.valid ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
      else tgHaptic(r.valid ? 'success' : 'error');
    } catch (e) {
      setResult(null);
      setError(errMsg(e));
      if (Platform.OS === 'web') tgHaptic('error');
    }
  };

  const pass = result?.pass;
  const where = pass ? (pass.facet === 'stud' ? (pass.inst_name ?? 'Студ') : FACET_META[pass.facet].name) : '';
  const perms = pass?.permissions.includes('all') ? ['Все права'] : (pass?.permissions ?? []).map((x) => PERMISSION_LABELS[x] ?? x);

  return (
    <Screen topInset={false}>
      <Txt v="dim">Наведите камеру на QR с Leader ID. Player ID здесь не проверяется — для отметки на встрече другой сканер.</Txt>

      {result ? (
        <Card style={{ borderColor: result.valid ? p.success : p.danger, borderWidth: 2 }}>
          <Txt v="h2" color={result.valid ? p.success : p.danger}>
            {result.valid ? '✅ Действует' : '⛔ Недействителен'}
          </Txt>
          {result.reason ? <Txt color={p.danger}>{result.reason}</Txt> : null}
          {result.holder ? (
            <Row style={{ marginTop: 4 }}>
              <Avatar name={result.holder.display_name} url={result.holder.avatar_url} size={52} />
              <View style={{ flex: 1 }}>
                <Txt v="h3">{result.holder.display_name}</Txt>
                <Txt v="small">@{result.holder.username}</Txt>
              </View>
              <Button small kind="secondary" title="Профиль" onPress={() => router.push({ pathname: '/user/[id]', params: { id: result.holder!.id } })} />
            </Row>
          ) : null}
          {pass ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              <Field label="Где" value={where} />
              <Field label="Роль" value={ROLE_LABELS[pass.role as keyof typeof ROLE_LABELS] ?? pass.role} />
              {pass.position_title ? <Field label="Должность" value={pass.position_title} /> : null}
              <Field label="Действует до" value={pass.valid_until || (pass.facet === 'stud' ? 'Выпуска' : 'Бессрочно')} />
              {perms.length ? <Field label="Права" value={perms.join(', ')} /> : null}
              {pass.info ? (
                <View style={{ gap: 2, marginTop: 4 }}>
                  <Txt v="label">О лидерстве</Txt>
                  <Txt>{pass.info}</Txt>
                </View>
              ) : null}
              {result.valid && result.scans_today && result.scans_today > 1 ? (
                <Txt v="small">Сегодня это удостоверение проверяли уже {result.scans_today} раз(а)</Txt>
              ) : null}
            </View>
          ) : null}
        </Card>
      ) : null}
      {error ? (
        <Card style={{ borderColor: p.danger }}>
          <Txt color={p.danger}>⛔ {error}</Txt>
        </Card>
      ) : null}

      <Card>
        <Txt v="label">Сканер Leader ID</Txt>
        {scanning && permission?.granted ? (
          <View style={{ height: 300, borderRadius: 16, overflow: 'hidden' }}>
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(r) => check(r.data)} />
          </View>
        ) : null}
        <Button
          kind={scanning ? 'secondary' : 'primary'}
          icon="📷"
          title={scanning ? 'Остановить сканер' : 'Сканировать Leader ID'}
          onPress={async () => {
            if (scanQrInTelegram((text) => check(text), 'Наведите камеру на Leader ID', false)) return;
            if (!scanning && !permission?.granted) {
              const r = await requestPermission();
              if (!r.granted) return setError('Нет доступа к камере');
            }
            setScanning(!scanning);
          }}
        />
        <Row>
          <View style={{ flex: 1 }}>
            <Input value={code} onChangeText={setCode} placeholder="Код с карты: ABCD EFGH JKLM" autoCapitalize="characters" />
          </View>
          <Button title="OK" onPress={() => check(code)} />
        </Row>
      </Card>
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Txt v="dim">{label}</Txt>
      <Txt style={{ flex: 1, textAlign: 'right' }}>{value}</Txt>
    </Row>
  );
}
