const DEFAULT_P1_IDS = ["11268195","12188801","4148780","12162441","12070166","12179007","12113980","12261266","12208254","12287669"];
const DEFAULT_P2_IDS = ["11845210","11930412","12014588","11789234","12219044","11654321","12098765","11876543","12143210","11987654"];

const FALLBACK_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100"><ellipse cx="60" cy="56" rx="38" ry="30" fill="#64748b" stroke="#cbd5e1" stroke-width="4"/><circle cx="48" cy="50" r="5" fill="#fff"/><circle cx="72" cy="50" r="5" fill="#fff"/></svg>`
);

const axieUrl = (id) => {
  const c = String(id || "").trim();
  return c ? `https://axiecdn.axieinfinity.com/axies/${c}/axie/axie-full-transparent.png` : FALLBACK_SVG;
};
const makeImg = (id, alt = "") => {
  const img = document.createElement("img");
  img.src = axieUrl(id);
  img.alt = alt;
  img.onerror = () => { img.onerror = null; img.src = FALLBACK_SVG; };
  return img;
};
const mkTeam = (ids) => ids.map((id) => ({ id, banned: false }));
const $ = (id) => document.getElementById(id);

const state = {
  p1Name: "Jugador 1", p2Name: "Jugador 2",
  p1Axies: mkTeam(DEFAULT_P1_IDS), p2Axies: mkTeam(DEFAULT_P2_IDS),
  phase: "COIN_CALL", // COIN_CALL | COIN_DECIDE | BLIND_P1 | BLIND_P2 | SEQ_DRAFT | COMPLETED
  coinCaller: 1, coinWinner: null, coinRotation: 0, coinFlipping: false,
  blindP1Target: null, blindP2Target: null,
  seqQueue: [], seqStep: 0,
  selSide: null, selIndex: null,
  history: []
};

const el = {};
["arena-app","p1-name-display","p2-name-display","p1-hud","p2-hud","p1-ban-count","p2-ban-count","phase-text",
 "grid-p1","grid-p2","hero-img-p1","hero-img-p2","hero-ban-seal-p1","hero-ban-seal-p2","spotlight-p1-label","spotlight-p2-label",
 "coin-box","coin-3d","coin-caller-name","coin-choice-controls","coin-winner-controls","coin-result-msg",
 "confirm-ban-box","target-preview-text","btn-confirm-ban","btn-main-play","play-btn-label","play-btn-sub",
 "privacy-curtain","curtain-title","curtain-opponent","curtain-actor","btn-curtain-ready",
 "btn-undo","btn-reset","btn-edit-teams","bg-upload","teams-modal","btn-close-teams","input-p1-name","input-p2-name",
 "paste-p1","paste-p2","btn-apply-paste-p1","btn-apply-paste-p2","editor-slots-p1","editor-slots-p2","btn-load-sample","btn-save-teams",
 "summary-modal","btn-close-summary","summary-p1-title","summary-p2-title","summary-p1-axies","summary-p2-axies",
 "btn-copy-p1","btn-copy-p2","btn-new-match","btn-take-advantage","btn-give-advantage"
].forEach((id) => { el[id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())] = $(id); });

const nameOf = (n) => (n === 1 ? state.p1Name : state.p2Name);
const teamOf = (n) => (n === 1 ? state.p1Axies : state.p2Axies);
const other = (n) => (n === 1 ? 2 : 1);

function currentActor() {
  if (state.phase === "BLIND_P1") return 1;
  if (state.phase === "BLIND_P2") return 2;
  if (state.phase === "SEQ_DRAFT") return state.seqQueue[state.seqStep] || null;
  return null;
}

function setHero(side, axie, banned = false) {
  const img = side === 1 ? el.heroImgP1 : el.heroImgP2;
  const seal = side === 1 ? el.heroBanSealP1 : el.heroBanSealP2;
  const label = side === 1 ? el.spotlightP1Label : el.spotlightP2Label;
  if (!axie) return;
  img.onerror = () => { img.onerror = null; img.src = FALLBACK_SVG; };
  img.src = axieUrl(axie.id);
  label.textContent = `${nameOf(side).toUpperCase()} • #${axie.id}`;
  const showBan = axie.banned || banned;
  img.classList.toggle("banned-tint", showBan);
  seal.classList.toggle("hidden", !showBan);
}

function clearSelection() {
  state.selSide = null; state.selIndex = null;
  el.targetPreviewText.textContent = "Selecciona un Axie enemigo abajo";
  el.btnConfirmBan.disabled = true;
}

function renderGrids() {
  const actor = currentActor();
  const enemy = actor ? other(actor) : null;
  [1, 2].forEach((side) => {
    const grid = side === 1 ? el.gridP1 : el.gridP2;
    grid.innerHTML = "";
    teamOf(side).forEach((axie, idx) => {
      const slot = document.createElement("div");
      slot.className = "axie-slot";
      const targetable = enemy === side && !axie.banned;
      if (axie.banned) slot.classList.add("banned");
      else if (state.phase === "COMPLETED") slot.classList.add("survived-final");
      else if (targetable) slot.classList.add("targetable");
      else slot.classList.add("disabled-slot");
      if (state.selSide === side && state.selIndex === idx) slot.classList.add("selected-target");

      const tag = document.createElement("span");
      tag.className = "slot-id-label";
      tag.textContent = `#${axie.id}`;
      slot.append(makeImg(axie.id, `Axie ${axie.id}`), tag);

      if (axie.banned) {
        const mark = document.createElement("div");
        mark.className = "slot-ban-mark";
        mark.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="rgba(220,38,38,.18)" stroke="#dc2626" stroke-width="10"/><line x1="22" y1="78" x2="78" y2="22" stroke="#dc2626" stroke-width="10" stroke-linecap="round"/></svg>`;
        slot.appendChild(mark);
      }

      slot.addEventListener("mouseenter", () => { if (state.selSide === null) setHero(side, axie); });
      slot.addEventListener("click", () => {
        // El sello rojo solo se muestra en baneos visibles: en los ocultos delataría la elección
        setHero(side, axie, targetable && state.phase === "SEQ_DRAFT");
        if (!targetable) return;
        state.selSide = side; state.selIndex = idx;
        el.targetPreviewText.textContent = `Objetivo marcado: #${axie.id} (${nameOf(side)})`;
        el.btnConfirmBan.disabled = false;
        renderGrids();
      });
      grid.appendChild(slot);
    });
  });
}

function updateHUD() {
  el.p1NameDisplay.textContent = state.p1Name;
  el.p2NameDisplay.textContent = state.p2Name;
  el.coinCallerName.textContent = nameOf(state.coinCaller);
  el.p1BanCount.textContent = state.p2Axies.filter((a) => a.banned).length;
  el.p2BanCount.textContent = state.p1Axies.filter((a) => a.banned).length;

  const actor = currentActor();
  el.p1Hud.classList.toggle("active-turn", actor === 1);
  el.p2Hud.classList.toggle("active-turn", actor === 2);

  const undoOk = state.history.length > 0 && (state.phase === "SEQ_DRAFT" || state.phase === "COMPLETED");
  el.btnUndo.classList.toggle("hidden", !undoOk);
  el.coinBox.classList.toggle("hidden", state.phase !== "COIN_CALL" && state.phase !== "COIN_DECIDE");
  el.confirmBanBox.classList.toggle("hidden", !actor);
  el.btnMainPlay.classList.remove("ready-to-play");
  el.btnMainPlay.disabled = true;

  const set = (text, label, sub) => { el.phaseText.textContent = text; el.playBtnLabel.textContent = label; el.playBtnSub.textContent = sub; };
  switch (state.phase) {
    case "COIN_CALL": set(`${nameOf(state.coinCaller)} elige Cara o Cruz para lanzar la moneda`, "MONEDA", "Sorteo inicial"); break;
    case "COIN_DECIDE": set(`¡${nameOf(state.coinWinner)} ganó la moneda! Decide quién tiene el último baneo`, "ORDEN", "Elige ventaja"); break;
    case "BLIND_P1": set(`Baneo oculto: ${state.p1Name} elige 1 Axie de ${state.p2Name}`, "OCULTO 1/2", state.p1Name); break;
    case "BLIND_P2": set(`Baneo oculto: ${state.p2Name} elige 1 Axie de ${state.p1Name}`, "OCULTO 2/2", state.p2Name); break;
    case "SEQ_DRAFT": {
      const n = state.seqStep + 1, t = state.seqQueue.length;
      set(`Baneo secuencial (${n}/${t})${n === t ? " [ÚLTIMO BAN]" : ""}: turno de ${nameOf(actor)}`, `BAN ${n}/${t}`, nameOf(actor));
      break;
    }
    case "COMPLETED":
      set("¡Draft completado! Quedan 7 vs 7. Pulsa PLAY para ver el resumen", "PLAY", "Ver 7 vs 7");
      el.btnMainPlay.classList.add("ready-to-play");
      el.btnMainPlay.disabled = false;
      break;
  }
}

function refresh() { updateHUD(); renderGrids(); }

function showCurtain(actor) {
  el.curtainTitle.textContent = `Turno secreto de ${nameOf(actor)}`;
  el.curtainOpponent.textContent = nameOf(other(actor));
  el.curtainActor.textContent = nameOf(actor);
  el.privacyCurtain.classList.remove("hidden");
}
el.btnCurtainReady.addEventListener("click", () => el.privacyCurtain.classList.add("hidden"));

// ---- Moneda ----
document.querySelectorAll("[data-call]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (state.phase !== "COIN_CALL" || state.coinFlipping) return;
    state.coinFlipping = true;
    const result = Math.random() < 0.5 ? "CARA" : "CRUZ";
    const base = Math.ceil(state.coinRotation / 360) * 360; // alinear a múltiplo de 360
    state.coinRotation = base + 1440 + (result === "CARA" ? 0 : 180);
    el.coin3d.style.transform = `rotateY(${state.coinRotation}deg)`;
    state.coinWinner = btn.dataset.call === result ? state.coinCaller : other(state.coinCaller);
    setTimeout(() => {
      state.coinFlipping = false;
      state.phase = "COIN_DECIDE";
      el.coinChoiceControls.classList.add("hidden");
      el.coinWinnerControls.classList.remove("hidden");
      el.coinResultMsg.textContent = `Salió ${result} — ¡Gana ${nameOf(state.coinWinner)}!`;
      updateHUD();
    }, 1650);
  });
});

// Ciego: 1 c/u. Secuencial 1-2-1 (4 turnos): 2 baneos para cada uno. Total 3 c/u → 10 - 3 = 7.
function startBlindPhase(takesLastBan) {
  const winner = state.coinWinner, loser = other(winner);
  const first = takesLastBan ? winner : loser, second = other(first);
  state.seqQueue = [first, second, second, first];
  state.seqStep = 0;
  state.phase = "BLIND_P1";
  clearSelection();
  refresh();
  showCurtain(1);
}
el.btnTakeAdvantage.addEventListener("click", () => startBlindPhase(true));
el.btnGiveAdvantage.addEventListener("click", () => startBlindPhase(false));

// ---- Confirmar baneo ----
el.btnConfirmBan.addEventListener("click", () => {
  if (state.selSide === null) return;

  if (state.phase === "BLIND_P1") {
    state.blindP1Target = state.selIndex;
    clearSelection();
    setHero(1, state.p1Axies[0]); setHero(2, state.p2Axies[0]); // sin rastro de la elección
    state.phase = "BLIND_P2";
    refresh();
    showCurtain(2);
    return;
  }
  if (state.phase === "BLIND_P2") {
    state.blindP2Target = state.selIndex;
    const a2 = state.p2Axies[state.blindP1Target], a1 = state.p1Axies[state.blindP2Target];
    a1.banned = a2.banned = true; // revelación simultánea
    setHero(1, a1, true); setHero(2, a2, true);
    clearSelection();
    state.phase = "SEQ_DRAFT";
    refresh();
    return;
  }
  if (state.phase === "SEQ_DRAFT") {
    const axie = teamOf(state.selSide)[state.selIndex];
    axie.banned = true;
    state.history.push({ side: state.selSide, index: state.selIndex, seqStep: state.seqStep });
    setHero(state.selSide, axie, true);
    clearSelection();
    state.seqStep++;
    if (state.seqStep >= state.seqQueue.length) state.phase = "COMPLETED";
    refresh();
  }
});

el.btnUndo.addEventListener("click", () => {
  if (!state.history.length || (state.phase !== "SEQ_DRAFT" && state.phase !== "COMPLETED")) return;
  const last = state.history.pop();
  const axie = teamOf(last.side)[last.index];
  axie.banned = false;
  state.seqStep = last.seqStep;
  state.phase = "SEQ_DRAFT";
  clearSelection();
  setHero(last.side, axie);
  refresh();
});

// ---- Nombres ----
function renamePlayer(n) {
  const next = window.prompt(`Nombre para Jugador ${n} (vacío = "Jugador ${n}"):`, nameOf(n));
  if (next === null) return;
  state[n === 1 ? "p1Name" : "p2Name"] = next.trim() || `Jugador ${n}`;
  updateHUD(); setHero(1, state.p1Axies[0]); setHero(2, state.p2Axies[0]);
}
el.p1NameDisplay.addEventListener("click", () => renamePlayer(1));
el.p2NameDisplay.addEventListener("click", () => renamePlayer(2));

// ---- Editor de equipos ----
function buildEditorSlots() {
  [1, 2].forEach((side) => {
    const box = side === 1 ? el.editorSlotsP1 : el.editorSlotsP2;
    box.innerHTML = "";
    teamOf(side).forEach((axie, i) => {
      const row = document.createElement("div");
      row.className = "editor-slot-item";
      const img = makeImg(axie.id);
      const inp = document.createElement("input");
      inp.type = "text"; inp.inputMode = "numeric"; inp.value = axie.id; inp.placeholder = `Axie ${i + 1}`;
      inp.addEventListener("input", () => {
        inp.value = inp.value.replace(/\D/g, "");
        img.onerror = () => { img.onerror = null; img.src = FALLBACK_SVG; };
        img.src = axieUrl(inp.value);
      });
      row.append(img, inp);
      box.appendChild(row);
    });
  });
}

const parseIds = (raw) => raw.split(/[\s,;|]+/).map((t) => t.replace(/\D/g, "")).filter(Boolean).slice(0, 10);

function applyPaste(side, raw) {
  const ids = parseIds(raw);
  const box = side === 1 ? el.editorSlotsP1 : el.editorSlotsP2;
  const inputs = box.querySelectorAll("input"), imgs = box.querySelectorAll("img");
  ids.forEach((id, i) => { if (inputs[i]) { inputs[i].value = id; imgs[i].src = axieUrl(id); } });
}
el.btnApplyPasteP1.addEventListener("click", () => applyPaste(1, el.pasteP1.value));
el.btnApplyPasteP2.addEventListener("click", () => applyPaste(2, el.pasteP2.value));
el.btnLoadSample.addEventListener("click", () => { applyPaste(1, DEFAULT_P1_IDS.join(" ")); applyPaste(2, DEFAULT_P2_IDS.join(" ")); });

el.btnEditTeams.addEventListener("click", () => {
  el.inputP1Name.value = state.p1Name === "Jugador 1" ? "" : state.p1Name;
  el.inputP2Name.value = state.p2Name === "Jugador 2" ? "" : state.p2Name;
  el.pasteP1.value = ""; el.pasteP2.value = "";
  buildEditorSlots();
  el.teamsModal.classList.remove("hidden");
});
el.btnCloseTeams.addEventListener("click", () => el.teamsModal.classList.add("hidden"));

function resetMatch() {
  [...state.p1Axies, ...state.p2Axies].forEach((a) => (a.banned = false));
  Object.assign(state, { phase: "COIN_CALL", coinWinner: null, blindP1Target: null, blindP2Target: null, seqQueue: [], seqStep: 0, history: [], coinFlipping: false });
  clearSelection();
  el.coinChoiceControls.classList.remove("hidden");
  el.coinWinnerControls.classList.add("hidden");
  el.privacyCurtain.classList.add("hidden");
  el.summaryModal.classList.add("hidden");
  setHero(1, state.p1Axies[0]); setHero(2, state.p2Axies[0]);
  refresh();
}

el.btnSaveTeams.addEventListener("click", () => {
  const read = (box, defaults) => Array.from(box.querySelectorAll("input")).map((inp, i) => inp.value.trim() || defaults[i]);
  const ids1 = read(el.editorSlotsP1, DEFAULT_P1_IDS), ids2 = read(el.editorSlotsP2, DEFAULT_P2_IDS);
  if (new Set(ids1).size < ids1.length || new Set(ids2).size < ids2.length) {
    window.alert("Hay IDs repetidos dentro de un mismo equipo. Corrígelos antes de guardar.");
    return;
  }
  state.p1Name = el.inputP1Name.value.trim() || "Jugador 1";
  state.p2Name = el.inputP2Name.value.trim() || "Jugador 2";
  state.p1Axies = mkTeam(ids1);
  state.p2Axies = mkTeam(ids2);
  el.teamsModal.classList.add("hidden");
  resetMatch();
});
el.btnReset.addEventListener("click", resetMatch);
el.btnNewMatch.addEventListener("click", resetMatch);

// ---- Resumen final ----
function openSummary() {
  const a1 = state.p1Axies.filter((a) => !a.banned), a2 = state.p2Axies.filter((a) => !a.banned);
  el.summaryP1Title.textContent = `${state.p1Name} (${a1.length} Habilitados)`;
  el.summaryP2Title.textContent = `${state.p2Name} (${a2.length} Habilitados)`;
  el.btnCopyP1.textContent = `📋 Copiar ${a1.length} IDs de ${state.p1Name}`;
  el.btnCopyP2.textContent = `📋 Copiar ${a2.length} IDs de ${state.p2Name}`;
  [[el.summaryP1Axies, a1], [el.summaryP2Axies, a2]].forEach(([box, list]) => {
    box.innerHTML = "";
    list.forEach((axie) => {
      const card = document.createElement("div");
      card.className = "summary-axie-card";
      const label = document.createElement("span");
      label.textContent = `#${axie.id}`;
      card.append(makeImg(axie.id, `Axie ${axie.id}`), label);
      box.appendChild(card);
    });
  });
  el.summaryModal.classList.remove("hidden");
}
el.btnMainPlay.addEventListener("click", () => { if (state.phase === "COMPLETED") openSummary(); });
el.btnCloseSummary.addEventListener("click", () => el.summaryModal.classList.add("hidden"));

function copyIds(side, btn) {
  const text = teamOf(side).filter((a) => !a.banned).map((a) => a.id).join("\n");
  const done = () => {
    const prev = btn.textContent;
    btn.textContent = "✅ ¡IDs copiados!";
    setTimeout(() => (btn.textContent = prev), 1800);
  };
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
    .then(done)
    .catch(() => window.prompt("Copia manualmente los IDs:", text));
}
el.btnCopyP1.addEventListener("click", () => copyIds(1, el.btnCopyP1));
el.btnCopyP2.addEventListener("click", () => copyIds(2, el.btnCopyP2));

// ---- Fondo personalizado ----
el.bgUpload.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    el.arenaApp.style.backgroundImage = `linear-gradient(rgba(10,20,14,.25), rgba(10,20,14,.45)), url("${ev.target.result}")`;
  };
  reader.readAsDataURL(file);
});

// ---- Inicio ----
setHero(1, state.p1Axies[0]);
setHero(2, state.p2Axies[0]);
refresh();
