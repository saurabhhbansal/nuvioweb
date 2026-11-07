# Original multi-audio fixtures

These are short (6 s, 320x180, 10 fps) files with one video track and one or more audio tracks. Everything in them is synthesised by [the generator](../../../../scripts/generate-multi-audio-media.py): the picture is a moving bar and a binary frame counter drawn with numpy, and each audio track is a plain sine tone at its own pitch, so a test can tell which track is playing:

| File | Video | Audio tracks (tone, language, title) |
|---|---|---|
| `multi-audio.mp4` | H.264 High, B-frames, moov at the end | AAC 440 Hz `eng` "English"; Opus 880 Hz `fra` "Français"; AC-3 660 Hz `deu` "Deutsch AC-3" |
| `multi-audio.mkv` | H.264 High, B-frames | same three tracks as the MP4 |
| `multi-audio.webm` | VP9 | Opus 440 Hz `eng` "English"; Opus 880 Hz `fra` "Français" |
| `eac3-surround.mkv` | H.264 High, B-frames | AAC 440 Hz `eng` "English"; E-AC-3 5.1 (side) `spa` "Español E-AC-3 5.1" with a 550 Hz tone in the centre channel only and the other five channels silent |
| `ac3-first.mp4` | H.264 High, B-frames | AC-3 660 Hz `deu` "Deutsch AC-3" (first, default); AAC 440 Hz `eng` "English" |
| `ac3-only.mkv` | H.264 High, B-frames | AC-3 660 Hz `deu` "Deutsch AC-3" only |

These files are dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No third-party film, music, artwork or stream is used. Generator source follows the repository license.

Regenerate with Python and PyAV (FFmpeg bindings), no network needed after install:

```bash
python -m venv .venv && .venv/bin/pip install av==18.1.0 numpy
.venv/bin/python scripts/generate-multi-audio-media.py            # all files
.venv/bin/python scripts/generate-multi-audio-media.py ac3-only.mkv  # only the named ones
```

Encoder output differs between FFmpeg builds, and Matroska files get a new random segment UID on every run, so CI uses the committed files. When adding a file, generate only that file by name, so the existing ones and their provenance entries stay as committed. [provenance.json](provenance.json) records the PyAV/libavformat versions, sizes and SHA-256 hashes.
