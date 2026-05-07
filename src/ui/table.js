/**
 * Renderização da tabela principal — tudo que envolve a #table.
 *
 * Responsabilidades:
 *   - renderTable():       reconstrói o tbody com os dados filtrados/ordenados
 *   - sortTable(key):      alterna ordenação por coluna
 *   - filterTable(status): aplica filtro de status (chamado pelos contadores)
 *   - searchTable():       aplica filtro textual (chamado pelo input de busca)
 *   - limparBusca():       limpa o input de busca
 *   - limparDados():       remove todos os dados carregados (com confirm)
 *   - toggleDetalhe():     expande/recolhe a linha de detalhes do aluno
 *
 * As linhas têm event listeners adicionados via addEventListener
 * (ao invés de onclick inline) — incluindo os botões 📋 (copiar) e 🚫 (ignorar).
 */

import { byId, $, $$ } from "../utils/dom.js";
import { state } from "../state.js";
import { config } from "../config.js";
import { getStatus, STATUS_ICON, STATUS_COLOR } from "../core/status.js";
import { gerarMensagem } from "../core/message.js";
import { isKC, isLab, formatarNomeAtividade } from "../core/activity.js";
import { ignorarAluno } from "../services/ignored.js";
import { copiarEAbrirOutlook } from "../services/clipboard.js";
import { reprocessar } from "./preview.js";
import { renderGraficos } from "./charts.js";
import { toast } from "./toast.js";

/** Alterna ordenação pela chave (toggle asc/desc se mesma coluna). */
export function sortTable(key) {
  if (state.currentSort.key === key) {
    state.currentSort.asc = !state.currentSort.asc;
  } else {
    state.currentSort = { key, asc: false };
  }
  renderTable();
}

/** Aplica o filtro de status (atualiza visual dos contadores). */
export function filterTable(status) {
  state.currentFilter = status;

  $$(".counter").forEach((b) => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });

  const ativoId =
    status === "all"
      ? "count-all"
      : status === "graduated"
      ? "count-graduated"
      : "count-" + status;
  const ativo = byId(ativoId);
  if (ativo) {
    ativo.classList.add("active");
    ativo.setAttribute("aria-selected", "true");
  }

  renderTable();
}

/** Re-renderiza com base no termo de busca digitado. */
export function searchTable() {
  const search = byId("search").value;
  byId("searchClear").hidden = !search;
  renderTable();
}

/** Limpa o campo de busca e devolve o foco a ele. */
export function limparBusca() {
  byId("search").value = "";
  byId("searchClear").hidden = true;
  renderTable();
  byId("search").focus();
}

/** Remove todos os dados carregados (com confirmação). */
export function limparDados() {
  if (!confirm("Tem certeza que deseja limpar todos os dados carregados?")) return;
  state.globalData = [];
  state.rawCSVData = null;

  byId("dados-container").setAttribute("hidden", "");
  byId("btnLimpar").setAttribute("hidden", "");
  byId("graficos-container").setAttribute("hidden", "");
  byId("btnGraficos").innerText = "📊 Mostrar gráficos";

  toast("Dados removidos.", "info");
}

/** Renderiza a tabela com filtro + busca + ordenação aplicados. */
export function renderTable() {
  const tbody = $("#table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  let red = 0,
    yellow = 0,
    green = 0,
    graduated = 0;

  // 1. Filtro por status.
  let filtered = state.globalData.filter((row) => {
    const status = getStatus(row);
    return state.currentFilter === "all" || status === state.currentFilter;
  });

  // 2. Filtro por busca.
  const search = byId("search").value.toLowerCase();
  if (search) {
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.email.toLowerCase().includes(search)
    );
  }

  // 3. Ordenação.
  filtered.sort((a, b) => {
    let valA = a[state.currentSort.key];
    let valB = b[state.currentSort.key];
    if (!isNaN(valA)) valA = parseFloat(valA);
    if (!isNaN(valB)) valB = parseFloat(valB);
    if (valA < valB) return state.currentSort.asc ? -1 : 1;
    if (valA > valB) return state.currentSort.asc ? 1 : -1;
    return 0;
  });

  // Conta status SOBRE TODOS os alunos (não os filtrados) — contadores fixos.
  state.globalData.forEach((row) => {
    const s = getStatus(row);
    if (s === "red") red++;
    else if (s === "yellow") yellow++;
    else if (s === "green") green++;
    else if (s === "graduated") graduated++;
  });

  // No-results state.
  byId("no-results").hidden = filtered.length > 0;

  filtered.forEach((row, index) => {
    const status = getStatus(row);
    const msg = gerarMensagem(row);
    const assunto = config.assuntoEmail;
    const icon = STATUS_ICON[status] || "🔴";
    const barColor = STATUS_COLOR[status] || "#dc2626";

    const tr = document.createElement("tr");
    tr.classList.add(status);
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td class="name-cell" title="${row.name} — ${row.email}">${icon} ${row.name}</td>
      <td>
        <div class="progress-bar-container">
          <div class="progress-bar" style="width:${parseFloat(row.total)}%;background:${barColor};"></div>
          <span>${row.total}%</span>
        </div>
      </td>
      <td>${row.total}%</td>
      <td>${row.lab}%</td>
      <td>${row.kc}%</td>
      <td>
        ${
          status === "graduated"
            ? '<span class="badge graduated">Graduado</span>'
            : status === "green"
            ? '<span class="badge green">OK</span>'
            : status === "yellow"
            ? '<span class="badge yellow">Atenção</span>'
            : '<span class="badge red">Crítico</span>'
        }
      </td>
      <td class="actions-cell">
        <button class="action-btn btn-copiar" title="Copiar mensagem">📋</button>
        <a class="action-btn" target="_blank" title="Enviar e-mail (Outlook)"
          href="https://outlook.office.com/mail/deeplink/compose?to=${row.email}&subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(msg)}">
          ✉️
        </a>
        <button class="action-btn btn-ignorar" title="Ignorar este aluno (não aparecerá na próxima carga)">🚫</button>
      </td>
    `;

    // Listener do botão Copiar (mantém payload em data-* para evitar closure).
    const btnCopiar = $(".btn-copiar", tr);
    btnCopiar.dataset.email = row.email;
    btnCopiar.dataset.msg = msg;
    btnCopiar.addEventListener("click", function (e) {
      e.stopPropagation();
      copiarEAbrirOutlook(this.dataset.msg, this.dataset.email);
    });

    // Listener do botão Ignorar.
    const btnIgnorar = $(".btn-ignorar", tr);
    btnIgnorar.addEventListener("click", function (e) {
      e.stopPropagation();
      if (ignorarAluno(row)) {
        reprocessar();
        toast(`"${row.name}" foi ignorado e os cálculos foram atualizados. ✅`);
      }
    });

    // Click na linha → expande detalhes.
    tr.addEventListener("click", () => toggleDetalhe(tr, row));
    tbody.appendChild(tr);
  });

  // Atualiza contadores.
  const total = state.globalData.length;
  $(".counter-value", byId("count-all")).innerText = total;
  $(".counter-value", byId("count-red")).innerText = red;
  $(".counter-value", byId("count-yellow")).innerText = yellow;
  $(".counter-value", byId("count-green")).innerText = green;
  $(".counter-value", byId("count-graduated")).innerText = graduated;

  // Atualiza setas de ordenação.
  $$("th.sortable").forEach((th) => {
    th.classList.remove("sort-active");
    if (th.dataset.key === state.currentSort.key) th.classList.add("sort-active");
  });

  // Re-renderiza gráficos se estiverem visíveis (cores e dados podem mudar).
  if (!byId("graficos-container").hidden) {
    renderGraficos();
  }
}

/** Expande/recolhe a linha de detalhes (KCs e Labs pendentes). */
function toggleDetalhe(tr, row) {
  const next = tr.nextSibling;
  if (next && next.classList && next.classList.contains("detalhe-row")) {
    next.remove();
    return;
  }
  const kcPendentes = row.pendencias.filter((p) => isKC(p)).map(formatarNomeAtividade);
  const labPendentes = row.pendencias.filter((p) => isLab(p)).map(formatarNomeAtividade);
  const listaKC = kcPendentes.length ? kcPendentes.join("<br>") : "<em>Nenhum pendente</em>";
  const listaLab = labPendentes.length ? labPendentes.join("<br>") : "<em>Nenhum pendente</em>";

  const detalhe = document.createElement("tr");
  detalhe.className = "detalhe-row";
  detalhe.innerHTML = `
    <td colspan="8">
      <div class="detalhe-conteudo">
        <strong>📧 E-mail:</strong> ${row.email || "<em>não informado</em>"}<br><br>
        <strong>📘 KCs pendentes (${kcPendentes.length}):</strong><br>${listaKC}
        <br><br>
        <strong>🧪 Labs pendentes (${labPendentes.length}):</strong><br>${listaLab}
      </div>
    </td>
  `;
  tr.after(detalhe);
}
