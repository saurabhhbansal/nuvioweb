"""Rebuild assets/fonts/material-icons-subset.woff2 from the full Material Icons font.

The app draws icons with the Material Icons ligature font. Shipping the whole
font costs about 128 KB; this keeps only the icons whose names appear somewhere
in js/, css/ or index.html (over-including is harmless, missing one shows its
name as text). Run it after adding an icon name:

    pip install fonttools brotli
    curl -o /tmp/MaterialIcons.woff2 "$(curl -s https://fonts.googleapis.com/icon?family=Material+Icons \
      -A 'Mozilla/5.0 Chrome/120' | grep -o 'https://[^)]*woff2')"
    python scripts/subset-material-icons.py /tmp/MaterialIcons.woff2

It writes the font and material-icons-subset.names.txt next to it.
"""

import pathlib
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

APP_DIR = pathlib.Path(__file__).resolve().parent.parent
OUT_FONT = APP_DIR / "assets" / "fonts" / "material-icons-subset.woff2"
OUT_NAMES = APP_DIR / "assets" / "fonts" / "material-icons-subset.names.txt"


def ligature_names(font):
    """Map each icon name to the glyph its ligature produces."""
    reverse_cmap = {glyph: chr(code) for code, glyph in font.getBestCmap().items()}
    names = {}
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for table in lookup.SubTable:
            if table.LookupType == 7:
                table = table.ExtSubTable
            if getattr(table, "LookupType", None) != 4:
                continue
            for first, ligatures in table.ligatures.items():
                for ligature in ligatures:
                    parts = [first] + list(ligature.Component)
                    if all(part in reverse_cmap for part in parts):
                        names["".join(reverse_cmap[part] for part in parts)] = ligature.LigGlyph
    return names


def names_in_source():
    files = list(APP_DIR.glob("js/**/*.js")) + list(APP_DIR.glob("css/*.css"))
    files.append(APP_DIR / "index.html")
    tokens = set()
    for path in files:
        if ".test." not in path.name:
            tokens.update(re.findall(r"[a-z][a-z0-9_]*", path.read_text(encoding="utf8")))
    return tokens


def main(source_font):
    # Same input, same bytes: no build timestamp written into the font.
    font = TTFont(source_font, recalcTimestamp=False)
    names = ligature_names(font)
    used = sorted(name for name in names_in_source() if name in names)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["liga", "rlig"]
    # Keep only the listed icons: closure would pull every ligature back in.
    options.layout_closure = False
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(
        glyphs=sorted({names[name] for name in used}),
        text="".join(sorted({char for name in used for char in name})),
    )
    subsetter.subset(font)
    subset.save_font(font, str(OUT_FONT), options)
    OUT_NAMES.write_text("\n".join(used) + "\n", encoding="utf8", newline="\n")
    print(f"{len(used)} icons, {OUT_FONT.stat().st_size} bytes")


if __name__ == "__main__":
    main(sys.argv[1])
