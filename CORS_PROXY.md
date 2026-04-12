# Configuring a CORS Proxy for Jules API

When running the AI-Dashboard from a web browser (e.g., on GitHub Pages), you may encounter **CORS (Cross-Origin Resource Sharing)** errors when the browser attempts to fetch data from `https://jules.googleapis.com`. This happens because the Jules API does not explicitly allow requests from your dashboard's domain.

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

// Polyfill for getallheaders() if it doesn't exist
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

/**
 * Get all headers, with extra robustness for the Authorization header
 * which is often stripped by Apache/FastCGI.
 */
function getallheaders_robust() {
    $headers = getallheaders();
    if (!isset($headers['Authorization'])) {
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $headers['Authorization'] = $_SERVER['HTTP_AUTHORIZATION'];
        } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $headers['Authorization'] = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        } elseif (isset($headers['X-Authorization'])) {
            $headers['Authorization'] = $headers['X-Authorization'];
        } elseif (isset($_SERVER['HTTP_X_AUTHORIZATION'])) {
            $headers['Authorization'] = $_SERVER['HTTP_X_AUTHORIZATION'];
        }
    }
    return $headers;
}

// 1. Handle CORS Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: *");
    exit;
}

// 2. Prepare the target URL
if (isset($_GET['url'])) {
    // Use explicit URL if provided (preferred for some server configs)
    $targetUrl = $_GET['url'];

    // SECURITY: Only allow requests to the Jules API
    if (strpos($targetUrl, 'https://jules.googleapis.com/') !== 0) {
        http_response_code(403);
        echo json_encode(["error" => "Forbidden: Target URL must be https://jules.googleapis.com/"]);
        exit;
    }
} else {
    // Fallback: It takes the path after proxy.php and appends it to the Jules API base
    $path = $_SERVER['PATH_INFO'] ?? '';
    if (empty($path) && isset($_SERVER['REQUEST_URI'])) {
        // Fallback if PATH_INFO is not set
        $scriptName = $_SERVER['SCRIPT_NAME'];
        $requestUri = explode('?', $_SERVER['REQUEST_URI'])[0];
        if (strpos($requestUri, $scriptName) === 0) {
            $path = substr($requestUri, strlen($scriptName));
        }
    }

    // Auto-prepend /v1 if missing and not empty
    if (!empty($path) && strpos($path, '/v1/') !== 0 && $path !== '/v1') {
        $path = '/v1' . $path;
    }

    $targetUrl = 'https://jules.googleapis.com' . $path;
}

// 3. Forward the request using cURL
$headers = array_change_key_case(getallheaders_robust(), CASE_LOWER);

// DIAGNOSTIC: Check for authentication headers if calling Jules API
$hasAuth = isset($headers['authorization']) ||
           isset($headers['x-authorization']) ||
           isset($headers['x-goog-api-key']);

if (!$hasAuth && strpos($targetUrl, 'https://jules.googleapis.com/') === 0) {
    header("Access-Control-Allow-Origin: *");
    header("Content-Type: application/json");
    http_response_code(401);
    echo json_encode([
        "error" => "Missing Authentication header",
        "message" => "The proxy did not receive an Authorization, X-Authorization, or X-Goog-Api-Key header. If you are using Apache, you may need to add 'SetEnvIf Authorization \"(.*)\" HTTP_AUTHORIZATION=$1' to your .htaccess file. See CORS_PROXY.md for details."
    ]);
    exit;
}

$ch = curl_init($targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

// Forward headers (excluding Host and browser-specific headers that might cause issues)
$curlHeaders = [];
$excludedHeaders = ['host', 'origin', 'referer'];
foreach ($headers as $key => $value) {
    if (!in_array($key, $excludedHeaders) && strpos($key, 'sec-') !== 0) {
        // Use original case if possible, but $headers is now lowercase keys
        // For standard headers, title-case is usually fine if we wanted to be fancy,
        // but most APIs (including Google) handle lowercase headers fine (HTTP/2 requires it anyway).
        $curlHeaders[] = "$key: $value";
    }
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $curlHeaders);

// Forward POST body
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
}

// Capture response headers to forward Content-Type
$responseContentType = 'application/json';
curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($curl, $header) use (&$responseContentType) {
    $len = strlen($header);
    $parts = explode(':', $header, 2);
    if (count($parts) === 2 && strtolower(trim($parts[0])) === 'content-type') {
        $responseContentType = trim($parts[1]);
    }
    return $len;
});

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// 4. Send Response with CORS headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: *");
header("Content-Type: $responseContentType");
http_response_code($httpCode);
echo $response;
```

2.  **Update Dashboard:**
    - Open the dashboard **Settings** (⚙️ icon).
    - Update the **Jules API Base URL** to your proxy URL.
    - If your server doesn't support paths after `.php`, use the `?url=` format: `https://your-domain.com/proxy.php?url=`
    - Otherwise, you can use the path format: `https://your-domain.com/proxy.php/v1`
    - Click **Save & Reload**.

### Troubleshooting Authentication Headers

On many Apache and PHP-FPM installations, the `Authorization` header is stripped before it reaches your PHP script. The dashboard automatically sends an `X-Authorization` header as a fallback. The proxy script also supports the `X-Goog-Api-Key` header for Jules API authentication.

If the proxy returns a `401 Missing Authentication header` error despite you having configured it correctly, try the following:

#### Apache (.htaccess)

Create or update the `.htaccess` file in the same directory as your `proxy.php`:

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
</IfModule>

# Alternative if the above doesn't work:
SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1
```

#### Nginx (fastcgi_params)

If you have access to the Nginx configuration, ensure the following line is present in your `location ~ \.php$` block:

```nginx
fastcgi_param HTTP_AUTHORIZATION $major_http_authorization;
```
(Or similar, depending on your Nginx/FPM version).

---

## Important Security Note

**Never use public, third-party CORS proxies** (like `cors-anywhere.herokuapp.com`) for the Jules API. These proxies can see your **Jules API Token** sent in the `Authorization` header. Always use a proxy that you control.
