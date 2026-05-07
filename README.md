# 📊 Desempenho Acadêmico — AWS re/Start

Sistema web para análise e acompanhamento do desempenho dos alunos do programa AWS re/Start, desenvolvido para facilitar o monitoramento de Knowledge Checks (KCs), Labs e o envio de feedbacks personalizados por e-mail.

> **Versão 2.0** — Inclui validação de CSV, configurações personalizáveis, modal de envio em massa que contorna bloqueio de pop-ups, gráficos interativos, drag & drop e atalhos de teclado.

---

## 🚀 Funcionalidades

### 📁 Carregamento inteligente
- **Drag & drop** ou clique para selecionar
- **Validação prévia** do arquivo CSV (colunas obrigatórias, encoding, e-mails)
- **Preview com resumo** antes de processar (alunos, KCs, Labs detectados)
- **Histórico** dos últimos 5 arquivos carregados

### ⚙️ Configurações personalizáveis
- **Limite mínimo de alunos** para considerar atividade ativa (padrão: 5)
  - **Auto-ajuste** para turmas pequenas (se a turma tiver menos alunos que o limite, ele se adapta)
- **Critérios de status** (KC ≥ 70% e Lab ≥ 95% por padrão) totalmente editáveis
- **Assunto do e-mail** customizável
- Tudo persiste no `localStorage`

### 📊 Análise visual
- **Tabela interativa** com filtros, busca, ordenação e barra de progresso por aluno
- **Linha expansível** mostrando KCs e Labs pendentes ao clicar
- **Gráficos** (toggleable):
  - 🥧 Distribuição por status (donut)
  - 📈 Média da turma em KCs, Labs e Total (barras)

### 🎯 Classificação automática
- 🔴 **Crítico** — KC < critério **e** Lab < critério
- 🟡 **Atenção** — apenas um dos critérios atingido
- 🟢 **OK** — KC ≥ critério **e** Lab ≥ critério
- 🎓 **Graduado** — coluna `Graduated Final Points` = 1

### 📧 Envio de e-mails (sem bloqueio do navegador)
- Botão individual por aluno (📋 copiar mensagem + ✉️ abrir Outlook)
- **Modal de envio em massa** com 3 modos:
  1. **📨 Um por um** — abre cada e-mail manualmente (sem bloqueio de pop-up)
  2. **📋 Copiar todos** — lista de e-mails separados por `;` para colar em CC/BCC
  3. **💾 Exportar mensagens** — `.txt` ou `.csv` com todas as mensagens prontas
- Mensagens com saudação dinâmica (Bom dia/Boa tarde/Boa noite) e listagem de pendências

### 📋 Cópia de desempenho em massa
- Cole uma lista de e-mails → recebe a tabela de desempenho **na mesma ordem** (Total, Lab, KC) pronta para colar em planilha

### 🌙 Dark Mode
- Persistido no `localStorage`
- Atalho: tecla **D**

### ⌨️ Atalhos de teclado
| Atalho     | Ação                               |
| ---------- | ---------------------------------- |
| `/`        | Focar na busca                     |
| `Esc`      | Fechar modais e limpar busca       |
| `D`        | Alternar tema escuro               |

---

## 📐 Cálculo de desempenho

### 📘 KCs
Média aritmética de todos os KCs ativos.

### 🧪 Labs
Média dos Labs ativos, normalizada para a escala de 0 a 100% (cada lab é considerado feito = 100% se o valor for > 0).

### 📊 Total
Média entre KC e Lab.

### ⏳ Pendências
Uma atividade é considerada pendente quando a célula está vazia no CSV. Qualquer valor preenchido (inclusive `0` ou `0,00`) é considerado realizado.

### 🎯 Atividade ativa
Um KC ou Lab só é incluído no cálculo se pelo menos N alunos tiverem a célula preenchida (N configurável, padrão 5). Isso evita que provas/atividades feitas por poucos alunos distorçam as médias da turma.

---

## 🗂️ Formato do CSV esperado

O arquivo deve ser exportado diretamente do Canvas LMS, sem alterações no Excel.

| Coluna                    | Finalidade                     |
| ------------------------- | ------------------------------ |
| `Student`                 | Nome do aluno                  |
| `SIS Login ID`            | E-mail do aluno                |
| `Graduated Final Points`  | Indica se o aluno foi graduado |
| `NNN...KC...`             | Knowledge Checks               |
| `NNN...Lab...`            | Laboratórios                   |

A linha `Points Possible` é ignorada automaticamente.

---

## 📁 Estrutura do projeto

```
📦 student-performance-analyzer
 ┣ 📄 index.html       # Estrutura da interface
 ┣ 📄 style.css        # Estilos, dark mode e responsividade
 ┣ 📄 app.js           # Lógica principal (validação, processamento, gráficos)
 ┣ 📁 assets/
 ┃ ┣ 🖼️ anderson-albuquerque.jpg
 ┃ ┗ 🖼️ brian-richard.jpg
 ┗ 📄 README.md
```

---

## ▶️ Como utilizar

### 1️⃣ Hospedagem (GitHub Pages)
Faça o fork ou push deste repositório e habilite o GitHub Pages em **Settings → Pages → Source: main / root**. Não há build — funciona como site estático.

### 2️⃣ Acesse o site
Abra a URL do GitHub Pages no navegador.

### 3️⃣ Exporte o CSV do Canvas
**Notas → Exportar → CSV** (não edite no Excel).

### 4️⃣ Carregue o arquivo
Arraste o CSV para a área indicada ou clique para selecionar. Confira o **preview** (alunos, KCs ativos, Labs ativos, avisos) e clique em **Confirmar**.

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
