
// Favorites persistence helpers

const FAVORITES_STORAGE_KEY = 'achour_live_favorites';
const FAVORITES_CHANGED_EVENT = 'achour_live_favorites_changed';

const getPlaylistKey = (playlistId?: string): string => {
  const id = String(playlistId || '').trim();
  return id && id !== 'default'
    ? `${FAVORITES_STORAGE_KEY}_${id}`
    : FAVORITES_STORAGE_KEY;
};

const readFavorites = (playlistId?: string): string[] => {
  if (typeof window === 'undefined') return [];

  try {
    const saved = localStorage.getItem(getPlaylistKey(playlistId));
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return [...new Set(
      parsed.map((id: any) => String(id || '').trim()).filter(Boolean)
    )];
  } catch (error) {
    console.warn('[Favorites] Read error:', error);
    return [];
  }
};

const saveFavorites = (
  ids: string[],
  playlistId?: string
): string[] => {
  const cleanIds = [...new Set(
    ids.map(id => String(id || '').trim()).filter(Boolean)
  )];

  if (typeof window === 'undefined') return cleanIds;

  try {
    const key = getPlaylistKey(playlistId);
    localStorage.setItem(key, JSON.stringify(cleanIds));

    window.dispatchEvent(
      new CustomEvent(FAVORITES_CHANGED_EVENT, {
        detail: { key, ids: cleanIds }
      })
    );
  } catch (error) {
    console.warn('[Favorites] Save error:', error);
  }

  return cleanIds;
};

// Live TV favorites only
export const getLocalFavoriteIds = (
  playlistId?: string
): string[] => {
  return readFavorites(playlistId);
};

// VOD favorites remain disabled
export const getLocalVodFavoriteIds = (...args: any[]) => [] as string[];

export const toggleVodFavorite = (...args: any[]) => [];

// Toggle a live channel favorite
export const toggleFavorite = (
  userId: string | undefined,
  streamId: string,
  playlistId?: string,
  metadata?: any
): string[] => {
  const id = String(streamId || '').trim();
  if (!id) return readFavorites(playlistId);

  const current = readFavorites(playlistId);

  const next = current.includes(id)
    ? current.filter(item => item !== id)
    : [...current, id];

  return saveFavorites(next, playlistId);
};

export const toggleFavoriteService = toggleFavorite;

// Listen for live favorites changes
export const subscribeFavorites = (
  userId: string | undefined,
  playlistId: string | undefined,
  callback: (ids: string[]) => void
): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  const key = getPlaylistKey(playlistId);

  const handleChange = (event: Event) => {
    const detail = (event as CustomEvent).detail;

    if (detail?.key === key) {
      callback(
        Array.isArray(detail.ids) ? detail.ids : readFavorites(playlistId)
      );
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === key) {
      callback(readFavorites(playlistId));
    }
  };

  window.addEventListener(FAVORITES_CHANGED_EVENT, handleChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(FAVORITES_CHANGED_EVENT, handleChange);
    window.removeEventListener('storage', handleStorage);
  };
};

// Keep the existing function available without Firestore synchronization
export const syncFavoritesFromFirestore = async (...args: any[]) => {
  return readFavorites(args[1]);
};
