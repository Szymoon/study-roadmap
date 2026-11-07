<?php
// SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * index.php - publiczna strona mapy
 * PHP robi tylko dwie rzeczy:
 *   - dokleja APP_VERSION do adresów style.css / config.js / script.js,
 *   - przekazuje do script.js folder z danymi (data/) oraz automatyczny znacznik
 *     wersji danych - po zapisie w panelu mapa od razu pokazuje nowe dane.
 */
require_once __DIR__ . '/config.php';
header('Cache-Control: no-cache, must-revalidate'); // sam HTML zawsze świeży
$v  = htmlspecialchars(APP_VERSION, ENT_QUOTES);
$dv = data_version();
?>
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mapa Zależności</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css?v=<?= $v ?>">
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
</head>
<body>

    <div id="sidebar">
        <div class="brand-header">
            <div class="brand-logo-row">
                <div class="uni-logo-mock">UCZELNIA</div>
                <button id="about-btn" class="about-btn" type="button"
                        aria-haspopup="dialog" aria-controls="about-modal"
                        aria-label="Informacje o kierunku" title="Informacje o kierunku">i</button>
            </div>
            <h1>Mapa<br>Zależności</h1>
        </div>

        <div class="filter-section" id="filter-section">
            <label for="roleFilter">Wybierz archetyp zawodowy:</label>
            <div class="select-wrapper">
                <select id="roleFilter">
                    <option value="all">Wszystkie przedmioty</option>
                </select>
            </div>
            <p class="filter-hint">Archetyp to nie gwarantowany zestaw kompetencji, lecz podpowiedź, na czym w praktyce warto się skupić. Wybierz go, aby zobaczyć opis i priorytety na mapie.</p>
        </div>

        <!-- Legenda generowana dynamicznie w script.js -->
        <div class="legend" id="legend-body"></div>

        <div id="details-panel">
            <div class="detail-title">Informacje szczegółowe</div>
            <div class="detail-content" id="info-text"></div>
        </div>

        <!-- Dyskretny link do panelu administracyjnego (usuń, aby ukryć) -->
        <a href="admin/login.php" class="admin-login-link" title="Logowanie dla administratora">
            &#128274; Panel administracyjny
        </a>
    </div>

    <button id="sidebar-toggle" aria-label="Zwiń lub rozwiń panel boczny" title="Zwiń panel">
        <span class="chevron">&#10094;</span>
        <span class="toggle-label">Panel informacji</span>
    </button>

    <div id="network-container">
        <div id="column-headers"></div>
        <div id="mynetwork"></div>
    </div>

    <!-- ===== Okno informacji (przycisk "i") =====
         To okno jest dla studentów TWOJEGO kierunku. Tytuł oraz sekcje
         "O kierunku" i "Jak korzystać z mapy" możesz dowolnie zmieniać, usuwać
         i dopisywać własne (kopiując blok <div class="about-section">).
         Nie usuwaj jedynie zwijanego panelu "O projekcie" na samym dole okna. -->
    <div id="about-modal" class="about-overlay" role="dialog" aria-modal="true"
         aria-labelledby="about-title" aria-hidden="true">
        <div class="about-dialog">
            <button class="about-close" type="button" aria-label="Zamknij">&times;</button>

            <div class="about-kicker">Informacje o kierunku</div>
            <h2 id="about-title" class="about-title">Nazwa kierunku</h2>

            <div class="about-section">
                <div class="about-label">O kierunku</div>
                <p class="about-text">
                    Tu wpisz kilka zdań o swoim kierunku studiów: czego uczy, gdzie znaleźć
                    plan studiów i sylabusy oraz do kogo kierować pytania (np. opiekun roku,
                    samorząd studentów).
                </p>
            </div>

            <div class="about-section">
                <div class="about-label">Jak korzystać z mapy</div>
                <p class="about-text">
                    Mapa pokazuje, jak przedmioty na kierunku studiów budują na sobie nawzajem:
                    które umiejętności z wcześniejszych semestrów są potrzebne w kolejnych.
                    Kliknij przedmiot lub strzałkę, aby zobaczyć szczegóły, a w menu archetypów
                    wybierz ścieżkę zawodową, by zobaczyć, na czym warto się skupić.
                </p>
            </div>

            <!-- =================================================================
                 PANEL "O PROJEKCIE" - PROSIMY GO NIE USUWAĆ ANI NIE UKRYWAĆ.
                 To są "Appropriate Legal Notices" w rozumieniu GNU AGPL v3
                 (sekcja 5d) oraz dodatkowy warunek z sekcji 7b (zob. plik NOTICE w katalogu głównym repozytorium):
                 informacja o autorach, licencjach i link do kodu źródłowego
                 musi pozostać widoczna w każdej kopii i wersji pochodnej
                 (także po dostosowaniu do innego kierunku lub uczelni).
                 Własnych autorów i link do SWOJEGO kodu możesz dopisać obok - nie zamiast.
                 ================================================================= -->
            <div class="about-project">
                <button class="about-project-toggle" type="button" aria-expanded="false" aria-controls="about-project-panel">
                    O projekcie <span class="about-project-chevron" aria-hidden="true">&#9662;</span>
                </button>
                <div class="about-project-panel" id="about-project-panel" hidden>
                    <p>
                        Oryginalny pomysł i implementacja: Ziemowit Dworakowski
                        (zdw@agh.edu.pl), Szymon Dziewic (sdziewic@agh.edu.pl),
                        Katedra Robotyki i Mechatroniki, AGH w Krakowie.
                    </p>
                    <p>
                        Kod aplikacji: <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener license">GNU AGPL v3.0 lub nowsza</a>
                        &middot; <a href="https://github.com/Szymoon/study-roadmap" target="_blank" rel="noopener">kod źródłowy</a>.<br>
                        Treść mapy (przedmioty, połączenia, zależności, mapowania, archetypy):
                        <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pl" target="_blank" rel="noopener license">CC BY-NC-SA 4.0</a>
                        - uznanie autorstwa, użycie niekomercyjne, na tych samych warunkach.
                    </p>
                    <p>
                        &copy; 2026 Ziemowit Dworakowski, Szymon Dziewic.
                    </p>
                </div>
            </div>
        </div>
    </div>

    <script>
        window.DATA_PATH = <?= json_encode(DATA_PATH) ?>;
        window.DATA_VERSION = <?= json_encode($dv) ?>;
    </script>
    <!-- config.js MUSI być wczytany PRZED script.js - zawiera wszystkie kolory, teksty i wymiary mapy. -->
    <script src="config.js?v=<?= $v ?>"></script>
    <script src="script.js?v=<?= $v ?>"></script>
</body>
</html>
