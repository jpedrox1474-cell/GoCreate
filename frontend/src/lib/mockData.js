export const MOCK_PROJECTS = [
  {
    id: 'landing-saas',
    name: 'Landing SaaS Premium',
    description: 'Página de conversão com hero, pricing e CTA.',
    updatedAt: 'Há 2 horas',
    createdAt: '2026-07-28',
    status: 'draft',
    color: 'from-blue-600 to-indigo-600',
    framework: 'React + Tailwind',
  },
  {
    id: 'dashboard-analytics',
    name: 'Dashboard Analytics',
    description: 'Painel com gráficos, KPIs e filtros em tempo real.',
    updatedAt: 'Ontem',
    createdAt: '2026-07-25',
    status: 'deployed',
    color: 'from-emerald-600 to-teal-600',
    framework: 'React + Recharts',
  },
  {
    id: 'checkout-pix',
    name: 'Checkout Pix & Cartão',
    description: 'Fluxo de pagamento com Pix QR e cartão.',
    updatedAt: 'Há 5 dias',
    createdAt: '2026-07-20',
    status: 'draft',
    color: 'from-violet-600 to-purple-600',
    framework: 'React + Stripe',
  },
];

export const MOCK_MESSAGES = {
  'landing-saas': [
    {
      id: 'm1',
      role: 'ai',
      text: 'Olá! Sou o assistente GoCreate. Descreve o que queres construir e eu gero a interface e o código em tempo real.',
    },
    {
      id: 'm2',
      role: 'user',
      text: 'Cria uma landing page moderna para um SaaS de produtividade.',
    },
    {
      id: 'm3',
      role: 'ai',
      text: 'Pronto! Montei uma landing com hero, secção de features, pricing e CTA. Podes pedir alterações no chat — por exemplo “troca a cor primária para azul” ou “adiciona testemunhos”.',
    },
  ],
  'dashboard-analytics': [
    {
      id: 'm1',
      role: 'ai',
      text: 'Projeto Dashboard Analytics carregado. O que queres ajustar?',
    },
  ],
  'checkout-pix': [
    {
      id: 'm1',
      role: 'ai',
      text: 'Checkout Pix & Cartão pronto para editar. Diz-me o próximo passo.',
    },
  ],
  default: [
    {
      id: 'm1',
      role: 'ai',
      text: 'Olá! Bem-vindo ao GoCreate. O que vamos construir hoje?',
    },
  ],
};

export const MOCK_FILES = {
  'src/App.jsx': `import React from 'react';
import Hero from './components/Hero';
import './styles.css';

export default function App() {
  return (
    <div className="app">
      <Hero />
    </div>
  );
}
`,
  'src/components/Hero.jsx': `import React from 'react';

export default function Hero() {
  return (
    <section className="hero">
      <p className="eyebrow">Gerado por IA</p>
      <h1>Landing gerada ao vivo</h1>
      <p className="lead">
        Este preview vem dos ficheiros extraídos do chat — pede alterações para ver o Sandpack atualizar.
      </p>
      <button type="button">Começar agora</button>
    </section>
  );
}
`,
  'src/styles.css': `* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: system-ui, sans-serif;
  background: #09090b;
  color: #e4e4e7;
}
.app { min-height: 100vh; }
.hero {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 3rem;
  background: radial-gradient(ellipse at top left, #1e3a5f 0%, #09090b 55%);
}
.eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #60a5fa;
  margin-bottom: 1rem;
}
h1 {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 700;
  color: #fafafa;
  max-width: 16ch;
  margin-bottom: 1rem;
}
.lead {
  color: #a1a1aa;
  max-width: 36rem;
  line-height: 1.6;
  margin-bottom: 1.75rem;
}
button {
  background: #2563eb;
  color: white;
  font-weight: 600;
  padding: 0.75rem 1.25rem;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
}
button:hover { background: #3b82f6; }
`,
};

const DEMO_ARTIFACT = `<gocreate_artifact title="Landing gerada">
<file path="src/App.jsx">
import React from 'react';
import Hero from './components/Hero';
import './styles.css';

export default function App() {
  return (
    <div className="app">
      <Hero />
    </div>
  );
}
</file>
<file path="src/components/Hero.jsx">
import React from 'react';

export default function Hero() {
  return (
    <section className="hero">
      <p className="eyebrow">Gerado por IA</p>
      <h1>Landing gerada ao vivo</h1>
      <p className="lead">
        Este preview vem dos ficheiros extraídos do chat — pede alterações para ver o Sandpack atualizar.
      </p>
      <button type="button">Começar agora</button>
    </section>
  );
}
</file>
<file path="src/styles.css">
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: system-ui, sans-serif;
  background: #09090b;
  color: #e4e4e7;
}
.app { min-height: 100vh; }
.hero {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 3rem;
  background: radial-gradient(ellipse at top left, #1e3a5f 0%, #09090b 55%);
}
.eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #60a5fa;
  margin-bottom: 1rem;
}
h1 {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 700;
  color: #fafafa;
  max-width: 16ch;
  margin-bottom: 1rem;
}
.lead {
  color: #a1a1aa;
  max-width: 36rem;
  line-height: 1.6;
  margin-bottom: 1.75rem;
}
button {
  background: #2563eb;
  color: white;
  font-weight: 600;
  padding: 0.75rem 1.25rem;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
}
button:hover { background: #3b82f6; }
</file>
</gocreate_artifact>`;

export const AI_REPLIES = [
  `Atualizei o layout com base no teu pedido. Confere o Live Preview à direita — podes pedir mais ajustes quando quiseres.
${DEMO_ARTIFACT}`,
  `Feito! Ajustei os componentes e o estilo. Experimenta interagir no preview ou muda para a aba Código para ver o diff.
${DEMO_ARTIFACT}`,
  DEMO_ARTIFACT,
  `Pronto. Refatorei a secção pedida e mantive o design system consistente. Diz-me o próximo passo.
${DEMO_ARTIFACT}`,
];

export const PENDING_PROMPT_KEY = 'gocreate_pending_prompt';

/** Mid-generation snapshot so reload doesn't leave ghost "AI will fix" / blank UI. */
export const GENERATION_STATE_KEY = 'gocreate_generation_in_progress';

export function getProjectById(id) {
  return MOCK_PROJECTS.find((p) => p.id === id) || {
    id,
    name: id === 'new' ? 'Novo Projeto' : 'meu-projeto',
    description: 'Projeto criado com GoCreate',
    status: 'draft',
    framework: 'React + Tailwind',
  };
}

export function getMessagesForProject(id) {
  return MOCK_MESSAGES[id] || MOCK_MESSAGES.default;
}
