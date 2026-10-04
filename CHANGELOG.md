# Changelog

Every release of the pokemon mod, generated from its commits by [git-cliff](https://git-cliff.org).

## 1.1.0 (2026-10-04)

### ✨ Features

- Add release command (#12)
- Add nickname command (#13)
- **sleep:** Add /pokemon sleep and share the mon across sessions (#14)
- **sleep:** Restore /pokemon sleep and let a pet leave it asleep (#16)
- Add text meters, per-mon sleeping eyes and per-session mons (#17)

### 🐛 Fixes

- **moves:** Add per-move mouth height for lick (#10)
- **sessions:** Read evolved before the stale-write check (#18)

### 📝 Docs

- **readme:** Add showcase layout with badges and install steps (#9)
- Update readme

## 1.0.0 (2026-10-04)

### ✨ Features

- **pokemon:** A pixel Pokémon above the prompt that paces while Claude works, thinks in a bubble, and hops when a turn ends
- **pokemon:** Idle wandering, or a home spot at the right edge with /pokemon wander
- **pokemon:** Pet and feed it, with food and happiness meters that drain over real time, and it falls asleep after five quiet minutes
- **pokemon:** All 151 gen 1 Pokémon, each in a default and a shiny variant, picked with /pokemon <mon>
- **pokemon:** /pokemon attack plays one of the mon's moves from the games as a pixel animation
- **plugin:** Install from the claude-pokemon plugin marketplace
- **pokemon:** Tool icons in the bubble, a "!" when Claude needs you, a Poké Ball per subagent, and XP, levels and evolution from the games
- **pokemon:** Add flinch on tool errors and box command (#6)

### 📝 Docs

- **readme:** Add demo gif, credits and disclaimer

