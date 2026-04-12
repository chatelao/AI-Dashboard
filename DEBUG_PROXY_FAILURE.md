# Debugging Proxy Failure

This guide provides step-by-step instructions to debug a failing CORS proxy, specifically when fetching Jules status through a script like `proxy.php`.

Based on your fetch call:
```javascript
fetch("https://proxy.2u2.ch/proxy.php?url=https%3A%2F%2Fjules.googleapis.com%2Fv1%2Ftasks%2F391%2Fstatus", {
  "headers": {
    "authorization": "Bearer <TOKEN>",
    "x-authorization": "Bearer <TOKEN>",
    "x-goog-api-key": "<TOKEN>",
    // ... other headers
  },
  "method": "GET"
});
```

Follow these steps to isolate the issue:

## Step 1: Verify the Jules API Directly
First, rule out issues with the Jules API or your token by bypassing the proxy. Run this `curl` command from your local terminal:

```bash
curl -i -H "Authorization: Bearer YOUR_JULES_TOKEN" \
     https://jules.googleapis.com/v1/tasks/391/status
```

*   **If you get a 200 OK with JSON:** The Jules API and your token are working. The problem is with the proxy.
*   **If you get a 401 Unauthorized:** Your `jules_token` is invalid or expired.
*   **If you get a 404 Not Found:** The task `391` does not exist in the Jules API.

## Step 2: Test the Proxy with Minimal Headers
Check if the proxy script itself is accessible and handles basic requests.

```bash
curl -i "https://proxy.2u2.ch/proxy.php?url=https%3A%2F%2Fjules.googleapis.com%2Fv1%2Ftasks%2F391%2Fstatus"
```

*   **Expected Response:** `401 Unauthorized` with a JSON body saying "Missing Authentication header" (if using the recommended script).
*   **If you get a 404 Not Found:** The `proxy.php` file might be missing or in a different directory.
*   **If you get a 500 Internal Server Error:** There is a syntax error in your PHP script or cURL is not installed on the server.

## Step 3: Verify Header Forwarding
Many web servers (like Apache) strip the `Authorization` header before it reaches PHP.

1.  **Check for `X-Authorization`:** The dashboard sends `X-Authorization` as a fallback. Ensure your `proxy.php` is using the robust header detection logic from `CORS_PROXY.md`.
2.  **Test with `curl` using the proxy:**
    ```bash
    curl -i -H "Authorization: Bearer YOUR_JULES_TOKEN" \
         "https://proxy.2u2.ch/proxy.php?url=https%3A%2F%2Fjules.googleapis.com%2Fv1%2Ftasks%2F391%2Fstatus"
    ```
3.  **Check Apache config:** If you are using Apache, add this to your `.htaccess` file:
    ```apache
    SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1
    ```

## Step 4: Inspect Network Logs in Browser
Open Developer Tools (F12) -> **Network** tab and refresh the dashboard.

1.  **Find the `proxy.php` request.**
2.  **Check the "Status":**
    *   `CORS error`: The proxy isn't sending the correct `Access-Control-Allow-Origin` headers.
    *   `404`: The proxy cannot find the target URL.
3.  **Check "Response" tab:** If the proxy returns HTML instead of JSON, your web host is likely intercepting the request with an error page.

## Step 5: Check PHP Error Logs
If the proxy returns a 500 error or a blank page:
1.  Access your server via FTP/SSH.
2.  Look for a file named `error_log` in the same directory as `proxy.php`.
3.  Check for messages like `PHP Fatal error: Call to undefined function curl_init()`. This means you need to enable the PHP cURL extension.

## Step 6: Verify URL Encoding
Ensure the `url` parameter in your fetch call is correctly encoded.
*   `https://jules.googleapis.com/v1/tasks/391/status`
*   Should become: `https%3A%2F%2Fjules.googleapis.com%2Fv1%2Ftasks%2F391%2Fstatus`

If you are using the dashboard's built-in proxy support, this is handled automatically. Check that your **Jules API Base URL** in Settings ends with `proxy.php?url=`.
