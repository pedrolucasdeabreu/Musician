import argparse
import functools
import http.server
import json
import re
import difflib
import unicodedata
import shutil
import subprocess
import sys
import tempfile
import threading
import webbrowser
import warnings
import logging
import requests
import os
import imageio_ffmpeg
from faster_whisper import WhisperModel
from urllib.parse import urlparse, parse_qs
from yt_dlp import YoutubeDL
from mutagen import File as MutagenFile
from pathlib import Path

TEMPLATE = Path(__file__).parent / "mixer_template.html"

# ---------------------------------------------------------------------------
# Downloads, FFmpeg local e catálogo de músicas
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
CATALOGO_FILE = BASE_DIR / "catalogo_downloads.json"

def preparar_ambiente_audio() -> str:
    try:
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:
        raise RuntimeError(f"Não foi possível localizar o FFmpeg: {e}")

    pasta_ffmpeg = str(Path(ffmpeg).resolve().parent)
    os.environ["PATH"] = pasta_ffmpeg + os.pathsep + os.environ.get("PATH", "")
    os.environ["IMAGEIO_FFMPEG_EXE"] = ffmpeg

    return ffmpeg

def carregar_catalogo() -> dict:
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

    if not CATALOGO_FILE.exists():
        return {"musicas": []}

    try:
        dados = json.loads(
            CATALOGO_FILE.read_text(encoding="utf-8")
        )

        if not isinstance(dados.get("musicas"), list):
            return {"musicas": []}

        return dados

    except (json.JSONDecodeError, OSError):
        print("⚠️ Catálogo inválido. Será criado novamente.")
        return {"musicas": []}

def guardar_catalogo(catalogo: dict) -> None:
    CATALOGO_FILE.write_text(
        json.dumps(catalogo, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

def identificar_link(url: str) -> tuple[str, str]:
    try:
        partes = urlparse(url.strip())
        host = (partes.hostname or "").lower()

        if host in ("youtube.com", "www.youtube.com", "m.youtube.com"):
            video_id = parse_qs(partes.query).get("v", [None])[0]

            if not video_id and partes.path.startswith("/shorts/"):
                video_id = partes.path.split("/")[2]

            if not video_id and partes.path.startswith("/live/"):
                video_id = partes.path.split("/")[2]

            if video_id:
                return "youtube", video_id

        elif host in ("youtu.be", "www.youtu.be"):
            video_id = partes.path.strip("/").split("/")[0]

            if video_id:
                return "youtube", video_id

        elif host in ("open.spotify.com", "www.open.spotify.com"):
            segmentos = partes.path.strip("/").split("/")

            if len(segmentos) >= 2 and segmentos[0] == "track":
                return "spotify", segmentos[1]
    except Exception:
        pass

    raise ValueError(
        "Link inválido. Envia um link de uma música individual "
        "do YouTube ou Spotify."
    )

def procurar_download_existente(plataforma: str, identificador: str) -> Path | None:
    catalogo = carregar_catalogo()

    for musica in catalogo["musicas"]:
        if (
            musica.get("plataforma") == plataforma
            and musica.get("id") == identificador
        ):
            caminho = DOWNLOADS_DIR / musica.get("ficheiro", "")

            if caminho.is_file():
                print(f"♻️ Música já existe: {musica.get('titulo', caminho.name)}")
                print("📂 A reutilizar o áudio guardado em downloads.")
                return caminho

            print("⚠️ Entrada encontrada no catálogo, mas o áudio não existe.")
            return None
    return None


def registar_download(arquivo: Path, plataforma: str, identificador: str, metadados_extra: dict | None = None) -> None:
    catalogo = carregar_catalogo()
    metadados = obter_metadados(arquivo) or {}

    if metadados_extra:
        for chave, valor in metadados_extra.items():
            if valor:
                metadados[chave] = valor

    catalogo["musicas"] = [
        m for m in catalogo["musicas"]
        if not (
            m.get("plataforma") == plataforma
            and m.get("id") == identificador
        )
    ]

    catalogo["musicas"].append({
        "plataforma": plataforma,
        "id": identificador,
        "titulo": metadados.get("titulo") or arquivo.stem,
        "artista": metadados.get("artista"),
        "album": metadados.get("album"),
        "duracao": metadados.get("duracao"),
        "ficheiro": arquivo.name
    })
    guardar_catalogo(catalogo)

def extrair_metadados_youtube(info: dict) -> dict:
    titulo_original = (
        info.get("track")
        or info.get("title")
        or ""
    ).strip()

    artista = (
        info.get("artist")
        or info.get("album_artist")
        or info.get("creator")
        or ""
    ).strip()

    titulo = titulo_original

    # Tenta extrair artista e música de títulos como:
    # Chris Brown - Party (Official Video) ft. Usher
    if " - " in titulo_original:
        partes = titulo_original.split(" - ", 1)

        if not artista:
            artista = partes[0].strip()

        titulo = partes[1].strip()

    elif " – " in titulo_original:
        partes = titulo_original.split(" – ", 1)

        if not artista:
            artista = partes[0].strip()

        titulo = partes[1].strip()

    # Remove indicações promocionais do título.
    titulo = re.sub(
        r"\s*[\(\[]\s*(official\s+)?"
        r"(music\s+)?(video|audio|lyrics?|visualizer|hd)"
        r"[^\)\]]*[\)\]]",
        "",
        titulo,
        flags=re.IGNORECASE
    ).strip()

    # Remove participações do título.
    titulo = re.sub(
        r"\s+(ft\.?|feat\.?|featuring)\s+.*$",
        "",
        titulo,
        flags=re.IGNORECASE
    ).strip()

    duracao = info.get("duration")

    return {
        "titulo": titulo or None,
        "artista": artista or None,
        "album": info.get("album"),
        "duracao": round(duracao) if duracao else None
    }

def descarregar_youtube(url: str, ffmpeg: str) -> tuple[Path, dict]:
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

    opcoes = {
        "format": "bestaudio/best",
        "outtmpl": str(
            DOWNLOADS_DIR / "%(title).150B.%(ext)s"
        ),
        "noplaylist": True,
        "ffmpeg_location": ffmpeg,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192"
        }],
        "quiet": True,
        "no_warnings": True
    }

    print("🎵 A descarregar áudio do YouTube...")

    with YoutubeDL(opcoes) as ydl:
        info = ydl.extract_info(url, download=True)

        caminho = Path(
            ydl.prepare_filename(info)
        ).with_suffix(".mp3")

    if not caminho.is_file():
        raise RuntimeError(
            "O download do YouTube terminou, mas o MP3 não foi encontrado."
        )

    metadados = extrair_metadados_youtube(info)
    return caminho, metadados

def descarregar_spotify(url: str, ffmpeg: str) -> Path:
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

    pasta_temp = Path(tempfile.mkdtemp(
        prefix=".spotdl_"
    ))

    try:
        cmd = [
            sys.executable,
            "-m", "spotdl",
            "download",
            url,
            "--format", "mp3",
            "--ffmpeg", ffmpeg,
            "--output", "{artists} - {title}.{output-ext}",
            "--overwrite", "force"
        ]

        print("🎵 A procurar e descarregar áudio através do Spotify...")

        resultado = subprocess.run(
            cmd,
            cwd=str(pasta_temp)
        )

        if resultado.returncode != 0:
            raise RuntimeError(
                "O spotDL não conseguiu descarregar esta música."
            )

        ficheiros = [
            p for p in pasta_temp.rglob("*.mp3")
            if p.is_file()
        ]

        if not ficheiros:
            raise RuntimeError(
                "O spotDL terminou, mas não encontrei o MP3."
            )

        origem = ficheiros[0]
        destino = DOWNLOADS_DIR / origem.name

        contador = 2

        while destino.exists():
            destino = DOWNLOADS_DIR / (
                f"{origem.stem} ({contador}).mp3"
            )
            contador += 1

        shutil.move(str(origem), str(destino))

        print(f"✅ Áudio descarregado: {destino.name}")

        return destino

    finally:
        shutil.rmtree(pasta_temp, ignore_errors=True)

def obter_audio_por_link(url: str, ffmpeg: str) -> Path:
    plataforma, identificador = identificar_link(url)

    # 1. Verifica se o áudio já existe.
    existente = procurar_download_existente(
        plataforma,
        identificador
    )

    if existente:
        return existente

    # 2. Descarrega o áudio e obtém os metadados.
    if plataforma == "youtube":
        arquivo, metadados = descarregar_youtube(url, ffmpeg)

    else:
        arquivo = descarregar_spotify(url, ffmpeg)
        metadados = obter_metadados(arquivo) or {}

    # 3. Regista o áudio e os metadados.
    registar_download(
        arquivo,
        plataforma,
        identificador,
        metadados
    )
    print(f"✅ Áudio guardado em: {arquivo}")
    return arquivo

def escolher_audio() -> Path:
    print("\n🎵 MUSICIAN\n")
    print("Como queres adicionar a música?\n")
    print("[1] Ficheiro de áudio")
    print("[2] Link do YouTube")
    print("[3] Link do Spotify\n")

    opcao = input("Opção: ").strip()

    if opcao == "1":
        caminho = input("\nIndica o caminho do ficheiro de áudio:\n> ").strip()
        caminho = caminho.strip('"').strip("'")

        arquivo = Path(caminho).expanduser()

        if not arquivo.is_file():
            raise FileNotFoundError(f"Ficheiro não encontrado: {arquivo}")

        return arquivo.resolve()

    if opcao in ("2", "3"):
        url = input("\nCola o link da música:\n> ").strip()

        plataforma, _ = identificar_link(url)

        if opcao == "2" and plataforma != "youtube":
            raise ValueError("Escolheste YouTube, mas o link não é do YouTube.")

        if opcao == "3" and plataforma != "spotify":
            raise ValueError("Escolheste Spotify, mas o link não é do Spotify.")

        ffmpeg = preparar_ambiente_audio()
        print("\n🔎 A identificar música...")

        return obter_audio_por_link(url, ffmpeg)

    raise ValueError("Opção inválida. Escolhe 1, 2 ou 3.")

def remover_warnings():
    # Ignorar warnings específicos
    warnings.filterwarnings(
        "ignore",
        message=r".*cache-system uses symlinks by default.*",
        category=UserWarning
    )

    warnings.filterwarnings(
        "ignore",
        message=r".*unauthenticated requests to the HF Hub.*",
        category=UserWarning
    )

    # Silenciar logs do Hugging Face e HTTP
    logging.getLogger("huggingface_hub").setLevel(logging.ERROR)
    logging.getLogger("httpx").setLevel(logging.ERROR)

    # Silenciar logs do Demucs
    logging.getLogger("demucs").setLevel(logging.ERROR)

def separar(arquivo: Path, saida: Path, modelo: str) -> Path:
    # Cria a pasta 'output' (ou a que foi indicada) se ainda não existir
    saida.mkdir(parents=True, exist_ok=True)

    # Limpeza fixa: apaga qualquer .tmp_* que sobrou de execuções anteriores
    for velha in saida.glob(".tmp_*"):
        shutil.rmtree(velha, ignore_errors=True)

    # Pasta final: output/<nome_da_musica>  (sem a pasta do modelo)
    pasta = saida / arquivo.stem

    print(f"▶ Separando '{arquivo.name}' com o modelo {modelo}...")

    # O Demucs sempre cria <saida>/<modelo>/<musica>, então ele roda numa pasta
    # temporária e depois movemos só a pasta da música para dentro de 'output'.
    tmp = tempfile.mkdtemp(dir=saida, prefix=".tmp_")
    try:
        cmd = [sys.executable, "-m", "demucs", "-n", modelo, "-o", tmp, str(arquivo)]
        if subprocess.run(cmd).returncode != 0:
            sys.exit(
                "Falha no Demucs. Verifica se as dependências de áudio "
                "estão corretamente instaladas no ambiente Python."
            )

        gerada = Path(tmp) / modelo / arquivo.stem
        if not gerada.exists():
            sys.exit(f"Pasta de saída não encontrada: {gerada}")

        # Só apaga o resultado antigo depois que o novo foi gerado com sucesso
        if pasta.exists():
            print(f"\n♻️  '{arquivo.stem}' já existia em {saida}, substituindo...")
            shutil.rmtree(pasta)
        shutil.move(str(gerada), str(pasta))
    finally:
        # Apaga a pasta temporária (.tmp_xxxx) no final, com sucesso ou erro
        shutil.rmtree(tmp, ignore_errors=True)

    return pasta

# ---------------------------------------------------------------------------
# Letra sincronizada
#   1) se existir um arquivo .lrc da música, usa ele (sincronia perfeita);
#   2) senão, transcreve o stem de voz (vocals.wav) com o Whisper, local e grátis.
# O resultado vai para <pasta da música>/letra.json, que o mixer lê sozinho.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# LRCLIB + leitura de metadados
# ---------------------------------------------------------------------------

def parsear_lrc(conteudo: str) -> list[dict]:
    marca = re.compile(r"\[(\d+):(\d+)(?:\.(\d+))?\]")
    linhas = []

    for bruta in conteudo.splitlines():
        timestamps = marca.findall(bruta)
        texto = marca.sub("", bruta).strip()

        if not texto or not timestamps:
            continue

        for minutos, segundos, fracao in timestamps:
            centesimos = float("0." + fracao) if fracao else 0

            tempo = (
                int(minutos) * 60
                + int(segundos)
                + centesimos
            )

            linhas.append({
                "t": round(tempo, 2),
                "text": texto
            })

    linhas.sort(key=lambda linha: linha["t"])
    return linhas

def ler_lrc(caminho: Path) -> list[dict]:
    """Lê um arquivo LRC local."""
    conteudo = caminho.read_text(encoding="utf-8-sig")
    return parsear_lrc(conteudo)

def obter_metadados(arquivo: Path) -> dict | None:
    resultado = {}

    try:
        audio = MutagenFile(str(arquivo), easy=True)

        if audio is not None:

            def obter_tag(nome):
                valor = audio.get(nome)

                if isinstance(valor, list):
                    return str(valor[0]).strip() if valor else None

                return str(valor).strip() if valor else None

            resultado = {
                "titulo": obter_tag("title"),
                "artista": obter_tag("artist"),
                "album": obter_tag("album"),
                "duracao": (
                    round(audio.info.length)
                    if getattr(audio, "info", None)
                    and getattr(audio.info, "length", None)
                    else None
                )
            }

    except Exception as e:
        print(f"⚠️ Erro ao ler metadados do áudio: {e}")

    # Se faltarem dados, procura no catálogo.
    if (
        not resultado.get("titulo")
        or not resultado.get("artista")
        or not resultado.get("duracao")
    ):
        catalogo = carregar_catalogo()

        for musica in catalogo["musicas"]:
            if musica.get("ficheiro") == arquivo.name:

                for chave in ("titulo", "artista", "album", "duracao"):
                    if not resultado.get(chave):
                        resultado[chave] = musica.get(chave)

                break

    if (
        not resultado.get("titulo")
        or not resultado.get("artista")
        or not resultado.get("duracao")
    ):
        return None

    return resultado

def buscar_lrclib(arquivo: Path) -> dict | None:
    metadados = obter_metadados(arquivo)

    if not metadados:
        return None

    print(
        f"🔎 Procurando letra no LRCLIB: "
        f"{metadados['titulo']} - {metadados['artista']}"
    )
    
    params = {
        "track_name": metadados["titulo"],
        "artist_name": metadados["artista"]
    }

    if metadados["album"]:
        params["album_name"] = metadados["album"]

    try:
        resposta = requests.get(
            "https://lrclib.net/api/get",
            params=params,
            headers={"User-Agent": "Musician/1.0"},
            timeout=15
        )

        if resposta.status_code == 404:
            print("⚠️ Música não encontrada no LRCLIB.")
            return None

        resposta.raise_for_status()
        dados = resposta.json()

        if dados.get("instrumental"):
            print("⚠️ LRCLIB identificou a música como instrumental.")
            return None

        sincronizada = dados.get("syncedLyrics")

        if sincronizada:
            linhas = parsear_lrc(sincronizada)

            if linhas:
                print(
                    f"✅ Letra sincronizada encontrada no LRCLIB! "
                    f"{len(linhas)} linhas."
                )
                return {
                    "tipo": "sincronizada",
                    "linhas": linhas
                }

        simples = dados.get("plainLyrics")

        if simples:
            print("✅ Letra encontrada no LRCLIB, sem timestamps.")
            return {
                "tipo": "simples",
                "letra": simples
            }

        print("⚠️ LRCLIB não possui letra disponível.")
        return None

    except requests.exceptions.Timeout:
        print("⚠️ Tempo limite excedido ao consultar LRCLIB.")
        return None

    except requests.exceptions.RequestException as e:
        print(f"⚠️ Erro ao consultar LRCLIB: {e}")
        return None

    except (ValueError, TypeError) as e:
        print(f"⚠️ Resposta inválida do LRCLIB: {e}")
        return None

def normalizar_palavra(texto: str) -> str:
    texto = texto.casefold()
    texto = unicodedata.normalize("NFKD", texto)
    texto = texto.encode("ascii", "ignore").decode("ascii")
    return texto


def transcrever_palavras(
    vocals: Path,
    modelo_whisper: str,
    idioma: str | None
) -> list[dict]:

    print(
        f"📝 Transcrevendo palavras com o Whisper "
        f"'{modelo_whisper}'..."
    )

    modelo = WhisperModel(
        modelo_whisper,
        device="cpu",
        compute_type="int8"
    )

    segmentos, info = modelo.transcribe(
        str(vocals),
        language=idioma,
        vad_filter=True,
        beam_size=5,
        condition_on_previous_text=False,
        word_timestamps=True
    )

    palavras = []

    for seg in segmentos:
        if seg.words:
            for palavra in seg.words:
                texto = palavra.word.strip()
                normalizada = normalizar_palavra(texto)

                if normalizada:
                    palavras.append({
                        "word": texto,
                        "normalizada": normalizada,
                        "t": palavra.start,
                        "end": palavra.end
                    })

        print(
            f"\r   {seg.end:6.0f}s / {info.duration:.0f}s",
            end="",
            flush=True
        )

    print()

    if not palavras:
        raise RuntimeError(
            "O Whisper não conseguiu identificar os tempos das palavras."
        )

    return palavras

def sincronizar_letra_simples(
    letra: str,
    transcricao: list[dict]
) -> list[dict]:

    linhas_letra = [
        linha.strip()
        for linha in letra.splitlines()
        if linha.strip()
    ]

    if not linhas_letra or not transcricao:
        return []

    tokens_letra = []
    intervalos_linhas = []

    for indice_linha, linha in enumerate(linhas_letra):
        inicio = len(tokens_letra)

        palavras = re.findall(r"\b[\w']+\b", linha.casefold())

        for palavra in palavras:
            normalizada = normalizar_palavra(palavra)

            if normalizada:
                tokens_letra.append(normalizada)

        fim = len(tokens_letra)

        if fim > inicio:
            intervalos_linhas.append((indice_linha, inicio, fim))

    tokens_audio = [
        palavra["normalizada"]
        for palavra in transcricao
    ]

    if not tokens_letra or not tokens_audio:
        return []

    comparacao = difflib.SequenceMatcher(
        None,
        tokens_letra,
        tokens_audio,
        autojunk=False
    )

    correspondencias = {}
    total_encontrado = 0

    for bloco in comparacao.get_matching_blocks():
        for i in range(bloco.size):
            indice_letra = bloco.a + i
            indice_audio = bloco.b + i

            correspondencias[indice_letra] = indice_audio
            total_encontrado += 1

    cobertura = total_encontrado / len(tokens_letra)

    print(
        f"🔎 Correspondência entre letra e áudio: "
        f"{cobertura:.0%}"
    )

    if cobertura < 0.20:
        raise RuntimeError(
            "Poucas palavras da letra foram encontradas no áudio."
        )

    tempos_linhas = [None] * len(linhas_letra)

    for indice_linha, inicio, fim in intervalos_linhas:
        encontrados = [
            correspondencias[i]
            for i in range(inicio, fim)
            if i in correspondencias
        ]

        if encontrados:
            primeiro = min(encontrados)

            tempos_linhas[indice_linha] = transcricao[primeiro]["t"]

    conhecidas = [
        i for i, tempo in enumerate(tempos_linhas)
        if tempo is not None
    ]

    if not conhecidas:
        raise RuntimeError(
            "Não foi possível localizar as linhas da letra no áudio."
        )

    # Estimar linhas sem correspondência usando as vizinhas.

    for i in range(len(tempos_linhas)):
        if tempos_linhas[i] is not None:
            continue

        anteriores = [k for k in conhecidas if k < i]
        posteriores = [k for k in conhecidas if k > i]

        if anteriores and posteriores:
            antes = anteriores[-1]
            depois = posteriores[0]

            fracao = (i - antes) / (depois - antes)

            tempos_linhas[i] = (
                tempos_linhas[antes]
                + (tempos_linhas[depois] - tempos_linhas[antes])
                * fracao
            )

        elif anteriores:
            antes = anteriores[-1]
            tempos_linhas[i] = (
                tempos_linhas[antes] + 2.5 * (i - antes)
            )

        else:
            depois = posteriores[0]
            tempos_linhas[i] = max(
                0,
                tempos_linhas[depois] - 2.5 * (depois - i)
            )

    resultado = []

    for i, linha in enumerate(linhas_letra):
        inicio = tempos_linhas[i]

        if i + 1 < len(tempos_linhas):
            fim = tempos_linhas[i + 1]
        else:
            fim = transcricao[-1]["end"]

        resultado.append({
            "t": round(inicio, 2),
            "end": round(max(inicio, fim), 2),
            "text": linha
        })

    return resultado
    
def transcrever_vocais(vocals: Path, modelo_whisper: str, idioma: str | None) -> list[dict]:
    print(f"📝 Transcrevendo a voz com o Whisper '{modelo_whisper}'...")
    modelo = WhisperModel(modelo_whisper, device="cpu", compute_type="int8")
    segmentos, info = modelo.transcribe(
        str(vocals),
        language=idioma,                    # None = detecta sozinho
        vad_filter=True,                    # ignora trechos sem voz (evita "letra fantasma")
        beam_size=5,
        condition_on_previous_text=False,   # evita o Whisper entrar em loop repetindo linhas
    )

    linhas = []
    for seg in segmentos:
        texto = seg.text.strip()
        if texto:
            linhas.append({"t": round(seg.start, 2), "end": round(seg.end, 2), "text": texto})
        print(f"\r   {seg.end:6.0f}s / {info.duration:.0f}s", end="", flush=True)
    print()
    return linhas

def gerar_letra(
    pasta: Path,
    original: Path | None,
    modelo_whisper: str,
    idioma: str | None
) -> None:

    # 1. Procurar um LRC local
    candidatos = [pasta.parent / f"{pasta.name}.lrc"]

    if original is not None:
        candidatos.insert(0, original.with_suffix(".lrc"))

    lrc = next((c for c in candidatos if c.exists()), None)

    if lrc:
        print(f"📝 Usando a letra sincronizada de '{lrc.name}'")
        linhas, fonte = ler_lrc(lrc), "lrc"

    else:
        resultado = (
            buscar_lrclib(original)
            if original is not None else None
        )

        if resultado and resultado["tipo"] == "sincronizada":
            linhas = resultado["linhas"]
            fonte = "lrclib"

        elif resultado and resultado["tipo"] == "simples":
            vocals = pasta / "vocals.wav"

            if not vocals.exists():
                print("⚠️ vocals.wav não encontrado para sincronizar a letra.")
                return

            print("🎵 Sincronizando a letra do LRCLIB com o áudio...")

            try:
                tempos = transcrever_palavras(
                    vocals,
                    modelo_whisper,
                    idioma
                )

                linhas = sincronizar_letra_simples(
                    resultado["letra"],
                    tempos
                )

                fonte = "lrclib"

                print("✅ Letra original do LRCLIB sincronizada!")

            except RuntimeError as e:
                print(f"⚠️ Alinhamento palavra por palavra falhou: {e}")
                print("🔄 Usando transcrição normal do Whisper...")

                linhas = transcrever_vocais(
                    vocals,
                    modelo_whisper,
                    idioma
                )

                fonte = "whisper"

        else:
            # 3. Último recurso: Whisper
            vocals = pasta / "vocals.wav"

            if not vocals.exists():
                print("⚠️ vocals.wav não encontrado, não dá para gerar a letra.")
                return

            linhas = transcrever_vocais(
                vocals,
                modelo_whisper,
                idioma
            )

            fonte = "whisper"

    if not linhas:
        print("⚠️ Nenhuma linha de letra foi encontrada.")
        return

    (pasta / "letra.json").write_text(
        json.dumps(
            {"fonte": fonte, "linhas": linhas},
            ensure_ascii=False
        ),
        encoding="utf-8"
    )

    print(f"✅ Letra salva: {len(linhas)} linhas (fonte: {fonte})")


def gerar_mixer(pasta: Path) -> None:
    if not TEMPLATE.exists():
        sys.exit(f"Template do mixer não encontrado: {TEMPLATE}")
    stems = sorted(p.stem for p in pasta.glob("*.wav"))
    html = TEMPLATE.read_text(encoding="utf-8").replace("__STEMS__", json.dumps(stems))
    (pasta / "mixer.html").write_text(html, encoding="utf-8")

def servir(pasta: Path) -> None:
    # Servidor local necessário porque o navegador bloqueia fetch() em file://
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args, **kwargs):  # silencia o log no terminal
            pass

    handler = functools.partial(Handler, directory=str(pasta))
    # ThreadingHTTPServer atende vários arquivos em paralelo (o TCPServer comum atende um por vez)
    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as httpd:
        url = f"http://127.0.0.1:{httpd.server_address[1]}/mixer.html"
        print(f"\n🎛️  Mixer rodando em {url}")
        print("   (Ctrl+C para encerrar)\n")
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nEncerrado.")

def main():
    ap = argparse.ArgumentParser(
        description="Musician - Separador de Instrumentos/Vocais."
    )

    ap.add_argument(
        "arquivo",
        type=Path,
        nargs="?",
        help="ficheiro de áudio local (opcional)"
    )

    ap.add_argument("--saida", type=Path, default=Path("output"),
                    help="pasta de saída")

    ap.add_argument("--abrir", metavar="NOME",
                    help="abre o mixer de uma música já processada")

    ap.add_argument("--4stems", dest="quatro", action="store_true",
                    help="usa 4 stems em vez de 6")

    ap.add_argument("--sem-mixer", action="store_true",
                    help="só separa, não abre o mixer")

    ap.add_argument("--letra", action="store_true",
                    help="com --abrir: regenera a letra")

    ap.add_argument("--sem-letra", action="store_true",
                    help="não gera a letra sincronizada")

    ap.add_argument("--modelo-letra", default="large-v3",
                    help="modelo do Whisper")

    ap.add_argument("--idioma", default=None,
                    help="idioma da letra, ex.: pt, en, es")

    args = ap.parse_args()

    # Abrir um mixer já existente.
    if args.abrir:
        pasta = args.saida / args.abrir

        if not pasta.exists():
            sys.exit(f"Pasta não encontrada: {pasta}")

        if args.letra:
            try:
                gerar_letra(
                    pasta, None,
                    args.modelo_letra,
                    args.idioma
                )
            except Exception as e:
                print(f"⚠️ Não foi possível gerar a letra: {e}")

        gerar_mixer(pasta)
        servir(pasta)
        return

    try:
        # Se não foi indicado um ficheiro pela linha de comandos,
        # apresenta o menu interativo.
        if args.arquivo is None:
            arquivo = escolher_audio()
        else:
            arquivo = args.arquivo.expanduser().resolve()

            if not arquivo.is_file():
                sys.exit(f"Arquivo não encontrado: {arquivo}")

        modelo = "htdemucs" if args.quatro else "htdemucs_6s"

        print("\n🎚️ A separar instrumentos...")

        pasta = separar(arquivo, args.saida, modelo)

        print(f"\n✅ Stems salvos em: {pasta.resolve()}")

        for w in sorted(pasta.glob("*.wav")):
            print("   -", w.name)

        if not args.sem_letra:
            print("\n🎤 A procurar e sincronizar letra...")

            try:
                gerar_letra(
                    pasta,
                    arquivo,
                    args.modelo_letra,
                    args.idioma
                )
            except Exception as e:
                print(f"⚠️ Não foi possível gerar a letra: {e}")

        if not args.sem_mixer:
            gerar_mixer(pasta)
            print("\n✅ Mixer pronto!")
            servir(pasta)

    except (ValueError, FileNotFoundError, RuntimeError) as e:
        sys.exit(f"\n❌ {e}")

if __name__ == "__main__":
    remover_warnings()
    main()