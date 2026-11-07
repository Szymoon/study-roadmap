<?php
// SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * auth.php - „bramka" dla stron chronionych.
 * Dołączamy na SAMEJ GÓRZE każdej strony, która ma być tylko dla zalogowanych:
 *     require_once __DIR__ . '/auth.php';
 * Jeśli użytkownik nie jest zalogowany → przekierowanie na login.php.
 */
require_once __DIR__ . '/../config.php';
app_session_start();

if (empty($_SESSION['authed'])) {
    header('Location: login.php');
    exit;
}
