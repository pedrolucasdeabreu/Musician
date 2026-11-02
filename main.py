import argparse
import functools
import http.server
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import webbrowser
from pathlib import Path

TEMPLATE = Path(__file__).parent / "mixer_template.html"

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
    args = ap.parse_args()

    if args.abrir:
        pasta = args.saida / args.abrir
        if not pasta.exists():
            sys.exit(f"Pasta não encontrada: {pasta}")
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

    if not args.sem_mixer:
        gerar_mixer(pasta)
        servir(pasta)

if __name__ == "__main__":
    main()