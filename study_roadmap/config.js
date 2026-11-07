/* SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
   SPDX-License-Identifier: AGPL-3.0-or-later */
/* =============================================================================
   config.js  -  CENTRALNY PLIK USTAWIEŃ MAPY
   -----------------------------------------------------------------------------
   To JEDYNE miejsce, w którym zmieniasz KOLORY, TEKSTY i wymiary (układ) mapy.
   NIE musisz nigdy otwierać pliku script.js.

   Jak korzystać:
     • Kolory podajesz w formacie HEX  (np. '#2563EB')
       lub RGBA z przezroczystością    (np. 'rgba(37, 99, 235, 0.28)').
     • Teksty to zwykłe napisy w cudzysłowach. Możesz używać polskich znaków.
     • W tekstach można używać encji HTML (np. &#8592; = strzałka ←,
       &#9670; = romb ◇, &middot; = kropka ·) oraz prostych znaczników HTML.
     • Po każdej wartości (poza ostatnią w nawisie) MUSI być przecinek.
     • Nie zmieniaj nazw pól po lewej stronie dwukropka (np. bg:, label:) -
       zmieniaj tylko wartości po prawej stronie.

   Plik jest wczytywany PRZED script.js (patrz index.html), więc wszystkie
   ustawienia są od razu dostępne dla mapy.
   ========================================================================== */

const CONFIG = {

    // =========================================================================
    //  LICZBA SEMESTRÓW
    //  Ile plików semX.json ma zostać wczytanych (sem1.json ... semN.json).
    // =========================================================================
    semesterCount: 7,

    // =========================================================================
    //  KATEGORIE DZIEDZINOWE  (kod kolorystyczny bloczków + legenda)
    //  ---------------------------------------------------------------------
    //  Kolejność wpisów = kolejność w legendzie na stronie.
    //  Każda kategoria ma:
    //    label  - nazwa widoczna w legendzie i w dymku (tooltip)
    //    bg     - kolor wypełnienia bloczka
    //    border - kolor ramki bloczka
    //    text   - kolor napisu na bloczku
    //  Klucz (np. "miekkie") musi zgadzać się z polem "category" w plikach
    //  semX.json. Aby dodać nową dziedzinę - dopisz tu kolejny wpis i użyj
    //  jego klucza w semX.json. Aby przenieść przedmiot do innej dziedziny -
    //  zmień pole "category" w semX.json (tutaj nic nie trzeba ruszać).
    // =========================================================================
    categories: {
        miekkie:  { label: 'Przedmioty miękkie i biznesowe', bg: '#F2B705', border: '#B0850A', text: '#FFFFFF' },
        podstawy: { label: 'Podstawowa edukacja techniczna', bg: '#1C7ED6', border: '#1256A0', text: '#FFFFFF' },
        jezyki:   { label: 'WF i języki obce',               bg: '#E64980', border: '#C2255C', text: '#FFFFFF' },
        dyplom:   { label: 'Dyplom i praktyka zawodowa',     bg: '#1098AD', border: '#0B7285', text: '#FFFFFF' }
    },

    // =========================================================================
    //  KOLORY  (wszystko, czego NIE ma w style.css)
    //  Uwaga: kolory ogólne strony (panel, tło, nagłówki) są w pliku style.css.
    //  Tutaj są kolory rysowane bezpośrednio na mapie (bloczki, strzałki, ramki).
    // =========================================================================
    colors: {

        // --- Kolory akcentu używane w wielu miejscach naraz -------------------
        brandRed:   '#2563EB',   // niebieski akcent - obwódki priorytetu, akcenty, podświetlenia
        brandGreen: '#1E293B',   // grafit - najazd myszką na strzałki, akcenty zależności
        brandDark:  '#1E293B',   // grafit - tło korzenia, nagłówki, ciemny tekst
        grayText:   '#475569',   // szary tekst opisów szczegółowych

        // --- Węzeł startowy (korzeń całej mapy) -------------------------------
        rootStyle:     { bg: '#1E293B', border: '#0F172A', text: '#FFFFFF' },
        // --- Kolor awaryjny, gdy przedmiot ma nieznaną kategorię --------------
        fallbackStyle: { bg: '#64748b', border: '#475569', text: '#FFFFFF' },

        electiveAccent: '#1D4ED8', // granat - kolor "plakietki" bloku obieralnego
        archRing:       '#2563EB', // niebieski akcent - obwódka rdzenia archetypu

        // --- Węzeł "kontekstowy" (wygaszony po wybraniu archetypu) ------------
        context: {
            bg:              '#f1f5f9',
            border:          '#e2e8f0',
            highlightBg:     '#cbd5e1',
            highlightBorder: '#94a3b8',
            hoverBg:         '#e2e8f0',
            hoverBorder:     '#cbd5e1',
            font:            '#94a3b8'   // kolor napisu na wygaszonym bloczku
        },

        // --- Aktywny bloczek: kolory po kliknięciu / najechaniu myszką --------
        nodeHighlightBg:     '#1E293B',
        nodeHighlightBorder: '#2563EB',
        nodeHoverBg:         '#2563EB',
        nodeHoverBorder:     '#2563EB',

        // --- Cienie pod bloczkami --------------------------------------------
        shadowCore:   'rgba(37, 99, 235, 0.28)',  // cień pod bloczkiem rdzeniowym (wyróżnionym)
        shadowNormal: 'rgba(30, 41, 59, 0.18)',   // cień pod zwykłym bloczkiem
        coreRingGlow: 'rgba(37, 99, 235, 0.16)',  // poświata wokół obwódki rdzenia

        // --- Strzałki zależności (krawędzie) ---------------------------------
        edgeBase:      '#cbd5e1',  // domyślny kolor strzałki
        edgeHighlight: '#2563EB',  // strzałka po kliknięciu
        edgeHover:     '#1E293B',  // strzałka po najechaniu myszką

        // --- Ramki bloków obieralnych (prostokąt wokół grupy) ----------------
        //  ...Strong = gdy blok jest aktywny (podświetlony przez archetyp)
        //  ...Weak   = gdy blok jest wygaszony
        electiveBoxFillStrong:   'rgba(29, 78, 216, 0.055)', // wypełnienie ramki (aktywna)
        electiveBoxFillWeak:     'rgba(148, 163, 184, 0.05)',// wypełnienie ramki (wygaszona)
        electiveBoxStrokeStrong: 'rgba(29, 78, 216, 0.55)',  // linia ramki (aktywna)
        electiveBoxStrokeWeak:   'rgba(148, 163, 184, 0.5)', // linia ramki (wygaszona)
        electiveLabelWeak:       '#94a3b8',                  // plakietka bloku (wygaszona)
        electiveLabelShadow:     'rgba(30, 41, 59, 0.22)'    // cień pod plakietką bloku
    },

    // =========================================================================
    //  UKŁAD / WYMIARY  (rozmieszczenie i wielkości elementów mapy)
    //  Wartości liczbowe w pikselach, chyba że napisano inaczej.
    //  Zmieniaj ostrożnie - wpływają na to, jak "rozłożona" jest cała mapa.
    // =========================================================================
    layout: {
        headerMinScale:  0.80,  // najmniejsza skala nagłówków semestrów przy oddalaniu mapy
        headerMaxScale:  2.00,  // największa skala nagłówków semestrów przy przybliżaniu

        columnSep:       400,   // odległość pozioma między kolumnami (semestrami)
        within:          102,   // pionowy odstęp między bloczkami w tej samej kolumnie
        betweenExtra:    54,    // dodatkowy pionowy odstęp między grupami obieralnymi

        boxPadX:         18,    // margines boczny ramki bloku obieralnego
        boxPadTop:       40,    // margines górny ramki (miejsce na plakietkę)
        boxPadBottom:    16,    // margines dolny ramki
        boxRadius:       16,    // zaokrąglenie narożników ramki bloku

        levelSeparation: 400,   // odległość poziomów w fazie pomiaru (techniczne)
        nodeSpacing:     120,   // odstęp między węzłami w fazie pomiaru (techniczne)

        nodeFontSize:    20,    // rozmiar napisu na bloczku
        nodeFontFace:    'Montserrat', // krój napisu na bloczku
        tooltipDelay:    150    // opóźnienie dymka (ms) po najechaniu myszką
    },

    // =========================================================================
    //  TEKSTY  (wszystkie napisy pojawiające się na mapie i w panelu)
    //  Napisy widoczne dla użytkownika. Możesz je dowolnie zmieniać.
    //  Uwaga: w niektórych miejscach doklejana jest liczba lub nazwa - opisano
    //  to w komentarzu przy danym polu.
    // =========================================================================
    texts: {

        // --- Ekran domyślny panelu szczegółów (pełny HTML) -------------------
        //  Wyświetla się, zanim użytkownik cokolwiek kliknie.
        defaultInfo: `
        <div class="fade-in placeholder-anim">
            <div class="pulse-circle"></div>
            <span>Kliknij przedmiot lub strzałkę zależności, aby zobaczyć szczegóły,
            umiejętności z sylabusa oraz link do dokumentu PDF. Kolor bloczka oznacza
            dziedzinę (patrz legenda powyżej), a wspólna przerywana ramka to blok
            obieralny, z którego wybierasz jeden przedmiot.</span>
        </div>
    `,

        // --- Przycisk zwijania/rozwijania panelu bocznego --------------------
        sidebar: {
            expand:   'Rozwiń panel', // gdy panel jest zwinięty
            collapse: 'Zwiń panel'    // gdy panel jest rozwinięty
        },

        // --- Legenda (tytuły grup i opisy pod spodem) ------------------------
        legend: {
            domainsTitle: 'Dziedziny (kolor bloczka)',
            typeTitle:    'Rodzaj przedmiotu',
            mandatory:    'Obowiązkowy (ciągła ramka)',
            elective:     'Obieralny (przerywana ramka)',
            blockNote:    'Wspólna ramka = blok obieralny (wybierasz 1 przedmiot)'
        },

        // --- Nagłówki kolumn ("Semestr 1", "Semestr 2", ...) -----------------
        //  Do tego napisu doklejany jest numer semestru.
        semesterHeader: 'Semestr',

        // --- Dymki (tooltip) po najechaniu myszką ----------------------------
        tooltip: {
            domainPrefix:   'Dziedzina:',          // dymek bloczka: [Dziedzina: <nazwa>]
            electivePrefix: 'Obieralny - blok:',   // dymek bloczka: [Obieralny - blok: <nazwa>]
            edgePrereq:     'Wymagane umiejętności:' // dymek strzałki (nad listą umiejętności)
        },

        // --- Wspólny przycisk powrotu (w szczegółach przedmiotu i zależności) -
        backToArchetype: '&#8592; Wróć do opisu archetypu',

        // --- Panel opisu ARCHETYPU -------------------------------------------
        archetype: {
            eyebrow:      'Archetyp zawodowy', // mała etykieta nad nazwą archetypu
            dailyTitle:   'Na co dzień',       // tytuł sekcji z opisem "daily"
            coreLabel:    'Podstawowe',
            coreDesc:     'kluczowe dla archetypu (niebieska obwódka)',
            supportLabel: 'Wspierające',
            supportDesc:  'fundament i wymagania wstępne (pełny kolor)',
            contextLabel: 'Kontekstowe',
            contextDesc:  'pozostałe przedmioty (wygaszone)'
        },

        // --- Panel szczegółów PRZEDMIOTU -------------------------------------
        node: {
            rootEyebrow:        'Kierunek studiów', // etykieta dla węzła startowego
            semesterEyebrow:    'Semestr',          // dla przedmiotu: "Semestr <numer>"
            electiveHeadPrefix: '&#9670; Blok obieralny:', // nagłówek listy bloku obieralnego
            electiveChoose:     'wybierz 1 z',      // doklejana liczba: "wybierz 1 z <N>"
            selectedTag:        '&#8592; wybrany',  // znacznik przy aktualnie wybranym przedmiocie
            syllabusBtn:        '&#128196; Otwórz sylabus (PDF)',
            skillsTitle:        'Umiejętności z sylabusa'
        },

        // --- Panel szczegółów ZALEŻNOŚCI (strzałki) --------------------------
        edge: {
            eyebrow:       'Zależność Wiedzy',
            skillsApplied: 'Umiejętności aplikowane:'
        },

        // --- Komunikat błędu wczytywania danych ------------------------------
        //  Do tego napisu doklejany jest opis błędu technicznego.
        error: 'Błąd wczytywania danych:'
    }
};
