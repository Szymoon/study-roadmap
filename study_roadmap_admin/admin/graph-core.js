/* SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
   SPDX-License-Identifier: AGPL-3.0-or-later */
/* =============================================================================
 *  graph-core.js - WSPÓLNY RDZEŃ MAPY DLA PANELU ADMINISTRACYJNEGO
 *
 *  Kolory, wymiary i teksty bierze z ../config.js (obiekt CONFIG) - tego samego
 *  pliku, z którego korzysta strona publiczna. Dzięki temu mapa w panelu
 *  wygląda identycznie i nic nie trzeba ustawiać w dwóch miejscach.
 *
 *  Logika układu (dwufazowa: ukryta sieć „próbna" → sztywne kolumny) oraz
 *  poziomy archetypu (rdzeń / wsparcie / kontekst) są wierną kopią script.js.
 * ========================================================================== */
(() => {
    'use strict';

    const C   = CONFIG.colors;
    const LAY = CONFIG.layout;
    const CATEGORIES = CONFIG.categories;

    const PROBE_OPTIONS = {
        layout: { hierarchical: { direction: 'LR', levelSeparation: LAY.levelSeparation, nodeSpacing: LAY.nodeSpacing, sortMethod: 'directed' } },
        nodes: { shape: 'box', margin: { top: 14, bottom: 14, left: 24, right: 24 }, font: { size: LAY.nodeFontSize, face: LAY.nodeFontFace } },
        edges: { smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.7 } },
        physics: false
    };

    const NET_OPTIONS = {
        layout: { hierarchical: false, improvedLayout: false },
        nodes: {
            shape: 'box',
            margin: { top: 14, bottom: 14, left: 24, right: 24 },
            font: { size: LAY.nodeFontSize, face: LAY.nodeFontFace, color: '#ffffff' },
            borderWidth: 2,
            borderWidthSelected: 3
        },
        edges: {
            width: 2,
            color: { color: C.edgeBase, highlight: C.edgeHighlight, hover: C.edgeHover },
            arrows: { to: { enabled: true, scaleFactor: 0.7, type: 'arrow' } },
            smooth: { enabled: true, type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.7 }
        },
        physics: false,
        interaction: { hover: true, tooltipDelay: LAY.tooltipDelay }
    };

    // Czekamy na krój Montserrat - inaczej bloczki mierzą się zapasową czcionką.
    const fontsReady = (document.fonts && document.fonts.load)
        ? Promise.all([
            document.fonts.load(`${LAY.nodeFontSize}px ${LAY.nodeFontFace}`),
            document.fonts.load(`700 ${LAY.nodeFontSize}px ${LAY.nodeFontFace}`)
        ]).then(() => document.fonts.ready).catch(() => {})
        : Promise.resolve();

    function styleFor(node) {
        if (node.id === 'ROOT') return C.rootStyle;
        return CATEGORIES[node.category] || C.fallbackStyle;
    }

    // Wygląd węzła wg poziomu: 'normal' | 'core' | 'support' | 'context'
    function nodeVisual(node, tier, extra = {}) {
        const isElective = !!node.electiveBlock;
        const palette = styleFor(node);
        const emphasized = tier === 'core';
        const base = {
            id: node.id,
            label: node.label || node.id || ' ',
            level: node.level,
            shapeProperties: { borderRadius: 8, borderDashes: isElective ? [8, 5] : false },
            borderWidth: (isElective ? 3 : 2) + (emphasized ? 1 : 0),
            ...extra
        };
        if (tier === 'context') {
            return {
                ...base,
                borderWidth: isElective ? 3 : 2,
                color: {
                    background: C.context.bg, border: C.context.border,
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
                background: palette.bg, border: palette.border,
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

    function buildElectiveGroups(nodes) {
        const map = new Map();
        nodes.forEach(n => {
            if (!n.electiveBlock) return;
            const key = `${n.level}|${n.electiveBlock}`;
            if (!map.has(key)) map.set(key, { name: n.electiveBlock, level: n.level, ids: [] });
            map.get(key).ids.push(n.id);
        });
        return [...map.values()];
    }

    function computeManualPositions(orderByLevel, nodeById) {
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
            const totalHeight = (count - 1) * LAY.within + (units.length - 1) * LAY.betweenExtra;
            const x = level * LAY.columnSep;
            let y = -totalHeight / 2;
            units.forEach((u, ui) => {
                u.forEach(id => { positions[id] = { x, y }; y += LAY.within; });
                if (ui < units.length - 1) y += LAY.betweenExtra;
            });
        });
        return positions;
    }

    // FAZA 1 (pomiar) - zwraca Promise z gotowymi współrzędnymi.
    async function layout(nodes, edges) {
        await fontsReady;
        return new Promise(resolve => {
            const nodeById = {};
            nodes.forEach(n => { nodeById[n.id] = n; });
            const validIds = new Set(nodes.map(n => n.id));
            const cleanEdges = edges.filter(e => validIds.has(e.from) && validIds.has(e.to));

            const probe = document.createElement('div');
            probe.style.cssText = 'position:absolute;width:1200px;height:1200px;left:-99999px;top:-99999px;visibility:hidden;';
            document.body.appendChild(probe);

            const measureNet = new vis.Network(probe, {
                nodes: new vis.DataSet(nodes.map(n => ({ id: n.id, label: ' ', level: n.level }))),
                edges: new vis.DataSet(cleanEdges.map((e, i) => ({ id: 'p' + i, from: e.from, to: e.to })))
            }, PROBE_OPTIONS);

            const connectedIds = new Set();
            cleanEdges.forEach(e => { connectedIds.add(e.from); connectedIds.add(e.to); });

            const finish = () => {
                const measured = measureNet.getPositions();
                const orderByLevel = new Map();
                nodes.forEach(n => {
                    if (!orderByLevel.has(n.level)) orderByLevel.set(n.level, []);
                    orderByLevel.get(n.level).push(n.id);
                });
                orderByLevel.forEach(ids => ids.sort((a, b) => {
                    const ca = connectedIds.has(a) ? 0 : 1;
                    const cb = connectedIds.has(b) ? 0 : 1;
                    if (ca !== cb) return ca - cb;
                    return ((measured[a] || {}).y || 0) - ((measured[b] || {}).y || 0);
                }));
                const positions = computeManualPositions(orderByLevel, nodeById);
                measureNet.destroy();
                probe.remove();
                resolve({ positions, electiveGroups: buildElectiveGroups(nodes) });
            };
            if (!nodes.length) { finish(); return; }
            measureNet.once('afterDrawing', finish);
        });
    }

    // ─── Archetypy: rdzeń / wsparcie / kontekst (identycznie jak script.js) ──
    //  archetypes = [{ key, subjects:[...], core:[...] }, ...]
    function computeTiers(nodes, edges, archetypes, key) {
        const nodeById = {};
        nodes.forEach(n => { nodeById[n.id] = n; });

        const all = new Set();
        archetypes.forEach(a => (a.subjects || []).forEach(id => all.add(id)));
        const nonEmpty = archetypes.map(a => a.subjects || []).filter(l => l.length).map(l => new Set(l));
        const universal = new Set();
        if (nonEmpty.length) all.forEach(id => { if (nonEmpty.every(s => s.has(id))) universal.add(id); });

        const arch = archetypes.find(a => a.key === key);
        const tagged = new Set((arch ? arch.subjects || [] : []).filter(id => nodeById[id]));
        const highlighted = new Set(tagged);
        let changed = true;
        while (changed) {
            changed = false;
            edges.forEach(e => {
                if (highlighted.has(e.to) && !highlighted.has(e.from) && all.has(e.from)) {
                    highlighted.add(e.from);
                    changed = true;
                }
            });
        }
        const core = new Set();
        if (arch && Array.isArray(arch.core)) {
            arch.core.forEach(id => { if (tagged.has(id)) core.add(id); });
        } else {
            tagged.forEach(id => {
                const n = nodeById[id];
                if (!universal.has(id) && !(n && n.foundational)) core.add(id);
            });
        }
        return { core, highlighted, universal, tagged };
    }

    // ─── Rysowanie na płótnie ────────────────────────────────────────────────
    function groupBox(network, g, highlighted) {
        let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity, ok = false, anyActive = false;
        g.ids.forEach(id => {
            let bb;
            try { bb = network.getBoundingBox(id); } catch (_) { bb = null; }
            if (!bb) return;
            ok = true;
            if (bb.left < L) L = bb.left;
            if (bb.top < T) T = bb.top;
            if (bb.right > R) R = bb.right;
            if (bb.bottom > B) B = bb.bottom;
            if (!highlighted || highlighted.has(id)) anyActive = true;
        });
        if (!ok) return null;
        return {
            x: L - LAY.boxPadX, y: T - LAY.boxPadTop,
            w: (R - L) + LAY.boxPadX * 2, h: (B - T) + LAY.boxPadTop + LAY.boxPadBottom,
            strong: anyActive
        };
    }

    function drawElectiveBoxes(ctx, network, groups, highlighted) {
        groups.forEach(g => {
            const b = groupBox(network, g, highlighted);
            if (!b) return;
            ctx.save();
            roundRect(ctx, b.x, b.y, b.w, b.h, LAY.boxRadius);
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

    function drawElectiveLabels(ctx, network, groups, highlighted) {
        groups.forEach(g => {
            const b = groupBox(network, g, highlighted);
            if (!b) return;
            const fullLabel = `◇ ${g.name}`;
            const sideInset = 10, pillPadX = 12;
            const available = b.w - sideInset * 2;
            const maxTextW = available - pillPadX * 2;

            let fontSize = 13;
            const setFont = s => { ctx.font = `600 ${s}px Montserrat, sans-serif`; };
            setFont(fontSize);
            while (ctx.measureText(fullLabel).width > maxTextW && fontSize > 10) { fontSize -= 0.5; setFont(fontSize); }

            let label = fullLabel;
            if (ctx.measureText(label).width > maxTextW) {
                const ell = '…';
                while (label.length > 1 && ctx.measureText(label + ell).width > maxTextW) label = label.slice(0, -1);
                label = label.replace(/\s+$/, '') + ell;
            }
            const textW = ctx.measureText(label).width;
            const pillW = Math.min(textW + pillPadX * 2, available);
            const pillH = 24;
            const pillX = b.x + (b.w - pillW) / 2;
            const pillY = b.y + 9;

            ctx.save();
            ctx.shadowColor = C.electiveLabelShadow;
            ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
            roundRect(ctx, pillX, pillY, pillW, pillH, 12);
            ctx.fillStyle = b.strong ? C.electiveAccent : C.electiveLabelWeak;
            ctx.fill();
            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
            ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
            ctx.restore();
        });
    }

    function drawCoreRings(ctx, network, coreIds) {
        if (!coreIds || !coreIds.size) return;
        ctx.save();
        coreIds.forEach(id => {
            let bb;
            try { bb = network.getBoundingBox(id); } catch (_) { bb = null; }
            if (!bb) return;
            const pad = 5;
            const x = bb.left - pad, y = bb.top - pad;
            const w = (bb.right - bb.left) + pad * 2, h = (bb.bottom - bb.top) + pad * 2;
            roundRect(ctx, x, y, w, h, 12);
            ctx.lineWidth = 6; ctx.strokeStyle = C.coreRingGlow; ctx.stroke();
            roundRect(ctx, x, y, w, h, 12);
            ctx.lineWidth = 2.5; ctx.strokeStyle = C.archRing; ctx.stroke();
        });
        ctx.restore();
    }

    window.RoadmapGraphCore = {
        CATEGORIES, NET_OPTIONS,
        styleFor, nodeVisual, roundRect, buildElectiveGroups,
        layout, computeTiers,
        drawElectiveBoxes, drawElectiveLabels, drawCoreRings
    };
})();
