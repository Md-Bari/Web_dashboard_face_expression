'use client';

import React, { useState } from 'react';

const PALETTE = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1'];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

interface AvatarProps {
  name: string;
  src?: string;
  className?: string;
  /** Tailwind classes applied to the <img>; the fallback fills the same box. */
  imgClassName?: string;
}

/** Photo avatar that falls back to coloured initials when the URL is empty or fails to load (offline, blocked CDN). */
export function Avatar({ name, src, className = '', imgClassName = '' }: AvatarProps) {
  // Remember which URL failed, so a new src (e.g. the next live frame) is tried again
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    const color = PALETTE[(name.charCodeAt(0) || 0) % PALETTE.length];
    return (
      <div
        className={`flex items-center justify-center text-white font-bold select-none ${className}`}
        style={{ backgroundColor: color }}
        aria-label={name}
      >
        {initials(name) || '?'}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className={`${className} ${imgClassName}`}
    />
  );
}
