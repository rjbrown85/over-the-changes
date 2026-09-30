"""Build the one-page claude.ai preview from the repo files.
The page inlines the CSS and JS, loads Tone.js from cdnjs and the fonts from Google Fonts
(the only outside hosts an artifact allows), and publishes the piano samples beside it."""
import os, re, shutil, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "otc-artifact")
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(os.path.join(OUT, "piano"))
for f in os.listdir(os.path.join(HERE, "piano")):
    if f.endswith(".mp3"): shutil.copy(os.path.join(HERE, "piano", f), os.path.join(OUT, "piano", f))
src = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
body = re.search(r"<!--BODY-->(.*)<!--/BODY-->", src, re.S).group(1)
css = open(os.path.join(HERE, "css/app.css"), encoding="utf-8").read()
js = "\n".join(open(os.path.join(HERE, "js", f), encoding="utf-8").read() for f in ["theory.js", "data.js", "audio.js", "band.js", "app.js"])
assert "</script" not in js
page = f"""<title>Over the Changes</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Dela+Gothic+One&family=Permanent+Marker&display=swap">
<style>
{css}
</style>
{body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/tone/15.5.42/Tone.min.js"></script>
<script>
{js}
</script>
"""
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page)
print(OUT, len(page))
