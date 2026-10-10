# Experimental Sectors mode

In Area Explorer, set `mode` to `Sectors`, then select a rectangle on Xaero's World Map
and choose **Explore** or **Rescan**. Site selections also use this mode when selected
in the module. Existing saved runs restore their own mode. Switching between `Area`
and `Sectors` during a run rebuilds the route on the next tick without clearing confirmed
coverage or finds. If paused, the new route is planned when resumed.

## Grid

`sector-size` defaults to **30 chunks** (480 blocks) on each side. New runs place sector
edges on multiples of the size in world chunk coordinates, so every selection shares one
grid; edge sectors are clipped to the selection. Runs saved before keep their grid anchored
to the selection's minimum corner. A whole number of strips per sector wastes no flight:
with a swath of `r` chunks a strip covers `2r + 1`, so 30 or 35 fit a swath of 2. At the
start the log suggests the nearest fitting size when the chosen one doesn't fit.

## Order

The nearest sector comes first. After that, side neighbours with work come first. Their cost
includes the current sector's flight, its exit and the crossing to the neighbour, plus half a
sector width for every open neighbour the candidate keeps (Warnsdorff). Dead ends and nearly
enclosed sectors are therefore taken while the run is beside them, not left as holes. With no
open neighbour, the run heads straight for the nearest open sector over finished ground. That
jump needs no shared exit, and the movement bound allows approaching the new sector from
outside. Sectors found fully mapped while choosing count as finished without a visit.

Right-click a sector on the World Map to change the plan:

- **Sector: work next** puts it right after the current sector, whatever its state.
- **Sector: skip** leaves it out of this run.
- **Sector: rescan** (Rescan runs only) forgets its rescanned chunks and works it next.

## Route

Each sector's route is the shorter of two families, including the exit towards the reserved
next sector:

- **Perimeter and core:** the inset perimeter, which covers all four corners and edges, then
  strips over the remaining core.
- **Snake:** strips placed `reach` rows past the first open row, trimmed to the open stretch
  of their band. Their turns run along the inset edges, so corners need no separate lap.

On an empty 30 × 30 sector the snake wins: 175 chunks of flight with a swath of 2, 105
with 4. The old overlapped route took 320. With partial coverage, either family can win. Entry starts on the side
facing the player. The route stays fixed during a sector instead of replanning after every
short strip. A confirmed sector skips the waiting phase and heads directly to its exit, and
the transition happens once that exit is reached. `strip-overlap` does not change this route.

## Swath

`sector-reach` sets the chunks loaded to each side of a strip; **0 = auto** (the default):

- Start one chunk inside the swath expected from the view distance (or the width Area mode
  learned on this server), and never below 2.
- If a sector's own route leaves gaps for cleanup, fall back to 2 at once. The width that
  failed is never tried again in this run.
- After three sectors in a row without gaps, widen by one chunk, up to that limit.

The swath only changes between routes: cleanup after a fallback already uses 2. A fixed
value is never changed. Saved runs keep the learned swath and its limit.

## Confirmation

Sweep, cleanup and settling targets stay in the inset flight rectangle (centred for
very narrow edge sectors). The arrival tolerance is six blocks, so nearby targets
are actually visited rather than immediately skipped by a large turn tolerance.
While autopilot is active, horizontal movement is bounded to the current sector,
including the player's width. Entering a new sector from outside remains possible;
the bound does not teleport the player or restrict manual flight while paused.

After the route, settling and up to `cleanup-passes` cleanup tours confirm coverage.
Confirmed completion skips the settling wait immediately. Otherwise a sector map read
starts after one second; if that confirms all chunks, the next sector starts early.
Remaining gaps retain the usual five-second settling period and a fresh map read
before cleanup, so the faster check does not count pending chunks as completed.
The next sector starts only when every chunk in the current sector is confirmed:
Explore uses Xaero's mapped coverage when available, while Rescan uses chunks loaded
during this run. Coverage remains global, so chunks loaded in neighbouring sectors
are credited too.

## Unfinished sectors

Chunks remain after the cleanup limit, or every remaining chunk is classified as unavailable
from the server. What happens then depends on `unfinished-sector`:

- **Defer** (default): the run moves on. Once every other sector is done, each deferred sector
  is retried once with a fresh cleanup and unavailable-chunk budget. If it fails again, it is
  skipped. The run finishes with a list of skipped sectors, their block coordinates and blank
  chunk counts.
- **Pause**: the run pauses and reports the sector. Press the module bind to retry it with a
  fresh budget.

Missing chunks are never counted as explored to allow a transition.

## Display

Xaero's World Map draws the sector grid on its own origin, above coverage shading:

- the current sector outlined in gold;
- the next one dashed in cyan;
- finished sectors tinted green;
- deferred sectors outlined in orange and skipped ones tinted red, each with its unconfirmed
  chunks filled.

`show-sector-grid` hides all of it; `show-on-map` controls the entire selection overlay.

The HUD shows the current sector, any deferred count and the overall selection percentage.
With site sync, the dashboard's run card draws the same grid for up to 4096 sectors (larger
grids show the counts only), with the current, next, finished, deferred and skipped sectors
and the current swath.

## Time estimate

Each worked sector is timed from entering it to leaving it. That includes flight there,
checks and cleanup; pauses and the initial map import are not counted. Once three sectors
are done, the time is fitted over the last 24 as a fixed part per sector plus a part per
chunk it still had. That fit is applied to every sector left, using its unconfirmed chunks,
re-counted every five seconds. Before that, the estimate uses the observed coverage rate for
the whole selection after 30 seconds of sector work.

## Saved sessions

Saved sessions keep:

- completed, deferred and skipped sector identities;
- whether the retry round has started;
- a sector picked to come next;
- the current sector, sector size and grid kind;
- the swath and its limit;
- confirmed coverage, including Rescan coverage.

Changing `sector-size` applies to a new selection. Disabling and re-enabling resumes the saved
sector and retries its route. If a saved destination is more than one sector width from the
player, resuming selects the nearest local sector and preserves completed sectors and confirmed
coverage.

## In-game test

1. Start with a selection crossing several sector boundaries.
2. Check Explore and Rescan separately.
3. Disable and re-enable the module mid-sector, and check that it resumes the same sector.
4. Check that edge gaps are cleaned before it moves on.
5. With auto `sector-reach`, check the log for the starting swath and any fallback.
6. Cover a sector the server won't send (for example, past the world border) and check that
   it is deferred, retried at the end and listed as skipped.
