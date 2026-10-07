<?php
// Temporarily upload this file using your hosting control panel, open its URL,
// copy the capability report, then remove the file. No credentials are read.
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
echo json_encode([
    'php_version' => PHP_VERSION,
    'pdo_mysql' => extension_loaded('pdo_mysql'),
    'pdo_sqlite' => extension_loaded('pdo_sqlite'),
    'fileinfo' => extension_loaded('fileinfo'),
    'gd' => extension_loaded('gd'),
    'imagick' => extension_loaded('imagick'),
    'mbstring' => extension_loaded('mbstring'),
    'openssl' => extension_loaded('openssl'),
    'curl' => extension_loaded('curl'),
    'upload_max_filesize' => ini_get('upload_max_filesize'),
    'post_max_size' => ini_get('post_max_size'),
    'memory_limit' => ini_get('memory_limit'),
    'https' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
