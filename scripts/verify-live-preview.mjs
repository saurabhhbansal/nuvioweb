import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";

const url = new URL(process.env.NUVIO_PREVIEW_URL || "https://nuvioweb-preview.pages.dev");
if (!/^https:\/\/(?:[a-z0-9-]+\.)?nuvioweb-preview\.pages\.dev\/$/.test(url.href)) throw new Error("Only the dedicated HTTPS preview project is allowed");
const origin = url.origin;
if (!process.argv[2]) throw new Error("Pass the reviewed local staging directory");
const artifact = resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(join(artifact,"preview-manifest.json"),"utf8"));
const observations = [];
for (const path of ["index.html","app.bundle.js","sw.js","nuvio.env.js","SOURCE.txt","LICENSE.txt","UPSTREAM_SOURCES.md","third-party/dashjs/dist/dash.all.min.js.LICENSE.txt","third-party/core-js/LICENSE","third-party/jszip/LICENSE.markdown"]) {
  const response = await fetch(`${origin}/${path}`,{signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200,path);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash("sha256").update(bytes).digest("hex"),manifest.files.find((entry)=>entry.path === path)?.sha256,path);
  const cacheControl = response.headers.get("cache-control");
  assert.match(cacheControl,/no-cache/);
  if (["sw.js","nuvio.env.js"].includes(path)) assert.match(cacheControl,/no-store/);
  assert.equal(response.headers.get("x-content-type-options"),"nosniff");
  observations.push({path,status:response.status,cacheControl,hashMatched:true});
}
for (const path of ["/missing.js","/api/unavailable"]) assert.equal((await fetch(origin+path,{signal:AbortSignal.timeout(20000)})).status,404,path);
assert.equal((await fetch(`https://github.com/saurabhhbansal/nuvioweb/tree/${manifest.revision}`,{signal:AbortSignal.timeout(20000)})).status,200,"matching source URL");

const browser = await chromium.launch();
try {
  const context = await browser.newContext({serviceWorkers:"allow"});
  const blockedExternalOrigins = new Set();
  await context.route("**/*",async (route)=> {
    const requestOrigin = new URL(route.request().url()).origin;
    if (requestOrigin === origin) await route.continue();
    else { blockedExternalOrigins.add(requestOrigin); await route.abort("blockedbyclient"); }
  });
  const page = await context.newPage();
  const pageErrors = []; page.on("pageerror",(error)=>pageErrors.push(error.message));
  await page.goto(`${origin}/`);
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),{timeout:45000}).toBe(true);
  const cacheNames = await page.evaluate(()=>caches.keys());
  assert.ok(cacheNames.some((key)=>key.startsWith("nuvio-app-shell-")));
  await page.locator('[data-action="continueGuest"]').click();
  await expect(page.locator("#home")).toBeVisible();
  for (const [label,screen] of [["Search","search"],["Library","library"],["Settings","settings"]]) {
    await page.getByRole("button",{name:label,exact:true}).click();
    await expect(page.locator(`#${screen}`)).toBeVisible();
  }
  await page.reload();
  await expect(page.locator("#profileSelection")).toBeVisible();
  await expect(page.locator('#profileSelection [data-profile-id="1"]')).toContainText("Profile 1");
  assert.deepEqual(pageErrors,[]);
  const aliasPage = await context.newPage(); await aliasPage.goto(`${origin}/library`);
  await expect(aliasPage.locator("#profileSelection")).toBeVisible();
  const report = {url:origin,sourceRevision:manifest.revision,browser:browser.version(),observations,missingAssetApi404:true,matchingSourceReachable:true,automaticWorkerController:true,cacheNames,guestNavigationReload:true,aliasRoute:true,pageErrors,blockedExternalOrigins:[...blockedExternalOrigins],limits:"No live login/sync, populated catalog, media playback, offline completeness or other-browser claim."};
  if (process.env.NUVIO_PREVIEW_REPORT) await writeFile(process.env.NUVIO_PREVIEW_REPORT,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
