# Debugging Jules Status

If the Jules status is missing from the dashboard, follow these steps to identify and fix the issue.

## 1. Identify Jules Tasks
The dashboard only attempts to fetch Jules status for items that are identified as Jules tasks. An issue or pull request is considered a Jules task if:
- The assignee is `Jules` (case-insensitive).
- The assignee is `google-labs-jules[bot]`.
- It has a label named `Jules` (case-insensitive).

**Verification:** Check the "Jules" column in the dashboard. If it shows "Token Required", the item is correctly identified but needs authentication. If it shows a dash `-`, it might not be identified correctly.

## 2. Check Authentication
Jules API requires a Bearer token.
- Open the **Settings** (⚙️ icon) in the dashboard.
- Ensure the **Jules API Token** is correctly entered.
- Click **Save & Reload**.

The token is stored in the browser's `localStorage` under the key `jules_token`.

## 3. Inspect Browser Logs
Open your browser's Developer Tools (F12 or Cmd+Option+I) and look at the **Console** tab.

The application logs its progress:
- `Fetching Jules status from: https://jules.googleapis.com/v1/tasks/{number}/status`
- `Jules API response status for issue {number}: {status_code}`
- `Jules API response data for issue {number}: {data}`

**Common Error Indicators:**
- **401 Unauthorized:**
  - Your `jules_token` is invalid or expired.
  - **OR** your CORS proxy is not receiving the `Authorization` header. Many web servers (like Apache) strip this header by default. The dashboard automatically sends an `X-Authorization` header as a fallback. If you are using the proxy from [CORS_PROXY.md](CORS_PROXY.md), ensure you have updated it to the latest version that supports this fallback. See [CORS_PROXY.md](CORS_PROXY.md#troubleshooting-the-authorization-header) for more details.
- **404 Not Found:** This can happen for several reasons:
  - The Jules API does not have a task corresponding to that GitHub issue number.
  - The **Jules API Base URL** in Settings is incorrect. It **must** include the `/v1` suffix (e.g., `https://jules.googleapis.com/v1`).
  - Your CORS proxy is misconfigured. See [CORS_PROXY.md](CORS_PROXY.md) for a robust proxy script.
  - See [Deep Dive: Troubleshooting 404 Not Found](#deep-dive-troubleshooting-404-not-found) below for more details.
- **CORS Errors:** If you see "Access-Control-Allow-Origin" errors, the Jules API might not be configured to allow requests from your current domain (e.g., `localhost` or `github.io`). See [Resolving CORS Errors](#resolving-cors-errors) below.
- **SyntaxError: Unexpected token '<', "<html>..." is not valid JSON:** This usually means your proxy returned an HTML error page (like a 404 or 500 page from your web host) instead of the JSON response from the Jules API. Check the Network tab in your browser's Developer Tools to see the actual content returned by the proxy.

## 4. Resolving CORS Errors
When running the dashboard in a browser, you may need a CORS proxy to access the Jules API.

For detailed instructions on how to set up and configure a CORS proxy, see [CORS_PROXY.md](CORS_PROXY.md).

## 5. Test API with `curl`
You can verify the API and your token independently of the dashboard using `curl`:

```bash
curl -H "Authorization: Bearer YOUR_JULES_TOKEN" \
     https://jules.googleapis.com/v1/tasks/YOUR_ISSUE_NUMBER/status
```

Replace `YOUR_JULES_TOKEN` with your actual token and `YOUR_ISSUE_NUMBER` with the GitHub issue number (e.g., `101`).

**Expected JSON response:**
```json
{
  "status": "Coding",
  "url": "https://example.com/task/123"
}
```
*Note: The API also supports `task_url` instead of `url`.*

## 6. Verify Issue Number Logic
The dashboard uses the repository-specific GitHub issue `number` (e.g., `#55`) as the `issueId` for the Jules API, NOT the global GitHub database `id`.

In `web/src/App.tsx`:
```typescript
const result = await fetchJulesStatus(item.number, julesToken);
```

Ensure the Jules task ID matches the GitHub issue number for the repository currently being viewed.

## Deep Dive: Troubleshooting 404 Not Found

If you encounter a `404 Not Found` error when fetching Jules status, especially when using a CORS proxy, use the following steps to isolate the cause.

### 1. Analyze the Response Headers
Look at the full HTTP response headers (available in the Network tab of your browser's Developer Tools).

**Example of a problematic 404:**
```http
HTTP/1.1 404 Not Found
Server: Apache
Access-Control-Allow-Origin: *
Content-Length: 0
Content-Type: text/html;charset=UTF-8
```

**Key Indicators:**
- **`Access-Control-Allow-Origin: *`**: If this header is present (and it's set by your proxy script), it means the request **successfully reached your proxy script**. The 404 is coming from either the proxy script's logic or the target Jules API.
- **`Content-Length: 0`**: An empty body often suggests that the proxy script successfully executed but the `curl` call to the Jules API failed or returned an empty 404.
- **`Content-Type: text/html`**: If your proxy script is designed to return `application/json` but you see `text/html`, it may mean the web server (Apache/Nginx) intercepted the request or encountered an error before the script could set the correct content type.
- **`Server: Apache`**: This identifies the web server hosting your proxy.

### 2. Verify the Target URL
The most common cause for a 404 is an incorrect target URL. Check the `Fetching Jules status from: ...` log in the browser console.

- **Correct:** `https://jules.googleapis.com/v1/tasks/123/status`
- **Incorrect:** `https://jules.googleapis.com/tasks/123/status` (Missing `/v1`)
- **Incorrect:** `https://jules.googleapis.com/v1/123/status` (Missing `/tasks`)

If you are using the `?url=` parameter in your proxy:
`https://your-proxy.com/proxy.php?url=https%3A%2F%2Fjules.googleapis.com%2Fv1%2Ftasks%2F123%2Fstatus`
Ensure the target URL is fully encoded and correct.

### 3. Test the Jules API Directly
Use `curl` (as described in [Section 5](#5-test-api-with-curl)) to call the Jules API **without the proxy**.

```bash
curl -I -H "Authorization: Bearer YOUR_TOKEN" https://jules.googleapis.com/v1/tasks/YOUR_ISSUE_NUMBER/status
```

- If this returns **404**, then the issue is with the Jules API (e.g., the task doesn't exist for that number).
- If this returns **200**, then the issue is with your **proxy configuration**.

### 4. Debugging the Proxy Script
If the Jules API is fine but the proxy returns 404:

1. **Check PHP Error Logs:** Look at your webserver's error logs (`error_log`) for any PHP warnings or errors during the request.
2. **Check cURL Support:** Ensure `php-curl` is installed and enabled on your server.
3. **Verify Proxy Path Logic:** If you are NOT using `?url=`, your server must support `PATH_INFO`. If it doesn't, the proxy might be trying to reach an invalid URL. Switch to the `?url=` format in your Dashboard Settings to rule this out.
4. **Inspect for Security Filters:** Some hosts use `ModSecurity` or similar tools that might block requests containing URLs in the query string, returning a 404 or 403. Check with your hosting provider if you suspect this.
