export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetBase = "http://192.168.0.242:8188";
    
    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE, PUT",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    try {
      // 2. Prepare the forwarded request to ComfyUI
      const targetUrl = targetBase + url.pathname + url.search;
      
      const forwardedRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : null,
        redirect: "manual",
      });

      // 3. Fetch from ComfyUI
      const response = await fetch(forwardedRequest);

      // 4. Create a new response with CORS headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Access-Control-Allow-Origin", "*");
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });

    } catch (err) {
      console.error("Proxy error:", err);
      return new Response(JSON.stringify({ error: "Proxy connection failed: " + err.message }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
};
