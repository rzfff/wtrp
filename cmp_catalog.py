import json
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')

old_txt = subprocess.run(['git', 'show', 'HEAD:data/catalog.json'], capture_output=True, cwd=r'E:\ah\wtrp').stdout.decode('utf-8')
new_txt = open(r'E:\ah\wtrp\data\catalog.json', encoding='utf-8').read()

a = json.loads(old_txt)
b = json.loads(new_txt)

print('source:', a.get('source', {}).get('version'), '->', b.get('source', {}).get('version'))

# nodes compared by identifier (id is positional; insertions shift it)
na = {n['identifier']: n for n in a['nodes']}
nb = {n['identifier']: n for n in b['nodes']}
print('nodes:', len(na), '->', len(nb))
added = sorted(set(nb) - set(na))
removed = sorted(set(na) - set(nb))
print('added nodes:', added)
print('removed nodes:', removed)

diff_count = 0
for ident in sorted(set(na) & set(nb)):
    fa, fb = na[ident], nb[ident]
    fields = [k for k in fa if k not in ('id',) and fa[k] != fb.get(k)]
    if fields:
        diff_count += 1
        if diff_count <= 10:
            print('changed', ident, {k: (fa[k], fb.get(k)) for k in fields})
print('changed existing nodes:', diff_count)

def edge_key(e):
    return (e.get('from'), e.get('to'), e.get('type'))
ea = {edge_key(e) for e in a.get('edges', [])}
eb = {edge_key(e) for e in b.get('edges', [])}
print('edges:', len(ea), '->', len(eb), 'added:', len(eb - ea), 'removed:', len(ea - eb))
for x in sorted(eb - ea)[:6]:
    print(' edge+', x)
for x in sorted(ea - eb)[:6]:
    print(' edge-', x)

ta = {(t['nation'], t['class']): t for t in a.get('trees', [])}
tb = {(t['nation'], t['class']): t for t in b.get('trees', [])}
tree_diffs = []
for k in sorted(set(ta) & set(tb)):
    if ta[k] != tb[k]:
        for f in ta[k]:
            if f != 'updated_at' and ta[k][f] != tb[k].get(f):
                tree_diffs.append((k, f, ta[k][f], tb[k].get(f)))
print('tree meta diffs (excl updated_at):', len(tree_diffs))
for d in tree_diffs[:8]:
    print(' tree', d[0], d[1], ':', d[2], '->', d[3])
print('DONE')
