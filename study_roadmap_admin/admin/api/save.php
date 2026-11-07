<?php
// SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * api/save.php - zapis danych z panelu (przedmioty, zależności, archetypy).
 *
 * Kolejno:
 *   1. sesja + POST + CSRF                         (401 / 405 / 403)
 *   2. walidacja i oczyszczenie danych             (400)
 *   3. blokada zapisu (flock)
 *   4. kontrola wersji: jeśli dane na serwerze zmieniły się od otwarcia
 *      panelu (inna karta / przywrócona kopia) → 409, chyba że force=true
 *   5. porównanie z tym, co jest na dysku - zapisujemy TYLKO zmienione pliki;
 *      brak zmian = brak zapisu i brak kopii
 *   6. jedna migawka-kopia (z limitem częstotliwości) + zapis „wszystko albo nic"
 *   7. przerzedzenie starych kopii
 *
 * Odpowiedź: {"ok":true,"changed":[...],"backup":"...|null","revision":"...","dataVersion":"..."}
 */
require_once __DIR__ . '/../storage.php';

$in = api_guard(true);

$nodesIn = $in['nodes'] ?? null;
$edgesIn = $in['edges'] ?? null;
$archIn  = $in['archetypes'] ?? null;
$base    = is_string($in['base'] ?? null) ? $in['base'] : '';
$force   = !empty($in['force']);

if (!is_array($nodesIn) || !is_array($edgesIn) || !is_array($archIn)) {
    fail(400, 'Brak wymaganych danych (przedmioty / zależności / archetypy).');
}

// ─── 2a. Przedmioty ──────────────────────────────────────────────────────────
$ids = [];
$byFile = array_fill_keys(semester_files(), []);
foreach ($nodesIn as $i => $n) {
    if (!is_array($n)) {
        fail(400, "Uszkodzony rekord przedmiotu (#{$i}).");
    }
    $id = trim((string) ($n['id'] ?? ''));
    if (!preg_match('/^[A-Za-z0-9_-]{1,40}$/', $id)) {
        fail(400, "Niepoprawne ID przedmiotu: „{$id}\" (dozwolone litery, cyfry, _ i -).");
    }
    if (isset($ids[$id])) {
        fail(400, "Zduplikowane ID przedmiotu: {$id}.");
    }
    $ids[$id] = true;

    $level = (int) ($n['level'] ?? 1);
    if ($level < 0 || $level > SEMESTER_COUNT) {
        fail(400, "Przedmiot {$id}: semestr spoza zakresu 0–" . SEMESTER_COUNT . '.');
    }

    // Znane pola sprowadzamy do właściwych typów; nieznane (np. własne
    // rozszerzenia) zostawiamy bez zmian. Pola techniczne „_..." usuwamy.
    $clean = [];
    foreach ($n as $k => $v) {
        if (is_string($k) && $k !== '' && $k[0] !== '_') {
            $clean[$k] = $v;
        }
    }
    $clean['id'] = $id;
    $clean['label'] = (string) ($n['label'] ?? $id);
    $clean['level'] = $level;
    foreach (['category', 'title', 'syllabus', 'electiveBlock'] as $k) {
        if (array_key_exists($k, $clean)) {
            $clean[$k] = (string) $clean[$k];
            if ($clean[$k] === '' && $k !== 'title') {
                unset($clean[$k]);
            }
        }
    }
    if (array_key_exists('foundational', $clean)) {
        if ($clean['foundational']) {
            $clean['foundational'] = true;
        } else {
            unset($clean['foundational']);
        }
    }
    $clean['skills'] = array_values(array_filter(
        array_map(fn($s) => trim((string) $s), is_array($n['skills'] ?? null) ? $n['skills'] : []),
        fn($s) => $s !== ''
    ));

    // Plik docelowy wynika z semestru (korzeń, poziom 0, leży w sem1.json).
    $file = 'sem' . max(1, $level) . '.json';
    $byFile[$file][] = $clean;
}

// ─── 2b. Zależności ──────────────────────────────────────────────────────────
$edges = [];
$seen = [];
foreach ($edgesIn as $i => $e) {
    $from = (string) ($e['from'] ?? '');
    $to   = (string) ($e['to'] ?? '');
    if (!isset($ids[$from]) || !isset($ids[$to])) {
        fail(400, "Zależność {$from} → {$to} wskazuje na nieistniejący przedmiot.");
    }
    if ($from === $to || isset($seen["$from>$to"])) {
        continue; // pętle i duplikaty po cichu pomijamy
    }
    $seen["$from>$to"] = true;
    $edges[] = ['from' => $from, 'to' => $to, 'skill' => (string) ($e['skill'] ?? '')];
}

// ─── 2c. Archetypy (kolejność tablicy = kolejność w menu) ────────────────────
$archetypes = [];
foreach ($archIn as $i => $a) {
    $key = trim((string) ($a['key'] ?? ''));
    if (!preg_match('/^[a-z0-9][a-z0-9_-]{0,39}$/', $key)) {
        fail(400, "Niepoprawny klucz archetypu: „{$key}\" (małe litery, cyfry, _ i -).");
    }
    if (isset($archetypes[$key])) {
        fail(400, "Zduplikowany klucz archetypu: {$key}.");
    }
    $subjects = [];
    foreach ((is_array($a['subjects'] ?? null) ? $a['subjects'] : []) as $sid) {
        $sid = (string) $sid;
        if (isset($ids[$sid]) && !in_array($sid, $subjects, true)) {
            $subjects[] = $sid;
        }
    }
    // Kluczowe (podstawowe, z obwódką) = podzbiór przypisanych.
    $core = [];
    foreach ((is_array($a['core'] ?? null) ? $a['core'] : []) as $sid) {
        $sid = (string) $sid;
        if (in_array($sid, $subjects, true) && !in_array($sid, $core, true)) {
            $core[] = $sid;
        }
    }
    $label = trim((string) ($a['label'] ?? ''));
    $archetypes[$key] = [
        'label'    => $label !== '' ? $label : $key,
        'tagline'  => (string) ($a['tagline'] ?? ''),
        'daily'    => (string) ($a['daily'] ?? ''),
        'subjects' => $subjects,
        'core'     => $core,
    ];
}

// ─── 3. Blokada ──────────────────────────────────────────────────────────────
$lock = data_lock();
$raw = read_all_raw();
$current = data_revision($raw);

// ─── 4. Kontrola wersji ──────────────────────────────────────────────────────
if ($base !== $current && !$force) {
    fail(409, 'Dane na serwerze zmieniły się od momentu otwarcia panelu (zapis z innej karty, innej osoby lub przywrócenie kopii).', [
        'conflict' => true,
        'revision' => $current,
    ]);
}

// ─── 5. Złożenie nowych plików i porównanie z dyskiem ───────────────────────
$target = [];
foreach ($byFile as $file => $list) {
    $target[$file] = ['nodes' => $list];
}
$target['dependencies.json'] = ['edges' => $edges];

// character.json: zachowujemy pozostałe pola pliku (np. "_comment").
$charOld = json_decode((string) ($raw['character.json'] ?? ''), true);
$char = is_array($charOld) ? $charOld : [];
$char['archetypes'] = $archetypes ?: new stdClass();
$target['character.json'] = $char;

$changed = [];
foreach ($target as $file => $data) {
    $old = json_decode((string) ($raw[$file] ?? ''), true);
    $new = json_decode(encode_json($data), true); // ta sama normalizacja co przy odczycie
    if ($raw[$file] === null || $old !== $new) {
        $changed[$file] = encode_json($data);
    }
}

if (!$changed) {
    json_out(200, [
        'ok' => true, 'changed' => [], 'backup' => null,
        'revision' => $current, 'dataVersion' => data_version(),
        'message' => 'Brak zmian do zapisania - pliki są identyczne.',
    ]);
}

// ─── 6. Kopia + zapis ────────────────────────────────────────────────────────
try {
    $backup = $force && $base !== $current
        ? snapshot_create('force', 'Przed nadpisaniem zmian z innej sesji', $raw)
        : snapshot_create('auto', 'Przed zapisem z panelu', $raw);
    write_files_atomic($changed);
    $pruned = snapshot_prune();
} catch (Throwable $e) {
    fail(500, $e->getMessage());
}

json_out(200, [
    'ok'          => true,
    'changed'     => array_keys($changed),
    'backup'      => $backup,
    'pruned'      => $pruned,
    'revision'    => data_revision(),
    'dataVersion' => data_version(),
]);
