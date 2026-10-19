import { test, expect } from "@playwright/test";

const provider = "http://127.0.0.1:4373";
test.beforeEach(async ({ context,request }) => {
  await request.delete(`${provider}/__fixture/requests`);
  await context.route("**/*",async (route)=> {
    if (["http://127.0.0.1:4371",provider].includes(new URL(route.request().url()).origin)) await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("actual imported repositories parse legal manifest/catalog/meta/stream/subtitle resources without leaking session credentials",async ({ page,request })=> {
  await page.goto("/__fixture/harness");
  const result = await page.evaluate(async (provider)=> {
    localStorage.setItem("access_token","synthetic-fixture-token-not-a-real-session");
    localStorage.setItem("refresh_token","synthetic-fixture-refresh-not-real");
    const { addonRepository } = await import("/__fixture/source/js/data/repository/addonRepository.js");
    const { catalogRepository } = await import("/__fixture/source/js/data/repository/catalogRepository.js");
    const { metaRepository } = await import("/__fixture/source/js/data/repository/metaRepository.js");
    const { streamRepository } = await import("/__fixture/source/js/data/repository/streamRepository.js");
    const { SubtitleApi } = await import("/__fixture/source/js/data/remote/api/subtitleApi.js");
    const manifests = [];
    for (const base of ["basic","objects","configured/sample"]) manifests.push(await addonRepository.fetchAddon(`${provider}/${base}/manifest.json`));
    const catalog = await catalogRepository.getCatalog({addonBaseUrl:`${provider}/basic`,addonId:"fixture-basic",catalogId:"original",type:"movie",supportsSkip:false});
    const meta = await metaRepository.getMeta(`${provider}/basic`,"movie","fixture:original");
    const streams = await streamRepository.getStreamsFromAddon(`${provider}/basic`,"movie","fixture:original");
    const subtitles = await SubtitleApi.getSubtitles(`${provider}/basic/subtitles/movie/fixture:original.json`);
    return {manifests,catalog,meta,streams,subtitles};
  },provider);
  for (const manifest of result.manifests) {
    expect(manifest.status).toBe("success");
    expect(manifest.data.resources.map((resource)=>resource.name)).toEqual(["catalog","meta","stream","subtitles"]);
  }
  expect(result.catalog.status).toBe("success");
  expect(result.catalog.data.items[0]).toMatchObject({id:"fixture:original",name:"Original Legal Fixture"});
  expect(result.meta.data).toMatchObject({id:"fixture:original",name:"Original Legal Fixture"});
  expect(result.streams.status).toBe("success");
  expect(result.streams.data[0].url).toBe(`${provider}/media/procedural-vp8-opus.webm`);
  expect(result.subtitles.subtitles[0].url).toBe(`${provider}/media/english.vtt`);
  const requests = await (await request.get(`${provider}/__fixture/requests`)).json();
  expect(requests.length).toBeGreaterThan(5);
  expect(requests.every((request)=>!request.authorizationPresent && !request.apiKeyPresent)).toBe(true);
});

test("real browser CORS, malformed JSON, provider failure and catalog abort produce explicit error results",async ({ page })=> {
  await page.goto("/__fixture/harness");
  const result = await page.evaluate(async (provider)=> {
    const { addonRepository } = await import("/__fixture/source/js/data/repository/addonRepository.js");
    const { catalogRepository } = await import("/__fixture/source/js/data/repository/catalogRepository.js");
    const manifests = {};
    for (const base of ["cors-denied","malformed","failure"]) manifests[base] = await addonRepository.fetchAddon(`${provider}/${base}`);
    const aborted = await catalogRepository.getCatalog({addonBaseUrl:`${provider}/timeout`,addonId:"timeout",catalogId:"original",type:"movie",signal:AbortSignal.timeout(50)});
    const slow = await addonRepository.fetchAddon(`${provider}/slow`);
    const empty = await catalogRepository.getCatalog({addonBaseUrl:`${provider}/empty`,addonId:"empty",catalogId:"original",type:"movie"});
    return {manifests,aborted,slow,empty};
  },provider);
  for (const resultValue of Object.values(result.manifests)) expect(resultValue).toMatchObject({status:"error",message:expect.any(String)});
  expect(result.aborted).toMatchObject({status:"error",message:expect.any(String)});
  expect(result.slow.status).toBe("success");
  expect(result.empty.data.items).toEqual([]);
});

async function openAddonSettings(page) {
  await page.goto("/");
  await page.locator('[data-action="continueGuest"]').click();
  await navigateAddonSettings(page);
}

async function navigateAddonSettings(page) {
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.locator('[data-focus-key="nav:contentDiscovery"]').click();
  await page.locator('[data-focus-key="contentDiscovery:addons"]').click();
  await expect(page.locator("#desktop-addon-url")).toBeVisible();
}

test("guest installs and toggles a legal HTTP add-on through the real bundled settings UI",async ({ page,context })=> {
  await context.addInitScript(()=>{
    if (!localStorage.getItem("installedAddonUrls")) localStorage.setItem("installedAddonUrls",JSON.stringify({__profileScoped:true,version:1,profiles:{"1":[]}}));
  });
  await openAddonSettings(page);
  await page.locator("#desktop-addon-url").fill(`${provider}/basic/manifest.json`);
  await page.getByRole("button",{name:"Add Addon",exact:true}).click();
  const card = page.locator("[data-addon-card]").filter({has:page.getByRole("heading",{name:"Legal Fixture",exact:true})});
  await expect(card).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await card.getByText("Enabled",{exact:true}).click();
  await expect(card.locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(card).toHaveClass(/is-disabled/);
  await card.getByText("Disabled",{exact:true}).click();
  await expect(card.locator('input[type="checkbox"]')).toBeChecked();
  await expect(card).not.toHaveClass(/is-disabled/);
  await page.reload();
  await page.locator('#profileSelection [data-profile-id="1"]').click();
  await expect(page.getByRole("heading",{name:"Choose a player",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Skip setup",exact:true}).click();
  await expect(page.locator("#home")).toBeVisible();
  await navigateAddonSettings(page);
  await expect(card).toBeVisible();
  await expect(card.locator('input[type="checkbox"]')).toBeChecked();
});

test("guest browses the legal catalog, opens detail and starts original fixture playback",async ({ page,context })=> {
  await context.addInitScript((provider)=>localStorage.setItem("installedAddonUrls",JSON.stringify({__profileScoped:true,version:1,profiles:{"1":[`${provider}/basic`]}})),provider);
  await page.goto("/");
  await page.locator('[data-action="continueGuest"]').click();
  await expect(page.locator("#home")).toBeVisible();
  const card = page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("heading",{name:"Original Legal Fixture",exact:true})).toBeVisible();
  await page.locator('button[data-action="playDefault"]').click();
  const stream = page.locator('[data-action="playStream"]').filter({hasText:"Original local VP8/Opus"});
  await expect(stream).toBeVisible();
  await stream.click();
  await expect.poll(()=>page.locator("video").evaluate((video)=>({width:video.videoWidth,height:video.videoHeight,error:video.error?.code || null}))).toEqual({width:640,height:360,error:null});
  await expect.poll(()=>page.locator("video").evaluate((video)=>video.currentTime)).toBeGreaterThan(0.1);
});

test("settings visibly rejects CORS, malformed, invalid-shape and unsafe-looking provider errors",async ({ page,context })=> {
  await context.addInitScript(()=>localStorage.setItem("installedAddonUrls",JSON.stringify({__profileScoped:true,version:1,profiles:{"1":[]}})));
  await openAddonSettings(page);
  for (const [scenario,message] of [["cors-denied",/Could not reach the add-on server/i],["malformed",/invalid JSON response/i],["shape",/manifest is not valid/i],["failure",/Fixture provider unavailable/]]) {
    await page.locator("#desktop-addon-url").fill(`${provider}/${scenario}/manifest.json`);
    await page.getByRole("button",{name:"Add Addon",exact:true}).click();
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.getByRole("alert")).not.toContainText(/Failed to fetch|NetworkError|is not a function|Cannot read propert/i);
    await expect(page.getByRole("status")).toHaveText("The addon was not added.");
    await expect(page.getByRole("button",{name:"Add Addon",exact:true})).toBeEnabled();
    await expect(page.locator("[data-addon-card]")).toHaveCount(0);
  }
  await expect(page.getByRole("alert").locator("img")).toHaveCount(0);
  expect(await page.evaluate(()=>globalThis.__fixtureInjected)).toBeUndefined();
});

test("profile-scoped add-on snapshots preserve local isolation and partial source results remain inspectable",async ({ page })=> {
  await page.goto("/__fixture/harness");
  const result = await page.evaluate(async (provider)=> {
    const { ProfileManager } = await import("/__fixture/source/js/core/profile/profileManager.js");
    const { addonRepository } = await import("/__fixture/source/js/data/repository/addonRepository.js");
    const { streamRepository } = await import("/__fixture/source/js/data/repository/streamRepository.js");
    const { catalogRepository } = await import("/__fixture/source/js/data/repository/catalogRepository.js");
    localStorage.setItem("installedAddonUrls",JSON.stringify({__profileScoped:true,version:1,profiles:{"1":[`${provider}/basic`],"2":[`${provider}/objects`]}}));
    await ProfileManager.setActiveProfile("1");
    addonRepository.setAddonEnabledStates([{url:`${provider}/basic`,enabled:false}]);
    const first = addonRepository.getSyncSnapshot();
    await ProfileManager.setActiveProfile("2");
    const second = addonRepository.getSyncSnapshot();
    await ProfileManager.setActiveProfile("1");
    const restored = addonRepository.getSyncSnapshot();
    const success = await streamRepository.getStreamsFromAddon(`${provider}/basic`,"movie","fixture:original");
    const failure = await streamRepository.getStreamsFromAddon(`${provider}/failure`,"movie","fixture:original");
    const search = await catalogRepository.getCatalog({addonBaseUrl:`${provider}/basic`,addonId:"search",catalogId:"original",type:"movie",extraArgs:{search:"Original Legal"}});
    const nextPage = await catalogRepository.getCatalog({addonBaseUrl:`${provider}/basic`,addonId:"next-page",catalogId:"original",type:"movie",skip:100});
    return {first,second,restored,success,failure,search,nextPage};
  },provider);
  expect(result.first.urls).toEqual([`${provider}/basic`]);
  expect(result.first.enabled[`${provider}/basic`]).toBe(false);
  expect(result.second.urls).toEqual([`${provider}/objects`]);
  expect(result.restored).toEqual(result.first);
  expect(result.success.data).toHaveLength(1);
  expect(result.failure).toMatchObject({status:"error",message:expect.stringContaining("Fixture provider unavailable")});
  expect(result.search.data.items).toHaveLength(1);
  expect(result.nextPage.data.items).toEqual([]);
});

for (const duplicateName of [false,true]) {
test(`a failing source stays visible alongside working streams and recovers on retry${duplicateName ? " with duplicate custom names" : ""}`,async ({ page,context,request },testInfo)=> {
  await context.addInitScript((provider)=>localStorage.setItem("installedAddonUrls",JSON.stringify({__profileScoped:true,version:1,profiles:{"1":[`${provider}/basic`,`${provider}/partial`]}})),provider);
  if (duplicateName) {
    await page.goto("/__fixture/harness");
    await page.evaluate(async (provider)=> {
      const { ProfileManager } = await import("/__fixture/source/js/core/profile/profileManager.js");
      const { addonRepository } = await import("/__fixture/source/js/data/repository/addonRepository.js");
      await ProfileManager.setActiveProfile("1");
      addonRepository.setAddonDisplayNameOverrides([{url:`${provider}/partial`,name:"Legal Fixture"}]);
    },provider);
  }
  await page.goto("/");
  await page.locator('[data-action="continueGuest"]').click();
  await page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first().click();
  await expect(page.getByRole("heading",{name:"Original Legal Fixture",exact:true})).toBeVisible();
  await page.clock.install();
  await page.locator('button[data-action="playDefault"]').click();
  await expect(page.locator('[data-action="playStream"]').filter({hasText:"Original local VP8/Opus"})).toBeVisible();
  const status = page.getByRole("status").filter({hasText:duplicateName ? "Legal Fixture" : "Partial Provider Fixture"});
  await expect(status).toContainText("No playable results");
  await page.clock.fastForward(3000);
  await expect(status).toBeVisible();
  await expect(page.getByRole("button",{name:"Refresh sources",exact:true})).toBeEnabled();
  const layout = [];
  for (const viewport of [{width:1280,height:800},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await expect(status).toBeVisible();
    const metrics = await status.evaluate((node)=>({width:node.getBoundingClientRect().width,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,fontSize:getComputedStyle(node).fontSize,color:getComputedStyle(node).color}));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    layout.push({viewport,...metrics});
    await page.screenshot({path:testInfo.outputPath(`partial-${viewport.width}.png`)});
  }
  await testInfo.attach("status-layout",{body:JSON.stringify(layout),contentType:"application/json"});
  await request.post(`${provider}/__fixture/partial-recovery`);
  await page.getByRole("button",{name:"Refresh sources",exact:true}).click();
  await expect(page.locator('[data-action="playStream"]')).toHaveCount(2);
  await expect(status).toHaveCount(0);
});
}
