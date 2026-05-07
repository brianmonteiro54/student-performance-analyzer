# 📊 Student Performance Analyzer

Aplicação web para análise de desempenho de alunos em turmas AWS re/Start, construída em **JavaScript vanilla com ES Modules**, sem build step. Hospedável diretamente no GitHub Pages.

> Lê arquivos CSV exportados do Canvas LMS, identifica alunos pendentes, gera mensagens personalizadas de acompanhamento e exporta resultados em CSV/Outlook.

---

## ✨ Funcionalidades

- 📥 **Upload via drag & drop** ou seleção de arquivo CSV
- 🔍 **Pré-visualização** com validação antes do processamento
- 📊 **Tabela ordenável e filtrável** por status (graduados, pendentes, em risco, ignorados)
- 🎯 **Critérios configuráveis** de aprovação (Knowledge Checks e Labs)
- 📝 **Geração automática de mensagens** personalizadas com 3 variantes (graduado, sem pendências, com pendências)
- 📧 **Envio em massa** ou individual via Outlook (mailto)
- 📈 **Gráficos** de distribuição por status e atividades pendentes (Chart.js)
- 🌙 **Modo escuro** com persistência
- 📜 **Histórico** dos últimos uploads (localStorage)
- 🚫 **Lista de alunos ignorados** com import/export
- 📅 **Avisos de encerramento** por turma
- ⌨️ **Atalhos de teclado** (`/` busca, `Esc` fecha modais, `D` modo escuro)
- 💾 **100% client-side** nenhum dado sai do navegador

---

## 🏗️ Arquitetura

Refatorada em **camadas com responsabilidades claras**, seguindo princípios de separação de concerns. Sem build step usa ES Modules nativos do navegador.

```
src/
├── main.js              # Entry point registry de actions e event delegation
├── state.js             # Estado global centralizado
├── config.js            # Configurações persistidas (localStorage)
│
├── utils/               # Utilitários puros, sem dependências de domínio
│   ├── dom.js           # $, $$, byId, setHidden, delegate
│   ├── string.js        # normalize, normalizarSectionKey
│   └── format.js        # fixEncoding, formatBytes, getSaudacao, formatarEncerramento
│
├── core/                # Lógica de domínio pura (testável, sem DOM)
│   ├── activity.js      # isKC, isLab, formatarNomeAtividade
│   ├── student.js       # isContaTesteAutomatica, isAlunoIgnorado
│   ├── csv.js           # validateCSV, processCSV
│   ├── status.js        # getStatus + labels/ícones/cores
│   └── message.js       # gerarMensagem (3 variantes)
│
├── services/            # Side-effects (clipboard, storage, exports)
│   ├── clipboard.js     # Cópia + abertura do Outlook
│   ├── history.js       # Histórico de uploads
│   ├── ignored.js       # Gerenciamento da lista de ignorados
│   ├── encerramentos.js # Avisos de encerramento por turma
│   └── exporter.js      # Exportação CSV / mensagens
│
└── ui/                  # Camada de apresentação (lê/escreve no DOM)
    ├── toast.js         # Notificações
    ├── theme.js         # Tema claro/escuro
    ├── modal.js         # Sistema de modais
    ├── progress.js      # Barra de progresso
    ├── dropzone.js      # Drag & drop
    ├── preview.js       # Pré-visualização do CSV
    ├── table.js         # Renderização e ordenação da tabela
    ├── charts.js        # Gráficos Chart.js
    ├── settings.js      # Modal de configurações
    ├── envio.js         # Modal de envio em massa
    ├── area-copia.js    # Área de cópia rápida
    └── shortcuts.js     # Atalhos de teclado

styles/
├── main.css             # Entry @imports na ordem de cascata
├── base/
│   ├── variables.css    # Custom properties (light + dark)
│   └── reset.css        # Reset/normalize
├── layout/
│   ├── header.css
│   └── footer.css
└── components/          # Um arquivo por bloco visual
    ├── upload.css, table.css, modal.css, ...
    └── responsive.css   # Media queries
```

### Decisões de design


- **Event delegation com `data-action`** todos os listeners centralizados em `main.js`. Zero `onclick` inline (incompatível com `type="module"` por causa do escopo).
- **CSS modular com `@import`** divisão por responsabilidade visual. Ordem garantida no `main.css`.
- **Camadas com dependências unidirecionais**  `ui` depende de `services` e `core`; `services` depende de `core`; `core` é puro. Nada depende de `ui`.
- **Estado centralizado** em `state.js` fonte única de verdade, evita variáveis globais espalhadas.

---


## 📦 Dependências externas (CDN)

- [PapaParse](https://www.papaparse.com/) parser CSV robusto
- [Chart.js](https://www.chartjs.org/) gráficos

Ambas carregadas via CDN no `index.html`. 

---

## 📝 Formato esperado do CSV

Exportação padrão do Canvas LMS contendo (no mínimo) as colunas:
- `Student` (nome do aluno)
- `SIS Login ID` (email institucional)
- `Section` (turma ex: `AWS-RESTART-BRSAO-2024-01`)
- Colunas de atividades (Knowledge Checks e Labs)

A aplicação detecta automaticamente:
- Contas de teste do Canvas (nome em padrão de teste, hash hex como email, sem login + zero atividades)
- Normalização `BRASAO` → `BRSAO`

---

## 👨‍💻 Desenvolvedores

<table>
  <tr>
    <td align="center">
      <a href="https://www.linkedin.com/in/anderson-garcia-albuquerque/" target="_blank">
        <img src="assets/anderson-albuquerque.jpg" width="90" style="border-radius:50%"><br>
        <strong>Anderson Albuquerque</strong>
      </a>
    </td>
    <td align="center">
      <a href="https://www.linkedin.com/in/brianrichard1/" target="_blank">
        <img src="assets/brian-richard.jpg" width="90" style="border-radius:50%"><br>
        <strong>Brian Richard</strong>
      </a>
    </td>
  </tr>
</table>

---

## 📄 Licença

© 2025–2026 — Todos os direitos reservados.