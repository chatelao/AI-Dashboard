# Configuring a CORS Proxy for Jules API

When running the AI Development Dashboard from a web browser (e.g., on GitHub Pages), you may encounter **CORS (Cross-Origin Resource Sharing)** errors when the browser attempts to fetch data from `https://jules.googleapis.com`. This happens because the Jules API does not explicitly allow requests from your dashboard's domain.

## Understanding the Error

In the browser console, you might see errors like:
> Access to fetch at 'https://jules.googleapis.com/v1/tasks/...' from origin 'https://yourname.github.io' has been blocked by CORS policy.

## Solution: Use a CORS Proxy

A CORS proxy acts as an intermediary. Your browser sends the request to the proxy, which then forwards it to the Jules API. The proxy adds the necessary `Access-Control-Allow-Origin` headers to the response, allowing your browser to receive the data.

### PHP Server (For Webhosting)

If you have a standard webhosting account with PHP support, you can use this simple proxy script.

1.  **Create `proxy.php`:** Upload a file named `proxy.php` to your web server with the following content:

```php
<?php
/**
 * Simple CORS Proxy for Jules API
 */

// Polyfill for getallheaders if not available
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

// 1. Handle CORS Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: *");
    exit;
}

// 2. Prepare the target URL
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

// Auto-fix: Ensure path starts with /v1 if it looks like a task status request
if (!empty($path) && strpos($path, '/v1/') !== 0 && strpos($path, '/tasks/') === 0) {
    $path = '/v1' . $path;
}

$targetUrl = 'https://jules.googleapis.com' . $path;

// 3. Forward the request using cURL
$ch = curl_init($targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

// Forward headers (excluding Host)
$headers = getallheaders();
$curlHeaders = [];
foreach ($headers as $key => $value) {
    if (strtolower($key) !== 'host') {
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

// 4. Send Response with CORS headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: *");
header("Content-Type: application/json");
http_response_code($httpCode);
echo $response;
```

2.  **Update Dashboard:**
    - Open the dashboard **Settings** (⚙️ icon).
    - Update the **Jules API Base URL** to your proxy URL (e.g., `https://your-domain.com/proxy.php/v1`).
    - Click **Save & Reload**.

---

## Troubleshooting 404 Errors

If you see 404 errors in the console while using the proxy, check the following:

1.  **Missing `/v1`:** Ensure your Jules API Base URL in settings ends with `/v1`. The proxy script above has an auto-fix for this, but it's best to include it.
2.  **Incorrect Path:** The dashboard appends `/tasks/{id}/status` to the Base URL. If your Base URL is `https://example.com/proxy.php`, the request becomes `https://example.com/proxy.php/tasks/...`.
3.  **Proxy Configuration:** Ensure `PATH_INFO` is supported by your web server. If not, the fallback logic in the script should handle it, but you may need to check your server logs.

---

## Important Security Note

**Never use public, third-party CORS proxies** (like `cors-anywhere.herokuapp.com`) for the Jules API. These proxies can see your **Jules API Token** sent in the `Authorization` header. Always use a proxy that you control.
