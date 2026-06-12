import os
import re

directory = 'd:\\.gemini\\Zenify\\frontend\\src'

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # We want to find classes that have both `bg-brand` and `text-white` (in any order).
    # And we want to replace `bg-brand` with `bg-zinc-900` or `bg-black/80` or `bg-white/10`.
    # And `text-white` with `text-brand`.
    # Let's use `bg-zinc-900 text-brand` for primary buttons.
    
    # We can do this with a function that replaces within `className="..."` or `className={`...`}`
    def replace_class(match):
        cls = match.group(0)
        if 'bg-brand' in cls and 'text-white' in cls:
            # Check if there are hover variants too
            cls = cls.replace('bg-brand', 'bg-zinc-900')
            cls = cls.replace('hover:bg-brand', 'hover:bg-black')
            cls = cls.replace('text-white', 'text-brand')
            cls = cls.replace('text-white/60', 'text-brand/60') # Just in case
            cls = cls.replace('text-white/50', 'text-brand/50')
            return cls
        return cls

    # Match anything inside className="..." or className={`...`}
    # This regex is a bit simplistic but works for most cases
    new_content = re.sub(r'className=(["\']|{`)(.*?)(["\']|`})', replace_class, content, flags=re.DOTALL)
    
    # Also handle cn(...)
    new_content = re.sub(r'cn\((.*?)\)', replace_class, new_content, flags=re.DOTALL)

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith(('.tsx', '.ts')):
            process_file(os.path.join(root, file))

print("Done")
