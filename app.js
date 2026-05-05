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

  let currentFilter = "all";

  // Helpers.
  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g,
    (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function applyFilter(list) {
    if (currentFilter === "slow")   return list.filter((d) => d.speed < 30);
    if (currentFilter === "medium") return list.filter((d) => d.speed >= 30 && d.speed < 50);
    if (currentFilter === "fast")   return list.filter((d) => d.speed >= 50);
    return list;
  }

  // Render the timeline.
  // Strategy: use a flex-like layout where every dog is given an equal slot
  // along the timeline. The dogs are sorted slowest → fastest, so the
  // gradient line (green → red) behind them visually communicates "speed up".
  // We alternate Y position (above / below the line) so adjacent names don't
  // collide and the layout stays compact.
  function renderTimeline() {
    const filtered = applyFilter(breeds.slice()).sort(
      (a, b) => a.speed - b.speed || a.nameIt.localeCompare(b.nameIt, "it")
    );

    titleEl.textContent = currentFilter === "all"
      ? `${filtered.length} razze • dal più lento al più veloce — clicca un cane per scoprirlo! 👆`
      : `${filtered.length} razze trovate — clicca un cane per scoprirlo! 👆`;

    if (!filtered.length) {
      dogsEl.innerHTML = `<p class="empty-msg">Nessuna razza in questa fascia.</p>`;
      ticksEl.innerHTML = "";
      trackEl.style.width = "auto";
      return;
    }

    // Layout: each card occupies a fixed column.
    // Column width is driven by CSS (--col-w) so it adapts to viewport size.
    const cssVar = getComputedStyle(document.documentElement).getPropertyValue("--col-w");
    const columnW = parseFloat(cssVar) || 120;
    const padding = 48;
    const innerW = filtered.length * columnW;
    const totalW = innerW + padding * 2;
    trackEl.style.width = totalW + "px";

    // --- Cards ---
    const html = filtered.map((d, i) => {
      const x = padding + i * columnW + columnW / 2;
      const row = i % 2 === 0 ? "row-top" : "row-bottom";
      return `
        <div class="dog-slot ${row}" style="left:${x}px"
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

    // --- Ticks: place a small tick at the actual proportional speed
    //     position so the timeline still encodes "real" speed under the line. ---
    const sMin = filtered[0].speed;
    const sMax = filtered[filtered.length - 1].speed;
    const span = Math.max(1, sMax - sMin);
    const tickStart = Math.ceil(sMin / 10) * 10;
    const tickEnd = Math.floor(sMax / 10) * 10;
    const ticksHtml = [];
    for (let s = tickStart; s <= tickEnd; s += 10) {
      const x = padding + ((s - sMin) / span) * innerW;
      ticksHtml.push(`<div class="tick" style="left:${x}px"><span>${s} km/h</span></div>`);
    }
    // Always show the min and max as well.
    if (sMin !== tickStart) {
      ticksHtml.push(`<div class="tick" style="left:${padding}px"><span>${sMin} km/h</span></div>`);
    }
    if (sMax !== tickEnd) {
      ticksHtml.push(`<div class="tick" style="left:${padding + innerW}px"><span>${sMax} km/h</span></div>`);
    }
    ticksEl.innerHTML = ticksHtml.join("");
  }

  // Modal.
  function openModal(id) {
    const d = breeds.find((x) => x.id === id);
    if (!d) return;
    const showOriginal = d.nameEn && d.nameEn !== d.nameIt;
    modalContent.innerHTML = `
      <div class="modal-hero">
        <img src="${escapeHtml(d.photo)}" alt="${escapeHtml(d.nameIt)}" />
      </div>
      <div class="modal-body">
        <h2 id="modal-title">${escapeHtml(d.nameIt)}</h2>
        ${showOriginal ? `<p class="modal-original">Nome originale: <strong>${escapeHtml(d.nameEn)}</strong></p>` : ""}

        <div class="modal-meta">
          <span class="chip speed">⚡ ${d.speed} km/h</span>
          <span class="chip flag"><span class="flag">${escapeHtml(d.originFlag || "")}</span> ${escapeHtml(d.origin || "")}</span>
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

  window.addEventListener("hashchange", () => {
    const m = (location.hash || "").match(/^#\/breed\/(\d+)$/);
    if (m) openModal(parseInt(m[1], 10));
    else if (!overlay.hidden) closeModal();
  });

  // Re-render on resize (debounced) so layout follows viewport breakpoints,
  // e.g. when the tablet is rotated between portrait and landscape.
  let resizeTimer;
  window.addEventListener("resize", () => {
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
