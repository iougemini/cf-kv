const KEY_PREFIX_METADATA = "excalidraw-canvas-meta:";
const KEY_PREFIX_DATA = "excalidraw-canvas-data:";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    // All incoming requests must be authorized
    if (!isAuthorized(request, env)) {
      const response = new Response("Unauthorized", { status: 401 });
      return setCorsHeaders(response);
    }

    try {
      const pathname = url.pathname;

      if (pathname.startsWith("/values/")) {
        return await handleGetValue(request, env);
      } else if (pathname === "/keys") {
        return await handleListKeys(request, env);
      } else if (pathname === "/bulk") {
        if (request.method === "PUT") {
          return await handleBulkPut(request, env);
        }
        if (request.method === "DELETE") {
          return await handleBulkDelete(request, env);
        }
      }
    } catch (err) {
      console.error(err);
      const response = new Response(err.message || "Server Error", { status: 500 });
      return setCorsHeaders(response);
    }

    const response = new Response("Not Found", { status: 404 });
    return setCorsHeaders(response);
  },
};

function isAuthorized(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.substring(7); // "Bearer ".length
  return token === env.API_TOKEN;
}

function setCorsHeaders(response) {
  const corsResponse = new Response(response.body, response);
  corsResponse.headers.set("Access-Control-Allow-Origin", "*");
  corsResponse.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );
  corsResponse.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  return corsResponse;
}

function handleOptions(request) {
  const headers = request.headers;
  if (
    headers.get("Origin") !== null &&
    headers.get("Access-Control-Request-Method") !== null &&
    headers.get("Access-Control-Request-Headers") !== null
  ) {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } else {
    return new Response(null, {
      headers: { Allow: "GET, POST, PUT, DELETE, PATCH, OPTIONS" },
    });
  }
}

async function handleGetValue(request, env) {
  const url = new URL(request.url);
  const key = url.pathname.substring("/values/".length);
  if (!key) {
    return setCorsHeaders(new Response("Key not specified", { status: 400 }));
  }

  const value = await env.EXCALIDRAW_KV.get(key);

  if (value === null) {
    return setCorsHeaders(new Response("Not Found", { status: 404 }));
  }

  const response = new Response(value, {
    headers: { "Content-Type": "application/json" },
  });
  return setCorsHeaders(response);
}

async function handleListKeys(request, env) {
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || "";
  const list = await env.EXCALIDRAW_KV.list({ prefix });

  const responseBody = {
    result: list.keys,
    success: true,
    errors: [],
    messages: [],
    result_info: {
      count: list.keys.length,
    },
  };
  
  const response = new Response(JSON.stringify(responseBody), {
    headers: { "Content-Type": "application/json" },
  });
  return setCorsHeaders(response);
}

async function handleBulkPut(request, env) {
    const payload = await request.json();
    if (!Array.isArray(payload)) {
        return setCorsHeaders(new Response("Request body must be an array", { status: 400 }));
    }

    const putPromises = payload.map(item => {
        if (!item.key || item.value === undefined) {
            throw new Error("Each item in bulk put must have a key and value");
        }
        return env.EXCALIDRAW_KV.put(item.key, item.value);
    });

    await Promise.all(putPromises);
    
    const response = new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
    });
    return setCorsHeaders(response);
}

async function handleBulkDelete(request, env) {
    const keysToDelete = await request.json();
    if (!Array.isArray(keysToDelete)) {
        return setCorsHeaders(new Response("Request body must be an array of keys", { status: 400 }));
    }

    const deletePromises = keysToDelete.map(key => env.EXCALIDRAW_KV.delete(key));

    await Promise.all(deletePromises);
    
    const response = new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
    });
    return setCorsHeaders(response);
} 