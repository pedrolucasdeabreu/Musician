import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { parseMusicUrl, type LyricsLine, type TrackPreview } from "@/lib/music";

type OEmbedResponse = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

function getPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("O Supabase ainda não está configurado no servidor.");
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = new Set([
    "capacitor://localhost",
    "http://localhost",
    "https://localhost",
    "http://localhost:5173",
    "http://localhost:4173",
    process.env.MOBILE_APP_ORIGIN,
  ].filter((value): value is string => Boolean(value)));
  return allowed.has(origin) ? origin : null;
}

function corsHeaders(request: NextRequest) {
  const origin = getAllowedOrigin(request);
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "600");
    headers.set("Vary", "Origin");
  }
  return headers;
}

async function fetchLyrics(
  title: string,
  artist: string | null,
): Promise<Pick<TrackPreview, "lyrics" | "lyricsSource" | "lyricsStatus" | "warning">> {
  const endpoint = process.env.LICENSED_LYRICS_API_URL;
  const apiKey = process.env.LICENSED_LYRICS_API_KEY;
  if (!endpoint && !apiKey) {
    return {
      lyrics: [],
      lyricsSource: null,
      lyricsStatus: "unconfigured",
      warning: null,
    };
  }
  if (!endpoint || !apiKey) {
    return {
      lyrics: [],
      lyricsSource: null,
      lyricsStatus: "error",
      warning: "O provedor de letras está configurado parcialmente; defina URL e chave.",
    };
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return {
      lyrics: [],
      lyricsSource: null,
      lyricsStatus: "error",
      warning: "A URL do provedor licenciado de letras é inválida.",
    };
  }
  if (url.protocol !== "https:") {
    return {
      lyrics: [],
      lyricsSource: null,
      lyricsStatus: "error",
      warning: "O provedor licenciado de letras precisa usar HTTPS.",
    };
  }

  url.searchParams.set("title", title);
  if (artist) url.searchParams.set("artist", artist);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(7000),
      cache: "no-store",
    });
    if (response.status === 404) {
      return {
        lyrics: [],
        lyricsSource: null,
        lyricsStatus: "not-found",
        warning: null,
      };
    }
    if (!response.ok) {
      return {
        lyrics: [],
        lyricsSource: null,
        lyricsStatus: "error",
        warning: `O provedor de letras respondeu com erro (${response.status}).`,
      };
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("lyrics" in payload)) {
      return {
        lyrics: [],
        lyricsSource: null,
        lyricsStatus: "error",
        warning: "A resposta do provedor de letras tem um formato inválido.",
      };
    }

    const candidate = (payload as { lyrics: unknown }).lyrics;
    if (!Array.isArray(candidate)) {
      return {
        lyrics: [],
        lyricsSource: null,
        lyricsStatus: "error",
        warning: "A resposta do provedor de letras não contém uma lista de linhas.",
      };
    }

    const lyrics: LyricsLine[] = candidate
      .slice(0, 1000)
      .filter((line): line is { t?: unknown; text: string } =>
        Boolean(line)
        && typeof line === "object"
        && "text" in line
        && typeof (line as { text: unknown }).text === "string")
      .map((line) => ({
        t: typeof line.t === "number" && Number.isFinite(line.t) && line.t >= 0 ? line.t : null,
        text: line.text.slice(0, 1000),
      }))
      .filter((line) => line.text.trim().length > 0);

    const source = "source" in payload && typeof payload.source === "string"
      ? payload.source.slice(0, 120)
      : "provedor licenciado";

    return lyrics.length
      ? { lyrics, lyricsSource: source, lyricsStatus: "available", warning: null }
      : { lyrics: [], lyricsSource: null, lyricsStatus: "not-found", warning: null };
  } catch {
    return {
      lyrics: [],
      lyricsSource: null,
      lyricsStatus: "error",
      warning: "Não foi possível contactar o provedor de letras. Tente novamente mais tarde.",
    };
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = getAllowedOrigin(request);
  if (!origin) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);
  const json = (body: object, status = 200) =>
    NextResponse.json(body, { status, headers });

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return json({ error: "É necessário iniciar sessão." }, 401);
  }

  try {
    const supabase = getPublicSupabaseClient();
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
      return json({ error: "A sessão expirou. Inicie sessão novamente." }, 401);
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("url" in body) || typeof body.url !== "string") {
      return json({ error: "Informe o link da música." }, 400);
    }

    const parsed = parseMusicUrl(body.url);
    const oembed = new URL(
      parsed.provider === "youtube"
        ? "https://www.youtube.com/oembed"
        : "https://open.spotify.com/oembed",
    );
    oembed.searchParams.set("url", parsed.canonicalUrl);
    oembed.searchParams.set("format", "json");

    const metadataResponse = await fetch(oembed, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(7000),
      cache: "no-store",
    });
    if (!metadataResponse.ok) {
      return json({ error: "A plataforma não conseguiu fornecer os metadados para esse link." }, 422);
    }

    const metadata = await metadataResponse.json() as OEmbedResponse;
    if (!metadata.title?.trim()) {
      return json({ error: "A plataforma retornou metadados incompletos." }, 422);
    }

    const lyricResult = await fetchLyrics(metadata.title, metadata.author_name ?? null);
    const preview: TrackPreview = {
      provider: parsed.provider,
      externalId: parsed.externalId,
      sourceUrl: parsed.canonicalUrl,
      title: metadata.title.slice(0, 300),
      artist: metadata.author_name?.slice(0, 200) ?? null,
      artworkUrl: metadata.thumbnail_url ?? null,
      videoId: parsed.provider === "youtube" ? parsed.externalId : null,
      ...lyricResult,
    };

    return json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível validar esse link.";
    const status = message.startsWith("Cole um link") || message.startsWith("O link") || message.startsWith("Por enquanto")
      ? 400
      : 500;
    return json({ error: message }, status);
  }
}
