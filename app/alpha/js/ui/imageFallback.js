// Image fallbacks without inline handlers.
//
// The Content-Security-Policy forbids inline script, which includes
// `onerror="..."` attributes in rendered markup. Templates mark an <img> with
// `data-img-fallback="<mode>"` instead, and one capture-phase listener on the
// document runs the matching fallback. `error` does not bubble, so capture is
// what lets a single listener see every image.

export const IMAGE_FALLBACK_ATTRIBUTE = "data-img-fallback";
export const TOGGLE_EXPANDED_ATTRIBUTE = "data-toggle-expanded";

const MODES = new Set(["hide", "hide-reveal", "remove", "queue", "swap-src", "src-then-hide-reveal"]);

/** Attribute text for a template literal: ` data-img-fallback="hide"`. */
export function imageFallbackAttribute(mode) {
  if (!MODES.has(mode)) throw new Error(`Unknown image fallback mode: ${mode}`);
  return ` ${IMAGE_FALLBACK_ATTRIBUTE}="${mode}"`;
}

function revealNext(image) {
  const next = image.nextElementSibling;
  if (next) next.hidden = false;
}

export function runImageFallback(image) {
  const mode = image?.getAttribute?.(IMAGE_FALLBACK_ATTRIBUTE);
  if (!mode) return false;
  switch (mode) {
    case "hide":
      image.hidden = true;
      return true;
    case "hide-reveal":
      image.hidden = true;
      revealNext(image);
      return true;
    case "remove":
      image.remove();
      return true;
    case "swap-src": {
      // One retry with the fallback, then the browser's broken image as before.
      const next = image.dataset.fallbackSrc || "";
      image.removeAttribute(IMAGE_FALLBACK_ATTRIBUTE);
      if (next) image.src = next;
      return true;
    }
    case "src-then-hide-reveal": {
      const next = image.dataset.fallbackSrc || "";
      if (next && image.src !== next) {
        image.src = next;
        image.dataset.fallbackSrc = "";
        return true;
      }
      image.hidden = true;
      revealNext(image);
      return true;
    }
    case "queue": {
      // Inside a <picture>, a matching <source> wins over `src`, so a fallback
      // assigned to `src` would never be shown. Dropping the sources first hands
      // the choice back to the img.
      const parent = image.parentElement;
      if (parent && parent.tagName === "PICTURE") {
        parent.querySelectorAll("source").forEach((source) => source.remove());
      }
      const queue = String(image.dataset.fallbackSrcs || "").split("|").filter(Boolean);
      const next = queue.shift();
      if (next) {
        image.dataset.fallbackSrcs = queue.join("|");
        image.src = decodeURIComponent(next);
        return true;
      }
      image.removeAttribute("src");
      image.classList.add("placeholder");
      return true;
    }
    default:
      return false;
  }
}

let installedOn = null;

export function installImageFallbacks(root = globalThis.document) {
  if (!root?.addEventListener || installedOn === root) return;
  installedOn = root;
  root.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (target && target.tagName === "IMG") runImageFallback(target);
    },
    true
  );
  root.addEventListener("click", (event) => {
    const toggle = event.target?.closest?.(`[${TOGGLE_EXPANDED_ATTRIBUTE}]`);
    if (toggle) toggle.classList.toggle("is-expanded");
  });
}
