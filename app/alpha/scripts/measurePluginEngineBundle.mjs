// Measures the browser cost of the QuickJS engine variants before any shipping
// decision. This is tooling only: it writes to the ignored dist directory and is
// not imported by the application.
import { build } from "esbuild";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);
const outRoot = join(root, "dist", "plugin-engine-measure");

export const ENGINE_VARIANTS = Object.freeze({
  sync: {
    importName: "newQuickJSWASMModuleFromVariant",
    packageName: "@jitl/quickjs-wasmfile-release-sync"
  },
  async: {
    importName: "newQuickJSAsyncWASMModuleFromVariant",
    packageName: "@jitl/quickjs-wasmfile-release-asyncify"
  }
});

// Pure classification over esbuild's metafile outputs so the accounting is
// testable without bundling.
export function summarizeMetafile(metafile) {
  const outputs = Object.entries(metafile?.outputs || {});
  let jsBytes = 0;
  let wasmBytes = 0;
  const files = [];
  for (const [path, output] of outputs) {
    const bytes = Number(output.bytes) || 0;
    files.push({ path, bytes });
    if (String(path).endsWith(".wasm")) wasmBytes += bytes;
    else jsBytes += bytes;
  }
  return { jsBytes, wasmBytes, files };
}

function gzipSize(bytes) {
  return gzipSync(bytes, { level: 9 }).length;
}

async function measureVariant(name) {
  const variant = ENGINE_VARIANTS[name];
  const outdir = join(outRoot, name);
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  const contents = `import { ${variant.importName} } from "quickjs-emscripten-core";
import variant from "${variant.packageName}";
export { ${variant.importName}, variant };
`;
  const result = await build({
    stdin: { contents, resolveDir: root, sourcefile: `engine-${name}.mjs` },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    outdir,
    metafile: true,
    loader: { ".wasm": "file" },
    logLevel: "silent"
  });
  const summary = summarizeMetafile(result.metafile);
  const outputs = [];
  for (const entry of summary.files) {
    const absolute = resolve(root, entry.path);
    const bytes = await readFile(absolute);
    outputs.push({
      file: entry.path,
      bytes: (await stat(absolute)).size,
      gzipBytes: gzipSize(bytes)
    });
  }
  const js = outputs.filter((output) => !output.file.endsWith(".wasm")).reduce((sum, output) => sum + output.bytes, 0);
  const jsGzip = outputs.filter((output) => !output.file.endsWith(".wasm")).reduce((sum, output) => sum + output.gzipBytes, 0);
  // esbuild leaves the Emscripten `new URL("emscripten-module.wasm")` reference
  // external, so the deployable cost includes the package's wasm asset.
  const wasmPath = join(dirname(require.resolve(variant.packageName)), "emscripten-module.wasm");
  const wasmSource = await readFile(wasmPath);
  const wasmGzip = gzipSize(wasmSource);
  const inlineBase64 = Buffer.from(wasmSource).toString("base64");
  const jsText = (await Promise.all(outputs.filter((output) => !output.file.endsWith(".wasm")).map((output) => readFile(resolve(root, output.file), "utf8")))).join("\n");
  return {
    variant: name,
    enginePackage: `${variant.packageName}@0.32.0`,
    license: "MIT",
    jsBytes: js || summary.jsBytes,
    jsGzipBytes: jsGzip,
    wasmBytes: wasmSource.byteLength,
    wasmGzipBytes: wasmGzip,
    totalBytes: (js || summary.jsBytes) + wasmSource.byteLength,
    bundledWasmReference: jsText.includes("emscripten-module.wasm"),
    inlineBase64Bytes: inlineBase64.length,
    inlineBase64GzipBytes: gzipSize(Buffer.from(inlineBase64)),
    outputs
  };
}

export async function measurePluginEngine({ variants = Object.keys(ENGINE_VARIANTS) } = {}) {
  await mkdir(outRoot, { recursive: true });
  const results = [];
  for (const name of variants) results.push(await measureVariant(name));
  return { asOf: new Date().toISOString(), variantCount: results.length, results };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await measurePluginEngine();
  if (process.env.NUVIO_ENGINE_REPORT) await writeFile(process.env.NUVIO_ENGINE_REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
