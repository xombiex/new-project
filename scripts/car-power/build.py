"""Builds public/specs/<make>.json from the EPA's Test Car List (public domain): rated horsepower and
test weight for every vehicle tested, by model year and engine.

    python scripts/car-power/build.py          # downloads to .cache/ next to this file, then writes

Covers 2009 on: the files before that have no make column, so older cars use car-performance.ts.

Run it once a year when the EPA adds a model year. Standard library only. Page with the files:
https://www.epa.gov/compliance-and-fuel-economy-data/data-cars-used-testing-fuel-economy
"""
import csv, io, json, os, re, shutil, statistics, sys, time, urllib.request, zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
OUT = os.path.join(HERE, '..', '..', 'public', 'specs')
PAGE = 'https://www.epa.gov/compliance-and-fuel-economy-data/data-cars-used-testing-fuel-economy'
UA = {'User-Agent': 'Mozilla/5.0 (Convoy car data build)'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def read_xlsx(data):
    """First sheet of an .xlsx as rows of strings, without third-party libraries."""
    z = zipfile.ZipFile(io.BytesIO(data))
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % ns['m'])))
    sheet = sorted(n for n in z.namelist() if n.startswith('xl/worksheets/sheet'))[0]
    rows = []
    for row in ET.fromstring(z.read(sheet)).find('m:sheetData', ns):
        cells = {}
        for c in row:
            col = re.match(r'[A-Z]+', c.get('r')).group()
            idx = 0
            for ch in col:
                idx = idx * 26 + ord(ch) - 64
            v = c.find('m:v', ns)
            if v is None:
                inline = c.find('m:is', ns)
                cells[idx] = ''.join(t.text or '' for t in inline.iter('{%s}t' % ns['m'])) if inline is not None else ''
            else:
                cells[idx] = shared[int(v.text)] if c.get('t') == 's' else v.text
        rows.append([cells.get(i, '') for i in range(1, max(cells or [0]) + 1)])
    return rows


def rows_of(name, data):
    if name.endswith('.xlsx'):
        return read_xlsx(data)
    return list(csv.reader(io.StringIO(data.decode('latin-1'))))


def col(header, *needles):
    for i, h in enumerate(header):
        low = h.lower()
        if all(n in low for n in needles):
            return i
    return None


def main():
    os.makedirs(CACHE, exist_ok=True)
    html = get(PAGE).decode('utf-8', 'replace')
    links = sorted(set(re.findall(r'href="(https://www\.epa\.gov/[^"]+?(\d\d)-?(?:testcar|tstcar)[^"]*?\.(?:xlsx|csv))"', html)))
    by_make = {}
    total = 0
    for url, yy in links:
        year = 2000 + int(yy) if int(yy) < 60 else 1900 + int(yy)
        name = url.rsplit('/', 1)[1]
        path = os.path.join(CACHE, name)
        if not os.path.exists(path):
            open(path, 'wb').write(get(url))
            time.sleep(0.5)
        rows = rows_of(name, open(path, 'rb').read())
        start = next((i for i, r in enumerate(rows[:6]) if any('Horsepower' in str(c) for c in r)), None)
        if start is None:
            print('no header', name)
            continue
        h = [str(c) for c in rows[start]]
        make_c, model_c = col(h, 'represented', 'make'), col(h, 'represented', 'model')
        displ_c, hp_c, cyl_c, w_c = col(h, 'displacement'), col(h, 'rated horsepower'), col(h, 'cylinders'), col(h, 'equivalent test weight')
        drive_c = col(h, 'drive system description')
        if None in (make_c, model_c, hp_c):
            print('missing columns', name, h[:12])
            continue
        seen = {}
        for r in rows[start + 1:]:
            try:
                make = str(r[make_c]).strip().lower()
                model = re.sub(r'\s+', ' ', str(r[model_c]).strip())
                # A few rows have the model year in the make column and the make in the model.
                if make.isdigit() and ' ' in model:
                    make, model = model.split(' ', 1)
                    make = make.lower()
                hp = float(r[hp_c])
                if not make or not model or not 30 <= hp <= 2500:
                    continue
                displ = round(float(r[displ_c]), 1) if displ_c is not None and r[displ_c] else None
                cyl = int(float(r[cyl_c])) if cyl_c is not None and r[cyl_c] else None
                w = int(float(r[w_c])) if w_c is not None and r[w_c] else None
                awd = 1 if drive_c is not None and re.search('all|4-wheel|four', str(r[drive_c]), re.I) else 0
            except (ValueError, IndexError):
                continue
            seen.setdefault((make, model, displ, cyl), []).append((hp, w, awd))
        for (make, model, displ, cyl), v in seen.items():
            hp = round(statistics.median(x[0] for x in v))
            ws = [x[1] for x in v if x[1]]
            by_make.setdefault(make, []).append([year, model, displ, cyl, hp, round(statistics.median(ws)) if ws else None, max(x[2] for x in v)])
            total += 1
        print(year, name, len(seen), flush=True)
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    for make, rows in by_make.items():
        slug = re.sub(r'[^a-z0-9]+', '-', make).strip('-')
        rows.sort(key=lambda r: (r[0], r[1]))
        with open(os.path.join(OUT, slug + '.json'), 'w', encoding='utf-8', newline='\n') as f:
            json.dump(rows, f, separators=(',', ':'))
    print('makes', len(by_make), 'rows', total)


if __name__ == '__main__':
    sys.exit(main())
