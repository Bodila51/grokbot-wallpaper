# Themes

The dashboard's default is the office: white studio light, the building as shipped, graphite cards. That path runs when no theme is selected. A theme is an optional dress on top of it. Bots, floors, usage, chat links and the feed fragment are not part of a theme.

## Choosing one

The feed link stays in the fragment: either a private feed (`#feed=<urlencoded base>&key=<read key>`) or a legacy shared topic (`#<topic>`). A theme never moves into the hash. `?theme=` stays in the query.

| Source | When it wins |
|---|---|
| `?theme=<id>` | This visit. `office` and `default` mean no theme. An unknown id is ignored and the saved choice is used instead. |
| `localStorage` key `bothq.theme` | When the query has no `theme`. The Theme menu in the top bar writes it and reloads. |
| Neither | The office, unchanged. |

`?time=` still drives the clock and beats a theme's fixed sunset. Wallpaper mode (`?mode=wallpaper`) reads the same query and the same saved choice; it has no menu.

Examples:

```text
https://<you>.github.io/<repo>/web/?theme=ranch#feed=<urlencoded base>&key=<read key>
https://<you>.github.io/<repo>/web/?mode=wallpaper&theme=ranch#<topic>
```

## Shape of a theme

`web/theme/themes.js` is the registry. The office is the absence of a theme, not an entry. To add one: a module, a `CATALOG` row, and a loader. The module is imported only when that theme is selected.

```js
{
  id: 'ranch',                  // ?theme=ranch, also <html data-theme="ranch">
  label: 'Texas Hill Country', // menu text, duplicated in CATALOG so the menu does not load the module
  loading: 'Setting up the ranch…',
  themeColor: '#E36A3C',        // meta theme-color, optional
  css: new URL('./ranch.css', import.meta.url).href,
  fontHref: 'https://fonts.googleapis.com/css2?family=…',
  sky: { centre, radii, stops, shadow, layers? },
  light: { night, lamps, windows, sunI, sunEl, sunAz, sunC, hemiI, hemiSky, hemiGnd, fillI, fillC, envI, exposure, shadow },
  lightPhase: 'golden',
  restyle(templates) {},
  mount({ scene }) {
    return { update() {} };
  },
}
```

Every field is optional. Hooks that are absent are not called.

`sky` is applied in `bootTheme`, before the studio pass is built. `light` is handed to `daylight.setLook`. With no theme, the pass keeps the `STUDIO` backdrop and the light stays noon.

`mount` should put props on **layer 1** and enable layer 1 on existing lights (leave layer 0 on). The camera is shown layer 1 only when `mount` exists. The aura silhouette is rendered with the camera masked to layer 0, so ranch props do not become one giant shadow. Do not add a ground plane large enough to cover the whole orthographic frame if the sunset backdrop should remain visible.

`restyle` sees the template roots (`floor_open`, `floor_closed`, `roof`, `elevator_shaft`, `elevator_cabin`) after the glTF materials are prepared. Tinting `material.color` on a baked lightmap multiplies it. Wall screens replace their material later, so task text is left alone. Blobs are not in the templates.

Keep a theme's geometry, textures and CSS in its own files under `web/theme/`. No copyrighted images. No new hosts: three.js stays on jsDelivr, fonts on Google Fonts, and bot data stays on the feed you already configured. Procedural geometry is enough, and it should stay cheap enough to sit behind a wallpaper (instancing, shared materials, no per-frame texture work).

`landing/assemble.mjs` copies `web/theme/` to `office/theme/` for the assembled site. A new file there is picked up by the existing `js|css` rule.

## Texas Hill Country

`web/theme/ranch.js` and `ranch.css`. Limestone tint on the tower shell, a caliche and grass pad, cedar posts with wire, live oaks, mesquite, juniper, prickly pear, a plank barn with a rusty tin roof, a lone star, a longhorn mount and a horseshoe, a windmill, a water tank, and a Texas flag on a pole (blue hoist with a white star, white over red, 2:3). The light is a fixed golden hour. Cards shift to saddle leather; status colours stay distinct. Fraunces is loaded only for this theme. The open floors are not tinted here: that is an interior theme, so a floor can stay a plain office inside a ranch exterior.

## Floor interiors

The exterior (sky, light, ground, scenery, and the closed shell of the tower) is still the one theme above. Each floor can dress its own interior: floor and wall tint, furniture colour, a few procedural props, the glass band of that floor when it is closed, and an accent on that floor's button and team card.

A floor's name is the label from the `groups` message, used as written. There is no built-in list of team names. A bot with no label is on a floor called `Unassigned`.

### Keyword guess

`FLOOR_THEME_RULES` in `web/theme/floor-theme-rules.js` is the only table. Add a row there to extend it. The first matching row wins. Matching is case-insensitive. A keyword of three or more letters matches as a substring. `it`, `pc`, and `art` match only as a whole word, so `community` is not a hit for `it`.

| Keywords (examples) | Interior id | Look |
|---|---|---|
| content, marketing, social, instagram, food, taste, media, publish | `studio` | Studio: ring light, camera, mic, posters |
| privacy, security, scrub, call | `vault` | Vault |
| design, art, brand, creative | `coffee` | Coffee bar |
| ranch, farm, cowboy, texas, bunkhouse | `ranch` | Bunkhouse |
| home, house, workshop, it, tech, pc | `casita` | Workshop: sawhorses, lumber, blueprint, hard hats |
| personal | `ranch` | Bunkhouse |
| dev, code, engineer, studio, studios, build, app | `arcade` | Arcade |
| work, job, career, office | `office` | The plain office interior |

Content words are listed before `studio`, so `Content Studio` is a studio and `Studios` alone is an arcade. `home` is listed before `office`, so `Home Office` is a workshop. A guess of `office` is the plain interior even when the building outside is the ranch.

A name that matches nothing follows the exterior theme. On the office exterior that is the plain interior, so a ranch exterior still tints those floors.

### What wins

For each floor, first hit wins:

1. **This browser**, `localStorage` key `bothq.floorThemes`, a map of floor name → interior id. The Theme menu writes it. `office` forces the plain interior. An empty value (Auto) removes the key.
2. **The feed**, a message `{"floor_themes":{"Ranch":"office"}}`. Keys are floor names, matched case-insensitively. Keys merge across messages; `"auto"` or `""` clears one key. A saved choice for that floor wins over the feed.
3. **The keyword table** above. A guess of `office` stops here, as the plain interior.
4. **The exterior theme**, when its id is also an interior (`ranch`). `Unassigned` reaches this step.
5. **The plain office.**

An unknown id is ignored and the next step runs.

The menu is the Theme button in the top bar: Building reloads the page (the sky and the shell change), each floor's select does not. Wallpaper mode has no menu; it still applies the saved choices, the feed, and the keyword table.

Adding an interior is a module under `web/theme/interiors/` plus a row in `interiors.js`. It exports `{ id, label, accent, ink, glass, tint, createProps }`. `tint` is `{ floor, wall, wood, metal, fabric, glass }` and recolors that floor's own materials. `createProps()` returns a cloneable group parked at the back-right of the room, clear of the desks and the left-wall screens. Props stay on layer 0. Do not add lights or per-frame work.
