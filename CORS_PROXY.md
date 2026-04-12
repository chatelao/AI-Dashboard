# Configuring a CORS Proxy for Jules API

When running the AI Development Dashboard from a web browser (e.g., on GitHub Pages), you may encounter **CORS (Cross-Origin Resource Sharing)** errors when the browser attempts to fetch data from `https://jules.googleapis.com`. This happens because the Jules API does not explicitly allow requests from your dashboard's domain.

## Understanding the Error

In the browser console, you might see errors like:
> Access to fetch at 'https://jules.googleapis.com/v1/tasks/...' from origin 'https://yourname.github.io' has been blocked by CORS policy.

## Solution: Use a CORS Proxy

A CORS proxy acts as an intermediary. Your browser sends the request to the proxy, which then forwards it to the Jules API. The proxy adds the necessary `Access-Control-Allow-Origin` headers to the response, allowing your browser to receive the data.

### Option 1: Cloudflare Workers (Recommended)

Cloudflare Workers provide a free and secure way to set up your own proxy.

1.  **Create a Worker:** Sign up for a free Cloudflare account and create a new Worker.
2.  **Add the Code:** Use the following minimal script:

```javascript
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  // Extract the target path from the proxy request
  // Example: your-proxy.workers.dev/v1/tasks/1/status -> jules.googleapis.com/v1/tasks/1/status
  const targetUrl = 'https://jules.googleapis.com' + url.pathname

  // Forward the request with original headers and method
  let response = await fetch(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body
  })

  // Add CORS headers to the response
  response = new Response(response.body, response)
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', '*')

  return response
}
```

3.  **Deploy:** Save and deploy your worker. It will give you a URL like `https://your-proxy.yourname.workers.dev`.
4.  **Update Dashboard:**
    - Open the dashboard **Settings** (⚙️ icon).
    - Update the **Jules API Base URL** to your worker URL (e.g., `https://your-proxy.yourname.workers.dev/v1`).
    - Click **Save & Reload**.

### Option 2: Local Proxy (For Development)

If you are running the dashboard locally, you can use a tool like `cors-anywhere`.

```bash
npx cors-anywhere
```
By default, this runs on `http://localhost:8080`. You would then set your **Jules API Base URL** to `http://localhost:8080/https://jules.googleapis.com/v1`.

---

## Important Security Note

**Never use public, third-party CORS proxies** (like `cors-anywhere.herokuapp.com`) for the Jules API. These proxies can see your **Jules API Token** sent in the `Authorization` header. Always use a proxy that you control.
