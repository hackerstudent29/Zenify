import os
import re

TARGET_DIR = r"d:\.gemini\Zenify\frontend\src"

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to match hover scaling or translating that causes a popup
    # Matches: hover:scale-105, hover:scale-110, group-hover:scale-105, group-hover:scale-110, group-hover:scale-100 (from 90)
    # Also hover:-translate-y-1, group-hover:-translate-y-1
    
    # We will NOT remove active:scale- as that is for click feedback.
    
    # Let's target specific annoying popups
    patterns = [
        r'\bhover:scale-\d+\b',
        r'\bgroup-hover:scale-\d+\b',
        r'\bhover:-translate-y-\d+\b',
        r'\bgroup-hover:-translate-y-\d+\b'
    ]
    
    new_content = content
    for p in patterns:
        new_content = re.sub(p, '', new_content)
        
    # Clean up multiple spaces that might have been created
    new_content = re.sub(r'  +', ' ', new_content)
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated: {filepath}")

def main():
    for root, _, files in os.walk(TARGET_DIR):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                process_file(os.path.join(root, file))

if __name__ == "__main__":
    main()
