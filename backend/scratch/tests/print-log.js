const fs = require('fs');
const content = fs.readFileSync('test-result.log', 'utf8');
console.log(content);
