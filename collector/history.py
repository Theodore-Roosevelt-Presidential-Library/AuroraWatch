#!/usr/bin/env python3
"""Builds the Medora aurora history used by the widget.

Sources
  Kp index since 1932     GFZ Potsdam (https://kp.gfz-potsdam.de), CC BY 4.0
  Cloud cover since 1940  ERA5 reanalysis via the Open-Meteo archive API, CC BY 4.0

Method
  A "night" runs from noon to noon, Mountain Standard Time (UTC-7), and is named
  for the evening it starts on. Each 3-hour Kp interval counts toward a night when
  the sun is at least 12 degrees below the horizon (nautical darkness) at any point
  in it, checked every 15 minutes. For each night the script keeps:
    kp        the highest Kp of any dark interval
    kp_clear  the highest Kp of any dark interval whose average cloud cover was
              under CLEAR_PCT (blank before 1940, when there is no cloud record)
  Writes data/nights.csv (one line per night) and docs/data/history.json.

Usage
  python collector/history.py            full rebuild (about 10 archive requests)
  python collector/history.py --recent   re-fetch only the last 120 days and merge
"""
import argparse
import csv
import datetime as dt
import json
import math
import os
import sys
import time
import urllib.request

LAT, LON = 46.9139, -103.5244          # Medora, North Dakota
NIGHT_OFFSET = -7                      # MST; nights are grouped noon to noon
DARK_SUN_ALT = -12.0                   # nautical darkness
CLEAR_PCT = 50                         # "mostly clear" cloud cover ceiling
THRESHOLDS = (5, 6, 7)                 # Kp levels reported
SEASON_WINDOW = 10                     # days either side of a date for the seasonal odds
# Years of solar maximum (SILSO smoothed sunspot number), cycles 17 to 25. Add the next one when known.
SOLAR_MAX_YEARS = [1937, 1947, 1958, 1968, 1979, 1989, 2000, 2014, 2024]
KP_START = 1932
CLOUD_START = 1940

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NIGHTS_CSV = os.path.join(ROOT, 'data', 'nights.csv')
HISTORY_JSON = os.path.join(ROOT, 'docs', 'data', 'history.json')

KP_URL = 'https://kp.gfz-potsdam.de/app/files/Kp_ap_Ap_SN_F107_since_1932.txt'
ARCHIVE_URL = ('https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}'
               '&start_date={start}&end_date={end}&hourly=cloud_cover&timezone=GMT')
UA = 'TRPL-AuroraWatch/1.0 (+https://aurora.labs.trlibrary.com)'


def fetch(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read().decode('utf-8')
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            print('  retry after error:', e, file=sys.stderr)
            time.sleep(10 * (i + 1))


# ---------- sun position (NOAA low-precision formula, good to ~0.1 degree) ----------

def sun_altitude(t):
    """Sun altitude in degrees at Medora for a UTC datetime."""
    n = (t - dt.datetime(2000, 1, 1, 12)).total_seconds() / 86400.0
    L = (280.460 + 0.9856474 * n) % 360
    g = math.radians((357.528 + 0.9856003 * n) % 360)
    lam = math.radians(L + 1.915 * math.sin(g) + 0.020 * math.sin(2 * g))
    eps = math.radians(23.439 - 0.0000004 * n)
    ra = math.atan2(math.cos(eps) * math.sin(lam), math.cos(lam))
    dec = math.asin(math.sin(eps) * math.sin(lam))
    gmst = (18.697374558 + 24.06570982441908 * n) % 24
    ha = math.radians(gmst * 15 + LON) - ra
    lat = math.radians(LAT)
    return math.degrees(math.asin(math.sin(lat) * math.sin(dec) +
                                  math.cos(lat) * math.cos(dec) * math.cos(ha)))


def interval_is_dark(start):
    return any(sun_altitude(start + dt.timedelta(minutes=m)) < DARK_SUN_ALT
               for m in range(0, 181, 15))


def night_of(t):
    """The evening date a UTC time belongs to (noon-to-noon, MST)."""
    return (t + dt.timedelta(hours=NIGHT_OFFSET - 12)).date()


# ---------- sources ----------

def load_kp():
    """Returns {interval_start_utc: kp} and {date: sunspot number}."""
    text = fetch(KP_URL)
    kp, sn = {}, {}
    for line in text.splitlines():
        if not line or line.startswith('#'):
            continue
        p = line.split()
        day = dt.date(int(p[0]), int(p[1]), int(p[2]))
        if int(p[24]) >= 0:
            sn[day] = int(p[24])
        for i in range(8):
            v = float(p[7 + i])
            if v >= 0:
                kp[dt.datetime(day.year, day.month, day.day, 3 * i)] = v
    return kp, sn


def load_clouds(start, end):
    """Returns {hour_utc: cloud_cover_pct} between two dates, fetched in decade chunks."""
    clouds = {}
    a = start
    while a <= end:
        b = min(dt.date(a.year + 9, 12, 31), end)
        print(f'  clouds {a} to {b}', file=sys.stderr)
        data = json.loads(fetch(ARCHIVE_URL.format(lat=LAT, lon=LON, start=a, end=b)))
        for t, c in zip(data['hourly']['time'], data['hourly']['cloud_cover']):
            if c is not None:
                clouds[dt.datetime.fromisoformat(t)] = c
        a = b + dt.timedelta(days=1)
        time.sleep(2)
    return clouds


# ---------- nights ----------

def build_nights(kp, clouds, cloud_from):
    nights = {}
    for start, v in sorted(kp.items()):
        if not interval_is_dark(start):
            continue
        d = night_of(start + dt.timedelta(minutes=90))
        rec = nights.setdefault(d, {'kp': 0.0, 'kp_clear': None})
        rec['kp'] = max(rec['kp'], v)
        if start.date() >= cloud_from:
            hours = [clouds.get(start + dt.timedelta(hours=h)) for h in range(3)]
            hours = [c for c in hours if c is not None]
            if hours:
                if rec['kp_clear'] is None:
                    rec['kp_clear'] = 0.0
                if sum(hours) / len(hours) < CLEAR_PCT:
                    rec['kp_clear'] = max(rec['kp_clear'], v)
    return nights


def read_csv():
    out = {}
    if not os.path.exists(NIGHTS_CSV):
        return out
    with open(NIGHTS_CSV) as f:
        for row in csv.DictReader(f):
            out[dt.date.fromisoformat(row['night'])] = {
                'kp': float(row['kp']),
                'kp_clear': float(row['kp_clear']) if row['kp_clear'] != '' else None,
            }
    return out


def write_csv(nights):
    os.makedirs(os.path.dirname(NIGHTS_CSV), exist_ok=True)
    with open(NIGHTS_CSV, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['night', 'kp', 'kp_clear'])
        for d in sorted(nights):
            r = nights[d]
            w.writerow([d.isoformat(), f"{r['kp']:.2f}",
                        '' if r['kp_clear'] is None else f"{r['kp_clear']:.2f}"])


# ---------- summary for the widget ----------

def summarize(nights, sn):
    today = dt.date.today()
    last_full = today.year - 1
    years = range(KP_START, last_full + 1)
    cloud_years = range(CLOUD_START, last_full + 1)

    def avg(pred, yrs, month=None):
        total = sum(1 for d, r in nights.items()
                    if d.year in yrs and (month is None or d.month == month) and pred(r))
        return round(total / len(yrs), 2)

    monthly = []
    for m in range(1, 13):
        row = {'month': m, 'nights': {}, 'clear': {}}
        for t in THRESHOLDS:
            row['nights'][str(t)] = avg(lambda r, t=t: r['kp'] >= t, years, m)
            row['clear'][str(t)] = avg(lambda r, t=t: (r['kp_clear'] or 0) >= t, cloud_years, m)
        monthly.append(row)

    yearly = []
    for y in range(KP_START, today.year + 1):
        ys = [r for d, r in nights.items() if d.year == y]
        sns = [v for d, v in sn.items() if d.year == y]
        yearly.append({
            'year': y,
            'partial': y == today.year,
            **{f'n{t}': sum(1 for r in ys if r['kp'] >= t) for t in THRESHOLDS},
            'sunspots': round(sum(sns) / len(sns)) if sns else None,
        })

    notable = sorted(((d, r) for d, r in nights.items()
                      if r['kp'] >= 6 and d >= today - dt.timedelta(days=3 * 365)),
                     key=lambda x: x[0], reverse=True)
    recent = [{'night': d.isoformat(), 'kp': r['kp'],
               'clear': r['kp_clear'] is not None and r['kp_clear'] >= 5}
              for d, r in notable[:12]]

    def last_at(t):
        ds = [d for d, r in nights.items() if r['kp'] >= t]
        return max(ds).isoformat() if ds else None

    biggest = sorted(nights.items(), key=lambda x: (-x[1]['kp'], x[0]))[:10]

    # Trip planning: for every day of the year, the share of nights within +/-SEASON_WINDOW days
    # (all cloud-record years) that had Kp 5+, 6+, 7+ after dark under a mostly clear sky.
    season = {str(t): [] for t in THRESHOLDS}
    clear_nights = [(d, r) for d, r in nights.items() if d.year in cloud_years and r['kp_clear'] is not None]
    by_doy = {}
    for d, r in clear_nights:
        by_doy.setdefault(min(d.timetuple().tm_yday, 365), []).append(r['kp_clear'])
    for doy in range(1, 366):
        vals = []
        for k in range(-SEASON_WINDOW, SEASON_WINDOW + 1):
            vals.extend(by_doy.get((doy - 1 + k) % 365 + 1, []))
        for t in THRESHOLDS:
            season[str(t)].append(round(sum(1 for v in vals if v >= t) / len(vals), 4) if vals else 0)

    # Solar cycle: nights at Kp 5+ in the years after each solar maximum, relative to the long-run
    # average, smoothed over neighbouring years. Used to scale the seasonal odds for coming years.
    mean_n5 = sum(y['n5'] for y in yearly if not y['partial']) / max(1, sum(1 for y in yearly if not y['partial']))
    full = {y['year']: y['n5'] for y in yearly if not y['partial']}
    raw = {}
    for k in range(0, 12):
        vals = [full[m + k] for m in SOLAR_MAX_YEARS if (m + k) in full and (m + k) < (SOLAR_MAX_YEARS + [9999])[SOLAR_MAX_YEARS.index(m) + 1]]
        raw[k] = sum(vals) / len(vals) / mean_n5 if vals else None
    phase = {}
    for k in range(0, 12):
        nb = [raw[j] for j in (k - 1, k, k + 1) if j in raw and raw[j] is not None]
        phase[str(k)] = round(sum(nb) / len(nb), 2) if nb else 1.0

    recent_sn = [v for d, v in sn.items() if d >= today - dt.timedelta(days=365)]
    all_sn = [v for v in sn.values()]

    return {
        'generated': dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        'place': {'name': 'Medora, North Dakota', 'lat': LAT, 'lon': LON},
        'method': {
            'night': 'noon to noon, Mountain Standard Time, named for the evening',
            'dark_sun_altitude': DARK_SUN_ALT,
            'clear_cloud_pct': CLEAR_PCT,
            'kp_years': [KP_START, last_full],
            'cloud_years': [CLOUD_START, last_full],
        },
        'per_year': {str(t): avg(lambda r, t=t: r['kp'] >= t, years) for t in THRESHOLDS},
        'per_year_clear': {str(t): avg(lambda r, t=t: (r['kp_clear'] or 0) >= t, cloud_years)
                           for t in THRESHOLDS},
        'monthly': monthly,
        'yearly': yearly,
        'recent': recent,
        'last': {str(t): last_at(t) for t in THRESHOLDS},
        'biggest': [{'night': d.isoformat(), 'kp': r['kp']} for d, r in biggest],
        'season': {'window_days': SEASON_WINDOW, 'years': [CLOUD_START, last_full], 'p': season},
        'cycle': {'max_years': SOLAR_MAX_YEARS, 'factor_by_years_after_max': phase},
        'sunspots': {
            'last_12_months': round(sum(recent_sn) / len(recent_sn)) if recent_sn else None,
            'long_run': round(sum(all_sn) / len(all_sn)) if all_sn else None,
        },
        'sources': [
            {'name': 'Kp index, GFZ German Research Centre for Geosciences', 'url': 'https://kp.gfz-potsdam.de/en/', 'license': 'CC BY 4.0'},
            {'name': 'ERA5 cloud cover via Open-Meteo', 'url': 'https://open-meteo.com/', 'license': 'CC BY 4.0'},
        ],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--recent', action='store_true', help='refresh only the last 120 days')
    args = ap.parse_args()

    today = dt.date.today()
    if args.recent and os.path.exists(NIGHTS_CSV):
        since = today - dt.timedelta(days=120)
        print('Kp since', since, file=sys.stderr)
        kp, sn = load_kp()
        start = dt.datetime(since.year, since.month, since.day) + dt.timedelta(days=1)
        kp_recent = {t: v for t, v in kp.items() if t >= start}
        clouds = load_clouds(since, today - dt.timedelta(days=1))
        fresh = build_nights(kp_recent, clouds, since)
        nights = read_csv()
        for d in [d for d in nights if d in fresh or d > since]:
            nights.pop(d, None)
        nights.update(fresh)
    else:
        print('Kp since 1932', file=sys.stderr)
        kp, sn = load_kp()
        clouds = load_clouds(dt.date(CLOUD_START, 1, 1), today - dt.timedelta(days=1))
        nights = build_nights(kp, clouds, dt.date(CLOUD_START, 1, 1))

    # The night in progress and the one before it are incomplete; drop them.
    for d in [d for d in nights if d >= today - dt.timedelta(days=1)]:
        del nights[d]

    write_csv(nights)
    os.makedirs(os.path.dirname(HISTORY_JSON), exist_ok=True)
    with open(HISTORY_JSON, 'w') as f:
        json.dump(summarize(nights, sn), f, separators=(',', ':'))
    print(f'{len(nights)} nights written', file=sys.stderr)


if __name__ == '__main__':
    main()
