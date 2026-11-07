<?php
// SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * tools/hash.php — JEDNORAZOWE narzędzie do wygenerowania hasha hasła.
 *
 * Użycie:
 *   1) Otwórz w przeglądarce:  .../<folder-mapy>/tools/hash.php
 *   2) Wpisz nowe hasło, kliknij „Generuj".
 *   3) Skopiuj wynik ($2y$...) do config.php → ADMIN_PASSWORD_HASH.
 *   4) USUŃ TEN PLIK (albo cały folder tools/) z serwera.
 *
 * Po ustawieniu hasła plik jest zbędny i lepiej go nie zostawiać.
 */
$hash = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['pass'])) {
    $pass = (string) $_POST['pass'];
    if ($pass !== '') {
        $hash = password_hash($pass, PASSWORD_DEFAULT);
    }
}
header('Cache-Control: no-store');
?>
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generator hasha hasła</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 20px; color: #1E1E1E; }
        h1 { color: #1E293B; font-size: 1.4rem; }
        input, button { font-size: 1rem; padding: 10px 12px; border-radius: 8px; border: 2px solid #e2e8f0; }
        button { background: #2563EB; color: #fff; border: none; cursor: pointer; font-weight: 700; }
        .out { margin-top: 20px; padding: 14px; background: #f1f5f9; border-radius: 8px; word-break: break-all; font-family: monospace; }
        .warn { margin-top: 24px; color: #B91C1C; font-weight: 600; }
    </style>
</head>
<body>
    <h1>Generator hasha hasła admina</h1>
    <form method="post">
        <input type="text" name="pass" placeholder="Wpisz nowe hasło" autofocus size="30">
        <button type="submit">Generuj</button>
    </form>
    <?php if ($hash !== ''): ?>
        <p>Wklej poniższą linię do <code>config.php</code> jako <code>ADMIN_PASSWORD_HASH</code>:</p>
        <div class="out"><?= htmlspecialchars($hash, ENT_QUOTES) ?></div>
    <?php endif; ?>
    <p class="warn">⚠ Po ustawieniu hasła USUŃ ten plik z serwera.</p>
</body>
</html>
