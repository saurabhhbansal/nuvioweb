"""Generate the original multi-audio fixtures in tests/fixtures/media/multi-audio/.

Everything is synthesised here: a moving test pattern (numpy) and one sine
tone per audio track, each at its own pitch so a test can tell which track
is playing. No third-party media. Output is dedicated to the public domain
(CC0 1.0), see tests/fixtures/media/multi-audio/README.md.

Run with PyAV (FFmpeg bindings), e.g.:
    python -m venv .venv && .venv/bin/pip install av==18.1.0 numpy
    .venv/bin/python scripts/generate-multi-audio-media.py
Encoder output can differ between FFmpeg builds; provenance.json records
the hashes of the committed files.
"""

import hashlib
import json
import math
import sys
from fractions import Fraction
from pathlib import Path

import av
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "fixtures" / "media" / "multi-audio"
WIDTH, HEIGHT, FPS, SECONDS = 320, 180, 10, 6
RATE = 48000

FILES = {
    "multi-audio.mp4": {
        "format": "mp4",
        "video": ("libx264", {"g": "10", "bf": "2", "preset": "veryfast", "crf": "30", "profile": "high"}),
        "audio": [
            ("aac", 440, "eng", "English", True),
            ("libopus", 880, "fra", "Français", False),
            ("ac3", 660, "deu", "Deutsch AC-3", False),
        ],
    },
    "multi-audio.mkv": {
        "format": "matroska",
        "video": ("libx264", {"g": "10", "bf": "2", "preset": "veryfast", "crf": "30", "profile": "high"}),
        "audio": [
            ("aac", 440, "eng", "English", True),
            ("libopus", 880, "fra", "Français", False),
            ("ac3", 660, "deu", "Deutsch AC-3", False),
        ],
    },
    "multi-audio.webm": {
        "format": "webm",
        "video": ("libvpx-vp9", {"g": "10", "crf": "45", "b": "0", "deadline": "realtime", "cpu-used": "8"}),
        "audio": [
            ("libopus", 440, "eng", "English", True),
            ("libopus", 880, "fra", "Français", False),
        ],
    },
    # 5.1 E-AC-3 with the tone in the centre channel only: browsers that convert
    # it to stereo must mix the centre into both sides.
    "eac3-surround.mkv": {
        "format": "matroska",
        "video": ("libx264", {"g": "10", "bf": "2", "preset": "veryfast", "crf": "30", "profile": "high"}),
        "audio": [
            ("aac", 440, "eng", "English", True),
            ("eac3", 550, "spa", "Español E-AC-3 5.1", False, "5.1(side)"),
        ],
    },
}

# Channel order of each layout in FFmpeg's planar frames; the tone goes to "FC"
# when a layout has a centre, otherwise to every channel.
LAYOUT_CHANNELS = {"stereo": ["FL", "FR"], "5.1(side)": ["FL", "FR", "FC", "LFE", "SL", "SR"]}


def frame_image(index):
    """A moving bar and a binary frame counter, so frames differ visibly."""
    image = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    image[:, :] = (20, 32, 51)
    x = (index * 8) % WIDTH
    image[40:140, x : min(WIDTH, x + 24)] = (129, 212, 250)
    for bit in range(8):
        if index >> bit & 1:
            image[150:170, 10 + bit * 20 : 26 + bit * 20] = (255, 255, 255)
    return image


def tone(frequency, start, count):
    t = (np.arange(count) + start) / RATE
    return (0.4 * np.sin(2 * math.pi * frequency * t)).astype(np.float32)


def write(name, spec):
    path = OUT / name
    container = av.open(str(path), mode="w", format=spec["format"])
    codec, options = spec["video"]
    video = container.add_stream(codec, rate=FPS, options=options)
    video.width, video.height, video.pix_fmt = WIDTH, HEIGHT, "yuv420p"
    audio_streams = []
    for codec_name, frequency, language, title, default, *rest in spec["audio"]:
        layout = rest[0] if rest else "stereo"
        stream = container.add_stream(codec_name, rate=RATE)
        stream.layout = layout
        if codec_name == "aac":
            stream.bit_rate = 48000
        elif codec_name == "ac3":
            stream.bit_rate = 96000
        elif codec_name == "eac3":
            stream.bit_rate = 192000
        else:
            stream.bit_rate = 32000
        stream.metadata["language"] = language
        stream.metadata["title"] = title
        # MP4 keeps a track's name in its handler box.
        stream.metadata["handler_name"] = title
        stream.disposition = av.stream.Disposition.default if default else av.stream.Disposition(0)
        audio_streams.append((stream, frequency, layout))

    for index in range(FPS * SECONDS):
        frame = av.VideoFrame.from_ndarray(frame_image(index), format="rgb24")
        frame.pts = index
        frame.time_base = Fraction(1, FPS)
        for packet in video.encode(frame):
            container.mux(packet)
    for packet in video.encode():
        container.mux(packet)

    for stream, frequency, layout in audio_streams:
        size = stream.codec_context.frame_size or 1024
        total = RATE * SECONDS
        position = 0
        channels = LAYOUT_CHANNELS[layout]
        while position < total:
            count = min(size, total - position)
            mono = tone(frequency, position, count)
            if count < size:
                mono = np.pad(mono, (0, size - count))
            silence = np.zeros_like(mono)
            if "FC" in channels:
                samples = np.vstack([mono if name == "FC" else silence for name in channels])
            else:
                samples = np.vstack([mono for _ in channels])
            frame = av.AudioFrame.from_ndarray(samples, format="fltp", layout=layout)
            frame.sample_rate = RATE
            frame.pts = position
            frame.time_base = Fraction(1, RATE)
            for packet in stream.encode(frame):
                container.mux(packet)
            position += size
        for packet in stream.encode():
            container.mux(packet)
    container.close()

    data = path.read_bytes()
    return {
        "file": name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "video": f"{codec} {WIDTH}x{HEIGHT} {FPS} fps, {SECONDS} s",
        "audio": [
            {
                "codec": codec_name,
                "toneHz": frequency,
                "language": language,
                "title": title,
                "default": default,
                **({"layout": rest[0], "toneChannel": "FC"} if rest else {}),
            }
            for codec_name, frequency, language, title, default, *rest in spec["audio"]
        ],
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = [write(name, spec) for name, spec in FILES.items()]
    provenance = {
        "generator": "scripts/generate-multi-audio-media.py",
        "pyav": av.__version__,
        "libavformat": ".".join(str(part) for part in av.library_versions.get("libavformat", ())),
        "python": sys.version.split()[0],
        "license": "CC0-1.0",
        "files": files,
    }
    (OUT / "provenance.json").write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(provenance, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
