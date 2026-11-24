// Playlist Subscription & Expiry Utility for Achour Player
import { Language, Playlist } from '../types';
import { getPlatformUrl } from './platform';

export interface ParsedExpiryInfo {
  hasDate: boolean;
  formattedDate: string;
  isExpired: boolean;
  daysRemaining?: number;
}

export const parseExpiryDate = (
  expDate: string | number | null | undefined,
  language: Language = 'en'
): ParsedExpiryInfo => {
  if (expDate === null || expDate === undefined) {
    return { hasDate: false, formattedDate: '', isExpired: false };
  }

  const raw = String(expDate).trim();
  if (!raw || raw === '0' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'unlimited') {
    return { hasDate: false, formattedDate: '', isExpired: false };
  }

  let dateObj: Date | null = null;
  if (/^\d+$/.test(raw)) {
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      const ms = raw.length <= 10 ? num * 1000 : num;
      dateObj = new Date(ms);
    }
  } else {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      dateObj = new Date(parsed);
    }
  }

  if (!dateObj || Number.isNaN(dateObj.getTime())) {
    return { hasDate: false, formattedDate: '', isExpired: false };
  }

  const now = Date.now();
  const diffMs = dateObj.getTime() - now;
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const locale = language === 'ar' ? 'ar-EG' : language === 'fr' ? 'fr-FR' : 'en-GB';
  let formattedDate = '';
  try {
    formattedDate = dateObj.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    formattedDate = dateObj.toISOString().slice(0, 10);
  }

  return {
    hasDate: true,
    formattedDate,
    isExpired: diffMs < 0,
    daysRemaining
  };
};

export const fetchLiveSubscriptionExpiry = async (
  playlist: Playlist
): Promise<string | number | null> => {
  if (!playlist || playlist.type !== 'xtream' || !playlist.url || !playlist.username || !playlist.password) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const fetchUrl = getPlatformUrl('xtream', playlist.url, {
      username: playlist.username,
      password: playlist.password,
      action: 'auth'
    });
    const res = await fetch(fetchUrl, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const exp = data?.user_info?.exp_date;
    return exp !== undefined && exp !== null && String(exp).trim() !== '' ? exp : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
