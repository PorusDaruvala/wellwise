#!/usr/bin/env python3
"""Build Wellwise from its content file and any tip packs.

Usage (from the repository root):
  python3 scripts/build.py                 # check content/packs/ and build dist/
  python3 scripts/build.py --merge         # also fold valid packs into content/wellwise-content.json
  python3 scripts/build.py --check FILE    # only check one pack, build nothing

The app (src/template.html) never changes when you add tips. Only content changes.
The server (server/) serves dist/ and adds live data, integrations and the admin console.
Exit code is 1 if any pack has errors, so CI can block a bad pull request.
"""
import json, re, sys, glob, os, datetime, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, 'content', 'wellwise-content.json')
TEMPLATE = os.path.join(ROOT, 'src', 'template.html')
DIST = os.path.join(ROOT, 'dist')
OUTPUT = os.path.join(DIST, 'index.html')
PACK_DIR = os.path.join(ROOT, 'content', 'packs')
ENGINE = os.path.join(ROOT, 'src', 'engine.js')
STATIC = ['admin.html', 'manifest.webmanifest', 'sw.js', 'icon.svg']
# Open-source barcode reader (ZXing, Apache-2.0) for browsers without a built-in one, such as Safari on iPhone.
ZXING = os.path.join(ROOT, 'node_modules', '@zxing', 'library')

FAMILIARITY = {'common', 'lesser-known'}
GRADES = {'Strong', 'Moderate', 'Limited', 'Safety practice'}
EDGE_TYPES = {'complements', 'reinforces', 'shared-goal', 'depends-on', 'potential-conflict'}
STATUS = {'draft', 'live', 'retired'}
REQUIRED = ['title', 'category', 'action', 'why', 'caution', 'sources']
ID_RE = re.compile(r'^ww-\d{3,}$')


def next_id(used):
    n = max(int(i[3:]) for i in used) + 1 if used else 1
    return 'ww-%03d' % n


def normalize_tip(raw, content, used_ids, today):
    """Fill defaults so a tip author writes only what matters."""
    cats = {c['name']: c for c in content['CATEGORIES']}
    regions = content['REGIONS']
    t = dict(raw)
    cat = cats.get(t.get('category'))
    if not t.get('id'):
        t['id'] = next_id(used_ids)
    t.setdefault('scope', 'GLOBAL')
    t.setdefault('regions', list(regions) if t['scope'] == 'GLOBAL' else [t['scope']])
    t.setdefault('familiarity', 'lesser-known')
    t.setdefault('status', 'live')
    t.setdefault('added', today)
    t.setdefault('triggerKeys', [])
    t.setdefault('notes', {})
    t.setdefault('review', {'status': 'not-reviewed', 'by': None, 'date': None})
    t.setdefault('sourceLevel', 'tip')
    t.setdefault('sourceChecked', today)
    if cat:
        t.setdefault('grade', cat['defaultGrade'])
        t.setdefault('timeline', cat['defaultTimeline'])
        extra = [x for x in t.get('tags', []) if x != cat['tag']]
        t['tags'] = [cat['tag']] + extra
        t['concepts'] = [cat['concept']] + extra
    return t


def validate(tips, edges, content, existing_ids):
    """Return (errors, warnings). Errors block the build."""
    errors, warnings = [], []
    cats = {c['name'] for c in content['CATEGORIES']}
    regions = set(content['REGIONS'])
    events = {m['event'] for m in content['MOMENTS']} | {p['event'] for p in content['PRODUCTS']}
    seen = set(existing_ids)
    titles = {}
    for t in content['TIPS']:
        titles[t['title'].lower()] = t['id']
    for t in tips:
        tid = t.get('id', '(no id)')
        for f in REQUIRED:
            if not t.get(f):
                errors.append(f'{tid}: missing "{f}"')
        if not ID_RE.match(tid):
            errors.append(f'{tid}: id must look like ww-201')
        if tid in seen:
            errors.append(f'{tid}: id already used')
        seen.add(tid)
        if t.get('category') not in cats:
            errors.append(f'{tid}: unknown category "{t.get("category")}". Add it to CATEGORIES first.')
        if 'safety' in t:
            errors.append(f'{tid}: safety classes are gone. Remove "safety" (see D-010).')
        if t.get('familiarity') not in FAMILIARITY:
            errors.append(f'{tid}: familiarity must be one of {sorted(FAMILIARITY)}')
        if t.get('grade') not in GRADES:
            errors.append(f'{tid}: grade must be one of {sorted(GRADES)}')
        if t.get('status') not in STATUS:
            errors.append(f'{tid}: status must be one of {sorted(STATUS)}')
        if t.get('scope') != 'GLOBAL' and t.get('scope') not in regions:
            errors.append(f'{tid}: scope must be GLOBAL or one of {sorted(regions)}')
        for r in t.get('regions', []):
            if r not in regions:
                errors.append(f'{tid}: unknown region "{r}"')
        for s in t.get('sources', []):
            if not str(s).startswith('https://'):
                errors.append(f'{tid}: source must start with https:// ({s})')
        key = (t.get('title') or '').lower()
        if key in titles and titles[key] != tid:
            warnings.append(f'{tid}: same title as {titles[key]}')
        titles[key] = tid
        if len(t.get('title', '')) > 70:
            warnings.append(f'{tid}: title is long ({len(t["title"])} characters)')
        unknown = [k for k in t.get('triggerKeys', []) if k not in events]
        if unknown:
            warnings.append(f'{tid}: no moment uses {unknown} yet, so these keys do nothing')
        if t.get('status') == 'live' and not any(k in events for k in t.get('triggerKeys', [])):
            warnings.append(f'{tid}: no moment can bring this tip. It shows in the library and daily tip only.')
        if 'hi' not in t:
            warnings.append(f'{tid}: no Hindi text yet (shows in English)')
    all_ids = seen
    for e in edges:
        for side in ('a', 'b'):
            if e.get(side) not in all_ids:
                errors.append(f'link {e.get("a")}–{e.get("b")}: unknown tip "{e.get(side)}"')
        if e.get('type') not in EDGE_TYPES:
            errors.append(f'link {e.get("a")}–{e.get("b")}: type must be one of {sorted(EDGE_TYPES)}')
        if not e.get('why'):
            errors.append(f'link {e.get("a")}–{e.get("b")}: missing "why"')
    return errors, warnings


def load_pack(path, content, today):
    pack = json.load(open(path, encoding='utf-8'))
    used = [t['id'] for t in content['TIPS']]
    tips = []
    for raw in pack.get('tips', []):
        t = normalize_tip(raw, content, used, today)
        used.append(t['id'])
        tips.append(t)
    return pack, tips, pack.get('edges', [])


def build_html(content):
    js = 'const WW=' + json.dumps(content, ensure_ascii=False).replace('</', '<\\/') + ';'
    engine = open(ENGINE, encoding='utf-8').read().replace('</', '<\\/')
    html = open(TEMPLATE, encoding='utf-8').read().replace('/*__DATA__*/', js).replace('/*__ENGINE__*/', engine)
    os.makedirs(DIST, exist_ok=True)
    open(OUTPUT, 'w', encoding='utf-8').write(html)
    for name in STATIC:
        shutil.copyfile(os.path.join(ROOT, 'src', name), os.path.join(DIST, name))
    if os.path.exists(os.path.join(ZXING, 'umd', 'index.min.js')):
        os.makedirs(os.path.join(DIST, 'vendor'), exist_ok=True)
        shutil.copyfile(os.path.join(ZXING, 'umd', 'index.min.js'), os.path.join(DIST, 'vendor', 'zxing.min.js'))
        shutil.copyfile(os.path.join(ZXING, 'LICENSE'), os.path.join(DIST, 'vendor', 'zxing-LICENSE.txt'))
    else:
        print('! Barcode reader not found. Run npm install before the build, or barcode photos will not work on iPhone.')
    # Published next to the app so a live site can pick up new tips without a rebuild.
    json.dump(content, open(os.path.join(DIST, 'wellwise-content.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    return len(html)


def main():
    args = sys.argv[1:]
    today = datetime.date.today().isoformat()
    content = json.load(open(CONTENT, encoding='utf-8'))
    ok = True
    # existing content must stay valid too
    errs, _ = validate(content['TIPS'], content['EDGES'], {**content, 'TIPS': []}, [])
    if errs:
        print('Content file has errors:'); [print('  ✗', e) for e in errs]; sys.exit(1)

    paths = [args[1]] if args[:1] == ['--check'] else sorted(glob.glob(os.path.join(PACK_DIR, '*.json')))
    merged = dict(content)
    for path in paths:
        pack, tips, edges = load_pack(path, merged, today)
        errs, warns = validate(tips, edges, merged, [t['id'] for t in merged['TIPS']])
        print(f'\n{os.path.relpath(path, ROOT)}: {len(tips)} tip(s), {len(edges)} link(s)')
        for e in errs: print('  ✗', e)
        for w in warns: print('  !', w)
        if errs:
            ok = False
            print('  → not added. Fix the errors above.')
            continue
        print('  ✓ ready')
        merged = {**merged, 'TIPS': merged['TIPS'] + tips, 'EDGES': merged['EDGES'] + edges}

    if args[:1] == ['--check']:
        sys.exit(0 if ok else 1)
    merged['contentVersion'] = int(datetime.datetime.now().strftime('%Y%m%d%H%M'))
    size = build_html(merged)
    live = sum(t.get('status') == 'live' for t in merged['TIPS'])
    events = {m['event'] for m in merged['MOMENTS']} | {p['event'] for p in merged['PRODUCTS']}
    reach = sum(t.get('status') == 'live' and any(k in events for k in t['triggerKeys']) for t in merged['TIPS'])
    print(f'\nBuilt {os.path.relpath(OUTPUT, ROOT)}: {live} live tips ({reach} reachable from a moment), {len(merged["EDGES"])} links, {size // 1024} KB')
    if '--merge' in args:
        json.dump(merged, open(CONTENT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'Merged packs into {os.path.relpath(CONTENT, ROOT)}. Now delete the merged pack files from content/packs/.')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
