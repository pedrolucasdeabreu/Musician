# Changelog

Todas as alterações relevantes deste projeto serão documentadas neste ficheiro.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/) e o projeto procura seguir [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Added
- Aplicação web Next.js/HeroUI e mobile Capacitor/Konsta UI com autenticação Supabase, biblioteca, favoritos, playlists e embeds oficiais.
- Endpoint autenticado de metadados YouTube/Spotify e integração configurável com provedor licenciado de letras; sem baixar ou armazenar o áudio dos embeds.
- CI para typecheck/build das apps web e mobile.
- Instruções para deploy Vercel, configuração Supabase, deep links mobile e atualizações pelas lojas.
- Instruções para configurar Supabase e Vercel diretamente nos serviços hospedados.
- Testes pgTAP para verificar o isolamento RLS entre dois utilizadores (não executar em produção).
- Estrutura inicial do projeto para aplicações web, mobile, serviço de processamento e Supabase.
- Documentação inicial em `README.md`, `AGENT.md` e `DESIGN.md`.
- Licença GPL-3.0-only.
- Migration inicial com perfis, músicas, playlists, favoritos, tarefas de processamento, buckets privados e políticas RLS.
- Testes iniciais para identificação de links YouTube/Spotify e parsing de letras LRC.
- Workflow de CI e workflow de pré-release por commit distinto recebido na branch `main`.

### Changed
- A página inicial encaminha sessões ausentes para login em vez de responder com erro 500.
- Removida a configuração da Supabase CLI para stack local; migrations e autenticação são configuradas no Supabase hospedado.
- Centralizadas as dependências do processador, testes e lint no `requirements.txt` da raiz; removido `requirements-dev.txt`.
- Padronizada a série Python 3.14; o ambiente local está registado como 3.14.4 e o CI valida com 3.14.10.
- Código Python original movido para `services/processor/main.py`, mantendo `main.py` como entrypoint compatível.
- Funções puras de parsing de links e LRC extraídas para `services/processor/domain.py`.

### Security
- Adicionadas políticas RLS para separar dados por utilizador e políticas de acesso aos buckets privados.
- Adicionadas regras para manter segredos fora do frontend e do controlo de versões.
