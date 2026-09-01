# Crit 5

## The breakthrough

Measuring the game instead of reasoning about it. Laying out levels means
answering "how wide is too wide to jump" — not a number I get to choose, but one
the tuned constants already decided. So I stopped guessing and ran the real
physics headlessly, reading distances off the simulation.

It paid off twice by contradicting me. My first sweep called a 380px gap
survivable; the tick trace showed why — the player falls in, catches the far
building's climbable face on the way down, and climbs out. Every gap was a
slower staircase rather than a hazard, which staring at the layout would never
have shown me. Separately, I had calculated by hand that a climbed wall couldn't
be topped out, missing by about two pixels. The simulation disagreed, and
believing it over my own arithmetic is what made the door towers viable.

The fix that mattered wasn't the numbers. It was deriving the kill plane from
the geometry so it always sits under every building — the exploit became
unrepresentable rather than patched.

## What it changed

I have always been happy to be wrong; what changed is where I put the
correction. The instinct is to fix the bug and move on. The fixes I actually
value this week all landed in the harness — a sensor catching a freeze with no
visible symptom, a `CLAUDE.md` rule about stale dev servers, a spawn derived
from the platform so a bug I already made once cannot recur. A retry gets
today's build green; changing what the work runs against is what compounds.

I also want to be quicker to reach for a cheap empirical check whenever I catch
myself doing arithmetic in my head and trusting it.
