/**
 * Modal de Configurações (⚙️) — orquestra critérios, datas de encerramento
 * e gerenciamento da lista de ignorados.
 *
 * Este módulo NÃO contém lógica de persistência: ele lê/escreve em
 * `config` (de config.js) e delega operações específicas para os
 * módulos services/ignored.js e services/encerramentos.js.
 */

import { byId, $$, setHidden } from "../utils/dom.js";
import { state } from "../state.js";
import { config, saveConfig, resetConfig, CONFIG_DEFAULT } from "../config.js";
import { abrirModal, fecharModal } from "./modal.js";
import { reprocessar } from "./preview.js";
import { renderTable } from "./table.js";
import { mostrarPreview } from "./preview.js";
import { validateCSV } from "../core/csv.js";
import { formatarEncerramento, formatarDataIgnorado } from "../utils/format.js";
import { desfazerIgnorar } from "../services/ignored.js";
import { getEnvios, limparEnvios } from "../services/sent-tracker.js";
import {
  adicionarEncerramento as servAdicionarEnc,
  removerEncerramento as servRemoverEnc,
} from "../services/encerramentos.js";
import { toast } from "./toast.js";

// ---------- ABERTURA / FECHAMENTO -----------------------------------------

/** Abre o modal de configurações populando os campos com os valores atuais. */
export function abrirConfiguracoes() {
  byId("config-min-alunos").value = config.minAlunos;
  byId("config-criterio-kc").value = config.criterioKC;
  byId("config-criterio-lab").value = config.criterioLab;
  byId("config-assunto-email").value = config.assuntoEmail;

  // Info contextual quando a turma é menor que o threshold.
  const infoEl = byId("config-min-alunos-info");
  if (state.globalData.length && state.globalData.length < config.minAlunos) {
    infoEl.innerText = `ℹ️ Sua turma tem ${state.globalData.length} alunos — o limite efetivo será reduzido automaticamente.`;
  } else {
    infoEl.innerText = "";
  }

  // Pré-popula campo de Section com a turma do CSV atual (se houver).
  const sectionEl = byId("config-encerramento-section");
  if (sectionEl) {
    const turmaAtual =
      state.globalData.length && state.globalData[0].section
        ? state.globalData[0].section
        : "";
    sectionEl.placeholder = turmaAtual ? `Ex: ${turmaAtual} (turma atual)` : "Ex: BRSAOXXX";
  }

  renderListaIgnorados();
  renderListaEncerramentos();
  abrirModal("modal-config");
}

/** Salva os valores do modal, validando antes. Reprocessa se preciso. */
export function salvarConfiguracoes() {
  const minAlunos = parseInt(byId("config-min-alunos").value, 10);
  const criterioKC = parseFloat(byId("config-criterio-kc").value);
  const criterioLab = parseFloat(byId("config-criterio-lab").value);
  const assuntoEmail = byId("config-assunto-email").value.trim();

  if (isNaN(minAlunos) || minAlunos < 1) {
    toast("Limite mínimo deve ser pelo menos 1.", "error");
    return;
  }
  if (isNaN(criterioKC) || criterioKC < 0 || criterioKC > 100) {
    toast("Critério de KC deve ser entre 0 e 100.", "error");
    return;
  }
  if (isNaN(criterioLab) || criterioLab < 0 || criterioLab > 100) {
    toast("Critério de Lab deve ser entre 0 e 100.", "error");
    return;
  }
  if (!assuntoEmail) {
    toast("Assunto não pode ser vazio.", "error");
    return;
  }

  const minMudou = config.minAlunos !== minAlunos;

  config.minAlunos = minAlunos;
  config.criterioKC = criterioKC;
  config.criterioLab = criterioLab;
  config.assuntoEmail = assuntoEmail;
  saveConfig();
  fecharModal("modal-config");

  // Atualiza o preview se ele estava visível.
  if (minMudou && state.pendingPreview) {
    const validation = validateCSV(state.pendingPreview.rawData, state.pendingPreview.meta);
    state.pendingPreview.validation = validation;
    mostrarPreview(validation);
  }

  if (state.globalData.length) {
    if (minMudou) {
      // O threshold mudou → afeta atividades ativas → recalcular tudo.
      reprocessar();
      toast("Configurações salvas e cálculos refeitos! ✅");
    } else {
      // Só os critérios mudaram (afetam só o status, não as médias) → re-render.
      renderTable();
      toast("Configurações salvas e aplicadas! ✅");
    }
  } else {
    toast("Configurações salvas! ✅");
  }
}

/** Reseta TUDO para o padrão (critérios, assunto, encerramentos, ignorados e envios). */
export function resetarConfiguracoes() {
  const totalIgn = config.alunosIgnorados.length;
  const totalEnc = Object.keys(config.encerramentos || {}).length;
  const totalEnv = Object.keys(getEnvios()).length;

  let aviso = "Restaurar TODAS as configurações para o padrão?\n\n";
  aviso += "Isso vai apagar:\n";
  aviso += "  • Critérios (KC, Lab, mínimo de alunos)\n";
  aviso += "  • Assunto do e-mail\n";
  if (totalEnc) aviso += `  • ${totalEnc} data(s) de encerramento\n`;
  if (totalIgn) aviso += `  • ${totalIgn} aluno(s) ignorado(s) manualmente\n`;
  if (totalEnv) aviso += `  • ${totalEnv} marcação(ões) de envio (📋/✉️)\n`;
  aviso += "\n⚠️ Esta ação não pode ser desfeita.";
  if (totalIgn || totalEnc) {
    aviso += '\nDica: exporte um backup antes (botão "💾 Exportar backup").';
  }

  if (!confirm(aviso)) return;

  resetConfig();
  limparEnvios();
  abrirConfiguracoes();

  // Limpar ignorados/envios muda quem aparece e como; reprocessa se houver dados.
  if (state.globalData.length) {
    reprocessar();
    toast("Configurações restauradas e cálculos refeitos. ✅");
  } else {
    toast("Configurações restauradas para o padrão. ✅");
  }
}

/** Restaura apenas o campo "minAlunos" para o default (sem salvar ainda). */
export function resetarMinAlunos() {
  byId("config-min-alunos").value = CONFIG_DEFAULT.minAlunos;
}

// ---------- LISTAS DENTRO DO MODAL ----------------------------------------

/** Renderiza a lista de alunos ignorados manualmente. */
export function renderListaIgnorados() {
  const container = byId("config-ignorados-lista");
  if (!container) return;

  if (!config.alunosIgnorados.length) {
    container.innerHTML =
      '<p class="config-hint" style="margin:0">Nenhum aluno ignorado manualmente.</p>';
    return;
  }

  container.innerHTML = config.alunosIgnorados
    .map((item) => {
      const data = item.quando ? formatarDataIgnorado(item.quando) : "data desconhecida";
      const nome = item.nome ? `<strong>${item.nome}</strong>` : "";
      return `<div class="ignorado-item">
        <div class="ignorado-info">
          ${nome}
          <span class="ignorado-email">${item.chave}</span>
          <span class="ignorado-data">📅 Ignorado em ${data}</span>
        </div>
        <button class="btn-link" data-action="restaurar-ignorado" data-chave="${escapeAttr(item.chave)}">↩️ Restaurar</button>
      </div>`;
    })
    .join("");
}

/** Handler chamado pelo botão "↩️ Restaurar" (via data-action). */
export function handleRestaurarIgnorado(chave) {
  desfazerIgnorar(chave);
  renderListaIgnorados();
  reprocessar();
  toast("Aluno restaurado e cálculos atualizados. ✅", "info");
}

/** Renderiza a lista de datas de encerramento por turma. */
export function renderListaEncerramentos() {
  const container = byId("config-encerramentos-lista");
  if (!container) return;

  const entries = Object.entries(config.encerramentos || {});
  if (!entries.length) {
    container.innerHTML =
      '<p class="config-hint" style="margin:0">Nenhuma data de encerramento configurada.</p>';
    return;
  }

  container.innerHTML = entries
    .map(([section, iso]) => {
      return `<div class="encerramento-item">
        <div class="encerramento-info">
          <strong>${section}</strong>
          <span class="encerramento-data">📅 ${formatarEncerramento(iso)}</span>
        </div>
        <button class="btn-link" data-action="remover-encerramento" data-section="${escapeAttr(section)}">🗑️ Remover</button>
      </div>`;
    })
    .join("");
}

/** Handler para o botão "➕ Adicionar" da seção de encerramentos. */
export function adicionarEncerramentoFromUI() {
  const sectionEl = byId("config-encerramento-section");
  const dataEl = byId("config-encerramento-data");
  const ok = servAdicionarEnc(sectionEl.value, dataEl.value);
  if (!ok) return;

  sectionEl.value = "";
  dataEl.value = "";
  renderListaEncerramentos();
  if (state.globalData.length) renderTable(); // pega a nova mensagem nos botões
}

/** Handler para o botão "🗑️ Remover" de cada encerramento. */
export function removerEncerramentoFromUI(section) {
  if (!servRemoverEnc(section)) return;
  renderListaEncerramentos();
  if (state.globalData.length) renderTable();
}

/** Escapa aspas simples e duplas para uso seguro em atributos HTML. */
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
