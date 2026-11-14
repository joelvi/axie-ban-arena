const FALLBACK_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100"><ellipse cx="60" cy="56" rx="38" ry="30" fill="#64748b" stroke="#cbd5e1" stroke-width="4"/><circle cx="48" cy="50" r="5" fill="#fff"/><circle cx="72" cy="50" r="5" fill="#fff"/></svg>`);
const $ = (id) => document.getElementById(id);
const axieUrl = (id) => (String(id || "").trim() ? `https://axiecdn.axieinfinity.com/axies/${String(id).trim()}/axie/axie-full-transparent.png` : FALLBACK_SVG);
const makeImg = (id, alt = "") => {
  const img = document.createElement("img");
  img.src = axieUrl(id); img.alt = alt;
  img.onerror = () => { img.onerror = null; img.src = FALLBACK_SVG; };
  return img;
};
const parseIds = (raw) => raw.split(/[\s,;|]+/).map((t) => t.replace(/\D/g, "")).filter(Boolean).slice(0, 10);
const other = (n) => (n === 1 ? 2 : 1);
const uid = localStorage.axieUid || (localStorage.axieUid = Math.random().toString(36).slice(2) + Date.now().toString(36));

async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const randHex = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, "0")).join("");

// ---------- Estado ----------
// phase: LOBBY | COIN_CALL | COIN_FLIP | COIN_DECIDE | BLIND | SEQ_DRAFT | COMPLETED
const state = {
  p1Name: "Jugador 1", p2Name: "Jugador 2", p1Axies: [], p2Axies: [],
  phase: "LOBBY", coinCaller: 1, coinResult: null, coinWinner: null, coinNonce: 0,
  seqQueue: [], seqStep: 0, history: [], selSide: null, selIndex: null
};
const KEYS = ["p1Name","p2Name","p1Axies","p2Axies","phase","coinCaller","coinResult","coinWinner","coinNonce","seqQueue","seqStep","history"];
let db, room = null, code = null, myRole = 0, seats = {}, blind = {}, reveal = {};
let hasGame = false, lastNonce = 0, lastHist = 0, rot = 0;

const nameOf = (n) => (n === 1 ? state.p1Name : state.p2Name);
const teamOf = (n) => (n === 1 ? state.p1Axies : state.p2Axies);
const pushGame = () => { const g = {}; KEYS.forEach((k) => (g[k] = state[k])); return room.child("game").set(g); };
const pickKey = () => `axiePick_${code}_${myRole}`;

// Quién puede actuar en ESTE dispositivo
function activeActor() {
  if (state.phase === "BLIND") return myRole && !blind[myRole] ? myRole : null;
  if (state.phase === "SEQ_DRAFT") return state.seqQueue[state.seqStep] === myRole ? myRole : null;
  return null;
}

// ---------- Escenario ----------
function setHero(side, axie, banned = false) {
  if (!axie) return;
  const img = $(`hero-img-p${side}`);
  img.onerror = () => { img.onerror = null; img.src = FALLBACK_SVG; };
  img.src = axieUrl(axie.id);
  $(`spotlight-p${side}-label`).textContent = `${nameOf(side).toUpperCase()} • #${axie.id}`;
  const show = axie.banned || banned;
  img.classList.toggle("banned-tint", show);
  $(`hero-ban-seal-p${side}`).classList.toggle("hidden", !show);
}

function clearSelection() {
  state.selSide = state.selIndex = null;
  $("target-preview-text").textContent = "Selecciona un Axie enemigo abajo";
  $("btn-confirm-ban").disabled = true;
}

function renderGrids() {
  const act = activeActor(), enemy = act ? other(act) : null;
  [1, 2].forEach((side) => {
    const grid = $(`grid-p${side}`);
    grid.innerHTML = "";
    teamOf(side).forEach((axie, idx) => {
      const slot = document.createElement("div");
      slot.className = "axie-slot";
      const targetable = enemy === side && !axie.banned;
      slot.classList.add(axie.banned ? "banned" : state.phase === "COMPLETED" ? "survived-final" : targetable ? "targetable" : "disabled-slot");
      if (state.selSide === side && state.selIndex === idx) slot.classList.add("selected-target");
      const tag = document.createElement("span");
      tag.className = "slot-id-label"; tag.textContent = `#${axie.id}`;
      slot.append(makeImg(axie.id, `Axie ${axie.id}`), tag);
      if (axie.banned) {
        const m = document.createElement("div");
        m.className = "slot-ban-mark";
        m.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="rgba(220,38,38,.18)" stroke="#dc2626" stroke-width="10"/><line x1="22" y1="78" x2="78" y2="22" stroke="#dc2626" stroke-width="10" stroke-linecap="round"/></svg>`;
        slot.appendChild(m);
      }
      slot.addEventListener("mouseenter", () => { if (state.selSide === null) setHero(side, axie); });
      slot.addEventListener("click", () => {
        // El sello solo se ve en baneos visibles; en el oculto delataría la elección (y a los espectadores)
        setHero(side, axie, false);
        if (!targetable) return;
        state.selSide = side; state.selIndex = idx;
        $("target-preview-text").textContent = `Objetivo marcado: #${axie.id} (${nameOf(side)})`;
        $("btn-confirm-ban").disabled = false;
        renderGrids();
      });
      grid.appendChild(slot);
    });
  });
}

function phaseInfo() {
  const p = state.phase, n = nameOf;
  if (p === "COIN_CALL") return [`${n(state.coinCaller)} elige Cara o Cruz`, "MONEDA", "Sorteo inicial"];
  if (p === "COIN_FLIP") return ["Lanzando la moneda…", "MONEDA", "Girando"];
  if (p === "COIN_DECIDE") return [`¡${n(state.coinWinner)} ganó la moneda! Decide quién tiene el último baneo`, "ORDEN", "Elige ventaja"];
  if (p === "BLIND") {
    const c = (blind[1] ? 1 : 0) + (blind[2] ? 1 : 0);
    const msg = !myRole ? "Baneo oculto en curso" : blind[myRole] ? "Tu baneo está enviado. Esperando al rival" : "Elige 1 Axie del rival; nadie lo verá hasta que ambos confirmen";
    return [`${msg} (${c}/2 listos)`, "OCULTO", `${c}/2 listos`];
  }
  if (p === "SEQ_DRAFT") {
    const a = state.seqQueue[state.seqStep], t = state.seqQueue.length, k = state.seqStep + 1;
    return [`Baneo secuencial (${k}/${t})${k === t ? " [ÚLTIMO BAN]" : ""}: turno de ${n(a)}`, `BAN ${k}/${t}`, n(a)];
  }
  return ["¡Draft completado! Quedan 7 vs 7. Pulsa PLAY para ver el resumen", "PLAY", "Ver 7 vs 7"];
}

function updateHUD() {
  const p = state.phase;
  $("p1-name-display").textContent = state.p1Name;
  $("p2-name-display").textContent = state.p2Name;
  $("coin-caller-name").textContent = nameOf(state.coinCaller);
  $("p1-ban-count").textContent = state.p2Axies.filter((a) => a.banned).length;
  $("p2-ban-count").textContent = state.p1Axies.filter((a) => a.banned).length;
  document.querySelector(".hud-left-tag").textContent = `${myRole ? "JUGADOR " + myRole : "ESPECTADOR"} • SALA ${code || "—"}`;

  const turn = p === "SEQ_DRAFT" ? state.seqQueue[state.seqStep] : null;
  $("p1-hud").classList.toggle("active-turn", turn === 1);
  $("p2-hud").classList.toggle("active-turn", turn === 2);

  const last = state.history[state.history.length - 1];
  $("btn-undo").classList.toggle("hidden", !(last && myRole === other(last.side) && (p === "SEQ_DRAFT" || p === "COMPLETED")));
  $("btn-reset").classList.toggle("hidden", !myRole);
  $("btn-new-match").classList.toggle("hidden", !myRole);

  const inCoin = ["COIN_CALL", "COIN_FLIP", "COIN_DECIDE"].includes(p);
  $("coin-box").classList.toggle("hidden", !inCoin);
  $("coin-choice-controls").classList.toggle("hidden", p !== "COIN_CALL");
  $("coin-winner-controls").classList.toggle("hidden", p !== "COIN_DECIDE");
  $("coin-choice-controls").querySelectorAll("button").forEach((b) => (b.disabled = myRole !== state.coinCaller));
  $("coin-winner-controls").querySelectorAll("button").forEach((b) => (b.disabled = myRole !== state.coinWinner));
  if (state.coinResult) $("coin-result-msg").textContent = `Salió ${state.coinResult} — ¡Gana ${nameOf(state.coinWinner)}!`;
  $("confirm-ban-box").classList.toggle("hidden", !activeActor());

  const [text, label, sub] = phaseInfo();
  $("phase-text").textContent = text;
  $("play-btn-label").textContent = label;
  $("play-btn-sub").textContent = sub;
  const done = p === "COMPLETED";
  $("btn-main-play").classList.toggle("ready-to-play", done);
  $("btn-main-play").disabled = !done;
  if (!done) $("summary-modal").classList.add("hidden");
}
const refresh = () => { updateHUD(); renderGrids(); };

// ---------- Moneda ----------
function animateCoin() {
  const base = Math.ceil(rot / 360) * 360;
  rot = base + 1440 + (state.coinResult === "CARA" ? 0 : 180);
  $("coin-3d").style.transform = `rotateY(${rot}deg)`;
  setTimeout(() => {
    if (myRole === state.coinCaller && state.phase === "COIN_FLIP") { state.phase = "COIN_DECIDE"; pushGame(); }
  }, 1650);
}

document.querySelectorAll("[data-call]").forEach((btn) => btn.addEventListener("click", () => {
  if (state.phase !== "COIN_CALL" || myRole !== state.coinCaller) return;
  const result = Math.random() < 0.5 ? "CARA" : "CRUZ";
  Object.assign(state, {
    phase: "COIN_FLIP", coinResult: result, coinNonce: Date.now(),
    coinWinner: btn.dataset.call === result ? state.coinCaller : other(state.coinCaller)
  });
  pushGame();
}));

// Oculto: 1 c/u. Secuencial 1-2-1 (4 turnos): 2 baneos c/u. Total 3 c/u → quedan 7.
function chooseAdvantage(takesLast) {
  if (state.phase !== "COIN_DECIDE" || myRole !== state.coinWinner) return;
  const first = takesLast ? state.coinWinner : other(state.coinWinner), second = other(first);
  Object.assign(state, { seqQueue: [first, second, second, first], seqStep: 0, phase: "BLIND" });
  pushGame();
}
$("btn-take-advantage").addEventListener("click", () => chooseAdvantage(true));
$("btn-give-advantage").addEventListener("click", () => chooseAdvantage(false));

// ---------- Baneos ----------
$("btn-confirm-ban").addEventListener("click", async () => {
  if (state.selSide === null || !activeActor()) return;
  if (state.phase === "BLIND") {
    const index = state.selIndex, salt = randHex();
    sessionStorage[pickKey()] = JSON.stringify({ index, salt });
    clearSelection();
    setHero(1, state.p1Axies[0]); setHero(2, state.p2Axies[0]);
    // Compromiso: solo se publica el hash; el índice real se revela cuando ambos han confirmado
    await room.child("blind/" + myRole).set({ commit: await sha(`${index}:${salt}`) });
    return;
  }
  const axie = teamOf(state.selSide)[state.selIndex];
  axie.banned = true;
  state.history.push({ side: state.selSide, index: state.selIndex, seqStep: state.seqStep });
  clearSelection();
  state.seqStep++;
  if (state.seqStep >= state.seqQueue.length) state.phase = "COMPLETED";
  pushGame();
});

async function onBlind() {
  updateHUD(); renderGrids();
  if (state.phase !== "BLIND" || !myRole) return;
  const raw = sessionStorage[pickKey()];
  if (blind[1] && blind[2] && raw && !reveal[myRole]) room.child("reveal/" + myRole).set(JSON.parse(raw));
  if (!(reveal[1] && reveal[2])) return;
  for (const n of [1, 2]) {
    if ((await sha(`${reveal[n].index}:${reveal[n].salt}`)) !== blind[n].commit) {
      alert("Un baneo oculto no coincide con su compromiso."); return;
    }
  }
  room.child("game").transaction((g) => {
    if (!g || g.phase !== "BLIND") return g;
    g.p2Axies[reveal[1].index].banned = true; // J1 baneó a J2
    g.p1Axies[reveal[2].index].banned = true; // J2 baneó a J1
    g.phase = "SEQ_DRAFT"; g.seqStep = 0;
    return g;
  });
}

$("btn-undo").addEventListener("click", () => {
  const last = state.history[state.history.length - 1];
  if (!last || myRole !== other(last.side)) return;
  state.history.pop();
  teamOf(last.side)[last.index].banned = false;
  Object.assign(state, { seqStep: last.seqStep, phase: "SEQ_DRAFT" });
  clearSelection();
  pushGame();
});

async function resetMatch() {
  if (!myRole || !window.confirm("¿Reiniciar la partida para ambos jugadores?")) return;
  await Promise.all([room.child("blind").remove(), room.child("reveal").remove()]);
  [...state.p1Axies, ...state.p2Axies].forEach((a) => (a.banned = false));
  Object.assign(state, { phase: "COIN_CALL", coinResult: null, coinWinner: null, seqQueue: [], seqStep: 0, history: [] });
  clearSelection();
  pushGame();
}
$("btn-reset").addEventListener("click", resetMatch);
$("btn-new-match").addEventListener("click", resetMatch);

// ---------- Resumen ----------
$("btn-main-play").addEventListener("click", () => {
  if (state.phase !== "COMPLETED") return;
  const lists = [1, 2].map((s) => teamOf(s).filter((a) => !a.banned));
  [1, 2].forEach((s) => {
    $(`summary-p${s}-title`).textContent = `${nameOf(s)} (${lists[s - 1].length} Habilitados)`;
    $(`btn-copy-p${s}`).textContent = `📋 Copiar ${lists[s - 1].length} IDs de ${nameOf(s)}`;
    const box = $(`summary-p${s}-axies`);
    box.innerHTML = "";
    lists[s - 1].forEach((axie) => {
      const card = document.createElement("div");
      card.className = "summary-axie-card";
      const l = document.createElement("span"); l.textContent = `#${axie.id}`;
      card.append(makeImg(axie.id, `Axie ${axie.id}`), l);
      box.appendChild(card);
    });
  });
  $("summary-modal").classList.remove("hidden");
});
$("btn-close-summary").addEventListener("click", () => $("summary-modal").classList.add("hidden"));

function copyIds(side, btn) {
  const text = teamOf(side).filter((a) => !a.banned).map((a) => a.id).join("\n");
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
    .then(() => { const prev = btn.textContent; btn.textContent = "✅ ¡IDs copiados!"; setTimeout(() => (btn.textContent = prev), 1800); })
    .catch(() => window.prompt("Copia manualmente los IDs:", text));
}
$("btn-copy-p1").addEventListener("click", () => copyIds(1, $("btn-copy-p1")));
$("btn-copy-p2").addEventListener("click", () => copyIds(2, $("btn-copy-p2")));

$("bg-upload").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = (ev) => { $("arena-app").style.backgroundImage = `linear-gradient(rgba(10,20,14,.25),rgba(10,20,14,.45)),url("${ev.target.result}")`; };
  r.readAsDataURL(f);
});

// ---------- Sala en vivo ----------
function applyGame(g) {
  const prev = state.phase;
  Object.assign(state, g, { seqQueue: g.seqQueue || [], history: g.history || [], coinResult: g.coinResult || null, coinWinner: g.coinWinner || null });
  if (state.phase === "COIN_CALL" && prev !== "COIN_CALL") { setHero(1, state.p1Axies[0]); setHero(2, state.p2Axies[0]); clearSelection(); }
  if (prev === "BLIND" && state.phase === "SEQ_DRAFT") [1, 2].forEach((s) => setHero(s, teamOf(s).find((a) => a.banned), true));
  if (state.history.length > lastHist) {
    const h = state.history[state.history.length - 1];
    setHero(h.side, teamOf(h.side)[h.index], true);
  }
  lastHist = state.history.length;
  if (state.phase === "COIN_FLIP" && state.coinNonce !== lastNonce) { lastNonce = state.coinNonce; animateCoin(); }
}

let idsTimer;
function renderLobby() {
  $("lobby").classList.toggle("hidden", hasGame);
  $("lobby-home").classList.toggle("hidden", !!room);
  $("lobby-room").classList.toggle("hidden", !room);
  if (!room) return;
  $("room-code-label").textContent = code;
  const box = $("seats");
  box.innerHTML = "";
  [1, 2].forEach((n) => {
    const s = seats[n], card = document.createElement("div");
    card.className = "seat-card" + (myRole === n ? " me" : "");
    const t = document.createElement("h4");
    t.textContent = s ? `Jugador ${n}: ${s.name}${s.ready ? " ✅ listo" : " (preparando…)"}` : `Jugador ${n}: libre`;
    card.appendChild(t);
    if (!s && !myRole) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "action-pill gold"; b.textContent = `Ser Jugador ${n}`;
      b.onclick = () => room.child("seats/" + n).transaction((c) => (c ? undefined : { uid, name: $("lobby-name").value.trim() || `Jugador ${n}`, ready: false }));
      card.appendChild(b);
    }
    if (s && s.ids) {
      const th = document.createElement("div"); th.className = "thumbs";
      s.ids.forEach((id) => th.appendChild(makeImg(id, `Axie ${id}`)));
      card.appendChild(th);
    }
    box.appendChild(card);
  });
  const mine = myRole && seats[myRole];
  $("setup-box").classList.toggle("hidden", !mine);
  if (mine) {
    const ta = $("ids-input");
    if (!ta.value && mine.ids) ta.value = mine.ids.join(" ");
    $("btn-ready").textContent = mine.ready ? "Cancelar listo" : "Listo";
  }
  // Cuando ambos están listos, un jugador crea la partida (la transacción evita duplicados)
  if (myRole && seats[1] && seats[2] && seats[1].ready && seats[2].ready && seats[1].ids && seats[2].ids && !hasGame) {
    room.child("game").transaction((g) => g || {
      p1Name: seats[1].name, p2Name: seats[2].name,
      p1Axies: seats[1].ids.map((id) => ({ id, banned: false })),
      p2Axies: seats[2].ids.map((id) => ({ id, banned: false })),
      phase: "COIN_CALL", coinCaller: 1, coinNonce: 0, seqStep: 0
    });
  }
}

$("ids-input").addEventListener("input", () => {
  const ids = parseIds($("ids-input").value);
  const pv = $("ids-preview");
  pv.innerHTML = "";
  ids.forEach((id) => pv.appendChild(makeImg(id)));
  clearTimeout(idsTimer);
  // Se publica mientras escribe para que los espectadores vean la selección
  idsTimer = setTimeout(() => room && myRole && room.child("seats/" + myRole).update({ ids, ready: false }), 400);
});
$("btn-ready").addEventListener("click", () => {
  const s = seats[myRole], ids = parseIds($("ids-input").value);
  if (!s) return;
  if (!s.ready && (ids.length !== 10 || new Set(ids).size !== 10)) { alert("Ingresa 10 IDs distintos."); return; }
  room.child("seats/" + myRole).update({ ids, ready: !s.ready });
});

function joinRoom(c) {
  code = c.toUpperCase();
  room = db.ref("rooms/" + code);
  sessionStorage.axieRoom = code;
  history.replaceState(null, "", "?sala=" + code);
  room.child("seats").on("value", (s) => {
    seats = s.val() || {};
    myRole = [1, 2].find((n) => seats[n] && seats[n].uid === uid) || 0;
    renderLobby(); refresh();
  });
  room.child("blind").on("value", (s) => { blind = s.val() || {}; onBlind(); });
  room.child("reveal").on("value", (s) => { reveal = s.val() || {}; onBlind(); });
  room.child("game").on("value", (s) => {
    const g = s.val();
    hasGame = !!g;
    if (g) applyGame(g);
    renderLobby(); refresh();
  });
}

$("btn-create-room").addEventListener("click", () => {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  joinRoom(Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join(""));
});
$("btn-join-room").addEventListener("click", () => {
  const c = $("room-code-input").value.trim();
  if (c.length >= 4) joinRoom(c);
});
$("btn-copy-link").addEventListener("click", () => {
  const url = `${location.origin}${location.pathname}?sala=${code}`;
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).catch(() => window.prompt("Enlace de la sala:", url));
});

// ---------- Inicio ----------
try {
  if (typeof FIREBASE_CONFIG === "undefined" || FIREBASE_CONFIG.apiKey.startsWith("TU_")) throw new Error("config");
  firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.database();
  const saved = new URLSearchParams(location.search).get("sala") || sessionStorage.axieRoom;
  if (saved) joinRoom(saved);
} catch (e) {
  const err = $("lobby-error");
  err.textContent = "Falta configurar Firebase: edita firebase-config.js con los datos de tu proyecto.";
  err.classList.remove("hidden");
  $("btn-create-room").disabled = $("btn-join-room").disabled = true;
}
refresh();
