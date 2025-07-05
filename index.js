const KEY_PREFIX_METADATA = "excalidraw-canvas-meta:";
const KEY_PREFIX_DATA = "excalidraw-canvas-data:";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    // Authorization check
    if (!isAuthorized(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }

    // A simple router.
    try {
      if (url.pathname === "/api/canvases") {
        if (request.method === "GET") {
          return await handleListCanvases({ env });
        }
        if (request.method === "POST") {
          return await handleCreateCanvas({ request, env });
        }
      } else if (url.pathname.startsWith("/api/canvases/")) {
        const id = url.pathname.split("/")[3];
        if (!id) {
          return new Response("Not Found", { status: 404 });
        }
        const params = { id };
        if (request.method === "GET") {
          return await handleLoadCanvas({ env, params });
        }
        if (request.method === "PUT") {
          return await handleSaveCanvas({ request, env, params });
        }
        if (request.method === "DELETE") {
          return await handleDeleteCanvas({ env, params });
        }
        if (request.method === "PATCH") {
          return await handleRenameCanvas({ request, env, params });
        }
      }
    } catch (err) {
      console.error(err);
      return new Response(err.message, { status: 500 });
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
    const respHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    return new Response(null, { headers: respHeaders });
  } else {
    return new Response(null, {
      headers: { Allow: "GET, POST, PUT, DELETE, PATCH, OPTIONS" },
    });
  }
}

async function handleListCanvases({ env }) {
  const list = await env.EXCALIDRAW_KV.list({ prefix: KEY_PREFIX_METADATA });
  if (!list.keys || list.keys.length === 0) {
    return setCorsHeaders(
      new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  const metadataPromises = list.keys.map((key) =>
    env.EXCALIDRAW_KV.get(key.name, "json"),
  );
  const metadata = await Promise.all(metadataPromises);

  const filteredMetadata = metadata.filter((m) => m !== null);

  return setCorsHeaders(
    new Response(JSON.stringify(filteredMetadata), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function handleCreateCanvas({ request, env }) {
  const data = await request.json();
  const newId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Thumbnail generation is skipped on the worker side.
  const newMetadata = {
    id: newId,
    name: data.appState?.name || "Untitled Canvas",
    createdAt: now,
    updatedAt: now,
    userId: 0, // Placeholder
    thumbnail: undefined,
  };

  const metadataKey = `${KEY_PREFIX_METADATA}${newId}`;
  const dataKey = `${KEY_PREFIX_DATA}${newId}`;

  await env.EXCALIDRAW_KV.put(metadataKey, JSON.stringify(newMetadata));
  await env.EXCALIDRAW_KV.put(dataKey, JSON.stringify(data));

  return setCorsHeaders(
    new Response(JSON.stringify(newMetadata), {
      headers: { "Content-Type": "application/json" },
      status: 201,
    }),
  );
}

async function handleLoadCanvas({ env, params }) {
  const { id } = params;
  const key = `${KEY_PREFIX_DATA}${id}`;

  const data = await env.EXCALIDRAW_KV.get(key, "json");
  if (!data) {
    return setCorsHeaders(new Response("Canvas not found", { status: 404 }));
  }

  return setCorsHeaders(
    new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function handleSaveCanvas({ request, env, params }) {
  const { id } = params;
  const data = await request.json();
  const metadataKey = `${KEY_PREFIX_METADATA}${id}`;
  const existingMetadata = await env.EXCALIDRAW_KV.get(metadataKey, "json");
  if (!existingMetadata) {
    return setCorsHeaders(
      new Response("Canvas metadata not found. Cannot save.", { status: 404 }),
    );
  }

  const updatedMetadata = {
    ...existingMetadata,
    name: data.appState?.name || existingMetadata.name,
    updatedAt: new Date().toISOString(),
  };

  const dataKey = `${KEY_PREFIX_DATA}${id}`;
  await env.EXCALIDRAW_KV.put(metadataKey, JSON.stringify(updatedMetadata));
  await env.EXCALIDRAW_KV.put(dataKey, JSON.stringify(data));

  return setCorsHeaders(new Response(null, { status: 204 }));
}

async function handleDeleteCanvas({ env, params }) {
  const { id } = params;
  const metadataKey = `${KEY_PREFIX_METADATA}${id}`;
  const dataKey = `${KEY_PREFIX_DATA}${id}`;
  await env.EXCALIDRAW_KV.delete(metadataKey);
  await env.EXCALIDRAW_KV.delete(dataKey);
  return setCorsHeaders(new Response(null, { status: 204 }));
}

async function handleRenameCanvas({ request, env, params }) {
  const { id } = params;
  const { name: newName } = await request.json();
  if (!newName) {
    return setCorsHeaders(new Response("New name not provided", { status: 400 }));
  }

  const metadataKey = `${KEY_PREFIX_METADATA}${id}`;
  const dataKey = `${KEY_PREFIX_DATA}${id}`;
  const [metadata, data] = await Promise.all([
    env.EXCALIDRAW_KV.get(metadataKey, "json"),
    env.EXCALIDRAW_KV.get(dataKey, "json"),
  ]);

  if (!metadata) {
    return setCorsHeaders(
      new Response("Canvas metadata not found. Cannot rename.", { status: 404 }),
    );
  }
  if (!data) {
    return setCorsHeaders(
      new Response("Canvas data not found. Cannot rename.", { status: 404 }),
    );
  }

  const updatedMetadata = {
    ...metadata,
    name: newName,
    updatedAt: new Date().toISOString(),
  };
  const updatedData = {
    ...data,
    appState: { ...data.appState, name: newName },
  };

  await env.EXCALIDRAW_KV.put(metadataKey, JSON.stringify(updatedMetadata));
  await env.EXCALIDRAW_KV.put(dataKey, JSON.stringify(updatedData));

  return setCorsHeaders(new Response(null, { status: 204 }));
} 