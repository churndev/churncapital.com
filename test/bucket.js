export function memoryBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, options = {}) {
      const bytes = typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body);
      objects.set(key, {
        key,
        bytes,
        httpMetadata: options.httpMetadata || {},
        customMetadata: options.customMetadata || {},
        uploaded: options.uploaded || new Date(),
      });
      return { key };
    },
    async get(key) {
      const obj = objects.get(key);
      if (!obj) return null;
      return {
        key,
        size: obj.bytes.byteLength,
        httpMetadata: obj.httpMetadata,
        customMetadata: obj.customMetadata,
        uploaded: obj.uploaded,
        async arrayBuffer() {
          return obj.bytes.buffer.slice(obj.bytes.byteOffset, obj.bytes.byteOffset + obj.bytes.byteLength);
        },
        async text() {
          return new TextDecoder().decode(obj.bytes);
        },
        writeHttpMetadata(headers) {
          if (obj.httpMetadata.contentType) headers.set("content-type", obj.httpMetadata.contentType);
          if (obj.httpMetadata.cacheControl) headers.set("cache-control", obj.httpMetadata.cacheControl);
        },
      };
    },
    async head(key) {
      const obj = objects.get(key);
      if (!obj) return null;
      return { key, size: obj.bytes.byteLength, uploaded: obj.uploaded, httpMetadata: obj.httpMetadata };
    },
    async delete(key) {
      objects.delete(key);
    },
    async list({ prefix, cursor } = {}) {
      const list = [];
      for (const obj of objects.values()) {
        if (!prefix || obj.key.startsWith(prefix)) {
          list.push({ key: obj.key, size: obj.bytes.byteLength, uploaded: obj.uploaded });
        }
      }
      return { objects: list, truncated: false, cursor };
    },
  };
}
