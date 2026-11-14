import { createCodecs } from "./codecs.js";
import { processIncoming } from "./process.js";

export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
};

async function runCron(env) {
  try {
    var codecs = await createCodecs();
    var result = await processIncoming(env, codecs);
    console.log(JSON.stringify({ level: "info", event: "cron_done", status: result.status, key: result.key || "", theme: result.theme || "", id: result.id || "" }));
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "cron_failed", message: err && err.message ? err.message : String(err) }));
  }
}
