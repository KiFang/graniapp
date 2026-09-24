export type Facet = 'stud' | 'inside' | 'into';
export type InstRole = 'president' | 'vice_president' | 'leader' | 'member' | 'guest';
export type InsideRole = 'founder' | 'leader';
export type CheckinMode = 'qr' | 'manual' | 'both';
export type RegStatus = 'registered' | 'checked_in' | 'cancelled' | 'no_show';
export type ItemKind = 'title' | 'frame' | 'sticker';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'special';

export type Permission =
  | 'manage_events'
  | 'check_in'
  | 'manage_games'
  | 'manage_matches'
  | 'manage_roles'
  | 'manage_shop'
  | 'manage_access';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  player_code: string;
  points: number;
  points_total: number;
  title_item_id: string | null;
  frame_item_id: string | null;
  card_theme: Record<string, unknown>;
  telegram_id: number | null;
  push_prefs: Record<string, boolean>;
  created_at: string;
}

export interface InsideStaff {
  user_id: string;
  role: InsideRole;
  permissions: Permission[];
  position_title: string | null;
  valid_until: string | null;
  created_at: string;
}

export interface Institution {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  city: string | null;
  logo_url: string | null;
  description: string;
  color_primary: string;
  color_secondary: string;
  color_accent: string;
  card_label: string;
}

export interface InstitutionMember {
  institution_id: string;
  user_id: string;
  role: InstRole;
  permissions: Permission[];
  guest_until: string | null;
  stud_display_name: string | null;
  stud_avatar_url: string | null;
  stud_bio: string | null;
  stud_title: string | null;
  club_id: string | null;
  position_title: string | null;
  valid_until: string | null;
  joined_at: string;
  institution?: Institution;
  profile?: Profile;
}

export interface LeaderboardInstitution extends Institution {
  total_points: number;
  members: number;
  events_held: number;
}

export interface Game {
  id: string;
  facet: Facet;
  institution_id: string | null;
  title: string;
  description: string;
  cover_url: string | null;
  min_players: number;
  max_players: number;
  play_minutes: number | null;
  is_pc: boolean;
  genre: string | null;
  platform: string | null;
}

/** Отзыв лидера на игру (Инто → Рекомендации) */
export interface GameReview {
  game_id: string;
  author_id: string;
  score: number; // 1–10
  difficulty: number; // 1–5
  review: string;
  tags: string[];
  updated_at: string;
  author?: Pick<Profile, 'id' | 'display_name' | 'username' | 'avatar_url'>;
}

export interface Recommendation extends Game {
  reviews: GameReview[];
  avgScore: number | null;
  avgDifficulty: number | null;
}

export interface GEvent {
  id: string;
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
  checkin_mode: CheckinMode;
  cover_url: string | null;
  host_id: string | null;
  created_by: string;
  game?: Pick<Game, 'id' | 'title'> | null;
  host?: Pick<Profile, 'id' | 'display_name' | 'username'> | null;
  registrations?: { count: number }[];
}

export interface Registration {
  event_id: string;
  user_id: string;
  status: RegStatus;
  checked_in_at: string | null;
  profile?: Pick<Profile, 'id' | 'display_name' | 'username' | 'avatar_url' | 'player_code'>;
}

export interface Rating {
  id: number;
  user_id: string;
  facet: Facet;
  institution_id: string | null;
  game_id: string | null;
  elo: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  profile?: Pick<Profile, 'id' | 'display_name' | 'username' | 'avatar_url'>;
}

export interface ShopItem {
  id: string;
  kind: ItemKind;
  name: string;
  description: string;
  price: number;
  rarity: Rarity;
  data: {
    text?: string;
    color?: string;
    gradient?: string[];
    glow?: boolean;
    colors?: string[];
    width?: number;
    spin?: boolean;
    emoji?: string;
    image_url?: string;
  };
  stock: number | null;
  code: string | null;
  purchasable: boolean;
}

export interface CardSticker {
  id: string;
  user_id: string;
  item_id: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  side: 'front' | 'back';
  z: number;
  item?: ShopItem;
}

export interface Notification {
  id: number;
  kind:
    | 'friend_registered'
    | 'followed_host_event'
    | 'event_reminder'
    | 'new_follower'
    | 'new_friend'
    | 'checked_in'
    | 'role_granted';
  actor_id: string | null;
  event_id: string | null;
  payload: Record<string, any>;
  read_at: string | null;
  created_at: string;
  actor?: Pick<Profile, 'id' | 'display_name' | 'username'> | null;
}
