<?php
// SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * =============================================================================
 *  config.php  -  CENTRALNA KONFIGURACJA SERWERA 
 * =============================================================================
 *  Wygląd mapy (kolory, teksty, wymiary) ustawiamy w config.js.
 *  Tutaj są rzeczy, które dotyczą serwera:
 *    1) APP_VERSION          → podbij po zmianie plików .js/.css (odświeża cache)
 *    2) ADMIN_PASSWORD_HASH  → hash hasła do panelu (jak wygenerować - niżej)
 *    3) SEMESTER_COUNT       → liczba semestrów (ta sama co w config.js!)
 *    4) Ustawienia kopii zapasowych
 *
 *  Dane (semX.json, dependencies.json, character.json) NIE wymagają podbijania
 *  wersji - strona sama wykrywa, że plik się zmienił (patrz data_version()).
 *
 *  Plik nic nie wypisuje, więc wejście na config.php w przeglądarce = pusta
 *  strona (PHP nigdy nie oddaje swojego kodu źródłowego). To jest bezpieczne.
 * =============================================================================
 */

// ─── 1. WERSJA KODU (cache-busting dla style.css / script.js / config.js) ────
//  Zwiększamy  przy każdym wgraniu zmienionych plików .js / .css: 2.0.0 → 2.0.1 ...
const APP_VERSION = '2.0.0';

// ─── 2. HASŁO ADMINA (hash, nie jawny tekst!) ────────────────────────────────
//  Domyślne hasło poniższego hasha to:  password11!!
//  KONIECZNIE wygenerować własny hash i wkleić tutaj. Przez SSH na serwerze:
//       php -r "echo password_hash('TwojeNoweHaslo', PASSWORD_DEFAULT).PHP_EOL;"
//  …i wklej wynik (zaczyna się od $2y$...) w miejsce poniższego.
const ADMIN_PASSWORD_HASH = '$2y$12$/1MXqQtqowXFlZeg2CX.1ORZ92gy569UvJq9AimDBzbsRCWkeK4SS';

// ─── 3. SEMESTRY I PLIKI DANYCH ──────────────────────────────────────────────
//  SEMESTER_COUNT musi być równe CONFIG.semesterCount w config.js
//  (panel pokaże ostrzeżenie, jeśli się różnią).
const SEMESTER_COUNT = 7;

//  DATA_DIR = folder z plikami danych; DATA_PATH = ten sam folder jako adres URL
//  względem index.php. Zmieniamy oba naraz, jeśli kiedyś przeniesiemy dane.
define('DATA_DIR',   __DIR__ . '/data');
define('BACKUP_DIR', DATA_DIR . '/backups');
const DATA_PATH = 'data/';

// ─── 4. KOPIE ZAPASOWE ───────────────────────────────────────────────────────
//  Każda kopia to JEDEN plik (migawka wszystkich plików danych naraz).
//  - Kopia powstaje tylko wtedy, gdy zapis faktycznie coś zmienia.
//  - Kolejne zapisy w krótkim odstępie (BACKUP_MIN_INTERVAL) nie tworzą
//    nowych kopii - chroni to przed zalewem plików przy częstym klikaniu
//    „Zapisz". Zachowany zostaje stan sprzed rozpoczęcia serii edycji.
//  - Sprzątanie: zostaje BACKUP_KEEP_RECENT najnowszych kopii oraz po jednej
//    (najstarszej) kopii z każdego dnia przez BACKUP_KEEP_DAYS dni.
//  - Kopie przywracamy w panelu: przycisk „Kopie zapasowe".
const BACKUP_MIN_INTERVAL = 600;   // sekundy (600 = 10 minut)
const BACKUP_KEEP_RECENT  = 20;
const BACKUP_KEEP_DAYS    = 30;

// Strefa czasowa dat w nazwach i na liście kopii.
const APP_TIMEZONE = 'Europe/Warsaw';
date_default_timezone_set(APP_TIMEZONE);

// ═════════════════════════════════════════════════════════════════════════════
//  MECHANIKA - poniżej nie trzeba niczego zmieniać.
// ═════════════════════════════════════════════════════════════════════════════

/** Lista plików semestrów: sem1.json … semN.json. */
function semester_files(): array
{
    $out = [];
    for ($i = 1; $i <= SEMESTER_COUNT; $i++) {
        $out[] = "sem{$i}.json";
    }
    return $out;
}

/** Biała lista plików, do których panel ma prawo pisać. */
function data_files(): array
{
    return array_merge(semester_files(), ['dependencies.json', 'character.json']);
}

/**
 * Znacznik wersji DANYCH - zmienia się automatycznie przy każdej zmianie pliku
 * (data modyfikacji + rozmiar). Doklejany do adresów JSON-ów na stronie
 * publicznej, więc po zapisie w panelu nikt nie widzi starej wersji z cache.
 */
function data_version(): string
{
    clearstatcache();
    $sig = '';
    foreach (data_files() as $f) {
        $p = DATA_DIR . '/' . $f;
        if (is_file($p)) {
            $sig .= $f . ':' . filemtime($p) . ':' . filesize($p) . ';';
        }
    }
    return substr(sha1($sig), 0, 10);
}

/** Czy połączenie idzie po HTTPS (także za proxy). */
function is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

/**
 * Startuje sesję z bezpiecznymi flagami ciasteczka (HTTPS, HttpOnly, SameSite).
 * Ciasteczko obejmuje cały folder admin/ (razem z admin/api/), dzięki czemu
 * logowanie i zapis zawsze widzą tę samą sesję.
 */
function app_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/'));
    $pos = strpos($script, '/admin/');
    $path = $pos !== false ? substr($script, 0, $pos) . '/admin/' : '/';

    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => $path,
        'secure'   => is_https(),
        'httponly' => true,      // JS nie ma dostępu do ciasteczka
        'samesite' => 'Strict',  // ochrona przed CSRF z innych stron
    ]);
    session_name('ROADMAP_ADMIN');
    session_start();
}

/** Zwraca token CSRF dla bieżącej sesji (tworzy przy pierwszym użyciu). */
function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

/** Weryfikuje token CSRF w sposób odporny na ataki czasowe. */
function csrf_verify(?string $token): bool
{
    return is_string($token)
        && !empty($_SESSION['csrf'])
        && hash_equals($_SESSION['csrf'], $token);
}

/**
 * Próba logowania (wspólna dla login.php i ponownego logowania w panelu).
 * Zwraca null przy sukcesie albo komunikat błędu.
 */
function attempt_login(string $password): ?string
{
    $now   = time();
    $last  = $_SESSION['last_try'] ?? 0;
    $tries = $_SESSION['tries'] ?? 0;

    if ($tries >= 8 && ($now - $last) < 60) {
        return 'Za dużo prób logowania. Odczekaj minutę.';
    }
    if (password_verify($password, ADMIN_PASSWORD_HASH)) {
        session_regenerate_id(true);       // nowe ID sesji = ochrona przed fixation
        $_SESSION['authed'] = true;
        $_SESSION['tries']  = 0;
        unset($_SESSION['last_try']);
        return null;
    }
    $_SESSION['tries']    = $tries + 1;
    $_SESSION['last_try'] = $now;
    usleep(400000); // 0,4 s - utrudnia zgadywanie
    return 'Nieprawidłowe hasło.';
}
