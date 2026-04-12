<?php
/**
 * Reproduction Proxy for Jules API Debugging
 */

if (!function_exists('getallheaders')) {
    function getallheaders() {
        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (substr($name, 0, 5) == 'HTTP_') {
                $headers[str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))))] = $value;
            }
        }
        return $headers;
    }
}

function getallheaders_robust() {
    $headers = array_change_key_case(getallheaders(), CASE_LOWER);
    if (!isset($headers['authorization'])) {
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $headers['authorization'] = $_SERVER['HTTP_AUTHORIZATION'];
        } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $headers['authorization'] = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        } elseif (isset($headers['x-authorization'])) {
            $headers['authorization'] = $headers['x-authorization'];
        } elseif (isset($_SERVER['HTTP_X_AUTHORIZATION'])) {
            $headers['authorization'] = $_SERVER['HTTP_X_AUTHORIZATION'];
        }
    }
    if (!isset($headers['x-goog-api-key']) && isset($_SERVER['HTTP_X_GOOG_API_KEY'])) {
        $headers['x-goog-api-key'] = $_SERVER['HTTP_X_GOOG_API_KEY'];
    }
    return $headers;
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
    header("Access-Control-Allow-Headers: *");
    header("Access-Control-Allow-Credentials: true");
    exit;
}

$headers = getallheaders_robust();
header("Access-Control-Allow-Origin: $origin");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Credentials: true");
header('Content-Type: application/json');

// Mock response based on the request URI for v1alpha/sessions
$uri = $_SERVER['REQUEST_URI'] ?? '';
if (strpos($uri, 'v1alpha/sessions') !== false) {
    $filter = $_GET['filter'] ?? '';
    $issueNumber = 'unknown';
    if (preg_match('/#(\d+)/', $filter, $matches)) {
        $issueNumber = $matches[1];
    }

    echo json_encode([
        'sessions' => [
            [
                'name' => 'sessions/mock-' . $issueNumber,
                'state' => 'STATE_CODING',
                'url' => 'https://jules.google.com/session/mock-' . $issueNumber,
                'prompt' => "Fix issue #$issueNumber",
                'createTime' => date('c')
            ]
        ]
    ]);
    exit;
}

echo json_encode(['headers' => $headers, 'server' => $_SERVER]);
