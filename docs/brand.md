# Muxyard identity

## The mark

The Muxyard mark is a real tmux layout reduced to three rounded panes: one tall pane on the left and two stacked panes on the right. The five-degree tilt gives the silhouette a little motion. The quieter lower pane adds depth without a gradient, outline, or detail that disappears at small sizes.

The shape is the stable identity. Primary blue (`#245bd7`) is used on the website, in documentation, and on the app icon. Inside the app, the mark may inherit the selected palette's accent. Do not redraw the three panes for individual surfaces.

## Files

- [Canonical pane mark](../assets/brand/mark.svg): transparent SVG, primary blue. This is the source geometry.
- [White mark](../assets/brand/mark-white.svg): transparent SVG for dark or colored backgrounds.
- [Wordmark](../assets/brand/wordmark.svg): primary mark with dark lettering for light backgrounds.
- [Dark-background wordmark](../assets/brand/wordmark-dark.svg): lighter blue and white lettering.
- [Native app icon source](../assets/icon.svg): the same mark on a light rounded tile.
- [Native icon PNG](../build/icon.png): generated 1024-pixel application icon.

The wordmark uses outlined Inter lettering at a semibold weight. It contains vector paths rather than live text, so its proportions do not depend on a viewer's installed fonts. The website hosts Inter locally; its [SIL Open Font License](../website/fonts/OFL.txt) is included.

## Use

Use the mark alone for app icons, favicons, compact navigation, or an avatar. Use the horizontal wordmark when the name needs to be introduced. Give the mark at least half a pane's width of clear space. Keep the SVG's proportions and relative pane opacity. Avoid placing it on a busy image or adding shadows to the pane shapes.

A 20–24 pixel mark is suitable for normal interface navigation. Use at least 16 pixels for a favicon and at least 120 pixels of width for the horizontal wordmark. A dark background uses the white mark or dark-background wordmark.

Product screenshots must identify sample data and distinguish the current source build from a published installer when their features differ.

## Regeneration

The generated wordmarks and app icon share `assets/brand/mark.svg`. To change the geometry, edit only that file, then regenerate:

```sh
# Optional developer toolchain for outlining lettering; use your Python environment.
python3 -m pip install fonttools brotli
python3 scripts/generate-brand.py
npm run icon
```

The SVG outputs are checked in. Normal app and website builds do not need Python or a font conversion step. `npm run icon` uses Electron to render the checked-in SVG into the PNG consumed by Electron Builder.
