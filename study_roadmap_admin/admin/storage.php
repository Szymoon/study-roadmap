<?php
// SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * =============================================================================
 *  storage.php - odczyt/zapis danych mapy i KOPIE ZAPASOWE (wspólne dla API)
 * =============================================================================
 *  Zasady:
 *   - Każdy zapis odbywa się pod blokadą (flock) - dwa równoczesne zapisy
 *     (np. dwie karty panelu) nie mogą się przeplatać ani uszkodzić plików.
 *   - Do dysku trafiają tylko pliki, które faktycznie się zmieniły.
 *   - Najpierw powstają wszystkie pliki tymczasowe, dopiero potem są
 *     podmieniane (rename) - awaria w połowie nie zostawia „pół zapisu".
 *   - Kopia zapasowa = JEDEN plik-migawka ze wszystkimi plikami danych
 *     (backups/snapshot_RRRRMMDD-GGMMSS_xxxx.json), a nie 9 osobnych .bak.
 *   - Migawka powstaje tylko przy realnej zmianie, nie częściej niż co
 *     BACKUP_MIN_INTERVAL, a stare kopie są automatycznie przerzedzane.
 * =============================================================================
 */
require_once __DIR__ . '/../config.php';

const SNAPSHOT_FORMAT = 'roadmap-snapshot/1';
// Starsza nazwa formatu - kopie zapisane przed zmianą nadal da się przywrócić.
const SNAPSHOT_FORMATS_READ = [SNAPSHOT_FORMAT, 'study-roadmap-snapshot/1'];
const SNAPSHOT_RE     = '/^snapshot_\d{8}-\d{6}_[a-f0-9]{4}\.json$/';

// ─── Odpowiedzi API ──────────────────────────────────────────────────────────

function json_out(int $code, array $data): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $code, string $msg, array $extra = []): never
{
    json_out($code, ['ok' => false, 'error' => $msg] + $extra);
}

/**
 * Wspólna bramka dla endpointów API: sesja → metoda → JSON → CSRF.
 * Zwraca sparsowaną treść żądania (dla GET - pustą tablicę).
 */
function api_guard(bool $post = true): array
{
    app_session_start();
    if (empty($_SESSION['authed'])) {
        fail(401, 'Sesja wygasła. Zaloguj się ponownie - niezapisane zmiany zostaną zachowane.', ['reauth' => true]);
    }
    if (!$post) {
        return [];
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        fail(405, 'Dozwolona tylko metoda POST.');
    }
    $in = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($in)) {
        fail(400, 'Nieprawidłowy format danych (JSON).');
    }
    if (!csrf_verify($in['csrf'] ?? null)) {
        fail(403, 'Nieprawidłowy token bezpieczeństwa (CSRF).', ['csrf' => true]);
    }
    return $in;
}

// ─── Blokada zapisu ──────────────────────────────────────────────────────────

/** Zakłada wyłączną blokadę na czas zapisu. Zwolni się sama na końcu skryptu. */
function data_lock()
{
    ensure_backup_dir();
    $fh = @fopen(BACKUP_DIR . '/.write.lock', 'c');
    if (!$fh) {
        fail(500, 'Nie można utworzyć pliku blokady w data/backups/. Sprawdź uprawnienia folderu.');
    }
    // Czekamy max ~10 s na zwolnienie blokady przez inny zapis.
    $t0 = microtime(true);
    while (!flock($fh, LOCK_EX | LOCK_NB)) {
        if (microtime(true) - $t0 > 10) {
            fail(503, 'Trwa inny zapis. Spróbuj ponownie za chwilę.');
        }
        usleep(150000);
    }
    return $fh;
}

function ensure_backup_dir(): void
{
    if (!is_dir(BACKUP_DIR)) {
        @mkdir(BACKUP_DIR, 0755, true);
    }
    // Kopie nie muszą być publicznie dostępne przez WWW.
    $ht = BACKUP_DIR . '/.htaccess';
    if (is_dir(BACKUP_DIR) && !is_file($ht)) {
        @file_put_contents($ht, "Require all denied\n");
    }
}

// ─── Odczyt danych ───────────────────────────────────────────────────────────

/** Surowa zawartość wszystkich plików danych: [plik => string|null]. */
function read_all_raw(): array
{
    clearstatcache();
    $out = [];
    foreach (data_files() as $f) {
        $p = DATA_DIR . '/' . $f;
        $out[$f] = is_file($p) ? (string) file_get_contents($p) : null;
    }
    return $out;
}

/** Odcisk całego zestawu danych - do wykrywania zmian „w międzyczasie". */
function data_revision(?array $raw = null): string
{
    $raw ??= read_all_raw();
    $h = hash_init('sha1');
    foreach ($raw as $f => $content) {
        hash_update($h, $f . "\0" . ($content ?? "\x01missing") . "\0");
    }
    return substr(hash_final($h), 0, 16);
}

/** Dane w postaci gotowej dla panelu. */
function load_dataset(?array $raw = null): array
{
    $raw ??= read_all_raw();
    $nodes = [];
    foreach (semester_files() as $f) {
        $json = json_decode((string) ($raw[$f] ?? ''), true);
        foreach (($json['nodes'] ?? []) as $n) {
            if (is_array($n)) {
                $nodes[] = $n;
            }
        }
    }
    $deps = json_decode((string) ($raw['dependencies.json'] ?? ''), true);
    $char = json_decode((string) ($raw['character.json'] ?? ''), true);

    $archetypes = [];
    foreach ((is_array($char['archetypes'] ?? null) ? $char['archetypes'] : []) as $key => $a) {
        if (!is_array($a)) {
            continue;
        }
        $archetypes[] = [
            'key'      => (string) $key,
            'label'    => (string) ($a['label'] ?? $key),
            'tagline'  => (string) ($a['tagline'] ?? ''),
            'daily'    => (string) ($a['daily'] ?? ''),
            'subjects' => array_values(array_map('strval', is_array($a['subjects'] ?? null) ? $a['subjects'] : [])),
            // null = brak pola w pliku → panel wyliczy kluczowe wg starej reguły
            'core'     => is_array($a['core'] ?? null) ? array_values(array_map('strval', $a['core'])) : null,
        ];
    }

    return [
        'nodes'      => $nodes,
        'edges'      => is_array($deps['edges'] ?? null) ? $deps['edges'] : [],
        'archetypes' => $archetypes,
        'missing'    => array_keys(array_filter($raw, fn($c) => $c === null)),
    ];
}

// ─── Zapis ───────────────────────────────────────────────────────────────────

function encode_json(array $data): string
{
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('Błąd kodowania JSON: ' . json_last_error_msg());
    }
    return $json . "\n";
}

/**
 * Zapisuje zestaw plików „wszystko albo nic": najpierw wszystkie pliki
 * tymczasowe (+ kontrola odczytu), potem szybka podmiana rename().
 * $files = [nazwa => treść]. Nazwy muszą być z białej listy.
 */
function write_files_atomic(array $files): void
{
    $allowed = data_files();
    $tmps = [];
    try {
        foreach ($files as $name => $content) {
            if (!in_array($name, $allowed, true)) {
                throw new RuntimeException("Niedozwolony plik: {$name}");
            }
            $tmp = DATA_DIR . '/.' . $name . '.' . bin2hex(random_bytes(4)) . '.tmp';
            if (@file_put_contents($tmp, $content, LOCK_EX) !== strlen($content)) {
                throw new RuntimeException("Nie udało się zapisać pliku tymczasowego dla {$name} (brak miejsca lub uprawnień do folderu data/).");
            }
            if (file_get_contents($tmp) !== $content) {
                throw new RuntimeException("Kontrola zapisu {$name} nie powiodła się.");
            }
            @chmod($tmp, 0644);
            $tmps[$name] = $tmp;
        }
        foreach ($tmps as $name => $tmp) {
            if (!@rename($tmp, DATA_DIR . '/' . $name)) {
                throw new RuntimeException("Nie udało się podmienić pliku {$name}.");
            }
            unset($tmps[$name]);
        }
    } finally {
        foreach ($tmps as $tmp) {
            @unlink($tmp);
        }
    }
    clearstatcache();
}

// ─── Kopie zapasowe (migawki) ────────────────────────────────────────────────

/** Lista migawek od najnowszej: [{name, ts, reason, kind, size}]. */
function snapshot_list(): array
{
    ensure_backup_dir();
    $out = [];
    foreach ((array) @scandir(BACKUP_DIR) as $f) {
        if (!is_string($f) || !preg_match(SNAPSHOT_RE, $f)) {
            continue;
        }
        $meta = snapshot_meta($f);
        if ($meta) {
            $out[] = $meta;
        }
    }
    usort($out, fn($a, $b) => [$b['ts'], $b['name']] <=> [$a['ts'], $a['name']]);
    return $out;
}

/** Metadane migawki bez dekodowania całej treści (czytamy tylko nagłówek). */
function snapshot_meta(string $name): ?array
{
    $p = BACKUP_DIR . '/' . $name;
    if (!is_file($p)) {
        return null;
    }
    $head = (string) @file_get_contents($p, false, null, 0, 600);
    $ts = preg_match('/"timestamp"\s*:\s*(\d+)/', $head, $m) ? (int) $m[1] : filemtime($p);
    $reason = preg_match('/"reason"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/', $head, $m) ? json_decode('"' . $m[1] . '"') : '';
    $kind = preg_match('/"kind"\s*:\s*"([a-z]+)"/', $head, $m) ? $m[1] : 'auto';
    return ['name' => $name, 'ts' => $ts, 'reason' => (string) $reason, 'kind' => $kind, 'size' => filesize($p)];
}

function snapshot_read(string $name): array
{
    if (!preg_match(SNAPSHOT_RE, $name) || !is_file(BACKUP_DIR . '/' . $name)) {
        throw new RuntimeException('Nie ma takiej kopii zapasowej.');
    }
    $data = json_decode((string) file_get_contents(BACKUP_DIR . '/' . $name), true);
    if (!is_array($data) || !in_array($data['format'] ?? '', SNAPSHOT_FORMATS_READ, true) || !is_array($data['files'] ?? null)) {
        throw new RuntimeException('Plik kopii jest uszkodzony lub ma nieznany format.');
    }
    return $data;
}

/**
 * Tworzy migawkę bieżącego stanu danych.
 *   $kind  = 'auto' (przed zapisem), 'manual' (przycisk), 'restore' (przed przywróceniem),
 *            'force' (przed nadpisaniem cudzych zmian)
 *   Dla 'auto' obowiązuje BACKUP_MIN_INTERVAL. Identyczny stan jak w ostatniej
 *   migawce nigdy nie tworzy duplikatu.
 * Zwraca nazwę nowej migawki albo null, jeśli nie była potrzebna.
 */
function snapshot_create(string $kind, string $reason, ?array $raw = null): ?string
{
    ensure_backup_dir();
    $raw ??= read_all_raw();
    // Pliki zapisujemy w kopii jako czytelny JSON (nie jako jeden długi napis).
    // Gdyby któryś plik był uszkodzony, trafia do kopii dosłownie, jako tekst.
    $files = [];
    foreach ($raw as $f => $c) {
        if ($c === null) {
            continue;
        }
        $decoded = json_decode($c, true);
        $files[$f] = is_array($decoded) ? $decoded : $c;
    }
    if (!$files) {
        return null;
    }

    $list = snapshot_list();
    $latest = $list[0] ?? null;
    if ($latest) {
        if ($kind === 'auto' && (time() - $latest['ts']) < BACKUP_MIN_INTERVAL) {
            return null; // świeża kopia już jest - nie zaśmiecamy folderu
        }
        try {
            $prev = snapshot_read($latest['name']);
            if (snapshot_files_equal($prev['files'], $files)) {
                return null; // nic się nie zmieniło od ostatniej kopii
            }
        } catch (Throwable $e) {
            // uszkodzona poprzednia kopia - po prostu tworzymy nową
        }
    }

    $ts = time();
    $name = 'snapshot_' . date('Ymd-His', $ts) . '_' . bin2hex(random_bytes(2)) . '.json';
    // Nagłówek (format/kind/timestamp/reason) jest NA POCZĄTKU pliku, żeby lista
    // kopii czytała tylko kilkaset bajtów z każdego pliku.
    $payload = [
        'format'    => SNAPSHOT_FORMAT,
        'kind'      => $kind,
        'timestamp' => $ts,
        'created'   => date('Y-m-d H:i:s', $ts),
        'reason'    => $reason,
        'revision'  => data_revision($raw),
        'files'     => $files,
    ];
    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || @file_put_contents(BACKUP_DIR . '/' . $name, $json, LOCK_EX) === false) {
        throw new RuntimeException('Nie udało się utworzyć kopii zapasowej (uprawnienia folderu data/backups/?). Zapis przerwany.');
    }
    @chmod(BACKUP_DIR . '/' . $name, 0644);
    return $name;
}

/** Treść pliku z kopii jako tekst gotowy do zapisu (obsługuje też stare kopie z napisami). */
function snapshot_file_content($value): string
{
    return is_array($value) ? encode_json($value) : (string) $value;
}

/** Porównanie zawartości dwóch kopii niezależnie od formatu zapisu (napis / JSON). */
function snapshot_files_equal(array $a, array $b): bool
{
    $norm = function (array $files): array {
        $out = [];
        foreach ($files as $f => $v) {
            $out[$f] = is_array($v) ? $v : (json_decode((string) $v, true) ?? (string) $v);
        }
        ksort($out);
        return $out;
    };
    return $norm($a) === $norm($b);
}

/**
 * Przerzedzanie kopii. Zostają:
 *   • BACKUP_KEEP_RECENT najnowszych,
 *   • najstarsza kopia z każdego dnia z ostatnich BACKUP_KEEP_DAYS dni,
 *   • wszystkie kopie ręczne (kind = manual) - te usuwa tylko człowiek.
 * Zwraca liczbę usuniętych plików.
 */
function snapshot_prune(): int
{
    $list = snapshot_list(); // od najnowszej
    $keep = [];
    foreach (array_slice($list, 0, BACKUP_KEEP_RECENT) as $s) {
        $keep[$s['name']] = true;
    }
    $cutoff = time() - BACKUP_KEEP_DAYS * 86400;
    $firstOfDay = [];
    foreach (array_reverse($list) as $s) { // od najstarszej
        $day = date('Y-m-d', $s['ts']);
        if ($s['ts'] >= $cutoff && !isset($firstOfDay[$day])) {
            $firstOfDay[$day] = $s['name'];
        }
        if ($s['kind'] === 'manual') {
            $keep[$s['name']] = true;
        }
    }
    foreach ($firstOfDay as $n) {
        $keep[$n] = true;
    }
    $removed = 0;
    foreach ($list as $s) {
        if (!isset($keep[$s['name']]) && @unlink(BACKUP_DIR . '/' . $s['name'])) {
            $removed++;
        }
    }
    return $removed;
}

/** Stare kopie z poprzedniej wersji panelu (pliki *.bak). */
function legacy_backups(): array
{
    $files = [];
    foreach ((array) @scandir(BACKUP_DIR) as $f) {
        if (is_string($f) && preg_match('/^[A-Za-z0-9_.-]+\.json\.\d{8}_\d{6}\.bak$/', $f)) {
            $files[] = $f;
        }
    }
    return $files;
}
