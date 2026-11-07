<?php
// SPDX-FileCopyrightText: 2026 Ziemowit Dworakowski, Szymon Dziewic
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * login.php - ekran logowania + obsługa formularza.
 * Bezpieczeństwo: hash hasła (password_verify), token CSRF, limit prób,
 * regeneracja ID sesji po udanym logowaniu (patrz attempt_login w config.php).
 */
require_once __DIR__ . '/../config.php';
app_session_start();

// Już zalogowany? Prosto do panelu.
if (!empty($_SESSION['authed'])) {
    header('Location: admin.php');
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_verify($_POST['csrf'] ?? null)) {
        $error = 'Sesja wygasła. Odśwież stronę i spróbuj ponownie.';
    } else {
        $error = attempt_login((string) ($_POST['password'] ?? '')) ?? '';
        if ($error === '') {
            header('Location: admin.php');
            exit;
        }
    }
}

$token = csrf_token();
$v = htmlspecialchars(APP_VERSION, ENT_QUOTES);
header('Cache-Control: no-store');
?>
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Logowanie - Panel administracyjny</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="admin.css?v=<?= $v ?>">
</head>
<body class="login-body">
    <div class="login-card">
        <div class="login-brand">
            <div class="uni-logo-mock">UCZELNIA</div>
            <h1>Panel administracyjny</h1>
            <p class="login-sub">Mapa Zależności</p>
        </div>

        <?php if ($error !== ''): ?>
            <div class="login-error"><?= htmlspecialchars($error, ENT_QUOTES) ?></div>
        <?php endif; ?>

        <form method="post" action="login.php" autocomplete="off" novalidate>
            <input type="hidden" name="csrf" value="<?= htmlspecialchars($token, ENT_QUOTES) ?>">
            <label for="password">Hasło</label>
            <input type="password" id="password" name="password" required autofocus
                   placeholder="Wprowadź hasło administratora">
            <button type="submit" class="login-btn">Zaloguj się</button>
        </form>

        <a class="login-back" href="../index.php">&larr; Wróć do mapy</a>
    </div>
</body>
</html>
