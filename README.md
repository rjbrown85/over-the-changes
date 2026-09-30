# Over the Changes

A focused practice app for singing over chord progressions. A progression loops on a grand piano, and you sing over it: a scale run on every chord, or licks you place on the changes and then move around until they land. It's the chord-progression part of [Vocal Licks](https://rjbrown85.github.io/Vocallicks/), on one screen, with nothing else.

**Live app:** [rjbrown85.github.io/over-the-changes](https://rjbrown85.github.io/over-the-changes/)

## What's in it

- **The changes.** All 51 progressions from Vocal Licks (pop and R&B, rock and blues, and '50s, '60s, and '70s classics), in any key, with 1 or 2 bars per chord. Each chord card shows the chord's scale (its mode), what to sing, the notes to land on, and the notes not to hold. Tap a card to hear the chord; the keyboard below it maps the notes across your range.
- **Feels.** Eleven feels change the rhythm, the chord colors, and the drums: Piano pads, Ballad, Pop, Rock, Rock and roll, Blues shuffle, Neo soul, Neo jazz, Jazz swing, Gospel, and Bossa nova. Each progression remembers its own feel, and each starts in one that suits its era. Swung feels swing the melody too. Drums can be turned off.
- **Melody sound.** The chords stay on the grand piano. The melody (your scale or licks) can play on the piano, a synth lead, or a soft synth.
- **Make my own.** Build a loop of 2 to 8 chords in a major, minor, Dorian, Mixolydian, or blues feel. Every chord can be half a bar, 1 bar, or 2 bars long. Your progressions show up in the list under My progressions.
- **Scales.** Every chord gets its own run: a five-note scale on the chord's mode, the pentatonic that fits it, the arpeggio, or the guide tones (3rd, then 7th).
- **Licks.** A shelf of Crystal Cherelle's five building blocks plus the Vocal Licks licks and runs that land on a chord tone. Pick one and dots appear under the lane wherever it fits. Gold dots land on the 3rd or 7th right on a chord change. Tap a dot or drag the lick in.
- **Moving a lick.** Select a lick in the lane, then move it earlier or later (it jumps to the next spot where it still fits), up or down a scale step (the landing note is re-fit to the chord), or drag it. **Every chord** puts the picked lick on each chord change. Undo and Clear are there too. Arrow keys and Delete work on a selected lick.
- **Write your own notes.** Switch the lane to **Write notes** and it becomes a piano roll with a keyboard on the left (tap a key to hear the pitch). Tap an empty spot to add a note, or drag with a mouse to draw a longer one. Drag a note to move it, drag its right edge to stretch it, and pick the length and snap (1/16, 1/8, triplet, or beat) above the roll. While you write, chord tones are tinted pink and the rest of each chord's scale blue. Tap any note of a placed lick to mute it (tap again to bring it back), or select a lick and choose **Turn into my notes** to edit every note of it. Arrow keys move a selected note; Shift plus the arrows changes its length.
- **Drills.** Each loop can stay the same, **step walk** (every lick moves a scale step each loop: up, up, back, down, down, back), or **beat shift** (every lick starts half a beat later each loop, up to a beat and a half). The piano can play the notes with you, play them quietly, trade loops with you (call and response), or play only the chords.
- **Saved licks.** Name and save an arrangement (licks, muted notes, and your own notes), then load it later with its progression, key, and feel.
- **Setup.** Your lowest and highest note, whether licks use one scale for the whole key or each chord's own scale, click on or off, piano or synth, Test sound, and a copy-and-paste box for moving your progressions and saved licks to another device.

## iPhone and iPad

Open the live link in Safari, tap Share, then **Add to Home Screen**. It opens full screen and works offline after the first load. Tap **Test sound** in Setup once; if it's silent, turn off Silent mode. Playback stops when the app goes to the background.

## Run it locally

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Files

```
index.html            the page
css/app.css           the zine look            css/fonts.css   local fonts
js/theory.js          chord scales, landing, lock spots (from Vocal Licks)
js/data.js            progressions, riff blocks, licks (from Vocal Licks)
js/audio.js           Salamander piano loader, synth lead and soft synth, drum kit, iPad unlock, scheduler
js/band.js            voicings, the eleven feels, and the drum patterns
js/app.js             everything on the screen
tests/theory.test.js  node tests/theory.test.js
tools/sync_vocallicks.py   copies theory.js and data.js from a Vocal Licks checkout and runs the tests
tools/build_artifact.py    builds the one-page claude.ai preview
tools/icons.py             makes the home-screen icons
piano/ vendor/ fonts/ icons/ manifest.webmanifest sw.js
```

Progressions and licks live in Vocal Licks' `js/data.js`. Add one there, then run `tools/sync_vocallicks.py` to bring it over.

## Credits

Riff blocks by Crystal Cherelle, Indie Artist School. Progressions mostly from David Bennett's videos. Piano by Alexander Holm (CC BY 3.0) through Tone.js. Full details in [CREDITS.md](CREDITS.md). App code is MIT licensed; see [LICENSE](LICENSE).
