// Xtream Codes Diagnostics Utility for Achour Player
import { getPlatformUrl } from './platform';

export interface XtreamConnectionTestResult {
  success: boolean;
  isSuccess: boolean;
  error?: string;
  userInfo?: any;
}

export const testXtreamConnection = async (
  host: string,
  username: string,
  password: string
): Promise<XtreamConnectionTestResult> => {
  if (!host || !username || !password) {
    return { success: false, isSuccess: false, error: 'Missing credentials' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const cleanHost = host
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/(player_api|get|index)\.php.*$/i, '')
      .replace(/\/c\/?$/i, '')
      .replace(/\?.*$/, '');

    const fetchUrl = getPlatformUrl('xtream', cleanHost, {
      username: username.trim(),
      password: password.trim(),
      action: 'auth'
    });

    const res = await fetch(fetchUrl, { signal: controller.signal });
    if (!res.ok) {
      return { success: false, isSuccess: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const authOk = data?.user_info?.auth === 1 || data?.user_info?.auth === '1' || data?.user_info?.status === 'Active';
    if (authOk || data?.user_info) {
      return { success: true, isSuccess: true, userInfo: data.user_info };
    }
    return { success: false, isSuccess: false, error: 'Invalid Xtream response' };
  } catch (err: any) {
    return {
      success: false,
      isSuccess: false,
      error: err?.name === 'AbortError' ? 'Timeout' : (err?.message || 'Connection failed')
    };
  } finally {
    clearTimeout(timer);
  }
};

export const diagnoseXtreamHistory = async (..._args: any[]) => {};
export const addToDiagnosticHistory = (..._args: any[]) => {};
