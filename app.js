const DEFAULT_P1_IDS = [
  "11268195", "12188801", "4148780", "12162441", "12070166",
  "12179007", "12113980", "12261266", "12208254", "12287669"
];

const DEFAULT_P2_IDS = [
  "11845210", "11930412", "12014588", "11789234", "12219044",
  "11654321", "12098765", "11876543", "12143210", "11987654"
];

const FALLBACK_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
      <ellipse cx="60" cy="56" rx="38" ry="30" fill="#64748b" stroke="#cbd5e1" stroke-width="4"/>
      <circle cx="48" cy="50" r="5" fill="#fff"/><circle cx="72" cy="50" r="5" fill="#fff"/>
      <circle cx="49" cy="50" r="2.5" fill="#0f172a"/><circle cx="71" cy="50" r="2.5" fill="#0f172a"/>
      <path d="M52 64 Q60 70 68 64" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>`
  );

function getAxieImageUrl(id) {
  const clean = String(id || "").trim();
  if (!clean) return FALLBACK_SVG;
  return `https://axiecdn.axieinfinity.com/axies/${clean}/axie/axie-full-transparent.png`;
}

const state = {
  p1Name: "Jugador 1",
  p2Name: "Jugador 2",
  p1Axies: DEFAULT_P1_IDS.map((id) => ({ id, banned: false, banOrder: null })),
  p2Axies: DEFAULT_P2_IDS.map((id) => ({ id, banned: false, banOrder: null })),
  phase: "COIN_CALL", // COIN_CALL | COIN_DECIDE | BLIND_P1 | BLIND_P2 | SEQ_DRAFT | COMPLETED
  coinCaller: 1,
  coinWinner: null,
  coinRotation: 0,
  blindBanP1Target: null, // index in p2Axies
  blindBanP2Target: null, // index in p1Axies
  seqQueue: [], // array of actors (1 or 2) for 1 - 2 - 1
  seqStep: 0,
  selectedTargetSide: null, // 1 or 2 (whose axie is targeted)
  selectedTargetIndex: null,
  history: []
};

// Elementos DOM
const el = {
  arenaApp: document.getElementById("arena-app"),
  p1NameDisplay: document.getElementById("p1-name-display"),
  p2NameDisplay: document.getElementById("p2-name-display"),
  p1Hud: document.getElementById("p1-hud"),
  p2Hud: document.getElementById("p2-hud"),
  p1BanCount: document.getElementById("p1-ban-count"),
  p2BanCount: document.getElementById("p2-ban-count"),
  phaseText: document.getElementById("phase-text"),
  gridP1: document.getElementById("grid-p1"),
  gridP2: document.getElementById("grid-p2"),
  heroImgP1: document.getElementById("hero-img-p1"),
  heroImgP2: document.getElementById("hero-img-p2"),
  heroBanSealP1: document.getElementById("hero-ban-seal-p1"),
  heroBanSealP2: document.getElementById("hero-ban-seal-p2"),
  spotlightP1Label: document.getElementById("spotlight-p1-label"),
  spotlightP2Label: document.getElementById("spotlight-p2-label"),
  coinBox: document.getElementById("coin-box"),
  coin3d: document.getElementById("coin-3d"),
  coinCallerName: document.getElementById("coin-caller-name"),
  coinChoiceControls: document.getElementById("coin-choice-controls"),
  coinWinnerControls: document.getElementById("coin-winner-controls"),
  coinResultMsg: document.getElementById("coin-result-msg"),
  confirmBanBox: document.getElementById("confirm-ban-box"),
  targetPreviewText: document.getElementById("target-preview-text"),
  btnConfirmBan: document.getElementById("btn-confirm-ban"),
  btnMainPlay: document.getElementById("btn-main-play"),
  playBtnLabel: document.getElementById("play-btn-label"),
  playBtnSub: document.getElementById("play-btn-sub"),
  privacyCurtain: document.getElementById("privacy-curtain"),
  curtainTitle: document.getElementById("curtain-title"),
  curtainOpponent: document.getElementById("curtain-opponent"),
  curtainActor: document.getElementById("curtain-actor"),
  btnCurtainReady: document.getElementById("btn-curtain-ready"),
  btnUndo: document.getElementById("btn-undo"),
  btnReset: document.getElementById("btn-reset"),
  btnEditTeams: document.getElementById("btn-edit-teams"),
  bgUpload: document.getElementById("bg-upload"),
  teamsModal: document.getElementById("teams-modal"),
  btnCloseTeams: document.getElementById("btn-close-teams"),
  inputP1Name: document.getElementById("input-p1-name"),
  inputP2Name: document.getElementById("input-p2-name"),
  pasteP1: document.getElementById("paste-p1"),
  pasteP2: document.getElementById("paste-p2"),
  btnApplyPasteP1: document.getElementById("btn-apply-paste-p1"),
  btnApplyPasteP2: document.getElementById("btn-apply-paste-p2"),
  editorSlotsP1: document.getElementById("editor-slots-p1"),
  editorSlotsP2: document.getElementById("editor-slots-p2"),
  btnLoadSample: document.getElementById("btn-load-sample"),
  btnSaveTeams: document.getElementById("btn-save-teams"),
  summaryModal: document.getElementById("summary-modal"),
  btnCloseSummary: document.getElementById("btn-close-summary"),
  summaryP1Title: document.getElementById("summary-p1-title"),
  summaryP2Title: document.getElementById("summary-p2-title"),
  summaryP1Axies: document.getElementById("summary-p1-axies"),
  summaryP2Axies: document.getElementById("summary-p2-axies"),
  btnCopyP1: document.getElementById("btn-copy-p1"),
  btnCopyP2: document.getElementById("btn-copy-p2"),
  btnNewMatch: document.getElementById("btn-new-match")
};

function getPlayerName(num) {
  return num === 1 ? state.p1Name : state.p2Name;
}

function getCurrentActor() {
  if (state.phase === "BLIND_P1") return 1;
  if (state.phase === "BLIND_P2") return 2;
  if (state.phase === "SEQ_DRAFT") return state.seqQueue[state.seqStep] || null;
  return null;
}

function setHeroAxie(side, axieObj, forceBannedVisual = false) {
  const img = side === 1 ? el.heroImgP1 : el.heroImgP2;
  const seal = side === 1 ? el.heroBanSealP1 : el.heroBanSealP2;
  const label = side === 1 ? el.spotlightP1Label : el.spotlightP2Label;
  const playerName = getPlayerName(side).toUpperCase();

  if (!axieObj) return;
  img.src = getAxieImageUrl(axieObj.id);
  img.onerror = () => {
    img.src = FALLBACK_SVG;
  };
  label.textContent = `${playerName} • #${axieObj.id}`;

  const showBanned = axieObj.banned || forceBannedVisual;
  img.classList.toggle("banned-tint", showBanned);
  seal.classList.toggle("hidden", !showBanned);
}

function renderGrids() {
  const actor = getCurrentActor();
  const enemySide = actor === 1 ? 2 : actor === 2 ? 1 : null;

  [1, 2].forEach((side) => {
    const grid = side === 1 ? el.gridP1 : el.gridP2;
    const list = side === 1 ? state.p1Axies : state.p2Axies;
    grid.innerHTML = "";

    list.forEach((axie, idx) => {
      const slot = document.createElement("div");
      slot.className = "axie-slot";

      const isTargetable = enemySide === side && !axie.banned;
      const isSelected = state.selectedTargetSide === side && state.selectedTargetIndex === idx;

      if (axie.banned) {
        slot.classList.add("banned");
      } else if (state.phase === "COMPLETED") {
        slot.classList.add("survived-final");
      } else if (isTargetable) {
        slot.classList.add("targetable");
      } else {
        slot.classList.add("disabled-slot");
      }

      if (isSelected) {
        slot.classList.add("selected-target");
      }

      const img = document.createElement("img");
      img.src = getAxieImageUrl(axie.id);
      img.alt = `Axie ${axie.id}`;
      img.onerror = () => {
        img.src = FALLBACK_SVG;
      };

      const idTag = document.createElement("span");
      idTag.className = "slot-id-label";
      idTag.textContent = `#${axie.id}`;

      slot.appendChild(img);
      slot.appendChild(idTag);

      if (axie.banned) {
        const mark = document.createElement("div");
        mark.className = "slot-ban-mark";
        mark.innerHTML = `
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="38" fill="rgba(220,38,38,0.18)" stroke="#dc2626" stroke-width="10"/>
            <line x1="22" y1="78" x2="78" y2="22" stroke="#dc2626" stroke-width="10" stroke-linecap="round"/>
          </svg>
        `;
        slot.appendChild(mark);
      }

      slot.addEventListener("mouseenter", () => {
        if (!state.selectedTargetSide) {
          setHeroAxie(side, axie, false);
        }
      });

      slot.addEventListener("click", () => {
        setHeroAxie(side, axie, isTargetable);
        if (!isTargetable) return;

        state.selectedTargetSide = side;
        state.selectedTargetIndex = idx;
        el.targetPreviewText.textContent = `Objetivo marcado: #${axie.id} (${getPlayerName(side)})`;
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
  el.coinCallerName.textContent = getPlayerName(state.coinCaller);

  // Baneos realizados por cada jugador = Axies baneados del rival
  const p1BansDone = state.p2Axies.filter((a) => a.banned).length;
  const p2BansDone = state.p1Axies.filter((a) => a.banned).length;
  el.p1BanCount.textContent = p1BansDone;
  el.p2BanCount.textContent = p2BansDone;

  const actor = getCurrentActor();
  el.p1Hud.classList.toggle("active-turn", actor === 1);
  el.p2Hud.classList.toggle("active-turn", actor === 2);

  el.btnUndo.classList.toggle("hidden", state.history.length === 0 || state.phase !== "SEQ_DRAFT");

  // Panel central y botón PLAY
  el.coinBox.classList.toggle("hidden", state.phase !== "COIN_CALL" && state.phase !== "COIN_DECIDE");
  el.confirmBanBox.classList.toggle(
    "hidden",
    state.phase !== "BLIND_P1" && state.phase !== "BLIND_P2" && state.phase !== "SEQ_DRAFT"
  );

  el.btnMainPlay.classList.remove("ready-to-play");
  el.btnMainPlay.disabled = true;

  if (state.phase === "COIN_CALL") {
    el.phaseText.textContent = `Fase 1: ${getPlayerName(state.coinCaller)} elige Cara o Cruz para lanzar la moneda`;
    el.playBtnLabel.textContent = "MONEDA";
    el.playBtnSub.textContent = "Sorteo inicial";
  } else if (state.phase === "COIN_DECIDE") {
    el.phaseText.textContent = `¡${getPlayerName(state.coinWinner)} ganó la moneda! Elige orden de baneos`;
    el.playBtnLabel.textContent = "ORDEN";
    el.playBtnSub.textContent = "Elige ventaja";
  } else if (state.phase === "BLIND_P1") {
    el.phaseText.textContent = `Baneo Oculto 1/2: ${state.p1Name} elige 1 Axie secreto de ${state.p2Name}`;
    el.playBtnLabel.textContent = "OCULTO 1";
    el.playBtnSub.textContent = state.p1Name;
  } else if (state.phase === "BLIND_P2") {
    el.phaseText.textContent = `Baneo Oculto 2/2: ${state.p2Name} elige 1 Axie secreto de ${state.p1Name}`;
    el.playBtnLabel.textContent = "OCULTO 2";
    el.playBtnSub.textContent = state.p2Name;
  } else if (state.phase === "SEQ_DRAFT") {
    const stepNum = state.seqStep + 1;
    const totalSteps = state.seqQueue.length;
    const isLast = stepNum === totalSteps;
    el.phaseText.textContent = `Baneo Secuencial (${stepNum}/${totalSteps})${isLast ? " [ÚLTIMO BAN]" : ""}: Turno de ${getPlayerName(actor)}`;
    el.playBtnLabel.textContent = `BAN ${stepNum}/${totalSteps}`;
    el.playBtnSub.textContent = getPlayerName(actor);
  } else if (state.phase === "COMPLETED") {
    el.phaseText.textContent = "¡Draft completado! Equipos listos 6 vs 6 — Pulsa PLAY para ver resumen";
    el.playBtnLabel.textContent = "PLAY";
    el.playBtnSub.textContent = "Ver 6 vs 6";
    el.btnMainPlay.classList.add("ready-to-play");
    el.btnMainPlay.disabled = false;
  }
}

function clearSelection() {
  state.selectedTargetSide = null;
  state.selectedTargetIndex = null;
  el.targetPreviewText.textContent = "Selecciona un Axie enemigo abajo";
  el.btnConfirmBan.disabled = true;
}

function showPrivacyCurtain(actorNum) {
  const opponentNum = actorNum === 1 ? 2 : 1;
  el.curtainTitle.textContent = `Turno secreto de ${getPlayerName(actorNum)}`;
  el.curtainOpponent.textContent = getPlayerName(opponentNum);
  el.curtainActor.textContent = getPlayerName(actorNum);
  el.privacyCurtain.classList.remove("hidden");
}

// Eventos de Moneda
document.querySelectorAll("[data-call]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (state.phase !== "COIN_CALL") return;
    const calledSide = btn.getAttribute("data-call");
    const resultSide = Math.random() < 0.5 ? "CARA" : "CRUZ";

    const extraSpins = 1440; // 4 vueltas
    const targetAngle = resultSide === "CARA" ? 0 : 180;
    state.coinRotation += extraSpins + targetAngle;
    el.coin3d.style.transform = `rotateY(${state.coinRotation}deg)`;

    const callerWon = calledSide === resultSide;
    state.coinWinner = callerWon ? state.coinCaller : state.coinCaller === 1 ? 2 : 1;

    setTimeout(() => {
      state.phase = "COIN_DECIDE";
      el.coinChoiceControls.classList.add("hidden");
      el.coinWinnerControls.classList.remove("hidden");
      el.coinResultMsg.textContent = `Salió ${resultSide} — ¡Gana ${getPlayerName(state.coinWinner)}!`;
      updateHUD();
    }, 1650);
  });
});

function startBlindPhase(winnerTakesLastBanAdvantage) {
  const winner = state.coinWinner;
  const loser = winner === 1 ? 2 : 1;

  // En secuencia 1 - 2 - 1, el que inicia también ejecuta el 4º (último) baneo
  if (winnerTakesLastBanAdvantage) {
    state.seqQueue = [winner, loser, loser, winner];
  } else {
    state.seqQueue = [loser, winner, winner, loser];
  }
  state.seqStep = 0;
  state.phase = "BLIND_P1";
  clearSelection();
  updateHUD();
  renderGrids();
  showPrivacyCurtain(1);
}

el.btnTakeAdvantage.addEventListener("click", () => startBlindPhase(true));
el.btnGiveAdvantage.addEventListener("click", () => startBlindPhase(false));

el.btnCurtainReady.addEventListener("click", () => {
  el.privacyCurtain.classList.add("hidden");
});

// Confirmación de Baneo
el.btnConfirmBan.addEventListener("click", () => {
  if (state.selectedTargetSide === null || state.selectedTargetIndex === null) return;

  if (state.phase === "BLIND_P1") {
    state.blindBanP1Target = state.selectedTargetIndex;
    clearSelection();
    state.phase = "BLIND_P2";
    updateHUD();
    renderGrids();
    showPrivacyCurtain(2);
    return;
  }

  if (state.phase === "BLIND_P2") {
    state.blindBanP2Target = state.selectedTargetIndex;

    // Revelación simultánea de ambos baneos ocultos
    const axieP2 = state.p2Axies[state.blindBanP1Target];
    const axieP1 = state.p1Axies[state.blindBanP2Target];
    axieP2.banned = true;
    axieP2.banOrder = 1;
    axieP1.banned = true;
    axieP1.banOrder = 1;

    setHeroAxie(1, axieP1, true);
    setHeroAxie(2, axieP2, true);

    clearSelection();
    state.phase = "SEQ_DRAFT";
    updateHUD();
    renderGrids();
    return;
  }

  if (state.phase === "SEQ_DRAFT") {
    const targetList = state.selectedTargetSide === 1 ? state.p1Axies : state.p2Axies;
    const axie = targetList[state.selectedTargetIndex];
    axie.banned = true;
    axie.banOrder = state.seqStep + 2;

    state.history.push({
      side: state.selectedTargetSide,
      index: state.selectedTargetIndex,
      seqStep: state.seqStep
    });

    setHeroAxie(state.selectedTargetSide, axie, true);
    clearSelection();

    state.seqStep++;
    if (state.seqStep >= state.seqQueue.length) {
      state.phase = "COMPLETED";
    }
    updateHUD();
    renderGrids();
  }
});

// Deshacer baneo secuencial
el.btnUndo.addEventListener("click", () => {
  if (state.history.length === 0 || state.phase !== "SEQ_DRAFT") return;
  const last = state.history.pop();
  const list = last.side === 1 ? state.p1Axies : state.p2Axies;
  list[last.index].banned = false;
  list[last.index].banOrder = null;
  state.seqStep = last.seqStep;
  clearSelection();
  setHeroAxie(last.side, list[last.index], false);
  updateHUD();
  renderGrids();
});

// Edición directa de nombre en barra superior
function promptRenamePlayer(num) {
  const current = getPlayerName(num);
  const next = window.prompt(`Nombre para Jugador ${num} (deja vacío para usar "Jugador ${num}"):`, current);
  if (next === null) return;
  const trimmed = next.trim();
  if (num === 1) {
    state.p1Name = trimmed || "Jugador 1";
  } else {
    state.p2Name = trimmed || "Jugador 2";
  }
  updateHUD();
  setHeroAxie(1, state.p1Axies[0]);
  setHeroAxie(2, state.p2Axies[0]);
}

el.p1NameDisplay.addEventListener("click", () => promptRenamePlayer(1));
el.p2NameDisplay.addEventListener("click", () => promptRenamePlayer(2));

// Modal de Edición de 10 Axies por lado
function buildEditorSlots() {
  [1, 2].forEach((side) => {
    const container = side === 1 ? el.editorSlotsP1 : el.editorSlotsP2;
    const list = side === 1 ? state.p1Axies : state.p2Axies;
    container.innerHTML = "";

    list.forEach((axie, i) => {
      const row = document.createElement("div");
      row.className = "editor-slot-item";

      const img = document.createElement("img");
      img.src = getAxieImageUrl(axie.id);
      img.onerror = () => {
        img.src = FALLBACK_SVG;
      };

      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = axie.id;
      inp.placeholder = `Axie ${i + 1}`;
      inp.dataset.side = side;
      inp.dataset.index = i;

      inp.addEventListener("input", () => {
        const val = inp.value.replace(/\D/g, "");
        inp.value = val;
        img.src = getAxieImageUrl(val);
      });

      row.appendChild(img);
      row.appendChild(inp);
      container.appendChild(row);
    });
  });
}

function parsePastedIds(rawText) {
  return rawText
    .split(/[\s,;|	
]+/)
    .map((token) => token.replace(/\D/g, ""))
    .filter(Boolean)
    .slice(0, 10);
}

function applyPasteToEditor(side, rawText) {
  const ids = parsePastedIds(rawText);
  if (ids.length === 0) return;
  const container = side === 1 ? el.editorSlotsP1 : el.editorSlotsP2;
  const inputs = container.querySelectorAll("input");
  const imgs = container.querySelectorAll("img");

  ids.forEach((id, idx) => {
    if (inputs[idx]) {
      inputs[idx].value = id;
      imgs[idx].src = getAxieImageUrl(id);
    }
  });
}

el.btnApplyPasteP1.addEventListener("click", () => applyPasteToEditor(1, el.pasteP1.value));
el.btnApplyPasteP2.addEventListener("click", () => applyPasteToEditor(2, el.pasteP2.value));

el.btnEditTeams.addEventListener("click", () => {
  el.inputP1Name.value = state.p1Name === "Jugador 1" ? "" : state.p1Name;
  el.inputP2Name.value = state.p2Name === "Jugador 2" ? "" : state.p2Name;
  el.pasteP1.value = "";
  el.pasteP2.value = "";
  buildEditorSlots();
  el.teamsModal.classList.remove("hidden");
});

el.btnCloseTeams.addEventListener("click", () => el.teamsModal.classList.add("hidden"));

el.btnLoadSample.addEventListener("click", () => {
  applyPasteToEditor(1, DEFAULT_P1_IDS.join(" "));
  applyPasteToEditor(2, DEFAULT_P2_IDS.join(" "));
});

function resetMatchState() {
  state.p1Axies.forEach((a) => {
    a.banned = false;
    a.banOrder = null;
  });
  state.p2Axies.forEach((a) => {
    a.banned = false;
    a.banOrder = null;
  });
  state.phase = "COIN_CALL";
  state.coinWinner = null;
  state.blindBanP1Target = null;
  state.blindBanP2Target = null;
  state.seqQueue = [];
  state.seqStep = 0;
  state.history = [];
  clearSelection();

  el.coinChoiceControls.classList.remove("hidden");
  el.coinWinnerControls.classList.add("hidden");
  el.privacyCurtain.classList.add("hidden");
  el.summaryModal.classList.add("hidden");

  setHeroAxie(1, state.p1Axies[0], false);
  setHeroAxie(2, state.p2Axies[0], false);
  updateHUD();
  renderGrids();
}

el.btnSaveTeams.addEventListener("click", () => {
  const n1 = el.inputP1Name.value.trim();
  const n2 = el.inputP2Name.value.trim();
  state.p1Name = n1 || "Jugador 1";
  state.p2Name = n2 || "Jugador 2";

  const p1Inputs = el.editorSlotsP1.querySelectorAll("input");
  const p2Inputs = el.editorSlotsP2.querySelectorAll("input");

  state.p1Axies = Array.from(p1Inputs).map((inp, i) => ({
    id: inp.value.trim() || DEFAULT_P1_IDS[i],
    banned: false,
    banOrder: null
  }));

  state.p2Axies = Array.from(p2Inputs).map((inp, i) => ({
    id: inp.value.trim() || DEFAULT_P2_IDS[i],
    banned: false,
    banOrder: null
  }));

  el.teamsModal.classList.add("hidden");
  resetMatchState();
});

el.btnReset.addEventListener("click", resetMatchState);
el.btnNewMatch.addEventListener("click", resetMatchState);

// Resumen Final 6 vs 6 al pulsar PLAY
function openSummaryModal() {
  const activeP1 = state.p1Axies.filter((a) => !a.banned);
  const activeP2 = state.p2Axies.filter((a) => !a.banned);

  el.summaryP1Title.textContent = `${state.p1Name} (${activeP1.length} Habilitados)`;
  el.summaryP2Title.textContent = `${state.p2Name} (${activeP2.length} Habilitados)`;
  el.btnCopyP1.textContent = `📋 Copiar ${activeP1.length} IDs de ${state.p1Name}`;
  el.btnCopyP2.textContent = `📋 Copiar ${activeP2.length} IDs de ${state.p2Name}`;

  [
    { container: el.summaryP1Axies, list: activeP1 },
    { container: el.summaryP2Axies, list: activeP2 }
  ].forEach(({ container, list }) => {
    container.innerHTML = "";
    list.forEach((axie) => {
      const card = document.createElement("div");
      card.className = "summary-axie-card";
      card.innerHTML = `
        <img src="${getAxieImageUrl(axie.id)}" alt="Axie ${axie.id}" onerror="this.src='${FALLBACK_SVG}'" />
        <span>#${axie.id}</span>
      `;
      container.appendChild(card);
    });
  });

  el.summaryModal.classList.remove("hidden");
}

el.btnMainPlay.addEventListener("click", () => {
  if (state.phase === "COMPLETED") {
    openSummaryModal();
  }
});

el.btnCloseSummary.addEventListener("click", () => el.summaryModal.classList.add("hidden"));

function copyRemainingIds(side, btnEl) {
  const list = (side === 1 ? state.p1Axies : state.p2Axies).filter((a) => !a.banned);
  const text = list.map((a) => a.id).join("
");
  navigator.clipboard.writeText(text).then(() => {
    const prev = btnEl.textContent;
    btnEl.textContent = "✅ ¡IDs copiados al portapapeles!";
    setTimeout(() => {
      btnEl.textContent = prev;
    }, 1800);
  });
}

el.btnCopyP1.addEventListener("click", () => copyRemainingIds(1, el.btnCopyP1));
el.btnCopyP2.addEventListener("click", () => copyRemainingIds(2, el.btnCopyP2));

// Carga de fondo personalizado opcional
el.bgUpload.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target?.result;
    if (dataUrl) {
      el.arenaApp.style.backgroundImage = `radial-gradient(circle at 50% 45%, rgba(255,255,255,0.04) 0%, rgba(10,20,14,0.45) 100%), url('${dataUrl}')`;
    }
  };
  reader.readAsDataURL(file);
});

// Inicialización
setHeroAxie(1, state.p1Axies[0], false);
setHeroAxie(2, state.p2Axies[0], false);
updateHUD();
renderGrids();
