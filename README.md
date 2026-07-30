# GoCreate.dev

Clone full-stack do Lovable/Bolt.new — MVP, Fase 1.

## Estrutura do monorepo

```
gocreate/
├── frontend/          # React + Vite + Tailwind + Sandpack
│   ├── src/
│   │   ├── App.jsx            # UI principal — agora com auth guard + histórico real do Firestore
│   │   ├── main.jsx           # Envolve o App com o AuthProvider
│   │   ├── index.css
│   │   ├── firebase.js        # SDK client do Firebase (Auth + Firestore)
│   │   ├── context/
│   │   │   └── AuthContext.jsx  # Login Google / Email-senha / registro / logout
│   │   ├── pages/
│   │   │   └── Login.jsx        # Tela de login e registro, mesmo tema visual
│   │   └── lib/
│   │       └── projects.js      # getOrCreateDefaultProject, listenToMessages, saveMessage
│   ├── .env.example
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
│
└── backend/           # Node.js + Express
    ├── config/
    │   ├── firebaseAdmin.js   # Firebase Admin SDK (server-side)
    │   └── cloudinary.js      # Upload de mídia
    ├── middleware/
    │   └── auth.js            # Valida o ID Token do Firebase (Authorization: Bearer ...)
    ├── prompts/
    │   └── systemPrompt.js    # System Prompt do GoCreate (tags <gocreate_artifact>)
    ├── routes/
    │   ├── chat.js             # POST /api/chat   -> streaming SSE + Anthropic + Firestore
    │   └── upload.js           # POST /api/upload -> Multer -> Cloudinary
    ├── server.js
    ├── .env.example
    └── package.json
```

## Como rodar (Fase 1)

```bash
# Frontend
cd frontend
cp .env.example .env      # preencha com as chaves do seu projeto Firebase
npm install
npm run dev                # abre em http://localhost:5173

# Backend (em outro terminal)
cd backend
cp .env.example .env      # preencha Anthropic, Firebase Admin e Cloudinary
npm install
npm run dev                # sobe em http://localhost:4000
```

Teste rápido do backend: `curl http://localhost:4000/api/health`

### Testando as rotas da Fase 2

Ambas exigem um ID Token válido do Firebase no header `Authorization: Bearer <token>`
(gere um logando no frontend, ou temporariamente via `firebase auth:sign-in` no console).

```bash
# Chat (streaming SSE)
curl -N -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{"projectId":"teste123","messages":[{"role":"user","text":"Crie um botão azul"}]}'

# Upload de arquivo
curl -X POST http://localhost:4000/api/upload \
  -H "Authorization: Bearer SEU_TOKEN" \
  -F "file=@/caminho/para/imagem.png"
```

## Status das fases

- [x] **Fase 1 — Setup:** monorepo, package.json, configs de Firebase e Cloudinary.
- [x] **Fase 2 — Backend real:** `/api/chat` com streaming (SSE) + Anthropic SDK + System Prompt
  (tags `<gocreate_artifact>`) + histórico salvo no Firestore; `/api/upload` (Multer → Cloudinary);
  middleware `requireAuth` validando o token do Firebase em ambas as rotas.
- [x] **Fase 3 — Auth e persistência no frontend:** tela de login/registro (Google + Email/Senha)
  usando o mesmo tema visual do app; o `App.jsx` agora exige login antes de mostrar o workspace;
  cada usuário ganha um "projeto padrão" automaticamente e o histórico de chat é lido/escrito
  em tempo real do Firestore (`onSnapshot`) em vez de ficar só em estado local.
- [ ] **Fase 4 — Motor de geração real no frontend:** trocar o mock de resposta da IA por uma
  chamada real a `POST /api/chat` (streaming), parser das tags `<gocreate_artifact>`/`<file>`,
  integração do Sandpack pra rodar o código gerado de verdade no preview, UI de upload de mídia
  no chat conectada à rota `/api/upload`.

## Sobre a regra de segurança do Firestore

Como o frontend agora lê/escreve direto no Firestore (client SDK), configure regras de
segurança no Console do Firebase para que cada usuário só acesse os próprios projetos, por
exemplo:

```
match /projects/{projectId} {
  allow read, write: if request.auth != null && request.auth.uid == resource.data.ownerId;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.ownerId;

  match /messages/{messageId} {
    allow read, write: if request.auth != null;
  }
}
```
(Ajuste conforme a granularidade que você quiser — isso é só um ponto de partida.)

## Variáveis de ambiente necessárias

Veja `.env.example` em cada pasta. Resumo:

| Onde | Variável | Para quê |
|---|---|---|
| frontend | `VITE_FIREBASE_*` | Auth e Firestore no client |
| frontend | `VITE_API_URL` | Aponta pro backend |
| backend | `ANTHROPIC_API_KEY` | Chamadas ao Claude |
| backend | `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` | Firebase Admin (validação de token, Firestore server-side) |
| backend | `CLOUDINARY_*` | Upload de imagens/vídeos/docs |
