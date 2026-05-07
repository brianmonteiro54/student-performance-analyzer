/**
 * Rastreamento de envios de e-mail por aluno (com auto-expiração).
 *
 * Registra em localStorage quando o usuário clicou em 📋 (copiar) ou ✉️ (Outlook)
 * para um aluno, permitindo que a UI mostre visualmente quem já recebeu mensagem
 * NA RODADA ATUAL.
 *
 * ## Auto-expiração
 *
 * Como o envio é tipicamente semanal (1 vez por semana), as marcações precisam
 * "morrer" sozinhas — caso contrário, na semana seguinte todos os alunos
 * apareceriam ainda marcados como "já enviado".
 *
 * Cada marcação tem TTL de 24 horas (janela deslizante). Marcações expiradas
 * são removidas automaticamente toda vez que `getEnvios()` é chamado, sem
 * intervenção do usuário.
 *
 * Estrutura no localStorage:
 *   { "aluno1@x.com": "2026-05-07T22:30:00.000Z", "aluno2@y.com": "..." }
 */

const STORAGE_KEY = "envios";

/** Janela de tempo em que a marcação permanece visível. */
export const ENVIO_TTL_HORAS = 24;
const TTL_MS = ENVIO_TTL_HORAS * 60 * 60 * 1000;

/**
 * Calcula a chave de rastreamento de uma row da tabela.
 * Usa e-mail (lowercase) como preferência; cai no ID Canvas como fallback.
 * Espelha o critério usado em `services/ignored.js` para consistência.
 */
export function getChaveEnvio(row) {
  return (row.email || "").toLowerCase().trim() || (row.id || "").trim();
}

/**
 * Retorna o objeto completo de envios { chave: isoTimestamp }, JÁ FILTRADO
 * pelo TTL: entradas expiradas são removidas e o storage é re-persistido
 * (cleanup oportunista — não precisa de timer/setInterval).
 */
export function getEnvios() {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const now = Date.now();
  const out = {};
  let mudou = false;
  for (const [chave, iso] of Object.entries(raw)) {
    const ts = new Date(iso).getTime();
    if (!isNaN(ts) && now - ts < TTL_MS) {
      out[chave] = iso;
    } else {
      mudou = true; // expirou ou inválido → não copia, marca para regravar
    }
  }
  if (mudou) {
    if (Object.keys(out).length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return out;
}

/** Retorna a data ISO do último envio para a chave, ou null se não enviado / expirado. */
export function getEnviadoEm(chave) {
  if (!chave) return null;
  return getEnvios()[chave] || null;
}

/** Marca a chave como tendo recebido envio agora (atualiza timestamp se já existia). */
export function marcarEnviado(chave) {
  if (!chave) return;
  const envios = getEnvios();
  envios[chave] = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envios));
}

/** Apaga TODO o histórico de envios. */
export function limparEnvios() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Substitui o histórico inteiro pelo objeto fornecido.
 * Sanea: aceita apenas { string: string } e ignora valores inválidos.
 * Usado pelo backup completo durante a restauração.
 */
export function setEnvios(envios) {
  if (!envios || typeof envios !== "object" || Array.isArray(envios)) {
    limparEnvios();
    return;
  }
  const sanitized = {};
  for (const [chave, iso] of Object.entries(envios)) {
    if (typeof chave === "string" && typeof iso === "string" && iso.trim()) {
      sanitized[chave] = iso;
    }
  }
  if (Object.keys(sanitized).length) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } else {
    limparEnvios();
  }
}
