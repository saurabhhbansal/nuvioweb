// js/core/qr/qrCodeGenerator.js

// The QR library is a classic script that defines a global. It used to be a
// render-blocking tag in index.html; now only the screens that draw a QR code
// import this module, and the module waits for the script before it finishes
// loading, so generate() can stay synchronous for its callers.
const QR_LIBRARY_URL = "assets/libs/qrcode-generator.js";

function loadQrLibrary() {
  // Only a real DOM can run the script; test doubles of document never fire
  // onload and would leave every importer waiting.
  if (
    typeof globalThis.qrcode === "function" ||
    typeof document === "undefined" ||
    typeof globalThis.HTMLScriptElement !== "function" ||
    !document.head
  ) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = QR_LIBRARY_URL;
    script.async = true;
    // A failed load leaves generate() throwing, which every caller handles.
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      resolve();
    };
    document.head.appendChild(script);
  });
}

await loadQrLibrary();

export const QrCodeGenerator = {
  generate(canvas, content, size = 512) {
    const qr = qrcode(0, "M");
    qr.addData(content);
    qr.make();

    const ctx = canvas.getContext("2d");

    canvas.width = size;
    canvas.height = size;

    // === 1️⃣ Sfondo bianco arrotondato ===
    const cornerRadius = size * 0.06;

    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = "#ffffff";
    this.roundRect(ctx, 0, 0, size, size, cornerRadius);
    ctx.fill();

    // Match Android's ZXing output by preserving a quiet zone around the code.
    const moduleCount = qr.getModuleCount();
    const quietZoneModules = 4;
    const totalModules = moduleCount + quietZoneModules * 2;
    const moduleSize = size / totalModules;
    const moduleRadius = moduleSize * 0.08;

    ctx.fillStyle = "#000000";

    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          const x = (col + quietZoneModules) * moduleSize;
          const y = (row + quietZoneModules) * moduleSize;

          this.roundRect(ctx, x, y, moduleSize, moduleSize, moduleRadius);

          ctx.fill();
        }
      }
    }

    // === 3️⃣ Clip finale arrotondato ===
    const imageData = ctx.getImageData(0, 0, size, size);

    ctx.clearRect(0, 0, size, size);

    ctx.save();
    this.roundRect(ctx, 0, 0, size, size, cornerRadius);
    ctx.clip();

    ctx.putImageData(imageData, 0, 0);
    ctx.restore();
  },

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
};
