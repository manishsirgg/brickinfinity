import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";

const { outputText } = ts.transpileModule(fs.readFileSync("src/lib/storage/uploadVideo.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});

async function run(outcome, signedIn = true) {
  const progress = [];
  let sent = false;
  const exports = {};
  class Request {
    upload = {};
    status = outcome === "denied" ? 403 : 200;
    responseText = '{"message":"Storage permission denied"}';
    open(method, url) {
      assert.equal(method, "POST");
      assert.ok(url.endsWith("/property-media/property/video/test%20video.mp4"));
    }
    setRequestHeader(name, value) {
      if (name === "Authorization") assert.equal(value, "Bearer test-session");
    }
    send() {
      sent = true;
      this.upload.onprogress({ lengthComputable: true, loaded: 25, total: 100 });
      this.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
      if (outcome === "timeout") this.ontimeout();
      else if (outcome === "network") this.onerror();
      else this.onload();
    }
  }
  vm.runInNewContext(outputText, {
    exports, XMLHttpRequest: Request,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key" } },
    require: () => ({ createClient: () => ({ auth: { getSession: async () => ({ data: { session: signedIn ? { access_token: "test-session" } : null }, error: null }) } }) }),
  });
  const promise = exports.uploadVideo("property/video/test video.mp4", { type: "video/mp4" }, percent => progress.push(percent));
  if (!signedIn) {
    await assert.rejects(promise, /Session expired/);
    assert.equal(sent, false);
  } else if (outcome === "ok") {
    await promise;
    assert.deepEqual(progress, [0, 25, 99, 100]);
  } else {
    await assert.rejects(promise, outcome === "denied" ? /Storage permission denied/ : outcome === "timeout" ? /timed out/ : /lost its connection/);
    assert.ok(!progress.includes(100), "failed uploads must not report success");
  }
}
for (const outcome of ["ok", "denied", "timeout", "network"]) await run(outcome);
await run("ok", false);
console.log("Video upload checks passed: real progress events, authorization, network failure, timeout and missing session.");
