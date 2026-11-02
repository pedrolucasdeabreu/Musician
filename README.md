# Separador de Stems e Mixer Local

Aplicação de linha de comando que separa uma música em stems usando Demucs e,
por padrão, abre um mixer local no navegador. O mixer permite reproduzir, pausar,
parar, navegar pela música e ajustar o volume, o mute e o solo de cada faixa.

## Requisitos

- Python 3.8 ou superior.
- FFmpeg instalado e disponível no `PATH` para ler formatos como MP3 e M4A.
- Conexão à internet na primeira execução para o Demucs baixar o modelo.
  Depois do download, a separação pode ser feita localmente.

## Instalação

Na pasta do projeto, instale a dependência Python:

```bash
python -m pip install -r requirements.txt
```

Instale também o FFmpeg conforme o seu sistema operacional e confirme que o
comando `ffmpeg` está disponível no terminal.

## Utilização

Separar uma música com o modelo padrão de seis stems e abrir o mixer:

```bash
python main.py minha_musica.mp3
```

Usar o modelo de quatro stems (voz, bateria, baixo e outros):

```bash
python main.py minha_musica.mp3 --4stems
```

Escolher a pasta onde os resultados serão guardados:

```bash
python main.py minha_musica.mp3 --saida meus_stems
```

Separar sem abrir o mixer:

```bash
python main.py minha_musica.mp3 --sem-mixer
```

Os stems são gravados numa subpasta com o nome do modelo e da música. Por
exemplo, com as opções padrão, os arquivos ficam em
`stems_saida/htdemucs_6s/minha_musica/`. O mixer `mixer.html` é criado nessa
mesma pasta e servido localmente; pressione `Ctrl+C` no terminal para encerrar
o servidor.
