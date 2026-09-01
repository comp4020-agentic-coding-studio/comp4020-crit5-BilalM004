import { defineConfig } from "astro/config";

// Written by the course stack skill; values derived from this repo's origin
// remote. The dev server serves under the base too, so a path bug reproduces
// locally instead of only on the live URL. build.format "preserve" maps each
// page to the same output path it had before the conversion --- about.html
// stays /about.html and notes/index.html stays /notes/index.html --- so
// hand-written relative links and asset paths keep working. Astro's default
// ("directory") would move every root page to /about/, and "file" would
// collapse notes/index.html to /notes.html; either way half the pages get a
// URL one level off from the one their relative links were written against.
// compressHTML true because the default ("jsx") strips the space before
// line-broken inline elements in hand-written prose.
// This repo lives on /mnt/c — a WSL2 drvfs mount, where inotify events don't
// fire. Without polling the dev server silently serves whatever the module
// graph held when it started: edits land on disk, the browser keeps rendering
// the old build, and the bug looks like it's in the code you just wrote.
// Polling costs a little CPU and buys back "what I see is what I saved".
export default defineConfig({
  site: "https://comp4020-agentic-coding-studio.github.io",
  base: "/comp4020-crit5-BilalM004",
  build: { format: "preserve" },
  compressHTML: true,
  vite: { server: { watch: { usePolling: true, interval: 300 } } },
});
