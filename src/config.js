/**
 * Configurações do usuário, persistidas em `localStorage`.
 *
 * Inclui critérios de status, lista de alunos ignorados e datas de
 * encerramento por turma. Faz migrações automáticas de formatos antigos
 * (defesa contra dados corrompidos por versões anteriores).
 */

const STORAGE_KEY = "config";

/** Valores padrão — usados na primeira execução e em "Restaurar tudo". */
export const CONFIG_DEFAULT = Object.freeze({
  /** Mínimo de alunos preenchidos para considerar a atividade ativa. */
  minAlunos: 5,
  /** Mínimo de KC (%) para o aluno ser considerado OK. */
  criterioKC: 70,
  /** Mínimo de Lab (%) para o aluno ser considerado OK. */
  criterioLab: 95,
  /** Assunto padrão dos e-mails. */
  assuntoEmail: "Desempenho atual no curso AWS re/Start",
  /** Lista de alunos ignorados manualmente: [{ chave, nome, quando }]. */
  alunosIgnorados: [],
  /** Mapa de Section → ISO datetime: { "BRSAOXXX": "2026-05-20T23:59" }. */
  encerramentos: {},
});

/**
 * Carrega a configuração do localStorage, fazendo merge com os defaults
 * e migrando formatos legados.
 */
export function loadConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const merged = { ...CONFIG_DEFAULT, ...stored };

    // Garante que alunosIgnorados é um array (defesa contra dados corrompidos).
    if (!Array.isArray(merged.alunosIgnorados)) {
      merged.alunosIgnorados = [];
    }

    // Migrações:
    //   1. strings legadas → { chave, quando }
    //   2. quando em ms (number) → ISO 8601 (string)
    merged.alunosIgnorados = merged.alunosIgnorados
      .map((item) => {
        if (typeof item === "string") return { chave: item, quando: null };
        if (typeof item.quando === "number") {
          return { ...item, quando: new Date(item.quando).toISOString() };
        }
        return item;
      })
      .filter((item) => item && item.chave);

    // Garante que encerramentos é um objeto plain.
    if (
      typeof merged.encerramentos !== "object" ||
      merged.encerramentos === null ||
      Array.isArray(merged.encerramentos)
    ) {
      merged.encerramentos = {};
    }

    return merged;
  } catch {
    return { ...CONFIG_DEFAULT, alunosIgnorados: [], encerramentos: {} };
  }
}

/**
 * Singleton de configuração — mutável por outros módulos.
 * Use `saveConfig()` após alterações para persistir.
 */
export const config = loadConfig();

/** Persiste a configuração atual no localStorage. */
export function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/**
 * Reseta TODAS as configurações para o padrão — incluindo critérios,
 * assunto, datas de encerramento e a lista de alunos ignorados.
 *
 * É uma operação destrutiva. O chamador (UI) é responsável por pedir
 * confirmação ao usuário e por reprocessar os dados em tela.
 */
export function resetConfig() {
  Object.keys(config).forEach((k) => delete config[k]);
  Object.assign(config, {
    ...CONFIG_DEFAULT,
    alunosIgnorados: [],
    encerramentos: {},
  });
  saveConfig();
}
