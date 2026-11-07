# study-roadmap - Mapa Zależności przedmiotów

Interaktywna mapa, która pokazuje studentom, **jak przedmioty na kierunku studiów budują na sobie nawzajem**:
które umiejętności z wcześniejszych semestrów są potrzebne w kolejnych. Każdy przedmiot to bloczek w kolumnie
swojego semestru, a strzałki to zależności wiedzy. Po kliknięciu przedmiotu lub strzałki w panelu bocznym pojawiają się
szczegóły (opis, umiejętności z sylabusa, link do PDF). Menu **archetypów zawodowych** (np. „Programista”, „Konstruktor”)
podświetla przedmioty, na których warto się skupić na danej ścieżce kariery.

Repozytorium zawiera **dwie wersje tej samej mapy**. Wyglądają tak samo i korzystają z tych samych plików danych:

| Folder | Co to jest | Czego potrzebuje | Jak edytujesz dane |
|---|---|---|---|
| [`study_roadmap/`](study_roadmap/) | **Wersja statyczna**: czyste HTML + JS + JSON | dowolny serwer plików (także GitHub Pages) | ręcznie, w plikach `.json` |
| [`study_roadmap_admin/`](study_roadmap_admin/) | **Wersja z panelem administracyjnym**: ta sama mapa + panel do edycji w przeglądarce | serwer z **PHP 8.1+** (np. Apache) | w panelu (zalogowanym) albo ręcznie w `data/*.json` |

> Autorzy: Ziemowit Dworakowski (zdw@agh.edu.pl), Szymon Dziewic (sdziewic@agh.edu.pl),
> Katedra Robotyki i Mechatroniki, AGH w Krakowie. Licencja: kod **AGPL-3.0-or-later**, dane **CC BY-NC-SA 4.0**
> (szczegóły w sekcji [Licencja](#licencja)).

---

## Spis treści

1. [Struktura repozytorium](#struktura-repozytorium)
2. [Szybki start](#szybki-start)
3. [Dostosowanie mapy do swojego kierunku: lista kontrolna](#dostosowanie-mapy-do-swojego-kierunku-lista-kontrolna)
4. [Pliki danych (JSON)](#pliki-danych-json)
5. [Wygląd i teksty: `config.js`, `style.css`, okno „i”](#wygląd-i-teksty-configjs-stylecss-okno-i)
6. [Panel administracyjny](#panel-administracyjny)
7. [Zmiana hasła do panelu](#zmiana-hasła-do-panelu)
8. [Zmiana liczby semestrów](#zmiana-liczby-semestrów)
9. [Przenoszenie danych między wersjami](#przenoszenie-danych-między-wersjami)
10. [Wdrożenie na serwer i cache](#wdrożenie-na-serwer-i-cache)
11. [Licencja](#licencja)
12. [Jak cytować](#jak-cytować)

---

## Struktura repozytorium

```
.
├── README.md              ← ten plik (opis obu wersji)
├── LICENSE                ← pełny tekst GNU AGPL v3 (licencja kodu)
├── LICENSES/              ← pełne teksty obu licencji (AGPL-3.0, CC BY-NC-SA 4.0)
├── NOTICE                 ← autorzy, podział licencji, dodatkowe warunki (sekcja 7 AGPL)
├── REUSE.toml             ← przypisanie licencji do plików (standard REUSE)
├── CITATION.cff           ← dane do cytowania (przycisk „Cite this repository”)
│
├── study_roadmap/         ← WERSJA STATYCZNA
│   ├── index.html         ← strona mapy (tu jest też treść okna „i”)
│   ├── config.js          ← kolory, teksty, wymiary, liczba semestrów, dziedziny
│   ├── script.js          ← logika mapy (zwykle nie trzeba ruszać)
│   ├── style.css          ← wygląd strony (panel boczny, tło, okno „i”)
│   ├── sem1.json … sem7.json, dependencies.json, character.json   ← DANE
│   └── .htaccess          ← (Apache) wyłącza „zapamiętywanie” starych plików
│
└── study_roadmap_admin/   ← WERSJA Z PANELEM
    ├── index.php          ← strona mapy (odpowiednik index.html)
    ├── config.php         ← HASŁO, wersja, liczba semestrów, kopie zapasowe
    ├── config.js, script.js, style.css   ← jak w wersji statycznej
    ├── data/              ← DANE (te same pliki co wyżej) + data/backups/ (kopie)
    ├── admin/             ← panel: login.php, admin.php, api/…
    └── tools/hash.php     ← jednorazowe narzędzie do wygenerowania hasha hasła
```

Pliki `script.js` w obu folderach są **identyczne**. Ten sam skrypt działa w obu trybach: bez PHP czyta JSON-y
z bieżącego folderu, a z PHP z folderu `data/`. `config.js` różni się tylko komentarzami.

---

## Szybki start

### Wersja statyczna (`study_roadmap/`)

Mapa wczytuje pliki JSON przez `fetch`, więc **nie zadziała po dwukliku w `index.html`** (`file://`).
Potrzebny jest dowolny serwer HTTP:

```bash
cd study_roadmap
python -m http.server 8000        # albo: php -S localhost:8000
# otwórz http://localhost:8000
```

Na produkcji wystarczy wgrać zawartość folderu na dowolny hosting plików (serwer uczelni, GitHub Pages, Netlify…).

### Wersja z panelem (`study_roadmap_admin/`)

Wymagania: **PHP 8.1 lub nowszy**. Zalecany jest Apache z obsługą `.htaccess` (patrz [Wdrożenie](#wdrożenie-na-serwer-i-cache)).

```bash
cd study_roadmap_admin
php -S localhost:8000
# mapa:  http://localhost:8000/index.php
# panel: http://localhost:8000/admin/login.php
```

> ⚠️ **Domyślne hasło do panelu to `password11!!` i jest publicznie znane (jest w tym repozytorium).**
> Przed wystawieniem panelu w internecie **koniecznie je zmień**: [Zmiana hasła do panelu](#zmiana-hasła-do-panelu).

Serwer WWW musi mieć **prawo zapisu** do folderów `data/` i `data/backups/` (np. właściciel `www-data`
albo `chmod 775`). Bez tego panel wyświetli błąd przy zapisie.

---

## Dostosowanie mapy do swojego kierunku: lista kontrolna

| # | Co | Gdzie (statyczna) | Gdzie (z panelem) |
|---|---|---|---|
| 1 | Przedmioty, opisy, umiejętności, linki do sylabusów | `sem1.json` … `semN.json` | panel → zakładka **Przedmioty** (lub `data/semX.json`) |
| 2 | Zależności (strzałki) i opisy wymaganych umiejętności | `dependencies.json` | panel → **+ Zależność** / kliknięcie strzałki |
| 3 | Archetypy zawodowe i ich przedmioty | `character.json` | panel → zakładka **Archetypy** |
| 4 | Nazwa węzła startowego (kierunku) | `sem1.json`, przedmiot o `id: "ROOT"` | panel → kliknij bloczek startowy |
| 5 | Liczba semestrów | `config.js` → `semesterCount` | `config.js` **i** `config.php` → patrz [Zmiana liczby semestrów](#zmiana-liczby-semestrów) |
| 6 | Dziedziny (kolory bloczków + legenda) | `config.js` → `categories` | `config.js` → `categories` (panel ich nie edytuje) |
| 7 | Kolory mapy, teksty interfejsu, odstępy | `config.js` | `config.js` |
| 8 | Treść okna **„i”** (informacje o kierunku) | `index.html` | `index.php` |
| 9 | Napis/logo „UCZELNIA” w lewym górnym rogu | `index.html` (`<div class="uni-logo-mock">`) | `index.php`, `admin/admin.php`, `admin/login.php` |
| 10 | Tytuł karty przeglądarki | `<title>` w `index.html` | `<title>` w `index.php` |
| 11 | Hasło do panelu | - | `config.php` → `ADMIN_PASSWORD_HASH` |
| 12 | Link „kod źródłowy” w panelu „O projekcie” | `index.html` | `index.php` |

**Nie usuwaj** zwijanego panelu **„O projekcie”** na dole okna „i” (autorzy, licencje, link do kodu).
To warunek licencji, patrz [Licencja](#licencja). Jeśli zmieniasz kod, w tym panelu podmień link „kod źródłowy”
na adres **swojej** wersji. Własnych autorów możesz dopisać obok.

---

## Pliki danych (JSON)

W wersji statycznej dane leżą bezpośrednio w `study_roadmap/`, a w wersji z panelem w `study_roadmap_admin/data/`.
Format jest w obu wersjach **identyczny**.

Ogólne zasady przy ręcznej edycji:
- pliki muszą być poprawnym JSON-em: cudzysłowy `"…"`, przecinki między elementami, **bez przecinka po ostatnim**
  (w razie wątpliwości sprawdź plik w walidatorze, np. jsonlint.com);
- kodowanie **UTF-8** (polskie znaki działają normalnie);
- nową linię w tekście zapisujesz jako `\n`.

### `semX.json`: przedmioty

Każdy plik semestru ma postać `{ "nodes": [ …przedmioty… ] }`. Przykład:

```json
{
  "nodes": [
    {
      "id": "MAT1",
      "label": "Analiza\nmatematyczna 1",
      "level": 1,
      "category": "podstawy",
      "title": "Granice, pochodne i całki funkcji jednej zmiennej.",
      "syllabus": "https://example.edu/sylabusy/mat1.pdf",
      "skills": [
        "Obliczanie pochodnych i całek.",
        "Badanie przebiegu zmienności funkcji."
      ]
    }
  ]
}
```

| Pole | Wymagane | Opis |
|---|---|---|
| `id` | ✅ | Unikalny kod przedmiotu: litery, cyfry, `_` i `-`, maks. 40 znaków. Na niego wskazują zależności i archetypy. |
| `label` | ✅ | Napis na bloczku. `\n` łamie linię (krótkie, 2-linijkowe etykiety wyglądają najlepiej). |
| `level` | ✅ | Numer semestru (kolumna): `1` … `N`. **To pole decyduje o kolumnie**, a nie nazwa pliku. Poziom `0` ma tylko węzeł `ROOT`. |
| `category` | zalecane | Klucz dziedziny z `config.js` → `categories` (np. `"podstawy"`). Decyduje o kolorze bloczka. Nieznany klucz = kolor awaryjny (szary). |
| `title` | zalecane | Opis przedmiotu, widoczny w dymku i w panelu szczegółów. |
| `syllabus` | - | Link do sylabusa (PDF). Bez tego pola przycisk „Otwórz sylabus” się nie pokazuje. Wartość `"#"` w danych przykładowych to tylko placeholder. |
| `skills` | - | Lista umiejętności z sylabusa (tablica napisów). |
| `electiveBlock` | - | Nazwa bloku obieralnego. Przedmioty **z tego samego semestru** z tą samą nazwą rysują się we wspólnej przerywanej ramce („wybierz 1 z N”). |
| `foundational` | - | `true` oznacza, że przedmiot nigdy nie jest „kluczowy” w archetypie (działa tylko dla archetypów bez pola `core`, patrz niżej). Panel nie edytuje tego pola, ale go zachowuje. |

**Węzeł startowy `ROOT`.** W `sem1.json` musi być przedmiot o `"id": "ROOT"` i `"level": 0`. To ciemny bloczek
z nazwą kierunku po lewej stronie mapy. Zmieniaj jego `label` i `title`, ale **nie zmieniaj `id`**, bo od niego zależy
wygląd węzła (panel blokuje zmianę tego ID).

W wersji z panelem plik docelowy wynika z `level` (przedmiot z `level: 3` zapisuje się w `sem3.json`), a `ROOT`
trafia do `sem1.json`. W wersji statycznej dobrze trzymać się tej samej zasady.

### `dependencies.json`: zależności (strzałki)

```json
{
  "edges": [
    { "from": "ROOT", "to": "MAT1", "skill": "Przedmiot obowiązkowy w 1. semestrze." },
    { "from": "MAT1", "to": "MAT2", "skill": "Rachunek różniczkowy funkcji jednej zmiennej." }
  ]
}
```

| Pole | Opis |
|---|---|
| `from` | ID przedmiotu **wymaganego wcześniej** (prerekwizyt). |
| `to` | ID przedmiotu, który z niego **korzysta**. |
| `skill` | Tekst widoczny po najechaniu/kliknięciu strzałki: jakie umiejętności są przenoszone. |

Konwencja: przedmioty 1. semestru (i inne bez prerekwizytów) łączymy strzałką z `ROOT`, żeby nie „wisiały” na mapie.
Oba ID muszą istnieć w plikach `semX.json`. Pętli (`from` = `to`) i duplikatów panel nie zapisze.

### `character.json`: archetypy zawodowe

```json
{
  "_comment": "Dowolny komentarz - pole jest ignorowane przez mapę i zachowywane przez panel.",
  "archetypes": {
    "programista": {
      "label": "Programista",
      "tagline": "Oprogramowanie, dane i systemy cyfrowe.",
      "daily": "Na co dzień projektuje i utrzymuje oprogramowanie…",
      "subjects": ["ROOT", "MAT1", "PROG1", "PROG2", "BAZY"],
      "core": ["PROG1", "PROG2", "BAZY"]
    }
  }
}
```

| Pole | Opis |
|---|---|
| klucz (np. `"programista"`) | Techniczna nazwa: małe litery, cyfry, `_` i `-`. **Kolejność kluczy = kolejność w menu.** |
| `label` | Nazwa w menu „Wybierz archetyp zawodowy”. |
| `tagline` | Krótki podtytuł w panelu archetypu. |
| `daily` | Opis w sekcji „Na co dzień”. |
| `subjects` | ID przedmiotów **przypisanych** do archetypu (pełny kolor). |
| `core` | (opcjonalnie) podzbiór `subjects`: przedmioty **kluczowe** (niebieska obwódka). |

Co widzi student po wybraniu archetypu:
- **Podstawowe** (obwódka): przedmioty z `core`;
- **Wspierające** (pełny kolor): pozostałe z `subjects` oraz ich prerekwizyty (wstecz po strzałkach, w obrębie przedmiotów należących do jakiegokolwiek archetypu);
- **Kontekstowe** (wygaszone): cała reszta.

Jeśli archetyp **nie ma** pola `core` (starszy format), kluczowe są wszystkie `subjects` z wyjątkiem przedmiotów
wspólnych dla wszystkich archetypów i oznaczonych `"foundational": true`. Panel zawsze zapisuje `core` jawnie.

Brak pliku `character.json` nie psuje mapy: menu archetypów po prostu się nie pokaże.

---

## Wygląd i teksty: `config.js`, `style.css`, okno „i”

### `config.js`: centralny plik ustawień mapy

Plik jest bogato skomentowany. Zmieniasz tylko **wartości po prawej stronie dwukropka**.

| Sekcja | Co ustawia |
|---|---|
| `semesterCount` | liczba plików `semX.json` do wczytania (patrz [Zmiana liczby semestrów](#zmiana-liczby-semestrów)) |
| `categories` | dziedziny: `label` (nazwa w legendzie), `bg` / `border` / `text` (kolory bloczka). Kolejność = kolejność w legendzie. Klucz musi odpowiadać polu `category` w `semX.json`. |
| `colors` | kolory rysowane na mapie: węzeł startowy, strzałki, podświetlenia, obwódka archetypu, ramki bloków obieralnych… |
| `layout` | odstępy między kolumnami i bloczkami, marginesy ramek, rozmiar i krój czcionki bloczków, opóźnienie dymków |
| `texts` | wszystkie napisy interfejsu (legenda, nagłówki „Semestr”, panel szczegółów, dymki, komunikat błędu…) |

W wersji z panelem ten sam `config.js` wczytuje też panel administracyjny, więc mapa w panelu wygląda jak publiczna.
Po zmianie `config.js` w wersji z panelem podbij `APP_VERSION` w `config.php` (patrz [cache](#wdrożenie-na-serwer-i-cache)).

### `style.css`

Wygląd strony poza samą mapą: panel boczny, tło, nagłówki, legenda, okno „i”, wersja mobilna.
Główny kolor akcentu to `#2563EB` (niebieski), a ciemny to `#1E293B` (grafit).

### Okno „i” (informacje o kierunku)

Przycisk **„i”** obok logo otwiera okno, którego treść jest w `index.html` / `index.php` (blok `about-modal`).
Jest przeznaczone dla **studentów Twojego kierunku**:
- tytuł (`Nazwa kierunku`) i sekcje „O kierunku”, „Jak korzystać z mapy” zmieniasz dowolnie;
- nowe sekcje dodajesz, kopiując blok `<div class="about-section">…</div>`;
- **zwijanego panelu „O projekcie”** na samym dole **nie usuwaj i nie ukrywaj** (wymóg licencji).

---

## Panel administracyjny

*(tylko `study_roadmap_admin/`)*

### Logowanie

- Adres: `…/study_roadmap_admin/admin/login.php`. Prowadzi tam też dyskretny link **„🔒 Panel administracyjny”**
  na dole panelu bocznego mapy. Żeby go ukryć, usuń znacznik `<a class="admin-login-link">` w `index.php`
  (panel dalej działa pod tym adresem).
- Jest jedno wspólne hasło administratora, bez kont użytkowników.
- Po 8 nieudanych próbach logowanie jest blokowane na minutę.

### Co można robić w panelu

- **Zakładka „Przedmioty”**: kliknij bloczek na mapie, żeby edytować ID, semestr, etykietę, dziedzinę, blok obieralny,
  opis, link do sylabusa, umiejętności i przypisanie do archetypów (checkboksy „Przypisany” / „Kluczowy”).
  **+ Przedmiot** dodaje nowy. Zmiana ID przedmiotu aktualizuje też zależności i archetypy.
- **Zależności**: kliknij strzałkę, żeby zmienić „skąd → dokąd” i opis umiejętności. **+ Zależność** dodaje nową.
- **Zakładka „Archetypy”**: dodawanie (także jako kopia istniejącego), zmiana nazwy, opisów, klucza, kolejności
  i listy przedmiotów (przypisane / kluczowe).
- **„Zapisz zmiany”** (lub **Ctrl+S**) zapisuje wszystko na serwerze. Do dysku trafiają tylko pliki, które naprawdę
  się zmieniły, i to „wszystko albo nic”. Publiczna mapa od razu pokazuje nowe dane.
- **„Podgląd mapy”** otwiera publiczną stronę w nowej karcie.

Panel nie edytuje dziedzin, kolorów, tekstów interfejsu ani okna „i”. To się zmienia w plikach
(patrz [Wygląd i teksty](#wygląd-i-teksty-configjs-stylecss-okno-i)).

### Bezpieczeństwo pracy

- **Szkic w przeglądarce**: niezapisane zmiany są na bieżąco zapamiętywane lokalnie. Po zamknięciu karty
  lub awarii panel zaproponuje ich przywrócenie.
- **Wygasła sesja**: panel poprosi o ponowne logowanie w okienku, bez utraty zmian.
- **Konflikt**: jeśli ktoś inny (albo Ty w innej karcie) zapisał dane w międzyczasie, panel ostrzeże
  i pozwoli świadomie nadpisać zmiany. Przed nadpisaniem robi kopię.
- **Kopie zapasowe** (przycisk „Kopie zapasowe”): przed zapisem tworzy się automatyczna migawka wszystkich plików
  danych (nie częściej niż co 10 minut i tylko gdy coś się zmieniło). Można też zrobić kopię ręcznie
  („Utwórz kopię teraz”), przywrócić dowolną kopię albo ją usunąć. Kopie leżą w `data/backups/`, są
  zablokowane dla przeglądarek (`.htaccess`) i nie trafiają do repozytorium (`.gitignore`).

### Ustawienia serwera: `config.php`

| Stała | Opis |
|---|---|
| `APP_VERSION` | Wersja kodu. **Podbij ją** (np. `2.0.0` → `2.0.1`) po każdej zmianie `.js` / `.css`, żeby przeglądarki pobrały nowe pliki. Zmiany danych tego nie wymagają. |
| `ADMIN_PASSWORD_HASH` | Hash hasła do panelu (patrz [niżej](#zmiana-hasła-do-panelu)). |
| `SEMESTER_COUNT` | Liczba semestrów, **ta sama** co `semesterCount` w `config.js` (panel ostrzeże, jeśli się różnią). |
| `DATA_DIR`, `DATA_PATH`, `BACKUP_DIR` | Położenie folderu z danymi. Zwykle nie trzeba ruszać. |
| `BACKUP_MIN_INTERVAL` | Minimalny odstęp między automatycznymi kopiami (sekundy, domyślnie 600). |
| `BACKUP_KEEP_RECENT` | Ile najnowszych kopii zachować (domyślnie 20). |
| `BACKUP_KEEP_DAYS` | Przez ile dni zachować po jednej kopii dziennie (domyślnie 30). Kopie ręczne nie są kasowane automatycznie. |
| `APP_TIMEZONE` | Strefa czasowa dat kopii (domyślnie `Europe/Warsaw`). |

Wejście na `config.php` w przeglądarce daje pustą stronę, bo PHP nie wyświetla swojego kodu, więc hash jest bezpieczny
na serwerze. Pamiętaj jednak, że **wszystko, co wypchniesz do publicznego repozytorium, jest publiczne**: nie commituj
hasha swojego prawdziwego hasła (patrz niżej).

---

## Zmiana hasła do panelu

W `config.php` jest **hash** hasła (zaczynający się od `$2y$…`), nigdy samo hasło. Żeby zmienić hasło, wygeneruj nowy hash
i wklej go w miejsce starego:

```php
const ADMIN_PASSWORD_HASH = '$2y$12$...tu.wklej.swój.hash...';
```

Hash wklejaj w **pojedynczych cudzysłowach** `'…'`, bo w podwójnych PHP potraktuje znaki `$` jako zmienne.

Hash wygenerujesz na jeden z trzech sposobów:

**A. W terminalu** (na serwerze przez SSH albo na własnym komputerze z PHP):

```bash
php -r "echo password_hash('TwojeNoweHaslo', PASSWORD_DEFAULT).PHP_EOL;"
```

**B. W przeglądarce, narzędziem `tools/hash.php`:**
1. Otwórz `…/study_roadmap_admin/tools/hash.php`.
2. Wpisz nowe hasło i kliknij „Generuj”.
3. Skopiuj wynik do `config.php`.
4. **Usuń z serwera plik `tools/hash.php`** (albo cały folder `tools/`). Nie powinien być dostępny publicznie.

**C. Dowolnym generatorem bcrypt**: PHP akceptuje każdy poprawny hash `password_hash` (bcrypt `$2y$`).

Nowe hasło działa od razu po zapisaniu `config.php`. Osoby już zalogowane pozostają zalogowane, dopóki się nie wylogują
albo nie zamkną przeglądarki.

> **Repozytorium publiczne a hasło.** W repozytorium zostaw hash domyślnego hasła (`password11!!`), a swój prawdziwy
> hash wpisuj **tylko w kopii `config.php` na serwerze**. Jeśli przez pomyłkę wypchniesz prawdziwy hash, zmień hasło
> na nowe.

---

## Zmiana liczby semestrów

Przykład: 7 → 8 semestrów.

**Wersja statyczna**
1. `config.js` → `semesterCount: 8`.
2. Utwórz `sem8.json` z zawartością `{ "nodes": [] }` (każdy plik `sem1…semN.json` **musi istnieć**,
   inaczej mapa pokaże błąd wczytywania).
3. Dodaj przedmioty z `"level": 8`.

**Wersja z panelem**
1. `config.js` → `semesterCount: 8` **oraz** `config.php` → `SEMESTER_COUNT = 8`.
2. Podbij `APP_VERSION` w `config.php`.
3. Zaloguj się do panelu. Brakujący `data/sem8.json` zostanie utworzony przy pierwszym zapisie
   (panel wyświetli o tym informację). Teraz możesz wybierać semestr 8 w edytorze przedmiotu.

Przy **zmniejszaniu** liczby semestrów najpierw przenieś lub usuń przedmioty z ostatnich semestrów. Panel nie zapisze
przedmiotu z semestrem spoza zakresu.

---

## Przenoszenie danych między wersjami

Format danych jest wspólny, więc wystarczy skopiować 9 plików (`sem1…sem7.json`, `dependencies.json`, `character.json`):

| Z | Do |
|---|---|
| `study_roadmap_admin/data/*.json` | `study_roadmap/` |
| `study_roadmap/*.json` | `study_roadmap_admin/data/` |

Typowy scenariusz: edytujesz dane wygodnie w panelu (np. lokalnie, przez `php -S`), a potem kopiujesz JSON-y do wersji
statycznej i publikujesz ją na zwykłym hostingu. Pamiętaj tylko o zgodnych `semesterCount` i `categories`
w `config.js` obu wersji.

---

## Wdrożenie na serwer i cache

- **Apache**: pliki `.htaccess` są gotowe. Wymuszają sprawdzanie świeżości plików `.html/.css/.js/.json`
  (po podmianie plików zmiany widać od razu), a `data/backups/.htaccess` blokuje dostęp do kopii zapasowych.
  Wymagany jest Apache 2.4 (`Require all denied`) i `AllowOverride` włączone dla tego katalogu.
- **nginx** (nie czyta `.htaccess`): dodaj w konfiguracji odpowiednik blokady kopii, np.
  `location ~ /data/backups/ { deny all; }`.
- **Cache przeglądarek**: wersja z panelem dokleja `?v=APP_VERSION` do `style.css` / `config.js` / `script.js`.
  Po zmianie tych plików podbij `APP_VERSION`. Dane JSON mają automatyczny znacznik wersji (z daty modyfikacji),
  więc po zapisie w panelu nic nie trzeba robić. W wersji statycznej odświeżanie zapewnia `.htaccess`. Na hostingach
  bez niego (np. GitHub Pages) może być potrzebne twarde odświeżenie (Ctrl+F5).
- **Zależności zewnętrzne** ładowane z sieci: biblioteka [vis-network](https://github.com/visjs/vis-network) (unpkg.com)
  i czcionka Montserrat (Google Fonts). Mapa wymaga dostępu do internetu po stronie przeglądarki.
- **Wgrywasz na serwer tylko jeden folder?** To w porządku. Pliki licencyjne są w katalogu głównym repozytorium,
  a panel „O projekcie” w aplikacji linkuje do licencji i kodu źródłowego.

---

## Licencja

Repozytorium ma dwie licencje (zgodnie ze specyfikacją [REUSE](https://reuse.software)). Dotyczą one **obu folderów**:

| Co | Licencja | Plik |
|---|---|---|
| Kod aplikacji (`.html`, `.php`, `.js`, `.css`, pliki techniczne) | [GNU AGPL v3.0 lub nowsza](https://www.gnu.org/licenses/agpl-3.0.html) | [`LICENSE`](LICENSE) |
| Dane mapy (`study_roadmap/*.json`, `study_roadmap_admin/data/*.json`): przedmioty, zależności, umiejętności, archetypy, opisy | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pl) | [`LICENSES/CC-BY-NC-SA-4.0.txt`](LICENSES/CC-BY-NC-SA-4.0.txt) |

W skrócie:

- **Kod** możesz uruchamiać, zmieniać i rozpowszechniać. Każda wersja zmodyfikowana (także uruchomiona tylko
  jako strona na serwerze) musi udostępniać swój kod źródłowy na tej samej licencji.
- **Danych** możesz używać i je przerabiać tylko niekomercyjnie, z uznaniem autorstwa, a przeróbki udostępniać
  na tej samej licencji.
- **Panel „O projekcie”** z autorami, licencjami i linkiem do kodu musi zostać w każdej kopii i wersji pochodnej.
  To dodatkowy warunek z sekcji 7 AGPL (zob. [`NOTICE`](NOTICE)). Zmienione wersje oznacz jako zmienione.
  Licencja nie daje praw do nazwy „AGH”.

Każdy plik kodu ma nagłówek `SPDX-License-Identifier`, a pliki bez nagłówka (JSON, `.htaccess`, dokumentacja) są
opisane w [`REUSE.toml`](REUSE.toml). Zgodność możesz sprawdzić narzędziem [`reuse`](https://reuse.software):
`reuse lint` w katalogu głównym.

---

## Jak cytować

Zob. [`CITATION.cff`](CITATION.cff) (przycisk **„Cite this repository”** na GitHubie).

> Dworakowski Z., Dziewic S., *study-roadmap: interaktywna mapa zależności przedmiotów*,
> Katedra Robotyki i Mechatroniki, AGH w Krakowie, 2026. https://github.com/UZUPELNIJ/study-roadmap
