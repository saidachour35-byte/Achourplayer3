
import React, { useMemo } from 'react';
import { AppSettings } from '../types';
import { APP_BACKGROUNDS } from '../utils/themeManager';

export default function AnimatedBackground({ settings }: { settings?: AppSettings | any }) {
  const customBg = settings?.customBackground;
  const customUrl =
    typeof customBg === 'string' && customBg.trim()
      ? customBg.trim()
      : customBg && typeof customBg === 'object' && customBg.url
      ? String(customBg.url)
      : null;
  const isCustomVideo =
    Boolean(customBg && typeof customBg === 'object' && customBg.type === 'video' && customUrl);

  const bgConfig = useMemo(() => {
    const styleId = settings?.backgroundStyle || 'bg-raouche-rocks-beirut';
    return APP_BACKGROUNDS.find((b) => b.id === styleId) || APP_BACKGROUNDS[0];
  }, [settings?.backgroundStyle]);

  const activeImageUrl = customUrl && !isCustomVideo ? customUrl : bgConfig?.imageUrl || null;

  // Existing black dimming control (0% = natural photo, 100% = fully dimmed)
  const dimmingOpacity =
    typeof settings?.backgroundOpacity === 'number' && !Number.isNaN(settings.backgroundOpacity)
      ? Math.max(0, Math.min(100, settings.backgroundOpacity)) / 100
      : 0.62;

  // Theme color overlay intensity (0% = disabled, 100% = maximum tint)
  const tintOpacity =
    typeof settings?.backgroundTintOpacity === 'number' &&
    !Number.isNaN(settings.backgroundTintOpacity)
      ? Math.max(0, Math.min(100, settings.backgroundTintOpacity)) / 100
      : 0.18;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#020205]"
      style={{ background: bgConfig?.previewGradient || '#020205' }}
    >
      {isCustomVideo && customUrl ? (
        <video
          key={customUrl}
          src={customUrl}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        activeImageUrl && (
          <img
            key={activeImageUrl}
            src={activeImageUrl}
            alt={bgConfig?.nameEn || 'Background'}
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
          />
        )
      )}

      {/* Existing black dimming overlay */}
      <div
        className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-300"
        style={{ opacity: dimmingOpacity }}
      />

      {/* Dynamic transparent overlay using the currently selected app theme */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-300"
        style={{
          backgroundColor: 'rgba(var(--theme-rgb, 212, 175, 55), 1)',
          opacity: tintOpacity,
        }}
      />
    </div>
  );
}
