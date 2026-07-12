# 🏠 Mudei — Organizador de Mudança

Um app web para organizar a sua mudança de casa, criado a partir da planilha
`planilha_gastos_mudanca.xlsx` — todos os itens, links de preços, medidas e
observações da planilha já vêm carregados.

**➡️ Depois de publicar (veja abaixo), o app fica em:** `https://SEU-USUARIO.github.io/Mudei/`

## O que o app faz

| Aba | Para quê |
| --- | --- |
| **Resumo** | Contagem regressiva para o dia da mudança, orçamento previsto × gasto × economia, teto de gastos com alerta, itens de prioridade alta pendentes, progresso por categoria e atividade recente da equipe |
| **Compras** | A planilha, turbinada: itens por categoria com prioridade, condição (novo/usado/doação), orçamento, melhor preço, preço pago, medidas do espaço, links de lojas, doador e responsável. Busca, filtros, ordenação, "copiar lista de pendências" para o WhatsApp e **kit enxoval** — sugestões de ~50 itens que todo mundo esquece, para adicionar com um toque |
| **Tarefas** | Checklist de mudança pré-montado em 4 fases (planejamento, semana da mudança, dia D, primeiros dias), com prazo e responsável |
| **Caixas** | Inventário de caixas numeradas: conteúdo, cômodo de destino, frágil ⚠️, "abrir primeiro" ⭐ e status (empacotando → fechada → no destino → desfeita). A busca responde "em qual caixa está a panela?" |
| **Equipe** | Cadastre quem está ajudando e atribua compras e tarefas a cada pessoa |
| **Ajustes** | Nome e data da mudança, teto de gastos, tema claro/escuro, categorias personalizadas, backup |

Outros recursos:

- **Funciona como aplicativo (PWA):** dá para instalar com ícone na tela inicial e usar offline.
- **Colaboração sem servidor:** o botão de compartilhar gera um **link que carrega todos os dados**. Quem abre pode **mesclar** com o que já tem — o app junta as alterações mantendo a versão mais recente de cada item. Também dá para exportar/importar arquivo de backup `.json`.
- **Cada pessoa se identifica** no primeiro acesso e as alterações ficam assinadas ("Pedro marcou Geladeira como comprado").
- Os dados ficam no navegador de cada pessoa (localStorage) — nada é enviado a servidor nenhum.

## 🚀 Como publicar no GitHub Pages

Só precisa fazer uma vez:

1. Abra o repositório no GitHub → **Settings** → **Pages** (menu lateral).
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Vá na aba **Actions** → workflow **"Publicar no GitHub Pages"** → botão **Run workflow**
   (ou apenas faça qualquer push). Aguarde ~1 minuto.
4. Pronto! O app fica em `https://SEU-USUARIO.github.io/Mudei/` e é republicado
   automaticamente a cada push.

> Enquanto o Pages não estiver ativado nas Settings, as execuções do workflow
> falham com "Resource not accessible by integration" — é esperado; ative e rode de novo.

Alternativa sem Actions: em **Source**, escolha **Deploy from a branch**, selecione o
branch principal e a pasta `/ (root)`.

### Adicionar o atalho no celular

- **Android (Chrome):** abra o app → menu ⋮ → **Adicionar à tela inicial** (ou "Instalar app").
- **iPhone (Safari):** abra o app → botão de compartilhar → **Adicionar à Tela de Início**.

O ícone 🏠 laranja aparece como um app normal.

## 🤝 Como usar em equipe

1. Cada pessoa abre o app e diz seu nome no primeiro acesso.
2. Quem tem os dados mais atuais toca no botão **compartilhar** (topo) → **Copiar link com os dados** e manda no grupo do WhatsApp.
3. Quem recebe abre o link e escolhe **Mesclar** — as alterações de todo mundo se juntam (para cada item vale a edição mais recente).
4. Repitam o passo 2–3 de vez em quando para manter todo mundo em dia.

## 🛠️ Desenvolvimento

App 100% estático — HTML, CSS e JavaScript puros, sem build e sem dependências.

```
index.html            estrutura e formulários
css/style.css         tema claro/escuro, mobile-first
js/seed.js            dados iniciais (importados da planilha) e checklist
js/app.js             lógica: estado, views, filtros, compartilhamento
sw.js                 service worker (offline)
manifest.webmanifest  manifesto PWA
icons/                ícones do app
```

Para rodar localmente: `python3 -m http.server 8000` e abra `http://localhost:8000`.
