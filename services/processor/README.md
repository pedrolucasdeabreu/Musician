# Processor

O `main.py` contém o CLI de processamento original. `domain.py` concentra as funções puras que já foram extraídas e testadas.

A versão inicial ainda não é um serviço HTTP nem um worker de fila. A próxima refatoração deve separar:

1. domínio (metadados, URLs, LRC e modelos de dados);
2. casos de uso (importar, separar stems, gerar letras);
3. infraestrutura (FFmpeg, Demucs, Whisper, Storage e fila);
4. interface CLI e futura API/worker.

Não adicionar à aplicação web/mobile qualquer fluxo de extração de áudio de embeds. O caminho planeado para Demucs/Whisper é upload de áudio autorizado pelo utilizador.

O CLI usa `mixer_template.html`, mas esse ficheiro não foi incluído no upload inicial. É necessário recuperá-lo do projeto original antes de considerar o mixer CLI totalmente executável.


## Versão de Python

O processador segue a série Python 3.14 (`>=3.14,<3.15`). O ambiente inicial está registado em `.python-version` como 3.14.4. O CI usa Python 3.14.10 para receber as correções mais recentes da mesma série.


## Instalação de dependências

A partir da raiz do repositório, instalar o conjunto completo com `python -m pip install -r requirements.txt`. A lista `services/processor/requirements.txt` é mantida para identificar separadamente as dependências de runtime do processador.
