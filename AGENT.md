# AGENT.md — Instruções para agentes de desenvolvimento

## Missão

Desenvolver o Musician: uma aplicação web/mobile para biblioteca musical, playlists, favoritos, letras sincronizadas e processamento opcional de áudio autorizado pelo utilizador.

## Fonte de verdade

- Este ficheiro define regras de trabalho para agentes.
- `README.md` descreve como executar o projeto e o estado atual.
- `DESIGN.md` define a experiência e o sistema visual.
- `CHANGELOG.md` regista alterações segundo Keep a Changelog.
- `supabase/migrations/` é a fonte de verdade do esquema SQL versionado.
- `supabase/tests/` contém testes pgTAP destinados a uma base de dados isolada.
- O motor Python atual está em `services/processor/`; não presumir que o antigo CLI já é um serviço web.

## Estado atual — implementado nesta fundação

- [x] App web Next.js/React/HeroUI com login/cadastro, Google OAuth, biblioteca, busca, embeds, favoritos e playlists.
- [x] App mobile React/Capacitor/Konsta UI com autenticação, embeds, biblioteca, favoritos e playlists.
- [x] API autenticada que valida IDs de YouTube/Spotify e obtém metadados sem descarregar áudio.
- [x] Contrato opcional para provedor de letras licenciado; ausência de provedor/resultado é apresentada ao utilizador.
- [x] Layout web com player e letra em colunas; layout mobile em coluna com player antes da letra.
- [x] Estrutura inicial de projeto.
- [x] Código CLI recebido movido para `services/processor/main.py`, mantendo `main.py` como entrypoint compatível.
- [x] Extração de `identificar_link` e `parsear_lrc` para `services/processor/domain.py`.
- [x] Testes unitários iniciais para URLs e parsing LRC.
- [x] Migration inicial Supabase `202611020001_initial_schema.sql` com perfis, músicas, playlists, favoritos, tarefas, buckets privados e RLS.
- [x] Teste pgTAP inicial criado em `supabase/tests/rls.test.sql` para isolamento entre dois utilizadores; não executar em produção.
- [x] Documentação inicial, GPL-3.0-only, CI e release automático por commit recebido em `main`.

## Ainda por fazer

1. Confirmar decisões de arquitetura e executar auditoria de dependências/licenças.
2. Criar os projetos Supabase/Vercel hospedados, aplicar a migration e configurar Email/Google, URLs e variáveis de produção.
3. Selecionar e contratar/configurar provedor de letras com licença explícita para exibição no app.
4. Assinar e publicar os projetos Android/iOS nas lojas com credenciais próprias.
5. Configurar pipeline de builds/release mobile e acompanhar aprovação das lojas; atualizações nativas são entregues por elas.
6. Ampliar testes de integração, observabilidade, acessibilidade e documentação.

## Versão de Python

- O projeto requer Python `>=3.14,<3.15`; usar a série Python 3.14.
- `.python-version` regista a versão 3.14.4 usada no ambiente de desenvolvimento inicial.
- O CI valida com Python 3.14.10 para incluir as correções de manutenção e segurança mais recentes disponíveis nesta série.
- Não baixar a versão mínima para Python 3.13 sem decisão explícita e nova validação das dependências.

## Arquitetura e limites

- Web: Next.js + React + HeroUI, deploy na Vercel.
- Mobile: React + Capacitor + Konsta UI.
- Auth/DB/Storage: Supabase (PostgreSQL, Auth, Storage e RLS).
- Processamento pesado: worker Python independente com Demucs, Whisper e FFmpeg.
- CI/CD: GitHub Actions.
- Web: Vercel; cada push em `main` publica o site quando o repositório estiver conectado ao projeto.
- Releases GitHub: um pré-release por commit distinto recebido em `main`.
- Atualizações mobile: distribuição pelas lojas; não usar OTA para contornar revisão.
- Letras: buscar somente num provedor cuja licença permita explicitamente armazenar e exibir o conteúdo no app.
- Não colocar processamento pesado de Demucs/Whisper em funções serverless da Vercel.
- Os embeds são players de terceiros; não fornecem o áudio original para Demucs.
- O processamento requer um ficheiro fornecido pelo utilizador e cuja utilização esteja autorizada.

## Segurança obrigatória

- Nunca colocar `SUPABASE_SERVICE_ROLE_KEY`, tokens de worker ou segredos OAuth no frontend, app mobile ou logs.
- Toda a tabela com dados privados deve ter RLS ativado e políticas testadas.
- Validar permissões, tamanho, tipo MIME e extensão dos uploads no servidor; não confiar no cliente.
- Usar caminhos de Storage com o UUID do utilizador como primeiro segmento.
- Validar URLs e IDs externos antes de guardar ou incorporar conteúdo.
- Não renderizar HTML/URLs fornecidas pelo utilizador sem sanitização/validação.
- Não fazer scraping, download ou rehosting de áudio de plataformas a partir de embeds.
- O fluxo web/mobile usa apenas oEmbed para metadados e iframes oficiais para reprodução; não chamar funções de download do CLI legado.
- Nunca configurar um endpoint de letras sem verificar direitos de exibição, armazenamento, território e atribuição exigida pelo fornecedor.
- Não expor tarefas de processamento de um utilizador a outro.

## Regras de desenvolvimento

- Preservar compatibilidade quando mudar o CLI, salvo quando a tarefa pedir explicitamente uma breaking change.
- Não criar features apenas como mocks apresentados como funcionais.
- Preferir funções pequenas e testáveis; separar domínio, infraestrutura e interface.
- Novas migrations devem ser aditivas sempre que possível e nunca editar migrations já aplicadas em ambientes partilhados.
- Adicionar testes para parsing, autenticação/autorização, RLS e fluxos críticos.
- Atualizar `CHANGELOG.md` em cada alteração relevante, dentro de `Unreleased`.
- Atualizar `DESIGN.md` quando tokens, componentes ou layouts forem alterados.
- Atualizar este `AGENT.md` quando o estado, arquitetura, comandos ou convenções mudarem.
- Toda a funcionalidade deve ter estados loading, vazio, erro e sucesso.
- Interfaces devem ser acessíveis por teclado/leitor de ecrã e respeitar contraste suficiente.

## Dependências Python

- `requirements.txt` na raiz é o único ponto de instalação normal e inclui as dependências do processador, `pytest` e `ruff`.
- `services/processor/requirements.txt` mantém a lista modular das dependências específicas do processador e é incluído pelo ficheiro da raiz.
- Não recriar `requirements-dev.txt`; novas ferramentas de desenvolvimento/testes devem ser adicionadas ao `requirements.txt` da raiz quando aprovadas.

## Comandos

```bash
python -m pip install -r requirements.txt
python -m pytest
ruff check .
python -m compileall -q .
```

Web (`apps/web`): `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build`.

Mobile (`apps/mobile`): `npm ci`, `npm run dev`, `npm run build`, `npm run cap:sync`. Os projetos Android/iOS e os deep links OAuth já estão versionados.

## Definition of Done

Uma tarefa só está concluída quando:

1. O comportamento pedido está implementado sem segredos hardcoded.
2. Existem testes adequados e passam localmente/CI.
3. RLS e permissões foram considerados quando há dados de utilizador.
4. Documentação e `CHANGELOG.md` foram atualizados.
5. Não foram introduzidas dependências/licenças incompatíveis sem aprovação.
6. A resposta final indica claramente o que foi feito, o que foi testado e o que depende de credenciais/serviços externos.
