/**
 * Wrappers de clipboard com fallback para navegadores antigos.
 */

import { toast } from "../ui/toast.js";

/**
 * Copia texto para o clipboard usando a API moderna,
 * caindo no fallback `execCommand` se necessário.
 */
export function copiarParaClipboard(texto) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(texto).catch(() => fallbackCopy(texto));
  } else {
    fallbackCopy(texto);
  }
}

/** Fallback: cria <textarea> off-screen, seleciona e roda execCommand("copy"). */
function fallbackCopy(texto) {
  const temp = document.createElement("textarea");
  temp.value = texto;
  temp.style.cssText = "position:fixed;opacity:0;";
  document.body.appendChild(temp);
  temp.select();
  document.execCommand("copy");
  document.body.removeChild(temp);
}

/**
 * Copia mensagem para a área de transferência E abre o Outlook Web já preenchido
 * com destinatário e assunto — usado pelo botão 📋 em cada linha da tabela.
 *
 * Diferente do botão ✉️ (que joga tudo na URL), aqui o CORPO da mensagem NÃO
 * vai na URL: alunos com muitos KCs/Labs pendentes geram mensagens longas que
 * estouram o limite de URL do Outlook e o e-mail abre vazio. Por isso copiamos
 * o corpo pra área de transferência — o usuário só precisa colar (Ctrl+V) no
 * rascunho que abre.
 */
export async function copiarEAbrirOutlook(msg, email, assunto = "") {
  try {
    await navigator.clipboard.writeText(msg);
    toast("Mensagem copiada! Abrindo e-mail — cole o corpo com Ctrl+V. ✅");
  } catch {
    toast("Não foi possível copiar automaticamente.", "error");
  }

  const params = new URLSearchParams({ to: email });
  if (assunto) params.set("subject", assunto);

  window.open(
    `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`,
    "_blank"
  );
}
