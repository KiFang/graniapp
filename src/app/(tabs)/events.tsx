import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { EventCard } from '../../components/EventCard';
import { FacetHeader } from '../../components/FacetHeader';
import { StudGate } from '../../components/StudGate';
import { Button, Empty, ErrorText, Loading, Screen, Txt } from '../../components/ui';
import { WeekStrip } from '../../components/WeekStrip';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { listEvents, myRegistrations } from '../../lib/api';
import { addDays, fmtDate, sameDay, startOfWeek } from '../../lib/date';
import { useAsync } from '../../lib/useAsync';

/** Встречи: шкала недели сверху + список мероприятий */
export default function EventsScreen() {
  const { profile } = useMe();
  const { facet, institution, can } = useFacet();
  const [monday, setMonday] = useState(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState<Date | null>(null);

  const instId = institution?.id ?? null;
  const locked = facet === 'stud' && !institution;

  const { data, error, loading, reload } = useAsync(async () => {
    if (locked) return { events: [], mine: new Set<string>() };
    const [events, regs] = await Promise.all([
      listEvents(facet, instId, monday, addDays(monday, 7)),
      myRegistrations(profile.id),
    ]);
    return { events, mine: new Set(regs.map((r) => r.event_id)) };
  }, [facet, instId, monday, profile.id, locked]);

  const visible = useMemo(
    () => (data?.events ?? []).filter((e) => !selected || sameDay(new Date(e.starts_at), selected)),
    [data, selected],
  );

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <FacetHeader title={facet === 'into' ? 'Турниры и встречи' : 'Календарь встреч'} />
      {locked ? (
        <StudGate />
      ) : (
        <>
          <WeekStrip
            monday={monday}
            selected={selected}
            events={data?.events ?? []}
            onSelect={setSelected}
            onShiftWeek={(d) => {
              setMonday(addDays(monday, d * 7));
              setSelected(null);
            }}
          />
          {can('manage_events') ? (
            <Button kind="secondary" icon="＋" title="Создать мероприятие" onPress={() => router.push('/event/new')} />
          ) : null}
          <Txt v="label">{selected ? fmtDate(selected) : 'Вся неделя'}</Txt>
          <ErrorText error={error} />
          {loading && !data ? <Loading /> : null}
          {data && visible.length === 0 ? (
            <Empty icon="🗓" title="Встреч нет" hint={selected ? 'Выберите другой день' : 'Загляните на следующую неделю'} />
          ) : null}
          {visible.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              registered={data?.mine.has(e.id)}
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
            />
          ))}
        </>
      )}
    </Screen>
  );
}
