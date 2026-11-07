/* SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
   SPDX-License-Identifier: AGPL-3.0-or-later */
/* =============================================================================
 *  admin.js - panel administracyjny oparty na MAPIE.
 *
 *  Zakładki po lewej:
 *    - „Przedmioty i zależności" - klik w bloczek/strzałkę otwiera edycję,
 *    - „Archetypy" - lista archetypów (dodawanie, kolejność, usuwanie) i edytor,
 *      w którym przedmioty przypisuje się KLIKANIEM BLOCZKÓW NA MAPIE; mapa
 *      od razu pokazuje podgląd: rdzeń / wsparcie / kontekst jak na stronie.
 *
 *  Zapis (api/save.php) jest odporny na typowe „nie zapisało się":
 *    - otwarty formularz jest zatwierdzany automatycznie przed zapisem,
 *    - wygasła sesja → okno ponownego logowania, potem zapis jest powtarzany,
 *    - sesja jest podtrzymywana w tle, gdy panel jest otwarty,
 *    - zmiany są na bieżąco odkładane w przeglądarce (szkic) - po zamknięciu
 *      karty lub awarii można je przywrócić,
 *    - zapis z innej karty/osoby jest wykrywany (konflikt) zamiast cichego
 *      nadpisania.
 * ========================================================================== */
(() => {
    'use strict';

    const D    = window.ADMIN_DATA;
    const CORE = window.RoadmapGraphCore;
    const C    = CONFIG.colors;
    const LAY  = CONFIG.layout;
    const TXT  = CONFIG.texts;
    const SEM  = CONFIG.semesterCount;
    const CATS = CONFIG.categories;

    const clone = o => JSON.parse(JSON.stringify(o));
    const $  = s => document.querySelector(s);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const oneLine = s => String(s ?? '').replace(/\s*\n\s*/g, ' ');
    const hhmm = d => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

    // ── Stan ─────────────────────────────────────────────────────────────────
    let nodes = clone(D.nodes);
    let edges = clone(D.edges);
    let archetypes = clone(D.archetypes);   // [{ key, label, tagline, daily, subjects, core }]
    normalizeArchetypes();
    let baseRevision = D.revision;          // wersja danych na serwerze, na której pracujemy
    let csrf = D.csrf;
    let savedSig = signature();             // stan ostatnio zapisany/wczytany
    let dirty = false;
    let saving = false;

    let tab = 'graph';                      // 'graph' | 'arch'
    let selected = null;                    // { type: 'node'|'edge'|'arch', ref, isNew }
    let form = null;                        // otwarty formularz: { dirty, commit() }
    let tiers = null;                       // podgląd archetypu na mapie
    let edgePick = null;                    // edytor zależności: 'from' | 'to' | null - który koniec wskazujemy klikiem na mapie
    let autoKey = new WeakSet();            // nowe archetypy, których klucz podąża za nazwą

    let network = null, nodesDataset = null, edgesDataset = null;
    let electiveGroups = [];
    let firstBuild = true;

    let nodeById = {};
    const rebuildIndex = () => { nodeById = {}; nodes.forEach(n => { nodeById[n.id] = n; }); };
    rebuildIndex();

    // ── Elementy ─────────────────────────────────────────────────────────────
    const editorEl   = $('#editor');
    const saveBtn    = $('#save-btn');
    const dirtyBadge = $('#dirty-badge');
    const statusEl   = $('#save-status');
    const graphEl    = $('#mynetwork');
    const headersEl  = $('#column-headers');
    const mapHint    = $('#map-hint');
    const bannersEl  = $('#banners');
    const modalEl    = $('#modal');
    const modalBody  = $('#modal-body');

    // =========================================================================
    //  STAN „NIEZAPISANE ZMIANY" + SZKIC W PRZEGLĄDARCE
    // =========================================================================
    function signature() {
        return JSON.stringify({ nodes, edges, archetypes });
    }

    const DRAFT_KEY = 'roadmap_admin_draft_v2:' + location.pathname;
    let draftTimer = null;

    function markChanged() {
        dirty = signature() !== savedSig;
        dirtyBadge.hidden = !dirty;
        saveBtn.classList.toggle('pulse', dirty);
        updateArchCount();
        clearTimeout(draftTimer);
        draftTimer = setTimeout(storeDraft, 500);
    }

    function storeDraft() {
        try {
            if (dirty) {
                localStorage.setItem(DRAFT_KEY, JSON.stringify({
                    base: baseRevision, at: Date.now(), nodes, edges, archetypes
                }));
            } else {
                localStorage.removeItem(DRAFT_KEY);
            }
        } catch (_) { /* tryb prywatny / brak miejsca - szkic jest tylko dodatkiem */ }
    }

    function readDraft() {
        try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (_) { return null; }
    }
    function dropDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} }

    // =========================================================================
    //  KOMUNIKATY: toast (krótki) + paski (trwałe, z przyciskami)
    // =========================================================================
    function toast(msg, ok = true) {
        const t = $('#toast');
        t.textContent = msg;
        t.className = 'toast ' + (ok ? 'ok' : 'err');
        t.hidden = false;
        clearTimeout(toast._t);
        toast._t = setTimeout(() => { t.hidden = true; }, ok ? 3200 : 7000);
    }
    $('#toast').addEventListener('click', () => { $('#toast').hidden = true; });

    function banner(id, type, html, actions = []) {
        removeBanner(id);
        const el = document.createElement('div');
        el.className = `banner banner-${type}`;
        el.dataset.id = id;
        el.innerHTML = `<div class="banner-text">${html}</div><div class="banner-actions"></div>`;
        const box = el.querySelector('.banner-actions');
        actions.forEach(a => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-mini-solid' + (a.ghost ? ' ghost' : '');
            b.textContent = a.label;
            b.onclick = () => a.run(el);
            box.appendChild(b);
        });
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'banner-x'; x.setAttribute('aria-label', 'Zamknij');
        x.innerHTML = '&times;';
        x.onclick = () => el.remove();
        box.appendChild(x);
        bannersEl.appendChild(el);
        return el;
    }
    function removeBanner(id) {
        bannersEl.querySelectorAll(`.banner[data-id="${id}"]`).forEach(b => b.remove());
    }

    function setStatus(text) { statusEl.textContent = text; }

    // =========================================================================
    //  OKNO MODALNE
    // =========================================================================
    let modalOnClose = null;
    function openModal(html, onClose) {
        modalBody.innerHTML = html;
        modalEl.hidden = false;
        modalOnClose = onClose || null;
        const first = modalBody.querySelector('input, button');
        if (first) setTimeout(() => first.focus(), 30);
    }
    function closeModal() {
        if (modalEl.hidden) return;
        modalEl.hidden = true;
        modalBody.innerHTML = '';
        const cb = modalOnClose; modalOnClose = null;
        if (cb) cb();
    }
    modalEl.querySelector('.modal-close').onclick = closeModal;
    modalEl.addEventListener('mousedown', e => { if (e.target === modalEl) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modalEl.hidden) closeModal(); });

    // =========================================================================
    //  ARCHETYPY: PRZYPISANY / KLUCZOWY
    //    subjects = przypisane do archetypu (na stronie: pełny kolor),
    //    core     = kluczowe, czyli podstawowe z obwódką (podzbiór subjects).
    //  Przypisany, ale nie kluczowy = wspierający dla TEGO archetypu - ten sam
    //  przedmiot może być kluczowy dla jednego archetypu, a wspierający dla innego.
    // =========================================================================
    function normalizeArchetypes() {
        // Starsze pliki nie mają "core": wyliczamy je tak, jak dotąd robiła to
        // strona (bez wspólnych dla wszystkich i bez flagi "foundational"),
        // więc mapa po pierwszym zapisie wygląda dokładnie tak samo.
        const nonEmpty = archetypes.map(a => a.subjects || []).filter(l => l.length).map(l => new Set(l));
        const isUniversal = id => nonEmpty.length > 0 && nonEmpty.every(s => s.has(id));
        const foundational = new Set(nodes.filter(n => n.foundational).map(n => n.id));
        archetypes.forEach(a => {
            a.subjects = Array.isArray(a.subjects) ? a.subjects : [];
            if (!Array.isArray(a.core)) {
                a.core = a.subjects.filter(id => !isUniversal(id) && !foundational.has(id));
            }
            a.core = a.core.filter(id => a.subjects.includes(id));
        });
        // Globalna flaga "foundational" jest zastąpiona przez „Kluczowy" per archetyp.
        nodes.forEach(n => { delete n.foundational; });
    }

    function sortByMap(ids) {
        const order = new Map(nodes.map((n, i) => [n.id, n.level * 10000 + i]));
        return ids.sort((x, y) => (order.get(x) ?? 1e9) - (order.get(y) ?? 1e9));
    }

    // 'none' | 'support' (przypisany) | 'core' (przypisany + kluczowy)
    function membership(a, id) {
        if (!a.subjects.includes(id)) return 'none';
        return a.core.includes(id) ? 'core' : 'support';
    }
    function setMembership(a, id, state) {
        a.subjects = a.subjects.filter(s => s !== id);
        a.core = a.core.filter(s => s !== id);
        if (state !== 'none') a.subjects = sortByMap([...a.subjects, id]);
        if (state === 'core') a.core = sortByMap([...a.core, id]);
    }

    // Siatka z dwiema kolumnami checkboxów; zależności między nimi:
    // „Kluczowy" włącza „Przypisany", odznaczenie „Przypisany" zdejmuje „Kluczowy".
    function bindPairGrid(root, onChange) {
        root.querySelectorAll('.arch-grid-row').forEach(row => {
            const tag = row.querySelector('[data-tag]');
            const key = row.querySelector('[data-key]');
            if (!tag || !key) return;
            tag.addEventListener('change', () => { if (!tag.checked) key.checked = false; if (onChange) onChange(row, tag, key); });
            key.addEventListener('change', () => { if (key.checked) tag.checked = true; if (onChange) onChange(row, tag, key); });
        });
    }

    // =========================================================================
    //  KOMUNIKACJA Z SERWEREM
    // =========================================================================
    async function apiCall(url, body) {
        let res;
        try {
            res = await fetch(url, body === undefined
                ? { credentials: 'same-origin', cache: 'no-store' }
                : {
                    method: 'POST', credentials: 'same-origin', cache: 'no-store',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
        } catch (_) {
            return { status: 0, data: { ok: false, error: 'Brak połączenia z serwerem. Zmiany są zachowane w przeglądarce - spróbuj ponownie za chwilę.' } };
        }
        let data;
        try { data = await res.json(); }
        catch (_) { data = { ok: false, error: `Serwer zwrócił nieoczekiwaną odpowiedź (HTTP ${res.status}).` }; }
        return { status: res.status, data };
    }

    // Odświeża token CSRF i sprawdza, czy sesja żyje.
    async function pingSession() {
        const { status, data } = await apiCall('api/session.php');
        if (status === 200 && data.ok) {
            csrf = data.csrf;
            if (data.authed) removeBanner('session');
            return !!data.authed;
        }
        return null; // brak połączenia - nie wiadomo
    }

    // Okno ponownego logowania. Zwraca Promise<boolean>.
    function relogin(reason) {
        return new Promise(resolve => {
            let done = false;
            openModal(`
                <div class="modal-kicker">Sesja wygasła</div>
                <h2 class="modal-title">Zaloguj się ponownie</h2>
                <p class="modal-text">${esc(reason || 'Ze względów bezpieczeństwa sesja wygasa po dłuższej przerwie.')}
                Twoje zmiany <strong>nie zostały utracone</strong> - po zalogowaniu zapis zostanie powtórzony.</p>
                <form id="relogin-form" class="modal-form" autocomplete="off">
                    <label for="relogin-pass">Hasło</label>
                    <input type="password" id="relogin-pass" required>
                    <div class="modal-error" id="relogin-err" hidden></div>
                    <div class="modal-actions">
                        <button type="submit" class="btn btn-save">Zaloguj i kontynuuj</button>
                        <button type="button" class="btn btn-ghost" id="relogin-cancel">Anuluj</button>
                    </div>
                </form>`, () => { if (!done) resolve(false); });

            $('#relogin-cancel').onclick = closeModal;
            $('#relogin-form').onsubmit = async ev => {
                ev.preventDefault();
                const errEl = $('#relogin-err');
                errEl.hidden = true;
                const password = $('#relogin-pass').value;
                await pingSession(); // świeży token przed próbą
                let r = await apiCall('api/session.php', { action: 'login', password, csrf });
                if (r.status === 403 && r.data.csrf && r.data.token) {
                    csrf = r.data.token;
                    r = await apiCall('api/session.php', { action: 'login', password, csrf });
                }
                if (r.status === 200 && r.data.ok) {
                    csrf = r.data.csrf;
                    removeBanner('session');
                    done = true;
                    closeModal();
                    resolve(true);
                } else {
                    errEl.textContent = r.data.error || 'Logowanie nie powiodło się.';
                    errEl.hidden = false;
                }
            };
        });
    }

    // Podtrzymanie sesji, gdy panel jest otwarty.
    async function keepAlive() {
        const authed = await pingSession();
        if (authed === false) {
            banner('session', 'warn', '<strong>Sesja wygasła.</strong> Zaloguj się ponownie, aby móc zapisać zmiany (zmiany w panelu są bezpieczne).', [
                { label: 'Zaloguj ponownie', run: () => relogin() }
            ]);
        }
    }
    setInterval(keepAlive, 4 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAlive(); });

    // =========================================================================
    //  ZAPIS
    // =========================================================================
    function payload(force) {
        return { csrf, base: baseRevision, force: !!force, nodes, edges, archetypes };
    }

    async function save(opts = {}) {
        if (saving) return false;
        if (!commitOpenForm()) return false;
        saving = true;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Zapisywanie…';
        removeBanner('save-error');
        try {
            return await doSave(!!opts.force);
        } finally {
            saving = false;
            saveBtn.disabled = false;
            saveBtn.textContent = 'Zapisz zmiany';
        }
    }

    async function doSave(force) {
        for (let attempt = 0; attempt < 3; attempt++) {
            const sentSig = signature();
            let { status, data } = await apiCall('api/save.php', payload(force));

            // Token CSRF nieaktualny (np. po zalogowaniu w innej karcie) → odśwież i powtórz.
            if (status === 403 && data.csrf) {
                const authed = await pingSession();
                if (authed) continue;
                status = 401;
            }
            // Wygasła sesja → zaloguj w okienku i powtórz zapis.
            if (status === 401) {
                if (await relogin()) continue;
                banner('save-error', 'error', '<strong>Nie zapisano.</strong> Sesja wygasła, a logowanie zostało anulowane. Zmiany są nadal w panelu.', [
                    { label: 'Zaloguj i zapisz', run: () => save({ force }) }
                ]);
                return false;
            }
            if (status === 409 && data.conflict) {
                showConflict();
                return false;
            }
            if (!(status === 200 && data.ok)) {
                banner('save-error', 'error', `<strong>Nie zapisano.</strong> ${esc(data.error || 'Nieznany błąd.')}`, [
                    { label: 'Spróbuj ponownie', run: () => save({ force }) }
                ]);
                return false;
            }

            // Sukces. Za „zapisany" uznajemy stan z chwili wysłania - jeśli ktoś
            // edytował w trakcie zapisu, te zmiany dalej są oznaczone jako niezapisane.
            baseRevision = data.revision;
            savedSig = sentSig;
            autoKey = new WeakSet();
            markChanged();
            if (!dirty) dropDraft();
            const t = hhmm(new Date());
            if (!data.changed.length) {
                setStatus(`Sprawdzono ${t} - bez zmian`);
                toast('Brak zmian do zapisania - dane na serwerze są aktualne.');
            } else {
                setStatus(`Zapisano ${t}`);
                toast(data.backup
                    ? `Zapisano (${data.changed.length} plik.). Utworzono kopię zapasową stanu sprzed zapisu.`
                    : `Zapisano (${data.changed.length} plik.).`);
            }
            return true;
        }
        banner('save-error', 'error', '<strong>Nie zapisano.</strong> Serwer kilkukrotnie odrzucił zapis. Odśwież stronę (zmiany zostaną w szkicu) i spróbuj ponownie.');
        return false;
    }

    function showConflict() {
        openModal(`
            <div class="modal-kicker">Konflikt zapisu</div>
            <h2 class="modal-title">Dane na serwerze zmieniły się</h2>
            <p class="modal-text">Od otwarcia tego panelu ktoś zapisał zmiany (np. w innej karcie
            przeglądarki) albo przywrócono kopię zapasową.</p>
            <ul class="modal-list">
                <li><strong>Nadpisz moimi zmianami</strong> - zapisze to, co widzisz w tym panelu.
                    Wersja z serwera trafi do kopii zapasowych, więc nic nie przepadnie.</li>
                <li><strong>Wczytaj wersję z serwera</strong> - odrzuci zmiany z tego panelu.</li>
            </ul>
            <div class="modal-actions">
                <button type="button" class="btn btn-save" id="cf-force">Nadpisz moimi zmianami</button>
                <button type="button" class="btn btn-ghost" id="cf-reload">Wczytaj wersję z serwera</button>
            </div>`);
        $('#cf-force').onclick = () => { closeModal(); save({ force: true }); };
        $('#cf-reload').onclick = () => {
            if (!confirm('Odrzucić zmiany z tego panelu i wczytać dane z serwera?')) return;
            dropDraft(); dirty = false; location.reload();
        };
    }

    // =========================================================================
    //  MAPA
    // =========================================================================
    function makeHeaders() {
        headersEl.innerHTML = '';
        for (let s = 1; s <= SEM; s++) {
            const h = document.createElement('div');
            h.id = `header-sem${s}`;
            h.className = 'sem-header';
            h.innerHTML = `<span class="dot"></span> ${esc(TXT.semesterHeader)} ${s}`;
            headersEl.appendChild(h);
        }
    }

    function positionHeaders() {
        if (!network || !nodesDataset) return;
        const scale = Math.max(LAY.headerMinScale, Math.min(network.getScale(), LAY.headerMaxScale));
        for (let sem = 1; sem <= SEM; sem++) {
            const el = document.getElementById(`header-sem${sem}`);
            if (!el) continue;
            const ids = nodesDataset.get({ filter: i => i.level === sem }).map(n => n.id);
            if (!ids.length) { el.style.display = 'none'; continue; }
            const pos = network.getPositions(ids);
            let sumX = 0, count = 0;
            for (const id in pos) { sumX += pos[id].x; count++; }
            const dom = network.canvasToDOM({ x: sumX / count, y: 0 });
            el.style.display = 'flex';
            el.style.left = `${dom.x}px`;
            el.style.transform = `translateX(-50%) scale(${scale})`;
        }
    }

    function tierOf(id) {
        if (!tiers) return 'normal';
        if (tiers.core.has(id)) return 'core';
        if (tiers.highlighted.has(id)) return 'support';
        return 'context';
    }

    function visualFor(n, pos) {
        const extra = { title: `${n.id}\n${oneLine(n.label)}` };
        if (pos) { extra.x = pos.x; extra.y = pos.y; }
        return CORE.nodeVisual(n, tierOf(n.id), extra);
    }

    function restyleNodes() {
        if (!nodesDataset) return;
        rebuildIndex();
        nodesDataset.update(nodes.map(n => visualFor(n)));
        if (network) network.redraw();
    }

    async function buildGraph(preserveView = true) {
        rebuildIndex();
        let view = null;
        if (network && preserveView && !firstBuild) {
            view = { position: network.getViewPosition(), scale: network.getScale() };
        }

        const { positions, electiveGroups: groups } = await CORE.layout(nodes, edges);
        electiveGroups = groups;
        if (selected?.type === 'arch') recomputeTiers();

        nodesDataset = new vis.DataSet(nodes.map(n => visualFor(n, positions[n.id] || { x: 0, y: 0 })));
        edgesDataset = new vis.DataSet(edges
            .map((e, i) => ({ id: 'e' + i, from: e.from, to: e.to, title: oneLine(e.skill) || undefined }))
            .filter(e => nodeById[e.from] && nodeById[e.to]));

        if (network) network.destroy();
        network = new vis.Network(graphEl, { nodes: nodesDataset, edges: edgesDataset }, CORE.NET_OPTIONS);

        const hl = () => (tiers ? tiers.highlighted : null);
        network.on('beforeDrawing', ctx => CORE.drawElectiveBoxes(ctx, network, electiveGroups, hl()));
        network.on('afterDrawing', ctx => {
            if (tiers) CORE.drawCoreRings(ctx, network, tiers.core);
            CORE.drawElectiveLabels(ctx, network, electiveGroups, hl());
            drawSubjectMarks(ctx);
            positionHeaders();
        });
        network.on('click', onGraphClick);
        network.on('hoverNode', () => { graphEl.style.cursor = 'pointer'; });
        network.on('blurNode', () => { graphEl.style.cursor = ''; });

        network.once('afterDrawing', () => { if (view) network.moveTo(view); else network.fit(); });
        firstBuild = false;

        if (selected?.type === 'node' && nodeById[selected.ref.id] && !selected.isNew) {
            try { network.selectNodes([selected.ref.id]); } catch (_) {}
        }
    }

    // W edytorze archetypu: znaczek ✓ na bloczkach przypisanych do archetypu.
    function drawSubjectMarks(ctx) {
        if (!tiers || selected?.type !== 'arch') return;
        ctx.save();
        tiers.tagged.forEach(id => {
            let bb;
            try { bb = network.getBoundingBox(id); } catch (_) { bb = null; }
            if (!bb) return;
            const x = bb.right - 2, y = bb.top + 2, r = 11;
            const isCore = tiers.core.has(id);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = isCore ? C.archRing : '#ffffff';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = isCore ? '#ffffff' : C.archRing;
            ctx.stroke();
            ctx.fillStyle = isCore ? '#ffffff' : C.archRing;
            ctx.font = '700 13px Montserrat, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✓', x, y + 1);
        });
        ctx.restore();
    }

    function onGraphClick(params) {
        const nodeId = params.nodes[0];
        const edgeId = params.edges[0];

        // Edytor zależności w trybie wskazywania: klik w bloczek = wybór przedmiotu.
        if (selected?.type === 'edge' && edgePick && nodeId && nodeById[nodeId]) {
            pickEdgeNode(nodeId);
            return;
        }

        // Edytor archetypu: klik w bloczek = przypisz / odepnij.
        if (selected?.type === 'arch') {
            if (nodeId && nodeById[nodeId]) toggleSubject(selected.ref, nodeId);
            network.unselectAll();
            return;
        }

        if (nodeId && nodeById[nodeId]) {
            return guarded(() => { switchTab('graph', false); selectNode(nodeById[nodeId]); });
        }
        if (edgeId && !nodeId) {
            const idx = parseInt(String(edgeId).replace(/^e/, ''), 10);
            if (edges[idx]) return guarded(() => { switchTab('graph', false); selectEdge(edges[idx]); });
        }
        if (tab === 'graph') guarded(clearEditor);
    }

    // =========================================================================
    //  OTWARTY FORMULARZ - automatyczne zatwierdzanie
    //  (dawniej zmiany bez kliknięcia „Zastosuj" przepadały przy zapisie)
    // =========================================================================
    function commitOpenForm() {
        if (!form || !form.dirty) return true;
        return form.commit();
    }
    function guarded(fn) {
        if (!commitOpenForm()) return;
        fn();
    }
    function trackForm(commit) {
        form = { dirty: false, commit };
    }
    function markFormDirty() {
        if (!form || form.dirty) return;
        form.dirty = true;
        const applyBtn = editorEl.querySelector('.btn-apply');
        if (applyBtn) applyBtn.classList.add('pending');
        const note = editorEl.querySelector('.pending-note');
        if (note) note.hidden = false;
    }
    // Jeden delegowany nasłuch na cały edytor (formularze są przerysowywane).
    editorEl.addEventListener('input', () => markFormDirty());
    editorEl.addEventListener('change', () => markFormDirty());
    editorEl.addEventListener('click', e => {
        const del = e.target.closest('.skill-del');
        if (del) { del.closest('.skill-row').remove(); markFormDirty(); }
    });

    // =========================================================================
    //  ZAKŁADKI
    // =========================================================================
    function switchTab(t, render = true) {
        if (t === tab && !render) return;
        tab = t;
        document.querySelectorAll('.editor-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
        $('#graph-actions').hidden = t !== 'graph';
        $('#arch-actions').hidden = t !== 'arch';
        if (t === 'graph') {
            if (selected?.type === 'arch') { selected = null; setPreview(null); }
            if (render) clearEditor();
        } else if (render) {
            renderArchList();
        }
    }
    document.querySelectorAll('.editor-tab').forEach(b => {
        b.onclick = () => guarded(() => switchTab(b.dataset.tab));
    });

    function updateArchCount() {
        $('#arch-count').textContent = archetypes.length ? `(${archetypes.length})` : '';
    }

    // =========================================================================
    //  EDYTOR - stan pusty
    // =========================================================================
    function clearEditor() {
        selected = null;
        form = null;
        setPreview(null);
        if (network) network.unselectAll();
        editorEl.innerHTML = `<div class="editor-empty">
            Kliknij <strong>przedmiot</strong> lub <strong>zależność</strong> na mapie, aby edytować.
            Nowe elementy dodasz przyciskami powyżej.<br><br>
            Archetypy zawodowe (menu na stronie publicznej) edytujesz w zakładce <strong>Archetypy</strong>.
        </div>`;
    }

    // =========================================================================
    //  EDYTOR PRZEDMIOTU
    // =========================================================================
    function selectNode(n) {
        selected = { type: 'node', ref: n, isNew: false };
        setPreview(null);
        if (network) { try { network.selectNodes([n.id]); } catch (_) {} }
        renderNodeEditor(n);
    }

    function skillRowHTML(s) {
        return `<div class="skill-row"><textarea rows="2">${esc(s)}</textarea><button type="button" class="skill-del" title="Usuń">Usuń</button></div>`;
    }

    function renderNodeEditor(n) {
        const isRoot = !selected.isNew && n.id === 'ROOT';
        const catKeys = Object.keys(CATS);
        const catOpts = ['<option value="">- brak -</option>']
            .concat(catKeys.map(k => `<option value="${esc(k)}"${n.category === k ? ' selected' : ''}>${esc(CATS[k].label)}</option>`))
            .concat(n.category && !CATS[n.category] ? [`<option value="${esc(n.category)}" selected>${esc(n.category)} (brak w config.js)</option>`] : [])
            .join('');
        const levelOpts = Array.from({ length: SEM + 1 }, (_, l) =>
            `<option value="${l}"${Number(n.level) === l ? ' selected' : ''}>${l === 0 ? '0 - korzeń (kierunek)' : 'Semestr ' + l}</option>`).join('');
        const blocks = [...new Set(nodes.map(x => x.electiveBlock).filter(Boolean))];
        const archGrid = archetypes.length
            ? `<div class="arch-grid">
                <div class="arch-grid-head"><span>Archetyp</span><span>Przypisany</span><span>Kluczowy</span></div>
                ${archetypes.map((a, i) => {
                    const m = membership(a, n.id);
                    return `<div class="arch-grid-row">
                        <span class="arch-grid-name" title="${esc(a.key)}">${esc(a.label)}</span>
                        <input type="checkbox" data-tag="${i}" ${m !== 'none' ? 'checked' : ''} aria-label="Przypisany do: ${esc(a.label)}">
                        <input type="checkbox" data-key="${i}" ${m === 'core' ? 'checked' : ''} aria-label="Kluczowy dla: ${esc(a.label)}">
                    </div>`;
                }).join('')}
               </div>
               <span class="hint">„Przypisany" - przedmiot należy do archetypu (pełny kolor). „Kluczowy" - przedmiot podstawowy z obwódką.
               Przypisany bez „Kluczowy" = wspierający dla tego archetypu. Nowe archetypy pojawiają się tu automatycznie.</span>`
            : '<div class="hint">Brak archetypów - dodasz je w zakładce „Archetypy".</div>';
        const skills = Array.isArray(n.skills) ? n.skills : [];

        editorEl.innerHTML = `
            <div class="editor-head">
                <div class="eyebrow">${selected.isNew ? 'Nowy przedmiot' : 'Edycja przedmiotu'}</div>
                <h2>${esc(oneLine(n.label) || n.id || 'Nowy przedmiot')}</h2>
            </div>
            <div class="field">
                <label for="f-id">ID</label>
                <input type="text" id="f-id" value="${esc(n.id)}" placeholder="np. PODST9" ${isRoot ? 'disabled' : ''}>
                <span class="hint">${isRoot
                    ? 'ID korzenia mapy („ROOT") jest zablokowane - od niego zależy wygląd węzła startowego.'
                    : 'Krótki, unikalny kod (litery, cyfry, _ i -). Zmiana ID aktualizuje też zależności i archetypy.'}</span>
            </div>
            <div class="field">
                <label for="f-level">Semestr</label>
                <select id="f-level">${levelOpts}</select>
            </div>
            <div class="field">
                <label for="f-label">Etykieta na bloczku</label>
                <textarea id="f-label" rows="2">${esc(n.label)}</textarea>
                <span class="hint">Enter = nowa linia na bloczku.</span>
            </div>
            <div class="field">
                <label for="f-category">Dziedzina (kolor)</label>
                <select id="f-category">${catOpts}</select>
                <span class="hint">Listę dziedzin i ich kolory ustawiasz w config.js.</span>
            </div>
            <div class="field">
                <label for="f-elective">Blok obieralny</label>
                <input type="text" id="f-elective" list="dl-blocks" value="${esc(n.electiveBlock || '')}" placeholder="np. Blok obieralny 1">
                <datalist id="dl-blocks">${blocks.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
                <span class="hint">Puste = przedmiot obowiązkowy. Ta sama nazwa w tym samym semestrze = wspólna ramka.</span>
            </div>
            <div class="field">
                <label for="f-title">Opis</label>
                <textarea id="f-title" rows="3">${esc(n.title || '')}</textarea>
            </div>
            <div class="field">
                <label for="f-syllabus">Link do sylabusa (PDF)</label>
                <input type="text" id="f-syllabus" value="${esc(n.syllabus || '')}" placeholder="https://...">
            </div>
            <div class="field">
                <label>Archetypy i przedmioty kluczowe</label>
                ${archGrid}
            </div>
            <div class="field">
                <label>Umiejętności z sylabusa</label>
                <div class="skills-editor" id="skills-editor">${skills.map(skillRowHTML).join('')}</div>
                <button type="button" class="btn-mini" id="add-skill">+ Dodaj umiejętność</button>
            </div>
            <div class="pending-note" hidden>Masz niezastosowane zmiany w tym formularzu - zostaną przyjęte automatycznie przy zapisie lub wyborze innego elementu.</div>
            <div class="editor-actions">
                <button type="button" class="btn btn-apply" id="apply-node">Zastosuj</button>
                ${selected.isNew ? '<button type="button" class="btn btn-ghost" id="cancel-node">Anuluj</button>'
                                 : '<button type="button" class="btn btn-delete" id="delete-node">Usuń</button>'}
            </div>`;

        $('#add-skill').onclick = () => {
            $('#skills-editor').insertAdjacentHTML('beforeend', skillRowHTML(''));
            $('#skills-editor').lastElementChild.querySelector('textarea').focus();
            markFormDirty();
        };
        bindPairGrid(editorEl);
        $('#apply-node').onclick = () => applyNode(n);
        if (selected.isNew) $('#cancel-node').onclick = () => { form = null; clearEditor(); };
        else $('#delete-node').onclick = () => deleteNode(n);
        trackForm(() => applyNode(n));
    }

    function applyNode(n) {
        const isNew = selected?.isNew;
        const oldId = n.id;
        const oldLevel = n.level;
        const oldElective = n.electiveBlock || '';

        const idInput = $('#f-id');
        const newId = idInput.disabled ? n.id : (idInput.value || '').trim();
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(newId)) { toast('ID: tylko litery, cyfry, _ i - (max 40 znaków).', false); idInput.focus(); return false; }
        if (nodes.some(x => x !== n && x.id === newId)) { toast(`ID „${newId}" jest już zajęte.`, false); idInput.focus(); return false; }

        // Zmiana ID → aktualizacja zależności i archetypów.
        if (!isNew && newId !== oldId) {
            edges.forEach(e => { if (e.from === oldId) e.from = newId; if (e.to === oldId) e.to = newId; });
            archetypes.forEach(a => {
                a.subjects = a.subjects.map(s => (s === oldId ? newId : s));
                a.core = a.core.map(s => (s === oldId ? newId : s));
            });
        }
        n.id = newId;
        n.level = parseInt($('#f-level').value, 10) || 0;
        n.label = $('#f-label').value.trim() || newId;
        const cat = $('#f-category').value;
        if (cat) n.category = cat; else delete n.category;
        const elective = $('#f-elective').value.trim();
        if (elective) n.electiveBlock = elective; else delete n.electiveBlock;
        n.title = $('#f-title').value.trim();
        const syl = $('#f-syllabus').value.trim();
        if (syl) n.syllabus = syl; else delete n.syllabus;
        n.skills = [...editorEl.querySelectorAll('#skills-editor textarea')].map(t => t.value.trim()).filter(Boolean);

        editorEl.querySelectorAll('.arch-grid-row').forEach(row => {
            const tag = row.querySelector('[data-tag]'), key = row.querySelector('[data-key]');
            const a = archetypes[+tag.dataset.tag];
            if (!a) return;
            setMembership(a, n.id, key.checked ? 'core' : (tag.checked ? 'support' : 'none'));
        });

        if (isNew) { nodes.push(n); selected.isNew = false; }
        form = null;
        markChanged();

        const structural = isNew || newId !== oldId || n.level !== oldLevel || (n.electiveBlock || '') !== oldElective;
        if (structural) buildGraph(true).then(() => { if (selected?.ref === n) selectNode(n); });
        else { restyleNodes(); if (selected?.ref === n) renderNodeEditor(n); }
        toast('Zmiany przyjęte - pamiętaj o „Zapisz zmiany".');
        return true;
    }

    function deleteNode(n) {
        const linked = edges.filter(e => e.from === n.id || e.to === n.id).length;
        const inArch = archetypes.filter(a => (a.subjects || []).includes(n.id)).length;
        const extra = [linked ? `${linked} zależności` : '', inArch ? `przypisanie w ${inArch} archetypach` : ''].filter(Boolean).join(' oraz ');
        if (!confirm(`Usunąć przedmiot „${oneLine(n.label)}" (${n.id})?${extra ? `\nZniknie też: ${extra}.` : ''}`)) return;
        nodes = nodes.filter(x => x !== n);
        edges = edges.filter(e => e.from !== n.id && e.to !== n.id);
        archetypes.forEach(a => setMembership(a, n.id, 'none'));
        form = null;
        markChanged();
        selected = null;
        buildGraph(true).then(clearEditor);
    }

    function addNode() {
        guarded(() => {
            switchTab('graph', false);
            const n = { id: '', label: '', level: 1, category: '', title: '', skills: [] };
            selected = { type: 'node', ref: n, isNew: true };
            if (network) network.unselectAll();
            renderNodeEditor(n);
            $('#f-id').focus();
        });
    }

    // =========================================================================
    //  EDYTOR ZALEŻNOŚCI
    // =========================================================================
    function selectEdge(e) {
        selected = { type: 'edge', ref: e, isNew: false };
        setPreview(null);
        renderEdgeEditor(e);
    }

    function nodeOptions(sel) {
        return ['<option value="">- wybierz -</option>']
            .concat(nodes.slice().sort((a, b) => (a.level - b.level) || a.id.localeCompare(b.id))
                .map(n => `<option value="${esc(n.id)}"${n.id === sel ? ' selected' : ''}>[${n.level}] ${esc(oneLine(n.label))} (${esc(n.id)})</option>`))
            .join('');
    }

    function renderEdgeEditor(e) {
        const lbl = id => (nodeById[id] ? oneLine(nodeById[id].label) : '?');
        editorEl.innerHTML = `
            <div class="editor-head">
                <div class="eyebrow">${selected.isNew ? 'Nowa zależność' : 'Edycja zależności'}</div>
                <h2>${esc(lbl(e.from))} → ${esc(lbl(e.to))}</h2>
            </div>
            <div class="field" id="ef-from">
                <label for="e-from">Z przedmiotu (wymaganie wstępne)</label>
                <div class="pick-row">
                    <select id="e-from">${nodeOptions(e.from)}</select>
                    <button type="button" class="pick-btn" data-pick="from" title="Wskaż przedmiot klikając bloczek na mapie">&#9678; Na mapie</button>
                </div>
            </div>
            <div class="field" id="ef-to">
                <label for="e-to">Do przedmiotu (który z niego korzysta)</label>
                <div class="pick-row">
                    <select id="e-to">${nodeOptions(e.to)}</select>
                    <button type="button" class="pick-btn" data-pick="to" title="Wskaż przedmiot klikając bloczek na mapie">&#9678; Na mapie</button>
                </div>
                <span class="hint">Przedmiot wybierzesz z listy albo przyciskiem „Na mapie" i kliknięciem bloczka.</span>
            </div>
            <div class="field">
                <label for="e-skill">Opis zależności</label>
                <textarea id="e-skill" rows="5">${esc(e.skill || '')}</textarea>
                <span class="hint">Tekst pokazywany po kliknięciu strzałki na stronie.</span>
            </div>
            <div class="pending-note" hidden>Masz niezastosowane zmiany - zostaną przyjęte automatycznie przy zapisie lub wyborze innego elementu.</div>
            <div class="editor-actions">
                <button type="button" class="btn btn-apply" id="apply-edge">Zastosuj</button>
                ${selected.isNew ? '<button type="button" class="btn btn-ghost" id="cancel-edge">Anuluj</button>'
                                 : '<button type="button" class="btn btn-delete" id="delete-edge">Usuń</button>'}
            </div>`;
        $('#apply-edge').onclick = () => applyEdge(e);
        if (selected.isNew) $('#cancel-edge').onclick = () => { form = null; clearEditor(); };
        else $('#delete-edge').onclick = () => deleteEdge(e);
        trackForm(() => applyEdge(e));

        editorEl.querySelectorAll('[data-pick]').forEach(b => {
            b.onclick = () => setEdgePick(edgePick === b.dataset.pick ? null : b.dataset.pick);
        });
        ['#e-from', '#e-to'].forEach(sel => $(sel).addEventListener('change', syncEdgeSelection));
        // Nowa zależność: od razu tryb wskazywania na mapie (najpierw „z", potem „do").
        setEdgePick(selected.isNew ? (e.from ? (e.to ? null : 'to') : 'from') : null);
        syncEdgeSelection();
    }

    // ── Wskazywanie przedmiotów zależności klikiem na mapie ──────────────────
    function setEdgePick(which) {
        edgePick = which;
        ['from', 'to'].forEach(k => {
            const f = document.getElementById('ef-' + k);
            if (f) f.classList.toggle('picking', which === k);
            const b = editorEl.querySelector(`[data-pick="${k}"]`);
            if (b) b.classList.toggle('active', which === k);
        });
        if (which) {
            mapHint.innerHTML = `<strong>Kliknij bloczek na mapie:</strong> ${which === 'from'
                ? 'przedmiot <em>źródłowy</em> (wymaganie wstępne)'
                : 'przedmiot <em>docelowy</em> (który korzysta z wiedzy)'}
                <span class="map-hint-legend">Esc - anuluj wskazywanie</span>`;
            mapHint.hidden = false;
        } else if (selected?.type !== 'arch') {
            mapHint.hidden = true;
        }
    }

    function pickEdgeNode(id) {
        const which = edgePick;
        const other = which === 'from' ? 'to' : 'from';
        if ($('#e-' + other).value === id) {
            toast('Zależność nie może wskazywać na ten sam przedmiot.', false);
            return;
        }
        $('#e-' + which).value = id;
        markFormDirty();
        // Po wskazaniu „z" przechodzimy do „do" (jeśli jeszcze puste).
        setEdgePick(which === 'from' && !$('#e-to').value ? 'to' : null);
        syncEdgeSelection();
        if (!edgePick) $('#e-skill').focus();
    }

    // Nagłówek „A → B" i zaznaczenie obu bloczków na mapie.
    function syncEdgeSelection() {
        const from = $('#e-from')?.value, to = $('#e-to')?.value;
        const lbl = id => (nodeById[id] ? oneLine(nodeById[id].label) : '?');
        const h = editorEl.querySelector('.editor-head h2');
        if (h) h.textContent = `${lbl(from)} → ${lbl(to)}`;
        if (network) {
            try { network.selectNodes([from, to].filter(Boolean), false); } catch (_) {}
        }
    }

    function applyEdge(e) {
        const from = $('#e-from').value, to = $('#e-to').value;
        if (!from || !to) { toast('Wybierz oba przedmioty.', false); return false; }
        if (from === to) { toast('Zależność nie może wskazywać na ten sam przedmiot.', false); return false; }
        if (edges.some(x => x !== e && x.from === from && x.to === to)) { toast('Taka zależność już istnieje.', false); return false; }
        e.from = from; e.to = to; e.skill = $('#e-skill').value.trim();
        if (selected?.isNew) { edges.push(e); selected.isNew = false; }
        form = null;
        markChanged();
        buildGraph(true).then(() => { if (selected?.ref === e) selectEdge(e); });
        toast('Zależność przyjęta - pamiętaj o „Zapisz zmiany".');
        return true;
    }

    function deleteEdge(e) {
        if (!confirm('Usunąć tę zależność?')) return;
        edges = edges.filter(x => x !== e);
        form = null;
        markChanged();
        selected = null;
        buildGraph(true).then(clearEditor);
    }

    function addEdge() {
        guarded(() => {
            switchTab('graph', false);
            const e = { from: '', to: '', skill: '' };
            selected = { type: 'edge', ref: e, isNew: true };
            setPreview(null);
            if (network) network.unselectAll();
            renderEdgeEditor(e);
        });
    }

    // =========================================================================
    //  ARCHETYPY - lista
    // =========================================================================
    function setPreview(arch) {
        edgePick = null;
        const was = !!tiers;
        tiers = arch ? CORE.computeTiers(nodes, edges, archetypes, arch.key) : null;
        mapHint.hidden = !arch;
        if (arch) {
            mapHint.innerHTML = `<strong>Przypisywanie do „${esc(arch.label)}":</strong> klikaj bloczki na mapie: 1× kluczowy, 2× przypisany (wspierający), 3× usuń.
                <span class="map-hint-legend"><i class="lg lg-core"></i>podstawowy <i class="lg lg-support"></i>wspierający <i class="lg lg-context"></i>kontekstowy</span>`;
        }
        if (arch || was) restyleNodes();
    }
    function recomputeTiers() {
        if (selected?.type === 'arch') tiers = CORE.computeTiers(nodes, edges, archetypes, selected.ref.key);
    }

    function renderArchList() {
        selected = null;
        form = null;
        setPreview(null);
        if (network) network.unselectAll();

        const items = archetypes.map((a, i) => `
            <div class="arch-card" data-i="${i}" tabindex="0">
                <div class="arch-card-main">
                    <div class="arch-card-title">${esc(a.label)}</div>
                    <div class="arch-card-meta"><code>${esc(a.key)}</code> · ${(a.subjects || []).length} przedm.</div>
                    ${a.tagline ? `<div class="arch-card-tag">${esc(a.tagline)}</div>` : ''}
                </div>
                <div class="arch-card-order">
                    <button type="button" class="ord" data-move="-1" title="Wyżej w menu" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
                    <button type="button" class="ord" data-move="1" title="Niżej w menu" ${i === archetypes.length - 1 ? 'disabled' : ''}>&#9660;</button>
                </div>
            </div>`).join('');

        editorEl.innerHTML = `
            <div class="editor-head">
                <div class="eyebrow">Menu „Wybierz archetyp zawodowy"</div>
                <h2>Archetypy</h2>
            </div>
            ${archetypes.length
                ? `<div class="arch-cards">${items}</div>
                   <p class="hint block-hint">Kolejność na liście = kolejność w menu na stronie. Kliknij archetyp, aby edytować opis i przypisane przedmioty.</p>`
                : `<div class="editor-empty">Nie ma jeszcze żadnych archetypów - na stronie publicznej menu wyboru jest wtedy ukryte.<br><br>
                   Dodaj pierwszy przyciskiem <strong>+ Nowy archetyp</strong>.</div>`}`;

        editorEl.querySelectorAll('.arch-card').forEach(card => {
            const i = +card.dataset.i;
            card.onclick = e => {
                const mv = e.target.closest('[data-move]');
                if (mv) { e.stopPropagation(); moveArch(i, +mv.dataset.move); return; }
                openArch(archetypes[i]);
            };
            card.onkeydown = e => { if (e.key === 'Enter') openArch(archetypes[i]); };
        });
    }

    function moveArch(i, d) {
        const j = i + d;
        if (j < 0 || j >= archetypes.length) return;
        [archetypes[i], archetypes[j]] = [archetypes[j], archetypes[i]];
        markChanged();
        renderArchList();
    }

    const PL = { 'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z' };
    function slugify(s) {
        return String(s).toLowerCase().replace(/[ąćęłńóśźż]/g, c => PL[c])
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'archetyp';
    }
    function uniqueKey(base, except) {
        let k = base, i = 2;
        while (archetypes.some(a => a !== except && a.key === k)) k = `${base}-${i++}`.slice(0, 40);
        return k;
    }

    function addArch(copyFrom) {
        guarded(() => {
            switchTab('arch', false);
            const label = copyFrom ? `${copyFrom.label} (kopia)` : 'Nowy archetyp';
            const a = {
                key: uniqueKey(slugify(label)),
                label,
                tagline: copyFrom ? copyFrom.tagline : '',
                daily: copyFrom ? copyFrom.daily : '',
                subjects: copyFrom ? [...copyFrom.subjects] : (nodeById.ROOT ? ['ROOT'] : []),
                core: copyFrom ? [...copyFrom.core] : []
            };
            autoKey.add(a);
            archetypes.push(a);
            markChanged();
            openArch(a, true);
        });
    }

    // =========================================================================
    //  ARCHETYPY - edytor (zmiany działają od razu, bez „Zastosuj")
    // =========================================================================
    function openArch(a, focusLabel = false) {
        selected = { type: 'arch', ref: a, isNew: false };
        form = null;
        setPreview(a);
        renderArchEditor(a);
        if (focusLabel) { const el = $('#a-label'); el.focus(); el.select(); }
    }

    function renderArchEditor(a) {
        editorEl.innerHTML = `
            <button type="button" class="back-link" id="arch-back">&larr; Wszystkie archetypy</button>
            <div class="editor-head">
                <div class="eyebrow">Archetyp zawodowy</div>
                <h2 id="a-heading">${esc(a.label)}</h2>
            </div>
            <div class="field">
                <label for="a-label">Nazwa w menu</label>
                <input type="text" id="a-label" value="${esc(a.label)}" maxlength="80">
            </div>
            <div class="field">
                <label for="a-key">Klucz (identyfikator)</label>
                <input type="text" id="a-key" value="${esc(a.key)}" maxlength="40" spellcheck="false">
                <span class="hint" id="a-key-hint">Techniczna nazwa w character.json: małe litery, cyfry, _ i -.</span>
            </div>
            <div class="field">
                <label for="a-tagline">Podtytuł</label>
                <textarea id="a-tagline" rows="2">${esc(a.tagline)}</textarea>
            </div>
            <div class="field">
                <label for="a-daily">Na co dzień</label>
                <textarea id="a-daily" rows="5">${esc(a.daily)}</textarea>
            </div>
            <div id="a-summary"></div>
            <div class="field">
                <label>Przedmioty archetypu</label>
                <span class="hint" style="margin:0 0 8px">Zaznacz tutaj albo klikaj bloczki na mapie (kolejne kliknięcia: kluczowy → przypisany → usuń). Zmiany widać od razu.</span>
                <div id="a-subjects"></div>
            </div>
            <div class="editor-actions">
                <button type="button" class="btn btn-apply" id="arch-save">Zapisz i wróć do listy</button>
                <button type="button" class="btn btn-delete" id="arch-del">Usuń archetyp</button>
            </div>`;

        $('#arch-back').onclick = () => renderArchList();
        $('#arch-save').onclick = async () => {
            if (document.activeElement && editorEl.contains(document.activeElement)) document.activeElement.blur(); // zatwierdź pole klucza
            if (selected?.ref !== a) return;
            if (await save()) renderArchList();
        };
        $('#arch-del').onclick = () => {
            if (!confirm(`Usunąć archetyp „${a.label}"? Zniknie z menu na stronie.`)) return;
            archetypes = archetypes.filter(x => x !== a);
            markChanged();
            renderArchList();
        };

        const bindText = (id, field) => {
            $(id).addEventListener('input', ev => {
                a[field] = ev.target.value;
                if (field === 'label') {
                    $('#a-heading').textContent = a.label || '-';
                    if (autoKey.has(a)) { a.key = uniqueKey(slugify(a.label), a); $('#a-key').value = a.key; }
                    setPreview(a);
                }
                markChanged();
            });
        };
        bindText('#a-label', 'label');
        bindText('#a-tagline', 'tagline');
        bindText('#a-daily', 'daily');
        $('#a-label').addEventListener('change', () => {
            if (!a.label.trim()) { a.label = a.key; $('#a-label').value = a.label; $('#a-heading').textContent = a.label; markChanged(); }
        });

        const keyIn = $('#a-key'), keyHint = $('#a-key-hint');
        keyIn.addEventListener('input', () => { autoKey.delete(a); });
        keyIn.addEventListener('change', () => {
            const k = keyIn.value.trim().toLowerCase();
            let err = '';
            if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(k)) err = 'Klucz: małe litery bez polskich znaków, cyfry, _ i - (zaczyna się literą lub cyfrą).';
            else if (archetypes.some(x => x !== a && x.key === k)) err = `Klucz „${k}" jest już zajęty.`;
            if (err) {
                keyHint.textContent = err; keyHint.classList.add('hint-err');
                keyIn.value = a.key;
                return;
            }
            keyHint.textContent = 'Techniczna nazwa w character.json: małe litery, cyfry, _ i -.';
            keyHint.classList.remove('hint-err');
            a.key = k; keyIn.value = k;
            setPreview(a);
            markChanged();
        });

        renderArchSubjects(a);
    }

    function renderArchSummary() {
        const el = $('#a-summary');
        if (!el || !tiers) return;
        const core = tiers.core.size;
        const support = tiers.highlighted.size - core;
        const ctx = nodes.length - tiers.highlighted.size;
        el.innerHTML = `
            <div class="arch-key">
                <div class="arch-key-row"><span class="arch-dot arch-dot-core"></span><span><strong>${esc(TXT.archetype.coreLabel)}</strong> · <b>${core}</b></span></div>
                <div class="arch-key-row"><span class="arch-dot arch-dot-support"></span><span><strong>${esc(TXT.archetype.supportLabel)}</strong> · <b>${support}</b></span></div>
                <div class="arch-key-row"><span class="arch-dot arch-dot-context"></span><span><strong>${esc(TXT.archetype.contextLabel)}</strong> · <b>${ctx}</b></span></div>
            </div>`;
    }

    function renderArchSubjects(a) {
        const box = $('#a-subjects');
        if (!box) return;
        renderArchSummary();
        const byLevel = new Map();
        nodes.slice().sort((x, y) => (x.level - y.level)).forEach(n => {
            if (!byLevel.has(n.level)) byLevel.set(n.level, []);
            byLevel.get(n.level).push(n);
        });
        const note = n => (membership(a, n.id) === 'none' && tiers && tiers.highlighted.has(n.id)
            ? '<span class="subj-note" title="Nie jest przypisany, ale jest wymaganiem wstępnym przypisanego przedmiotu - na stronie będzie w pełnym kolorze.">wymaganie wstępne</span>' : '');
        box.innerHTML = [...byLevel.entries()].map(([lvl, list]) => `
            <div class="arch-grid arch-grid-subj">
                <div class="arch-grid-head"><span>${lvl === 0 ? 'Korzeń' : esc(TXT.semesterHeader) + ' ' + lvl}</span><span>Przypisany</span><span>Kluczowy</span></div>
                ${list.map(n => {
                    const m = membership(a, n.id);
                    return `<div class="arch-grid-row" data-id="${esc(n.id)}">
                        <span class="arch-grid-name">${esc(oneLine(n.label))}${note(n)}</span>
                        <input type="checkbox" data-tag="${esc(n.id)}" ${m !== 'none' ? 'checked' : ''}>
                        <input type="checkbox" data-key="${esc(n.id)}" ${m === 'core' ? 'checked' : ''}>
                    </div>`;
                }).join('')}
            </div>`).join('');
        bindPairGrid(box, (row, tag, key) => {
            setSubject(a, row.dataset.id, key.checked ? 'core' : (tag.checked ? 'support' : 'none'));
        });
    }

    // Klik w bloczek na mapie przełącza po kolei:
    // nieprzypisany → kluczowy → przypisany (wspierający) → nieprzypisany
    const CYCLE = { none: 'core', core: 'support', support: 'none' };
    function toggleSubject(a, id) {
        setSubject(a, id, CYCLE[membership(a, id)]);
    }
    function setSubject(a, id, state) {
        if (membership(a, id) === state) return;
        setMembership(a, id, state);
        markChanged();
        setPreview(a);
        renderArchSubjects(a);
    }

    // =========================================================================
    //  KOPIE ZAPASOWE
    // =========================================================================
    const fmtSize = b => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
    const fmtDate = ts => new Date(ts * 1000).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const KIND = { auto: 'automatyczna', manual: 'ręczna', restore: 'przed przywróceniem', force: 'przed nadpisaniem' };

    async function openBackups() {
        openModal('<div class="modal-kicker">Kopie zapasowe</div><h2 class="modal-title">Wczytywanie…</h2>');
        let { status, data } = await apiCall('api/backups.php');
        if (status === 401) {
            closeModal();
            if (await relogin()) openBackups();
            return;
        }
        if (!data.ok) {
            modalBody.innerHTML = `<div class="modal-kicker">Kopie zapasowe</div><h2 class="modal-title">Błąd</h2><p class="modal-text">${esc(data.error)}</p>`;
            return;
        }
        const s = data.settings;
        const rows = data.list.map(b => `
            <tr>
                <td><strong>${fmtDate(b.ts)}</strong><div class="bk-reason">${esc(b.reason)}</div></td>
                <td><span class="bk-kind bk-${esc(b.kind)}">${esc(KIND[b.kind] || b.kind)}</span></td>
                <td class="bk-size">${fmtSize(b.size)}</td>
                <td class="bk-actions">
                    <button type="button" class="btn-mini" data-restore="${esc(b.name)}">Przywróć</button>
                    <a class="btn-mini" href="api/backups.php?download=${encodeURIComponent(b.name)}">Pobierz</a>
                    <button type="button" class="btn-mini btn-mini-danger" data-del="${esc(b.name)}" title="Usuń kopię">&times;</button>
                </td>
            </tr>`).join('');

        modalBody.innerHTML = `
            <div class="modal-kicker">Kopie zapasowe</div>
            <h2 class="modal-title">Historia danych</h2>
            <p class="modal-text">Każda kopia to jeden plik ze stanem <em>wszystkich</em> danych mapy. Powstaje automatycznie
            przed zapisem, który coś zmienia - nie częściej niż co ${Math.round(s.minInterval / 60)} min.
            Zostaje ${s.keepRecent} najnowszych oraz po jednej z każdego dnia przez ${s.keepDays} dni; kopie ręczne nie są usuwane automatycznie.</p>
            <div class="modal-actions" style="margin:0 0 14px">
                <button type="button" class="btn btn-save" id="bk-create">Utwórz kopię teraz</button>
            </div>
            ${data.list.length
                ? `<div class="bk-table-wrap"><table class="bk-table"><tbody>${rows}</tbody></table></div>`
                : '<p class="modal-text"><em>Brak kopii - pierwsza powstanie przy najbliższym zapisie.</em></p>'}
            ${data.legacy.count ? `
                <div class="bk-legacy">
                    <div><strong>Stare kopie (.bak) z poprzedniej wersji panelu:</strong> ${data.legacy.count} plików, ${fmtSize(data.legacy.size)}.
                    Nowy panel ich nie używa.</div>
                    <button type="button" class="btn-mini btn-mini-danger" id="bk-purge">Usuń stare kopie</button>
                </div>` : ''}`;

        $('#bk-create').onclick = () => backupAction({ action: 'create' }, r => toast(r.message || 'Utworzono kopię.'));
        const purge = $('#bk-purge');
        if (purge) purge.onclick = () => {
            if (!confirm(`Usunąć ${data.legacy.count} starych plików .bak?`)) return;
            backupAction({ action: 'purge_legacy' }, r => toast(`Usunięto ${r.removed} starych plików.`));
        };
        modalBody.querySelectorAll('[data-del]').forEach(b => {
            b.onclick = () => {
                if (!confirm('Usunąć tę kopię zapasową? Tej operacji nie da się cofnąć.')) return;
                backupAction({ action: 'delete', name: b.dataset.del }, () => toast('Usunięto kopię.'));
            };
        });
        modalBody.querySelectorAll('[data-restore]').forEach(b => {
            b.onclick = () => restoreBackup(b.dataset.restore);
        });
    }

    async function backupAction(body, onOk) {
        const { status, data } = await apiCall('api/backups.php', { ...body, csrf });
        if (status === 401) { closeModal(); if (await relogin()) openBackups(); return; }
        if (!data.ok) { toast(data.error || 'Operacja nie powiodła się.', false); return; }
        onOk(data);
        openBackups();
    }

    async function restoreBackup(name) {
        const warn = dirty ? '\n\nUWAGA: masz niezapisane zmiany w panelu - zostaną odrzucone.' : '';
        if (!confirm('Przywrócić dane z tej kopii?\nObecny stan zostanie najpierw zapisany jako osobna kopia, więc operację można cofnąć.' + warn)) return;
        const { status, data } = await apiCall('api/backups.php', { action: 'restore', name, csrf });
        if (status === 401) { closeModal(); if (await relogin()) restoreBackup(name); return; }
        if (!data.ok) { toast(data.error || 'Przywracanie nie powiodło się.', false); return; }
        dropDraft();
        dirty = false;
        form = null;
        toast('Przywrócono kopię - wczytuję dane…');
        setTimeout(() => location.reload(), 700);
    }

    // =========================================================================
    //  DANE W STARYM FORMACIE (pole "tags" w przedmiotach)
    // =========================================================================
    //  Poprzednia wersja trzymała przypisania archetypów w semX.json (tags/key).
    //  Teraz jedynym źródłem jest character.json. Jeśli w danych są jeszcze
    //  „tags", panel proponuje jednorazowe przeniesienie.
    //  Nazwy archetypów tworzonych przy migracji = nazwy z pola "tags"
    //  (opis i "na co dzień" uzupełnia się potem w zakładce „Archetypy").
    //  Można tu dopisać gotowe opisy: { klucz: { label, tagline, daily } }.
    const LEGACY_INFO = {};

    function checkLegacy() {
        const tagged = nodes.filter(n => Array.isArray(n.tags) || Array.isArray(n.key));
        if (!tagged.length) return;
        banner('legacy', 'info', `<strong>Dane w starym formacie.</strong> ${tagged.length} przedmiotów ma przypisania archetypów w polu <code>tags</code>
            (poprzednia wersja). Teraz archetypy żyją w <code>character.json</code>. Przenieść je automatycznie?`, [
            { label: 'Przenieś do archetypów', run: el => { migrateLegacy(); el.remove(); } }
        ]);
    }

    function migrateLegacy() {
        const order = [];
        nodes.forEach(n => (n.tags || []).forEach(t => { if (!order.includes(t)) order.push(t); }));
        Object.keys(LEGACY_INFO).reverse().forEach(k => { if (order.includes(k)) { order.splice(order.indexOf(k), 1); order.unshift(k); } });
        let created = 0;
        order.forEach(key => {
            const k = slugify(key).replace(/-/g, '_');
            let a = archetypes.find(x => x.key === k);
            if (!a) {
                const info = LEGACY_INFO[k] || { label: key, tagline: '', daily: '' };
                a = { key: k, label: info.label, tagline: info.tagline, daily: info.daily, subjects: [], core: [] };
                archetypes.push(a);
                created++;
            }
            nodes.forEach(n => {
                const tags = n.tags || [];
                if (!tags.includes(key)) return;
                // Stary format: "key" = lista archetypów, dla których przedmiot jest kluczowy;
                // brak "key" = kluczowy, o ile nie jest wspólny dla wszystkich archetypów.
                const isKey = Array.isArray(n.key) ? n.key.includes(key) : !order.every(t => tags.includes(t));
                setMembership(a, n.id, isKey ? 'core' : 'support');
            });
        });
        nodes.forEach(n => { delete n.tags; delete n.key; });
        markChanged();
        switchTab('arch');
        toast(`Przeniesiono przypisania (${created} nowych archetypów). Sprawdź je i kliknij „Zapisz zmiany".`);
    }

    // =========================================================================
    //  START
    // =========================================================================
    $('#add-node-btn').onclick = addNode;
    $('#add-edge-btn').onclick = addEdge;
    $('#add-arch-btn').onclick = () => addArch();
    $('#backups-btn').onclick = () => openBackups();
    saveBtn.onclick = () => save();

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
        if (e.key === 'Escape' && edgePick && modalEl.hidden) setEdgePick(null);
    });
    $('#logout-link').addEventListener('click', e => {
        if ((dirty || form?.dirty) && !confirm('Masz niezapisane zmiany. Wylogować mimo to?\n(Zmiany zostaną w szkicu w tej przeglądarce.)')) e.preventDefault();
        else { dirty = false; if (form) form.dirty = false; }
    });
    window.addEventListener('beforeunload', e => {
        if (dirty || form?.dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    // Ostrzeżenia startowe
    if (D.semesterCount !== SEM) {
        banner('sem', 'warn', `<strong>Niezgodna liczba semestrów:</strong> config.js ma <code>semesterCount: ${SEM}</code>,
            a config.php <code>SEMESTER_COUNT = ${D.semesterCount}</code>. Ustaw w obu plikach tę samą wartość.`);
    }
    if (D.missing && D.missing.length) {
        banner('missing', 'info', `Brak plików: <code>${D.missing.map(esc).join('</code>, <code>')}</code> - zostaną utworzone przy pierwszym zapisie.`);
    }

    const draft = readDraft();
    if (draft && Array.isArray(draft.nodes)) {
        const draftSig = JSON.stringify({ nodes: draft.nodes, edges: draft.edges, archetypes: draft.archetypes });
        if (draftSig !== savedSig) {
            const when = new Date(draft.at);
            const stale = draft.base !== baseRevision;
            banner('draft', 'warn', `<strong>Znaleziono niezapisane zmiany</strong> z ${when.toLocaleDateString('pl-PL')} ${hhmm(when)}
                (np. po zamknięciu karty lub wygaśnięciu sesji).${stale ? ' Dane na serwerze zmieniły się od tego czasu - po przywróceniu sprawdź wynik przed zapisem.' : ''}`, [
                { label: 'Przywróć zmiany', run: el => {
                    nodes = draft.nodes; edges = draft.edges; archetypes = draft.archetypes; normalizeArchetypes();
                    if (stale) baseRevision = draft.base; // zapis pokaże konflikt i zapyta, co zrobić
                    el.remove(); markChanged(); clearEditor(); if (tab === 'arch') renderArchList(); buildGraph(true);
                    toast('Przywrócono szkic. Sprawdź i kliknij „Zapisz zmiany".');
                } },
                { label: 'Odrzuć', ghost: true, run: el => { dropDraft(); el.remove(); } }
            ]);
        } else {
            dropDraft();
        }
    }

    setStatus(`Wczytano ${hhmm(new Date())}`);
    updateArchCount();
    checkLegacy();
    makeHeaders();
    clearEditor();
    buildGraph(false);
})();
