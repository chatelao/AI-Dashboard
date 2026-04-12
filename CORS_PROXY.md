# Configuring a CORS Proxy for Jules API

When running the AI Development Dashboard from a web browser (e.g., on GitHub Pages), you may encounter **CORS (Cross-Origin Resource Sharing)** errors when the browser attempts to fetch data from `https://jules.googleapis.com`. This happens because the Jules API does not explicitly allow requests from your dashboard's domain.

## Understanding the Error

In the browser console, you might see errors like:
> Access to fetch at 'https://jules.googleapis.com/v1/tasks/...' from origin 'https://yourname.github.io' has been blocked by CORS policy.

## Solution: PHP CORS Proxy with Authentication

A CORS proxy acts as an intermediary. Your browser sends the request to the proxy, which then forwards it to the Jules API. This script includes a simple security check to ensure only your dashboard can use the proxy.

### Setup Instructions

1.  **Create `proxy.php`:** Upload a file named `proxy.php` to your web server with the following content.
2.  **Set your Security Key:** Change `'your-secret-key-here'` to a long, random string.

```php
<?php
/**
 * Secure CORS Proxy for Jules API
 */

// --- CONFIGURATION ---
define('PROXY_KEY', 'your-secret-key-here');
// ---------------------

// 1. Handle CORS Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: X-Proxy-Auth, Authorization, Content-Type");
    exit;
}

// 2. Check Proxy Authentication
$headers = getallheaders();
$proxyAuth = $headers['X-Proxy-Auth'] ?? $_SERVER['HTTP_X_PROXY_AUTH'] ?? '';

if ($proxyAuth !== PROXY_KEY) {
    header("Access-Control-Allow-Origin: *");
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized Proxy Access']);
    exit;
}

// 3. Prepare the target URL
// It takes the path after proxy.php and appends it to the Jules API base
$path = $_SERVER['PATH_INFO'] ?? '';
if (empty($path) && isset($_SERVER['REQUEST_URI'])) {
    // Fallback if PATH_INFO is not set
    $scriptName = $_SERVER['SCRIPT_NAME'];
    $requestUri = explode('?', $_SERVER['REQUEST_URI'])[0];
    if (strpos($requestUri, $scriptName) === 0) {
        $path = substr($requestUri, strlen($scriptName));
    }
}
$targetUrl = 'https://jules.googleapis.com' . $path;

// 4. Forward the request using cURL
$ch = curl_init($targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

// Forward headers (excluding Host and X-Proxy-Auth)
$curlHeaders = [];
foreach ($headers as $key => $value) {
    $lowerKey = strtolower($key);
    if ($lowerKey !== 'host' && $lowerKey !== 'x-proxy-auth') {
        $curlHeaders[] = "$key: $value";
    }
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $curlHeaders);

// Forward POST body
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
}

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// 5. Send Response with CORS headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: *");
header("Content-Type: application/json");
http_response_code($httpCode);
echo $response;
```

3.  **Update Dashboard Settings:**
    - Open the dashboard **Settings** (⚙️ icon).
    - Update the **Jules API Base URL** to your proxy URL (e.g., `https://your-domain.com/proxy.php/v1`).
    - Update the **Proxy Authentication** field with the same secret key you set in `proxy.php`.
    - Click **Save & Reload**.

---

## Important Security Note

**Never use public, third-party CORS proxies** (like `cors-anywhere.herokuapp.com`) for the Jules API. These proxies can see your **Jules API Token** sent in the `Authorization` header. Always use a proxy that you control and protect it with a secret key as shown above.
