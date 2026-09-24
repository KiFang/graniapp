import { must, supabase } from './supabase';
import type {
  CardSticker,
  CheckinMode,
  Facet,
  Game,
  GameReview,
  GEvent,
  InsideRole,
  InsideStaff,
  Institution,
  InstitutionMember,
  InstRole,
  LeaderboardInstitution,
  Notification,
  Permission,
  Profile,
  Rating,
  Recommendation,
  Registration,
  ShopItem,
} from './types';

const PROFILE_MINI = 'id, display_name, username, avatar_url';

// ---------------------------------------------------------------- профиль
export async function getProfile(id: string): Promise<Profile> {
  return must(await supabase.from('profiles').select('*').eq('id', id).single()) as Profile;
}

export async function updateProfile(id: string, patch: Partial<Profile>) {
  must(await supabase.from('profiles').update(patch).eq('id', id));
}

export async function searchProfiles(q: string): Promise<Profile[]> {
  const term = q.trim().replace(/[%,]/g, '');
  if (!term) return [];
  return must(
    await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
      .limit(20),
  ) as Profile[];
}

// ---------------------------------------------------------------- Изнанка: роли
export async function getInsideStaff(uid: string): Promise<InsideStaff | null> {
  return must(await supabase.from('inside_staff').select('*').eq('user_id', uid).maybeSingle()) as InsideStaff | null;
}

export async function listInsideStaff(): Promise<(InsideStaff & { profile: Profile })[]> {
  return must(
    await supabase.from('inside_staff').select('*, profile:profiles!inside_staff_user_id_fkey(*)').order('role'),
  ) as any;
}

export async function setInsideRole(target: string, role: InsideRole, perms: Permission[]) {
  must(await supabase.rpc('set_inside_role', { target, new_role: role, perms }));
}

export async function removeInsideRole(target: string) {
  must(await supabase.rpc('remove_inside_role', { target }));
}

// ---------------------------------------------------------------- Студ
export async function myMemberships(uid: string): Promise<InstitutionMember[]> {
  const rows = must(
    await supabase.from('institution_members').select('*, institution:institutions(*)').eq('user_id', uid),
  ) as InstitutionMember[];
  const now = Date.now();
  return rows.filter((m) => m.role !== 'guest' || !m.guest_until || Date.parse(m.guest_until) > now);
}

export async function institutionLeaderboard(): Promise<LeaderboardInstitution[]> {
  return must(await supabase.rpc('institution_leaderboard')) as LeaderboardInstitution[];
}

export async function allInstitutions(): Promise<Institution[]> {
  return must(await supabase.from('institutions').select('*').order('name')) as Institution[];
}

export async function joinInstitution(code: string): Promise<string> {
  return must(await supabase.rpc('join_institution', { p_code: code })) as string;
}

export async function createInstitution(slug: string, name: string, short: string, city: string, president?: string) {
  return must(
    await supabase.rpc('create_institution', {
      p_slug: slug,
      p_name: name,
      p_short: short,
      p_city: city,
      p_president: president ?? null,
    }),
  ) as string;
}

export async function updateInstitution(id: string, patch: Partial<Institution>) {
  must(await supabase.from('institutions').update(patch).eq('id', id));
}

export async function institutionMembers(inst: string): Promise<InstitutionMember[]> {
  return must(
    await supabase
      .from('institution_members')
      .select('*, profile:profiles!institution_members_user_id_fkey(*)')
      .eq('institution_id', inst)
      .order('joined_at'),
  ) as InstitutionMember[];
}

export async function updateStudProfile(inst: string, uid: string, patch: Partial<InstitutionMember>) {
  must(await supabase.from('institution_members').update(patch).eq('institution_id', inst).eq('user_id', uid));
}

export async function setInstRole(inst: string, target: string, role: InstRole, perms: Permission[] = []) {
  must(await supabase.rpc('set_inst_role', { inst, target, new_role: role, perms }));
}

/** Должность и «действует до» на Leader ID (inst = null — Изнанка/Инто) */
export async function setLeaderPass(inst: string | null, target: string, position: string, validUntil: string) {
  must(await supabase.rpc('set_leader_pass', { inst, target, p_position: position, p_valid_until: validUntil }));
}

export async function transferPresidency(inst: string, newPresident: string) {
  must(await supabase.rpc('transfer_presidency', { inst, new_president: newPresident }));
}

export async function removeMember(inst: string, uid: string) {
  must(await supabase.from('institution_members').delete().eq('institution_id', inst).eq('user_id', uid));
}

export async function getAccessCode(inst: string): Promise<string> {
  return must(await supabase.rpc('get_access_code', { inst })) as string;
}

export async function regenerateAccessCode(inst: string): Promise<string> {
  return must(await supabase.rpc('regenerate_access_code', { inst })) as string;
}

export async function createGuestInvite(inst: string, uid: string, hours: number, maxUses: number) {
  return must(
    await supabase
      .from('guest_invites')
      .insert({ institution_id: inst, created_by: uid, access_hours: hours, max_uses: maxUses })
      .select('*')
      .single(),
  ) as { code: string; expires_at: string; access_hours: number; max_uses: number; uses: number };
}

export async function listGuestInvites(inst: string) {
  return must(
    await supabase
      .from('guest_invites')
      .select('*')
      .eq('institution_id', inst)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ) as { code: string; expires_at: string; access_hours: number; max_uses: number; uses: number }[];
}

// ---------------------------------------------------------------- мероприятия
const EVENT_SELECT = `*, game:games(id, title), host:profiles!events_host_id_fkey(id, display_name, username), registrations:event_registrations(count)`;

export async function listEvents(facet: Facet, inst: string | null, from: Date, to: Date): Promise<GEvent[]> {
  let q = supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('facet', facet)
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString())
    .order('starts_at');
  if (facet === 'stud') q = q.eq('institution_id', inst ?? '00000000-0000-0000-0000-000000000000');
  return must(await q) as GEvent[];
}

export async function getEvent(id: string): Promise<GEvent> {
  return must(await supabase.from('events').select(EVENT_SELECT).eq('id', id).single()) as GEvent;
}

export interface EventInput {
  facet: Facet;
  institution_id: string | null;
  title: string;
  description: string;
  location: string;
  game_id: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  points_reward: number;
  is_tournament: boolean;
  elo_enabled: boolean;
  checkin_mode: CheckinMode | null;
  host_id: string | null;
}

export async function createEvent(uid: string, input: EventInput): Promise<string> {
  const row: Record<string, unknown> = { ...input, created_by: uid };
  if (!input.checkin_mode) delete row.checkin_mode; // дефолт грани выставит БД
  return (must(await supabase.from('events').insert(row).select('id').single()) as { id: string }).id;
}

export async function updateEvent(id: string, patch: Partial<EventInput>) {
  must(await supabase.from('events').update(patch).eq('id', id));
}

export async function deleteEvent(id: string) {
  must(await supabase.from('events').delete().eq('id', id));
}

export async function eventRegistrations(eventId: string): Promise<Registration[]> {
  return must(
    await supabase
      .from('event_registrations')
      .select(`*, profile:profiles!event_registrations_user_id_fkey(${PROFILE_MINI}, player_code)`)
      .eq('event_id', eventId)
      .neq('status', 'cancelled')
      .order('created_at'),
  ) as Registration[];
}

export async function myRegistrations(uid: string): Promise<{ event_id: string; status: string }[]> {
  return must(
    await supabase.from('event_registrations').select('event_id, status').eq('user_id', uid).neq('status', 'cancelled'),
  ) as any;
}

export async function registerForEvent(eventId: string) {
  must(await supabase.rpc('register_for_event', { ev: eventId }));
}

export async function cancelRegistration(eventId: string) {
  must(await supabase.rpc('cancel_registration', { ev: eventId }));
}

export interface CheckInResult {
  user_id: string;
  display_name: string;
  already: boolean;
  points: number;
}

export async function checkInByCode(eventId: string, code: string): Promise<CheckInResult> {
  return must(await supabase.rpc('check_in', { ev: eventId, p_player_code: code, p_user: null })) as CheckInResult;
}

export async function checkInManual(eventId: string, userId: string): Promise<CheckInResult> {
  return must(await supabase.rpc('check_in', { ev: eventId, p_player_code: null, p_user: userId })) as CheckInResult;
}

// ---------------------------------------------------------------- игротека и рейтинги
export async function listGames(facet: Facet, inst: string | null): Promise<Game[]> {
  let q = supabase.from('games').select('*').eq('facet', facet).order('title');
  if (facet === 'stud') q = q.eq('institution_id', inst ?? '00000000-0000-0000-0000-000000000000');
  return must(await q) as Game[];
}

export async function getGame(id: string): Promise<Game> {
  return must(await supabase.from('games').select('*').eq('id', id).single()) as Game;
}

export async function saveGame(game: Partial<Game> & { facet: Facet }, uid: string) {
  if (game.id) {
    const { id, ...patch } = game;
    must(await supabase.from('games').update(patch).eq('id', id));
    return id;
  }
  return (must(await supabase.from('games').insert({ ...game, created_by: uid }).select('id').single()) as { id: string })
    .id;
}

export async function deleteGame(id: string) {
  must(await supabase.from('games').delete().eq('id', id));
}

// ---------------------------------------------------------------- Инто: рекомендации
const REVIEW_SELECT = `*, author:profiles!game_reviews_author_id_fkey(${PROFILE_MINI})`;

function withAverages(g: Game & { reviews: GameReview[] }): Recommendation {
  const n = g.reviews.length;
  const avg = (k: 'score' | 'difficulty') => (n ? g.reviews.reduce((s, r) => s + r[k], 0) / n : null);
  return { ...g, avgScore: avg('score'), avgDifficulty: avg('difficulty') };
}

/** Игры Инто с оценками лидеров */
export async function listRecommendations(): Promise<Recommendation[]> {
  const rows = must(
    await supabase.from('games').select(`*, reviews:game_reviews(${REVIEW_SELECT})`).eq('facet', 'into'),
  ) as (Game & { reviews: GameReview[] })[];
  return rows.map(withAverages);
}

export async function getRecommendation(id: string): Promise<Recommendation> {
  const row = must(
    await supabase.from('games').select(`*, reviews:game_reviews(${REVIEW_SELECT})`).eq('id', id).single(),
  ) as Game & { reviews: GameReview[] };
  return withAverages(row);
}

export async function saveReview(r: Pick<GameReview, 'game_id' | 'author_id' | 'score' | 'difficulty' | 'review' | 'tags'>) {
  must(await supabase.from('game_reviews').upsert(r, { onConflict: 'game_id,author_id' }));
}

export async function deleteReview(gameId: string, authorId: string) {
  must(await supabase.from('game_reviews').delete().eq('game_id', gameId).eq('author_id', authorId));
}

export async function listRatings(
  facet: Facet,
  inst: string | null,
  gameId: string | null,
  sort: 'elo' | 'points',
): Promise<Rating[]> {
  let q = supabase
    .from('ratings')
    .select(`*, profile:profiles!ratings_user_id_fkey(${PROFILE_MINI})`)
    .eq('facet', facet)
    .order(sort, { ascending: false })
    .limit(100);
  q = inst ? q.eq('institution_id', inst) : q.is('institution_id', null);
  q = gameId ? q.eq('game_id', gameId) : q.is('game_id', null);
  return must(await q) as Rating[];
}

export async function myRatings(uid: string): Promise<Rating[]> {
  return must(await supabase.from('ratings').select('*').eq('user_id', uid).is('game_id', null)) as Rating[];
}

/** Место игрока в рейтинге грани (по очкам); null — ещё нет в рейтинге */
export async function myRank(uid: string, facet: Facet, inst: string | null): Promise<{ rank: number | null; elo: number; points: number }> {
  let q = supabase.from('ratings').select('points, elo').eq('user_id', uid).eq('facet', facet).is('game_id', null);
  q = inst ? q.eq('institution_id', inst) : q.is('institution_id', null);
  const mine = (must(await q.maybeSingle()) as { points: number; elo: number } | null) ?? null;
  if (!mine) return { rank: null, elo: 1000, points: 0 };
  let c = supabase.from('ratings').select('*', { count: 'exact', head: true }).eq('facet', facet).is('game_id', null).gt('points', mine.points);
  c = inst ? c.eq('institution_id', inst) : c.is('institution_id', null);
  const { count } = await c;
  return { rank: (count ?? 0) + 1, elo: mine.elo, points: mine.points };
}

export async function recordMatch(
  facet: Facet,
  inst: string | null,
  gameId: string | null,
  eventId: string | null,
  results: { user_id: string; placement: number }[],
  winPoints: number,
) {
  return must(
    await supabase.rpc('record_match', {
      p_facet: facet,
      p_inst: inst,
      p_game: gameId,
      p_event: eventId,
      p_results: results,
      p_win_points: winPoints,
    }),
  ) as string;
}

/** Ручное начисление (минус — списание) лидером с правом «Результаты и очки»; игрок получит уведомление */
export async function grantPoints(target: string, amount: number, why: string, facet: Facet, inst: string | null) {
  must(await supabase.rpc('grant_points', { target, amount, why, f: facet, inst }));
}

// ---------------------------------------------------------------- магазин и Player ID
export async function listShop(): Promise<ShopItem[]> {
  return must(
    await supabase.from('shop_items').select('*').eq('is_active', true).order('kind').order('price'),
  ) as ShopItem[];
}

export async function myItems(uid: string): Promise<string[]> {
  const rows = must(await supabase.from('user_items').select('item_id').eq('user_id', uid)) as { item_id: string }[];
  return rows.map((r) => r.item_id);
}

export async function buyItem(itemId: string): Promise<number> {
  return must(await supabase.rpc('buy_item', { item: itemId })) as number;
}

export async function getItems(ids: string[]): Promise<ShopItem[]> {
  if (!ids.length) return [];
  return must(await supabase.from('shop_items').select('*').in('id', ids)) as ShopItem[];
}

export async function listStickers(uid: string): Promise<CardSticker[]> {
  return must(
    await supabase.from('card_stickers').select('*, item:shop_items(*)').eq('user_id', uid).order('z'),
  ) as CardSticker[];
}

export async function addSticker(uid: string, itemId: string, x: number, y: number, rotation: number) {
  return must(
    await supabase
      .from('card_stickers')
      .insert({ user_id: uid, item_id: itemId, x, y, rotation, z: Date.now() % 1_000_000 })
      .select('*, item:shop_items(*)')
      .single(),
  ) as CardSticker;
}

export async function removeSticker(id: string) {
  must(await supabase.from('card_stickers').delete().eq('id', id));
}

// ---------------------------------------------------------------- подписки и друзья
export async function followStats(uid: string) {
  const [followers, following, friends] = await Promise.all([
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
    supabase.from('friends').select('*', { count: 'exact', head: true }).eq('user_id', uid),
  ]);
  return { followers: followers.count ?? 0, following: following.count ?? 0, friends: friends.count ?? 0 };
}

export async function isFollowing(me: string, other: string) {
  const [a, b] = await Promise.all([
    supabase.from('follows').select('follower_id').eq('follower_id', me).eq('following_id', other).maybeSingle(),
    supabase.from('follows').select('follower_id').eq('follower_id', other).eq('following_id', me).maybeSingle(),
  ]);
  return { iFollow: Boolean(a.data), followsMe: Boolean(b.data) };
}

export async function follow(me: string, other: string) {
  must(await supabase.from('follows').insert({ follower_id: me, following_id: other }));
}

export async function unfollow(me: string, other: string) {
  must(await supabase.from('follows').delete().eq('follower_id', me).eq('following_id', other));
}

export async function listFriends(uid: string): Promise<Profile[]> {
  const rows = must(await supabase.from('friends').select('friend_id').eq('user_id', uid)) as { friend_id: string }[];
  if (!rows.length) return [];
  return must(
    await supabase
      .from('profiles')
      .select('*')
      .in(
        'id',
        rows.map((r) => r.friend_id),
      ),
  ) as Profile[];
}

// ---------------------------------------------------------------- уведомления
export async function listNotifications(uid: string): Promise<Notification[]> {
  return must(
    await supabase
      .from('notifications')
      .select('*, actor:profiles!notifications_actor_id_fkey(id, display_name, username)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(100),
  ) as Notification[];
}

export async function unreadCount(uid: string) {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uid)
    .is('read_at', null);
  return count ?? 0;
}

export async function markAllRead(uid: string) {
  must(
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid).is('read_at', null),
  );
}
