import { cp, mkdir, readFile, rm, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import cssnano from "cssnano";
import autoprefixer from "autoprefixer";
import { readAppMetadata, syncVersionFiles } from "./appMetadata.mjs";
import { browserslistTargets, esbuildTargets } from "./browserCompatibilityPolicy.mjs";
import { readEnvProperties, writeRuntimeEnvScriptFile } from "./envProperties.mjs";
import { buildServiceWorkerCacheId } from "./serviceWorkerCacheId.mjs";
import { assetBuildId, versionAssetUrls } from "./assetVersions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const requireConfiguredRuntimeEnv = /^(1|true|yes|on)$/i.test(
  String(process.env.NUVIO_REQUIRE_LOCAL_PROPERTIES || "")
);
const debugBundle = /^(1|true|yes|on)$/i.test(String(process.env.NUVIO_DEBUG_BUNDLE || ""));
if (process.argv.slice(2).some((arg) => String(arg || "").startsWith("--target="))) {
  throw new Error("NuvioWeb builds browser/PWA artifacts only.");
}

function unsupportedSelectorFallbackPlugin() {
  return {
    postcssPlugin: "nuvio-unsupported-selector-fallbacks",
    Rule(rule) {
      if (!rule.selector || !rule.selectors?.length) {
        return;
      }

      const safeSelectors = rule.selectors.filter(
        (selector) => !selector.includes(":focus-visible") && !selector.includes(":has(")
      );
      if (!safeSelectors.length || safeSelectors.length === rule.selectors.length) {
        return;
      }

      const fallback = rule.clone({ selectors: safeSelectors });
      rule.before(fallback);
    }
  };
}

unsupportedSelectorFallbackPlugin.postcss = true;

async function buildCSS() {
  console.log("processing CSS with PostCSS...");
  const cssDir = path.join(rootDir, "css");
  const files = await readdir(cssDir);
  const cssFiles = files.filter((f) => f.endsWith(".css"));

  for (const file of cssFiles) {
    const cssPath = path.join(cssDir, file);
    const outPath = path.join(distDir, "css", file);

    const css = await readFile(cssPath, "utf8");
    const result = await postcss([
      autoprefixer({ overrideBrowserslist: [...browserslistTargets] }),
      unsupportedSelectorFallbackPlugin(),
      cssnano()
    ]).process(css, { from: cssPath, to: outPath });

    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, result.css);
  }
}

async function buildBundle() {
  const { version, identity } = await readAppMetadata();
  // The same values nuvio.env.js will carry, baked in as a fallback. That file
  // is served no-store and fetched separately, so anything that stops it
  // executing -- offline at the wrong moment, a cache miss, an insecure origin
  // where no service worker can stand in -- used to leave every config value
  // empty. An empty SUPABASE_URL then turns each cloud call into a relative
  // path that the page's own host answers with a 404, for the life of that
  // page, with no way back. The runtime file still wins whenever it loads, so
  // a redeployed container keeps overriding what was built in.
  const { env: buildEnv } = await readEnvProperties({ rootDir });

  console.log("starting bundle build...");
  // ES modules with code splitting: the entry keeps what the first screens
  // need, and the router fetches the other screens the first time they open.
  const result = await build({
    entryPoints: { "app.bundle": path.join(rootDir, "js/app.js") },
    // Metafile paths are relative to this, which is what the mapping below expects.
    absWorkingDir: rootDir,
    outdir: distDir,
    chunkNames: "chunks/[name]-[hash]",
    bundle: true,
    splitting: true,
    minify: !debugBundle,
    format: "esm",
    sourcemap: debugBundle,
    target: [...esbuildTargets],
    metafile: true,
    define: {
      "process.env.NODE_ENV": '"production"',
      __NUVIO_APP_VERSION__: JSON.stringify(version),
      __NUVIO_APP_IDENTITY__: JSON.stringify(identity),
      __NUVIO_BUILD_ENV__: JSON.stringify(buildEnv),
      // Which build produced a log. The service worker serves a cached bundle
      // until it decides to update, so a device can be running an older build
      // than the one on the server -- and a log read without knowing which is
      // a log that proves nothing.
      __NUVIO_BUILD_STAMP__: JSON.stringify(new Date().toISOString())
    }
  });
  const outputs = Object.entries(result.metafile.outputs).map(([file, meta]) => ({
    path: path.relative(distDir, path.resolve(rootDir, file)).split(path.sep).join("/"),
    meta
  }));
  const entry = outputs.find((output) => output.path === "app.bundle.js");
  if (!entry) {
    throw new Error("Bundle build did not produce app.bundle.js.");
  }
  const chunks = outputs
    .map((output) => output.path)
    .filter((file) => file.startsWith("chunks/") && file.endsWith(".js"))
    .sort();
  const initialChunks = entry.meta.imports
    .filter((item) => item.kind === "import-statement")
    .map((item) => path.relative(distDir, path.resolve(rootDir, item.path)).split(path.sep).join("/"));
  console.log(`bundle build complete: ${chunks.length} chunks, ${initialChunks.length} loaded up front`);
  return { chunks, initialChunks };
}

// Plugin scrapers run in their own Web Worker with cheerio and crypto-js
// bundled in; the main bundle never evaluates plugin code.
async function buildPluginWorkerBundle() {
  console.log("building plugin worker bundle...");
  await build({
    entryPoints: [path.join(rootDir, "js/core/plugins/pluginWorker.js")],
    outfile: path.join(distDir, "plugin-worker.bundle.js"),
    bundle: true,
    minify: !debugBundle,
    format: "iife",
    platform: "browser",
    target: [...esbuildTargets],
    legalComments: "linked",
    logOverride: { "require-resolve-not-external": "silent" }
  });
}

async function collectLocaleAssets(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const assets = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      assets.push(...await collectLocaleAssets(absolutePath, relativePath));
    } else if (entry.isFile() && /^(?:strings|string)\.xml$/i.test(entry.name)) {
      assets.push(`./res/${relativePath}`);
    }
  }
  return assets;
}

async function buildBrowserServiceWorker(chunks) {
  const { version } = await readAppMetadata();
  const source = await readFile(path.join(rootDir, "sw.js"), "utf8");
  const localeAssets = await collectLocaleAssets(path.join(rootDir, "res"));
  // Chunk names carry their content hash, so listing them in the worker source
  // is enough for any change to them to move the cache name.
  const substituted = source
    .replace("__NUVIO_LOCALE_ASSETS__", JSON.stringify(localeAssets))
    .replace("__NUVIO_APP_CHUNKS__", JSON.stringify(chunks.map((chunk) => `./${chunk}`)));
  const cacheId = await buildServiceWorkerCacheId(substituted, version, (relative) =>
    readFile(path.join(distDir, relative)).catch(() => null)
  );
  await writeFile(
    path.join(distDir, "sw.js"),
    substituted.replaceAll("__NUVIO_APP_VERSION__", cacheId)
  );
  console.log(`service worker cache: nuvio-app-shell-${cacheId}`);
}

// The entry's own imports start downloading with it instead of after it parses.
function insertModulePreloads(html, files) {
  const links = files.map((file) => `    <link rel="modulepreload" href="${file}" />`).join("\n");
  if (!links) {
    return html;
  }
  if (!html.includes("</head>")) {
    throw new Error("index.html has no </head> to hold the module preloads.");
  }
  return html.replace("</head>", `${links}\n  </head>`);
}

async function runBuild() {
  try {
    console.log("cleaning dist directory...");
    await rm(distDir, { recursive: true, force: true });
    await mkdir(distDir, { recursive: true });

    console.log("building version files...");
    await syncVersionFiles();
    await buildCSS();

    console.log("copying static assets...");
    await Promise.all([
      cp(path.join(rootDir, "assets"), path.join(distDir, "assets"), { recursive: true }),
      cp(path.join(rootDir, "res"), path.join(distDir, "res"), { recursive: true }),
      cp(path.join(rootDir, "boot-guard.js"), path.join(distDir, "boot-guard.js")),
      cp(path.join(rootDir, "docs", "youtube-proxy.html"), path.join(distDir, "youtube-proxy.html")),
      cp(path.join(rootDir, "manifest.webmanifest"), path.join(distDir, "manifest.webmanifest"))
    ]);
    await Promise.all([
      cp(
        path.join(rootDir, "node_modules", "hls.js", "dist", "hls.min.js"),
        path.join(distDir, "assets", "libs", "hls.min.js")
      ),
      cp(
        path.join(rootDir, "node_modules", "hls.js", "LICENSE"),
        path.join(distDir, "assets", "libs", "hls.js.LICENSE")
      ),
      cp(
        path.join(rootDir, "node_modules", "dashjs", "dist", "dash.all.min.js"),
        path.join(distDir, "assets", "libs", "dash.all.min.js")
      ),
      cp(
        path.join(rootDir, "node_modules", "dashjs", "LICENSE.md"),
        path.join(distDir, "assets", "libs", "dashjs.LICENSE.md")
      )
    ]);
    await cp(
      path.join(rootDir, "node_modules", "libbitsub", "pkg", "libbitsub_bg.wasm"),
      path.join(distDir, "assets", "libs", "libbitsub_bg.wasm")
    );
    await cp(
      path.join(rootDir, "node_modules", "libbitsub", "LICENSE"),
      path.join(distDir, "assets", "libs", "libbitsub.LICENSE")
    );

    const { chunks, initialChunks } = await buildBundle();
    await buildPluginWorkerBundle();

    const sourceIndex = await readFile(path.join(rootDir, "index.html"), "utf8");
    // The bundle carries no build in its name: versioned here, a reload asks for
    // files only this build has, and a frozen query can no longer hand a browser
    // the bundle it cached a week ago.
    const buildId = assetBuildId(await readFile(path.join(distDir, "app.bundle.js")));
    await writeFile(
      path.join(distDir, "index.html"),
      versionAssetUrls(insertModulePreloads(sourceIndex, initialChunks), buildId)
    );
    console.log(`asset build id: ${buildId}`);

    // After the shell it caches exists: the cache name is a hash of those files.
    await buildBrowserServiceWorker(chunks);

    console.log("configuring runtime env from local.properties...");
    const envResult = await writeRuntimeEnvScriptFile(path.join(distDir, "nuvio.env.js"), {
      rootDir
    });
    const envSourceBaseName = path.basename(envResult.sourcePath || "");
    const usingFallbackEnv =
      !envResult.sourcePath || envSourceBaseName === "local.example.properties";
    if (requireConfiguredRuntimeEnv && usingFallbackEnv) {
      throw new Error(
        "Configured runtime env is required for this build. Provide local.properties."
      );
    }
    if (!envResult.sourcePath) {
      console.warn("WARNING: generated default runtime env (unconfigured).");
    } else if (envSourceBaseName === "local.example.properties") {
      console.warn("WARNING: using local.example.properties as fallback.");
    }

    console.log(`\nbuild finished successfully in: ${distDir}`);
  } catch (error) {
    console.error("\nbuild failed:");
    console.error(error);
    process.exit(1);
  }
}

runBuild();
