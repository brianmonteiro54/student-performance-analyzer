/* =========================================================================
   Desempenho Acadêmico — AWS re/Start
   app.js (versão 2.0)
   ========================================================================= */

// ===================== ESTADO GLOBAL =====================
let globalData      = [];
let rawCSVData      = null;        // dados brutos do CSV (antes de processar) — usado para reprocessar
let currentFilter   = "all";
let currentSort     = { key: "total", asc: false };
let pendingFile     = null;        // arquivo aguardando confirmação
let pendingPreview  = null;        // dados do preview
let chartStatus     = null;
let chartMedia      = null;
let envioFila       = [];          // fila de envio em massa
let envioIndex      = 0;

// ===================== CONFIG =====================
const CONFIG_DEFAULT = {
  minAlunos:        5,    // mínimo de alunos preenchidos para considerar atividade ativa
  criterioKC:       70,   // mínimo de KC para status verde
  criterioLab:      95,   // mínimo de Lab para status verde
  assuntoEmail:     "Desempenho atual no curso AWS re/Start",
  alunosIgnorados:  [],   // lista de alunos ignorados manualmente: [{ chave, nome, quando }]
  encerramentos:    {}    // mapa de Section → ISO datetime: { "BRSAO244": "2026-05-20T23:59" }
};

let config = carregarConfig();

function carregarConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem("config") || "{}");
    const merged = { ...CONFIG_DEFAULT, ...stored };
    // Garante que alunosIgnorados é um array (defesa contra dados corrompidos)
    if (!Array.isArray(merged.alunosIgnorados)) merged.alunosIgnorados = [];
    // Migrações:
    //  1. strings legadas → { chave, quando }
    //  2. quando em ms (number) → ISO 8601 (string)
    merged.alunosIgnorados = merged.alunosIgnorados.map(item => {
      if (typeof item === "string") return { chave: item, quando: null };
      if (typeof item.quando === "number") {
        return { ...item, quando: new Date(item.quando).toISOString() };
      }
      return item;
    }).filter(item => item && item.chave);
    // Garante que encerramentos é um objeto plain
    if (typeof merged.encerramentos !== "object" || merged.encerramentos === null || Array.isArray(merged.encerramentos)) {
      merged.encerramentos = {};
    }
    return merged;
  } catch {
    return { ...CONFIG_DEFAULT, alunosIgnorados: [], encerramentos: {} };
  }
}

function salvarConfigStorage() {
  localStorage.setItem("config", JSON.stringify(config));
}

// ===================== DARK MODE =====================
function toggleDarkMode() {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  localStorage.setItem("darkMode", isDark);
  const btn = document.getElementById("darkToggleBtn");
  if (btn) btn.querySelector("span").textContent = isDark ? "☀️" : "🌙";
  // Re-renderiza gráficos para atualizar cores
  if (globalData.length && !document.getElementById("graficos-container").hasAttribute("hidden")) {
    renderGraficos();
  }
}

if (localStorage.getItem("darkMode") === "true") {
  document.body.classList.add("dark");
}

// ===================== TOAST =====================
function toast(msg, tipo = "success") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${tipo}`;
  el.innerText = msg;
  container.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ===================== UTILITÁRIOS =====================
function normalize(text) {
  if (!text) return "";
  return text.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function isKC(col)  { return /^\d+.*kc/.test(normalize(col));  }
function isLab(col) { return /^\d+.*lab/.test(normalize(col)); }

// Detecta contas de teste do Canvas (criadas automaticamente para o instrutor)
// e alunos que não aceitaram o convite (SIS Login ID vazio + zero atividades).
function isContaTesteAutomatica(rawRow) {
  const studentRaw = (rawRow["Student"] || "").toString().trim();
  // Canvas exporta como "Sobrenome, Nome" — então "aluno, Testar" vira "Testar aluno"
  const nome  = studentRaw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const email = (rawRow["SIS Login ID"] || "").toString().trim();

  // 1. Padrões claros de conta de teste no nome
  const padroesNome = [
    /^aluno,\s*testar?$/i,
    /^testar?,\s*aluno$/i,
    /^student,\s*test$/i,
    /^test,\s*student$/i,
    /^testar?\s+aluno$/i,
    /^test\s+student$/i
  ];
  if (padroesNome.some(p => p.test(nome))) return true;

  // 2. E-mail é hash hex (sem @) — sinal claro de conta de sistema
  if (email && !email.includes("@") && /^[a-f0-9]{20,}$/i.test(email)) return true;

  // 3. Sem SIS Login ID + zero atividades reais (KCs ou Labs preenchidos)
  //    = aluno que não aceitou o convite do Canvas (ainda não tem login institucional
  //    e nunca fez nenhuma atividade). Conservador: só filtra se NADA foi feito.
  if (!email) {
    const temAlgumaAtividade = Object.entries(rawRow).some(([col, val]) => {
      if (!isKC(col) && !isLab(col)) return false;
      return val !== undefined && val !== null && val.toString().trim() !== "";
    });
    if (!temAlgumaAtividade) return true;
  }

  return false;
}

// Verifica se um aluno deve ser ignorado: por auto-detecção OU pela lista manual do usuário
function isAlunoIgnorado(rawRow) {
  if (isContaTesteAutomatica(rawRow)) return true;
  const email = (rawRow["SIS Login ID"] || "").toString().trim().toLowerCase();
  const id    = (rawRow["ID"] || "").toString().trim();
  return config.alunosIgnorados.some(ign => {
    const chave = (ign.chave || "").toLowerCase();
    return chave === email || ign.chave === id;
  });
}

function fixEncoding(str) {
  try { return decodeURIComponent(escape(str)); }
  catch { return str; }
}

function getSaudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

function formatarNomeAtividade(col) {
  let nome = col.replace(/\(\d+\)/g, "").trim();
  const match = nome.match(/^(\d+)(.*)/);
  if (match) {
    const numero = match[1].trim();
    let resto = match[2].trim();
    const tipoMatch = resto.match(/[-\s\[_]*(?:[A-Z]{1,4}[-\s\[_]*)*?(KC|Lab|LAB|kc|lab)(.*)/i);
    if (tipoMatch) {
      const tipo = tipoMatch[1].toUpperCase() === "LAB" ? "Lab" : tipoMatch[1].toUpperCase();
      let titulo = tipoMatch[2].trim();
      titulo = titulo.replace(/^[-\s—–]+/, "").trim();
      titulo = titulo.replace(/\s*-{2,}\s*/g, " - ").trim();
      return `${numero} - ${tipo} - ${titulo}`;
    }
    resto = resto.replace(/^[-\s—–]+/, "").trim();
    return `${numero} - ${resto}`;
  }
  return nome;
}

// Formata um datetime ISO local (ex: "2026-05-20T23:59") em texto BR ("20/05/2026 Às 23:59")
function formatarEncerramento(iso) {
  if (!iso) return "";
  const [date, time] = iso.split("T");
  if (!date) return "";
  const [y, m, d] = date.split("-");
  const [h, min] = (time || "23:59").split(":");
  return `${d}/${m}/${y} Às ${h}:${min}`;
}

// Normaliza código de turma para tolerar typos comuns.
// Caso real: "BRASAOXXX" (com 'A' a mais) deve casar com "BRSAOXXX" (forma do Canvas).
// Heurística: se começar com "BRA" seguido de pelo menos 2 letras (padrão "BR + cidade"),
// remove o "A" extra. Isso vale para BRASAO→BRSAO, BRARJ→BRRJ, BRABSB→BRBSB, etc.
function normalizarSectionKey(s) {
  if (!s) return "";
  let key = s.toString().toUpperCase().trim();
  if (/^BRA[A-Z]{2,}/.test(key)) {
    key = "BR" + key.slice(3);
  }
  return key;
}

// ===================== PROGRESSO =====================
function mostrarProgresso(valor) {
  const container = document.getElementById("progresso-container");
  const barra     = document.getElementById("progresso");
  container.style.display = "block";
  barra.style.width = valor + "%";
}

function esconderProgresso() {
  setTimeout(() => {
    const container = document.getElementById("progresso-container");
    const barra     = document.getElementById("progresso");
    container.style.display = "none";
    barra.style.width = "0%";
  }, 600);
}

// ===================== HISTÓRICO =====================
function salvarHistorico(nomeArquivo) {
  const historico = JSON.parse(localStorage.getItem("historico") || "[]");
  historico.unshift({ arquivo: nomeArquivo, data: new Date().toLocaleString("pt-BR") });
  localStorage.setItem("historico", JSON.stringify(historico.slice(0, 5)));
}

function mostrarHistorico() {
  const historico = JSON.parse(localStorage.getItem("historico") || "[]");
  if (!historico.length) {
    toast("Nenhum arquivo carregado ainda.", "info");
    return;
  }
  const lista = historico.map((h, i) => `${i + 1}. ${h.arquivo} — ${h.data}`).join("\n");
  alert("📂 Histórico de arquivos:\n\n" + lista);
}

// ===================== EXPORTAR CSV =====================
function exportarCSV() {
  if (!globalData.length) {
    toast("Nenhum dado para exportar.", "error");
    return;
  }
  const statusLabel = { green: "OK", red: "Crítico", yellow: "Atenção", graduated: "Graduado" };
  const headers = ["Nome", "Email", "Total", "Lab", "KC", "Status"];
  const rows = globalData.map(row => [
    row.name,
    row.email,
    row.total + "%",
    row.lab + "%",
    row.kc + "%",
    statusLabel[getStatus(row)] || ""
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "relatorio_alunos.csv";
  a.click();
  URL.revokeObjectURL(url);
  toast("Relatório exportado com sucesso! ✅");
}

// ===================== DROPZONE / UPLOAD =====================
function configurarDropzone() {
  const dropzone  = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");

  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  ["dragenter", "dragover"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length) {
      receberArquivo(files[0]);
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) {
      receberArquivo(fileInput.files[0]);
    }
  });
}

// ===================== VALIDAÇÃO + PREVIEW =====================
function receberArquivo(file) {
  // Validações iniciais (antes mesmo de parsear)
  if (!file) return;

  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
    toast(`"${file.name}" não parece ser um CSV.`, "error");
    return;
  }

  if (file.size === 0) {
    toast("Arquivo vazio.", "error");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    toast("Arquivo muito grande (máx. 10MB).", "error");
    return;
  }

  pendingFile = file;
  document.getElementById("dropzone-file").textContent = `📄 ${file.name} (${formatBytes(file.size)})`;

  // Parsear para preview, mas SEM aplicar ainda
  document.getElementById("status").innerText = "Validando arquivo...";
  mostrarProgresso(40);

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      mostrarProgresso(80);
      const validation = validarCSV(results.data, results.meta);
      mostrarProgresso(100);
      esconderProgresso();
      document.getElementById("status").innerText = "";

      pendingPreview = { rawData: results.data, meta: results.meta, validation };
      mostrarPreview(validation);
    },
    error: function (err) {
      esconderProgresso();
      document.getElementById("status").innerText = "";
      toast("Erro ao ler o arquivo: " + (err?.message || "desconhecido"), "error");
      pendingFile = null;
    }
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function validarCSV(data, meta) {
  const errors   = [];
  const warnings = [];
  const info     = {};

  // Filtra linha "Points Possible" (Canvas adiciona)
  const dataLimpa = data.filter(r =>
    !String(Object.values(r)[0] || "").includes("Points Possible")
  );

  // Separa alunos válidos dos ignorados
  // Detecta motivo de cada filtro automático para reportar no preview separadamente
  function categorizarAuto(row) {
    if (!isContaTesteAutomatica(row)) return null;
    const nome  = (row["Student"] || "").toLowerCase();
    const email = (row["SIS Login ID"] || "").toString().trim();
    if (!email) return "semConvite";
    return "teste";
  }

  const alunosTeste     = dataLimpa.filter(r => categorizarAuto(r) === "teste");
  const alunosSemConv   = dataLimpa.filter(r => categorizarAuto(r) === "semConvite");
  const alunosManuais   = dataLimpa.filter(r => !isContaTesteAutomatica(r) && isAlunoIgnorado(r));
  const dataValidos     = dataLimpa.filter(r => !isAlunoIgnorado(r));

  info.totalLinhas       = dataValidos.length;
  info.contasTeste       = alunosTeste.length;
  info.semConviteAceito  = alunosSemConv.length;
  info.ignoradosManuais  = alunosManuais.length;

  if (!dataValidos.length) {
    if (alunosTeste.length || alunosSemConv.length || alunosManuais.length) {
      errors.push(`Todos os ${dataLimpa.length} aluno(s) foram filtrados. Verifique a lista de ignorados em ⚙️ Configurações.`);
    } else {
      errors.push("O arquivo não contém nenhum aluno.");
    }
    return { ok: false, errors, warnings, info };
  }

  if (alunosTeste.length) {
    const nomes = alunosTeste.map(r => fixEncoding((r["Student"] || "").split(", ").reverse().join(" "))).join(", ");
    warnings.push(`${alunosTeste.length} conta(s) de teste do Canvas detectada(s) e ignorada(s) automaticamente: ${nomes}.`);
  }
  if (alunosSemConv.length) {
    const nomes = alunosSemConv.map(r => fixEncoding((r["Student"] || "").split(", ").reverse().join(" "))).join(", ");
    warnings.push(`${alunosSemConv.length} aluno(s) que não aceitaram o convite do Canvas (sem e-mail e sem nenhuma atividade): ${nomes}. Filtrados automaticamente.`);
  }
  if (alunosManuais.length) {
    warnings.push(`${alunosManuais.length} aluno(s) ignorado(s) manualmente (configurável em ⚙️ Configurações).`);
  }

  const colunas = meta.fields || Object.keys(dataValidos[0] || {});
  info.totalColunas = colunas.length;

  // Valida colunas obrigatórias
  if (!colunas.some(c => c === "Student" || normalize(c) === "student")) {
    errors.push('Coluna "Student" não encontrada. Verifique se exportou o CSV diretamente do Canvas.');
  }
  if (!colunas.some(c => c === "SIS Login ID" || normalize(c) === "sis login id")) {
    errors.push('Coluna "SIS Login ID" (e-mail do aluno) não encontrada.');
  }

  // Detecta KCs e Labs
  const kcCols  = colunas.filter(isKC);
  const labCols = colunas.filter(isLab);

  info.kcCols  = kcCols.length;
  info.labCols = labCols.length;

  if (kcCols.length === 0 && labCols.length === 0) {
    errors.push("Nenhuma coluna de KC ou Lab detectada. As colunas devem começar com número e conter 'KC' ou 'Lab' (ex: '01-KC-Cloud Foundations').");
  }

  // Auto-ajuste do threshold se a turma for pequena
  let minEfetivo = config.minAlunos;
  if (dataValidos.length < config.minAlunos) {
    minEfetivo = Math.max(1, dataValidos.length);
    warnings.push(`Turma com apenas ${dataValidos.length} alunos — limite mínimo ajustado de ${config.minAlunos} para ${minEfetivo} automaticamente.`);
  }
  info.minEfetivo = minEfetivo;

  // Quantos KCs/Labs ATIVOS (com base no threshold)
  function celulaPreenchida(row, col) {
    const v = row[col];
    return v !== undefined && v !== null && v.toString().trim() !== "";
  }

  const kcAtivos  = kcCols.filter(col => dataValidos.filter(r => celulaPreenchida(r, col)).length >= minEfetivo);
  const labAtivos = labCols.filter(col => dataValidos.filter(r => celulaPreenchida(r, col)).length >= minEfetivo);

  info.kcAtivos  = kcAtivos.length;
  info.labAtivos = labAtivos.length;

  if (kcAtivos.length === 0 && labAtivos.length === 0 && (kcCols.length > 0 || labCols.length > 0)) {
    warnings.push(`Nenhuma atividade preenchida por pelo menos ${minEfetivo} alunos. Reduza o limite mínimo nas configurações ⚙️.`);
  }

  // Conta graduados
  const graduados = dataValidos.filter(r => parseFloat((r["Graduated Final Points"] || "0").replace(",", ".")) === 1).length;
  info.graduados = graduados;

  // Detecta possíveis e-mails inválidos (entre os alunos válidos)
  const emailsInvalidos = dataValidos.filter(r => {
    const e = (r["SIS Login ID"] || "").trim();
    return e && !/@/.test(e);
  }).length;
  if (emailsInvalidos > 0) {
    warnings.push(`${emailsInvalidos} aluno(s) sem e-mail válido — o envio individual pode não funcionar para eles.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    info
  };
}

function mostrarPreview(validation) {
  const preview = document.getElementById("csv-preview");
  const content = document.getElementById("csv-preview-content");
  const { info, errors, warnings, ok } = validation;

  let html = '';

  // Stats em cards
  html += '<div class="csv-stats">';
  html += `<div class="csv-stat success"><span class="csv-stat-label">Alunos válidos</span><span class="csv-stat-value">${info.totalLinhas || 0}</span></div>`;
  if (info.contasTeste || info.ignoradosManuais || info.semConviteAceito) {
    const totalIgn = (info.contasTeste || 0) + (info.ignoradosManuais || 0) + (info.semConviteAceito || 0);
    html += `<div class="csv-stat warning"><span class="csv-stat-label">Ignorados</span><span class="csv-stat-value">${totalIgn}</span></div>`;
  }
  html += `<div class="csv-stat ${info.kcAtivos > 0 ? 'success' : 'warning'}"><span class="csv-stat-label">KCs ativos</span><span class="csv-stat-value">${info.kcAtivos ?? 0} <small style="font-size:12px;color:var(--text-muted)">/ ${info.kcCols ?? 0}</small></span></div>`;
  html += `<div class="csv-stat ${info.labAtivos > 0 ? 'success' : 'warning'}"><span class="csv-stat-label">Labs ativos</span><span class="csv-stat-value">${info.labAtivos ?? 0} <small style="font-size:12px;color:var(--text-muted)">/ ${info.labCols ?? 0}</small></span></div>`;
  if (info.graduados !== undefined) {
    html += `<div class="csv-stat"><span class="csv-stat-label">Graduados</span><span class="csv-stat-value">${info.graduados}</span></div>`;
  }
  html += `<div class="csv-stat"><span class="csv-stat-label">Limite mínimo</span><span class="csv-stat-value">${info.minEfetivo ?? config.minAlunos}</span></div>`;
  html += '</div>';

  if (errors.length) {
    html += '<div class="csv-errors"><strong>❌ Erros encontrados:</strong><ul>';
    errors.forEach(e => html += `<li>${e}</li>`);
    html += '</ul></div>';
  }

  if (warnings.length) {
    html += '<div class="csv-warnings"><strong>⚠️ Avisos:</strong><ul>';
    warnings.forEach(w => html += `<li>${w}</li>`);
    html += '</ul></div>';
  }

  content.innerHTML = html;

  // Mostra/esconde botão "Confirmar"
  const btnConfirmar = preview.querySelector(".csv-preview-actions button");
  btnConfirmar.disabled = !ok;
  btnConfirmar.textContent = ok ? "✅ Confirmar e processar" : "❌ Corrija os erros para continuar";

  preview.hidden = false;
  preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function cancelarUpload() {
  pendingFile    = null;
  pendingPreview = null;
  document.getElementById("csv-preview").hidden = true;
  document.getElementById("dropzone-file").textContent = "";
  document.getElementById("fileInput").value = "";
}

function confirmarProcessamento() {
  if (!pendingPreview || !pendingPreview.validation.ok) return;
  document.getElementById("csv-preview").hidden = true;
  document.getElementById("status").innerText = "Processando...";
  mostrarProgresso(50);
  setTimeout(() => {
    rawCSVData = pendingPreview.rawData;  // guarda para reprocessamentos futuros
    globalData = processCSV(rawCSVData);
    mostrarProgresso(100);
    esconderProgresso();
    salvarHistorico(pendingFile.name);
    document.getElementById("status").innerText = "Processamento concluído ✅";
    toast(`${globalData.length} aluno(s) carregado(s) com sucesso!`);

    document.getElementById("empty-state").hidden = true;
    document.getElementById("dados-container").hidden = false;
    document.getElementById("btnLimpar").hidden = false;

    renderTable();
    pendingFile    = null;
    pendingPreview = null;
    document.getElementById("dropzone-file").textContent = "";
  }, 200);
}

// Reprocessa o CSV bruto com a configuração atual (lista de ignorados, minAlunos etc.)
// Use sempre que alterar algo que afeta o cálculo: ignorar/restaurar aluno, mudar minAlunos.
function reprocessar() {
  if (!rawCSVData) {
    renderTable();
    return;
  }
  globalData = processCSV(rawCSVData);
  renderTable();
}

// ===================== PROCESSAR CSV =====================
function processCSV(data) {
  const columns = Object.keys(data[0] || {});
  const kcCols  = columns.filter(isKC);
  const labCols = columns.filter(isLab);

  function toNumber(v) {
    if (v === undefined || v === null) return 0;
    const s = v.toString().trim();
    if (s === "") return 0;
    return parseFloat(s.replace(",", ".")) || 0;
  }

  function celulaNaoVazia(row, col) {
    const v = row[col];
    if (v === undefined || v === null) return false;
    return v.toString().trim() !== "";
  }

  data = data.filter(r =>
    !String(Object.values(r)[0]).includes("Points Possible")
  );

  // Filtra contas de teste e alunos ignorados manualmente
  data = data.filter(r => !isAlunoIgnorado(r));

  // Auto-ajuste para turmas pequenas
  const minEfetivo = data.length < config.minAlunos
    ? Math.max(1, data.length)
    : config.minAlunos;

  const kcAtivos  = kcCols.filter(col => data.filter(row => celulaNaoVazia(row, col)).length >= minEfetivo);
  const labAtivos = labCols.filter(col => data.filter(row => celulaNaoVazia(row, col)).length >= minEfetivo);

  const targetColumns = [...kcAtivos, ...labAtivos];

  return data.map(row => {
    let kcSum = 0, kcCount = 0;
    let labSum = 0, labCount = 0;
    const pendencias = [];

    targetColumns.forEach(col => {
      const preenchida = celulaNaoVazia(row, col);
      const val = toNumber(row[col]);
      if (isKC(col)) {
        kcCount++;
        if (!preenchida) pendencias.push(col);
        else kcSum += val;
      }
      if (isLab(col)) {
        labCount++;
        if (!preenchida) pendencias.push(col);
        else labSum += val > 1 ? 1 : val;
      }
    });

    const kc    = kcCount  ? kcSum / kcCount               : 0;
    const lab   = labCount ? (labSum / labCount) * 100      : 0;
    const total = (kc + lab) / 2;

    return {
      name:      fixEncoding((row["Student"] || "").split(", ").reverse().join(" ")),
      email:     (row["SIS Login ID"] || "").trim().toLowerCase(),
      id:        (row["ID"] || "").toString().trim(),
      section:   (row["Section"] || "").toString().trim().toUpperCase(),
      kc:        kc.toFixed(2),
      lab:       lab.toFixed(2),
      total:     total.toFixed(2),
      pendencias,
      graduated: toNumber(row["Graduated Final Points"]) === 1
    };
  });
}

// ===================== STATUS =====================
function getStatus(row) {
  if (row.graduated) return "graduated";
  const kc  = parseFloat(row.kc);
  const lab = parseFloat(row.lab);
  if (kc >= config.criterioKC && lab >= config.criterioLab) return "green";
  if (kc < config.criterioKC && lab < config.criterioLab)   return "red";
  return "yellow";
}

// ===================== ORDENAÇÃO =====================
function sortTable(key) {
  if (currentSort.key === key) currentSort.asc = !currentSort.asc;
  else currentSort = { key, asc: false };
  renderTable();
}

// ===================== FILTROS =====================
function filterTable(status) {
  currentFilter = status;
  // Atualiza visual dos contadores
  document.querySelectorAll(".counter").forEach(b => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });
  const ativo = document.getElementById(
    status === "all" ? "count-all" :
    status === "graduated" ? "count-graduated" :
    "count-" + status
  );
  if (ativo) {
    ativo.classList.add("active");
    ativo.setAttribute("aria-selected", "true");
  }
  renderTable();
}

function searchTable() {
  const search = document.getElementById("search").value;
  document.getElementById("searchClear").hidden = !search;
  renderTable();
}

function limparBusca() {
  document.getElementById("search").value = "";
  document.getElementById("searchClear").hidden = true;
  renderTable();
  document.getElementById("search").focus();
}

function limparDados() {
  if (!confirm("Tem certeza que deseja limpar todos os dados carregados?")) return;
  globalData = [];
  rawCSVData = null;
  document.getElementById("empty-state").hidden = false;
  document.getElementById("dados-container").hidden = true;
  document.getElementById("btnLimpar").hidden = true;
  document.getElementById("graficos-container").hidden = true;
  document.getElementById("btnGraficos").innerText = "📊 Mostrar gráficos";
  toast("Dados removidos.", "info");
}

// ===================== IGNORAR ALUNO =====================
function ignorarAluno(row) {
  // Usa e-mail (lowercase) como chave preferencial; cai pro ID Canvas como fallback
  // (alunos com SIS Login ID vazio mas que tenham atividades preenchidas precisam disso).
  const chave = (row.email || "").toLowerCase().trim() || (row.id || "").trim();
  if (!chave) {
    toast("Aluno sem e-mail nem ID Canvas — não é possível ignorar.", "error");
    return;
  }
  if (!confirm(`Ignorar "${row.name}" das próximas análises?\n\nVocê pode reverter em ⚙️ Configurações.`)) return;

  if (!config.alunosIgnorados.some(i => i.chave === chave)) {
    config.alunosIgnorados.push({
      chave,
      nome: row.name || "",
      quando: new Date().toISOString()
    });
    salvarConfigStorage();
  }
  // Reprocessa o CSV — médias e atividades ativas podem mudar quando alunos são removidos
  reprocessar();
  toast(`"${row.name}" foi ignorado e os cálculos foram atualizados. ✅`);
}

function desfazerIgnorar(chave) {
  config.alunosIgnorados = config.alunosIgnorados.filter(i => i.chave !== chave);
  salvarConfigStorage();
  renderListaIgnorados();
  // Reprocessa o CSV para incluir o aluno restaurado de volta nos cálculos
  reprocessar();
  toast("Aluno restaurado e cálculos atualizados. ✅", "info");
}

function formatarDataIgnorado(quando) {
  if (!quando) return "";
  const d = new Date(quando);  // aceita ISO 8601 ou número (ms)
  if (isNaN(d.getTime())) return "";
  const dia  = d.toLocaleDateString("pt-BR");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} ${hora}`;
}

function renderListaIgnorados() {
  const container = document.getElementById("config-ignorados-lista");
  if (!container) return;
  if (!config.alunosIgnorados.length) {
    container.innerHTML = '<p class="config-hint" style="margin:0">Nenhum aluno ignorado manualmente.</p>';
    return;
  }
  container.innerHTML = config.alunosIgnorados.map(item => {
    const data = item.quando ? formatarDataIgnorado(item.quando) : "data desconhecida";
    const nome = item.nome ? `<strong>${item.nome}</strong>` : "";
    return `<div class="ignorado-item">
      <div class="ignorado-info">
        ${nome}
        <span class="ignorado-email">${item.chave}</span>
        <span class="ignorado-data">📅 Ignorado em ${data}</span>
      </div>
      <button class="btn-link" onclick="desfazerIgnorar('${item.chave.replace(/'/g, "\\'")}')">↩️ Restaurar</button>
    </div>`;
  }).join("");
}

// ===================== EXPORTAR / IMPORTAR LISTA =====================
function exportarListaIgnorados() {
  if (!config.alunosIgnorados.length) {
    toast("Nenhum aluno na lista para exportar.", "info");
    return;
  }
  const payload = {
    versao: 1,
    exportadoEm: new Date().toISOString(),
    alunosIgnorados: config.alunosIgnorados
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `alunos_ignorados_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`${config.alunosIgnorados.length} aluno(s) exportado(s) para backup. ✅`);
}

function importarListaIgnorados() {
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
        let lista;
        if (Array.isArray(payload)) {
          // Formato simples: array de strings ou objetos
          lista = payload;
        } else if (payload && Array.isArray(payload.alunosIgnorados)) {
          lista = payload.alunosIgnorados;
        } else {
          throw new Error("Formato não reconhecido.");
        }
        // Normaliza
        lista = lista.map(item =>
          typeof item === "string" ? { chave: item, quando: null } : item
        ).filter(i => i && i.chave);

        if (!lista.length) {
          toast("Arquivo vazio ou inválido.", "error");
          return;
        }

        const modo = confirm(
          `Importar ${lista.length} aluno(s) ignorado(s).\n\n` +
          `OK = MESCLAR com a lista atual (${config.alunosIgnorados.length} já existentes)\n` +
          `Cancelar = SUBSTITUIR a lista atual`
        );

        if (modo) {
          // Mesclar (preservando os mais antigos)
          lista.forEach(item => {
            if (!config.alunosIgnorados.some(i => i.chave === item.chave)) {
              config.alunosIgnorados.push(item);
            }
          });
        } else {
          config.alunosIgnorados = lista;
        }

        salvarConfigStorage();
        renderListaIgnorados();
        // Reprocessa o CSV para refletir a nova lista
        if (rawCSVData) reprocessar();
        toast(`Lista importada (${config.alunosIgnorados.length} alunos no total). ✅`);
      } catch (err) {
        toast("Arquivo inválido: " + err.message, "error");
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

// ===================== ENCERRAMENTOS POR TURMA =====================
function adicionarEncerramento() {
  const sectionEl = document.getElementById("config-encerramento-section");
  const dataEl    = document.getElementById("config-encerramento-data");
  const sectionDigitada = (sectionEl.value || "").trim().toUpperCase();
  const section   = normalizarSectionKey(sectionDigitada);
  const data      = (dataEl.value || "").trim();

  if (!section) {
    toast("Informe o código da turma (ex: BRSAO244).", "error");
    sectionEl.focus();
    return;
  }
  if (!data) {
    toast("Informe a data e hora de encerramento.", "error");
    dataEl.focus();
    return;
  }

  // Avisa se houve correção automática de typo comum
  if (sectionDigitada !== section) {
    if (!confirm(`Detectado typo comum: "${sectionDigitada}" → "${section}".\n\nO Canvas usa "BR" e não "BRA" no prefixo. Salvar como "${section}"?`)) {
      return;
    }
  }

  config.encerramentos[section] = data;
  salvarConfigStorage();
  renderListaEncerramentos();
  sectionEl.value = "";
  dataEl.value = "";
  toast(`Encerramento da turma ${section} configurado para ${formatarEncerramento(data)} ✅`);
  // Re-renderiza a tabela para que os botões 📋/✉️ peguem a nova mensagem
  if (globalData.length) renderTable();
}

function removerEncerramento(section) {
  if (!confirm(`Remover a data de encerramento da turma "${section}"?`)) return;
  delete config.encerramentos[section];
  salvarConfigStorage();
  renderListaEncerramentos();
  if (globalData.length) renderTable();
  toast(`Encerramento da turma ${section} removido.`, "info");
}

function renderListaEncerramentos() {
  const container = document.getElementById("config-encerramentos-lista");
  if (!container) return;

  const entries = Object.entries(config.encerramentos || {});
  if (!entries.length) {
    container.innerHTML = '<p class="config-hint" style="margin:0">Nenhuma data de encerramento configurada.</p>';
    return;
  }

  container.innerHTML = entries.map(([section, iso]) => {
    return `<div class="encerramento-item">
      <div class="encerramento-info">
        <strong>${section}</strong>
        <span class="encerramento-data">📅 ${formatarEncerramento(iso)}</span>
      </div>
      <button class="btn-link" onclick="removerEncerramento('${section.replace(/'/g, "\\'")}')">🗑️ Remover</button>
    </div>`;
  }).join("");
}

// ===================== RENDER TABLE =====================
function renderTable() {
  const tbody = document.querySelector("#table tbody");
  tbody.innerHTML = "";

  let red = 0, yellow = 0, green = 0, graduated = 0;

  let filtered = globalData.filter(row => {
    const status = getStatus(row);
    return currentFilter === "all" || status === currentFilter;
  });

  const search = document.getElementById("search").value.toLowerCase();
  if (search) {
    filtered = filtered.filter(r =>
      r.name.toLowerCase().includes(search) ||
      r.email.toLowerCase().includes(search)
    );
  }

  filtered.sort((a, b) => {
    let valA = a[currentSort.key];
    let valB = b[currentSort.key];
    if (!isNaN(valA)) valA = parseFloat(valA);
    if (!isNaN(valB)) valB = parseFloat(valB);
    if (valA < valB) return currentSort.asc ? -1 : 1;
    if (valA > valB) return currentSort.asc ? 1 : -1;
    return 0;
  });

  globalData.forEach(row => {
    const s = getStatus(row);
    if (s === "red")       red++;
    if (s === "yellow")    yellow++;
    if (s === "green")     green++;
    if (s === "graduated") graduated++;
  });

  // No-results state
  document.getElementById("no-results").hidden = filtered.length > 0;

  filtered.forEach((row, index) => {
    const status  = getStatus(row);
    const msg     = gerarMensagem(row);
    const assunto = config.assuntoEmail;

    const icon =
      status === "graduated" ? "🎓" :
      status === "green"     ? "🟢" :
      status === "yellow"    ? "🟡" : "🔴";

    const barColor =
      status === "graduated" ? "#2563eb" :
      status === "green"     ? "#16a34a" :
      status === "yellow"    ? "#f59e0b" : "#dc2626";

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
          status === "graduated" ? '<span class="badge graduated">Graduado</span>' :
          status === "green"     ? '<span class="badge green">OK</span>'           :
          status === "yellow"    ? '<span class="badge yellow">Atenção</span>'     :
                                   '<span class="badge red">Crítico</span>'
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

    const btnCopiar = tr.querySelector(".btn-copiar");
    btnCopiar.dataset.email = row.email;
    btnCopiar.dataset.msg   = msg;
    btnCopiar.addEventListener("click", function (e) {
      e.stopPropagation();
      copiar(this.dataset.msg, this.dataset.email);
    });

    const btnIgnorar = tr.querySelector(".btn-ignorar");
    btnIgnorar.addEventListener("click", function (e) {
      e.stopPropagation();
      ignorarAluno(row);
    });

    tr.addEventListener("click", () => toggleDetalhe(tr, row));
    tbody.appendChild(tr);
  });

  const total = globalData.length;
  document.getElementById("count-all").querySelector(".counter-value").innerText       = total;
  document.getElementById("count-red").querySelector(".counter-value").innerText       = red;
  document.getElementById("count-yellow").querySelector(".counter-value").innerText    = yellow;
  document.getElementById("count-green").querySelector(".counter-value").innerText     = green;
  document.getElementById("count-graduated").querySelector(".counter-value").innerText = graduated;

  // Atualiza setas de ordenação
  document.querySelectorAll("th.sortable").forEach(th => {
    th.classList.remove("sort-active");
    if (th.dataset.key === currentSort.key) th.classList.add("sort-active");
  });

  // Re-renderiza gráficos se estiverem visíveis
  if (!document.getElementById("graficos-container").hidden) {
    renderGraficos();
  }
}

// ===================== LINHA EXPANSÍVEL =====================
function toggleDetalhe(tr, row) {
  const next = tr.nextSibling;
  if (next && next.classList && next.classList.contains("detalhe-row")) {
    next.remove();
    return;
  }
  const kcPendentes  = row.pendencias.filter(p => isKC(p)).map(formatarNomeAtividade);
  const labPendentes = row.pendencias.filter(p => isLab(p)).map(formatarNomeAtividade);
  const listaKC  = kcPendentes.length  ? kcPendentes.join("<br>")  : "<em>Nenhum pendente</em>";
  const listaLab = labPendentes.length ? labPendentes.join("<br>") : "<em>Nenhum pendente</em>";

  const detalhe = document.createElement("tr");
  detalhe.className = "detalhe-row";
  detalhe.innerHTML = `
    <td colspan="8">
      <div class="detalhe-conteudo">
        <strong>📧 E-mail:</strong> ${row.email || '<em>não informado</em>'}<br><br>
        <strong>📘 KCs pendentes (${kcPendentes.length}):</strong><br>${listaKC}
        <br><br>
        <strong>🧪 Labs pendentes (${labPendentes.length}):</strong><br>${listaLab}
      </div>
    </td>
  `;
  tr.after(detalhe);
}

// ===================== GERAR MENSAGEM =====================
function gerarMensagem(row) {
  const saudacao = getSaudacao();

  // 1. Mensagem celebrativa para alunos formalmente graduados
  if (row.graduated) {
    return `${saudacao} ${row.name}, tudo bem com você?

Você concluiu todos os KCs e laboratórios da plataforma Canvas e oficializou sua graduação no curso AWS re/Start! Seu status no sistema foi atualizado para Graduated 🎓.

Que jornada! Foram vários meses de dedicação, laboratórios desafiadores e muita persistência, e você chegou até aqui.

Atenciosamente,`;
  }

  // 2. Mensagem motivacional para quem concluiu todas as atividades disponíveis
  //    mas ainda não foi formalmente graduado (graduated=false e zero pendências)
  if (!row.pendencias || row.pendencias.length === 0) {
    const primeiroNome = (row.name || "").split(" ")[0] || row.name || "aluno";
    return `${saudacao}, ${primeiroNome}.

Seu desempenho nos KCs está em ${row.kc}%, e seu desempenho nos Labs está em ${row.lab}%.

Parabéns, você concluiu todos os KCs e laboratórios disponíveis até o momento! Essa conquista reflete sua dedicação e compromisso em aproveitar ao máximo essa oportunidade.

Continue estudando e revisando os conteúdos, pois o próximo grande passo está à sua frente: a certificação Cloud Practitioner! Essa certificação é uma porta de entrada para oportunidades no mercado, e você já está na direção certa.

Lembre-se: todo o esforço investido agora é um investimento no seu futuro.`;
  }

  // 3. Mensagem padrão (alunos com pendências em KCs ou Labs)
  const kcPendentes  = row.pendencias.filter(p => isKC(p));
  const labPendentes = row.pendencias.filter(p => isLab(p));

  const listaKC  = kcPendentes.length
    ? kcPendentes.map(item => formatarNomeAtividade(item)).join("\n")
    : "Nenhum pendente";

  const listaLab = labPendentes.length
    ? labPendentes.map(item => formatarNomeAtividade(item)).join("\n")
    : "Nenhum pendente";

  // Aviso opcional de encerramento — só se houver data configurada para a turma do aluno
  // Aplica a mesma normalização da chave para tolerar typos comuns (BRASAO ↔ BRSAO)
  const sectionLookup = normalizarSectionKey(row.section);
  const encerramentoISO = sectionLookup && config.encerramentos
    ? config.encerramentos[sectionLookup]
    : null;
  const avisoEncerramento = encerramentoISO
    ? `\nENCERRAMENTO NO CANVAS: ${formatarEncerramento(encerramentoISO)}, APÓS ESTE PERÍODO, NÃO SERÁ POSSÍVEL REALIZAR ENTREGAS E O ALUNO SERÁ CONSIDERADO REPROVADO.\n`
    : "";

  return `${saudacao} ${row.name}, tudo bem com você?

Segue seu desempenho atual nas atividades re/Start:

Na média em KC's você está com ${row.kc}%, e em Lab's está em ${row.lab}%.

Os KCs/Labs pendentes são:
${avisoEncerramento}
📘 KC (Knowledge Check)
${listaKC}

🧪 Lab (Laboratórios)
${listaLab}

Lembre-se:

1. Conclusão de 100% dos Laboratórios.
2. Pontuação mínima de ${config.criterioKC}% em KC's.
3. Presença mínima de 80%.

Atenciosamente,`;
}

// ===================== COPIAR =====================
async function copiar(msg, email) {
  try {
    await navigator.clipboard.writeText(msg);
    toast("Mensagem copiada! Abrindo e-mail... ✅");
  } catch {
    toast("Não foi possível copiar automaticamente.", "error");
  }
  window.open(`https://outlook.office.com/mail/deeplink/compose?to=${email}`, "_blank");
}

// ===================== ÁREA DE CÓPIA =====================
function mostrarAreaCopia() {
  const area = document.getElementById("area-copia");
  area.hidden = !area.hidden;
  if (!area.hidden) {
    area.scrollIntoView({ behavior: "smooth", block: "nearest" });
    document.getElementById("lista-emails").focus();
  }
}

// ===================== COPIAR DESEMPENHO ORDENADO =====================
function copiarDesempenhoOrdenado() {
  const input  = document.getElementById("lista-emails").value;
  const emails = input.split("\n").map(e => e.trim().toLowerCase()).filter(e => e);

  if (!emails.length) {
    toast("Cole ao menos um e-mail.", "warning");
    return;
  }

  let resultado      = "";
  let encontrados    = 0;
  const naoEncontrados = [];

  emails.forEach(email => {
    const aluno = globalData.find(a => (a.email || "").trim().toLowerCase() === email);
    if (aluno) {
      encontrados++;
      const total = parseFloat(aluno.total).toFixed(1).replace(".", ",") + "%";
      const lab   = parseFloat(aluno.lab).toFixed(1).replace(".", ",")   + "%";
      const kc    = parseFloat(aluno.kc).toFixed(1).replace(".", ",")    + "%";
      resultado += `${total}\t${lab}\t${kc}\n`;
    } else {
      naoEncontrados.push(email);
      resultado += `email não corresponde ao cadastrado no canvas\t\t\n`;
    }
  });

  copiarParaClipboard(resultado.trim());

  if (naoEncontrados.length > 0) {
    console.warn("E-mails não encontrados:", naoEncontrados);
    toast(`⚠️ ${naoEncontrados.length} e-mail(s) não encontrado(s). Veja o console (F12).`, "warning");
  } else {
    toast(`Desempenho copiado! ${encontrados} aluno(s) encontrado(s). ✅`);
  }
}

function copiarParaClipboard(texto) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(texto).catch(() => fallbackCopy(texto));
  } else {
    fallbackCopy(texto);
  }
}

function fallbackCopy(texto) {
  const temp = document.createElement("textarea");
  temp.value = texto;
  temp.style.cssText = "position:fixed;opacity:0;";
  document.body.appendChild(temp);
  temp.select();
  document.execCommand("copy");
  document.body.removeChild(temp);
}

// ===================== ENVIO EM MASSA (MODAL) =====================
function abrirEnvioMassa(status) {
  const alunos = globalData.filter(r => getStatus(r) === status);

  if (!alunos.length) {
    toast("Nenhum aluno nesse status.", "info");
    return;
  }

  const labelMap = {
    red:       "Críticos 🔴",
    yellow:    "Atenção 🟡",
    green:     "OK 🟢",
    graduated: "Graduados 🎓"
  };

  envioFila  = alunos;
  envioIndex = 0;

  document.getElementById("envio-info").innerHTML =
    `Preparando e-mails para <strong>${alunos.length} aluno(s)</strong> com status <strong>${labelMap[status]}</strong>.`;

  // Renderiza lista
  const listaEl = document.getElementById("envio-lista");
  listaEl.innerHTML = "";
  alunos.forEach((aluno, idx) => {
    const item = document.createElement("div");
    item.className = "envio-item";
    item.dataset.idx = idx;
    item.innerHTML = `
      <div class="envio-item-info">
        <div class="envio-item-name">${aluno.name}</div>
        <div class="envio-item-email">${aluno.email}</div>
      </div>
      <button class="envio-item-action btn-primary" onclick="abrirEmailIndividual(${idx})">
        ✉️ Abrir
      </button>
    `;
    listaEl.appendChild(item);
  });

  // Lista textual (para copiar)
  document.getElementById("lista-emails-massa").value = alunos.map(a => a.email).join("; ");

  atualizarProgressoEnvio();
  abrirModal("modal-envio");
  trocarAbaEnvio("individual");
}

function abrirEmailIndividual(idx) {
  const aluno   = envioFila[idx];
  const msg     = gerarMensagem(aluno);
  const assunto = config.assuntoEmail;

  window.open(
    `https://outlook.office.com/mail/deeplink/compose?to=${aluno.email}` +
    `&subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(msg)}`,
    "_blank"
  );

  // Marca como enviado
  const item = document.querySelector(`.envio-item[data-idx="${idx}"]`);
  if (item) {
    item.classList.add("sent");
    const btn = item.querySelector("button");
    btn.innerHTML = "✅ Aberto";
  }

  envioIndex = Math.max(envioIndex, idx + 1);
  atualizarProgressoEnvio();
}

function abrirProximoEmail() {
  if (envioIndex >= envioFila.length) {
    toast("Todos os e-mails foram abertos! ✅");
    return;
  }
  abrirEmailIndividual(envioIndex);
}

function atualizarProgressoEnvio() {
  const enviados = document.querySelectorAll(".envio-item.sent").length;
  const total = envioFila.length;
  document.getElementById("envio-progress-text").innerText =
    `${enviados} de ${total} e-mails abertos`;

  const btnProximo = document.getElementById("btn-proximo-email");
  if (enviados >= total) {
    btnProximo.innerText = "✅ Todos abertos";
    btnProximo.disabled = true;
  } else {
    btnProximo.innerText = "▶️ Abrir próximo";
    btnProximo.disabled = false;
  }
}

function trocarAbaEnvio(aba) {
  document.querySelectorAll(".envio-tab").forEach(t => {
    const ativa = t.dataset.tab === aba;
    t.classList.toggle("active", ativa);
    t.setAttribute("aria-selected", ativa ? "true" : "false");
  });
  document.querySelectorAll(".envio-tab-content").forEach(c => {
    c.classList.toggle("active", c.id === `envio-tab-${aba}`);
  });
}

function copiarListaEmails() {
  const texto = document.getElementById("lista-emails-massa").value;
  copiarParaClipboard(texto);
  toast("Lista de e-mails copiada! ✅");
}

function exportarMensagens() {
  let conteudo = "";
  envioFila.forEach((aluno, i) => {
    conteudo += `============================================================\n`;
    conteudo += `Aluno ${i + 1}: ${aluno.name}\n`;
    conteudo += `E-mail: ${aluno.email}\n`;
    conteudo += `Assunto: ${config.assuntoEmail}\n`;
    conteudo += `============================================================\n\n`;
    conteudo += gerarMensagem(aluno);
    conteudo += "\n\n";
  });

  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mensagens_alunos_${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`${envioFila.length} mensagem(ns) exportada(s)! ✅`);
}

function exportarMensagensCSV() {
  const headers = ["Nome", "Email", "Assunto", "Mensagem"];
  const rows = envioFila.map(aluno => [
    aluno.name,
    aluno.email,
    config.assuntoEmail,
    gerarMensagem(aluno).replace(/\n/g, " | ")
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${(v || "").toString().replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mensagens_alunos_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("CSV de mensagens exportado! ✅");
}

// ===================== MODAIS GENÉRICOS =====================
function abrirModal(id) {
  document.getElementById(id).hidden = false;
  document.body.style.overflow = "hidden";
}

function fecharModal(id) {
  document.getElementById(id).hidden = true;
  document.body.style.overflow = "";
}

// Fecha modal ao clicar no fundo
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal")) {
    e.target.hidden = true;
    document.body.style.overflow = "";
  }
});

// ===================== CONFIGURAÇÕES =====================
function abrirConfiguracoes() {
  document.getElementById("config-min-alunos").value    = config.minAlunos;
  document.getElementById("config-criterio-kc").value   = config.criterioKC;
  document.getElementById("config-criterio-lab").value  = config.criterioLab;
  document.getElementById("config-assunto-email").value = config.assuntoEmail;

  // Atualiza info contextual
  const infoEl = document.getElementById("config-min-alunos-info");
  if (globalData.length && globalData.length < config.minAlunos) {
    infoEl.innerText = `ℹ️ Sua turma tem ${globalData.length} alunos — o limite efetivo será reduzido automaticamente.`;
  } else {
    infoEl.innerText = "";
  }

  // Pré-popula campo de Section com a turma do CSV atual (se houver)
  const sectionEl = document.getElementById("config-encerramento-section");
  if (sectionEl) {
    const turmaAtual = globalData.length && globalData[0].section ? globalData[0].section : "";
    sectionEl.placeholder = turmaAtual ? `Ex: ${turmaAtual} (turma atual)` : "Ex: BRSAO244";
  }

  renderListaIgnorados();
  renderListaEncerramentos();
  abrirModal("modal-config");
}

function salvarConfiguracoes() {
  const minAlunos    = parseInt(document.getElementById("config-min-alunos").value, 10);
  const criterioKC   = parseFloat(document.getElementById("config-criterio-kc").value);
  const criterioLab  = parseFloat(document.getElementById("config-criterio-lab").value);
  const assuntoEmail = document.getElementById("config-assunto-email").value.trim();

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

  config.minAlunos    = minAlunos;
  config.criterioKC   = criterioKC;
  config.criterioLab  = criterioLab;
  config.assuntoEmail = assuntoEmail;

  salvarConfigStorage();
  fecharModal("modal-config");

  // Se o limite mudou e tem dados, reprocessa
  if (minMudou && pendingPreview) {
    // ainda no preview — atualiza
    const validation = validarCSV(pendingPreview.rawData, pendingPreview.meta);
    pendingPreview.validation = validation;
    mostrarPreview(validation);
  }

  if (globalData.length) {
    if (minMudou) {
      reprocessar();  // recalcula KC/Lab/Total/pendências com o novo threshold
      toast("Configurações salvas e cálculos refeitos! ✅");
    } else {
      // Só os critérios mudaram (afetam apenas o status, não as médias) — re-render basta
      renderTable();
      toast("Configurações salvas e aplicadas! ✅");
    }
  } else {
    toast("Configurações salvas! ✅");
  }
}

function resetarConfiguracoes() {
  if (!confirm("Restaurar configurações de critério para o padrão?\n\n(A lista de alunos ignorados será preservada.)")) return;
  const ignoradosBackup = [...config.alunosIgnorados];
  config = { ...CONFIG_DEFAULT, alunosIgnorados: ignoradosBackup };
  salvarConfigStorage();
  abrirConfiguracoes();
  toast("Configurações de critério restauradas para o padrão.");
}

function resetarMinAlunos() {
  document.getElementById("config-min-alunos").value = CONFIG_DEFAULT.minAlunos;
}

// ===================== AJUDA =====================
function abrirAjuda() {
  abrirModal("modal-ajuda");
}

// ===================== GRÁFICOS =====================
function toggleGraficos() {
  const container = document.getElementById("graficos-container");
  const btn       = document.getElementById("btnGraficos");
  if (container.hidden) {
    container.hidden = false;
    btn.innerText = "📊 Ocultar gráficos";
    renderGraficos();
  } else {
    container.hidden = true;
    btn.innerText = "📊 Mostrar gráficos";
  }
}

function renderGraficos() {
  if (!globalData.length || typeof Chart === "undefined") return;

  let red = 0, yellow = 0, green = 0, graduated = 0;
  let kcSum = 0, labSum = 0, totalSum = 0;
  let count = 0;
  globalData.forEach(row => {
    const s = getStatus(row);
    if (s === "red")       red++;
    if (s === "yellow")    yellow++;
    if (s === "green")     green++;
    if (s === "graduated") graduated++;
    kcSum    += parseFloat(row.kc);
    labSum   += parseFloat(row.lab);
    totalSum += parseFloat(row.total);
    count++;
  });

  const isDark = document.body.classList.contains("dark");
  const textColor = isDark ? "#e2e8f0" : "#1f2937";
  const gridColor = isDark ? "#334155" : "#e5e7eb";

  // Gráfico de status (donut)
  const ctxStatus = document.getElementById("grafico-status").getContext("2d");
  if (chartStatus) chartStatus.destroy();
  chartStatus = new Chart(ctxStatus, {
    type: "doughnut",
    data: {
      labels: ["Críticos 🔴", "Atenção 🟡", "OK 🟢", "Graduados 🎓"],
      datasets: [{
        data: [red, yellow, green, graduated],
        backgroundColor: ["#dc2626", "#f59e0b", "#16a34a", "#2563eb"],
        borderColor: isDark ? "#1e293b" : "#fff",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: textColor, font: { size: 12 }, padding: 12 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      }
    }
  });

  // Gráfico de média (bar)
  const mediaKC    = count ? (kcSum / count).toFixed(2)    : 0;
  const mediaLab   = count ? (labSum / count).toFixed(2)   : 0;
  const mediaTotal = count ? (totalSum / count).toFixed(2) : 0;

  const ctxMedia = document.getElementById("grafico-media").getContext("2d");
  if (chartMedia) chartMedia.destroy();
  chartMedia = new Chart(ctxMedia, {
    type: "bar",
    data: {
      labels: ["KCs", "Labs", "Total"],
      datasets: [{
        label: "Média da turma (%)",
        data: [mediaKC, mediaLab, mediaTotal],
        backgroundColor: ["#3b82f6", "#8b5cf6", "#10b981"],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y}%` } }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: textColor, callback: (v) => v + "%" },
          grid: { color: gridColor }
        },
        x: {
          ticks: { color: textColor },
          grid: { color: gridColor }
        }
      }
    }
  });
}

// ===================== ATALHOS DE TECLADO =====================
document.addEventListener("keydown", (e) => {
  // Ignora se estiver digitando em input/textarea
  const inField = ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);

  if (e.key === "/" && !inField) {
    e.preventDefault();
    const search = document.getElementById("search");
    if (search) search.focus();
  }

  if (e.key === "Escape") {
    // Fecha modais abertos
    document.querySelectorAll(".modal:not([hidden])").forEach(m => {
      m.hidden = true;
    });
    document.body.style.overflow = "";
    // Limpa busca
    const search = document.getElementById("search");
    if (search && search.value && document.activeElement === search) {
      search.value = "";
      document.getElementById("searchClear").hidden = true;
      renderTable();
    }
  }

  if ((e.key === "d" || e.key === "D") && !inField) {
    toggleDarkMode();
  }
});

// ===================== INICIALIZAÇÃO =====================
document.addEventListener("DOMContentLoaded", () => {
  configurarDropzone();

  // Atualiza ícone do dark mode
  const isDark = document.body.classList.contains("dark");
  const btn = document.getElementById("darkToggleBtn");
  if (btn) btn.querySelector("span").textContent = isDark ? "☀️" : "🌙";
});
