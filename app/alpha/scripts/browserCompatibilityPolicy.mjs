// The oldest browsers the web build is compiled for. Both support ES modules,
// dynamic import, top-level await, flex gap and CSS clamp(), so the build ships
// no polyfill bundle and no legacy CSS fallbacks.
export const browserCompatibilityPolicy = Object.freeze({
  chromiumVersion: 100,
  safariVersion: 15
});

export const esbuildTargets = Object.freeze([
  `chrome${browserCompatibilityPolicy.chromiumVersion}`,
  `safari${browserCompatibilityPolicy.safariVersion}`
]);

export const browserslistTargets = Object.freeze([
  `Chrome >= ${browserCompatibilityPolicy.chromiumVersion}`,
  `Safari >= ${browserCompatibilityPolicy.safariVersion}`,
  `iOS >= ${browserCompatibilityPolicy.safariVersion}`
]);
