# Northern Lights Watch

An embeddable widget for the Theodore Roosevelt Presidential Library that shows the northern lights outlook for Medora, North Dakota, a trip planner for the year ahead, and what the record since 1932 says about when to come. Served from GitHub Pages at `aurora.labs.trlibrary.com`; the history is rebuilt weekly by a GitHub Action.

## Embed

```html
<div id="trpl-aurora"></div>
<script src="https://aurora.labs.trlibrary.com/aurora.js" defer></script>
```

Optional attributes on the script tag:

| Attribute | Effect |
|---|---|
| `data-view="compact"` | Only the outlook for tonight and the next two nights, for a sidebar or the homepage |
| `data-view="planner"` | Only the trip planner |
| `data-more="https://..."` | In the compact view, where "See the full outlook" links |
| `data-history="off"` | Full view without the planner and history |
| `data-heading="off"` | Hides the built-in heading and intro |
| `data-cta="off"` | Hides the lodging links, or give another address. Default: trlibrary.com/visit/lodging/availability. The planner adds `?checkin=YYYY-MM-DD&nights=2`, which the lodging finder reads |
| `data-target="#id"` | Mounts in a different element |
| `data-fonts="off"` | Does not load the brand fonts |

The widget renders in a shadow root, so page styles do not leak in or out. Fonts are the trlibrary.com brand faces, loaded from trlibrary.com when the widget is used elsewhere.

## What it shows

**Tonight and the next two nights.** For each dark stretch (sun at least 12 degrees below the horizon):

- Space weather: the highest Kp in NOAA's 3-day forecast during the dark hours.
- Sky: average cloud cover after dark and the clearest three-hour stretch (Open-Meteo).
- Darkness and moon: when it is dark, how much of the moon is lit, and when it rises or sets.

The rating comes from Kp, with one step taken off when the clearest stretch is still 70% cloud or more:

| Kp after dark | Rating | What it means from Medora |
|---|---|---|
| under 4 | Unlikely | Quiet |
| 4 | Low | A faint glow may show on camera low in the north |
| 5 | Possible | May show low on the northern horizon |
| 6 | Good | A good chance of a display to the north |
| 7 and up | Strong | Could climb high into the sky |

Medora sits near 55 degrees magnetic latitude, so these levels are rules of thumb. When it is dark and the current Kp estimate is 4 or more, the widget also reads NOAA's 30-minute OVATION model for the band of sky north of Medora and shows an "Active now" note when warranted.

**Plan a trip.** Every night for the next year gets a score, then nights are ranked against each other (top tenth "Best", next quarter "Good", next third "Fair", the rest "Low"):

1. Seasonal odds: the share of nights within 10 days of that date, since 1940, that had Kp 5+ after dark under a mostly clear sky.
2. Solar cycle: how active the same year after solar maximum has been in past cycles, relative to average (`cycle.factor_by_years_after_max` in history.json).
3. Moonlight: a bright moon that is up through the dark hours halves the score; a new moon leaves it unchanged.
4. NOAA's 45-day outlook, where it reaches: a forecast planetary A index of 16 or more ("active") multiplies the score by 1.5; 30 or more ("storm") by 2.
5. Nights in the 3-day forecast take their rating from the live outlook instead.

The five best three-night stretches are listed above the calendar. Each shows the chance, based on past years, of aurora-strength activity under a clear sky on at least one of the three nights. Tapping a night shows the reasoning and links to the lodging finder on that date.

**When to come.** Monthly averages, nights per year since 1932, recent big nights, and viewing tips.

## Data

| Source | Used for | Read by |
|---|---|---|
| NOAA SWPC `products/noaa-planetary-k-index-forecast.json` | 3-day Kp forecast | Browser |
| NOAA SWPC `json/planetary_k_index_1m.json` | Current Kp estimate | Browser |
| NOAA SWPC `json/ovation_aurora_latest.json` | 30-minute aurora model (only fetched when dark and Kp 4+; about 150 KB) | Browser |
| NOAA SWPC `json/45-day-forecast.json` | Daily A index outlook for the planner | Browser |
| Open-Meteo forecast API | Hourly cloud cover, 4 days | Browser |
| GFZ Potsdam Kp since 1932 (CC BY 4.0) | History | `collector/history.py` |
| ERA5 cloud cover since 1940 via Open-Meteo archive (CC BY 4.0) | History | `collector/history.py` |

All browser sources allow cross-site requests. Nothing about the person viewing the page is sent anywhere except the request itself.

## Files

| Path | Purpose |
|---|---|
| `docs/aurora.js` | The widget (single file, no dependencies) |
| `docs/index.html` | Preview page with embed snippets |
| `docs/data/history.json` | Summary read by the widget |
| `data/nights.csv` | One line per night since 1932: highest dark-hours Kp, and highest Kp under a mostly clear sky |
| `collector/history.py` | Builds both from the sources above (standard library only) |
| `.github/workflows/history.yml` | Weekly refresh (Mondays) |

## How a night is counted

A night runs noon to noon, Mountain Standard Time, and is named for its evening. A 3-hour Kp interval counts when the sun is at least 12 degrees below the horizon at any point in it. "Mostly clear" means that interval's average cloud cover was under 50%. ERA5 cloud cover is a grid-cell average about 15 miles across, so it describes the area, not a single spot.

## Upkeep

- `SOLAR_MAX_YEARS` in `collector/history.py` lists solar maximum years. Add the next one when it is declared (expected in the mid-2030s).
- `python collector/history.py` rebuilds everything (about a minute, 10 archive requests). `--recent` refreshes the last 120 days and is what the workflow runs. Run the full rebuild from the Actions tab ("Run workflow", tick "full") if anything looks off.

## Run locally

```bash
python collector/history.py --recent
cd docs && python -m http.server 8000      # preview at http://localhost:8000
```

## GitHub Pages setup

1. Settings → Pages → Deploy from a branch → `main`, folder `/docs`.
2. Custom domain `aurora.labs.trlibrary.com` (already in `docs/CNAME`; the wildcard DNS record covers it). Tick "Enforce HTTPS" once the certificate is issued.
3. Settings → Actions → General → Workflow permissions → Read and write.
