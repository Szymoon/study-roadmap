<?php
// SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * logout.php - kończy sesję i czyści ciasteczko, wraca na ekran logowania.
 */
require_once __DIR__ . '/../config.php';
app_session_start();

$_SESSION = [];

// Usuń ciasteczko sesji po stronie przeglądarki.
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires'  => time() - 42000,
        'path'     => $p['path'],
        'domain'   => $p['domain'],
        'secure'   => $p['secure'],
        'httponly' => $p['httponly'],
        'samesite' => $p['samesite'] ?? 'Strict',
    ]);
}

session_destroy();
header('Location: login.php');
exit;
