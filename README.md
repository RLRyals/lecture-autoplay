# Lecture Autoplay

A bookmarklet that plays videos back-to-back on course platforms — Teachable, Thinkific, and similar — so you don't have to click play on every lecture.

**Live install page:** https://rlryals.github.io/lecture-autoplay/

## What it does

- Finds every native `<video>` and Hotmart / Wistia / YouTube / Vimeo iframe on a page, in DOM order.
- Plays them back-to-back, scrolling each into view and outlining it.
- Floating toolbar pinned to the top: ⏮ ⏸ ⏭ ↻, reload current, jump to next lecture, plus 0.5× / 1× / 1.25× / 1.5× / 1.75× / 2× / 3× speed.
- When the last video on the page ends, clicks the page's "Next lecture" / "Complete &amp; Continue" button to advance.
- Persists speed and auto-advance preference across page loads via `sessionStorage`.

## Install

Open the [install page](https://rlryals.github.io/lecture-autoplay/) and drag the button to your bookmarks bar.

## Browser autoplay setup

Modern browsers block autoplay by default. The install page covers per-browser setup; the short version:

- **Edge:** `edge://settings/content/mediaAutoplay` → set to **Limit**, then add your course host (e.g. `teachable.com`) to the **Allow** list.
- **Chrome:** no longer exposes a per-site autoplay setting. You'll need to click the first video manually; the bookmarklet chains the rest.
- **Firefox:** Settings → Privacy & Security → Permissions → Autoplay → block by default, add your course domain as an exception.

## Files

- `index.html` — install page (served by GitHub Pages).
- `bookmarklet-source.js` — readable source.
- `build.js` — minifies and URL-encodes the source into `bookmarklet.href.txt`.
- `bookmarklet.href.txt` — the final `javascript:` URL.

## Build

```
node build.js
```

Then paste the contents of `bookmarklet.href.txt` into the `href=""` attribute of the install button in `index.html`.

## License

MIT.
