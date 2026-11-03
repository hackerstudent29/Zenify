import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SUSPICIOUS_PATTERNS = [
  /AIza[0-9A-Za-z-_]{35}/g,                     // Google API Key
  /sk-[a-zA-Z0-9]{32,}/g,                       // OpenAI Secret Key
  /ghp_[a-zA-Z0-9]{36}/g,                       // GitHub Personal Access Token
  /github_pat_[a-zA-Z0-9_]{50,}/g,              // GitHub PAT (new format)
  /BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY/g,    // Private Key
  /postgres(ql)?:\/\/[^:]+:[^@]+@[^/]+/g,       // Hardcoded DB URI with password
  /amzn\.mws\.[0-9a-f]{8}-[0-9a-f]{4}/g,        // AWS MWS Auth Token
  /AKIA[0-9A-Z]{16}/g,                          // AWS Access Key ID
  /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, // Email address (flag if in frontend/src/app/about)
  /[0-9]{10}@[a-zA-Z]+/g,                       // UPI ID pattern
];

// Whitelist of expected non-secret items
const WHITELIST = [
  'hello@zenify.music',
  'test-verification-user',
  'dummy',
  'node_modules',
  '.git',
  'dist',
  'build'
];

function scanFiles() {
  console.log('===============================================================');
  console.log('   ZENIFY PRE-PUSH SECRET SCANNER                              ');
  console.log('===============================================================\n');

  // Get list of changed/untracked files
  const statusOutput = execSync('git status --porcelain', { encoding: 'utf-8' });
  const lines = statusOutput.split('\n').filter(Boolean);
  const filesToScan = lines.map(line => line.substring(3).trim());

  let issuesFound = 0;

  for (const file of filesToScan) {
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
    if (file.includes('node_modules') || file.includes('.png') || file.includes('.webp') || file.includes('.jpg') || file.includes('.ico')) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf-8');

    for (const pattern of SUSPICIOUS_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          const isWhitelisted = WHITELIST.some(w => match.includes(w) || file.includes(w));
          if (!isWhitelisted) {
            // Special check: email is only banned in creator/about page
            if (pattern.source.includes('@') && !file.includes('about')) {
              continue;
            }
            console.error(`🚨 POTENTIAL SECRET DETECTED in ${file}:`);
            console.error(`   Pattern: ${pattern.source}`);
            console.error(`   Match:   ${match.slice(0, 8)}...[TRUNCATED]\n`);
            issuesFound++;
          }
        }
      }
    }
  }

  if (issuesFound === 0) {
    console.log(`✅ SECRET SCAN CLEAN: Scanned ${filesToScan.length} files. Zero secrets, credentials, or PII detected.\n`);
    return true;
  } else {
    console.error(`❌ SECRET SCAN FAILED: Found ${issuesFound} potential security issues.`);
    process.exit(1);
  }
}

scanFiles();

