/**
 * Achour Player TV Spatial Navigation & Remote Control Engine (D-Pad & Keyboard)
 * Supports Android TV, Fire TV Stick (incl. 1st Gen 4K / Fire OS 6), Smart TVs, and standard keyboard navigation.
 */

export type TVDirection = 'up' | 'down' | 'left' | 'right';

export type TVAction =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'SELECT'
  | 'BACK'
  | 'PLAY_PAUSE'
  | 'PLAY'
  | 'PAUSE'
  | 'STOP'
  | 'FAST_FORWARD'
  | 'REWIND'
  | 'CHANNEL_UP'
  | 'CHANNEL_DOWN'
  | 'MENU'
  | 'INFO'
  | 'RED'
  | 'GREEN'
  | 'YELLOW'
  | 'BLUE'
  | 'OTHER';

/**
 * Detects whether the app is running inside a native Capacitor/Android shell.
 */
export function isNativeCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  try {
    if (w.Capacitor?.isNativePlatform?.()) return true;
    const platform = w.Capacitor?.getPlatform?.() || w.Capacitor?.platform;
    if (platform && platform !== 'web') return true;
    if (w.AchourNative || w.Android) return true;
  } catch {
    // ignore
  }
  return false;
}

/**
 * Detects Fire TV Stick, Android TV, or low-RAM / reduced-motion environments
 * to apply aggressive compositor & memory optimizations without affecting phones/desktop.
 */
let cachedLowEndTV: boolean | null = null;
export function isTVOrLowEndDevice(): boolean {
  if (cachedLowEndTV !== null) return cachedLowEndTV;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  let nativeTv = false;
  try {
    nativeTv = Boolean((window as any).AchourNative?.isTvDevice?.());
  } catch {
    nativeTv = false;
  }

  const ua = navigator.userAgent || '';
  const isFireOrAndroidTV =
    nativeTv ||
    /AFT[A-Z0-9]*|Fire\s?TV|Amazon|Silk\/|Android\s?TV|GoogleTV|MIBOX|BRAVIA|SHIELD|SmartTV|Tizen|Web0S|CrKey/i.test(ua);

  const mem = (navigator as any).deviceMemory as number | undefined;
  const cores = navigator.hardwareConcurrency || 8;
  const isLowSpecAndroid = /Android/i.test(ua) && ((typeof mem === 'number' && mem <= 2) || cores <= 4);

  let hasCoarseTouch = false;
  let reducedMotion = false;
  try {
    hasCoarseTouch = window.matchMedia?.('(pointer: coarse)')?.matches || false;
    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
  } catch {
    hasCoarseTouch = false;
    reducedMotion = false;
  }

  const isLargeNativeTvScreen =
    isNativeCapacitorApp() &&
    Math.max(window.innerWidth, window.innerHeight) >= 960 &&
    (!hasCoarseTouch || (/Android/i.test(ua) && Math.min(window.innerWidth, window.innerHeight) >= 520));

  cachedLowEndTV = isFireOrAndroidTV || isLowSpecAndroid || isLargeNativeTvScreen || reducedMotion;
  return cachedLowEndTV;
}

// Map Android TV, Fire TV, Tizen, WebOS, and Browser key codes to standard TV actions
export function parseTVKeyEvent(e: KeyboardEvent): TVAction {
  const code = e.keyCode;
  const key = e.key;

  if (key === 'ArrowUp' || code === 19 || code === 38) return 'UP';
  if (key === 'ArrowDown' || code === 20 || code === 40) return 'DOWN';
  if (key === 'ArrowLeft' || code === 21 || code === 37) return 'LEFT';
  if (key === 'ArrowRight' || code === 22 || code === 39) return 'RIGHT';

  if (
    key === 'Enter' ||
    key === 'Select' ||
    key === 'Ok' ||
    code === 23 ||
    code === 13 ||
    (key === ' ' && !isTextInput(document.activeElement))
  ) {
    return 'SELECT';
  }

  if (
    key === 'Escape' ||
    key === 'Back' ||
    key === 'GoBack' ||
    code === 4 ||
    code === 27 ||
    code === 10009 ||
    code === 461 ||
    (key === 'Backspace' && !isTextInput(document.activeElement))
  ) {
    return 'BACK';
  }

  if (key === 'MediaPlayPause' || code === 179) return 'PLAY_PAUSE';
  if (key === 'MediaPlay' || code === 126 || key === 'Play') return 'PLAY';
  if (key === 'MediaPause' || code === 127 || key === 'Pause') return 'PAUSE';
  if (key === 'MediaStop' || code === 86 || key === 'Stop') return 'STOP';
  if (key === 'MediaFastForward' || code === 228 || code === 90 || key === 'FastFwd') return 'FAST_FORWARD';
  if (key === 'MediaRewind' || code === 227 || code === 89 || key === 'Rewind') return 'REWIND';

  if (key === 'ChannelUp' || code === 166 || code === 427 || code === 33 || key === 'PageUp') return 'CHANNEL_UP';
  if (key === 'ChannelDown' || code === 167 || code === 428 || code === 34 || key === 'PageDown') return 'CHANNEL_DOWN';

  if (key === 'Menu' || code === 82 || key === 'ContextMenu' || code === 93) return 'MENU';

  if (code === 403 || key === 'ColorF0Red' || key === 'r' || key === 'F1') return 'RED';
  if (code === 404 || key === 'ColorF1Green' || key === 'g' || key === 'F2') return 'GREEN';
  if (code === 405 || key === 'ColorF2Yellow' || key === 'y' || key === 'F3') return 'YELLOW';
  if (code === 406 || key === 'ColorF3Blue' || key === 'b' || key === 'F4') return 'BLUE';

  return 'OTHER';
}

export function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName?.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (el.getAttribute('contenteditable') === 'true') return true;
  return false;
}

export enum BackPriority {
  ROOT = 0,
  DASHBOARD = 10,
  VIEW = 20,
  SUBVIEW = 50,
  MODAL = 100,
  PLAYER = 150,
}

type BackHandler = () => boolean;

interface RegisteredHandler {
  id: number;
  priority: number;
  handler: BackHandler;
  registeredAt: number;
}

let nextHandlerId = 1;
let backHandlers: RegisteredHandler[] = [];
let lastBackExecutionTime = 0;

export function pushBackHandler(handler: BackHandler, priority: number = BackPriority.VIEW): () => void {
  const id = nextHandlerId++;
  const item: RegisteredHandler = {
    id,
    priority,
    handler,
    registeredAt: Date.now(),
  };
  backHandlers.push(item);

  return () => {
    backHandlers = backHandlers.filter((h) => h.id !== id);
  };
}

export function executeBackHandler(): boolean {
  const now = Date.now();
  if (now - lastBackExecutionTime < 250) {
    return true;
  }

  if (backHandlers.length === 0) {
    return false;
  }

  const sorted = [...backHandlers].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.registeredAt - a.registeredAt;
  });

  for (const item of sorted) {
    try {
      if (item.handler()) {
        lastBackExecutionTime = now;
        return true;
      }
    } catch (e) {
      console.error('[BackHandler] Error executing back handler:', e);
    }
  }

  return false;
}

// =========================================================================
// UNIFIED SINGLE-FOCUS CONTROLLER
// Guarantees strictly ONE element on screen holds `data-tv-active-focus="true"`
// Eliminates stale/ghost focus rings on Android WebView / Fire TV Stick
// =========================================================================

let activeTVFocusEl: HTMLElement | null = null;
let focusSyncInitialized = false;

// =========================================================================
// GLOBAL LONG-PRESS MODAL PROTECTION (Fire TV / Android TV / Google TV / Box)
// Prevents held OK / DPAD_CENTER key-repeats, delayed keyup releases, or
// Android WebView synthetic clicks from immediately activating a newly focused
// modal button or triggering a backdrop close right after a long-press.
// =========================================================================
let longPressModalOpenedUntil = 0;
let awaitingLongPressKeyUp = false;
let isSelectOrMenuKeyHeld = false;
let longPressKeyUpTimer: ReturnType<typeof setTimeout> | null = null;

export function markLongPressModalOpened(graceMs: number = 700): void {
  const fromHeldKey = isSelectOrMenuKeyHeld;
  const effectiveGraceMs = fromHeldKey ? graceMs : Math.min(graceMs, 240);
  longPressModalOpenedUntil = Date.now() + effectiveGraceMs;
  awaitingLongPressKeyUp = fromHeldKey;
  if (longPressKeyUpTimer) {
    clearTimeout(longPressKeyUpTimer);
    longPressKeyUpTimer = null;
  }
  if (fromHeldKey) {
    // Hard safety cap so awaitingLongPressKeyUp can never remain stuck if keyup is dropped by WebView
    longPressKeyUpTimer = setTimeout(() => {
      awaitingLongPressKeyUp = false;
      isSelectOrMenuKeyHeld = false;
      longPressKeyUpTimer = null;
    }, Math.max(graceMs, 950));
  }
}

export function clearLongPressKeyUpPending(delayMs: number = 120): void {
  if (longPressKeyUpTimer) {
    clearTimeout(longPressKeyUpTimer);
    longPressKeyUpTimer = null;
  }
  isSelectOrMenuKeyHeld = false;
  if (delayMs <= 0) {
    awaitingLongPressKeyUp = false;
    return;
  }
  longPressKeyUpTimer = setTimeout(() => {
    awaitingLongPressKeyUp = false;
    longPressKeyUpTimer = null;
  }, delayMs);
}

export function isLongPressModalGraceActive(): boolean {
  return awaitingLongPressKeyUp || Date.now() < longPressModalOpenedUntil;
}

export function isSafeBackdropClick(
  e: { target: EventTarget | null; currentTarget: EventTarget | null },
  mountedAt: number,
  pointerStartedOnBackdrop: boolean,
  graceMs: number = 550
): boolean {
  if (!pointerStartedOnBackdrop) return false;
  if (e.target !== e.currentTarget) return false;
  if (Date.now() - mountedAt < graceMs) return false;
  if (isLongPressModalGraceActive()) return false;
  return true;
}

export function clearTVFocus(): void {
  if (typeof document === 'undefined') return;
  if (activeTVFocusEl) {
    activeTVFocusEl.removeAttribute('data-tv-active-focus');
    activeTVFocusEl = null;
  }
  const leftovers = document.querySelectorAll<HTMLElement>('[data-tv-active-focus="true"]');
  for (let i = 0; i < leftovers.length; i++) {
    leftovers[i].removeAttribute('data-tv-active-focus');
  }
}

export function syncActiveFocusElement(target: HTMLElement | null): void {
  if (typeof document === 'undefined') return;

  if (
    !target ||
    !target.isConnected ||
    target === document.body ||
    target === document.documentElement ||
    target.getAttribute('data-tv-no-ring') === 'true'
  ) {
    clearTVFocus();
    return;
  }

  if (activeTVFocusEl === target && target.getAttribute('data-tv-active-focus') === 'true') {
    return;
  }

  // Fast O(1) clear when tracking the previously focused element; full DOM fallback only on initial/detached state
  if (activeTVFocusEl && activeTVFocusEl !== target) {
    activeTVFocusEl.removeAttribute('data-tv-active-focus');
    if (!activeTVFocusEl.isConnected) {
      const existing = document.querySelectorAll<HTMLElement>('[data-tv-active-focus="true"]');
      for (let i = 0; i < existing.length; i++) {
        if (existing[i] !== target) {
          existing[i].removeAttribute('data-tv-active-focus');
        }
      }
    }
  } else if (!activeTVFocusEl) {
    const existing = document.querySelectorAll<HTMLElement>('[data-tv-active-focus="true"]');
    for (let i = 0; i < existing.length; i++) {
      if (existing[i] !== target) {
        existing[i].removeAttribute('data-tv-active-focus');
      }
    }
  }

  activeTVFocusEl = target;
  if (target.getAttribute('data-tv-active-focus') !== 'true') {
    target.setAttribute('data-tv-active-focus', 'true');
  }
}

export function getCurrentTVFocus(): HTMLElement | null {
  if (activeTVFocusEl && activeTVFocusEl.isConnected) return activeTVFocusEl;
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body && active !== document.documentElement) return active;
  return null;
}

export function setTVFocus(
  target: HTMLElement | null,
  options: { scroll?: boolean; skipLayoutCheck?: boolean } = { scroll: true }
): boolean {
  if (!target || !target.isConnected) {
    return false;
  }
  if (!options.skipLayoutCheck && !isFocusable(target)) {
    return false;
  }

  if (
    activeTVFocusEl === target &&
    document.activeElement === target &&
    target.getAttribute('data-tv-active-focus') === 'true'
  ) {
    return true;
  }

  // Read layout metrics & compute scroll delta BEFORE mutating attributes/focus to avoid forced synchronous reflow
  let scrollPlan: { container: HTMLElement; top: number | null; left: number | null } | null = null;

  if (options.scroll !== false) {
    try {
      const explicitContainer = target.closest<HTMLElement>('[data-tv-scroll-container="true"]');
      const computeContainerScroll = (p: HTMLElement) => {
        const hasOverflowY = p.scrollHeight > p.clientHeight + 2;
        const hasOverflowX = p.scrollWidth > p.clientWidth + 2;
        if (!hasOverflowY && !hasOverflowX) return null;
        const pRect = p.getBoundingClientRect();
        const tRect = target.getBoundingClientRect();
        let top: number | null = null;
        let left: number | null = null;
        if (hasOverflowY && pRect.height > 0) {
          const scaleY = p.clientHeight / pRect.height;
          const topRel = (tRect.top - pRect.top) * scaleY;
          const botRel = (tRect.bottom - pRect.top) * scaleY;
          if (topRel < 8) {
            top = Math.max(0, p.scrollTop + topRel - 8);
          } else if (botRel + 8 > p.clientHeight) {
            top = Math.max(0, p.scrollTop + botRel + 8 - p.clientHeight);
          }
        }
        if (hasOverflowX && pRect.width > 0) {
          const scaleX = p.clientWidth / pRect.width;
          const leftRel = (tRect.left - pRect.left) * scaleX;
          const rightRel = (tRect.right - pRect.left) * scaleX;
          if (leftRel < 8) {
            left = Math.max(0, p.scrollLeft + leftRel - 8);
          } else if (rightRel + 8 > p.clientWidth) {
            left = Math.max(0, p.scrollLeft + rightRel + 8 - p.clientWidth);
          }
        }
        return { container: p, top, left };
      };

      if (explicitContainer) {
        scrollPlan = computeContainerScroll(explicitContainer);
      } else {
        let p = target.parentElement;
        while (p && p !== document.body && p !== document.documentElement) {
          if (
            !p.classList.contains('achour-app-shell') &&
            !p.hasAttribute('data-live-root')
          ) {
            const hasOverflowY = p.scrollHeight > p.clientHeight + 2;
            const hasOverflowX = p.scrollWidth > p.clientWidth + 2;
            if (hasOverflowY || hasOverflowX) {
              const cs = window.getComputedStyle(p);
              const canScrollY = hasOverflowY && (cs.overflowY === 'auto' || cs.overflowY === 'scroll');
              const canScrollX = hasOverflowX && (cs.overflowX === 'auto' || cs.overflowX === 'scroll');
              if (canScrollY || canScrollX) {
                scrollPlan = computeContainerScroll(p);
                break;
              }
            }
          }
          p = p.parentElement;
        }
      }
    } catch {
      // ignore older WebView scroll errors
    }
  }

  // Apply all DOM mutations together after reads
  syncActiveFocusElement(target);

  if (document.activeElement !== target) {
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }

  if (options.scroll !== false) {
    try {
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
      if (scrollPlan) {
        if (scrollPlan.top !== null && scrollPlan.container.scrollTop !== scrollPlan.top) {
          scrollPlan.container.scrollTop = scrollPlan.top;
        }
        if (scrollPlan.left !== null && scrollPlan.container.scrollLeft !== scrollPlan.left) {
          scrollPlan.container.scrollLeft = scrollPlan.left;
        }
      }
    } catch {
      // ignore
    }
  }

  return true;
}

export function initGlobalFocusSync(): () => void {
  if (typeof document === 'undefined' || focusSyncInitialized) {
    return () => {};
  }
  focusSyncInitialized = true;

  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && target instanceof HTMLElement) {
      syncActiveFocusElement(target);
    }
  };

  const onFocusOut = (e: FocusEvent) => {
    const next = e.relatedTarget as HTMLElement | null;
    if (!next || next === document.body) {
      // Clean up if previous focused element detached or focus dropped
      if (activeTVFocusEl && !activeTVFocusEl.isConnected) {
        clearTVFocus();
      }
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    const raw = e.target as HTMLElement | null;
    if (!raw) return;
    const interactive = raw.closest<HTMLElement>(
      'button, [role="button"], [data-tv-focusable="true"], input, select, textarea, a[href], [tabindex="0"]'
    );
    if (interactive) {
      if (interactive.closest('[data-tv-modal="true"], [role="dialog"]')) {
        awaitingLongPressKeyUp = false;
        isSelectOrMenuKeyHeld = false;
        longPressModalOpenedUntil = 0;
        if (longPressKeyUpTimer) {
          clearTimeout(longPressKeyUpTimer);
          longPressKeyUpTimer = null;
        }
      }
      syncActiveFocusElement(interactive);
    } else {
      clearTVFocus();
    }
  };

  const onGlobalKeyDownCapture = (e: KeyboardEvent) => {
    const action = parseTVKeyEvent(e);
    if (action === 'SELECT' || action === 'MENU') {
      isSelectOrMenuKeyHeld = true;
    }
  };

  const onGlobalKeyUpCapture = (e: KeyboardEvent) => {
    const action = parseTVKeyEvent(e);
    if (action === 'SELECT' || action === 'MENU') {
      isSelectOrMenuKeyHeld = false;
      if (awaitingLongPressKeyUp) {
        clearLongPressKeyUpPending(140);
      }
    }
  };

  const onWindowBlur = () => {
    isSelectOrMenuKeyHeld = false;
    awaitingLongPressKeyUp = false;
    if (longPressKeyUpTimer) {
      clearTimeout(longPressKeyUpTimer);
      longPressKeyUpTimer = null;
    }
  };

  const onGlobalClickCapture = (e: MouseEvent) => {
    if (!isLongPressModalGraceActive()) return;
    // Block ONLY synthetic clicks (e.detail === 0) fired by Android TV / Fire TV WebView upon releasing a held OK button
    if (e.detail === 0) {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-tv-modal="true"], [role="dialog"]')) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };

  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onGlobalKeyDownCapture, true);
  window.addEventListener('keyup', onGlobalKeyUpCapture, true);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('click', onGlobalClickCapture, true);

  return () => {
    focusSyncInitialized = false;
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onGlobalKeyDownCapture, true);
    window.removeEventListener('keyup', onGlobalKeyUpCapture, true);
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('click', onGlobalClickCapture, true);
  };
}

/**
 * Determines whether an element is visible, enabled, and eligible for TV focus
 */
export function isFocusable(el: HTMLElement): boolean {
  if (
    !el ||
    !el.isConnected ||
    el.tabIndex < 0 ||
    el.hasAttribute('disabled') ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.getAttribute('aria-hidden') === 'true' ||
    el.getAttribute('data-tv-ignore') === 'true' ||
    el.getAttribute('data-tv-focusable') === 'false' ||
    el.getAttribute('data-tv-back-btn') === 'true' ||
    el.title === 'رجوع' ||
    el.title === 'Back'
  ) {
    return false;
  }

  if (el.offsetWidth === 0 && el.offsetHeight === 0 && el.offsetParent === null) {
    return false;
  }

  return true;
}

/**
 * Queries all focusable elements inside a root container, honoring modal trapping
 */
export function getFocusableCandidates(root: HTMLElement = document.body): HTMLElement[] {
  const activeModal =
    document.querySelector<HTMLElement>('[role="dialog"]:not([aria-hidden="true"])') ||
    document.querySelector<HTMLElement>('.vod-popup-container, .vod-drawer-container') ||
    document.querySelector<HTMLElement>('[data-tv-modal="true"]');

  const container = activeModal && activeModal.contains(root) ? activeModal : activeModal || root;

  const selector = `
    button,
    [role="button"],
    [data-tv-focusable="true"],
    input:not([type="hidden"]),
    select,
    textarea,
    a[href],
    [tabindex="0"]
  `;

  const candidates = Array.from(container.querySelectorAll<HTMLElement>(selector));
  return candidates.filter((el) => (
    Boolean(el) &&
    el.isConnected &&
    el.tabIndex >= 0 &&
    !el.hasAttribute('disabled') &&
    el.getAttribute('aria-disabled') !== 'true' &&
    el.getAttribute('aria-hidden') !== 'true' &&
    el.getAttribute('data-tv-ignore') !== 'true' &&
    el.getAttribute('data-tv-focusable') !== 'false' &&
    el.getAttribute('data-tv-back-btn') !== 'true' &&
    el.title !== 'رجوع' &&
    el.title !== 'Back'
  ));
}

export function getFocusableElements(root: HTMLElement = document.body): HTMLElement[] {
  return getFocusableCandidates(root).filter(isFocusable);
}

/**
 * 2D Geometric Spatial Navigation with unified focus handoff and fast anti-queue throttle
 */
let lastNavTime = 0;

export function navigateSpatial(
  direction: TVDirection,
  root: HTMLElement = document.body,
  customCurrent?: HTMLElement | null
): boolean {
  const now = Date.now();
  const minInterval = isTVOrLowEndDevice() ? 22 : 16;
  if (now - lastNavTime < minInterval) {
    return true;
  }
  lastNavTime = now;

  const current = customCurrent || getCurrentTVFocus();
  const candidates = getFocusableCandidates(root);

  if (candidates.length === 0) return false;

  if (!current || current === document.body || !current.isConnected || !candidates.includes(current)) {
    const firstVisible = candidates.find(isFocusable);
    return firstVisible ? setTVFocus(firstVisible, { scroll: true, skipLayoutCheck: true }) : false;
  }

  let currentRect: DOMRect;
  try {
    currentRect = current.getBoundingClientRect();
  } catch {
    const firstVisible = candidates.find(isFocusable);
    return firstVisible ? setTVFocus(firstVisible, { scroll: true, skipLayoutCheck: true }) : false;
  }
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentCenterY = currentRect.top + currentRect.height / 2;

  let bestCandidate: HTMLElement | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate === current || !candidate.isConnected) continue;

    let candRect: DOMRect;
    try {
      candRect = candidate.getBoundingClientRect();
    } catch {
      continue;
    }
    if (candRect.width === 0 && candRect.height === 0) continue;
    const candCenterX = candRect.left + candRect.width / 2;
    const candCenterY = candRect.top + candRect.height / 2;

    const dx = candCenterX - currentCenterX;
    const dy = candCenterY - currentCenterY;

    let isStrictlyInDirection = false;
    let mainDist = 0;
    let crossDist = 0;

    switch (direction) {
      case 'up':
        isStrictlyInDirection = candRect.bottom <= currentRect.bottom + 4 && dy < -2;
        mainDist = -dy;
        crossDist = Math.abs(dx);
        break;
      case 'down':
        isStrictlyInDirection = candRect.top >= currentRect.top - 4 && dy > 2;
        mainDist = dy;
        crossDist = Math.abs(dx);
        break;
      case 'left':
        isStrictlyInDirection = candRect.right <= currentRect.right + 4 && dx < -2;
        mainDist = -dx;
        crossDist = Math.abs(dy);
        break;
      case 'right':
        isStrictlyInDirection = candRect.left >= currentRect.left - 4 && dx > 2;
        mainDist = dx;
        crossDist = Math.abs(dy);
        break;
    }

    if (!isStrictlyInDirection) continue;

    let overlap = 0;
    if (direction === 'up' || direction === 'down') {
      const overlapStart = Math.max(currentRect.left, candRect.left);
      const overlapEnd = Math.min(currentRect.right, candRect.right);
      overlap = Math.max(0, overlapEnd - overlapStart);
    } else {
      const overlapStart = Math.max(currentRect.top, candRect.top);
      const overlapEnd = Math.min(currentRect.bottom, candRect.bottom);
      overlap = Math.max(0, overlapEnd - overlapStart);
    }

    const overlapWeight = overlap > 0 ? 0.3 : 1.0;
    const score = (mainDist * 1.0 + crossDist * 2.2) * overlapWeight;

    if (score < bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (bestCandidate) {
    return setTVFocus(bestCandidate, { scroll: true, skipLayoutCheck: true });
  }

  return false;
}

/**
 * Ensures a container has an active focused element on mount
 */
export function ensureInitialFocus(container?: HTMLElement | null): HTMLElement | null {
  const root = container || document.body;
  const focusables = getFocusableElements(root);
  if (focusables.length > 0) {
    const target = focusables[0];
    setTVFocus(target, { scroll: false });
    return target;
  }
  return null;
}
