// Shared icon style prop types
import React from 'react';

export interface StyledIconProps {
  sizePx?: number;
  className?: string;
}

export const ICON_ROOT_STYLE: React.CSSProperties = {
  color: 'var(--theme-primary, #D4AF37)',
};
