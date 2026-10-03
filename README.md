# pokemon

A Claude Code mod that draws one pixel Pokémon at the right edge of the band
above the prompt, reacting to what Claude is doing. The mon, hearts, berries,
bubbles, and Zs are pixel art in one `Raster`. The meters are one-cell characters.

## Behavior

| When | The mon | Driven by |
| --- | --- | --- |
| Claude works | Paces back and forth across the strip | band `isWorking` |
| Claude thinks | Shows a pixel thought bubble with animated dots | spinner `mode === 'thinking'` |
| A turn ends | Hops twice, unless you interrupted it | `turn.complete` (main agent only) |
| You're idle | Strolls to random spots in the strip, resting 3 to 8 s between walks | |
| You're idle, wandering off | Walks home to the right edge and bobs there | |
| 5 minutes with no turns or typing | Falls asleep, with a small and a big pixel Z beside its head | `prompt.edit`, `prompt.submit`, turns |
| `/pokemon pet` | Stops, hops, and sends up a stream of big and small pixel hearts | |
| `/pokemon feed` | A random pixel berry drops nearby, the mon walks over, eats it a column at a time, and shows a bubble with a star | |
| `/pokemon attack` | Stops and plays one of its moves for 1.5 to 4 s. It turns side on to aim at the roomier side, or faces you for moves on itself | |
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

## Install

```bash
claude plugin marketplace add dgokcin/claude-pokemon
claude plugin install pokemon@claude-pokemon
```

To hack on it, clone the repo and add the clone instead
(`claude plugin marketplace add ./claude-pokemon`). A local marketplace loads the
mod in place, so edits apply on `/reload-plugins`.

## Usage

| Command | Effect |
| --- | --- |
| `/pokemon` | Show the active mon, its variant, its food and happiness, and the options |
| `/pokemon <mon>` | Pick a mon, like `/pokemon pikachu`, saved across sessions |
| `/pokemon list` | List every mon name |
| `/pokemon shiny`, `/pokemon default` | Pick a variant, saved across sessions |
| `/pokemon wander` | Toggle idle wandering (on by default), saved across sessions |
| `/pokemon pet` | Pet the mon. Wakes it up, and counts pets across sessions |
| `/pokemon feed` | Toss it a random oran 🫐, pecha 🍑, razz 🍓, or sitrus 🍋 berry. Counts feeds across sessions |
| `/pokemon attack` | Use a random move from the mon's moveset |
| `/pokemon attack <move>` | Use a specific move, like `/pokemon attack thunderbolt` |
| Ctrl+X Ctrl+A | Collapse or expand the band (Claude Code's own binding) |

## Attacks

`/pokemon attack` picks a random move from the mon's moveset in `hooks/moves.js` and
replies `Pikachu used Thunderbolt!`. `/pokemon attack <move>` picks one by name,
ignoring case, spaces, and dashes. An unknown move lists the mon's moves. While a
move plays, the mon stops walking and wakes up, and a second attack waits for it to end.

A move takes over the mon's body. A move aimed ahead turns the mon side on toward the
roomier side of the strip, and the mon winds up, lunges, recoils, or leaps as it hits. A
move on itself, like Harden or Recover, faces you, and the mon braces, shrinks, melts,
glows, or falls asleep instead.

`hooks/moves.js` has two tables. `MOVE_FX` gives each move its effect, plus an optional
`color`, a `power` of 1 or 2 for moves that share an effect at two sizes, and a `text`
line printed after the announcement. `MOVES` lists each mon's moves by name. An entry can
be `{ name, from: 'top' }` to send a move out of the top of the sprite, as Vine Whip and
the powders leave the Bulbasaur line's bulb, or `{ name, from: 'body' }` to pour it from
the whole body, as Koffing and Weezing do with Smog. An unknown effect plays `impact`.

The effects live in `hooks/effects/`, one file per family:

| File | Effects |
| --- | --- |
| `beams.js` | `hyperbeam`, `solarbeam`, `psybeam`, `aurorabeam`, `icebeam`, `bubblebeam` |
| `electric.js` | `thundershock`, `thunderbolt`, `thunder`, `thunderwave` |
| `fire.js` | `ember`, `flamethrower`, `firespin`, `dragonrage` |
| `water.js` | `watergun`, `hydropump`, `surf`, `waterfall`, `bubble`, `clamp` |
| `nature.js` | `vinewhip`, `razorleaf`, `petaldance`, `leechseed`, `drain`, `leechlife`, `powder`, `stringshot` |
| `poison.js` | `poisonsting`, `twineedle`, `acid`, `sludge`, `gas`, `pinmissile`, `spikecannon` |
| `mind.js` | `confusion`, `psychic`, `kinesis`, `hypnosis`, `nightshade`, `lick`, `confuseray`, `dreameater` |
| `sound.js` | `screech`, `supersonic`, `growl`, `roar`, `sing`, `lovelykiss` |
| `charge.js` | `tackle`, `quickattack`, `bodyslam`, `headbutt`, `skullbash`, `takedown`, `rage`, `thrash`, `outrage`, `hornattack`, `horndrill`, `stomp`, `slam` |
| `strikes.js` | `pound`, `doubleslap`, `megapunch`, `cometpunch`, `firepunch`, `icepunch`, `thunderpunch`, `megakick`, `lowkick`, `doublekick`, `hijumpkick`, `seismictoss`, `submission`, `karatechop` |
| `weapons.js` | `scratch`, `slash`, `furyswipes`, `cut`, `bite`, `hyperfang`, `crabhammer`, `vicegrip`, `guillotine`, `peck`, `drillpeck`, `furyattack`, `boneclub`, `bonemerang`, `wrap` |
| `sky.js` | `gust`, `wingattack`, `fly`, `skyattack`, `agility`, `doubleteam` |
| `earth.js` | `earthquake`, `dig`, `rockthrow`, `rockslide`, `sandattack`, `blizzard`, `mist` |
| `guard.js` | `harden`, `withdraw`, `defensecurl`, `minimize`, `focusenergy`, `meditate`, `amnesia`, `barrier`, `reflect`, `lightscreen`, `acidarmor` |
| `self.js` | `recover`, `softboiled`, `rest`, `splash`, `teleport`, `transform`, `explosion` |
| `special.js` | `swift`, `payday`, `triattack`, `eggbomb` |
| `basic.js` | `impact`, the fallback |

`hooks/effects/draw.js` holds the shared drawing helpers and lists what an effect can do
to a frame. Teleport leaves the mon at a random spot, Dig tunnels it forward, Transform
borrows another mon's sprite for a few seconds, and Splash does nothing at all.

To watch a move frame by frame without a terminal, render it to a PNG contact sheet:

```bash
node scripts/preview-attack.mjs pikachu thunderbolt          # from home, aiming left
node scripts/preview-attack.mjs pikachu thunderbolt --at 2   # from the left edge, aiming right
```

## Mons

All 151 gen 1 Pokémon are included, plus the `pikachu_female` and `venusaur_female`
variants. Names match the source folders, so use `mrmime`, `farfetchd`,
`nidoran_female`, and `nidoran_male`. Each mon has a default and a shiny variant.

The source GIFs are 32x32. The build crops each mon to the smallest box that fits
all its frames, so the band height depends on the cropped height. The band uses
one row per two pixels, plus one row of headroom for the hop. Diglett is the
smallest at 12 px (7 rows). Fearow, Gyarados, and Pidgeot are the tallest at
31 px (17 rows).

## Add a mon

1. Copy the four GIFs from `media/gen<N>/<mon>/` in [jakobhoeg/vscode-pokemon](https://github.com/jakobhoeg/vscode-pokemon/tree/main/media) into `sprites/<mon>/`.
   The files are `default_idle_8fps.gif`, `default_walk_8fps.gif`, `shiny_idle_8fps.gif`, and `shiny_walk_8fps.gif`.
2. Run `node scripts/build-frames.mjs`.
3. Run `/reload-plugins`. The mod loads in place from the repo, so no version bump or reinstall is needed.

## Layout

| Path | Contents |
| --- | --- |
| `hooks/register.js` | Band renderer, animation timer, `/pokemon` command |
| `hooks/attacks.js` | Attack registry: each move's pose, aim, and frame |
| `hooks/effects/*.js` | Attack animations, one file per family, on the helpers in `draw.js` |
| `hooks/moves.js` | Each move's effect, and each mon's moveset |
| `hooks/names.js` | Display names, like `Nidoran♀` and `Mr. Mime` |
| `hooks/frames.js` | Generated pixel frames. Don't edit by hand. |
| `sprites/<mon>/*.gif` | Source GIFs, 32x32 |
| `scripts/build-frames.mjs` | Regenerates `frames.js` from the GIFs with ffmpeg |
| `scripts/preview-attack.mjs` | Renders a move to a PNG contact sheet, one frame per tick |
| `tests/pokemon.test.ts` | `claude plugin test` suite |

## Development

```bash
node scripts/build-frames.mjs      # after changing sprites/
node scripts/preview-attack.mjs <mon> <move>   # writes /tmp/<mon>-<move>.png
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
This is a fan project, not affiliated with or endorsed by Nintendo, The Pokémon
Company, or Game Freak.
