<div align="center">

# claude-pokemon

**A pixel Pokémon that lives above your Claude Code prompt and reacts to everything Claude does.**

[![CI](https://github.com/dgokcin/claude-pokemon-mod/actions/workflows/ci.yml/badge.svg)](https://github.com/dgokcin/claude-pokemon-mod/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/dgokcin/claude-pokemon-mod)](https://github.com/dgokcin/claude-pokemon-mod/releases)
![151 Pokémon](https://img.shields.io/badge/Pok%C3%A9mon-151-ffcb05)
![135 moves](https://img.shields.io/badge/moves-135-ee1515)

![Bulbasaur gets petted and eats an oran berry above the Claude Code prompt](gifs/bulbasaur-pet-feed.gif)

</div>

```bash
claude plugin marketplace add dgokcin/claude-pokemon-mod
claude plugin install pokemon@claude-pokemon
```

Then pick your partner with `/pokemon pikachu`.

## Why you'll keep it on

- 🔎 **It watches Claude work.** A pencil for edits, a magnifier for reads, `>_` for shell commands.
- ⚪ **Every subagent is a Poké Ball.** It drops when the subagent starts and pops when it reports back.
- ❗ **It tells you when Claude needs you.** A red "!" for questions, plan approvals, and permission prompts.
- 💦 **It flinches when a tool fails.** A shake and a sweat drop, so you notice.
- 📈 **It levels up as you ship.** Every answered turn earns XP, and mons evolve at their levels from the games.
- 🫐 **It needs you too.** Feed it and pet it, or it gets hungry and lonely.
- ⚡ **It fights.** 135 moves from gen 1, each with its own pixel animation.
- 🎨 **All 151 gen 1 Pokémon**, each in default and shiny.

## See it

**Watch it follow Claude's tools.** A magnifier for reads, a pencil for writes, and a level-up when the answer lands.

![Pikachu's bubble shows a magnifier, then a pencil, while Claude reads files and writes a haiku](gifs/pikachu-haiku.gif)

**Run subagents and watch the balls drop.**

![Four Poké Balls drop beside Squirtle while four subagents run, and pop as they finish](gifs/squirtle-subagents.gif)

**Evolve it.** At the right level, or with a stone.

![Growlithe glows, flickers into Arcanine's silhouette, and flashes into Arcanine](gifs/growlithe-evolution.gif)

**Make it attack.** Magikarp uses Splash. Nothing happens. Gengar uses Night Shade.

![Magikarp splashes to no effect, then Gengar casts Night Shade](gifs/magikarp-gengar-attack.gif)

## Commands

| Command | What it does |
| --- | --- |
| `/pokemon <mon>` | Pick a mon, like `/pokemon charmander` |
| `/pokemon pet` | Pet it |
| `/pokemon feed` | Toss it a berry |
| `/pokemon attack [move]` | Use a random move, or a named one like `thunderbolt` |
| `/pokemon evolve` | Evolve with a stone or a trade |
| `/pokemon stats` | Level, XP, evolution, and meters |
| `/pokemon box` | Every mon you've raised |

<details>
<summary>All commands</summary>

| Command | Effect |
| --- | --- |
| `/pokemon` | Show the active mon, its variant, level, meters, and the options |
| `/pokemon <mon>` | Pick a mon, saved across sessions |
| `/pokemon list` | List every mon name |
| `/pokemon shiny`, `/pokemon default` | Pick a variant, saved across sessions |
| `/pokemon wander` | Toggle idle wandering (on by default) |
| `/pokemon pet` | Pet the mon. Wakes it up and counts pets across sessions |
| `/pokemon feed` | Toss it a random oran 🫐, pecha 🍑, razz 🍓, or sitrus 🍋 berry |
| `/pokemon attack` | Use a random move from the mon's moveset |
| `/pokemon attack <move>` | Use a named move, ignoring case, spaces, and dashes |
| `/pokemon moves`, `/pokemon attack list` | List the active mon's moves |
| `/pokemon moves <mon>` | List another mon's moves |
| `/pokemon evolve` | Evolve with a stone or a trade. Also restarts an evolution you cancelled |
| `/pokemon evolve <mon>` | Pick what Eevee becomes, like `/pokemon evolve jolteon` |
| `/pokemon stop` | Cancel an evolution |
| `/pokemon needs` | Toggle food and happiness (on by default) |
| `/pokemon stats` | Show the level, XP to the next one, how it evolves, the meters, and your pets and feeds |
| `/pokemon box` | List every mon you've raised, highest level first |
| Ctrl+X Ctrl+A | Collapse or expand the band (Claude Code's own binding) |

</details>

## Requirements

- Claude Code v2.1.287 or later, in the terminal. The Desktop app can't draw the band.
- A truecolor terminal, like iTerm2, Ghostty, kitty, or WezTerm. Light and dark themes both work.

## How it works

<details>
<summary>What the mon reacts to</summary>

| When | The mon | Driven by |
| --- | --- | --- |
| Claude works | Paces back and forth across the strip | band `isWorking` |
| Claude thinks | Shows a thought bubble with animated dots | spinner `mode === 'thinking'` |
| Claude runs a tool | Shows the tool in its bubble: a pencil for edits, a magnifier for reads and searches, `>_` for shell, a Poké Ball for subagents, a wrench for the rest | `tool.call` (main agent only) |
| A tool call fails | Shakes, then holds still with a blue sweat drop. Calls you deny or interrupt don't count. It skips the flinch while a move or a "!" is showing | `tool.call` (main agent only), `tool.check` |
| Claude needs you | Stops, faces you, and shows a red "!" until you answer. If you don't reply within a minute of a turn ending, it shows the "!" for 2 minutes | AskUserQuestion, ExitPlanMode, `turn.complete`, `classic.PermissionRequest`, `classic.Notification` |
| A subagent runs | Drops a Poké Ball that wobbles while the subagent works and pops when it ends. Past six, the last slot shows `+n` | `agent.spawn`, `turn.complete` |
| A turn ends | Hops twice, unless you interrupted it | `turn.complete` (main agent only) |
| A turn ends with an answer | Earns XP, and may level up or evolve | `turn.complete` (main agent only) |
| You're idle | Strolls to random spots, resting 3 to 8 s between walks. With wandering off, it walks home and bobs | |
| 5 minutes with no activity | Falls asleep with pixel Zs | `prompt.edit`, `prompt.submit`, turns |
| Food or happiness under 30% | Thinks of a berry (hungry) or a heart (lonely). Walks slower when hungry | |
| Happiness at 80% or more | Hops for joy every 20 to 40 s | |

Some organizations run a policy plugin that blocks `classic.*` events from user plugins.
Under one, the "!" still shows for questions, plan approval, and the idle minute, but not
for permission dialogs.

</details>

<details>
<summary>Food and happiness</summary>

Two meters sit at the bottom right of the band. Each icon is 20%.

| Meter | Icons | Empties from full in | Filled by |
| --- | --- | --- | --- |
| Food | `●●●○○` | 8 hours | `/pokemon feed`: +35 |
| Happiness | `❤❤❤♡♡` | 12 hours | `/pokemon pet`: +25, `/pokemon feed`: +5 |

The meters keep draining while Claude Code is closed. A new mon starts at 80%. The meters
scale the XP a turn earns, from half when both are empty to one and a half when both are
full. `/pokemon needs` turns them off, and XP then ignores them.

</details>

<details>
<summary>Levels and evolution</summary>

Each answered turn of the main agent earns `10 + 2 × level` XP, doubled for turns of two
minutes or more and scaled by the meters. Levels follow the games' medium fast curve, where
level L takes L³ XP. A new mon starts at 5, or at the level it evolves at, so Charmeleon
starts at 16. With 30 s turns and full meters, 5 to 16 takes about 75 turns.

When the mon reaches its evolution level from Red and Blue, it evolves once idle. It glows,
flickers between its two shapes, and flashes into its new form. `/pokemon stop` cancels,
and the next level-up tries again. Level, XP, and meters carry over.

The 19 mons that evolve with a stone or a trade, like Pikachu, Eevee, and Kadabra, use
`/pokemon evolve`. Eevee needs a pick, like `/pokemon evolve jolteon`.

</details>

<details>
<summary>Attacks</summary>

A move takes over the mon's body. For a move aimed ahead, the mon turns toward the roomier
side, backs up to the far edge, and then winds up, lunges, or leaps as the effect plays
across the strip. A move on itself, like Harden or Recover, plays in place, and the mon
braces, shrinks, glows, or falls asleep. Teleport moves it to a random spot, Dig tunnels it
forward, Transform borrows another mon's sprite, and Splash does nothing at all.

`hooks/moves.js` holds two tables. `MOVE_FX` maps each move to an effect, with an optional
`color`, a `power` of 1 or 2, and a `text` line. `MOVES` lists each mon's moves. An entry
can be `{ name, from: 'top' }` to launch from the top of the sprite, like Vine Whip from
Bulbasaur's bulb, or `{ name, from: 'body' }` to pour from the whole body, like Koffing's
Smog. An unknown effect plays `impact`.

| File in `hooks/effects/` | Effects |
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
| `evolve.js` | `evolve`, the evolution sequence |
| `basic.js` | `impact`, the fallback |

`hooks/effects/draw.js` holds the shared drawing helpers.

</details>

<details>
<summary>Sprites and sizing</summary>

All 151 gen 1 Pokémon are included, plus `pikachu_female` and `venusaur_female`. Names
match the source folders, so use `mrmime`, `farfetchd`, `nidoran_female`, and
`nidoran_male`.

Each terminal cell holds two pixels with `▀`/`▄` half blocks, and the mon paces inside a
40 column strip. The build crops each 32x32 GIF to the smallest box that fits all its
frames, so the band height depends on the mon. Diglett is the smallest at 7 rows. Fearow,
Gyarados, and Pidgeot are the tallest at 17.

When the pane is too short, the band shrinks the whole scene to fit. Each shrunk pixel
takes the most common color of its block, and ties go to the darker color, so outlines and
eyes survive. Below 4 rows it shows a line of text instead, like
`Pikachu Lv 12 ●●●●○ ❤❤❤❤♡`.

</details>

## Hack on it

```bash
git clone https://github.com/dgokcin/claude-pokemon-mod
claude plugin marketplace add ./claude-pokemon-mod
claude plugin install pokemon@claude-pokemon
```

A local marketplace loads the mod in place, so your edits apply on `/reload-plugins`.

<details>
<summary>Add a mon</summary>

1. Copy the four GIFs from `media/gen<N>/<mon>/` in [vscode-pokemon](https://github.com/jakobhoeg/vscode-pokemon/tree/main/media) into `sprites/<mon>/`: `default_idle_8fps.gif`, `default_walk_8fps.gif`, `shiny_idle_8fps.gif`, and `shiny_walk_8fps.gif`.
2. Run `node scripts/build-frames.mjs`.
3. Give it a moveset in `MOVES` in `hooks/moves.js`. Every mon needs at least one move.
4. If it evolves, add it to `hooks/evolutions.js`. If its name isn't just the key capitalized, add it to `hooks/names.js`.
5. Run `node scripts/check-data.mjs`, then `/reload-plugins`.

</details>

<details>
<summary>Development</summary>

```bash
node scripts/build-frames.mjs                    # after changing sprites/
node scripts/preview-attack.mjs <mon> <move>     # contact sheet in /tmp/<mon>-<move>.png
node scripts/preview-attack.mjs <mon> <move> --at 2   # start from the left edge
node scripts/check-data.mjs                      # moves, evolutions, and sprites agree
npx @biomejs/biome@2.5.15 ci --error-on-warnings .   # lint, same as CI
claude plugin validate .
claude plugin test
claude --plugin-dir .                            # live-reloading session
```

| Path | Contents |
| --- | --- |
| `hooks/register.js` | Band renderer, animation timer, `/pokemon` command |
| `hooks/attacks.js` | Attack registry: each move's pose, aim, and frame |
| `hooks/effects/*.js` | Attack animations, one file per family |
| `hooks/moves.js` | Each move's effect, and each mon's moveset |
| `hooks/names.js` | Display names, like `Nidoran♀` and `Mr. Mime` |
| `hooks/levels.js` | The XP curve, and the XP a turn earns |
| `hooks/evolutions.js` | Gen 1 evolutions, and each mon's start level |
| `hooks/party.js` | The Poké Balls of running subagents |
| `hooks/zoom.js` | Shrinks the band to fit a short pane |
| `hooks/frames.js` | Generated pixel frames. Don't edit by hand |
| `sprites/<mon>/*.gif` | Source GIFs, 32x32 |
| `scripts/` | Frame builder, attack previewer, data check |
| `tests/pokemon.test.ts` | `claude plugin test` suite |

CI runs the lint, the data check, and the tests on every pull request and push to `main`.
Commits follow [Conventional Commits](https://www.conventionalcommits.org). When `main`
gains a `feat`, `fix`, or `perf` commit, CI opens a `chore(release)` PR that bumps
`plugin.json` and `CHANGELOG.md` with git-cliff. Merging it tags the release and publishes
the notes. This needs "Allow GitHub Actions to create and approve pull requests" turned on
in the repository's Actions settings.

</details>

## Credits

The sprites come from [vscode-pokemon](https://github.com/jakobhoeg/vscode-pokemon) by
[Jakob Hoeg Mørk](https://github.com/jakobhoeg), the extension that puts Pokémon in your VS
Code window. Those GIFs took slow, manual work to make, and this mod would not exist
without them. If you like the mod, give the original a star. vscode-pokemon builds on
[vscode-pets](https://github.com/tonybaloney/vscode-pets) by
[Anthony Shaw](https://github.com/tonybaloney).

`sprites/` holds unmodified copies of the gen 1 GIFs from vscode-pokemon's
[`media/`](https://github.com/jakobhoeg/vscode-pokemon/tree/main/media) folder, and
`hooks/frames.js` holds the pixel frames built from them.

## Disclaimer

This is an unofficial, non-commercial fan project. It is not affiliated with, endorsed by,
or sponsored by Nintendo, Creatures Inc., GAME FREAK inc., or The Pokémon Company. Pokémon
and Pokémon character names are trademarks of Nintendo. The sprite artwork is © Nintendo,
Creatures Inc., GAME FREAK inc., and The Pokémon Company. Rights holders who want anything
removed can open an issue.
