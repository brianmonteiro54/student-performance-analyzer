/**
 * Backup completo das configurações do usuário.
 *
 * Exporta/importa em um único JSON tudo que está em `localStorage`:
 *   - Critérios (minAlunos, criterioKC, criterioLab)
 *   - Assunto padrão de e-mail
 *   - Datas de encerramento por turma
 *   - Lista de alunos ignorados manualmente
 *
 * Útil para cursos longos (4+ meses) onde perder a configuração custa caro:
 * o usuário pode salvar o JSON no Drive/OneDrive periodicamente e restaurar
 * se trocar de máquina ou limpar o navegador.
 */

import { config, saveConfig, CONFIG_DEFAULT } from "../config.js";
import { toast } from "../ui/toast.js";

const VERSAO_FORMATO = 1;
const TIPO = "student-analyzer-backup-completo";

/**
 * Gera um arquivo JSON com TODAS as configurações persistidas e dispara o download.
 */
export function exportarBackupCompleto() {
  const payload = {
    tipo: TIPO,
    versao: VERSAO_FORMATO,
    exportadoEm: new Date().toISOString(),
    config: {
      minAlunos:        config.minAlunos,
      criterioKC:       config.criterioKC,
      criterioLab:      config.criterioLab,
      assuntoEmail:     config.assuntoEmail,
      encerramentos:    { ...config.encerramentos },
      alunosIgnorados:  [...config.alunosIgnorados],
    },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `student-analyzer-backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const totalIgn = config.alunosIgnorados.length;
  const totalEnc = Object.keys(config.encerramentos || {}).length;
  toast(
    `Backup completo exportado: critérios + assunto + ${totalEnc} encerramento(s) + ${totalIgn} ignorado(s). ✅`
  );
}

/**
 * Abre seletor de arquivo, valida o JSON e SUBSTITUI todas as configurações
 * atuais pelas do backup. Pede confirmação explícita antes de sobrescrever.
 *
 * @param {() => void} [onAfterImport]  Callback após importação concluída
 *                                       — usado para reprocessar a UI / re-renderizar.
 */
export function importarBackupCompleto(onAfterImport) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        const sanitized = validarESanear(payload);

        const totalIgn = sanitized.alunosIgnorados.length;
        const totalEnc = Object.keys(sanitized.encerramentos).length;
        const confirmado = confirm(
          `Restaurar backup completo?\n\n` +
            `Você vai SUBSTITUIR todas as suas configurações atuais por:\n` +
            `  • Mínimo de alunos: ${sanitized.minAlunos}\n` +
            `  • Critério KC: ${sanitized.criterioKC}%\n` +
            `  • Critério Lab: ${sanitized.criterioLab}%\n` +
            `  • Assunto: "${sanitized.assuntoEmail}"\n` +
            `  • ${totalEnc} encerramento(s)\n` +
            `  • ${totalIgn} aluno(s) ignorado(s)\n\n` +
            `Esta ação não pode ser desfeita.`
        );
        if (!confirmado) {
          toast("Restauração cancelada.", "info");
          return;
        }

        // Aplica no objeto config (mutável) e persiste.
        config.minAlunos       = sanitized.minAlunos;
        config.criterioKC      = sanitized.criterioKC;
        config.criterioLab     = sanitized.criterioLab;
        config.assuntoEmail    = sanitized.assuntoEmail;
        config.encerramentos   = sanitized.encerramentos;
        config.alunosIgnorados = sanitized.alunosIgnorados;
        saveConfig();

        toast("Backup restaurado com sucesso. ✅");
        if (typeof onAfterImport === "function") onAfterImport();
      } catch (err) {
        toast("Arquivo inválido: " + err.message, "error");
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

// ---------- VALIDAÇÃO -----------------------------------------------------

/**
 * Valida e normaliza o payload importado, retornando apenas os campos
 * conhecidos com tipos corretos. Lança Error com mensagem amigável
 * se o formato for incompatível.
 */
function validarESanear(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("JSON vazio ou malformado.");
  }

  // Detecta backup parcial antigo (só ignorados, sem critérios) e avisa.
  if (
    !payload.config &&
    Array.isArray(payload.alunosIgnorados) &&
    !("minAlunos" in payload)
  ) {
    throw new Error(
      "Esse arquivo é um backup antigo (só lista de ignorados) e não tem as outras configurações. Exporte um novo backup completo para usar aqui."
    );
  }

  // Aceita tanto { config: {...} } (novo formato) quanto campos no topo (tolerante).
  const src = payload.config && typeof payload.config === "object" ? payload.config : payload;

  return {
    minAlunos:       saneInt(src.minAlunos,       CONFIG_DEFAULT.minAlunos,   1, 9999),
    criterioKC:      saneNum(src.criterioKC,      CONFIG_DEFAULT.criterioKC,  0, 100),
    criterioLab:     saneNum(src.criterioLab,     CONFIG_DEFAULT.criterioLab, 0, 100),
    assuntoEmail:    saneStr(src.assuntoEmail,    CONFIG_DEFAULT.assuntoEmail),
    encerramentos:   saneEncerramentos(src.encerramentos),
    alunosIgnorados: saneIgnorados(src.alunosIgnorados),
  };
}

function saneInt(v, fallback, min, max) {
  const n = parseInt(v, 10);
  if (isNaN(n) || n < min || n > max) return fallback;
  return n;
}
function saneNum(v, fallback, min, max) {
  const n = parseFloat(v);
  if (isNaN(n) || n < min || n > max) return fallback;
  return n;
}
function saneStr(v, fallback) {
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  return t || fallback;
}
function saneEncerramentos(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out = {};
  for (const [section, iso] of Object.entries(v)) {
    if (typeof section === "string" && typeof iso === "string" && iso.trim()) {
      out[section] = iso;
    }
  }
  return out;
}
function saneIgnorados(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (typeof item === "string") return { chave: item, nome: "", quando: null };
      if (item && typeof item === "object" && item.chave) {
        return {
          chave: String(item.chave),
          nome:  typeof item.nome === "string" ? item.nome : "",
          quando: typeof item.quando === "string" ? item.quando : null,
        };
      }
      return null;
    })
    .filter(Boolean);
}
