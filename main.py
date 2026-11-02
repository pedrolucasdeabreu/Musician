import argparse
import functools
import http.server
import json
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import webbrowser
import warnings
import logging
from pathlib import Path

TEMPLATE = Path(__file__).parent / "mixer_template.html"

def remover_warnings():
    import warnings
    import logging

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
    try:
        import demucs  # noqa: F401
    except ImportError:
        sys.exit("Demucs não encontrado. Instale com:  pip install -r requirements.txt")

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
            sys.exit("Falha no Demucs. Veja o erro acima (ffmpeg instalado?).")

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

def ler_lrc(caminho: Path) -> list[dict]:
    """Lê um .lrc ([mm:ss.xx] texto) e devolve [{'t': segundos, 'text': ...}]."""
    marca = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")
    linhas = []
    for bruta in caminho.read_text(encoding="utf-8-sig").splitlines():
        texto = marca.sub("", bruta).strip()
        if not texto:
            continue
        for minutos, segundos in marca.findall(bruta):
            linhas.append({"t": round(int(minutos) * 60 + float(segundos), 2), "text": texto})
    linhas.sort(key=lambda l: l["t"])
    return linhas

def transcrever_vocais(vocals: Path, modelo_whisper: str, idioma: str | None) -> list[dict]:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("faster-whisper não encontrado. Instale com:  pip install faster-whisper")

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

def gerar_letra(pasta: Path, original: Path | None, modelo_whisper: str, idioma: str | None) -> None:
    # Procura um .lrc: ao lado do arquivo original ou dentro de 'output' (<nome>.lrc)
    candidatos = [pasta.parent / f"{pasta.name}.lrc"]
    if original is not None:
        candidatos.insert(0, original.with_suffix(".lrc"))
    lrc = next((c for c in candidatos if c.exists()), None)

    if lrc:
        print(f"📝 Usando a letra sincronizada de '{lrc.name}'")
        linhas, fonte = ler_lrc(lrc), "lrc"
    else:
        vocals = pasta / "vocals.wav"
        if not vocals.exists():
            print("⚠️  vocals.wav não encontrado, não dá para gerar a letra.")
            return
        linhas, fonte = transcrever_vocais(vocals, modelo_whisper, idioma), "whisper"

    if not linhas:
        print("⚠️  Nenhuma linha de letra foi encontrada.")
        return
    (pasta / "letra.json").write_text(
        json.dumps({"fonte": fonte, "linhas": linhas}, ensure_ascii=False), encoding="utf-8")
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
    ap = argparse.ArgumentParser(description="Musician - Separador de Instrumentos/Vocais.")
    ap.add_argument("arquivo", type=Path, nargs="?", help="mp3/wav/flac/m4a...")
    ap.add_argument("--saida", type=Path, default=Path("output"), help="pasta de saída")
    ap.add_argument("--abrir", metavar="NOME",
                    help="abre o mixer de uma música já processada (nome da pasta em output)")
    ap.add_argument("--4stems", dest="quatro", action="store_true",
                    help="usa 4 stems (voz, bateria, baixo, outros) em vez de 6")
    ap.add_argument("--sem-mixer", action="store_true", help="só separa, não abre o mixer")
    ap.add_argument("--letra", action="store_true",
                    help="com --abrir: (re)gera a letra sincronizada de uma música já processada")
    ap.add_argument("--sem-letra", action="store_true", help="não gera a letra sincronizada")
    ap.add_argument("--modelo-letra", default="large-v3",
                    help="modelo do Whisper: tiny, base, small, medium, large-v3 (padrão: large-v3)")
    ap.add_argument("--idioma", default=None,
                    help="idioma da letra, ex.: pt, en, es (padrão: detectar sozinho)")
    args = ap.parse_args()

    if args.abrir:
        pasta = args.saida / args.abrir
        if not pasta.exists():
            sys.exit(f"Pasta não encontrada: {pasta}")
        if args.letra:
            try:
                gerar_letra(pasta, None, args.modelo_letra, args.idioma)
            except Exception as e:
                print(f"⚠️  Não foi possível gerar a letra: {e}")
        gerar_mixer(pasta)   # regenera o HTML para pegar a versão mais recente
        servir(pasta)
        return

    if args.arquivo is None:
        ap.error("informe o arquivo da música ou use --abrir NOME")

    if not args.arquivo.exists():
        sys.exit(f"Arquivo não encontrado: {args.arquivo}")

    modelo = "htdemucs" if args.quatro else "htdemucs_6s"
    pasta = separar(args.arquivo, args.saida, modelo)
    print(f"\n✅ Stems salvos em: {pasta.resolve()}")
    for w in sorted(pasta.glob("*.wav")):
        print("   -", w.name)

    if not args.sem_letra:
        print()
        try:
            gerar_letra(pasta, args.arquivo, args.modelo_letra, args.idioma)
        except Exception as e:   # a letra é um extra: se falhar, o mixer abre normalmente
            print(f"⚠️  Não foi possível gerar a letra: {e}")

    if not args.sem_mixer:
        gerar_mixer(pasta)
        servir(pasta)

if __name__ == "__main__":
    remover_warnings()
    main()