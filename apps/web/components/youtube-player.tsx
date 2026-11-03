"use client";

import { useEffect, useRef } from "react";

type YouTubePlayerInstance = {
  getCurrentTime(): number;
  destroy(): void;
};

type YouTubePlayerConstructor = new (
  element: HTMLElement,
  options: {
    videoId: string;
    playerVars: Record<string, string | number>;
    events: {
      onReady: (event: { target: YouTubePlayerInstance }) => void;
      onError: () => void;
    };
  },
) => YouTubePlayerInstance;

declare global {
  interface Window {
    YT?: { Player: YouTubePlayerConstructor };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiReady: Promise<void> | undefined;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiReady) return apiReady;

  apiReady = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Não foi possível carregar o player do YouTube."));
    window.onYouTubeIframeAPIReady = resolve;
    document.head.appendChild(script);
  });
  return apiReady;
}

export function YouTubePlayer({
  videoId,
  onTime,
  onError,
}: {
  videoId: string;
  onTime: (time: number) => void;
  onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let player: YouTubePlayerInstance | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    void loadYouTubeApi()
      .then(() => {
        if (cancelled || !host.current || !window.YT) return;
        player = new window.YT.Player(host.current, {
          videoId,
          playerVars: {
            enablejsapi: 1,
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: ({ target }) => {
              timer = setInterval(() => {
                const time = target.getCurrentTime();
                if (Number.isFinite(time)) onTime(time);
              }, 400);
            },
            onError,
          },
        });
      })
      .catch(onError);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      player?.destroy();
    };
  }, [videoId, onError, onTime]);

  return <div ref={host} className="embed-frame" aria-label="Player oficial do YouTube" />;
}
