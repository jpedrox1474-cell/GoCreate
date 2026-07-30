import React, { useEffect, useRef } from 'react';

/**
 * Full-bleed looping background video served same-origin.
 * Use z-0 / fixed — never -z-10 under an opaque parent bg.
 */
export default function VideoBackground({ variant = 'light' }) {
  const videoRef = useRef(null);
  const isLight = variant === 'light';

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.setAttribute('muted', '');
    const tryPlay = () => {
      const p = el.play();
      if (p?.catch) p.catch(() => {});
    };
    tryPlay();
    el.addEventListener('canplay', tryPlay);
    return () => el.removeEventListener('canplay', tryPlay);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <video
        ref={videoRef}
        className="gocreate-bg-video absolute inset-0 h-full w-full object-cover scale-[1.06] origin-center"
        src="/bg-video.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      <div
        className={`absolute inset-0 ${
          isLight ? 'gocreate-video-overlay-light' : 'gocreate-video-overlay'
        }`}
      />
      {/* Extra belt: hide any residual stock-video corner mark */}
      <div
        className={`absolute bottom-0 right-0 h-16 w-20 ${
          isLight
            ? 'bg-gradient-to-tl from-white/70 via-white/25 to-transparent'
            : 'bg-gradient-to-tl from-zinc-950/80 via-zinc-950/30 to-transparent'
        }`}
      />
    </div>
  );
}
