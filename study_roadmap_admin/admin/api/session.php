<?php
// SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * api/session.php - podtrzymanie sesji i ponowne logowanie BEZ opuszczania panelu.
 *
 *   GET                     → {"ok":true,"authed":bool,"csrf":"..."}
 *                             Panel woła to co kilka minut: samo zapytanie
 *                             odświeża sesję, więc nie wygasa podczas pracy.
 *   POST {action:"login", password, csrf}
 *                           → logowanie w oknie panelu; niezapisane zmiany
 *                             zostają w przeglądarce i zapis można powtórzyć.
 */
require_once __DIR__ . '/../storage.php';
app_session_start();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    json_out(200, [
        'ok'     => true,
        'authed' => !empty($_SESSION['authed']),
        'csrf'   => csrf_token(),
    ]);
}

if ($method !== 'POST') {
    fail(405, 'Niedozwolona metoda.');
}

$in = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($in)) {
    fail(400, 'Nieprawidłowy format danych (JSON).');
}
if (!csrf_verify($in['csrf'] ?? null)) {
    fail(403, 'Token wygasł - spróbuj jeszcze raz.', ['csrf' => true, 'token' => csrf_token()]);
}
if (($in['action'] ?? '') !== 'login') {
    fail(400, 'Nieznana akcja.');
}

$err = attempt_login((string) ($in['password'] ?? ''));
if ($err !== null) {
    fail(403, $err);
}
json_out(200, ['ok' => true, 'authed' => true, 'csrf' => csrf_token()]);
