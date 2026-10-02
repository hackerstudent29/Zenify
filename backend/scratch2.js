const https = require('https');

const data = JSON.stringify({
    url: 'https://www.youtube.com/watch?v=BmRX2g6-iQI',
    isAudioOnly: true
});

const options = {
    hostname: 'api.cobalt.tools',
    path: '/',
    method: 'POST',
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = https.request(options, (res) => {
    let responseData = '';
    res.on('data', (chunk) => responseData += chunk);
    res.on('end', () => console.log(responseData));
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();
