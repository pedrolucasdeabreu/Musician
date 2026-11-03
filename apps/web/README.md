# Musician Web

Aplicação Next.js + React + HeroUI preparada para deploy pela Vercel.

## Executar

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
npm run test
npm run typecheck
npm run build
```

Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no `.env.local`. Ative Email e Google no Supabase e permita `http://localhost:3000/auth/callback` nos redirect URLs.

O app inclui cadastro/login, login Google, biblioteca, favoritos, playlists, embeds do YouTube/Spotify e uma API autenticada para obter metadados. As letras só são carregadas se um provedor licenciado estiver configurado conforme o contrato e as variáveis em `.env.example`.

Para Vercel, defina `apps/web` como Root Directory e configure as variáveis de ambiente no Dashboard. A CI também executa testes de validação dos URLs suportados.
