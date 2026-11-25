'use client';

import { useEffect, useRef } from 'react';

const source = '/ns/audio/changhuijiakankan.mp3';

export default function NsAudio() {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const player = ref.current;
    if (!player?.isConnected) return;

    // React can create and discard detached host nodes during route rendering.
    // Native autoPlay would start those too, outside the visible player's controls.
    // Start only the committed instance; never retry after a user pause/denial.
    // Native controls can be used before hydration; don't reset or resume them.
    if (!(player.currentTime > 0) && player.paused !== false) {
      player.src = source;
      void player.play().catch(() => { /* Browser policy: keep manual controls usable. */ });
    }

    return () => {
      player.pause();
      player.removeAttribute('src');
      player.load(); // Abort pending play/load and release the detached media source.
    };
  }, []);

  return <audio ref={ref} controls preload="metadata" src={source}>你的浏览器不支持音频播放。</audio>;
}
