import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? 
            walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

let replacedCount = 0;

walkDir('./src', function(filePath) {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        let content = fs.readFileSync(filePath, 'utf-8');
        
        // Match import.meta.env.NEXT_PUBLIC_API_URL and replace it.
        // We only replace if it's not already wrapped in the VITE fallback.
        if (content.includes('import.meta.env.NEXT_PUBLIC_API_URL') && !content.includes('import.meta.env.VITE_API_URL')) {
            content = content.replace(/import\.meta\.env\.NEXT_PUBLIC_API_URL/g, '(import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL)');
            fs.writeFileSync(filePath, content, 'utf-8');
            replacedCount++;
            console.log(`[Fixed] ${filePath}`);
        }
    }
});

console.log(`Done! Fixed environment variables in ${replacedCount} files.`);
