# 📊 Desempenho Acadêmico — AWS re/Start

Sistema web para análise e acompanhamento do desempenho dos alunos do programa AWS re/Start, desenvolvido para facilitar o monitoramento de Knowledge Checks (KCs), Labs e o envio de feedbacks personalizados por e-mail.

> **Versão 2.0** — Validação de CSV, configurações personalizáveis, modal de envio em massa que contorna bloqueio de pop-ups, gráficos interativos, drag & drop, atalhos de teclado, detecção automática de contas de teste e alunos sem convite aceito, reprocessamento automático ao alterar configurações, e mensagem celebrativa para graduados.

---

## 🚀 Funcionalidades

### 📁 Carregamento inteligente
- **Drag & drop** ou clique para selecionar
- **Validação prévia** do arquivo CSV (colunas obrigatórias, tamanho máx. 10MB, encoding)
- **Preview com resumo** antes de processar (alunos válidos, ignorados, KCs ativos, Labs ativos, graduados, limite mínimo)
- **Avisos contextuais** para situações como turma pequena, e-mails inválidos, ou todas as atividades abaixo do threshold
- **Histórico** dos últimos 5 arquivos carregados

### ⚙️ Configurações personalizáveis (persistidas em `localStorage`)

- **Limite mínimo de alunos** para considerar atividade ativa (padrão: 5)
  - **Auto-ajuste** para turmas pequenas (se a turma tiver menos alunos que o limite, ele se adapta automaticamente)
- **Critérios de status**:
  - KC ≥ X% para "OK" (padrão: 70)
  - Lab ≥ X% para "OK" (padrão: 95)
- **Assunto do e-mail** customizável

### 🚫 Filtros automáticos de alunos não-elegíveis

O sistema detecta e filtra automaticamente, de forma transparente:

| Tipo | Critério de detecção | Exemplo |
|---|---|---|
| **Conta de teste do Canvas** | Nome com padrão `aluno, Testar` ou e-mail é hash hex (sem `@`) | `aluno, Testar` (e-mail = `fe89a207...`) |
| **Não aceitou convite** | `SIS Login ID` vazio **e** zero KCs/Labs preenchidos | Aluno fantasma na lista da turma |

Esses casos aparecem como avisos no preview e não interferem nos cálculos da turma. **Critério conservador**: alunos sem e-mail mas com atividades preenchidas (caso edge real) são preservados na tabela.

### 📊 Análise visual

- **Tabela interativa** com filtros (clicáveis nos contadores), busca, ordenação, barra de progresso por aluno, e linha expansível mostrando KCs e Labs pendentes
- **Gráficos toggleable**:
  - 🥧 Distribuição por status (donut)
  - 📈 Média da turma em KCs, Labs e Total (barras)

### 🎯 Classificação automática

| Status | Critério |
|---|---|
| 🟢 OK | KC ≥ critério **e** Lab ≥ critério |
| 🔴 Crítico | KC < critério **e** Lab < critério |
| 🟡 Atenção | Apenas um dos critérios atingido |
| 🎓 Graduado | Coluna `Graduated Final Points` = 1 (independe de outras notas) |

### 📧 Envio de e-mails (sem bloqueio do navegador)

**Por aluno:**
- 📋 Copiar mensagem personalizada (com pendências individuais)
- ✉️ Abrir Outlook Web já preenchido (destinatário + assunto + corpo)

**Em massa** (Críticos / Atenção):
1. **📨 Um por um** — abre cada e-mail manualmente, sem bloqueio de pop-ups, com indicador "✅ Aberto"
2. **📋 Copiar todos** — lista de e-mails separados por `;` para colar em Cco
3. **💾 Exportar mensagens** — baixa `.txt` ou `.csv` com todas as mensagens prontas para revisão/arquivamento

**Mensagem para graduados** 🎓 — texto celebrativo automático parabenizando pela conclusão (ao invés do template padrão de cobrança).

### 📋 Cópia de desempenho em massa

Cole uma lista de e-mails → recebe a tabela de desempenho **na mesma ordem** (Total, Lab, KC) em formato pronto para colar em planilha (separado por tab).

### 🔄 Reprocessamento automático

Sempre que algo muda no contexto de cálculo, o sistema **reprocessa automaticamente** o CSV em memória — mantendo a tela sempre consistente:

- Ignorar/restaurar um aluno
- Mudar o limite mínimo (`minAlunos`)
- Importar lista de ignorados

Isso evita o problema sutil de cálculos ficarem obsoletos: quando você ignora alunos, atividades no limite do threshold podem deixar de ser ativas, e os outros alunos têm suas médias e pendências recalculadas.

### 🛡️ Lista de ignorados manualmente

- Botão **🚫** em cada linha da tabela para ignorar um aluno (usa e-mail como chave; cai no ID Canvas se o e-mail estiver vazio)
- **Timestamp ISO 8601** registrando quando cada aluno foi ignorado
- **Lista gerenciável** no modal ⚙️ Configurações (ver, restaurar)
- **Persistência:** salvo no `localStorage` do navegador
- **Backup JSON:** botões de exportar/importar para preservar a lista entre máquinas, navegadores ou após limpeza de cache (essencial para cursos de 4+ meses)

### 🌙 Dark Mode

- Persistido no `localStorage`
- Atalho: tecla **D**
- Gráficos ajustam cores automaticamente

### ⌨️ Atalhos de teclado

| Atalho | Ação |
|---|---|
| `/` | Focar na busca |
| `Esc` | Fechar modais e limpar busca |
| `D` | Alternar tema escuro |

### 📱 Responsividade

Layout adapta-se automaticamente para desktop, tablet e mobile (colunas menos importantes ocultas em telas pequenas).

---

## 📐 Cálculo de desempenho

### 📘 KCs
Média aritmética dos KCs ativos. Atividades vazias contam como `0`.

### 🧪 Labs
Média dos Labs ativos, normalizada para escala 0–100% (cada lab é considerado feito = 100% se o valor for > 0).

### 📊 Total
Média aritmética entre KC e Lab.

### ⏳ Pendência
Atividade é considerada pendente apenas quando a célula está vazia. Qualquer valor preenchido (inclusive `0` ou `0,00`) é considerado realizado.

### 🎯 Atividade ativa
Um KC ou Lab só entra no cálculo se pelo menos N alunos válidos tiverem a célula preenchida (N configurável, padrão 5).

---

## 🗂️ Formato do CSV esperado

Arquivo deve ser exportado diretamente do **Canvas LMS**, sem alterações no Excel.

| Coluna | Finalidade |
|---|---|
| `Student` | Nome do aluno (formato `Sobrenome, Nome`) |
| `ID` | ID Canvas (usado como fallback se e-mail estiver vazio) |
| `SIS Login ID` | E-mail do aluno |
| `Graduated Final Points` | `1` indica aluno graduado |
| `NNN...KC...` | Knowledge Checks (colunas começando com número e contendo `KC`) |
| `NNN...Lab...` | Laboratórios (colunas começando com número e contendo `Lab`) |

A linha `Points Possible` é ignorada automaticamente.

---

## 📁 Estrutura do projeto

```
📦 student-performance-analyzer
 ┣ 📄 index.html       # Estrutura da interface (modais, tabela, gráficos)
 ┣ 📄 style.css        # Estilos, dark mode e responsividade
 ┣ 📄 app.js           # Lógica principal (validação, processamento, gráficos, envio)
 ┣ 📁 assets/
 ┃ ┣ 🖼️ anderson-albuquerque.jpg
 ┃ ┗ 🖼️ brian-richard.jpg
 ┗ 📄 README.md
```

---

## 🛠️ Tecnologias utilizadas

| Tecnologia        | Finalidade                  |
| ----------------- | --------------------------- |
| HTML5             | Estrutura da aplicação      |
| CSS3              | Estilização e dark mode     |
| JavaScript (ES6+) | Lógica da aplicação         |
| PapaParse         | Leitura e parsing do CSV    |
| Chart.js          | Gráficos                    |

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
