# SPDX-License-Identifier: GPL-3.0-only
"""Pure domain helpers shared by the audio processor and its tests."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse


def identificar_link(url: str) -> tuple[str, str]:
    """Return (provider, external_id) for supported YouTube/Spotify links.

    Supported forms:
    - youtube.com/watch?v=VIDEO_ID
    - youtube.com/shorts/VIDEO_ID
    - youtube.com/live/VIDEO_ID
    - youtu.be/VIDEO_ID
    - open.spotify.com/track/TRACK_ID
    """
    try:
        partes = urlparse(url.strip())
        host = (partes.hostname or "").lower()

        if host in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
            video_id = parse_qs(partes.query).get("v", [None])[0]
            segmentos = partes.path.strip("/").split("/")

            if not video_id and len(segmentos) >= 2 and segmentos[0] in {"shorts", "live"}:
                video_id = segmentos[1]

            if video_id:
                return "youtube", video_id

        elif host in {"youtu.be", "www.youtu.be"}:
            video_id = partes.path.strip("/").split("/")[0]
            if video_id:
                return "youtube", video_id

        elif host in {"open.spotify.com", "www.open.spotify.com"}:
            segmentos = partes.path.strip("/").split("/")
            if len(segmentos) >= 2 and segmentos[0] == "track":
                return "spotify", segmentos[1]
    except (TypeError, ValueError):
        pass

    raise ValueError(
        "Link inválido. Envia um link de uma música individual "
        "do YouTube ou Spotify."
    )


def parsear_lrc(conteudo: str) -> list[dict[str, float | str]]:
    """Parse LRC text into time-sorted lyric lines."""
    marca = re.compile(r"\[(\d+):(\d+)(?:\.(\d+))?\]")
    linhas: list[dict[str, float | str]] = []

    for bruta in conteudo.splitlines():
        timestamps = marca.findall(bruta)
        texto = marca.sub("", bruta).strip()
        if not texto or not timestamps:
            continue

        for minutos, segundos, fracao in timestamps:
            centesimos = float("0." + fracao) if fracao else 0.0
            tempo = int(minutos) * 60 + int(segundos) + centesimos
            linhas.append({"t": round(tempo, 2), "text": texto})

    linhas.sort(key=lambda linha: float(linha["t"]))
    return linhas
