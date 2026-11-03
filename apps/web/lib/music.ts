export type TrackProvider = "youtube" | "spotify";

export type TrackPreview = {
  provider: TrackProvider;
  externalId: string;
  sourceUrl: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  videoId: string | null;
  lyrics: LyricsLine[];
  lyricsSource: string | null;
  lyricsStatus: "available" | "unconfigured" | "not-found" | "error";
  warning: string | null;
};

export type LyricsLine = {
  t: number | null;
  text: string;
};

export type Track = {
  id: string;
  user_id: string;
  provider: TrackProvider;
  external_id: string;
  source_url: string;
  title: string;
  artist: string | null;
  artwork_url: string | null;
  video_id: string | null;
  lyrics: LyricsLine[] | null;
  lyrics_source: string | null;
  created_at: string;
};

export type Playlist = {
  id: string;
  name: string;
};

export type PlaylistTrack = {
  playlist_id: string;
  track_id: string;
};

export function parseMusicUrl(input: string): {
  provider: TrackProvider;
  externalId: string;
  canonicalUrl: string;
} {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Cole um link válido do YouTube ou Spotify.");
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("O link precisa usar HTTPS e não pode conter credenciais.");
  }

  const host = url.hostname.toLowerCase();
  let provider: TrackProvider;
  let externalId = "";
  let canonicalUrl = "";

  if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    externalId = url.searchParams.get("v") ?? "";
    if (!externalId && segments.length >= 2 && ["shorts", "live"].includes(segments[0])) {
      externalId = segments[1];
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(externalId)) {
      throw new Error("O link precisa apontar para um vídeo ou música individual do YouTube.");
    }
    provider = "youtube";
    canonicalUrl = `https://www.youtube.com/watch?v=${externalId}`;
  } else if (["youtu.be", "www.youtu.be"].includes(host)) {
    externalId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!/^[A-Za-z0-9_-]{11}$/.test(externalId)) {
      throw new Error("O link do YouTube não contém um ID de vídeo válido.");
    }
    provider = "youtube";
    canonicalUrl = `https://www.youtube.com/watch?v=${externalId}`;
  } else if (host === "open.spotify.com" || host === "www.open.spotify.com") {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2 || segments[0] !== "track" || !/^[A-Za-z0-9]{22}$/.test(segments[1])) {
      throw new Error("O link precisa apontar para uma faixa individual do Spotify.");
    }
    provider = "spotify";
    externalId = segments[1];
    canonicalUrl = `https://open.spotify.com/track/${externalId}`;
  } else {
    throw new Error("Por enquanto aceitamos links de músicas do YouTube ou Spotify.");
  }

  return { provider, externalId, canonicalUrl };
}
