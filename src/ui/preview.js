/**
 * Preview do CSV — bloco que aparece após o upload e antes da confirmação.
 *
 * Mostra cards com estatísticas (alunos válidos, ignorados, KCs/Labs ativos,
 * graduados), além de listas de erros e avisos.
 *
 * O usuário pode confirmar ou cancelar. A confirmação dispara o processamento
 * de fato e a renderização da tabela.
 */

import { byId, $, setHidden } from "../utils/dom.js";
import { state } from "../state.js";
import { config } from "../config.js";
import { processCSV } from "../core/csv.js";
import { salvarHistorico } from "../services/history.js";
import { mostrarProgresso, esconderProgresso } from "./progress.js";
import { renderTable } from "./table.js";
import { toast } from "./toast.js";

/** Renderiza o relatório de validação no card de preview e o exibe. */
export function mostrarPreview(validation) {
  const preview = byId("csv-preview");
  const content = byId("csv-preview-content");
  if (!preview || !content) return;

  const { info, errors, warnings, ok } = validation;

  let html = '<div class="csv-stats">';
  html += `<div class="csv-stat success"><span class="csv-stat-label">Alunos válidos</span><span class="csv-stat-value">${info.totalLinhas || 0}</span></div>`;

  if (info.contasTeste || info.ignoradosManuais || info.semConviteAceito) {
    const totalIgn =
      (info.contasTeste || 0) + (info.ignoradosManuais || 0) + (info.semConviteAceito || 0);
    html += `<div class="csv-stat warning"><span class="csv-stat-label">Ignorados</span><span class="csv-stat-value">${totalIgn}</span></div>`;
  }

  html += `<div class="csv-stat ${info.kcAtivos > 0 ? "success" : "warning"}"><span class="csv-stat-label">KCs ativos</span><span class="csv-stat-value">${info.kcAtivos ?? 0} <small style="font-size:12px;color:var(--text-muted)">/ ${info.kcCols ?? 0}</small></span></div>`;
  html += `<div class="csv-stat ${info.labAtivos > 0 ? "success" : "warning"}"><span class="csv-stat-label">Labs ativos</span><span class="csv-stat-value">${info.labAtivos ?? 0} <small style="font-size:12px;color:var(--text-muted)">/ ${info.labCols ?? 0}</small></span></div>`;

  if (info.graduados !== undefined) {
    html += `<div class="csv-stat"><span class="csv-stat-label">Graduados</span><span class="csv-stat-value">${info.graduados}</span></div>`;
  }
  html += `<div class="csv-stat"><span class="csv-stat-label">Limite mínimo</span><span class="csv-stat-value">${info.minEfetivo ?? config.minAlunos}</span></div>`;
  html += "</div>";

  if (errors.length) {
    html += '<div class="csv-errors"><strong>❌ Erros encontrados:</strong><ul>';
    errors.forEach((e) => (html += `<li>${e}</li>`));
    html += "</ul></div>";
  }
  if (warnings.length) {
    html += '<div class="csv-warnings"><strong>⚠️ Avisos:</strong><ul>';
    warnings.forEach((w) => (html += `<li>${w}</li>`));
    html += "</ul></div>";
  }

  content.innerHTML = html;

  const btnConfirmar = $(".csv-preview-actions button", preview);
  if (btnConfirmar) {
    btnConfirmar.disabled = !ok;
    btnConfirmar.textContent = ok
      ? "✅ Confirmar e processar"
      : "❌ Corrija os erros para continuar";
  }

  setHidden(preview, false);
  preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** Cancela o upload pendente e limpa o preview. */
export function cancelarUpload() {
  state.pendingFile = null;
  state.pendingPreview = null;
  setHidden("csv-preview", true);
  const dz = byId("dropzone-file");
  if (dz) dz.textContent = "";
  const input = byId("fileInput");
  if (input) input.value = "";
}


export function confirmarProcessamento() {
  if (!state.pendingPreview || !state.pendingPreview.validation.ok) return;

  setHidden("csv-preview", true);
  const status = byId("status");
  if (status) status.innerText = "Processando...";
  mostrarProgresso(50);

  // setTimeout para a barra de progresso ter tempo de pintar.
  setTimeout(() => {
    state.rawCSVData = state.pendingPreview.rawData;
    state.globalData = processCSV(state.rawCSVData);

    mostrarProgresso(100);
    esconderProgresso();
    salvarHistorico(state.pendingFile.name);

    if (status) status.innerText = "Processamento concluído ✅";
    toast(`${state.globalData.length} aluno(s) carregado(s) com sucesso!`);

    setHidden("dados-container", false);
    setHidden("btnLimpar", false);

    renderTable();

    state.pendingFile = null;
    state.pendingPreview = null;
    const dz = byId("dropzone-file");
    if (dz) dz.textContent = "";
  }, 200);
}

/**
 * Reprocessa o CSV cru com a configuração atual.
 * Usar sempre que algo afetar os cálculos:
 *   - alteração da lista de ignorados
 *   - mudança de minAlunos
 */
export function reprocessar() {
  if (!state.rawCSVData) {
    renderTable();
    return;
  }
  state.globalData = processCSV(state.rawCSVData);
  renderTable();
}
