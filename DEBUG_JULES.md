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
