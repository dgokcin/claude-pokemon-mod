# pokemon

A Claude Code mod that draws one pixel Pokémon at the right edge of the band
above the prompt, reacting to what Claude is doing. The mon, berries, bubbles,
and Zs are pixel art in one `Raster`. Hearts and meters are one-cell characters
so they stay small.

## Behavior

| When | The mon | Driven by |
| --- | --- | --- |
| Claude works | Paces back and forth across the strip | band `isWorking` |
| Claude thinks | Shows a pixel thought bubble with animated dots | spinner `mode === 'thinking'` |
| A turn ends | Hops twice, unless you interrupted it | `turn.complete` (main agent only) |
| You're idle | Strolls to random spots in the strip, resting 3 to 8 s between walks | |
| You're idle, wandering off | Walks home to the right edge and bobs there | |
| 5 minutes with no turns or typing | Falls asleep, with a small and a big pixel Z beside its head | `prompt.edit`, `prompt.submit`, turns |
| `/pokemon pet` | Stops, hops, and sends up a stream of small ♥ hearts | |
| `/pokemon feed` | A random pixel berry drops nearby, the mon walks over, eats it a column at a time, and shows a bubble with a star | |
| Food or happiness under 30% | While idle and awake, shows a pixel thought bubble with a red berry (hungry) or a pink heart (lonely), taking turns when both are low | |

## Needs

Each mon has two meters at the bottom right of the band:

| Meter | Icons | Drains from full in | Filled by |
| --- | --- | --- | --- |
| Food | `●●●○○` in salmon pink | 8 hours | `/pokemon feed`: +35 |
| Happiness | `❤❤❤♡♡` in pink | 12 hours | `/pokemon pet`: +25, `/pokemon feed`: +5 |

Each icon is 20%. The meters are stored with a timestamp, so they keep draining while
Claude Code is closed. A new mon starts at 80%. The meters hide when the band is too
narrow for them.

## Requirements

- Claude Code v2.1.287 or later
- The terminal app. The Desktop app has no `Raster`, so the mod draws nothing there.
- A truecolor terminal (iTerm2, Ghostty, kitty, WezTerm)

## Usage

| Command | Effect |
| --- | --- |
| `/pokemon` | Show the active mon, its variant, its food and happiness, and the options |
| `/pokemon abra`, `/pokemon bulbasaur`, `/pokemon charmander` | Pick a mon, saved across sessions |
| `/pokemon shiny`, `/pokemon default` | Pick a variant, saved across sessions |
| `/pokemon wander` | Toggle idle wandering (on by default), saved across sessions |
| `/pokemon pet` | Pet the mon. Wakes it up, and counts pets across sessions |
| `/pokemon feed` | Toss it a random oran 🫐, pecha 🍑, razz 🍓, or sitrus 🍋 berry. Counts feeds across sessions |
| Ctrl+X Ctrl+A | Collapse or expand the band (Claude Code's own binding) |

## Mons

Band rows include one row of headroom for the hop.

| Mon | Pixels | Band rows | Frames (default) |
| --- | --- | --- | --- |
| abra | 19x19 | 11 | 2 idle, 2 walk at 300 ms |
| bulbasaur | 20x17 | 10 | 6 idle, 6 walk at 100 ms |
| charmander | 19x17 | 10 | 2 idle, 2 walk at 300 ms |

## Add a mon

1. Copy the four GIFs from `media/gen<N>/<mon>/` in [jakobhoeg/vscode-pokemon](https://github.com/jakobhoeg/vscode-pokemon/tree/main/media) into `sprites/<mon>/`.
   The files are `default_idle_8fps.gif`, `default_walk_8fps.gif`, `shiny_idle_8fps.gif`, and `shiny_walk_8fps.gif`.
2. Run `node scripts/build-frames.mjs`.
3. Run `/reload-plugins`. The mod loads in place from the repo, so no version bump or reinstall is needed.

## Layout

| Path | Contents |
| --- | --- |
| `hooks/register.js` | Band renderer, animation timer, `/pokemon` command |
| `hooks/frames.js` | Generated pixel frames. Don't edit by hand. |
| `sprites/<mon>/*.gif` | Source GIFs, 32x32 |
| `scripts/build-frames.mjs` | Regenerates `frames.js` from the GIFs with ffmpeg |
| `tests/pokemon.test.ts` | `claude plugin test` suite |

## Development

```bash
node scripts/build-frames.mjs      # after changing sprites/
claude plugin validate .
claude plugin test
claude --plugin-dir .              # live-reloading session
```

Each terminal cell holds two vertical pixels with `▀`/`▄` half blocks. The
sprite paces inside a 40 column strip.

## Credits

Sprites come from [jakobhoeg/vscode-pokemon](https://github.com/jakobhoeg/vscode-pokemon/tree/main/media).
Pokémon sprites are © The Pokémon Company / Nintendo / Game Freak, used here
for a personal, non-commercial fan project.
