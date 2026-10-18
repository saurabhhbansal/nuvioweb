import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Original procedural test content only: moving rectangles, text and a sine tone.
// No downloaded images/audio/video, account data or external network is used.
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  await context.route("**/*", (route) => route.abort("blockedbyclient"));
  const page = await context.newPage();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 360;
    const drawing = canvas.getContext("2d");
    const audio = new AudioContext();
    const output = audio.createMediaStreamDestination();
    const tone = audio.createOscillator();
    const gain = audio.createGain(); gain.gain.value = 0.05;
    tone.frequency.value = 440; tone.connect(gain); gain.connect(output);
    await audio.resume(); tone.start();
    const stream = canvas.captureStream(10);
    for (const track of output.stream.getAudioTracks()) stream.addTrack(track);
    const mimeType = "video/webm;codecs=vp8,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error("Fixture generator requires VP8/Opus recording support");
    const recorder = new MediaRecorder(stream,{mimeType,videoBitsPerSecond:100000});
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    const paint = (frame) => {
      drawing.fillStyle = "#142033"; drawing.fillRect(0,0,640,360);
      drawing.fillStyle = "#81d4fa"; drawing.fillRect(20+frame*15,180,60,60);
      drawing.fillStyle = "#ffffff"; drawing.font = "24px sans-serif";
      drawing.fillText("Original NuvioWeb test fixture",28,65);
      drawing.fillText(`Frame ${frame}`,28,110);
    };
    paint(0); recorder.start();
    for (let frame=1; frame<=20; frame++) { await new Promise((resolve)=>setTimeout(resolve,100)); paint(frame); }
    recorder.stop(); await stopped;
    stream.getTracks().forEach((track)=>track.stop()); tone.stop(); await audio.close();
    return Array.from(new Uint8Array(await new Blob(chunks,{type:mimeType}).arrayBuffer()));
  });
  const root = new URL("../tests/fixtures/media/",import.meta.url);
  await mkdir(root,{recursive:true});
  const media = Buffer.from(bytes);
  await writeFile(new URL("procedural-vp8-opus.webm",root),media);
  await writeFile(new URL("provenance.json",root),JSON.stringify({
    file:"procedural-vp8-opus.webm",sha256:createHash("sha256").update(media).digest("hex"),bytes:media.length,
    license:"CC0-1.0",source:"scripts/generate-legal-media.mjs",generator:`Playwright Chromium ${browser.version()}`,
    content:"Original canvas rectangles/text and a 440 Hz oscillator; no third-party media",
    requestedEncoding:"video/webm;codecs=vp8,opus",requestedSize:[640,360],requestedFrameRate:10,
    limits:"Short generated fixture; recording duration/bytes vary by environment. Playback capability must be observed independently."
  },null,2)+"\n");
  console.log(`Generated ${media.length} bytes of original fixture media; provenance hash recorded.`);
} finally { await browser.close(); }
