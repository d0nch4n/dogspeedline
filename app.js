/* Enciclopedia Canina — vanilla JS app
 * Layout: timeline orizzontale con cerchi (foto razza) ordinati per velocità.
 * Filtri "Tutti / Lento / Medio / Veloce", modal con dettaglio.
 */
(function () {
  "use strict";

  const breeds = (window.BREEDS || []).slice();

  // Pre-compute the speed bucket (1..10) for color & badge.
  const minSpeed = breeds.reduce((m, b) => Math.min(m, b.speed), Infinity);
  const maxSpeed = breeds.reduce((m, b) => Math.max(m, b.speed), -Infinity);
  function bucket(speed) {
    const span = maxSpeed - minSpeed || 1;
    const n = Math.floor(((speed - minSpeed) / span) * 10) + 1;
    return Math.max(1, Math.min(10, n));
  }
  breeds.forEach((b) => { b.bucket = bucket(b.speed); });

  // DOM refs.
  const $ = (sel) => document.querySelector(sel);
  const filterBar = $("#filter-bar");
  const titleEl = $("#section-title");
  const trackEl = $("#timeline-track");
  const dogsEl = $("#timeline-dogs");
  const ticksEl = $("#timeline-ticks");
  const overlay = $("#modal-overlay");
  const modalContent = $("#modal-content");
  const modalCloseBtn = $("#modal-close");
  const searchInput = $("#search-input");
  const searchClearBtn = $("#search-clear");

  let currentFilter = "all";
  let currentSearch = "";
  // ID dell'ultima razza aperta nella scheda; usato per tornare indietro
  // dalla "vista paese" alla scheda di partenza.
  let lastBreedId = null;

  // Helpers.
  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g,
    (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function applyFilter(list) {
    let result = list;
    if (currentFilter === "slow")        result = result.filter((d) => d.speed < 30);
    else if (currentFilter === "medium") result = result.filter((d) => d.speed >= 30 && d.speed < 50);
    else if (currentFilter === "fast")   result = result.filter((d) => d.speed >= 50);
    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      result = result.filter((d) =>
        (d.nameIt || "").toLowerCase().includes(q) ||
        (d.nameEn || "").toLowerCase().includes(q)
      );
    }
    return result;
  }

  // True when the viewport switches to the vertical mobile/tablet-portrait layout.
  const verticalQuery = window.matchMedia("(max-width: 900px)");
  const isVertical = () => verticalQuery.matches;

  // Render the timeline.
  // Strategy: each dog gets an equal slot along the speedline. Sorted slowest→fastest
  // so the gradient (green→red) reads as "accelerate". Slots alternate on the
  // two sides of the line so adjacent names don't collide.
  //   • Desktop: line is HORIZONTAL, cards alternate top/bottom, scroll is X.
  //   • Mobile/tablet portrait (≤900px): line is VERTICAL, cards alternate left/right,
  //     scroll is the natural document Y.
  function renderTimeline() {
    const filtered = applyFilter(breeds.slice()).sort(
      (a, b) => a.speed - b.speed || a.nameIt.localeCompare(b.nameIt, "it")
    );

    const noFilters = currentFilter === "all" && !currentSearch;
    titleEl.textContent = noFilters
      ? `${filtered.length} razze • dal più lento al più veloce — clicca un cane per scoprirlo! 👆`
      : `${filtered.length} ${filtered.length === 1 ? "razza trovata" : "razze trovate"} — clicca un cane per scoprirlo! 👆`;

    if (!filtered.length) {
      const msg = currentSearch
        ? `Nessuna razza trovata per “${escapeHtml(currentSearch)}”.`
        : "Nessuna razza in questa fascia.";
      dogsEl.innerHTML = `<p class="empty-msg">${msg}</p>`;
      ticksEl.innerHTML = "";
      trackEl.style.width = "";
      trackEl.style.height = "";
      return;
    }

    const vertical = isVertical();
    const varName = vertical ? "--row-h" : "--col-w";
    const fallback = vertical ? 110 : 120;
    const cssVar = getComputedStyle(document.documentElement).getPropertyValue(varName);
    const columnSize = parseFloat(cssVar) || fallback;
    const padding = vertical ? 40 : 48;
    const inner = filtered.length * columnSize;
    const total = inner + padding * 2;

    if (vertical) {
      trackEl.style.height = total + "px";
      trackEl.style.width = "";
    } else {
      trackEl.style.width = total + "px";
      trackEl.style.height = "";
    }

    // --- Cards ---
    const html = filtered.map((d, i) => {
      const pos = padding + i * columnSize + columnSize / 2;
      const row = vertical
        ? (i % 2 === 0 ? "row-left" : "row-right")
        : (i % 2 === 0 ? "row-top"  : "row-bottom");
      const positionStyle = vertical ? `top:${pos}px` : `left:${pos}px`;
      return `
        <div class="dog-slot ${row}" style="${positionStyle}"
             data-id="${d.id}" tabindex="0" role="button"
             aria-label="${escapeHtml(d.nameIt)}, ${d.speed} km per ora">
          <span class="connector"></span>
          <span class="dot dot-${d.bucket}"></span>
          <div class="dog-card card-${d.bucket}">
            <div class="dog-photo-wrap">
              <img src="${escapeHtml(d.photo)}" alt="${escapeHtml(d.nameIt)}" loading="lazy" decoding="async" />
            </div>
            <div class="dog-name">${escapeHtml(d.nameIt)}</div>
            <div class="dog-speed-badge speed-${d.bucket}">${d.speed} km/h</div>
          </div>
        </div>
      `;
    }).join("");
    dogsEl.innerHTML = html;

    // --- Ticks at the real proportional speed positions along the line. ---
    const sMin = filtered[0].speed;
    const sMax = filtered[filtered.length - 1].speed;
    const span = Math.max(1, sMax - sMin);
    const tickStep = vertical ? 20 : 10;     // meno tacche su mobile, restano leggibili
    const tickStart = Math.ceil(sMin / tickStep) * tickStep;
    const tickEnd   = Math.floor(sMax / tickStep) * tickStep;
    const tickStyle = (p) => vertical ? `top:${p}px` : `left:${p}px`;
    const ticksHtml = [];
    for (let s = tickStart; s <= tickEnd; s += tickStep) {
      const p = padding + ((s - sMin) / span) * inner;
      ticksHtml.push(`<div class="tick" style="${tickStyle(p)}"><span>${s} km/h</span></div>`);
    }
    // Su mobile (verticale) le card di estremità sono già ben visibili in cima/fondo,
    // quindi non aggiungiamo le tacche min/max — eviterebbero solo di sovrapporsi alle card.
    if (!vertical) {
      if (sMin !== tickStart) {
        ticksHtml.push(`<div class="tick" style="${tickStyle(padding)}"><span>${sMin} km/h</span></div>`);
      }
      if (sMax !== tickEnd) {
        ticksHtml.push(`<div class="tick" style="${tickStyle(padding + inner)}"><span>${sMax} km/h</span></div>`);
      }
    }
    ticksEl.innerHTML = ticksHtml.join("");
  }

  // Modal.
  function openModal(id) {
    const d = breeds.find((x) => x.id === id);
    if (!d) return;
    lastBreedId = d.id;
    const showOriginal = d.nameEn && d.nameEn !== d.nameIt;
    const flagBtn = d.origin
      ? `<button class="chip flag clickable" type="button" data-action="origin" data-origin="${escapeHtml(d.origin)}" title="Vedi altri cani da ${escapeHtml(d.origin)}">
           <span class="flag">${escapeHtml(d.originFlag || "")}</span> ${escapeHtml(d.origin)}
           <span class="chevron" aria-hidden="true">›</span>
         </button>`
      : `<span class="chip flag"><span class="flag">${escapeHtml(d.originFlag || "")}</span> ${escapeHtml(d.origin || "—")}</span>`;
    modalContent.innerHTML = `
      <div class="modal-hero">
        <img src="${escapeHtml(d.photo)}" alt="${escapeHtml(d.nameIt)}" />
      </div>
      <div class="modal-body">
        <h2 id="modal-title">${escapeHtml(d.nameIt)}</h2>
        ${showOriginal ? `<p class="modal-original">Nome originale: <strong>${escapeHtml(d.nameEn)}</strong></p>` : ""}

        <div class="modal-meta">
          <span class="chip speed">⚡ ${d.speed} km/h</span>
          ${flagBtn}
          <span class="chip">📏 ${escapeHtml(d.size || "—")}</span>
          <span class="chip">⏳ ${escapeHtml(d.lifespan || "—")}</span>
        </div>

        <p class="modal-description">${escapeHtml(d.description || "")}</p>

        <ul class="modal-traits">
          ${(d.traits || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("")}
        </ul>

        ${d.funFact ? `<div class="fun-fact"><strong>Lo sapevi?</strong> ${escapeHtml(d.funFact)}</div>` : ""}

        <div class="modal-grid">
          <div class="cell"><div class="lbl">Velocità</div><div class="val">${d.speed} km/h</div></div>
          <div class="cell"><div class="lbl">Origine</div><div class="val">${escapeHtml(d.originFlag || "")} ${escapeHtml(d.origin || "")}</div></div>
          <div class="cell"><div class="lbl">Taglia</div><div class="val">${escapeHtml(d.size || "—")}</div></div>
          <div class="cell"><div class="lbl">Aspettativa di vita</div><div class="val">${escapeHtml(d.lifespan || "—")}</div></div>
        </div>
      </div>
    `;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    modalCloseBtn.focus();
    location.hash = `#/breed/${d.id}`;
  }

  // Vista "tutti i cani di una stessa nazione" — aperta cliccando il chip bandiera.
  function openCountryView(originName) {
    const list = breeds
      .filter((b) => b.origin === originName)
      .sort((a, b) => a.speed - b.speed);
    if (!list.length) return;
    const flag = list[0].originFlag || "";
    const backLabel = lastBreedId
      ? `← Torna a ${escapeHtml(breeds.find((b) => b.id === lastBreedId)?.nameIt || "")}`
      : "← Indietro";
    modalContent.innerHTML = `
      <div class="modal-body country-view">
        <button class="back-btn" id="modal-back" type="button">${backLabel}</button>
        <h2 id="modal-title">Cani originari di ${escapeHtml(originName)} <span class="country-flag">${escapeHtml(flag)}</span></h2>
        <p class="modal-original">${list.length} ${list.length === 1 ? "razza" : "razze"} — clicca per i dettagli</p>
        <div class="country-grid">
          ${list.map((b) => `
            <button class="country-card card-${b.bucket}" data-id="${b.id}" type="button"
                    aria-label="${escapeHtml(b.nameIt)}, ${b.speed} km/h">
              <div class="country-card-photo">
                <img src="${escapeHtml(b.photo)}" alt="${escapeHtml(b.nameIt)}" loading="lazy" decoding="async" />
              </div>
              <div class="country-card-name">${escapeHtml(b.nameIt)}</div>
              <span class="country-card-badge speed-${b.bucket}">${b.speed} km/h</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    modalCloseBtn.focus();
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.style.overflow = "";
    if (location.hash.startsWith("#/breed/")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  // Wiring.
  filterBar.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-filter]");
    if (!btn) return;
    currentFilter = btn.dataset.filter;
    filterBar.querySelectorAll(".filter-btn").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    renderTimeline();
  });

  dogsEl.addEventListener("click", (e) => {
    const slot = e.target.closest(".dog-slot");
    if (!slot) return;
    openModal(parseInt(slot.dataset.id, 10));
  });
  dogsEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const slot = e.target.closest(".dog-slot");
    if (!slot) return;
    e.preventDefault();
    openModal(parseInt(slot.dataset.id, 10));
  });

  modalCloseBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) closeModal();
  });

  // Delegation: chip bandiera → vista paese; card della vista paese → scheda razza;
  // bottone "indietro" della vista paese → torna alla scheda da cui sei venuto.
  modalContent.addEventListener("click", (e) => {
    const flagBtn = e.target.closest('[data-action="origin"]');
    if (flagBtn) {
      openCountryView(flagBtn.dataset.origin);
      return;
    }
    const countryCard = e.target.closest(".country-card[data-id]");
    if (countryCard) {
      openModal(parseInt(countryCard.dataset.id, 10));
      return;
    }
    const backBtn = e.target.closest("#modal-back");
    if (backBtn) {
      if (lastBreedId) openModal(lastBreedId);
      else closeModal();
    }
  });

  // Search: filtra in tempo reale (debounce per non rifare il render ad ogni tasto).
  let searchTimer;
  searchInput.addEventListener("input", (e) => {
    currentSearch = e.target.value.trim();
    searchClearBtn.hidden = currentSearch.length === 0;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderTimeline, 120);
  });
  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    currentSearch = "";
    searchClearBtn.hidden = true;
    renderTimeline();
    searchInput.focus();
  });

  window.addEventListener("hashchange", () => {
    const m = (location.hash || "").match(/^#\/breed\/(\d+)$/);
    if (m) openModal(parseInt(m[1], 10));
    else if (!overlay.hidden) closeModal();
  });

  // Re-render on resize (debounced) so layout follows viewport breakpoints,
  // e.g. when the tablet is rotated between portrait and landscape.
  // IMPORTANTE: ri-renderiamo solo se cambia la LARGHEZZA. Su mobile la barra URL
  // del browser appare/scompare durante lo scroll generando resize events di sola
  // altezza: rigenerare il DOM in quei casi farebbe lampeggiare tutte le foto.
  let lastWidth = window.innerWidth;
  let resizeTimer;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderTimeline, 200);
  });

  // Boot.
  if (!breeds.length) {
    dogsEl.innerHTML = `<p class="empty-msg">Nessun dato caricato. Controlla che <code>data.js</code> sia raggiungibile.</p>`;
    titleEl.textContent = "";
    return;
  }
  renderTimeline();
  const m = (location.hash || "").match(/^#\/breed\/(\d+)$/);
  if (m) openModal(parseInt(m[1], 10));
})();
