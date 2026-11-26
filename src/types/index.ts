// Achour Player core TypeScript definitions (src/types/index.ts)

export type Language = 'ar' | 'en' | 'de' | 'fr';
export type TimeFormat = '12h' | '24h';
export type ViewMode = 'list' | 'grid';
export type PlaylistType = 'm3u' | 'xtream' | 'stalker' | 'portal';
export type VodSortBy = 'newest' | 'oldest' | 'alpha' | 'rating';
export type PosterSize = 'small' | 'medium' | 'large';
export type PosterFocusStyle = 'classic' | 'gallery-spotlight' | 'neon-glow';
export type LiveBarSize = 'default' | 'full' | 'compact';

export interface Channel {
  id: string;
  stream_id: string;
  name: string;
  logo?: string;
  stream_icon?: string;
  cover?: string;
  category: string;
  category_id: string;
  url: string;
  type: 'live' | 'movie' | 'series';
  isFavorite?: boolean;
  epg_channel_id?: string;
  tvg_id?: string;
  tvg_name?: string;
  container_extension?: string;
  series_id?: string;
  season_num?: number;
  episode_num?: number;
  category_name?: string;
  rating?: string | number;
  releaseDate?: string;
  added?: string | number;
  year?: string | number;
  duration?: string;
  plot?: string;
  orderIndex?: number;
}

export interface Playlist {
  id: string;
  name: string;
  type: PlaylistType;
  url?: string;
  portal?: string;
  username?: string;
  password?: string;
  macAddress?: string;
  m3uContent?: string;
  expDate?: string | number | null;
  userId?: string;
  isProtected?: boolean;
  pin?: string;
  epgUrl?: string;
}

export type IconDisplayMode = 'icons-only' | 'with-frames';
export type LegacyIconPackId = 'pack-3d' | 'pack-glass' | 'pack-metallic' | 'pack-neon' | 'pack-geometric';
export type IconPackId = LegacyIconPackId | (string & {});
export type LegacyFrameShapeId = 'circle' | 'rounded-square' | 'hexagon' | 'geometric' | 'glass' | 'metallic';
export type FrameShapeId = LegacyFrameShapeId | (string & {});

export interface WindowSizeScales {
  global?: number;
  details?: number;
  playerPopups?: number;
  confirm?: number;
  settings?: number;
  playlists?: number;
}

export interface AppSettings {
  language: Language;
  hiddenCategories: string[];
  hiddenLiveCategories: string[];
  hiddenMovieCategories: string[];
  hiddenSeriesCategories: string[];
  timeFormat: TimeFormat;
  viewMode: ViewMode;
  useExternalPlayer: boolean;
  externalPlayers: string[];
  selectedPlayer: string;
  installedPlayers: string[];
  activePlaylistId: string | null;
  searchHistory: {
    movies: string[];
    series: string[];
  };
  royalThemeColor?: string;
  customThemeColor?: string | null;
  icon3DStyle?: string;
  iconDisplayMode?: IconDisplayMode;
  iconPack?: IconPackId;
  frameShape?: FrameShapeId;
  glassOpacity?: number;
  glassBlur?: number;
  backgroundStyle?: string;
  backgroundOpacity?: number;
  customBackground?: string | { type: 'image' | 'video'; url: string; name: string; } | null;
  dashboardOrder?: string[];
  splashSoundTrack?: string;
  splashStyle?: string;
  iconScale?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  frameScale?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  tileSpacing?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  dashboardAlignment?: 'top' | 'center' | 'bottom';
  dashboardHorizontalAlignment?: 'left' | 'center' | 'right';
  zoomScale?: number;
  settingsScale?: number;
  livePageScale?: number;
  vodPageScale?: number;
  liveBarSize?: LiveBarSize;
  windowScales?: WindowSizeScales;
  multiViewFullSplit?: boolean;
  categoryOrders?: Record<string, string[]>;
  channelOrders?: Record<string, string[]>;
  parentalPassword?: string;
  seekStep?: 10 | 20 | 30;
  autoPlayLastChannel?: boolean;
  vodSortBy?: VodSortBy;
  posterSize?: PosterSize;
  showPosterTitles?: boolean;
  posterFocusStyle?: PosterFocusStyle;
  posterFocusIntensity?: number;
  dashboardFocusMode?: 'frame' | 'label' | 'both' | 'icon';
  dashboardLabelFocusGlow?: boolean;
  focusVisualStyle?: FocusVisualStyle;
  focusGlowEnabled?: boolean;
  focusGlowIntensity?: number;
  focusGlowSpread?: number;
  focusGlowPerStyle?: Partial<Record<FocusVisualStyle, FocusGlowConfig>>;
  dashboardLabelColorMode?: 'theme' | 'white' | 'gold' | 'custom';
  dashboardLabelCustomColor?: string | null;
}

export interface FocusGlowConfig {
  enabled?: boolean;
  intensity?: number;
  spread?: number;
}

export type FocusVisualStyle =
  | 'frameless-glow'
  | 'lamp-halo'
  | 'double-neon'
  | 'spotlight-pillar'
  | 'diamond-prism'
  | 'cyber-brackets'
  | 'aurora-capsule'
  | 'classic-ring'
  | 'inner-glow'
  | 'outer-glow'
  | 'combined-glow'
  | 'soft-glow'
  | 'pulse-edge';


export interface VodItem extends Channel {
  info?: any;
}

export interface SeriesEpisode {
  id: string;
  stream_id: string;
  name: string;
  title?: string;
  url: string;
  stream_url?: string;
  direct_source?: string;
  container_extension?: string;
  season_num?: number;
  episode_num?: number;
  info?: any;
}

export interface EPGProgram {
  start: string;
  stop: string;
  title: string;
  description?: string;
  channelId: string;
}

export interface EPGData {
  [channelId: string]: EPGProgram[];
}
