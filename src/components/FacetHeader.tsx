import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { unreadCount } from '../lib/api';
import { supabase } from '../lib/supabase';
import { FACET_META } from '../theme/facets';
import Feather from '@expo/vector-icons/Feather';
import { F } from '../theme/fonts';

/** Шапка вкладок: логотип, текущая грань/вуз, уведомления и переключатель граней */
export function FacetHeader({ title }: { title?: string }) {
  const { facet, palette: p, institution } = useFacet();
  const { profile } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    if (profile) unreadCount(profile.id).then(setUnread).catch(() => {});
  }, [profile]);

  useEffect(() => {
    refresh();
    if (!profile) return;
    const ch = supabase
      .channel(`notif-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile, refresh]);

  const scope = facet === 'stud' ? (institution?.short_name ?? 'вуз не выбран') : FACET_META[facet].name;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
      <View style={{ flex: 1 }}>
        <Pressable disabled={facet !== 'stud'} onPress={() => router.push('/stud/join')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.accent, shadowColor: p.accent, shadowOpacity: 1, shadowRadius: 6 }} />
          <Text style={{ color: p.accent, fontSize: 12, fontFamily: F.bold, letterSpacing: 1.5 }}>
            {facet === 'stud' ? 'ГРАНЬ СТУД · ' : 'ГРАНЬ · '}
            {scope.toUpperCase()}
            {facet === 'stud' ? '  ⌄' : ''}
          </Text>
        </Pressable>
        {title ? (
          <Text style={{ color: p.text, fontSize: 26, fontFamily: F.black, textTransform: 'uppercase', marginTop: 2 }}>{title}</Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => router.push('/notifications')}
        hitSlop={10}
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: p.surface,
          borderWidth: 1,
          borderColor: p.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="bell" size={20} color={p.text} />
        {unread > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: p.accent,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ color: p.onAccent, fontSize: 10, fontFamily: F.black }}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
