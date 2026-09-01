# Process overview

## What I built

An intuitive spider-man, level progression game, based around reaching the next level by entering a door after all enemies are defeated. Includes simple walk/jump controls as well as a simple drag to shoot web mechanic, which the user can discover allows to swing from walls, or deal damage to enemies. There is a clear health bar for the player, and for enemies, to help the user strategise their moves. Completion of all 3 levels unlocks a win screen - where the user can opt to continue playing with stronger enemies/difficulty, or replay the default settings. 

## The moments that mattered

To manage the context window effectively, I outlined each deliverable (without deep technical details) into CLAUDE.md, but also got Claude to generate separate MD files with the deep technical pieces of information, for each deliverable. The payoff was that now, in each session, the context would not be wasted on irrelevant information to the session, instead, allowing for more space for relevant context. By being able to have more relevant details being focused on, I found myself interfering less with Claude's output, as it felt more aligned with what I was going for. [`c104acf`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-BilalM004/commit/c104acf)

Claude's screenshot verifications found that the viewport screen size was used as a difficulty setting, which was not an intended difficulty metric (but in hindsight, could be used as one). However, unintentional behavior being caught by screenshotting the viewports and reading the frame verification method's usefulness became apparent, and was then used for every later deliverable. Seen in commit:
[`e344220`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-BilalM004/commit/e344220)
