import { App as KonstaApp, Block, Button, Navbar, Page } from "konsta/react";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Heart, ListMusic, LogOut, Music2, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type Provider = "youtube" | "spotify";
type LyricsLine = { t: number | null; text: string };
type Track = {
  id: string;
  provider: Provider;
  external_id: string;
  source_url: string;
  title: string;
  artist: string | null;
  artwork_url: string | null;
  video_id: string | null;
  lyrics: LyricsLine[] | null;
  lyrics_source: string | null;
};
type Playlist = { id: string; name: string };
type Preview = {
  provider: Provider;
  externalId: string;
  sourceUrl: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  videoId: string | null;
  lyrics: LyricsLine[];
  lyricsSource: string | null;
  lyricsStatus: string;
  warning: string | null;
};

const apiUrl = import.meta.env.VITE_MUSICIAN_API_URL?.replace(/\/+$/, "");

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [playlistTrackIds, setPlaylistTrackIds] = useState<Set<string>>(new Set());
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [activeView, setActiveView] = useState<"library" | "favorites" | string>("library");
  const [playlistName, setPlaylistName] = useState("");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadLibrary = useCallback(async () => {
    const [trackResult, playlistResult, favoriteResult] = await Promise.all([
      supabase.from("tracks").select("id,provider,external_id,source_url,title,artist,artwork_url,video_id,lyrics,lyrics_source").order("created_at", { ascending: false }),
      supabase.from("playlists").select("id,name").order("created_at", { ascending: false }),
      supabase.from("favorites").select("track_id"),
    ]);
    const failure = [trackResult.error, playlistResult.error, favoriteResult.error].find(Boolean);
    if (failure) throw failure;
    const loaded = trackResult.data ?? [];
    setTracks(loaded);
    setPlaylists(playlistResult.data ?? []);
    setFavorites((favoriteResult.data ?? []).map((favorite) => favorite.track_id));
    setActiveTrack((current) => current && loaded.some((track) => track.id === current.id)
      ? loaded.find((track) => track.id === current.id) ?? current
      : loaded[0] ?? null);
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setErrorMessage(error.message);
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    let appUrlListener: { remove: () => Promise<void> } | undefined;
    let disposed = false;
    if (Capacitor.isNativePlatform()) {
      const handleCallback = async (callbackUrl: string) => {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(callbackUrl);
          if (error) throw error;
          await Browser.close();
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "Não foi possível concluir o login Google.");
        }
      };

      void CapacitorApp.addListener("appUrlOpen", ({ url: callbackUrl }) => {
        void handleCallback(callbackUrl);
      }).then((listener) => {
        if (disposed) void listener.remove();
        else appUrlListener = listener;
      });

      void CapacitorApp.getLaunchUrl().then((launch) => {
        if (launch?.url) void handleCallback(launch.url);
      });
    }

    return () => {
      disposed = true;
      subscription.unsubscribe();
      void appUrlListener?.remove();
    };
  }, []);

  const activeUserId = session?.user.id;
  useEffect(() => {
    if (activeUserId) {
      void loadLibrary().catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar a biblioteca."));
    }
  }, [activeUserId, loadLibrary]);

  const visibleTracks = useMemo(() => {
    if (activeView === "favorites") return tracks.filter((track) => favorites.includes(track.id));
    if (activeView !== "library") {
      return tracks.filter((track) => playlistTrackIds.has(`${activeView}:${track.id}`));
    }
    return tracks;
  }, [activeView, favorites, playlistTrackIds, tracks]);

  useEffect(() => {
    if (activeView === "library" || activeView === "favorites") {
      setPlaylistTrackIds(new Set());
      return;
    }
    void supabase.from("playlist_tracks").select("track_id").eq("playlist_id", activeView)
      .then(({ data, error }) => {
        if (error) {
          setErrorMessage(error.message);
          return;
        }
        setPlaylistTrackIds(new Set((data ?? []).map((row) => `${activeView}:${row.track_id}`)));
      });
  }, [activeView]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setNotice("");
    try {
      const result = isSignup
        ? await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: Capacitor.isNativePlatform()
              ? "com.musician.app://auth/callback"
              : `${window.location.origin}/auth/callback`,
          },
        })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (isSignup && !result.data.session) {
        setNotice("Conta criada. Confirme seu email para entrar.");
      }
      if (isSignup && !result.data.session) {
        setNotice("Conta criada. Confirme seu email para entrar.");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível autenticar.");
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    setBusy(true);
    setErrorMessage("");
    try {
      const redirectTo = Capacitor.isNativePlatform()
        ? "com.musician.app://auth/callback"
        : `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (Capacitor.isNativePlatform() && data.url) await Browser.open({ url: data.url });
      else if (data.url) window.location.assign(data.url);
      else throw new Error("O Supabase não retornou a URL de autenticação Google.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível iniciar o login Google.");
      setBusy(false);
    }
  }

  async function identifyTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setPreview(null);
    setNotice("");
    setErrorMessage("");
    try {
      if (!apiUrl) throw new Error("Configure VITE_MUSICIAN_API_URL com a URL da aplicação web na Vercel.");
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Sua sessão expirou. Entre novamente.");
      const response = await fetch(`${apiUrl}/api/tracks/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json() as Preview | { error?: string };
      if (!response.ok || !("provider" in payload)) {
        throw new Error("error" in payload ? payload.error : "Não foi possível identificar essa música.");
      }
      setPreview(payload);
      if (payload.warning) setNotice(payload.warning);
      else if (payload.lyricsStatus !== "available") setNotice("Música identificada. Nenhuma letra licenciada foi encontrada.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível identificar essa música.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTrack() {
    if (!preview || !session) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.from("tracks").insert({
        user_id: session.user.id,
        provider: preview.provider,
        external_id: preview.externalId,
        source_url: preview.sourceUrl,
        title: preview.title,
        artist: preview.artist,
        artwork_url: preview.artworkUrl,
        video_id: preview.videoId,
        lyrics: preview.lyrics,
        lyrics_source: preview.lyricsSource,
      }).select("id,provider,external_id,source_url,title,artist,artwork_url,video_id,lyrics,lyrics_source").single();
      if (error) throw error;
      setTracks((current) => [data, ...current]);
      setActiveTrack(data);
      setUrl("");
      setPreview(null);
      setNotice(`“${data.title}” foi adicionada à biblioteca.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível salvar a música.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(track: Track) {
    if (!session) {
      setErrorMessage("Sua sessão expirou. Entre novamente.");
      return;
    }
    const wasFavorite = favorites.includes(track.id);
    setFavorites((current) => wasFavorite ? current.filter((id) => id !== track.id) : [...current, track.id]);
    const result = wasFavorite
      ? await supabase.from("favorites").delete().eq("track_id", track.id)
      : await supabase.from("favorites").insert({ user_id: session.user.id, track_id: track.id });
    if (result.error) {
      setFavorites((current) => wasFavorite ? [...current, track.id] : current.filter((id) => id !== track.id));
      setErrorMessage(result.error.message);
    }
  }

  async function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !playlistName.trim()) return;
    const { data, error } = await supabase.from("playlists")
      .insert({ name: playlistName.trim(), user_id: session.user.id })
      .select("id,name")
      .single();
    if (error) setErrorMessage(error.message);
    else {
      setPlaylists((current) => [data, ...current]);
      setActiveView(data.id);
      setPlaylistName("");
    }
  }

  async function addTrackToPlaylist(track: Track, playlistId: string) {
    if (!playlistId) return;
    const { error } = await supabase.from("playlist_tracks").insert({
      playlist_id: playlistId,
      track_id: track.id,
    });
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setPlaylistTrackIds((current) => new Set(current).add(`${playlistId}:${track.id}`));
    const playlist = playlists.find((item) => item.id === playlistId);
    setNotice(`Música adicionada à playlist “${playlist?.name ?? ""}”.`);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) setErrorMessage(error.message);
    else {
      setSession(null);
      setTracks([]);
    }
  }

  if (!authReady) {
    return <KonstaApp theme="ios"><Page className="mobile-page"><Block className="mobile-content">Carregando...</Block></Page></KonstaApp>;
  }

  return (
    <KonstaApp theme="ios" className="mobile-app">
      <Page className="mobile-page">
        <Navbar className="mobile-navbar">
          <div className="mobile-brand"><span className="brand-mark"><Music2 size={18} /></span>Musician</div>
          {session && <button className="mobile-icon-button" aria-label="Sair" onClick={() => void signOut()}><LogOut size={18} /></button>}
        </Navbar>

        {!session ? (
          <Block className="mobile-content">
            <section className="mobile-auth">
              <h1>{isSignup ? "Crie sua conta" : "Sua música, em um só lugar."}</h1>
              <p className="muted">Entre para organizar sua biblioteca.</p>
              <form className="mobile-form" onSubmit={submitAuth}>
                <label>Email<input className="mobile-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <label>Senha<input className="mobile-input" type="password" autoComplete={isSignup ? "new-password" : "current-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                <Button large disabled={busy}>{busy ? "Aguarde..." : isSignup ? "Criar conta" : "Entrar"}</Button>
              </form>
              <Button large outline disabled={busy} onClick={() => void googleLogin()}>Continuar com Google</Button>
              <button className="mobile-action" onClick={() => setIsSignup((current) => !current)}>{isSignup ? "Já tem conta? Entrar" : "Criar conta"}</button>
              {notice && <p className="mobile-notice" role="status">{notice}</p>}
              {errorMessage && <p className="mobile-error" role="alert">{errorMessage}</p>}
            </section>
          </Block>
        ) : (
          <Block className="mobile-content">
            <h1>{activeView === "library" ? "Sua biblioteca" : activeView === "favorites" ? "Favoritos" : playlists.find((item) => item.id === activeView)?.name ?? "Playlist"}</h1>
            <p className="muted">Cole um link. O áudio fica no player oficial.</p>

            <form className="mobile-form" onSubmit={identifyTrack}>
              <input className="mobile-input" type="url" required aria-label="Link da música" placeholder="Link do YouTube ou Spotify" value={url} onChange={(event) => setUrl(event.target.value)} />
              <Button large disabled={busy}>{busy ? "Identificando..." : "Identificar música"}</Button>
              {preview && (
                <div className="mobile-preview">
                  <strong>{preview.title}</strong>
                  <p className="mobile-hint">{preview.artist ?? preview.provider}</p>
                  <Button large disabled={busy} onClick={() => void saveTrack()}>Adicionar à biblioteca</Button>
                </div>
              )}
              {notice && <p className="mobile-notice" role="status">{notice}</p>}
              {errorMessage && <p className="mobile-error" role="alert">{errorMessage}</p>}
            </form>

            <div className="mobile-button-row">
              <Button small outline onClick={() => setActiveView("library")}><Search size={16} /> Biblioteca</Button>
              <Button small outline onClick={() => setActiveView("favorites")}><Heart size={16} /> Favoritos</Button>
            </div>

            <form className="mobile-form" onSubmit={createPlaylist}>
              <input className="mobile-input" aria-label="Nome da nova playlist" placeholder="Nome da playlist" maxLength={80} value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} />
              <Button large><Plus size={17} /> Criar playlist</Button>
            </form>
            {playlists.length > 0 && (
              <div className="mobile-button-row" aria-label="Suas playlists">
                {playlists.map((playlist) => (
                  <Button key={playlist.id} small outline onClick={() => setActiveView(playlist.id)}>
                    <ListMusic size={15} /> {playlist.name}
                  </Button>
                ))}
              </div>
            )}

            <section className="mobile-track-list" aria-label="Músicas">
              {visibleTracks.length === 0
                ? <p className="mobile-hint">Nenhuma música nesta lista ainda.</p>
                : visibleTracks.map((track) => {
                  const favorite = favorites.includes(track.id);
                  return (
                    <article className={`mobile-track${activeTrack?.id === track.id ? " selected" : ""}`} key={track.id}>
                      <button className="track-info-button" onClick={() => setActiveTrack(track)}>
                        <div className="mobile-track-title">{track.title}</div>
                        <div className="mobile-track-artist">{track.artist ?? track.provider}</div>
                      </button>
                      <div className="mobile-inline-actions">
                        <select
                          className="mobile-select"
                          aria-label={`Adicionar ${track.title} a uma playlist`}
                          value=""
                          onChange={(event) => void addTrackToPlaylist(track, event.target.value)}
                        >
                          <option value="">Playlist...</option>
                          {playlists.map((playlist) => <option value={playlist.id} key={playlist.id}>{playlist.name}</option>)}
                        </select>
                        <button className={`mobile-icon-button${favorite ? " active" : ""}`} aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} aria-pressed={favorite} onClick={() => void toggleFavorite(track)}>
                          <Heart size={18} fill={favorite ? "currentColor" : "none"} />
                        </button>
                      </div>
                    </article>
                  );
                })}
            </section>

            {activeTrack && (
              <>
                <section className="mobile-panel" aria-label={`Player de ${activeTrack.title}`}>
                  <h2>{activeTrack.title}</h2>
                  {activeTrack.provider === "youtube" && activeTrack.video_id ? (
                    <iframe
                      className="mobile-embed"
                      title={`Player oficial: ${activeTrack.title}`}
                      src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(activeTrack.video_id)}?playsinline=1`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  ) : (
                    <iframe
                      className="mobile-embed spotify"
                      title={`Player oficial: ${activeTrack.title}`}
                      src={`https://open.spotify.com/embed/track/${encodeURIComponent(activeTrack.external_id)}`}
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                    />
                  )}
                  <p className="mobile-hint">Reprodução no embed oficial; nenhum áudio é baixado.</p>
                </section>
                <section className="mobile-panel">
                  <h2>Letra</h2>
                  {activeTrack.lyrics?.length
                    ? <div className="mobile-lyrics">{activeTrack.lyrics.map((line, index) => <p key={`${line.t ?? "plain"}-${index}`}>{line.text}</p>)}</div>
                    : <p className="mobile-hint">Letra indisponível. Só exibimos letras de provedores autorizados.</p>}
                  {activeTrack.lyrics_source && <p className="mobile-hint">Fonte licenciada: {activeTrack.lyrics_source}.</p>}
                  {activeTrack.provider === "spotify" && activeTrack.lyrics?.some((line) => line.t !== null) && (
                    <p className="mobile-hint">Este player não expõe o tempo de reprodução para sincronizar a letra.</p>
                  )}
                </section>
              </>
            )}
            <footer className="mobile-footer">
              <span>{session.user.email}</span>
            </footer>
          </Block>
        )}
      </Page>
    </KonstaApp>
  );
}
