/* SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
   SPDX-License-Identifier: AGPL-3.0-or-later */
document.addEventListener('DOMContentLoaded', () => {
    const networkContainer = document.getElementById('mynetwork');
    const infoText = document.getElementById('info-text');
    const roleFilter = document.getElementById('roleFilter');
    const filterSection = document.getElementById('filter-section');
    const headersContainer = document.getElementById('column-headers');
    const legendBody = document.getElementById('legend-body');

    // Wszystkie kolory, teksty i wymiary siedzą w pliku config.js (obiekt CONFIG).
    // Tutaj tylko przypisujemy je do skrótowych nazw używanych w dalszym kodzie.
    const SEMESTER_COUNT = CONFIG.semesterCount;
    const SEMESTER_FILES = Array.from({ length: SEMESTER_COUNT }, (_, i) => `sem${i + 1}.json`);

    // Wersja z panelem (index.php): pliki danych leżą w folderze data/, a do
    // adresu doklejamy "znacznik wersji danych" liczony z dat modyfikacji plików.
    // Dzięki temu po zapisie w panelu mapa od razu pobiera świeże dane (bez
    // czyszczenia cache). Bez PHP (zwykły index.html) obie wartości są puste
    // i pliki wczytują się z bieżącego folderu - jak w wersji demo.
    const DATA_PATH = window.DATA_PATH || '';
    const DATA_VERSION = window.DATA_VERSION || '';
    const dataUrl = f => `${DATA_PATH}${f}${DATA_VERSION ? `?v=${encodeURIComponent(DATA_VERSION)}` : ''}`;

    const C   = CONFIG.colors;   // skrót do kolorów
    const TXT = CONFIG.texts;    // skrót do tekstów
    const LAY = CONFIG.layout;   // skrót do układu/wymiarów

    // Kategorie dziedzinowe (kolor + legenda) - edytujesz je w config.js.
    const CATEGORIES = CONFIG.categories;
    const ROOT_STYLE     = C.rootStyle;
    const FALLBACK_STYLE = C.fallbackStyle;
    const ELECTIVE_ACCENT = C.electiveAccent;
    const ARCH_RING = C.archRing;

    // =========================================================================
    //  ARCHETYPY ZAWODOWE  -  definicje wczytywane z character.json
    //  Każdy archetyp ma: label (menu), tagline, daily (opis) oraz subjects
    //  (lista ID przedmiotów zgodnych z semX.json). To JEDYNE miejsce edycji -
    //  dopisujesz archetyp i jego przedmioty w character.json (albo w panelu
    //  administracyjnym), a menu oraz mapa aktualizują się same. Przedmioty
    //  z listy = rdzeń archetypu (obwódka), ich prerekwizyty = wsparcie
    //  (pełny kolor), reszta = kontekst.
    // =========================================================================
    //  subjects = przedmioty PRZYPISANE (pełny kolor), core = te z nich, które są
    //  KLUCZOWE (podstawowe, obwódka). Brak "core" (starsze pliki) = kluczowe są
    //  wszystkie przypisane poza wspólnymi dla wszystkich i "foundational".
    let ARCHETYPES = {};          // { key: { label, tagline, daily, subjects:[...], core:[...] } }
    let ARCHETYPE_KEYS = [];      // kolejność kluczy = kolejność w menu
    let allArchetypeSubjects = new Set();  // suma ID ze wszystkich archetypów
    let universalIds = new Set();          // ID wspólne dla wszystkich niepustych archetypów

    // Węzeł "uniwersalny" (wspólny dla wszystkich niepustych archetypów) jest
    // WSPIERAJĄCY, nie rdzeniowy. Pole "foundational": true w semX.json pozwala
    // ręcznie zdegradować dowolny przedmiot do poziomu wspierającego.
    const isUniversalNode = id => universalIds.has(id);

    // Skala nagłówków semestrów podąża za zoomem grafu (jak bloczki).
    const HEADER_MIN_SCALE = LAY.headerMinScale;
    const HEADER_MAX_SCALE = LAY.headerMaxScale;

    let network;
    let nodesDataset;
    let edgesDataset;
    let originalNodes = [];
    let originalEdges = [];
    const nodeById = {};
    let electiveGroups = [];    // [{ name, level, ids: [...] }]
    let highlightedIds = null;  // null = wszystko aktywne; Set = id w zasięgu archetypu (rdzeń+wsparcie)
    let coreIds = new Set();    // id przedmiotów PODSTAWOWYCH aktywnego archetypu (obwódka)
    let activeArchetype = null; // aktualnie wybrany archetyp (null = wszystkie)
    let layoutReady = false;

    // ===== Domyślny ekran informacyjny =====
    const defaultInfoText = TXT.defaultInfo;
    infoText.innerHTML = defaultInfoText;

    // ===== Zwijanie / rozwijanie panelu bocznego =====
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const mobileQuery = window.matchMedia('(max-width: 768px)');
    const isMobile = () => mobileQuery.matches;

    function setSidebar(collapsed) {
        sidebar.classList.toggle('collapsed', collapsed);
        sidebarToggle.classList.toggle('collapsed', collapsed);
        sidebarToggle.title = collapsed ? TXT.sidebar.expand : TXT.sidebar.collapse;
    }

    sidebarToggle.addEventListener('click', () => {
        setSidebar(!sidebar.classList.contains('collapsed'));
    });

    if (isMobile()) setSidebar(true);

    sidebar.addEventListener('transitionend', (e) => {
        if ((e.propertyName === 'margin-left' || e.propertyName === 'transform') && network) {
            network.redraw();
        }
    });

    // ===== Delegacja klików w panelu detali =====
    // Panel przerysowujemy przez innerHTML, więc jeden listener na kontenerze
    // obsługuje powrót z detalu przedmiotu/zależności do opisu archetypu.
    infoText.addEventListener('click', (e) => {
        if (e.target.closest('[data-return-to-card]')) { returnToCard(); return; }
    });

    // ===== Legenda (generowana z CATEGORIES) =====
    function renderLegend() {
        if (!legendBody) return;
        const cats = Object.values(CATEGORIES).map(c => `
            <div class="legend-item">
                <span class="legend-swatch" style="background:${c.bg}; border:2px solid ${c.border};"></span>
                ${c.label}
            </div>`).join('');

        legendBody.innerHTML = `
            <div class="legend-group-title">${TXT.legend.domainsTitle}</div>
            ${cats}
            <div class="legend-group-title">${TXT.legend.typeTitle}</div>
            <div class="legend-item">
                <span class="legend-swatch swatch-solid"></span>
                ${TXT.legend.mandatory}
            </div>
            <div class="legend-item">
                <span class="legend-swatch swatch-dashed"></span>
                ${TXT.legend.elective}
            </div>
            <div class="legend-item legend-note">
                <span class="legend-swatch swatch-block"></span>
                ${TXT.legend.blockNote}
            </div>`;
    }
    renderLegend();

    // ===== Dynamiczne generowanie nagłówków semestrów 1-7 =====
    for (let sem = 1; sem <= SEMESTER_COUNT; sem++) {
        const header = document.createElement('div');
        header.id = `header-sem${sem}`;
        header.className = 'sem-header';
        header.innerHTML = `<span class="dot"></span> ${TXT.semesterHeader} ${sem}`;
        headersContainer.appendChild(header);
    }

    // ===== Styl pojedynczego węzła =====
    function styleFor(node) {
        if (node.id === 'ROOT') return ROOT_STYLE;
        return CATEGORIES[node.category] || FALLBACK_STYLE;
    }

    function buildNodeTooltip(node) {
        const cat = CATEGORIES[node.category];
        const catInfo = cat ? `\n[${TXT.tooltip.domainPrefix} ${cat.label}]` : '';
        const electiveInfo = node.electiveBlock
            ? `\n[${TXT.tooltip.electivePrefix} ${node.electiveBlock}]`
            : '';
        return `${node.label.replace(/\n/g, ' ')}\n\n${node.title}${catInfo}${electiveInfo}`;
    }

    // Poziom wyróżnienia węzła:
    //   'normal'  - brak filtra, pełny kolor
    //   'core'    - PODSTAWOWY (pełny kolor + obwódka + cień)
    //   'support' - WSPIERAJĄCY (pełny kolor)
    //   'context' - KONTEKSTOWY (wygaszony)
    function nodeVisual(node, tier) {
        const isElective = !!node.electiveBlock;
        const palette = styleFor(node);
        const emphasized = tier === 'core';

        const base = {
            ...node,
            title: isMobile() ? undefined : buildNodeTooltip(node),
            shapeProperties: {
                borderRadius: 8,
                borderDashes: isElective ? [8, 5] : false
            },
            borderWidth: (isElective ? 3 : 2) + (emphasized ? 1 : 0)
        };

        if (tier === 'context') {
            return {
                ...base,
                borderWidth: isElective ? 3 : 2,
                color: {
                    background: C.context.bg,
                    border: C.context.border,
                    highlight: { background: C.context.highlightBg, border: C.context.highlightBorder },
                    hover: { background: C.context.hoverBg, border: C.context.hoverBorder }
                },
                font: { color: C.context.font },
                shadow: false
            };
        }

        return {
            ...base,
            color: {
                background: palette.bg,
                border: palette.border,
                highlight: { background: C.nodeHighlightBg, border: C.nodeHighlightBorder },
                hover: { background: C.nodeHoverBg, border: C.nodeHoverBorder }
            },
            font: { color: palette.text },
            shadow: {
                enabled: true,
                color: emphasized ? C.shadowCore : C.shadowNormal,
                size: emphasized ? 18 : 12, x: 0, y: emphasized ? 8 : 6
            }
        };
    }

    const options = {
        layout: {
            hierarchical: {
                direction: 'LR',
                levelSeparation: LAY.levelSeparation,
                nodeSpacing: LAY.nodeSpacing,
                sortMethod: 'directed'
            }
        },
        nodes: {
            shape: 'box',
            margin: { top: 14, bottom: 14, left: 24, right: 24 }, // wewnętrzny odstęp = większy bloczek
            font: { size: LAY.nodeFontSize, face: LAY.nodeFontFace, color: '#ffffff' }, // rozmiar/krój tekstu
            borderWidth: 2,
            borderWidthSelected: 3
        },
        edges: {
            width: 2,
            color: {
                color: C.edgeBase,
                highlight: C.edgeHighlight,
                hover: C.edgeHover
            },
            arrows: {
                to: { enabled: true, scaleFactor: 0.7, type: 'arrow' }
            },
            smooth: {
                enabled: true,
                type: 'cubicBezier',
                forceDirection: 'horizontal',
                roundness: 0.7
            }
        },
        physics: false,
        interaction: {
            hover: !isMobile(),
            tooltipDelay: LAY.tooltipDelay
        }
    };

    // =====================================================================
    //  RAMKI BLOKÓW OBIERALNYCH
    // =====================================================================
    function buildElectiveGroups() {
        const map = new Map();
        originalNodes.forEach(n => {
            if (!n.electiveBlock) return;
            const key = `${n.level}|${n.electiveBlock}`;
            if (!map.has(key)) map.set(key, { name: n.electiveBlock, level: n.level, ids: [] });
            map.get(key).ids.push(n.id);
        });
        electiveGroups = [...map.values()];
    }

    function roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

    // =====================================================================
    //  ARCHETYPY - POZIOMY PRIORYTETU (rdzeń / wsparcie / kontekst)
    // =====================================================================
    function computeArchetypeTiers(role) {
        const arch = ARCHETYPES[role];
        const tagged = new Set((arch && arch.subjects ? arch.subjects : []).filter(id => nodeById[id]));

        // Wsparcie = przedmioty archetypu + ich prerekwizyty wstecz, ograniczone
        // do przedmiotów należących do jakiegokolwiek archetypu (żeby nie zapalać
        // ścieżek spoza mapy zawodowej). Konwencja krawędzi: from = prerekwizyt,
        // to = przedmiot zależny.
        const highlighted = new Set(tagged);
        let changed = true;
        while (changed) {
            changed = false;
            originalEdges.forEach(e => {
                if (highlighted.has(e.to) && !highlighted.has(e.from) && allArchetypeSubjects.has(e.from)) {
                    highlighted.add(e.from);
                    changed = true;
                }
            });
        }

        // Rdzeń = przedmioty KLUCZOWE archetypu (pole "core" w character.json).
        // Starsze pliki bez "core": przypisane, które nie są uniwersalne ani "foundational".
        const core = new Set();
        if (arch && Array.isArray(arch.core)) {
            arch.core.forEach(id => { if (tagged.has(id)) core.add(id); });
        } else {
            tagged.forEach(id => {
                const n = nodeById[id];
                if (!isUniversalNode(id) && !(n && n.foundational)) core.add(id);
            });
        }

        return { core, highlighted };
    }

    function recomputeArchetype(role) {
        const { core, highlighted } = computeArchetypeTiers(role);
        coreIds = core;
        highlightedIds = highlighted;
    }

    // Obwódka priorytetu wokół przedmiotów PODSTAWOWYCH (rdzeń) archetypu.
    function drawCoreRings(ctx) {
        if (!layoutReady) return;
        if (!coreIds || coreIds.size === 0) return;

        const glow = C.coreRingGlow;
        const line = ARCH_RING;

        ctx.save();
        coreIds.forEach(id => {
            const bb = network.getBoundingBox(id);
            if (!bb) return;
            const pad = 5;
            const x = bb.left - pad, y = bb.top - pad;
            const w = (bb.right - bb.left) + pad * 2, h = (bb.bottom - bb.top) + pad * 2;

            roundRect(ctx, x, y, w, h, 12);
            ctx.lineWidth = 6;
            ctx.strokeStyle = glow;
            ctx.stroke();

            roundRect(ctx, x, y, w, h, 12);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = line;
            ctx.stroke();
        });
        ctx.restore();
    }

    // Opis archetypu w panelu detali: rola, "na co dzień" oraz klucz
    // priorytetów mapy (rdzeń / wsparcie / kontekst z licznikami).
    function renderArchetypeInfo(role) {
        const a = ARCHETYPES[role];
        if (!a) { infoText.innerHTML = defaultInfoText; return; }

        const total = originalNodes.length;
        const coreCount = coreIds.size;
        const supportCount = (highlightedIds ? highlightedIds.size : 0) - coreCount;
        const contextCount = total - (highlightedIds ? highlightedIds.size : 0);

        infoText.innerHTML = `
            <div class="fade-in">
                <div class="detail-eyebrow">${TXT.archetype.eyebrow}</div>
                <div class="detail-heading" style="color:${C.brandDark};">${a.label}</div>
                <p class="detail-desc" style="margin-bottom:14px;">${a.tagline || ''}</p>

                <div class="arch-section-title">${TXT.archetype.dailyTitle}</div>
                <p class="detail-desc">${a.daily || ''}</p>

                <div class="arch-key">
                    <div class="arch-key-row">
                        <span class="arch-dot arch-dot-core"></span>
                        <span><strong>${TXT.archetype.coreLabel}</strong> - ${TXT.archetype.coreDesc} · <b>${coreCount}</b></span>
                    </div>
                    <div class="arch-key-row">
                        <span class="arch-dot arch-dot-support"></span>
                        <span><strong>${TXT.archetype.supportLabel}</strong> - ${TXT.archetype.supportDesc} · <b>${supportCount}</b></span>
                    </div>
                    <div class="arch-key-row">
                        <span class="arch-dot arch-dot-context"></span>
                        <span><strong>${TXT.archetype.contextLabel}</strong> - ${TXT.archetype.contextDesc} · <b>${contextCount}</b></span>
                    </div>
                </div>
            </div>`;
    }

    // Geometria ramki bloku: wspólny prostokąt otaczający wszystkie węzły grupy.
    const BOX_PAD_X = LAY.boxPadX, BOX_PAD_TOP = LAY.boxPadTop, BOX_PAD_BOTTOM = LAY.boxPadBottom, BOX_RADIUS = LAY.boxRadius;

    function groupBox(g) {
        let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
        let ok = false, anyActive = false;

        g.ids.forEach(id => {
            const bb = network.getBoundingBox(id);
            if (!bb) return;
            ok = true;
            if (bb.left   < L) L = bb.left;
            if (bb.top    < T) T = bb.top;
            if (bb.right  > R) R = bb.right;
            if (bb.bottom > B) B = bb.bottom;
            if (!highlightedIds || highlightedIds.has(id)) anyActive = true;
        });
        if (!ok) return null;

        return {
            x: L - BOX_PAD_X,
            y: T - BOX_PAD_TOP,
            w: (R - L) + BOX_PAD_X * 2,
            h: (B - T) + BOX_PAD_TOP + BOX_PAD_BOTTOM,
            strong: anyActive
        };
    }

    function drawElectiveBoxes(ctx) {
        if (!layoutReady) return;

        electiveGroups.forEach(g => {
            const b = groupBox(g);
            if (!b) return;

            ctx.save();
            roundRect(ctx, b.x, b.y, b.w, b.h, BOX_RADIUS);
            ctx.fillStyle = b.strong ? C.electiveBoxFillStrong : C.electiveBoxFillWeak;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 7]);
            ctx.strokeStyle = b.strong ? C.electiveBoxStrokeStrong : C.electiveBoxStrokeWeak;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        });
    }

    function drawElectiveLabels(ctx) {
        if (!layoutReady) return;

        electiveGroups.forEach(g => {
            const b = groupBox(g);
            if (!b) return;

            const fullLabel = `◇ ${g.name}`;
            const sideInset = 10;
            const pillPadX = 12;
            const available = b.w - sideInset * 2;
            const maxTextW = available - pillPadX * 2;

            let fontSize = 13;
            const setFont = s => { ctx.font = `600 ${s}px Montserrat, sans-serif`; };
            setFont(fontSize);
            while (ctx.measureText(fullLabel).width > maxTextW && fontSize > 10) {
                fontSize -= 0.5;
                setFont(fontSize);
            }

            let label = fullLabel;
            if (ctx.measureText(label).width > maxTextW) {
                const ell = '…';
                while (label.length > 1 && ctx.measureText(label + ell).width > maxTextW) {
                    label = label.slice(0, -1);
                }
                label = label.replace(/\s+$/, '') + ell;
            }

            const textW = ctx.measureText(label).width;
            const pillW = Math.min(textW + pillPadX * 2, available);
            const pillH = 24;
            const pillX = b.x + (b.w - pillW) / 2;
            const pillY = b.y + 9;

            ctx.save();
            ctx.shadowColor = C.electiveLabelShadow;
            ctx.shadowBlur = 6;
            ctx.shadowOffsetY = 2;
            roundRect(ctx, pillX, pillY, pillW, pillH, 12);
            ctx.fillStyle = b.strong ? ELECTIVE_ACCENT : C.electiveLabelWeak;
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
            ctx.restore();
        });
    }

    // =====================================================================
    //  RĘCZNY UKŁAD KOLUMN (deterministyczny, stały)
    // =====================================================================
    const COLUMN_SEP = LAY.columnSep;
    const WITHIN = LAY.within;
    const BETWEEN_EXTRA = LAY.betweenExtra;

    function computeManualPositions(orderByLevel) {
        const positions = {};

        orderByLevel.forEach((ids, level) => {
            const units = [];
            const groupIndex = {};
            ids.forEach(id => {
                const g = nodeById[id].electiveBlock || null;
                if (g) {
                    const key = level + '|' + g;
                    if (groupIndex[key] === undefined) { groupIndex[key] = units.length; units.push([]); }
                    units[groupIndex[key]].push(id);
                } else {
                    units.push([id]);
                }
            });

            const count = ids.length;
            const totalHeight = (count - 1) * WITHIN + (units.length - 1) * BETWEEN_EXTRA;
            const x = level * COLUMN_SEP;

            let y = -totalHeight / 2;
            units.forEach((u, ui) => {
                u.forEach(id => { positions[id] = { x, y }; y += WITHIN; });
                if (ui < units.length - 1) y += BETWEEN_EXTRA;
            });
        });

        return positions;
    }

    // ===== Zastosowanie definicji archetypów z character.json =====
    function applyCharacterData(data) {
        // Brak pliku / brak zdefiniowanych archetypów -> chowamy cały wybór
        // archetypu (label, menu, podpowiedź), bo nie ma czego wybierać.
        if (!data || !data.archetypes || Object.keys(data.archetypes).length === 0) {
            if (filterSection) filterSection.hidden = true;
            return;
        }
        if (filterSection) filterSection.hidden = false;
        ARCHETYPES = data.archetypes;
        ARCHETYPE_KEYS = Object.keys(ARCHETYPES);

        // Zbiory pomocnicze: suma przedmiotów wszystkich archetypów oraz
        // przedmioty wspólne dla wszystkich NIEPUSTYCH archetypów (uniwersalne).
        allArchetypeSubjects = new Set();
        ARCHETYPE_KEYS.forEach(k => (ARCHETYPES[k].subjects || []).forEach(id => allArchetypeSubjects.add(id)));
        const nonEmpty = ARCHETYPE_KEYS
            .map(k => ARCHETYPES[k].subjects || [])
            .filter(list => list.length);
        universalIds = new Set();
        if (nonEmpty.length) {
            const sets = nonEmpty.map(list => new Set(list));
            allArchetypeSubjects.forEach(id => {
                if (sets.every(s => s.has(id))) universalIds.add(id);
            });
        }

        // Generujemy opcje menu z definicji archetypów (kolejność = kolejność kluczy).
        ARCHETYPE_KEYS.forEach(key => {
            if (roleFilter.querySelector(`option[value="${key}"]`)) return;
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = ARCHETYPES[key].label || key;
            roleFilter.appendChild(opt);
        });
    }

    // ===== Wczytanie 7 plików semestrów + zależności + definicji archetypów =====
    const dataFetches = [...SEMESTER_FILES, 'dependencies.json'].map(f =>
        fetch(dataUrl(f)).then(r => {
            if (!r.ok) throw new Error(`Nie udało się wczytać pliku: ${f}`);
            return r.json();
        })
    );
    // character.json wczytujemy "miękko" - jego brak nie psuje mapy.
    const charFetch = fetch(dataUrl('character.json'))
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);

    // Font Montserrat ładuje się z sieci - dopóki nie jest gotowy, vis-network
    // mierzy etykiety zapasową czcionką i bloczki wychodzą źle (tekst poza ramką).
    // Czekamy na wczytanie używanych krojów, zanim policzymy rozmiary węzłów.
    const fontsReady = (document.fonts && document.fonts.ready)
        ? Promise.all([
            document.fonts.load('20px Montserrat'),
            document.fonts.load('700 20px Montserrat')
        ]).then(() => document.fonts.ready).catch(() => {})
        : Promise.resolve();

    Promise.all([...dataFetches, charFetch])
        .then(results => fontsReady.then(() => results))
        .then(results => {
            const charData = results.pop();
            const depsData = results.pop();
            originalNodes = results.flatMap(semData => semData.nodes);
            originalEdges = depsData.edges;
            originalNodes.forEach(n => { nodeById[n.id] = n; });

            applyCharacterData(charData);
            buildElectiveGroups();

            const edgesWithTooltips = originalEdges.map(edge => ({
                ...edge,
                title: isMobile() ? undefined : `${TXT.tooltip.edgePrereq}\n\n${edge.skill}`
            }));
            edgesDataset = new vis.DataSet(edgesWithTooltips);

            // FAZA 1 - POMIAR (ukryta sieć hierarchiczna do policzenia kolejności pionowej)
            const probe = document.createElement('div');
            probe.style.cssText = 'position:absolute; width:1200px; height:1200px; left:-99999px; top:-99999px; visibility:hidden;';
            document.body.appendChild(probe);

            const measureNodes = new vis.DataSet(originalNodes.map(n => ({ id: n.id, label: ' ', level: n.level })));
            const measureNet = new vis.Network(probe, { nodes: measureNodes, edges: edgesDataset }, options);

            const connectedIds = new Set();
            originalEdges.forEach(e => { connectedIds.add(e.from); connectedIds.add(e.to); });

            measureNet.once('afterDrawing', () => {
                const measured = measureNet.getPositions();

                const orderByLevel = new Map();
                originalNodes.forEach(n => {
                    if (!orderByLevel.has(n.level)) orderByLevel.set(n.level, []);
                    orderByLevel.get(n.level).push(n.id);
                });
                orderByLevel.forEach(ids => ids.sort((a, b) => {
                    const ca = connectedIds.has(a) ? 0 : 1;
                    const cb = connectedIds.has(b) ? 0 : 1;
                    if (ca !== cb) return ca - cb;
                    return measured[a].y - measured[b].y;
                }));

                const manual = computeManualPositions(orderByLevel);

                measureNet.destroy();
                probe.remove();

                buildFinalNetwork(manual);
            });
        })
        .catch(err => {
            infoText.innerHTML = `<div class="fade-in" style="color:${C.brandRed}; font-weight:600;">${TXT.error} ${err.message}</div>`;
            console.error(err);
        });

    // FAZA 2 - SIEĆ DOCELOWA (sztywne współrzędne, układ hierarchiczny wyłączony)
    function buildFinalNetwork(manual) {
        const styledNodes = originalNodes.map(n => {
            const p = manual[n.id] || { x: 0, y: 0 };
            return { ...nodeVisual(n, 'normal'), x: p.x, y: p.y };
        });
        nodesDataset = new vis.DataSet(styledNodes);

        const finalOptions = {
            ...options,
            layout: { hierarchical: false, improvedLayout: false }
        };

        network = new vis.Network(networkContainer, { nodes: nodesDataset, edges: edgesDataset }, finalOptions);
        layoutReady = true;

        network.on('beforeDrawing', drawElectiveBoxes);
        network.on('afterDrawing', drawCoreRings);
        network.on('afterDrawing', drawElectiveLabels);

        network.on('afterDrawing', () => {
            const scale = Math.max(HEADER_MIN_SCALE, Math.min(network.getScale(), HEADER_MAX_SCALE));

            for (let sem = 1; sem <= SEMESTER_COUNT; sem++) {
                const headerEl = document.getElementById(`header-sem${sem}`);
                const nodeIds = nodesDataset.get({ filter: (item) => item.level === sem }).map(n => n.id);

                if (nodeIds.length === 0) {
                    headerEl.style.display = 'none';
                    continue;
                }

                const positions = network.getPositions(nodeIds);
                let sumX = 0, count = 0;
                for (let id in positions) { sumX += positions[id].x; count++; }

                if (count > 0) {
                    const domPos = network.canvasToDOM({ x: sumX / count, y: 0 });
                    headerEl.style.display = 'flex';
                    headerEl.style.left = `${domPos.x}px`;
                    headerEl.style.transform = `translateX(-50%) scale(${scale})`;
                } else {
                    headerEl.style.display = 'none';
                }
            }
        });

        // ===== Panel detali =====
        network.on('click', function (params) {
            if (params.edges.length > 0 && params.nodes.length === 0) {
                renderEdgeDetails(params.edges[0]);
            } else if (params.nodes.length > 0) {
                renderNodeDetails(nodeById[params.nodes[0]]);
            } else {
                // Klik w tło: wróć do opisu archetypu lub ekranu domyślnego.
                if (activeArchetype) renderArchetypeInfo(activeArchetype);
                else infoText.innerHTML = defaultInfoText;
            }

            if (isMobile()) {
                const somethingSelected = params.nodes.length > 0 || params.edges.length > 0;
                setSidebar(!somethingSelected);
            }
        });

        network.once('afterDrawing', () => network.fit());
    }

    // ===== Renderowanie szczegółów węzła =====
    function renderNodeDetails(node) {
        if (!node) return;
        const isRoot = node.id === 'ROOT';
        const cat = CATEGORIES[node.category];
        const headingColor = isRoot ? C.brandDark : (cat ? cat.bg : C.grayText);

        const backBtn = activeArchetype
            ? `<button type="button" class="char-back" data-return-to-card>${TXT.backToArchetype}</button>`
            : '';

        const catChip = cat
            ? `<span class="cat-chip" style="background:${cat.bg}; color:${cat.text}; border:1px solid ${cat.border};">${cat.label}</span>`
            : '';

        let electiveBox = '';
        if (node.electiveBlock) {
            const siblings = originalNodes.filter(n =>
                n.level === node.level && n.electiveBlock === node.electiveBlock);
            const items = siblings.map(s => {
                const current = s.id === node.id;
                return `<li class="${current ? 'current' : ''}">${s.label.replace(/\n/g, ' ')}${current ? ` <span class="tick">${TXT.node.selectedTag}</span>` : ''}</li>`;
            }).join('');
            electiveBox = `
                <div class="elective-box">
                    <div class="elective-box-head">${TXT.node.electiveHeadPrefix} <strong>${node.electiveBlock}</strong> &middot; ${TXT.node.electiveChoose} ${siblings.length}</div>
                    <ul class="elective-siblings">${items}</ul>
                </div>`;
        }

        const syllabus = node.syllabus
            ? `<a class="syllabus-btn" href="${node.syllabus}" target="_blank" rel="noopener noreferrer">${TXT.node.syllabusBtn}</a>`
            : '';

        const skillsList = (node.skills && node.skills.length)
            ? `<div class="skills-title">${TXT.node.skillsTitle}</div>
               <ul class="skills-list">${node.skills.map(s => `<li>${s}</li>`).join('')}</ul>`
            : '';

        infoText.innerHTML = `
            <div class="fade-in">
                ${backBtn}
                <div class="detail-eyebrow">${isRoot ? TXT.node.rootEyebrow : TXT.node.semesterEyebrow + ' ' + node.level}</div>
                <div class="detail-heading" style="color:${headingColor};">${node.label.replace(/\n/g, ' ')}</div>
                ${catChip}
                ${electiveBox}
                <p class="detail-desc">${node.title || ''}</p>
                ${syllabus}
                ${skillsList}
            </div>`;
    }

    // ===== Renderowanie szczegółów krawędzi (zależności) =====
    function renderEdgeDetails(edgeId) {
        const edge = edgesDataset.get(edgeId);
        const origEdge = originalEdges.find(e => e.from === edge.from && e.to === edge.to);
        const fromNode = nodeById[edge.from];
        const toNode = nodeById[edge.to];
        if (!fromNode || !toNode || !origEdge) return;

        const backBtn = activeArchetype
            ? `<button type="button" class="char-back" data-return-to-card>${TXT.backToArchetype}</button>`
            : '';

        infoText.innerHTML = `
            <div class="fade-in">
                ${backBtn}
                <div style="font-size: 0.75rem; color: ${C.brandRed}; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
                    ${TXT.edge.eyebrow}
                </div>
                <div style="font-weight: 700; font-size: 1.05rem; color: ${C.brandDark}; margin-bottom: 20px; border-left: 4px solid ${C.brandGreen}; padding-left: 12px; line-height: 1.5;">
                    ${fromNode.label.replace(/\n/g, ' ')} <br>
                    <span style="color: ${C.brandRed}; font-size: 1.2rem;">&#8627;</span> ${toNode.label.replace(/\n/g, ' ')}
                </div>
                <strong style="color: ${C.brandDark}; font-size: 0.95rem;">${TXT.edge.skillsApplied}</strong><br>
                <span style="color: ${C.grayText}; display: inline-block; margin-top: 8px; line-height: 1.6; font-size: 0.95rem;">${origEdge.skill}</span>
            </div>
        `;
    }

    // =====================================================================
    //  CENTRALNE STYLOWANIE WĘZŁÓW WG STANU
    //  archetyp (rdzeń / wsparcie / kontekst) > wszystko normalne
    // =====================================================================
    function refreshNodeStyles() {
        if (!nodesDataset) return;

        let updated;
        if (activeArchetype && highlightedIds) {
            updated = originalNodes.map(n => {
                let tier;
                if (coreIds.has(n.id))                tier = 'core';
                else if (highlightedIds.has(n.id))    tier = 'support';
                else                                   tier = 'context';
                return nodeVisual(n, tier);
            });
        } else {
            updated = originalNodes.map(n => nodeVisual(n, 'normal'));
        }

        nodesDataset.update(updated);
    }

    // ===== Powrót z detalu przedmiotu/zależności do opisu archetypu =====
    function returnToCard() {
        if (activeArchetype) renderArchetypeInfo(activeArchetype);
        else infoText.innerHTML = defaultInfoText;
    }

    // ===== Wybór z menu: archetyp / wszystkie =====
    roleFilter.addEventListener('change', (e) => applyArchetype(e.target.value));

    function applyArchetype(role) {
        // -- Reset do widoku "wszystkie przedmioty" --
        if (role === 'all' || !ARCHETYPES[role]) {
            activeArchetype = null;
            highlightedIds = null;
            coreIds = new Set();

            refreshNodeStyles();
            infoText.innerHTML = defaultInfoText;
            if (network) network.redraw();
            return;
        }

        // -- Archetyp: kolory mapy wynikają z listy subjects w character.json
        // (rdzeń) oraz ich prerekwizytów wstecz (wsparcie). --
        activeArchetype = role;
        recomputeArchetype(role);

        refreshNodeStyles();
        renderArchetypeInfo(role);

        if (isMobile()) setSidebar(false);
        if (network) network.redraw();
    }
});
/* =====================================================================
   OKNO "O PROJEKCIE" - otwieranie / zamykanie
   Samodzielny blok, niezależny od głównej logiki mapy.
   ===================================================================== */
(function () {
    const openBtn  = document.getElementById('about-btn');
    const overlay  = document.getElementById('about-modal');
    if (!openBtn || !overlay) return;

    const closeBtn = overlay.querySelector('.about-close');
    let lastFocused = null;

    function openModal() {
        lastFocused = document.activeElement;
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        (closeBtn || overlay).focus();
        document.addEventListener('keydown', onKey);
    }

    function closeModal() {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', onKey);
        if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    function onKey(e) {
        if (e.key === 'Escape') closeModal();
    }

    openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // Zwijany panel "O projekcie" (autorzy, licencje, link do kodu)
    const projectBtn = overlay.querySelector('.about-project-toggle');
    const projectPanel = overlay.querySelector('#about-project-panel');
    if (projectBtn && projectPanel) {
        projectBtn.addEventListener('click', function () {
            const expanded = projectBtn.getAttribute('aria-expanded') === 'true';
            projectBtn.setAttribute('aria-expanded', String(!expanded));
            projectPanel.hidden = expanded;
            if (!expanded) projectPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }

    // Klik w tło (poza kartą) zamyka okno
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
    });
})();
