
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

  // backgroundOpacity controls the dark dimming scrim overlay (0% = natural photo, 62% = balanced default, 100% = full dim)
  const dimmingOpacity =
    typeof settings?.backgroundOpacity === 'number' && !Number.isNaN(settings.backgroundOpacity)
      ? Math.max(0, Math.min(100, settings.backgroundOpacity)) / 100
      : 0.62;

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
      <div
        className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-300"
        style={{ opacity: dimmingOpacity }}
      />
    </div>
  );
}
