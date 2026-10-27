# Area objectives and stars (spec, approved 2026-10-27, built)

## Why
Every area plays the same: clear the waves, sometimes a boss. Objectives give each area its own job,
and stars give every area a reason to replay.

## Objective types
| Type | What you do | You fail if | On screen |
|---|---|---|---|
| Slay | Clear every wave (current behaviour) | You fall | Wave counter |
| Defend | Protect an object (cart, shrine, banner). Enemies target it first | It is destroyed, or you fall | Its health bar under the wave counter |
| Bounty | Kill a fast elite target that flees and calls adds | It escapes when the timer runs out | Timer and an arrow pointing to it |
| Survive | Last until the timer ends; enemies keep coming in bigger groups | You fall | Countdown |
| Trap room | Clear the waves while floor traps (spikes, poison, fire) fire in patterns | You fall | Wave counter; traps glow before they fire |
| Boss | Waves, then the boss (current) | You fall | Boss bar |

Wave sizes follow `G.WAVE_PLAN` (final wave 20). Survive uses a steady stream capped by `maxAlive`.

## Stars
- Star 1: complete the objective.
- Star 2: finish under the area's time target (shown in the area brief before you start). Survive areas have a fixed length, so their star 2 is a kill target instead.
- Star 3: the area's challenge (one per area, listed below).
- Stars are kept per area at their best; you can earn them in separate runs.
- Defeat or leaving gives no stars, but experience and loot are kept, as now.

### Challenge pool
- No potions used
- Take less than 30% of your max health in total damage
- Defended object above 50% health
- Kill the bounty within half the time
- Never touched by a trap
- Defeat the boss without being hit by its heavy attack
- Defeat N enemies with your ultimate

## Area plan
| Area | Lv | Objective | Time target | Star 3 challenge |
|---|---|---|---|---|
| Mossy Courtyard | 1 | Slay | 3:00 | Take less than 30% damage |
| Old Mill Road | 3 | Defend the supply cart | 3:30 | Cart above 50% |
| Thornwood Edge | 6 | Trap room (snare vines) | 3:30 | Never touched by a trap |
| Bandit Camp | 9 | Bounty: Bandit Captain (90s) | 2:30 | Kill him within 45s |
| Keep Gate | 12 | Boss: Brute Captain | 4:00 | No potions used |
| Whispering Graveyard | 15 | Defend the chapel bell | 4:00 | Bell above 50% |
| Bone Fields | 20 | Slay | 4:00 | Take less than 30% damage |
| Toxic Mire | 25 | Survive 2:00 (poison pools) | Defeat 45 enemies | Never touched by poison |
| Bone Hollow | 30 | Trap room (bone spikes) | 4:00 | Never touched by a trap |
| Crypt | 35 | Boss | 5:00 | Avoid the boss's heavy attack |
| Causeway | 40 | Bounty: Kobold Runner (90s) | 3:00 | Kill it within 45s |
| Sunken Halls | 45 | Survive 2:30 (rising water slows you) | Defeat 55 enemies | No potions used |
| War Camp | 50 | Defend the war banner | 4:30 | Banner above 50% |
| Vault | 55 | Trap room (fire jets) | 4:30 | Never touched by a trap |
| Sunken Ruins | 60 | Boss | 5:00 | No potions used |
| Shrine Approach | 65 | Slay | 5:00 | Take less than 30% damage |
| Oath Path | 72 | Bounty: Oathbreaker (90s) | 3:30 | Kill him within 45s |
| Broken Vows | 80 | Defend the last lantern | 5:00 | Lantern above 50% |
| Shrine of the Fallen | 90 | Boss: Sir Varric | 6:00 | Avoid his heavy attack |
| Endless Trial | 90 | Unchanged (best wave) | n/a | n/a |

## Rewards
- First time an area reaches 3 stars: a star chest with one guaranteed Rare or better item for that area's level, plus gold.
- Region milestones (claimed from the region banner on the world map):
  - Emberhold Vale (15 stars max): 5, 10, 15
  - The Deadlands, Sunken Ruins, Shrine of the Fallen: the same steps
  - Rewards rise per step: gold and potions, then an Epic item, then a Legendary at the final step of each region.

## UI
- Area card: three stars in the corner and the objective type as a chip (Slay, Defend, Bounty, Survive, Traps, Boss).
- Tapping an area opens a brief: the goal, how it works, the three stars with their requirements, best time, and Enter.
- Before the run: the banner names the objective ("Defend the supply cart").
- During the run: the tracker shows the objective, the timer, and the star 3 challenge with a tick or cross as it holds or breaks.
- Victory screen: the three stars light up one by one, then the chest opens if earned.

## Save data
- `p.areas[id].stars`: a number 0 to 3 (best kept), plus `p.areas[id].best` (fastest time).
- `p.regionClaims[regionId]`: the milestones claimed.
- Old saves: cleared areas start at 1 star.

## Build phases
1. Stars on the existing Slay and Boss areas (timer, challenges, card stars, victory stars, chest, milestones).
2. Defend and Bounty.
3. Survive and Trap rooms (new hazards: vines, poison, spikes, fire jets, water).

## Build notes
- Code: `js/objectives.js` (area table `G.AREA_OBJ`, objective logic, traps and hazards, star scoring, drawing).
- game.js hooks (outside the Storm Blade lock): `run.obj` set in startArea, `G.objectives.update` each frame, `think` in enemy AI,
  `hitObject` on enemy swings, damage and potion counters in `run.stat`, `pl.slowMul` for water and vines, stars saved in finishRun.
- Defend: 60% of melee enemies go for the object; any enemy you hit, or that gets close to you, turns on you for a few seconds.
- Bounty: flees when you are within 120 px, blinks away when cornered (every 7 s), calls 3 helpers every 11 s. Other elites never take its health bar.
- Traps hurt enemies too (spikes and fire 14% of their health, vines slow them), so luring works.
