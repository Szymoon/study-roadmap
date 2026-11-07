<?php
// SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * admin.php - panel administracyjny (tylko dla zalogowanych).
 * Układ: pełna MAPA po prawej + PANEL EDYCJI po lewej (dwie zakładki:
 * „Przedmioty i zależności" oraz „Archetypy").
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/storage.php';

$raw = read_all_raw();
$data = load_dataset($raw);

$payload = [
    'nodes'          => $data['nodes'],
    'edges'          => $data['edges'],
    'archetypes'     => $data['archetypes'],
    'missing'        => $data['missing'],
    'revision'       => data_revision($raw),
    'semesterCount'  => SEMESTER_COUNT,
    'csrf'           => csrf_token(),
    'version'        => APP_VERSION,
];

$v = htmlspecialchars(APP_VERSION, ENT_QUOTES);
header('Cache-Control: no-store');
?>
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel administracyjny - Mapa Zależności</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="admin.css?v=<?= $v ?>">
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
</head>
<body class="admin-body">

    <header class="admin-topbar">
        <div class="admin-topbar-left">
            <div class="uni-logo-mock">UCZELNIA</div>
            <div>
                <div class="admin-title">Panel administracyjny</div>
                <div class="admin-subtitle">Mapa Zależności</div>
            </div>
        </div>
        <div class="admin-topbar-right">
            <span id="save-status" class="save-status"></span>
            <span id="dirty-badge" class="dirty-badge" hidden>Niezapisane zmiany</span>
            <button id="save-btn" class="btn btn-save" title="Zapisz zmiany na serwerze (Ctrl+S)">Zapisz zmiany</button>
            <button id="backups-btn" class="btn btn-ghost" type="button">Kopie zapasowe</button>
            <a class="btn btn-ghost" href="../index.php" target="_blank" rel="noopener">Podgląd mapy</a>
            <a class="btn btn-logout" id="logout-link" href="logout.php">Wyloguj</a>
        </div>
    </header>

    <div id="banners" class="banners"></div>
    <div id="toast" class="toast" hidden></div>

    <main class="admin-layout">
        <!-- LEWA: panel edycji -->
        <aside class="admin-editor-panel">
            <nav class="editor-tabs" role="tablist">
                <button type="button" class="editor-tab active" data-tab="graph" role="tab">Przedmioty</button>
                <button type="button" class="editor-tab" data-tab="arch" role="tab">Archetypy <span class="tab-count" id="arch-count"></span></button>
            </nav>
            <div class="editor-add-row" id="graph-actions">
                <button class="btn btn-add" id="add-node-btn" type="button">+ Przedmiot</button>
                <button class="btn btn-add btn-add-edge" id="add-edge-btn" type="button">+ Zależność</button>
            </div>
            <div class="editor-add-row" id="arch-actions" hidden>
                <button class="btn btn-add" id="add-arch-btn" type="button">+ Nowy archetyp</button>
            </div>
            <div id="editor" class="editor-scroll"></div>
        </aside>

        <!-- PRAWA: mapa -->
        <section class="admin-graph">
            <div id="column-headers"></div>
            <div id="mynetwork"></div>
            <div id="map-hint" class="map-hint" hidden></div>
        </section>
    </main>

    <!-- Okno modalne (kopie zapasowe, ponowne logowanie, konflikt zapisu) -->
    <div id="modal" class="modal-overlay" hidden>
        <div class="modal-card" role="dialog" aria-modal="true">
            <button type="button" class="modal-close" aria-label="Zamknij">&times;</button>
            <div id="modal-body"></div>
        </div>
    </div>

    <script>
        window.ADMIN_DATA = <?= json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;
    </script>
    <script src="../config.js?v=<?= $v ?>"></script>
    <script src="graph-core.js?v=<?= $v ?>"></script>
    <script src="admin.js?v=<?= $v ?>"></script>
</body>
</html>
