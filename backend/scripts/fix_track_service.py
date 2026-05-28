content = open('backend/src/services/track.service.ts', 'r', encoding='utf-8').read()

# Replace escaped backticks with real backticks
fixed = content.replace('\\`', '`')

open('backend/src/services/track.service.ts', 'w', encoding='utf-8').write(fixed)

# Verify
remaining = fixed.count('\\`')
print("Done. Remaining escaped backticks:", remaining)
