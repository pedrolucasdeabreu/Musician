"use client";

import { Button } from "@heroui/react";
import {
  Heart,
  Library,
  ListMusic,
  LogOut,
  Music2,
  Play,
  Plus,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { LyricsLine, Playlist, PlaylistTrack, Track, TrackPreview } from "@/lib/music";
import { createClient } from "@/lib/supabase/browser";
import { YouTubePlayer } from "@/components/youtube-player";

type View = { type: "library" } | { type: "favorites" } | { type: "playlist"; id: string };

export function LibraryApp({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrack[]>([]);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [activeView, setActiveView] = useState<View>({ type: "library" });
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [preview, setPreview] = useState<TrackPreview | null>(null);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const loadLibrary = useCallback(async () => {
    const [trackResult, playlistResult, favoriteResult, playlistTrackResult] = await Promise.all([
      supabase.from("tracks").select("id,user_id,provider,external_id,source_url,title,artist,artwork_url,video_id,lyrics,lyrics_source,created_at").order("created_at", { ascending: false }),
      supabase.from("playlists").select("id,name").order("created_at", { ascending: false }),
      supabase.from("favorites").select("track_id"),
      supabase.from("playlist_tracks").select("playlist_id,track_id"),
    ]);

    const failed = [trackResult.error, playlistResult.error, favoriteResult.error, playlistTrackResult.error]
      .find((error) => error !== null);
    if (failed) throw failed;

    const loadedTracks = trackResult.data ?? [];
    setTracks(loadedTracks);
    setPlaylists(playlistResult.data ?? []);
    setFavorites((favoriteResult.data ?? []).map((favorite) => favorite.track_id));
    setPlaylistTracks(playlistTrackResult.data ?? []);
    setActiveTrack((current) => current && loadedTracks.some((track) => track.id === current.id)
      ? loadedTracks.find((track) => track.id === current.id) ?? current
      : loadedTracks[0] ?? null);
  }, [supabase]);

  useEffect(() => {
    void loadLibrary().catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar a biblioteca.");
    });
  }, [loadLibrary]);

  const visibleTracks = useMemo(() => {
    let result = tracks;
    if (activeView.type === "favorites") {
      result = result.filter((track) => favorites.includes(track.id));
    } else if (activeView.type === "playlist") {
      const ids = new Set(playlistTracks.filter((item) => item.playlist_id === activeView.id).map((item) => item.track_id));
      result = result.filter((track) => ids.has(track.id));
    }
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (normalizedQuery) {
      result = result.filter((track) =>
        `${track.title} ${track.artist ?? ""}`.toLocaleLowerCase().includes(normalizedQuery));
    }
    return result;
  }, [activeView, favorites, playlistTracks, query, tracks]);

  const currentPlaylist = activeView.type === "playlist"
    ? playlists.find((playlist) => playlist.id === activeView.id)
    : null;
  const heading = activeView.type === "favorites" ? "Favoritos" : currentPlaylist?.name ?? "Sua biblioteca";

  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente.");
    return data.session.access_token;
  }

  async function previewTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setPreview(null);
    setNotice("");
    setErrorMessage("");
    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/tracks/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json() as TrackPreview | { error?: string };
      if (!response.ok || !("provider" in payload)) {
        throw new Error("error" in payload ? payload.error : "Não foi possível identificar essa música.");
      }
      setPreview(payload);
      if (payload.warning) setNotice(payload.warning);
      else if (payload.lyricsStatus !== "available") {
        setNotice("Música identificada. Nenhuma letra licenciada foi encontrada para esta faixa.");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível identificar essa música.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTrack() {
    if (!preview) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Sua sessão expirou. Entre novamente.");

      const { data, error } = await supabase.from("tracks").insert({
        user_id: userData.user.id,
        provider: preview.provider,
        external_id: preview.externalId,
        source_url: preview.sourceUrl,
        title: preview.title,
        artist: preview.artist,
        artwork_url: preview.artworkUrl,
        video_id: preview.videoId,
        lyrics: preview.lyrics,
        lyrics_source: preview.lyricsSource,
      }).select("id,user_id,provider,external_id,source_url,title,artist,artwork_url,video_id,lyrics,lyrics_source,created_at").single();
      if (error) throw error;
      setTracks((current) => [data, ...current]);
      setActiveTrack(data);
      setActiveView({ type: "library" });
      setUrl("");
      setPreview(null);
      setNotice(`“${data.title}” foi adicionada à biblioteca.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar a música.";
      setErrorMessage(message.includes("duplicate") || message.includes("unique")
        ? "Essa música já está na sua biblioteca."
        : message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(track: Track) {
    const wasFavorite = favorites.includes(track.id);
    setErrorMessage("");
    setFavorites((current) => wasFavorite
      ? current.filter((id) => id !== track.id)
      : [...current, track.id]);
    const result = wasFavorite
      ? await supabase.from("favorites").delete().eq("track_id", track.id)
      : await supabase.from("favorites").insert({ user_id: track.user_id, track_id: track.id });
    if (result.error) {
      setFavorites((current) => wasFavorite
        ? [...current, track.id]
        : current.filter((id) => id !== track.id));
      setErrorMessage(`Não foi possível atualizar o favorito: ${result.error.message}`);
    }
  }

  async function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = playlistName.trim();
    if (!name) return;
    setErrorMessage("");
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Sua sessão expirou. Entre novamente.");
      const { data, error } = await supabase.from("playlists")
        .insert({ name, user_id: userData.user.id })
        .select("id,name")
        .single();
      if (error) throw error;
      setPlaylists((current) => [data, ...current]);
      setPlaylistName("");
      setActiveView({ type: "playlist", id: data.id });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível criar a playlist.");
    }
  }

  async function addToPlaylist(track: Track, playlistId: string) {
    if (!playlistId) return;
    const playlist = playlists.find((item) => item.id === playlistId);
    if (playlistTracks.some((item) => item.playlist_id === playlistId && item.track_id === track.id)) {
      setNotice(`“${track.title}” já está na playlist “${playlist?.name ?? ""}”.`);
      return;
    }
    const { error } = await supabase.from("playlist_tracks")
      .insert({ playlist_id: playlistId, track_id: track.id });
    if (error) {
      setErrorMessage(`Não foi possível adicionar à playlist: ${error.message}`);
      return;
    }
    setPlaylistTracks((current) => [...current, { playlist_id: playlistId, track_id: track.id }]);
    setNotice(`“${track.title}” foi adicionada à playlist “${playlist?.name ?? ""}”.`);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) setErrorMessage(`Não foi possível sair: ${error.message}`);
    else window.location.assign("/login");
  }

  const onPlayerTime = useCallback((time: number) => setCurrentTime(time), []);
  const onPlayerError = useCallback(() => setNotice("O player não pôde carregar esta música. Verifique se o embed está disponível."), []);

  function chooseTrack(track: Track) {
    setActiveTrack(track);
    setCurrentTime(null);
  }

  const lyrics = (activeTrack?.lyrics ?? []) as LyricsLine[];
  const activeLyricIndex = currentTime === null
    ? -1
    : lyrics.reduce((activeIndex, line, index) =>
      line.t !== null && line.t <= currentTime ? index : activeIndex, -1);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark"><Music2 size={20} /></span>
          Musician
        </a>
        <nav className="side-section" aria-label="Biblioteca">
          <span className="side-caption">Biblioteca</span>
          <button className="nav-button" aria-current={activeView.type === "library" ? "page" : undefined} onClick={() => setActiveView({ type: "library" })}>
            <Library size={18} /> Todas as músicas
          </button>
          <button className="nav-button" aria-current={activeView.type === "favorites" ? "page" : undefined} onClick={() => setActiveView({ type: "favorites" })}>
            <Heart size={18} /> Favoritos
          </button>
        </nav>
        <section className="side-section">
          <span className="side-caption">Playlists</span>
          {playlists.map((playlist) => (
            <button
              className="nav-button"
              aria-current={activeView.type === "playlist" && activeView.id === playlist.id ? "page" : undefined}
              key={playlist.id}
              onClick={() => setActiveView({ type: "playlist", id: playlist.id })}
            >
              <ListMusic size={18} /> <span className="truncate">{playlist.name}</span>
            </button>
          ))}
          <form className="playlist-form" onSubmit={createPlaylist}>
            <input className="text-input" aria-label="Nome da nova playlist" placeholder="Nova playlist" maxLength={80} value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} />
            <button type="submit" aria-label="Criar playlist"><Plus size={18} /></button>
          </form>
        </section>
        <div className="sidebar-spacer" />
        <div className="side-section">
          <span className="side-caption" title={userEmail}>{userEmail || "Conta"}</span>
          <button className="nav-button" onClick={signOut}><LogOut size={18} /> Sair</button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-mark"><Music2 size={18} /></span>
            <span className="mobile-brand-name">Musician</span>
          </a>
          <label className="field search-input">
            <span className="sr-only">Buscar na biblioteca</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Search size={17} />
              <input className="text-input" placeholder="Buscar músicas..." value={query} onChange={(event) => setQuery(event.target.value)} />
            </span>
          </label>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <h1>{heading}</h1>
              <p>Adicione links do YouTube ou Spotify. O áudio permanece nos players oficiais.</p>
            </div>
          </div>

          <form className="add-track" onSubmit={previewTrack}>
            <input
              className="text-input"
              aria-label="Link do YouTube ou Spotify"
              placeholder="Cole o link de uma música do YouTube ou Spotify"
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <Button type="submit" isDisabled={busy}>{busy ? "Identificando..." : "Identificar música"}</Button>
            {preview && (
              <div className="track-preview">
                <div className="track-preview-info">
                  <strong>{preview.title}</strong>
                  <span>{preview.artist ?? (preview.provider === "youtube" ? "YouTube" : "Spotify")} · {preview.provider}</span>
                </div>
                <Button type="button" isDisabled={busy} onPress={saveTrack}>
                  {busy ? "Salvando..." : "Adicionar à biblioteca"}
                </Button>
              </div>
            )}
            {notice && <p className="notice" role="status">{notice}</p>}
            {errorMessage && <p className="error-message" role="alert">{errorMessage}</p>}
          </form>

          {loadError && <p className="error-message" role="alert">{loadError}</p>}
          <div className="section-title">
            <h2>{heading} <span className="muted">({visibleTracks.length})</span></h2>
          </div>

          {visibleTracks.length === 0 ? (
            <div className="empty-card">
              <Music2 size={28} color="#9b7bff" />
              <p className="empty-copy">
                {tracks.length === 0
                  ? "Sua biblioteca está vazia. Cole um link acima para adicionar sua primeira música."
                  : "Nenhuma música encontrada nesta seleção."}
              </p>
            </div>
          ) : (
            <div className="track-list">
              {visibleTracks.map((track) => {
                const favorite = favorites.includes(track.id);
                return (
                  <article className={`track-row${activeTrack?.id === track.id ? " selected" : ""}`} key={track.id}>
                    <button className="track-art" aria-label={`Reproduzir ${track.title}`} onClick={() => chooseTrack(track)}>
                      {track.artwork_url ? <img src={track.artwork_url} alt="" /> : <Music2 size={20} />}
                    </button>
                    <button className="track-info-button" onClick={() => chooseTrack(track)}>
                      <div className="track-title">{track.title}</div>
                      <div className="track-meta">{track.artist ?? (track.provider === "youtube" ? "YouTube" : "Spotify")}</div>
                    </button>
                    <div className="track-actions">
                      <select
                        className="playlist-select"
                        aria-label={`Adicionar ${track.title} a uma playlist`}
                        value=""
                        onChange={(event) => void addToPlaylist(track, event.target.value)}
                      >
                        <option value="">Playlist...</option>
                        {playlists.map((playlist) => <option value={playlist.id} key={playlist.id}>{playlist.name}</option>)}
                      </select>
                      <button
                        className={`icon-button${favorite ? " active" : ""}`}
                        aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                        aria-pressed={favorite}
                        onClick={() => void toggleFavorite(track)}
                      >
                        <Heart size={18} fill={favorite ? "currentColor" : "none"} />
                      </button>
                      <button className="icon-button" aria-label={`Abrir ${track.title}`} onClick={() => chooseTrack(track)}>
                        <Play size={17} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {activeTrack && (
            <section className="player-panel" aria-label={`Reproduzindo ${activeTrack.title}`}>
              <article className="player-card">
                <h2>{activeTrack.title}</h2>
                {activeTrack.provider === "youtube" && activeTrack.video_id ? (
                  <YouTubePlayer videoId={activeTrack.video_id} onTime={onPlayerTime} onError={onPlayerError} />
                ) : (
                  <iframe
                    className="embed-frame spotify"
                    title={`Player oficial: ${activeTrack.title}`}
                    src={`https://open.spotify.com/embed/track/${encodeURIComponent(activeTrack.external_id)}`}
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                  />
                )}
                <p className="lyrics-hint">Reprodução fornecida pelo player oficial. O Musician não baixa nem armazena áudio.</p>
              </article>
              <article className="lyrics-card">
                <h2>Letra</h2>
                {lyrics.length ? (
                  <>
                    <div className="lyrics-list">
                      {lyrics.map((line, index) => (
                        <p className={`lyrics-line${index === activeLyricIndex ? " active" : ""}`} key={`${line.t ?? "plain"}-${index}`}>
                          {line.text}
                        </p>
                      ))}
                    </div>
                    <p className="lyrics-hint">
                      {activeTrack.provider === "youtube" && lyrics.some((line) => line.t !== null)
                        ? `Letra licenciada · ${activeTrack.lyrics_source ?? "fonte autorizada"}`
                        : `Letra licenciada · ${activeTrack.lyrics_source ?? "fonte autorizada"}. A sincronização não está disponível neste player.`}
                    </p>
                  </>
                ) : (
                  <p className="empty-copy">
                    {activeTrack.lyrics_source
                      ? "A fonte não encontrou uma letra licenciada para esta faixa."
                      : "A letra não está disponível. O Musician só exibe letras de um provedor autorizado."}
                  </p>
                )}
              </article>
            </section>
          )}
        </div>
      </section>

      <nav className="mobile-nav" aria-label="Navegação mobile">
        <button className="nav-button" aria-current={activeView.type === "library" ? "page" : undefined} onClick={() => setActiveView({ type: "library" })}><Library size={18} /> Biblioteca</button>
        <button className="nav-button" aria-current={activeView.type === "favorites" ? "page" : undefined} onClick={() => setActiveView({ type: "favorites" })}><Heart size={18} /> Favoritos</button>
        <button className="nav-button" aria-current={activeView.type === "playlist" ? "page" : undefined} onClick={() => {
          const firstPlaylist = playlists[0];
          if (firstPlaylist) setActiveView({ type: "playlist", id: firstPlaylist.id });
          else setNotice("Crie uma playlist na navegação para começar.");
        }}><ListMusic size={18} /> Playlists</button>
      </nav>
    </main>
  );
}
