import { Text, View } from 'react-native';
import { usePalette } from '../context/FacetProvider';
import { fmtDateTime } from '../lib/date';
import type { GEvent } from '../lib/types';
import { Card, Row, Txt } from './ui';

export function EventCard({ event, registered, onPress }: { event: GEvent; registered?: boolean; onPress: () => void }) {
  const p = usePalette();
  const count = event.registrations?.[0]?.count ?? 0;
  const past = Date.parse(event.ends_at ?? event.starts_at) < Date.now();
  return (
    <Card onPress={onPress} style={{ opacity: past ? 0.6 : 1 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="small" color={p.accent}>
          {fmtDateTime(event.starts_at)}
        </Txt>
        <Row gap={6}>
          {event.is_tournament ? <Tag text="Турнир" color={p.accent2} /> : null}
          {event.elo_enabled ? <Tag text="ELO" color={p.accent} /> : null}
          {registered ? <Tag text="Вы записаны" color={p.success} /> : null}
        </Row>
      </Row>
      <Txt v="h3">{event.title}</Txt>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="dim" numberOfLines={1} style={{ flex: 1 }}>
          {[event.game?.title, event.location].filter(Boolean).join(' · ') || 'Место уточняется'}
        </Txt>
        <Txt v="small">
          👥 {count}
          {event.capacity ? `/${event.capacity}` : ''} · +{event.points_reward} очк.
        </Txt>
      </Row>
    </Card>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: color + '26' }}>
      <Text style={{ color, fontSize: 11, fontWeight: '800' }}>{text}</Text>
    </View>
  );
}
