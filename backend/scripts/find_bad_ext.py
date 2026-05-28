content = open('backend/src/services/external-metadata.service.ts', 'r', encoding='utf-8').read()
lines = content.split('\n')
bad = []
for i, l in enumerate(lines):
    if '\\`' in l or '\\\\.com' in l or '\\\\?' in l or '\\\\n' in l:
        bad.append((i+1, l[:150]))
print("Total bad lines:", len(bad))
for ln, l in bad:
    print("Line", ln, ":", l)
