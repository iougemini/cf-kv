const KEY_PREFIX_METADATA = "excalidraw-canvas-meta:";
const KEY_PREFIX_DATA = "excalidraw-canvas-data:";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    if (!isAuthorized(request, env)) {
      return setCorsHeaders(new Response("Unauthorized", { status: 401 }));
    }

    try {
      const pathname = url.pathname;

      if (pathname === "/keys") {
        return await handleListKeys(request, env);
      }

      if (pathname.startsWith("/values/")) {
        const key = url.pathname.substring("/values/".length);
        const { id } = parseKey(key);
        if (!id) {
          return setCorsHeaders(new Response("Invalid key format", { status: 400 }));
        }
        const doId = env.CANVAS_OBJECT.idFromName(id);
        const stub = env.CANVAS_OBJECT.get(doId);
        return await stub.fetch(request);
      }
      
      if (pathname === "/bulk") {
         const payload = await request.clone().json();
         const keys = request.method === 'DELETE' ? payload : payload.map(item => item.key);

         if (!keys || keys.length === 0) {
            return setCorsHeaders(new Response("Empty bulk operation", { status: 400 }));
         }

         const firstId = parseKey(keys[0]).id;
         if (!firstId) {
            return setCorsHeaders(new Response("Invalid key in bulk operation", { status: 400 }));
         }
         
         if (!keys.every(key => parseKey(key).id === firstId)) {
             return setCorsHeaders(new Response("Bulk operations must target a single canvas ID", { status: 400 }));
         }

         const doId = env.CANVAS_OBJECT.idFromName(firstId);
         const stub = env.CANVAS_OBJECT.get(doId);
         return await stub.fetch(request);
      }
    } catch (err) {
      console.error(err);
      return setCorsHeaders(new Response(err.message || "Server Error", { status: 500 }));
    }

    return setCorsHeaders(new Response("Not Found", { status: 404 }));
  },
};

export class IndexObject {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (pathname === "/list") {
        const index = (await this.state.storage.get("index")) || {};
        const keys = Object.values(index).map((meta) => ({
          name: `${KEY_PREFIX_METADATA}${meta.id}`,
        }));
        const responseBody = {
          result: keys,
          success: true,
          errors: [],
          messages: [],
          result_info: { count: keys.length },
        };
        return setCorsHeaders(new Response(JSON.stringify(responseBody), { headers: { "Content-Type": "application/json" } }));
      }

      if (request.method === "POST") {
        const { id, metadata } = await request.json();
        const index = (await this.state.storage.get("index")) || {};
        if (pathname === "/add") {
          index[id] = metadata;
        } else if (pathname === "/remove") {
          delete index[id];
        }
        await this.state.storage.put("index", index);
        return setCorsHeaders(new Response("OK"));
      }
    } catch(e) {
        return setCorsHeaders(new Response(e.message, { status: 500 }));
    }
    return setCorsHeaders(new Response("Not found in IndexObject", { status: 404 }));
  }
}

export class CanvasObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    try {
        if (pathname.startsWith("/values/")) {
            return this.handleGetValue(request);
        } else if (pathname === "/bulk") {
            if (request.method === "PUT") {
                return this.handleBulkPut(request);
            }
            if (request.method === "DELETE") {
                return this.handleBulkDelete(request);
            }
        }
    } catch (e) {
        return setCorsHeaders(new Response(e.message, {status: 500}));
    }
    return setCorsHeaders(new Response("Not found in DO", {status: 404}));
  }

  async handleGetValue(request) {
    const url = new URL(request.url);
    const key = url.pathname.substring("/values/".length);
    const value = await this.state.storage.get(key);
    
    if (value === undefined) {
      return setCorsHeaders(new Response("Not Found", { status: 404 }));
    }
    return setCorsHeaders(new Response(value, { headers: { "Content-Type": "application/json" } }));
  }

  async handleBulkPut(request) {
    const payload = await request.json();
    let metaDataFromPayload = null;
    let keyForId = null;
    
    await this.state.storage.put(payload.reduce((obj, item) => {
        if (item.key.startsWith(KEY_PREFIX_METADATA)) {
            metaDataFromPayload = item.value;
            keyForId = item.key;
        }
        obj[item.key] = item.value;
        return obj;
    }, {}));
    
    if (metaDataFromPayload) {
        const { id } = parseKey(keyForId);
        const indexId = this.env.INDEX_OBJECT.idFromName("global-index");
        const indexStub = this.env.INDEX_OBJECT.get(indexId);
        await indexStub.fetch("https://index/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, metadata: JSON.parse(metaDataFromPayload) })
        });
    }

    return setCorsHeaders(new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } }));
  }

  async handleBulkDelete(request) {
    const keysToDelete = await request.json();
    await this.state.storage.delete(keysToDelete);
    
    const metaKey = keysToDelete.find(k => k.startsWith(KEY_PREFIX_METADATA));
    if (metaKey) {
        const { id } = parseKey(metaKey);
        const indexId = this.env.INDEX_OBJECT.idFromName("global-index");
        const indexStub = this.env.INDEX_OBJECT.get(indexId);
        await indexStub.fetch("https://index/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
        });
    }

    return setCorsHeaders(new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } }));
  }
}

function parseKey(key) {
    if (key.startsWith(KEY_PREFIX_METADATA)) {
        return { id: key.substring(KEY_PREFIX_METADATA.length), type: 'metadata' };
    }
    if (key.startsWith(KEY_PREFIX_DATA)) {
        return { id: key.substring(KEY_PREFIX_DATA.length), type: 'data' };
    }
    return { id: null, type: null };
}

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
  if (
    request.headers.get("Origin") !== null &&
    request.headers.get("Access-Control-Request-Method") !== null &&
    request.headers.get("Access-Control-Request-Headers") !== null
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

async function handleListKeys(request, env) {
  const indexId = env.INDEX_OBJECT.idFromName("global-index");
  const indexStub = env.INDEX_OBJECT.get(indexId);
  const response = await indexStub.fetch("https://index/list");
  return setCorsHeaders(response);
} 