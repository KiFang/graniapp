import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { unreadCount } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';

const Ctx = createContext<{ unread: number; refresh: () => void }>({ unread: 0, refresh: () => {} });

/**
 * Одна realtime-подписка на уведомления на всё приложение.
 * (Если подписываться в каждой шапке, Supabase возвращает уже подписанный канал с тем же именем и падает.)
 */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const uid = profile?.id ?? null;
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    if (uid) unreadCount(uid).then(setUnread).catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setUnread(0);
      return;
    }
    refresh();
    const ch = supabase
      .channel(`notif-${uid}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, refresh]);

  return <Ctx.Provider value={{ unread, refresh }}>{children}</Ctx.Provider>;
}

export const useUnread = () => useContext(Ctx);
