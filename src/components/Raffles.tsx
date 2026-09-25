import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { createRaffle, drawRaffle, enterRaffle, listRaffles, listShop, profilesByIds, type Raffle } from '../lib/api';
import { addDays, fmtDateTime, parseInputValue, toInputValue } from '../lib/date';
import { confirm, errMsg, notify } from '../lib/notify';
import { useAsync } from '../lib/useAsync';
import { FACET_META } from '../theme/facets';
import { F } from '../theme/fonts';
import { Avatar } from './Avatar';
import { StickerArt } from './StickerArt';
import { Button, Card, Chip, ErrorText, Input, ListItem, Loading, Row, Txt } from './ui';

/**
 * Розыгрыши: очки, предметы магазина или реальные призы (настолка, худи…).
 * Участие — бесплатно или за очки; итоги подводятся сами, когда выйдет время (или лидер раньше — кнопкой).
 */
export function Raffles() {
  const { profile, refresh } = useMe();
  const { facet, institution, palette: p, can } = useFacet();
  const inst = facet === 'stud' ? (institution?.id ?? null) : null;
  const manage = can('manage_events');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync(async () => {
    const list = facet === 'stud' && !inst ? [] : await listRaffles(facet, inst);
    const winners = await profilesByIds([...new Set(list.flatMap((r) => r.winners))]);
    return { list, winners: new Map(winners.map((w) => [w.id, w])) };
  }, [facet, inst]);

  if (facet === 'stud' && !inst) return <Txt v="dim">Розыгрыши Студ — на странице вуза. Войдите по коду вуза.</Txt>;

  const enter = async (r: Raffle) => {
    if (r.entry_cost > 0 && !(await confirm(r.title, `Участие стоит ${r.entry_cost} очков. Участвовать?`, 'Участвовать'))) return;
    setBusy(r.id);
    try {
      await enterRaffle(r.id);
      await Promise.all([reload(), refresh()]);
      notify('Вы в игре 🍀', `Итоги — ${fmtDateTime(r.ends_at)}. Если выиграете, придёт уведомление.`);
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const draw = async (r: Raffle) => {
    if (!(await confirm('Подвести итоги сейчас?', `«${r.title}» — участников: ${r.entries.length}. Приём заявок закроется.`, 'Подвести')))
      return;
    setBusy(r.id);
    try {
      const w = await drawRaffle(r.id);
      await reload();
      notify('Итоги подведены', w.length ? `Победителей: ${w.length}` : 'Участников не было');
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const open = data?.list.filter((r) => !r.drawn_at) ?? [];
  const done = data?.list.filter((r) => r.drawn_at) ?? [];

  return (
    <View style={{ gap: 12 }}>
      {manage ? (
        creating ? (
          <RaffleForm
            onClose={() => setCreating(false)}
            onCreated={() => {
              setCreating(false);
              reload();
            }}
          />
        ) : (
          <Button small kind="ghost" icon="＋" title="Новый розыгрыш" onPress={() => setCreating(true)} />
        )
      ) : null}
      <ErrorText error={error} />
      {loading && !data ? <Loading /> : null}
      {data && !data.list.length ? (
        <Card>
          <Txt v="h3">Пока розыгрышей нет</Txt>
          <Txt v="dim">Здесь лидеры {FACET_META[facet].name} разыгрывают очки, титулы и настоящие призы. Загляните позже!</Txt>
        </Card>
      ) : null}

      {open.map((r) => {
        const joined = r.entries.some((e) => e.user_id === profile.id);
        const closed = Date.parse(r.ends_at) <= Date.now();
        return (
          <Card key={r.id} style={{ borderColor: p.accent + '55' }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <PrizeIcon r={r} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="h3">{r.title}</Txt>
                <Txt v="small" color={p.accent}>
                  🎁 {prizeLabel(r)}
                  {r.winners_count > 1 ? ` · ${r.winners_count} победителей` : ''}
                </Txt>
              </View>
            </Row>
            {r.description ? <Txt v="dim">{r.description}</Txt> : null}
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="small">👥 участников: {r.entries.length}</Txt>
              <Txt v="small">⏳ итоги {fmtDateTime(r.ends_at)}</Txt>
            </Row>
            {joined ? (
              <View
                style={{
                  borderRadius: 14,
                  paddingVertical: 11,
                  alignItems: 'center',
                  backgroundColor: p.surfaceAlt,
                }}
              >
                <Text style={{ fontFamily: F.bold, color: p.success }}>✓ Вы участвуете</Text>
              </View>
            ) : closed ? (
              <Txt v="small">Приём закрыт — итоги вот-вот появятся</Txt>
            ) : (
              <Button
                title={r.entry_cost ? `Участвовать · ${r.entry_cost} очк.` : 'Участвовать бесплатно'}
                loading={busy === r.id}
                disabled={r.entry_cost > profile.points}
                onPress={() => enter(r)}
              />
            )}
            {manage ? (
              <Button small kind="secondary" title="Подвести итоги сейчас" loading={busy === r.id} onPress={() => draw(r)} />
            ) : null}
          </Card>
        );
      })}

      {done.length ? <Txt v="label">Итоги</Txt> : null}
      {done.map((r) => {
        const iWon = r.winners.includes(profile.id);
        return (
          <Card key={r.id} style={iWon ? { borderColor: p.success } : undefined}>
            <Row>
              <PrizeIcon r={r} small />
              <View style={{ flex: 1 }}>
                <Txt v="h3" style={{ fontSize: 14 }}>
                  {r.title}
                </Txt>
                <Txt v="small">
                  {prizeLabel(r)} · {r.entries.length} участн.
                </Txt>
              </View>
              {iWon ? <Txt color={p.success}>🎉 Вы!</Txt> : null}
            </Row>
            {r.winners.length ? (
              r.winners.map((id) => {
                const w = data?.winners.get(id);
                return (
                  <ListItem
                    key={id}
                    left={<Avatar name={w?.display_name ?? '?'} url={w?.avatar_url} size={30} />}
                    title={`🏆 ${w?.display_name ?? 'Игрок'}`}
                    subtitle={w ? `@${w.username}` : undefined}
                    onPress={() => router.push({ pathname: '/user/[id]', params: { id } })}
                  />
                );
              })
            ) : (
              <Txt v="small">Участников не было</Txt>
            )}
          </Card>
        );
      })}
    </View>
  );
}

function prizeLabel(r: Raffle) {
  if (r.prize_kind === 'points') return `${r.prize_points} очков`;
  if (r.prize_kind === 'item') return r.item ? `«${r.item.name}»` : 'предмет магазина';
  return r.prize_text ?? 'приз';
}

function PrizeIcon({ r, small }: { r: Raffle; small?: boolean }) {
  const { palette: p } = useFacet();
  const s = small ? 36 : 48;
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s / 3,
        backgroundColor: p.accent + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {r.prize_kind === 'item' && r.item?.kind === 'sticker' ? (
        <StickerArt item={r.item} size={s * 0.7} />
      ) : (
        <Text style={{ fontSize: s * 0.5 }}>{r.prize_kind === 'points' ? '🪙' : r.prize_kind === 'item' ? '🏷' : '🎁'}</Text>
      )}
    </View>
  );
}

const PRIZE_KINDS: { kind: Raffle['prize_kind']; label: string }[] = [
  { kind: 'points', label: '🪙 Очки' },
  { kind: 'item', label: '🏷 Предмет магазина' },
  { kind: 'real', label: '🎁 Реальный приз' },
];

function RaffleForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { facet, institution } = useFacet();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<Raffle['prize_kind']>('points');
  const [points, setPoints] = useState('100');
  const [itemId, setItemId] = useState<string | null>(null);
  const [prizeText, setPrizeText] = useState('');
  const [cost, setCost] = useState('0');
  const [winners, setWinners] = useState('1');
  const [ends, setEnds] = useState(() => {
    const d = addDays(new Date(), 3);
    d.setHours(20, 0, 0, 0);
    return toInputValue(d);
  });
  const [busy, setBusy] = useState(false);
  const { data: items } = useAsync(() => listShop(), []);

  const save = async () => {
    const endsAt = parseInputValue(ends);
    if (!title.trim()) return notify('Название', 'Назовите розыгрыш');
    if (!endsAt) return notify('Дата', 'Формат: 2026-10-01 19:00');
    if (kind === 'item' && !itemId) return notify('Приз', 'Выберите предмет');
    if (kind === 'real' && !prizeText.trim()) return notify('Приз', 'Напишите, что разыгрываете');
    setBusy(true);
    try {
      await createRaffle({
        facet,
        inst: facet === 'stud' ? (institution?.id ?? null) : null,
        title,
        description,
        prize_kind: kind,
        prize_points: kind === 'points' ? Math.max(1, parseInt(points, 10) || 0) : null,
        prize_item: kind === 'item' ? itemId : null,
        prize_text: kind === 'real' ? prizeText : null,
        entry_cost: Math.max(0, parseInt(cost, 10) || 0),
        winners: Math.min(50, Math.max(1, parseInt(winners, 10) || 1)),
        ends_at: endsAt,
      });
      onCreated();
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Txt v="label">Новый розыгрыш · {facet === 'stud' ? (institution?.short_name ?? 'Студ') : FACET_META[facet].name}</Txt>
      <Input label="Название" value={title} onChangeText={setTitle} placeholder="Осенний розыгрыш" maxLength={80} />
      <Input label="Описание" value={description} onChangeText={setDescription} multiline placeholder="Условия, как вручим приз…" />
      <Txt v="label">Приз</Txt>
      <Row style={{ flexWrap: 'wrap' }} gap={8}>
        {PRIZE_KINDS.map((k) => (
          <Chip key={k.kind} label={k.label} active={kind === k.kind} onPress={() => setKind(k.kind)} />
        ))}
      </Row>
      {kind === 'points' ? (
        <Input label="Сколько очков каждому победителю" value={points} onChangeText={setPoints} keyboardType="number-pad" />
      ) : null}
      {kind === 'real' ? (
        <Input label="Что разыгрываем" value={prizeText} onChangeText={setPrizeText} placeholder="Настолка «Каркассон»" />
      ) : null}
      {kind === 'item' ? (
        <Row style={{ flexWrap: 'wrap' }} gap={8}>
          {items?.map((i) => (
            <Chip
              key={i.id}
              label={`${i.kind === 'title' ? '🏷' : i.kind === 'frame' ? '▢' : '✦'} ${i.name}`}
              active={itemId === i.id}
              onPress={() => setItemId(i.id)}
            />
          ))}
        </Row>
      ) : null}
      <Row>
        <View style={{ flex: 1 }}>
          <Input label="Вход, очков (0 — бесплатно)" value={cost} onChangeText={setCost} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Победителей" value={winners} onChangeText={setWinners} keyboardType="number-pad" />
        </View>
      </Row>
      <Input label="Итоги (дата и время)" value={ends} onChangeText={setEnds} placeholder="2026-10-01 19:00" />
      <Row>
        <Button kind="secondary" title="Отмена" style={{ flex: 1 }} onPress={onClose} />
        <Button title="Запустить" style={{ flex: 1 }} loading={busy} onPress={save} />
      </Row>
    </Card>
  );
}
