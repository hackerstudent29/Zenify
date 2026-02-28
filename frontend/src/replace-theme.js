const fs = require('fs');
const path = require('path');

const srcDir = 'd:\\.gemini\\Zenify\\frontend\\src';

function replaceInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;

    // Direct string replacements for Tailwind classes
    content = content.replace(/\btext-rose-(400|500|600)\b/g, 'text-brand');
    content = content.replace(/\bbg-rose-(400|500|600)\b/g, 'bg-brand');
    content = content.replace(/\bborder-rose-(400|500|600)\b/g, 'border-brand');
    content = content.replace(/\bring-rose-(400|500|600)\b/g, 'ring-brand');
    content = content.replace(/\bshadow-rose-(400|500|600)\b/g, 'shadow-brand');
    content = content.replace(/\bfrom-rose-(400|500|600)\b/g, 'from-brand');
    content = content.replace(/\bto-rose-(400|500|600)\b/g, 'to-brand');
    content = content.replace(/\bvia-rose-(400|500|600)\b/g, 'via-brand');

    // Also replace the rgb values explicitly
    content = content.replace(/244,\s*63,\s*94/g, 'var(--accent-brand-rgb)');
    // Hex colors
    content = content.replace(/var(--accent-brand)/gi, 'var(--accent-brand)');

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`Updated: ${filePath}`);
    }
}

function walkDir(dir) {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            walkDir(filePath);
        } else {
            if (filePath.endsWith('.tsx') || filePath.endsWith('.tsx') || filePath.endsWith('.jsx') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
                replaceInFile(filePath);
            }
        }
    });
}

walkDir(srcDir);
console.log('Done.');
