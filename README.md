# Musician

Musician é uma ferramenta de linha de comandos para separar faixas de áudio em stems (vocais, bateria, baixo, piano, guitarra, etc.) usando Demucs, criar uma letra sincronizada e abrir um mixer local no navegador para ouvir e ajustar cada faixa individualmente.

O projeto foi pensado para trabalhar bem em fluxo local: baixa áudio de ficheiros locais ou links do YouTube/Spotify, separa as faixas, tenta gerar letra sincronizada com LRCLIB e Whisper, e depois disponibiliza um mixer HTML que corre localmente em `http://127.0.0.1:<porta>/mixer.html`.

## Funcionalidades

- Separação de áudio em stems com Demucs
- Suporte a ficheiros locais e links do YouTube/Spotify
- Cache de downloads em `downloads/` e catálogo em `catalogo_downloads.json`
- Geração automática de letra sincronizada a partir de:
  - ficheiro `.lrc` local
  - LRCLIB
  - transcrição do stem de vocais via Whisper
- Mixer local com:
  - play/pause/stop
  - seek da reprodução
  - controlo de volume, mute e solo por stem
  - visualização de waveform por faixa
  - sincronização de letra em tempo real
- Reaproveitamento de músicas já baixadas para evitar repetição de downloads

## Requisitos

- Python 3.8+ (o projeto foi desenvolvido com Python moderno e usa type hints)
- FFmpeg instalado e disponível no `PATH`
- Internet para:
  - descarregar modelos Demucs na primeira vez
  - consultar LRCLIB
  - importar música a partir de YouTube/Spotify
- Dependências Python listadas em `requirements.txt`

## Instalação

1. Clone ou abra a pasta do projeto.
2. Crie um ambiente virtual (opcional, mas recomendado):

```bash
python -m venv .venv
```

3. Ative o ambiente:

Windows PowerShell:
```powershell
.\.venv\Scripts\Activate.ps1
```

Windows CMD:
```cmd
.venv\Scripts\activate.bat
```

Linux/macOS:
```bash
source .venv/bin/activate
```

4. Instale as dependências:

```bash
python -m pip install -r requirements.txt
```

5. Instale o FFmpeg e confirme que o comando funciona:

```bash
ffmpeg -version
```

Se o FFmpeg não estiver no `PATH`, o programa tenta resolver a localização via `imageio-ffmpeg`, mas é recomendável garantir que o executável esteja acessível no terminal.

## Estrutura do projeto

```text
Musician/
├── main.py                 # CLI principal e lógica do pipeline
├── mixer_template.html     # Template do mixer local
├── catalogo_downloads.json # catálogo de músicas já baixadas
├── requirements.txt        # dependências Python
├── downloads/              # ficheiros áudio baixados
├── output/                 # stems e mixer gerados por música
├── README.md               # documentação do projeto
└── .gitignore
```

## Uso

### 1) Separar uma música local

```bash
python main.py "C:\caminho\para\musica.mp3"
```

Se o ficheiro for local, o programa separa os stems no diretório `output/` e, por defeito, abre o mixer em navegador.

### 2) Separar a partir de um link do YouTube ou Spotify

O programa também pode pedir a fonte de importação interativamente se nenhum ficheiro for passado:

```bash
python main.py
```

No menu, escolhe:
- `1` para ficheiro local
- `2` para YouTube
- `3` para Spotify

Também pode passar o link diretamente num comando, desde que o tipo seja válido. O áudio é guardado em `downloads/` e registado no catálogo.

### 3) Usar o modelo de 4 stems em vez de 6

```bash
python main.py "musica.mp3" --4stems
```

Com esta opção, o Demucs usa o modelo `htdemucs` em vez de `htdemucs_6s`.

### 4) Definir pasta de saída

```bash
python main.py "musica.mp3" --saida "meus_stems"
```

### 5) Separar sem abrir o mixer

```bash
python main.py "musica.mp3" --sem-mixer
```

### 6) Abrir um mixer de uma música já processada

Se a música já foi separada e está em `output/`, basta indicar o nome da pasta correspondente:

```bash
python main.py --abrir "G-Eazy - Provide (Official Video) ft. Chris Brown, Mark Morrison"
```

Se quiser regenerar a letra de uma música já pronta:

```bash
python main.py --abrir "G-Eazy - Provide (Official Video) ft. Chris Brown, Mark Morrison" --letra
```

Também pode abrir um mixer sem ter de repetir a separação quando a música já está em cache no catálogo e no diretório `downloads/`:

```bash
python main.py --abrir "nome_da_musica"
```

Isto é útil quando a música já foi baixada anteriormente e o processamento já está concluído; o script só abre a pasta `output/<nome_da_musica>` e serve o HTML do mixer.

### 7) Desativar a geração automática de letra

```bash
python main.py "musica.mp3" --sem-letra
```

### 8) Escolher o modelo de Whisper para a letra

```bash
python main.py "musica.mp3" --modelo-letra "large-v3"
```

### 9) Forçar um idioma para a transcrição da letra

```bash
python main.py "musica.mp3" --idioma "pt"
```

## Opções da CLI

O programa expõe estas opções principais:

```text
usage: main.py [-h] [--saida SAIDA] [--abrir NOME] [--4stems] [--sem-mixer]
               [--letra] [--sem-letra] [--modelo-letra MODELO_LETRA]
               [--idioma IDIOMA] [arquivo]
```

Parâmetros:

- `arquivo`: ficheiro local de áudio opcional
- `--saida`: pasta de saída (padrão: `output`)
- `--abrir NOME`: abre o mixer de uma música já processada em `output/NOME`
- `--4stems`: usa `htdemucs` (4 stems)
- `--sem-mixer`: separa sem abrir o mixer
- `--letra`: gera ou regenera a letra quando usado com `--abrir`
- `--sem-letra`: desativa a geração automática de letra
- `--modelo-letra`: modelo Whisper a usar para transcrição (padrão: `large-v3`)
- `--idioma`: idioma da música para a transcrição, por exemplo `pt`, `en`, `es`

## Como funciona a separação

Quando executas o programa:

1. O ficheiro audio é validado ou o sistema pede a origem (local/YouTube/Spotify)
2. O áudio é guardado em `downloads/` quando provém de URL
3. O Demucs separa a faixa em stems em `output/<nome_da_musica>/`
4. O programa procura letra usando, por ordem:
   - ficheiro `.lrc` local
   - LRCLIB
   - transcrição do stem de vocais com Whisper
5. O mixer HTML é gerado em `output/<nome_da_musica>/mixer.html`
6. O navegador abre a interface local e o servidor HTTP fica ativo até pressionares `Ctrl+C`

## Saída esperada

Um processamento bem-sucedido cria algo do género:

```text
output/
└── G-Eazy - Provide (Official Video) ft. Chris Brown, Mark Morrison/
    ├── bass.wav
    ├── drums.wav
    ├── guitar.wav
    ├── letra.json
    ├── mixer.html
    ├── other.wav
    ├── piano.wav
    ├── vocals.wav
    └── ...
```

## Observações importantes

- O Demucs pode demorar alguns minutos, especialmente na primeira execução
- A primeira vez que usa um modelo novo pode exigir ligação à internet
- O mixer corre em localhost e não depende de um serviço externo
- O ficheiro `catalogo_downloads.json` serve como cache para não repetir downloads do mesmo áudio
- Se a música não for encontrada no LRCLIB, o programa tenta transcrever a letra com Whisper usando o stem de vocais

## Troubleshooting

### `ffmpeg` não encontrado

Certifica-te de que o FFmpeg está instalado e que o comando `ffmpeg` está disponível:

```bash
ffmpeg -version
```

### Demucs falha ao separar

Confirma que o ambiente tem todas as dependências instaladas e que o Python usado é o mesmo em que fizeste `pip install -r requirements.txt`.

### Mixer não abre

O programa abre o navegador automaticamente, mas também podes abrir manualmente a URL indicada no terminal.

### Letra não aparece no mixer

Pode acontecer quando:
- a música não foi encontrada no LRCLIB
- a transcrição do Whisper não encontrou palavras suficientes
- o stem `vocals.wav` não foi gerado corretamente

Nesses casos, o programa tenta continuar sem quebrar o fluxo e indica avisos no terminal.

## Licença

Este projeto não incluiu uma licença explícita no repositório, pelo que a utilização deve seguir o contexto do projeto e os termos do código de terceiros utilizados (Demucs, Whisper, LRCLIB, spotDL, yt-dlp, etc.).

## Contribuição

Se quiseres melhorar o projeto, podes:

- otimizar a lógica de geração de letra
- melhorar o mixer visual
- adicionar suporte a mais fontes de áudio
- tratar mais edge cases de metadados e download
