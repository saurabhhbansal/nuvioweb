# Manual device verification — Windows Edge and iPhone

Owner-directed spot checks for issues #7 and #10. These are **manual observations**, not automated test passes. Do not paste passwords, account emails, tokens or media URLs into reports or screenshots.

## Shared preparation

- Hosted preview: https://nuvioweb-preview.pages.dev (revision `7dcc371`, deployment `b6451df5`; rollback `b48de821`/`1f67867`).
- Use a normal browser window with extensions disabled where practical.
- Record: OS name/build, browser name/version, network type, and the exact step result.
- If a check fails, record the visible error text and whether Back/reload recovers. Do not delete Library items or change account passwords.

## Windows PC — Microsoft Edge

1. Open `edge://version` and copy the Edge version and OS build.
2. Open the hosted preview. Click **Continue as guest**.
3. Guest shell: Home renders; Settings opens; Library opens; Profile opens. Record PASS/FAIL.
4. Install the legal demo add-on:
   - Open Settings → Add-ons.
   - Paste `https://nuvioweb-preview.pages.dev/demo/manifest.json` into the add-on URL field.
   - Click **Add Addon** and expect a **Saved locally** confirmation.
5. Return Home, open the **NuvioWeb legal demo** poster, choose the **Original VP8/Opus demo** source.
6. Playback checks:
   - Video plays and time advances.
   - **Sound is audible** at normal system volume.
   - Pause/resume works.
   - Seek to roughly 25% works and continues.
   - Open subtitles, choose **English**, confirm a caption appears.
   - Use Back to return through player → stream → detail → Home.
7. Save and reload:
   - Click the Library/save button on the demo detail.
   - Open Library and confirm the item.
   - Reload the page and confirm it is still there (guest/local persistence).
8. Account isolation spot check (optional, disposable A/B accounts):
   - Sign in as account A, select primary profile, open Library: record the number of items and whether the item you added to A is present.
   - Sign out, sign in as account B, open Library: record the count and whether A's item is absent and B's item is present.
   - Sign out and back into A: A's item should return, B's item must not appear.
   - Do not add or delete items during this check.
9. Report: Edge version, OS build, PASS/FAIL per step, audible yes/no, any DevTools console errors (F12 → Console), and whether the page recovered after Back/reload.

## iPhone 17 Pro — iOS 27 Safari

1. Record iOS version and device model.
2. Open the hosted preview in Safari, Continue as guest.
3. Shell checks: Home, Settings, Library, Profile, Back navigation, reload.
4. Add-on/catalog: install the same legal demo manifest through Settings → Add-ons; open the demo and confirm catalog/detail render.
5. Playback:
   - The hosted demo uses VP8/Opus. Safari may reject it as an unsupported codec; if so, record the exact error and treat it as a codec limitation, not an app failure.
   - For a real playback/audio/HDR check, use a legal source from your own authorized service. Do not share credentials or media URLs in the report.
6. Audio spot check (source with multiple audio tracks):
   - Open the audio track menu. Record how many tracks are offered and their labels.
   - Select a different track and confirm the audio changes audibly and playback continues.
   - Switch back and confirm it restores.
7. HDR spot check (HDR-capable source and display):
   - Play an HDR title. Record whether the player reports HDR/4K, whether playback starts without a black screen, and whether colors/black levels look correct.
   - Rotate/fullscreen and confirm controls remain usable.
8. Save/reload: save an item in Library, background/reopen Safari, reload, confirm persistence for the signed-in account.
9. Report: iOS version, source codec/HDR label if shown, track count/selection, audible yes/no, HDR observed yes/no, errors, screenshots without account/media identifiers.

## What these checks can and cannot establish

- Windows Edge is Chromium-based; the project already passes Chromium/Chrome engine suites, and the owner accepts that engine coverage as sufficient rather than requiring a branded-Edge matrix.
- iPhone/Safari is a different engine (WebKit). Its result is evidence for Safari/iOS behavior, not a substitute for Chromium tests — and vice versa.
- Audible output, device HDR rendering and physical-device multitrack behavior cannot be certified headlessly; only your observation can support those claims.
- Screenshots or a short note with PASS/FAIL per step are enough; no passwords, tokens, account IDs or media URLs.
