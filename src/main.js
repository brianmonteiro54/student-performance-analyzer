/**
 * Entry point da aplicação.
 *
 * Responsabilidades:
 *   1. Inicializar tema, dropzone, atalhos de teclado e backdrop de modal
 *   2. Registrar handlers de TODOS os botões com `data-action` (event delegation)
 *
 * O padrão `data-action` substitui os antigos `onclick="foo()"`, que não
 * funcionam com `<script type="module">` (escopo local). Vantagens:
 *   - Separa HTML (estrutura) de JS (comportamento)
 *   - Funciona com elementos criados dinamicamente
 *   - Centraliza a lista de ações em um único lugar (este arquivo)
 *   - Fácil de auditar quais ações estão expostas pela UI
 */

import { initTheme, toggleDarkMode } from "./ui/theme.js";
import { configurarDropzone } from "./ui/dropzone.js";
import { initShortcuts } from "./ui/shortcuts.js";
import { initModalBackdrop, fecharModal, abrirModal } from "./ui/modal.js";

import {
  cancelarUpload,
  confirmarProcessamento,
} from "./ui/preview.js";

import {
  sortTable,
  filterTable,
  searchTable,
  limparBusca,
  limparDados,
} from "./ui/table.js";

import { toggleGraficos } from "./ui/charts.js";

import {
  abrirConfiguracoes,
  salvarConfiguracoes,
  resetarConfiguracoes,
  resetarMinAlunos,
  adicionarEncerramentoFromUI,
  removerEncerramentoFromUI,
  handleRestaurarIgnorado,
} from "./ui/settings.js";

import {
  abrirEnvioMassa,
  abrirEmailIndividual,
  abrirProximoEmail,
  trocarAbaEnvio,
  copiarListaEmails,
} from "./ui/envio.js";

import {
  mostrarAreaCopia,
  copiarDesempenhoOrdenado,
} from "./ui/area-copia.js";

import { exportarCSV, exportarMensagens, exportarMensagensCSV } from "./services/exporter.js";
import { mostrarHistorico } from "./services/history.js";
import { exportarBackupCompleto, importarBackupCompleto } from "./services/backup.js";
import { reprocessar } from "./ui/preview.js";

/**
 * Mapa central de todas as ações da UI.
 *
 * Cada chave é o valor de `data-action` no HTML; o valor é a função
 * (ou um wrapper que extrai parâmetros do `data-*` do botão).
 */
const actions = {
  // ---- Header ----
  "abrir-ajuda":          () => abrirModal("modal-ajuda"),
  "abrir-configuracoes":  abrirConfiguracoes,
  "toggle-dark-mode":     toggleDarkMode,

  // ---- Upload card ----
  "cancelar-upload":         cancelarUpload,
  "confirmar-processamento": confirmarProcessamento,
  "exportar-csv":            exportarCSV,
  "mostrar-historico":       mostrarHistorico,
  "limpar-dados":            limparDados,

  // ---- Filtros / busca ----
  "filter-table": (_e, btn) => filterTable(btn.dataset.status),
  "limpar-busca": limparBusca,

  // ---- Ações da tabela (botões acima dela) ----
  "mostrar-area-copia":         mostrarAreaCopia,
  "copiar-desempenho-ordenado": copiarDesempenhoOrdenado,
  "abrir-envio-massa":          (_e, btn) => abrirEnvioMassa(btn.dataset.status),
  "toggle-graficos":            toggleGraficos,

  // ---- Ordenação ----
  "sort-table": (_e, btn) => sortTable(btn.dataset.key),

  // ---- Modais ----
  "fechar-modal": (_e, btn) => fecharModal(btn.dataset.modal),

  // ---- Modal de envio em massa ----
  "abrir-email-individual": (_e, btn) => abrirEmailIndividual(parseInt(btn.dataset.idx, 10)),
  "abrir-proximo-email":    abrirProximoEmail,
  "trocar-aba-envio":       (_e, btn) => trocarAbaEnvio(btn.dataset.tab),
  "copiar-lista-emails":    copiarListaEmails,
  "exportar-mensagens":     exportarMensagens,
  "exportar-mensagens-csv": exportarMensagensCSV,

  // ---- Modal de configurações ----
  "salvar-configuracoes":   salvarConfiguracoes,
  "resetar-configuracoes":  resetarConfiguracoes,
  "resetar-min-alunos":     resetarMinAlunos,

  // ---- Encerramentos por turma ----
  "adicionar-encerramento": adicionarEncerramentoFromUI,
  "remover-encerramento":   (_e, btn) => removerEncerramentoFromUI(btn.dataset.section),

  // ---- Lista de ignorados ----
  "restaurar-ignorado": (_e, btn) => handleRestaurarIgnorado(btn.dataset.chave),

  // ---- Backup completo (todas as configurações em um único JSON) ----
  "exportar-backup-completo": exportarBackupCompleto,
  "importar-backup-completo": () => importarBackupCompleto(reprocessar),
};

/** Conecta o event delegation global para todos os `data-action`. */
function bindActions() {
  document.body.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const handler = actions[action];
    if (handler) handler(e, target);
  });
}

/** Conecta o input de busca (não tem onClick — usa keyup). */
function bindSearch() {
  const input = document.getElementById("search");
  if (input) input.addEventListener("keyup", searchTable);
}

// ---- Boot --------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  configurarDropzone();
  initShortcuts();
  initModalBackdrop();
  bindActions();
  bindSearch();
});
