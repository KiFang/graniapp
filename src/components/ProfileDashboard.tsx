import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { useFacet } from '../context/FacetProvider';
import type { ProfileStats } from '../lib/api';
import { F } from '../theme/fonts';
import { Flame, streakTier } from './Flame';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Дашборд игрока: серия с огоньком, очки и место, ELO, встречи, партии, друзья */
export function ProfileDashboard({ s }: { s: ProfileStats }) {
  const { palette: p } = useFacet();
  const tier = streakTier(s.streak);
  const since = new Date(s.since);
  const winRate = s.matches ? Math.round((s.wins / s.matches) * 100) : null;

  const tile = (value: string | number, label: string, sub?: string, color = p.text) => (
    <View key={label} style={{ flexBasis: '30%', flexGrow: 1, backgroundColor: p.surfaceAlt, borderRadius: 16, padding: 12, gap: 2 }}>
      <Text style={{ color, fontFamily: F.black, fontSize: 20 }}>{value}</Text>
      <Text style={{ color: p.textDim, fontFamily: F.semibold, fontSize: 11 }}>{label}</Text>
      {sub ? <Text style={{ color: p.textDim, fontFamily: F.regular, fontSize: 10, opacity: 0.8 }}>{sub}</Text> : null}
    </View>
  );

  return (
    <View style={{ gap: 10 }}>
      {/* серия — главная плитка */}
      <LinearGradient
        colors={s.streak > 0 ? [tier.color + '40', p.surface] : [p.surfaceAlt, p.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: s.streak > 0 ? tier.color + '66' : p.border }}
      >
        <Flame streak={s.streak} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: s.streak > 0 ? tier.color : p.textDim, fontFamily: F.black, fontSize: 28 }}>
            {s.streak} {s.streak % 10 === 1 && s.streak % 100 !== 11 ? 'день' : s.streak % 10 >= 2 && s.streak % 10 <= 4 && (s.streak % 100 < 12 || s.streak % 100 > 14) ? 'дня' : 'дней'}
          </Text>
          <Text style={{ color: p.textDim, fontFamily: F.semibold, fontSize: 12 }}>
            {s.streak > 0 ? `Серия · огонёк «${tier.name}»${s.checked_today ? ' · сегодня ✓' : ''}` : 'Серия не горит'}
            {s.best_streak > s.streak ? ` · рекорд ${s.best_streak}` : ''}
          </Text>
        </View>
      </LinearGradient>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {tile(s.points_total, 'очков всего', `#${s.place} из ${s.players}`, p.accent)}
        {tile(s.best_elo, 'лучший ELO')}
        {tile(s.attended, 'встреч', s.upcoming ? `ещё записан на ${s.upcoming}` : undefined)}
        {tile(s.matches, 'партий', winRate != null ? `побед ${s.wins} · ${winRate}%` : undefined)}
        {tile(s.tournaments_won, 'турниров выиграно', undefined, s.tournaments_won ? '#FFD166' : p.text)}
        {tile(s.friends, 'друзей', `${s.followers} подписчиков`)}
      </View>
      <Text style={{ color: p.textDim, fontFamily: F.regular, fontSize: 11, textAlign: 'center' }}>
        В GRANI с {since.getDate()} {MONTHS[since.getMonth()]} {since.getFullYear()} · предметов в инвентаре: {s.items}
      </Text>
    </View>
  );
}
