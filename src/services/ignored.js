/**
 * Lista de alunos ignorados manualmente.
 *
 * A persistência é feita via `config.alunosIgnorados` (em config.js, salvo
 * em localStorage). Este módulo encapsula apenas adicionar/remover alunos.
 *
 * Backup/restauração foi unificado em `services/backup.js` — que faz
 * export/import de TODAS as configurações em um único JSON.
 */

import { config, saveConfig } from "../config.js";
import { toast } from "../ui/toast.js";

/**
 * Adiciona um aluno à lista de ignorados.
 * Usa e-mail (lowercase) como chave preferencial; cai no ID Canvas
 * como fallback (alunos sem SIS Login ID mas com atividades reais).
 *
 * @param {{ name: string, email: string, id: string }} row
 * @returns {boolean} true se foi adicionado, false caso contrário (sem chave ou cancelado)
 */
export function ignorarAluno(row) {
  const chave = (row.email || "").toLowerCase().trim() || (row.id || "").trim();
  if (!chave) {
    toast("Aluno sem e-mail nem ID Canvas — não é possível ignorar.", "error");
    return false;
  }
  const confirmado = confirm(
    `Ignorar "${row.name}" das próximas análises?\n\nVocê pode reverter em ⚙️ Configurações.`
  );
  if (!confirmado) return false;

  if (!config.alunosIgnorados.some((i) => i.chave === chave)) {
    config.alunosIgnorados.push({
      chave,
      nome: row.name || "",
      quando: new Date().toISOString(),
    });
    saveConfig();
  }
  return true;
}

/** Remove um aluno da lista de ignorados pela chave. */
export function desfazerIgnorar(chave) {
  config.alunosIgnorados = config.alunosIgnorados.filter((i) => i.chave !== chave);
  saveConfig();
}
