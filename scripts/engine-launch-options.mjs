import { resolve } from "node:path";

// Optional, private test-only dependencies. No root install, sandbox-disabling
// flag, CDP connection or shared browser profile. CI normally uses stock deps.
export function engineLaunchOptions(engine, env = process.env) {
  const base = env.NUVIO_ENGINE_TOOL_ROOT;
  const executable = env[engine === "webkit" ? "NUVIO_WEBKIT_EXECUTABLE" : engine === "firefox" ? "NUVIO_FIREFOX_EXECUTABLE" : "NUVIO_CHROMIUM_EXECUTABLE"];
  if (!base) return executable ? { executablePath: resolve(executable) } : {};
  const root = resolve(base);
  const lib = `${root}/sysroot/usr/lib/aarch64-linux-gnu`;
  const childEnv = {
    ...env,
    HOME: `${root}/home`, TMPDIR: `${root}/tmp`, XDG_CACHE_HOME: `${root}/home/.cache`, XDG_CONFIG_HOME: `${root}/home/.config`,
    LD_LIBRARY_PATH: [lib, `${lib}/blas`, `${lib}/lapack`, `${lib}/pulseaudio`].join(":"),
    GST_PLUGIN_PATH: `${lib}/gstreamer-1.0`, GST_PLUGIN_SYSTEM_PATH: `${lib}/gstreamer-1.0`,
    GST_PLUGIN_SCANNER: "/usr/lib/aarch64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner"
  };
  if (engine === "webkit" && env.NUVIO_WEBKIT_ROOT) {
    const webkitRoot = resolve(env.NUVIO_WEBKIT_ROOT);
    Object.assign(childEnv, {
      WEBKIT_EXEC_PATH: `${webkitRoot}/bin`, WEBKIT_INJECTED_BUNDLE_PATH: `${webkitRoot}/lib`, WEBKIT_INSPECTOR_RESOURCES_PATH: `${webkitRoot}/share`,
      LD_LIBRARY_PATH: `${webkitRoot}/lib:${webkitRoot}/sys/lib:${childEnv.LD_LIBRARY_PATH}`
    });
  }
  return { ...(executable ? { executablePath: resolve(executable) } : {}), env: childEnv };
}
