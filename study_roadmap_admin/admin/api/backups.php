<?php
// SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * api/backups.php - kopie zapasowe z poziomu panelu.
 *
 *   GET                         → lista kopii + informacja o starych plikach .bak
 *   GET ?download=<nazwa>       → pobranie pliku kopii
 *   POST {action:"create"}      → ręczna kopia „teraz" (nie jest kasowana automatycznie)
 *   POST {action:"restore", name}
 *                               → przywraca dane z kopii (przed tym robi kopię stanu bieżącego)
 *   POST {action:"delete", name}→ usuwa jedną kopię
 *   POST {action:"purge_legacy"}→ usuwa stare pliki *.bak z poprzedniej wersji panelu
 */
require_once __DIR__ . '/../storage.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// ─── GET ─────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    api_guard(false);

    if (isset($_GET['download'])) {
        $name = basename((string) $_GET['download']);
        if (!preg_match(SNAPSHOT_RE, $name) || !is_file(BACKUP_DIR . '/' . $name)) {
            fail(404, 'Nie ma takiej kopii.');
        }
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Cache-Control: no-store');
        readfile(BACKUP_DIR . '/' . $name);
        exit;
    }

    $legacy = legacy_backups();
    $legacySize = 0;
    foreach ($legacy as $f) {
        $legacySize += (int) @filesize(BACKUP_DIR . '/' . $f);
    }
    json_out(200, [
        'ok'       => true,
        'list'     => snapshot_list(),
        'legacy'   => ['count' => count($legacy), 'size' => $legacySize],
        'revision' => data_revision(),
        'settings' => [
            'minInterval' => BACKUP_MIN_INTERVAL,
            'keepRecent'  => BACKUP_KEEP_RECENT,
            'keepDays'    => BACKUP_KEEP_DAYS,
        ],
    ]);
}

// ─── POST ────────────────────────────────────────────────────────────────────
$in = api_guard(true);
$action = (string) ($in['action'] ?? '');
$lock = data_lock();

try {
    switch ($action) {
        case 'create':
            $name = snapshot_create('manual', 'Kopia ręczna');
            json_out(200, [
                'ok' => true, 'backup' => $name,
                'message' => $name ? 'Utworzono kopię.' : 'Stan danych jest identyczny z ostatnią kopią - nowa nie była potrzebna.',
            ]);

        case 'restore':
            $name = basename((string) ($in['name'] ?? ''));
            $snap = snapshot_read($name);
            $files = [];
            foreach (data_files() as $f) {
                if (!array_key_exists($f, $snap['files'])) {
                    continue; // np. character.json w kopii sprzed jego istnienia - zostawiamy bieżący
                }
                $content = snapshot_file_content($snap['files'][$f]);
                if (!is_array(json_decode($content, true))) {
                    throw new RuntimeException("Plik {$f} w kopii jest uszkodzony - przywracanie przerwane.");
                }
                $files[$f] = $content;
            }
            if (!$files) {
                throw new RuntimeException('Kopia nie zawiera żadnych plików danych.');
            }
            $label = date('d.m.Y H:i', (int) ($snap['timestamp'] ?? 0));
            $before = snapshot_create('restore', "Przed przywróceniem kopii z {$label}");
            write_files_atomic($files);
            snapshot_prune();
            json_out(200, [
                'ok' => true, 'restored' => array_keys($files), 'backup' => $before,
                'revision' => data_revision(), 'dataVersion' => data_version(),
            ]);

        case 'delete':
            $name = basename((string) ($in['name'] ?? ''));
            if (!preg_match(SNAPSHOT_RE, $name) || !is_file(BACKUP_DIR . '/' . $name)) {
                fail(404, 'Nie ma takiej kopii.');
            }
            if (!@unlink(BACKUP_DIR . '/' . $name)) {
                throw new RuntimeException('Nie udało się usunąć pliku kopii.');
            }
            json_out(200, ['ok' => true]);

        case 'purge_legacy':
            $n = 0;
            foreach (legacy_backups() as $f) {
                if (@unlink(BACKUP_DIR . '/' . $f)) {
                    $n++;
                }
            }
            json_out(200, ['ok' => true, 'removed' => $n]);

        default:
            fail(400, 'Nieznana akcja.');
    }
} catch (Throwable $e) {
    fail(500, $e->getMessage());
}
