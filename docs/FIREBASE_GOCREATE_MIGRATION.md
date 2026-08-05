# Migração Firebase: Vexo → GoCreate dedicado

## Projetos

| Papel | Project ID | Console |
|---|---|---|
| **GoCreate (novo, default)** | `gen-lang-client-0968841856` | https://console.firebase.google.com/project/gen-lang-client-0968841856/overview |
| Legado compartilhado | `vexo-ef6e2` | https://console.firebase.google.com/project/vexo-ef6e2/overview |

Aliases em `.firebaserc`:
- `default` / `gocreate` → `gen-lang-client-0968841856`
- `vexo` → `vexo-ef6e2`

## Por que o project ID não é `gocreate`?

**Os Project IDs do Google Cloud / Firebase não podem ser renomeados** depois de criados. O display name já é **GoCreate**; o site Hosting público é `gocreate-app.web.app`.

Opções:
1. **Manter** `gen-lang-client-0968841856` (recomendado em produção) — display name + URL limpa bastam para a marca.
2. **Migrar** para um projeto novo `gocreate` / `gocreate-app` se a quota permitir — trabalho pesado (Auth, Firestore, Functions, Hosting, secrets, OAuth redirects). Não faças cutover até o novo projeto estar 100% espelhado.

A conta `jpedrox1474@gmail.com` esgotou a **quota de criação de projetos GCP** (`RESOURCE_EXHAUSTED`). Criar `gocreate-app` / `gocreate-prod` falhou. Solução aplicada: ativar Firebase num projeto Gemini existente e renomear o **display name** para **GoCreate** (não o ID).

Para obter um ID limpo no futuro:
1. Pedir aumento de quota: https://support.google.com/code/contact/project_quota_increase  
2. Esperar exclusão permanente dos projetos apagados (`gen-lang-client-0293760474`, `gen-lang-client-0747178634`), **ou**
3. Apagar mais projetos não usados e criar `gocreate` / `gocreate-app`, depois migrar.

## Hosting

| Site | Projeto | URL |
|---|---|---|
| `gocreate-app` (novo) | gen-lang-client-0968841856 | https://gocreate-app.web.app |
| `gocreate` (legado) | vexo-ef6e2 | https://gocreate.web.app |

O site ID `gocreate` é **global** e continua preso ao Vexo. Domínio customizado futuro: Firebase Console → Hosting → site `gocreate-app` → Add custom domain.

## Billing / Blaze

- Billing ligado à conta **Produção** (`0196BF-C633D6-529A64`).
- A conta de billing do Vexo (`01B50C-…`) estava no limite de projetos (“Cloud billing quota exceeded”).
- Functions (2nd gen) / Scheduler exigem Blaze — com billing ativo o projeto deve aceitar deploy.

## Serviços provisionados

- Firestore `(default)` em `southamerica-east1`
- Auth: Email/Password + Google Sign-In (brand GoCreate)
- Hosting site `gocreate-app`
- Web app `GoCreate Web`
- APIs: Functions, Hosting, Auth, Scheduler, Artifact Registry, Cloud Build, Run, Secret Manager, etc.

## Manual (consola)

1. **Auth → Settings → Authorized domains**  
   https://console.firebase.google.com/project/gen-lang-client-0968841856/authentication/settings  
   Adicionar: `gocreate-app.web.app`, `localhost` (firebaseapp.com costuma já existir).

2. **Auth → Sign-in method → GitHub** (se usar login GitHub)  
   https://console.firebase.google.com/project/gen-lang-client-0968841856/authentication/providers  
   Callback: `https://gen-lang-client-0968841856.firebaseapp.com/__/auth/handler`

3. **OAuth apps de terceiros** — atualizar redirect URIs para `https://gocreate-app.web.app/...`  
   (GitHub Export, Mercado Pago, Stripe, PayPal, Meta, YouTube, TikTok). Ver `functions/.env.example`.

4. **Migrar `gocreate.web.app`** (opcional): não dá para “mover” o site entre projetos; usar custom domain no site novo ou manter legado no Vexo até cutover.

## Deploy (estado atual — 2026-08-04)

Já feito neste projeto:
- Firestore rules + indexes
- Auth providers: Email/Password + Google Sign-In
- Functions: `gocreateApi` + `gocreateCronTick` (southamerica-east1)
- Hosting: https://gocreate-app.web.app (rewrite `/api/**` → `gocreateApi` OK)

```bash
npx -y firebase-tools@latest use default
npm --prefix frontend run build
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes,auth,functions,hosting
```
