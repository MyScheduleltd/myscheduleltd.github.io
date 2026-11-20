# Studio-stem chart authoring

The full mixes shipped with the game own the timeline. Original WAV stems and
review audio stay outside the game package. Builds consume the versioned
`moth-funk-charts.json`; they do not analyze audio in a player's browser.

For the corrected November 18 exports, `moth-stem-clocks.json` pins all 20
source hashes and independently measured clocks. `author-moth-funk.py` rejects
different source bytes. `audit-moth-stems.py` provides the separate broad
waveform search when new exports arrive. Percussion energy can support tempo,
but cannot identify the musical One among the four bar rotations; the approved
full-mix meter anchors are retained. Note attacks are never snapped to that grid.

Use Python with NumPy/SciPy and FFmpeg on PATH. Example local pipeline:

```sh
python3 scripts/audit-moth-stems.py \
  --stems /path/to/correct-stems \
  --output .qa/moth/review/clock-audit.json

python3 scripts/author-moth-funk.py \
  --stems /path/to/correct-stems \
  --bass-directory /path/to/mix-aligned-separated-bass \
  --alignment-audit .qa/moth/review/clock-audit.json \
  --output .qa/moth/review/candidates.json \
  --report .qa/moth/review/analysis.json

node scripts/select-moth-easy.mjs \
  --candidates .qa/moth/review/candidates.json \
  --analysis .qa/moth/review/analysis.json \
  --baseline /path/to/pre-change-level1.json \
  --output .qa/moth/review/selected.json \
  --report .qa/moth/review/selected-analysis.json
```

The baseline supplies arrangement boundaries and published Easy counts, never
old attack times. Preserve that pre-change baseline for repeat authoring runs;
using an already reduced build would reduce difficulty again. The installed
source records those baseline counts and resulting density in `easyDifficulty`.

Easy selects approximately 80% of the preceding published playable heads in
both Story and full-song arrangements. It prioritizes real Ones, fill accents,
holds and occupied-bar anchors, with a 225 ms normal spacing floor. Strong
source-measured fill pairs can use190–224 ms; their physical drum voices,
salience and burst evidence are recorded and verified. The lane arranger
uses recurring riff positions and simpler fast gestures while keeping M/O/T/H
within 15–35% each. It changes letters, never sound times or measured tails.

Hard chooses and times articulations from the lead vocal, without snapping
syncopation or inserting calculated beat-one hits. Sustained voice energy alone
does not create repeated notes. A190 ms normal spacing floor selects among
close articulations;125–189 ms pairs require two independently strong voiced
resets, and a fast run has at most three heads. Acoustic delivery classes and
matching phrases determine letters instead of bar boundaries or a rotating
key counter. This does not recognize linguistic words or certify their meaning.
Both modes can use measured bass attacks only during extended
rests in their primary stem. Supplied bass is preferred; separated bass must
come from the exact full mix without trimming. Level 6 opening hold tails are
measured from its corrected bass decay rather than old hand-entered constants.

Rebuild the 15 Easy mixes with `mix-moth-easy.py` using the new analysis and
existing generated config. It blends the corrected aligned drums into the
original mixes/cuts without rewriting Hard audio. Verify hashes, decoded
lengths and peaks before updating the additions manifest. Changed assets need
new matching CDN pins, or `mirrorCommit: null` for the hash-checked site loader.

After installing reviewed rows and mixes, bump the chart/build version and
build both public/staff pages. Archive the preceding scoreboard limits before
regenerating current caps; older tickets and boards stay on their own version.
Keep the two-second unscored musical fade and existing visible note approach.

Run chart, Easy difficulty/lane, package, audio preparation and scoreboard
checks, then actual-media and opening browser suites. Export clicks with
`audition-moth-funk.py` using exactly the projected playable letters/times.
Listen over the isolated drums for Easy and lead vocal for Hard, with bass in
fallback passages. Numeric source matching and browser timing checks do not
certify every syllable choice, subjective groove or physical-device latency.
