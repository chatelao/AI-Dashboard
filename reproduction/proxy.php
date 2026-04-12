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

// Prepare target URL logic (mirrored from CORS_PROXY.md)
$path = $_SERVER['PATH_INFO'] ?? '';
if (empty($path) && isset($_SERVER['REQUEST_URI'])) {
    $scriptName = $_SERVER['SCRIPT_NAME'];
    $requestUri = explode('?', $_SERVER['REQUEST_URI'])[0];
    if (strpos($requestUri, $scriptName) === 0) {
        $path = substr($requestUri, strlen($scriptName));
    }
}

// Auto-prepend /v1 if missing and not already v1 or v1alpha
if (!empty($path) &&
    strpos($path, '/v1/') !== 0 && $path !== '/v1' &&
    strpos($path, '/v1alpha/') !== 0 && $path !== '/v1alpha') {
    $path = '/v1' . $path;
}

$targetUrl = 'https://jules.googleapis.com' . $path;

$receivedHeaders = getallheaders_robust();
header("Access-Control-Allow-Origin: $origin");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Credentials: true");
header('Content-Type: application/json');

// Mock response based on the targetUrl for v1alpha/sessions
if (strpos($targetUrl, '/v1alpha/sessions') !== false) {
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
                'url' => 'https://jules.google.com/sessions/mock-' . $issueNumber,
                'prompt' => "Fix issue #$issueNumber",
                'createTime' => date('c')
            ]
        ]
    ]);
    exit;
}

echo json_encode(['headers' => $receivedHeaders, 'targetUrl' => $targetUrl, 'server' => $_SERVER]);
