# Musician Mobile

App React + Capacitor + Konsta UI para Android e iOS.

## Executar no browser

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

## Sincronizar e abrir projetos nativos

```powershell
npm run build
npm run cap:sync
npm run cap:open:android
npm run cap:open:ios
```

Os projetos `android/` e `ios/` já fazem parte do repositório, com o deep link de autenticação configurado.

Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_MUSICIAN_API_URL` no ambiente de build. Estes valores são públicos no bundle; nunca inclua chaves secretas.

O OAuth nativo usa `com.musician.app://auth/callback`. Registre a URL nos redirect URLs do Supabase. O deep link já está configurado nos projetos Android/iOS. A publicação/assinatura nas lojas ainda requer credenciais de desenvolvedor e configuração de build próprias de cada plataforma.
