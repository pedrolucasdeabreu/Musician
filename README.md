# Musician

Aplicação para organizar músicas, acompanhar letras sincronizadas e, quando o utilizador fornece áudio que tem direito a processar, separar instrumentos e voz.

> **Estado:** fundação do projeto em desenvolvimento. O código Python original foi preservado como motor CLI. Web, mobile, autenticação e execução remota de tarefas ainda não estão implementados.

## Objetivos de produto

- Incorporar players oficiais do YouTube e Spotify para reprodução, sem descarregar automaticamente a música.
- Mostrar vídeo e letra sincronizada lado a lado na web e em coluna no mobile.
- Permitir contas, favoritos e playlists sincronizados entre dispositivos.
- Permitir upload de áudio autorizado para processamento por Demucs/Whisper.
- Disponibilizar web na Vercel e backend/dados no Supabase.
- Manter licença GPL-3.0-only para o código do projeto, sujeita à auditoria de compatibilidade das dependências.

## Estrutura

```text
apps/
  web/                  # Next.js + HeroUI (a implementar)
  mobile/               # React + Capacitor + Konsta UI (a implementar)
services/
  processor/            # Motor Python e funções de domínio
supabase/
  migrations/           # Esquema PostgreSQL e políticas RLS
  tests/                # Testes pgTAP da base de dados e RLS (para DB isolada)
.github/workflows/      # CI e releases automáticos
 tests/                 # Testes automatizados
```

## Requisitos

- Python 3.14 (série suportada: `>=3.14,<3.15`). O ambiente local indicado em `.python-version` é 3.14.4.
- O CI usa Python 3.14.10, uma atualização de manutenção da mesma série com correções de segurança.
- Todas as dependências do projeto (processamento, testes e lint) são instaladas através do `requirements.txt` na raiz. O ficheiro `services/processor/requirements.txt` mantém a lista modular das dependências específicas do processador.
- Para executar o mixer, o ficheiro `services/processor/mixer_template.html` também é necessário. Esse ficheiro não estava incluído no material inicial recebido e, por isso, não foi inventado nesta migração.

## Executar o processador (modo CLI legado)

```bash
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
python main.py --help
```

A execução sem argumentos abre o menu CLI original. O comportamento atual de download do YouTube/Spotify é legado e **não deve ser usado como arquitetura da versão web/mobile**. A nova reprodução deve usar os embeds oficiais; o processamento de stems deve receber áudio fornecido pelo utilizador e autorizado para esse fim.

## Testes e qualidade

```bash
python -m pytest
ruff check .
python -m compileall -q .
```

## Produção: Supabase e Vercel

O projeto conecta-se exclusivamente aos serviços hospedados; não mantém uma stack Supabase local.

1. Cria o projeto no Supabase Dashboard.
2. No **SQL Editor**, aplica uma única vez o conteúdo da migration em `supabase/migrations/`. Faz backup e confirma que estás no projeto de produção antes de executar SQL.
3. Em **Authentication > URL Configuration**, define a URL de produção da aplicação como **Site URL** e adiciona os URLs de redirect usados pela aplicação.
4. Em **Authentication > Sign In / Providers**, ativa os métodos de autenticação pretendidos. Para Google, configura as credenciais no Dashboard e usa o callback apresentado pelo Supabase: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
5. Na Vercel, configura as variáveis de ambiente de produção indicadas em `.env.example`, usando a URL e a chave pública do projeto Supabase. Publica a aplicação pela integração da Vercel.

A migration cria as tabelas, políticas RLS e buckets privados `audio-inputs` e `audio-outputs`. O teste pgTAP em `supabase/tests/rls.test.sql` contém utilizadores e dados de teste; executa-o apenas numa base isolada, nunca na produção. A chave `SUPABASE_SERVICE_ROLE_KEY` é exclusivamente server-side/worker-side e nunca deve ser exposta ao browser, ao bundle mobile ou ao repositório.

## GitHub Actions

- `ci.yml` valida sintaxe Python, testes e lint em Pull Requests e pushes para `main`.
- `release-on-main.yml` cria um GitHub Release de pré-lançamento por cada commit distinto recebido num push para `main`, com tag `main-<sha-curto>`. Os releases iniciais contêm o código-fonte; os instaladores/binários serão anexados quando os targets desktop/mobile forem implementados. A numeração SemVer de versões estáveis será definida quando o fluxo de distribuição/autoupdate estiver implementado.

## Variáveis de ambiente

Configura os valores de produção diretamente nas definições de ambiente da Vercel. Não commitar segredos.

## Licença

Este projeto é distribuído sob GPL-3.0-only. Ver `LICENSE`. As dependências, modelos, bibliotecas e conteúdos de terceiros mantêm as respetivas licenças e termos; a inclusão no projeto não os relicencia automaticamente.
