# DESIGN.md — Sistema visual do Musician

> Documento de direção visual inicial. Os componentes concretos serão implementados nas apps web e mobile; estes tokens são a referência para ambas.

## 1. Princípios

- **Foco na música:** vídeo, player e letra devem dominar o ecrã; a navegação é secundária.
- **Leitura confortável:** letra atual com destaque claro, linhas anteriores/próximas com menor ênfase.
- **Consistência multiplataforma:** mesmos nomes, cores e hierarquia; padrões de interação adaptados a desktop e mobile.
- **Densidade controlada:** biblioteca eficiente sem parecer um painel administrativo.
- **Acessibilidade:** contraste WCAG AA como objetivo, foco visível, navegação por teclado e alvos táteis confortáveis.

## 2. Direção visual

Estética escura, contemporânea e editorial, inspirada em software de áudio. Superfícies neutras, acento violeta para ações primárias e azul-ciano para estados de reprodução/sincronização. Evitar gradientes e sombras decorativas em excesso.

### Tokens de cor

| Token | Dark | Light | Utilização |
|---|---|---|---|
| `background` | `#0D1017` | `#F7F8FA` | Fundo principal |
| `surface` | `#151A24` | `#FFFFFF` | Cards e painéis |
| `surface-raised` | `#1D2532` | `#EEF1F5` | Menus, hover e painéis elevados |
| `border` | `#303949` | `#DCE1E8` | Divisores e contornos |
| `text-primary` | `#F4F6FA` | `#171B24` | Texto principal |
| `text-muted` | `#A5AFBF` | `#596579` | Metadados e texto secundário |
| `primary` | `#9B7BFF` | `#6941D9` | Ações primárias e seleção |
| `playback` | `#45C6E8` | `#087F9D` | Progresso e sincronização |
| `success` | `#42C98A` | `#168653` | Sucesso |
| `danger` | `#F07178` | `#C63843` | Erro e ações destrutivas |

Não usar apenas a cor para comunicar estado; combinar com texto/ícone.

## 3. Tipografia

- Família preferida: Inter; fallback: system-ui, sans-serif.
- Títulos de página: 24–28 px, peso 650–700.
- Títulos de secção: 16–20 px, peso 600.
- Texto base: 14–16 px, peso 400.
- Metadados: 12–13 px, peso 400–500.
- Letra sincronizada: 18–22 px em desktop; 16–20 px em mobile, com line-height entre 1.5 e 1.7.
- Linha atual: peso 650 e cor de alto contraste; anterior/próxima com cor secundária.

## 4. Espaçamento e formas

- Escala base: 4, 8, 12, 16, 24, 32 e 48 px.
- Cards/painéis: padding 16–24 px.
- Raio pequeno: 8 px; padrão: 12 px; modal/player: 16 px.
- Botões: altura mínima 40 px na web e 44 px no mobile.
- Alvos táteis: preferencialmente 44 × 44 px ou maiores.
- Bordas discretas; sombras apenas para elementos sobrepostos.

## 5. Layout web

- Sidebar persistente: 232–256 px, com Biblioteca, Favoritos, Playlists e músicas recentes.
- Topbar: pesquisa global, ações contextuais e perfil.
- Biblioteca: lista/tabela de músicas com título, artista, origem e ações rápidas.
- Ecrã de reprodução: vídeo à esquerda e letra à direita em duas colunas, com proporções iniciais próximas de 1:1. Em larguras intermédias, reduzir a sidebar ou permitir recolhê-la.
- Player persistente inferior: faixa atual, play/pause, navegação, progresso e volume.
- Estados necessários: loading, vazio, erro, sem letra, vídeo indisponível e embed bloqueado.

## 6. Layout mobile

- Vídeo/player primeiro; letra imediatamente abaixo, em fluxo vertical.
- Barra superior compacta com voltar/título e menu.
- Navegação inferior para Início, Biblioteca, Favoritos e Playlists; evitar sidebar fixa.
- Player e controlos com alvos táteis grandes; considerar safe areas de iOS.
- Listas com cartões compactos e ações acessíveis por menu contextual.
- Konsta UI deve seguir o padrão visual iOS/Material selecionado pelo sistema, mantendo tokens Musician para cor e tipografia.

## 7. Componentes

- `TrackRow` / `TrackCard`: artwork, título, artista, origem, favorito e menu.
- `PlaylistCard`: capa/colagem, nome, contagem e ações.
- `MediaEmbed`: player de YouTube/Spotify com proporção e fallback.
- `SyncedLyrics`: letra com linha ativa e scroll automático controlado.
- `PlaybackBar`: controlos, progresso e estado de reprodução.
- `Sidebar` / `BottomNavigation`: navegação por breakpoint/plataforma.
- `AuthForm`: login, registo, Google OAuth e feedback de validação.
- `EmptyState`, `ErrorState`, `Skeleton`: estados de conteúdo.

## 8. Comportamento da letra

- A linha ativa é determinada pela posição de reprodução recebida do player.
- O scroll automático deve ser suave, mas parar temporariamente quando o utilizador navegar manualmente pela letra.
- Letra sem timestamps deve ser apresentada sem fingir sincronização.
- Se a API do player não permitir obter posição em determinado contexto, apresentar a letra sem sincronização e explicar o estado.

## 9. Regras de conteúdo e embeds

- Usar os players oficiais e respeitar os seus controlos, marca e políticas.
- Não esconder elementos obrigatórios dos players.
- Não prometer reprodução em background quando a plataforma/player não o suportar.
- Não extrair nem armazenar o stream de áudio dos embeds.

## 10. Motion e feedback

- Transições discretas entre 120–200 ms.
- Evitar animações contínuas e respeitar `prefers-reduced-motion`.
- Feedback imediato para favorito, adicionar à playlist, upload e processamento.
- Tarefas longas devem mostrar progresso real ou estado de fila; nunca inventar percentagens.
