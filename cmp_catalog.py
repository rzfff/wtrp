import json, subprocess, sys

old_txt = subprocess.run(['git','show','HEAD:data/catalog.json'], capture_output=True, cwd=r'E:\ah\wtrp').stdout.decode('utf-8')
new_txt = open(r'E:\ah\wtrp\data\catalog.json', encoding='utf-8').read()

a = json.loads(old_txt)
b = json.loads(new_txt)

print('top-level keys equal:', sorted(a.keys()) == sorted(b.keys()))
print('source:', a.get('source'), '->', b.get('source'))
for k in a:
    if k in ('nodes', 'edges', 'trees'):
        continue
    if a[k] != b[k]:
        print('DIFF in', k, ':', repr(a[k])[:200], '->', repr(b[k])[:200])

na = {n['id']: n for n in a['nodes']}
nb = {n['id']: n for n in b['nodes']}
print('nodes count:', len(na), len(nb))
print('node id sets equal:', set(na) == set(nb))
diff_nodes = 0
for i in sorted(set(na) & set(nb)):
    if na[i] != nb[i]:
        diff_nodes += 1
        if diff_nodes <= 5:
            fa, fb = na[i], nb[i]
            fields = [k for k in fa if fa[k] != fb.get(k)]
            print('node', i, na[i].get('identifier'), 'fields:', {k: (fa[k], fb.get(k)) for k in fields})
print('diff nodes total:', diff_nodes)

ea = {json.dumps(e, sort_keys=True, ensure_ascii=False) for e in a.get('edges', [])}
eb = {json.dumps(e, sort_keys=True, ensure_ascii=False) for e in b.get('edges', [])}
print('edges:', len(ea), len(eb), 'only-old:', len(ea - eb), 'only-new:', len(eb - ea))
for x in list(ea - eb)[:3]: print(' only-old:', x[:150])
for x in list(eb - ea)[:3]: print(' only-new:', x[:150])

ta = {json.dumps(t, sort_keys=True, ensure_ascii=False) for t in a.get('trees', [])}
tb = {json.dumps(t, sort_keys=True, ensure_ascii=False) for t in b.get('trees', [])}
print('trees:', len(ta), len(tb), 'equal:', ta == tb)
print('DONE')
