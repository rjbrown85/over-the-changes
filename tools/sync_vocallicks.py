"""Copy the shared theory engine and data from a Vocal Licks checkout, then run the tests.
Usage: python3 tools/sync_vocallicks.py ../Vocallicks"""
import os, shutil, subprocess, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VL = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "Vocallicks")
for f in ["js/theory.js", "js/data.js", "tests/theory.test.js"]:
    shutil.copy(os.path.join(VL, f), os.path.join(HERE, f)); print("copied", f)
subprocess.run(["node", os.path.join(HERE, "tests/theory.test.js")], check=True)
