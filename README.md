# Musician

Aplicação para organizar músicas e acompanhar letras licenciadas ao lado de players oficiais. O processador Python legado é separado do fluxo web/mobile.

> **Estado:** MVP web e shell mobile implementados. A aplicação suporta autenticação Supabase, biblioteca pessoal, playlists, favoritos e embeds oficiais; a produção ainda depende das credenciais dos serviços e da configuração das lojas.

## Objetivos de produto

- Incorporar players oficiais do YouTube e Spotify para reprodução, sem descarregar automaticamente a música.
- Mostrar vídeo e letra sincronizada lado a lado na web e em coluna no mobile.
- Permitir contas, favoritos e playlists sincronizados entre dispositivos.
- Manter o processamento Python legado separado da biblioteca web/mobile; a app não recebe nem baixa áudio de embeds.
- Disponibilizar web na Vercel e backend/dados no Supabase.
- Manter licença GPL-3.0-only para o código do projeto, sujeita à auditoria de compatibilidade das dependências.

## Estrutura

```text
apps/
  web/                  # Next.js + HeroUI, pronta para deploy na Vercel
  mobile/               # React + Capacitor + Konsta UI
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
- O motor CLI legado ainda existe, mas não integra a aplicação web/mobile e não deve ser usado para obter áudio de embeds.

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

## Web: Vercel e Supabase

O projeto conecta-se exclusivamente aos serviços hospedados; não mantém uma stack Supabase local. A Vercel deve usar `apps/web` como **Root Directory**, com os comandos padrão de instalação e build do Next.js.

1. Cria o projeto no Supabase Dashboard.
2. No **SQL Editor**, aplica a migration em `supabase/migrations/` uma única vez. Confirma o projeto e faz backup antes de executar SQL em produção.
3. Em **Authentication > URL Configuration**, define a URL de produção como **Site URL** e adiciona `https://SEU_DOMINIO/auth/callback` aos redirect URLs.
4. Em **Authentication > Sign In / Providers**, ativa Email e Google. Configura OAuth no Google Cloud com callback `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
5. Na Vercel, configura `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Se houver um provedor de letras licenciado, configura também `LICENSED_LYRICS_API_URL` e `LICENSED_LYRICS_API_KEY` como variáveis server-side.
6. Liga o repositório à Vercel. Cada push em `main` publica a versão web automaticamente.

A migration cria as tabelas de perfil, músicas, playlists e favoritos e aplica RLS. O teste pgTAP em `supabase/tests/rls.test.sql` contém dados de teste; executa-o apenas numa base descartável, nunca em produção. A aplicação não necessita da chave `service_role`.

### Letras e áudio

- O app obtém título, autor e imagem por oEmbed do YouTube ou Spotify e apresenta o iframe/player oficial.
- O áudio dos embeds não é descarregado nem armazenado.
- Letras são opcionais e só são consultadas em `LICENSED_LYRICS_API_URL` com credencial server-side para um provedor que autorize expressamente a exibição no app. O contrato esperado é `GET ?title=...&artist=...`, resposta `{ "lyrics": [{ "t": 12.5, "text": "..." }], "source": "..." }` e `404` quando não houver letra. Sem provedor, a interface informa que a letra está indisponível.
- O player do YouTube permite destacar a linha pela posição de reprodução quando a letra contém timestamps. O embed do Spotify não fornece essa posição à aplicação; nele, a letra é apresentada sem sincronização.
- O endpoint de identificação requer uma sessão autenticada e não usa URL fornecida pelo usuário para fazer fetch arbitrário: só aceita IDs válidos dos hosts oficiais.

## GitHub Actions

- `ci.yml` valida Python e faz typecheck/build das apps web e mobile em Pull Requests e pushes para `main`.
- `release-on-main.yml` cria um GitHub pré-release por commit distinto recebido em `main`, com tag `main-<sha-curto>`. O release contém o snapshot do código; não substitui publicação da app nas lojas.

## Variáveis de ambiente

- Web: ver [`apps/web/.env.example`](./apps/web/.env.example); em produção configurar na Vercel.
- Mobile: ver [`apps/mobile/.env.example`](./apps/mobile/.env.example); valores públicos do Supabase e URL da API Vercel são incluídos no bundle, não colocar segredos nestas variáveis.
- Não commitar segredos.

## Mobile e atualizações

```powershell
cd apps/mobile
npm ci
npm run dev
npm run build
npm run cap:sync
```

O mobile usa Capacitor para Android/iOS e Konsta UI para a interface. Os projetos nativos já estão no repositório. A web recebe deploy automático pela Vercel. As atualizações nativas são distribuídas pelas lojas e instaladas conforme as preferências do dispositivo; cada atualização nativa requer build assinado, credenciais de publicação e aprovação da loja. O projeto ainda não tem contas/segredos das lojas nem pipeline de publicação configurados.

Para login Google e confirmação de email nativos, autoriza `com.musician.app://auth/callback` em Supabase **Authentication > URL Configuration**. O deep link já está registrado nos projetos Android/iOS. A URL da API Vercel no mobile permite os origins nativos padrão `https://localhost` e `capacitor://localhost`; origins customizados usam `MOBILE_APP_ORIGIN` no servidor.

> Não usar atualizações OTA para contornar a revisão das lojas. O código nativo deve ser distribuído pelos canais oficiais.

## Licença

Este projeto é distribuído sob GPL-3.0-only. Ver `LICENSE`. As dependências, modelos, bibliotecas e conteúdos de terceiros mantêm as respetivas licenças e termos; a inclusão no projeto não os relicencia automaticamente.
