import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const linesData = [
  // 1. Instrumental Intro: 0.00s to 15.92s
  {
    type: 'instrumental',
    text: '♪ [Instrumental Intro] ♪',
    time: 0.00,
    endTime: 15.92,
    words: []
  },
  // Verse 1
  {
    text: 'கார் இருள் நீங்கும் நேரம் வருமோ',
    time: 15.92,
    endTime: 19.50,
    words: [
      { word: 'கார்', time: 15.92, endTime: 16.50 },
      { word: 'இருள்', time: 16.50, endTime: 17.20 },
      { word: 'நீங்கும்', time: 17.20, endTime: 18.00 },
      { word: 'நேரம்', time: 18.00, endTime: 18.70 },
      { word: 'வருமோ', time: 18.70, endTime: 19.50 }
    ]
  },
  {
    text: 'கடும் காட்டிலும் கரந்திலும் மனமோ',
    time: 20.07,
    endTime: 23.50,
    words: [
      { word: 'கடும்', time: 20.07, endTime: 20.70 },
      { word: 'காட்டிலும்', time: 20.70, endTime: 21.60 },
      { word: 'கரந்திலும்', time: 21.60, endTime: 22.50 },
      { word: 'மனமோ', time: 22.50, endTime: 23.50 }
    ]
  },
  {
    text: 'மெய் மறந்து சொல் மறந்து கிடக்குற இவன்',
    time: 23.94,
    endTime: 27.50,
    words: [
      { word: 'மெய்', time: 23.94, endTime: 24.50 },
      { word: 'மறந்து', time: 24.50, endTime: 25.20 },
      { word: 'சொல்', time: 25.20, endTime: 25.80 },
      { word: 'மறந்து', time: 25.80, endTime: 26.50 },
      { word: 'கிடக்குற', time: 26.50, endTime: 27.00 },
      { word: 'இவன்', time: 27.00, endTime: 27.50 }
    ]
  },
  {
    text: 'மெல்ல அழைச்சுக்கோ நீ நிழலா அழைச்சுக்கோ',
    time: 28.05,
    endTime: 30.80,
    words: [
      { word: 'மெல்ல', time: 28.05, endTime: 28.70 },
      { word: 'அழைச்சுக்கோ', time: 28.70, endTime: 29.40 },
      { word: 'நீ', time: 29.40, endTime: 29.80 },
      { word: 'நிழலா', time: 29.80, endTime: 30.30 },
      { word: 'அழைச்சுக்கோ', time: 30.30, endTime: 30.80 }
    ]
  },
  // Chorus 1
  {
    text: 'அன்னக்கிளியே நீ வரும் வழியே',
    time: 31.21,
    endTime: 34.80,
    words: [
      { word: 'அன்னக்கிளியே', time: 31.21, endTime: 32.70 },
      { word: 'நீ', time: 32.70, endTime: 33.20 },
      { word: 'வரும்', time: 33.20, endTime: 33.90 },
      { word: 'வழியே', time: 33.90, endTime: 34.80 }
    ]
  },
  {
    text: 'அல்லாடி போகுது மனமே',
    time: 35.20,
    endTime: 38.50,
    words: [
      { word: 'அல்லாடி', time: 35.20, endTime: 36.30 },
      { word: 'போகுது', time: 36.30, endTime: 37.30 },
      { word: 'மனமே', time: 37.30, endTime: 38.50 }
    ]
  },
  {
    text: 'அன்னக்கிளியே நீ வரும் வழியே',
    time: 38.90,
    endTime: 42.50,
    words: [
      { word: 'அன்னக்கிளியே', time: 38.90, endTime: 40.30 },
      { word: 'நீ', time: 40.30, endTime: 40.90 },
      { word: 'வரும்', time: 40.90, endTime: 41.60 },
      { word: 'வழியே', time: 41.60, endTime: 42.50 }
    ]
  },
  {
    text: 'தள்ளாடி வாழுற தனியே',
    time: 42.88,
    endTime: 46.50,
    words: [
      { word: 'தள்ளாடி', time: 42.88, endTime: 44.20 },
      { word: 'வாழுற', time: 44.20, endTime: 45.30 },
      { word: 'தனியே', time: 45.30, endTime: 46.50 }
    ]
  },
  {
    text: 'வெண்ணிலவு வாழ வெண்பனியும் மூட',
    time: 47.16,
    endTime: 50.80,
    words: [
      { word: 'வெண்ணிலவு', time: 47.16, endTime: 48.20 },
      { word: 'வாழ', time: 48.20, endTime: 49.00 },
      { word: 'வெண்பனியும்', time: 49.00, endTime: 50.00 },
      { word: 'மூட', time: 50.00, endTime: 50.80 }
    ]
  },
  {
    text: 'வெளிச்சத்தை காட்டுது ஒத்த நொடி பார்வை',
    time: 50.92,
    endTime: 54.20,
    words: [
      { word: 'வெளிச்சத்தை', time: 50.92, endTime: 52.00 },
      { word: 'காட்டுது', time: 52.00, endTime: 52.80 },
      { word: 'ஒத்த', time: 52.80, endTime: 53.30 },
      { word: 'நொடி', time: 53.30, endTime: 53.70 },
      { word: 'பார்வை', time: 53.70, endTime: 54.20 }
    ]
  },
  {
    text: 'எக்கச்சக்கமாக எண்ணங்களும் கூட',
    time: 54.44,
    endTime: 58.00,
    words: [
      { word: 'எக்கச்சக்கமாக', time: 54.44, endTime: 56.00 },
      { word: 'எண்ணங்களும்', time: 56.00, endTime: 57.20 },
      { word: 'கூட', time: 57.20, endTime: 58.00 }
    ]
  },
  {
    text: 'என்னை கொஞ்சம் மீறினான் உன்ன பத்தி பாட',
    time: 58.32,
    endTime: 61.10,
    words: [
      { word: 'என்னை', time: 58.32, endTime: 58.90 },
      { word: 'கொஞ்சம்', time: 58.90, endTime: 59.50 },
      { word: 'மீறினான்', time: 59.50, endTime: 60.10 },
      { word: 'உன்ன', time: 60.10, endTime: 60.50 },
      { word: 'பத்தி', time: 60.50, endTime: 60.80 },
      { word: 'பாட', time: 60.80, endTime: 61.10 }
    ]
  },
  {
    text: 'என் கண்ணெல்லாம் வாடுது',
    time: 61.16,
    endTime: 63.10,
    words: [
      { word: 'என்', time: 61.16, endTime: 61.60 },
      { word: 'கண்ணெல்லாம்', time: 61.60, endTime: 62.40 },
      { word: 'வாடுது', time: 62.40, endTime: 63.10 }
    ]
  },
  {
    text: 'உன்னையே தேடுது',
    time: 63.24,
    endTime: 65.00,
    words: [
      { word: 'உன்னையே', time: 63.24, endTime: 64.10 },
      { word: 'தேடுது', time: 64.10, endTime: 65.00 }
    ]
  },
  {
    text: 'கொஞ்சம் நஞ்சம் இல்லாம கொண்டாடி பாடுது',
    time: 65.06,
    endTime: 68.50,
    words: [
      { word: 'கொஞ்சம்', time: 65.06, endTime: 65.70 },
      { word: 'நஞ்சம்', time: 65.70, endTime: 66.40 },
      { word: 'இல்லாம', time: 66.40, endTime: 67.10 },
      { word: 'கொண்டாடி', time: 67.10, endTime: 67.80 },
      { word: 'பாடுது', time: 67.80, endTime: 68.50 }
    ]
  },
  {
    text: 'நீ என்னென்ன ஆகுது',
    time: 68.84,
    endTime: 70.60,
    words: [
      { word: 'நீ', time: 68.84, endTime: 69.30 },
      { word: 'என்னென்ன', time: 69.30, endTime: 70.00 },
      { word: 'ஆகுது', time: 70.00, endTime: 70.60 }
    ]
  },
  {
    text: 'என்ன பந்தாடுது',
    time: 70.80,
    endTime: 72.50,
    words: [
      { word: 'என்ன', time: 70.80, endTime: 71.50 },
      { word: 'பந்தாடுது', time: 71.50, endTime: 72.50 }
    ]
  },
  {
    text: 'உன்ன சேர என் நெஞ்சு திண்டாடி தேடுது',
    time: 72.64,
    endTime: 76.06,
    words: [
      { word: 'உன்ன', time: 72.64, endTime: 73.20 },
      { word: 'சேர', time: 73.20, endTime: 73.80 },
      { word: 'என்', time: 73.80, endTime: 74.20 },
      { word: 'நெஞ்சு', time: 74.20, endTime: 74.80 },
      { word: 'திண்டாடி', time: 74.80, endTime: 75.40 },
      { word: 'தேடுது', time: 75.40, endTime: 76.06 }
    ]
  },
  // 2. Instrumental Interlude: 76.06s to 108.12s
  {
    type: 'instrumental',
    text: '♪ [Instrumental Interlude - Flute Solo] ♪',
    time: 76.06,
    endTime: 108.12,
    words: []
  },
  // Verse 2
  {
    text: 'நினைவாய் இருக்குற உலகத்தை போல',
    time: 108.12,
    endTime: 111.50,
    words: [
      { word: 'நினைவாய்', time: 108.12, endTime: 109.10 },
      { word: 'இருக்குற', time: 109.10, endTime: 109.90 },
      { word: 'உலகத்தை', time: 109.90, endTime: 110.70 },
      { word: 'போல', time: 110.70, endTime: 111.50 }
    ]
  },
  {
    text: 'நிஜத்தை அழிக்கிற நடந்தீடுமா',
    time: 111.64,
    endTime: 115.00,
    words: [
      { word: 'நிஜத்தை', time: 111.64, endTime: 112.60 },
      { word: 'அழிக்கிற', time: 112.60, endTime: 113.60 },
      { word: 'நடந்தீடுமா', time: 113.60, endTime: 115.00 }
    ]
  },
  {
    text: 'கடலைக் கடக்குற பறவையப் போல',
    time: 115.72,
    endTime: 118.80,
    words: [
      { word: 'கடலைக்', time: 115.72, endTime: 116.60 },
      { word: 'கடக்குற', time: 116.60, endTime: 117.40 },
      { word: 'பறவையப்', time: 117.40, endTime: 118.10 },
      { word: 'போல', time: 118.10, endTime: 118.80 }
    ]
  },
  {
    text: 'உன்னைப் பிரிவது பொருந்திடுமா',
    time: 118.90,
    endTime: 122.50,
    words: [
      { word: 'உன்னைப்', time: 118.90, endTime: 119.80 },
      { word: 'பிரிவது', time: 119.80, endTime: 120.90 },
      { word: 'பொருந்திடுமா', time: 120.90, endTime: 122.50 }
    ]
  },
  {
    text: 'மௌனம் கண்டிட நெஞ்சுமே',
    time: 123.27,
    endTime: 126.20,
    words: [
      { word: 'மௌனம்', time: 123.27, endTime: 124.30 },
      { word: 'கண்டிட', time: 124.30, endTime: 125.20 },
      { word: 'நெஞ்சுமே', time: 125.20, endTime: 126.20 }
    ]
  },
  {
    text: 'உன்னைக் கண்ட நாள் மின்னலாய் மின்னுதே',
    time: 126.60,
    endTime: 130.60,
    words: [
      { word: 'உன்னைக்', time: 126.60, endTime: 127.40 },
      { word: 'கண்ட', time: 127.40, endTime: 128.10 },
      { word: 'நாள்', time: 128.10, endTime: 128.80 },
      { word: 'மின்னலாய்', time: 128.80, endTime: 129.70 },
      { word: 'மின்னுதே', time: 129.70, endTime: 130.60 }
    ]
  },
  {
    text: 'காரணம் என்னவோ அஞ்சுறேன்',
    time: 130.96,
    endTime: 133.90,
    words: [
      { word: 'காரணம்', time: 130.96, endTime: 132.00 },
      { word: 'என்னவோ', time: 132.00, endTime: 132.90 },
      { word: 'அஞ்சுறேன்', time: 132.90, endTime: 133.90 }
    ]
  },
  {
    text: 'என்ன காணல உன்னையே கெஞ்சுறேன்',
    time: 134.23,
    endTime: 137.30,
    words: [
      { word: 'என்ன', time: 134.23, endTime: 134.90 },
      { word: 'காணல', time: 134.90, endTime: 135.70 },
      { word: 'உன்னையே', time: 135.70, endTime: 136.50 },
      { word: 'கெஞ்சுறேன்', time: 136.50, endTime: 137.30 }
    ]
  },
  {
    text: 'நெஞ்சு தள்ளாடுது தடுமாறுது',
    time: 137.50,
    endTime: 140.80,
    words: [
      { word: 'நெஞ்சு', time: 137.50, endTime: 138.30 },
      { word: 'தள்ளாடுது', time: 138.30, endTime: 139.50 },
      { word: 'தடுமாறுது', time: 139.50, endTime: 140.80 }
    ]
  },
  {
    text: 'என்ன சொல்லவும் உன் முன்னே சேருது',
    time: 141.20,
    endTime: 144.80,
    words: [
      { word: 'என்ன', time: 141.20, endTime: 141.90 },
      { word: 'சொல்லவும்', time: 141.90, endTime: 142.90 },
      { word: 'உன்', time: 142.90, endTime: 143.40 },
      { word: 'முன்னே', time: 143.40, endTime: 144.10 },
      { word: 'சேருது', time: 144.10, endTime: 144.80 }
    ]
  },
  {
    text: 'இருண்ட காலமும் இடிஞ்ச வேலையும்',
    time: 145.06,
    endTime: 148.75,
    words: [
      { word: 'இருண்ட', time: 145.06, endTime: 146.00 },
      { word: 'காலமும்', time: 146.00, endTime: 146.80 },
      { word: 'இடிஞ்ச', time: 146.80, endTime: 147.70 },
      { word: 'வேலையும்', time: 147.70, endTime: 148.75 }
    ]
  },
  {
    text: 'எனக்கென்ன மறுபடி திரும்புமா',
    time: 148.88,
    endTime: 152.00,
    words: [
      { word: 'எனக்கென்ன', time: 148.88, endTime: 149.90 },
      { word: 'மறுபடி', time: 149.90, endTime: 150.90 },
      { word: 'திரும்புமா', time: 150.90, endTime: 152.00 }
    ]
  },
  // Climax Chorus 2
  {
    text: 'ஓரிடத்துல வெண்ணிலவு வாழ வெண்பனியும் மூட',
    time: 152.55,
    endTime: 157.44,
    words: [
      { word: 'ஓரிடத்துல', time: 152.55, endTime: 153.60 },
      { word: 'வெண்ணிலவு', time: 153.60, endTime: 154.70 },
      { word: 'வாழ', time: 154.70, endTime: 155.50 },
      { word: 'வெண்பனியும்', time: 155.50, endTime: 156.50 },
      { word: 'மூட', time: 156.50, endTime: 157.44 }
    ]
  },
  {
    text: 'வெளிச்சத்தை காட்டுது ஒத்த நொடி பார்வை',
    time: 157.64,
    endTime: 161.20,
    words: [
      { word: 'வெளிச்சத்தை', time: 157.64, endTime: 158.80 },
      { word: 'காட்டுது', time: 158.80, endTime: 159.60 },
      { word: 'ஒத்த', time: 159.60, endTime: 160.10 },
      { word: 'நொடி', time: 160.10, endTime: 160.60 },
      { word: 'பார்வை', time: 160.60, endTime: 161.20 }
    ]
  },
  {
    text: 'எக்கச்சக்கமாக எண்ணங்களும் கூட',
    time: 161.42,
    endTime: 164.80,
    words: [
      { word: 'எக்கச்சக்கமாக', time: 161.42, endTime: 162.80 },
      { word: 'எண்ணங்களும்', time: 162.80, endTime: 164.00 },
      { word: 'கூட', time: 164.00, endTime: 164.80 }
    ]
  },
  {
    text: 'என்னை மீறி உன்ன பத்தி பாட',
    time: 165.08,
    endTime: 167.80,
    words: [
      { word: 'என்னை', time: 165.08, endTime: 165.70 },
      { word: 'மீறி', time: 165.70, endTime: 166.40 },
      { word: 'உன்ன', time: 166.40, endTime: 166.90 },
      { word: 'பத்தி', time: 166.90, endTime: 167.30 },
      { word: 'பாட', time: 167.30, endTime: 167.80 }
    ]
  },
  {
    text: 'என் கண்ணெல்லாம் வாடுது',
    time: 167.90,
    endTime: 169.70,
    words: [
      { word: 'என்', time: 167.90, endTime: 168.40 },
      { word: 'கண்ணெல்லாம்', time: 168.40, endTime: 169.10 },
      { word: 'வாடுது', time: 169.10, endTime: 169.70 }
    ]
  },
  {
    text: 'உன்னையே தேடுது',
    time: 169.83,
    endTime: 171.60,
    words: [
      { word: 'உன்னையே', time: 169.83, endTime: 170.70 },
      { word: 'தேடுது', time: 170.70, endTime: 171.60 }
    ]
  },
  {
    text: 'கொஞ்சம் நஞ்சம் இல்லாம கொண்டாடி பாடுது',
    time: 171.70,
    endTime: 175.20,
    words: [
      { word: 'கொஞ்சம்', time: 171.70, endTime: 172.40 },
      { word: 'நஞ்சம்', time: 172.40, endTime: 173.10 },
      { word: 'இல்லாம', time: 173.10, endTime: 173.80 },
      { word: 'கொண்டாடி', time: 173.80, endTime: 174.50 },
      { word: 'பாடுது', time: 174.50, endTime: 175.20 }
    ]
  },
  {
    text: 'நீ என்னென்ன ஆகுது',
    time: 175.30,
    endTime: 177.30,
    words: [
      { word: 'நீ', time: 175.30, endTime: 175.80 },
      { word: 'என்னென்ன', time: 175.80, endTime: 176.60 },
      { word: 'ஆகுது', time: 176.60, endTime: 177.30 }
    ]
  },
  {
    text: 'என்ன பந்தாடுது',
    time: 177.40,
    endTime: 179.20,
    words: [
      { word: 'என்ன', time: 177.40, endTime: 178.10 },
      { word: 'பந்தாடுது', time: 178.10, endTime: 179.20 }
    ]
  },
  {
    text: 'உன்ன சேர என் நெஞ்சு திண்டாடி தேடுது',
    time: 179.30,
    endTime: 183.20,
    words: [
      { word: 'உன்ன', time: 179.30, endTime: 179.90 },
      { word: 'சேர', time: 179.90, endTime: 180.50 },
      { word: 'என்', time: 180.50, endTime: 181.00 },
      { word: 'நெஞ்சு', time: 181.00, endTime: 181.60 },
      { word: 'திண்டாடி', time: 181.60, endTime: 182.40 },
      { word: 'தேடுது', time: 182.40, endTime: 183.20 }
    ]
  },
  {
    text: 'அன்னக்கிளியே நீ வரும் வழியே',
    time: 183.77,
    endTime: 187.50,
    words: [
      { word: 'அன்னக்கிளியே', time: 183.77, endTime: 185.30 },
      { word: 'நீ', time: 185.30, endTime: 185.90 },
      { word: 'வரும்', time: 185.90, endTime: 186.70 },
      { word: 'வழியே', time: 186.70, endTime: 187.50 }
    ]
  },
  {
    text: 'அல்லாடி போகுது மனமே',
    time: 187.80,
    endTime: 191.00,
    words: [
      { word: 'அல்லாடி', time: 187.80, endTime: 189.00 },
      { word: 'போகுது', time: 189.00, endTime: 189.90 },
      { word: 'மனமே', time: 189.90, endTime: 191.00 }
    ]
  },
  {
    text: 'அன்னக்கிளியே நீ வரும் வழியே',
    time: 191.44,
    endTime: 194.80,
    words: [
      { word: 'அன்னக்கிளியே', time: 191.44, endTime: 192.80 },
      { word: 'நீ', time: 192.80, endTime: 193.40 },
      { word: 'வரும்', time: 193.40, endTime: 194.00 },
      { word: 'வழியே', time: 194.00, endTime: 194.80 }
    ]
  },
  {
    text: 'தள்ளாடி வாழுற தனியே',
    time: 194.90,
    endTime: 197.40,
    words: [
      { word: 'தள்ளாடி', time: 194.90, endTime: 195.90 },
      { word: 'வாழுற', time: 195.90, endTime: 196.70 },
      { word: 'தனியே', time: 196.70, endTime: 197.40 }
    ]
  },
  // Outro Sargam
  {
    text: 'ஆ.. ஆ.. ரி ஸ நி த நி ஸ ரி',
    time: 197.50,
    endTime: 202.50,
    words: [
      { word: 'ஆ..', time: 197.50, endTime: 198.80 },
      { word: 'ஆ..', time: 198.80, endTime: 199.80 },
      { word: 'ரி', time: 199.80, endTime: 200.40 },
      { word: 'ஸ', time: 200.40, endTime: 200.80 },
      { word: 'நி', time: 200.80, endTime: 201.30 },
      { word: 'த', time: 201.30, endTime: 201.70 },
      { word: 'நி', time: 201.70, endTime: 202.10 },
      { word: 'ஸ', time: 202.10, endTime: 202.30 },
      { word: 'ரி', time: 202.30, endTime: 202.50 }
    ]
  },
  {
    text: 'ரி ஸ நி த.. வெண்ணிலவு வாழ வெண்பனியும் மூட',
    time: 202.50,
    endTime: 207.50,
    words: [
      { word: 'ரி', time: 202.50, endTime: 203.00 },
      { word: 'ஸ', time: 203.00, endTime: 203.40 },
      { word: 'நி', time: 203.40, endTime: 203.80 },
      { word: 'த..', time: 203.80, endTime: 204.30 },
      { word: 'வெண்ணிலவு', time: 204.30, endTime: 205.20 },
      { word: 'வாழ', time: 205.20, endTime: 205.90 },
      { word: 'வெண்பனியும்', time: 205.90, endTime: 206.80 },
      { word: 'மூட', time: 206.80, endTime: 207.50 }
    ]
  },
  // 3. Final Instrumental Outro: 207.50s to 238.45s
  {
    type: 'instrumental',
    text: '♪ [Instrumental Outro] ♪',
    time: 207.50,
    endTime: 238.45,
    words: []
  }
];

// Generate plain lyrics
const plainLyrics = linesData
  .filter(l => l.type !== 'instrumental')
  .map(l => l.text)
  .join('\n');

// Generate LRC string with word timestamps
const rawLrc = linesData.map(line => {
  const m = Math.floor(line.time / 60);
  const s = Math.floor(line.time % 60);
  const ms = Math.floor((line.time % 1) * 100);
  const timeTag = `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}]`;

  if (line.words && line.words.length > 0) {
    const wordTags = line.words.map(w => {
      const wm = Math.floor(w.time / 60);
      const ws = Math.floor(w.time % 60);
      const wms = Math.floor((w.time % 1) * 100);
      return `<${String(wm).padStart(2, '0')}:${String(ws).padStart(2, '0')}.${String(wms).padStart(2, '0')}> ${w.word}`;
    }).join(' ');
    return `${timeTag} ${wordTags}`;
  }

  return `${timeTag} ${line.text}`;
}).join('\n');

async function main() {
  const trackId = '7c9839c7-af29-4e71-9730-765fde9e79d5';
  console.log(`Updating Track ID ${trackId} with authentic, complete full-song synchronized lyrics...`);

  const updated = await prisma.track.update({
    where: { id: trackId },
    data: {
      lyrics: plainLyrics,
      synced_lyrics: linesData as any,
      raw_lrc: rawLrc,
      sync_source: 'ALIGNED_LYRICS',
      releaseStatus: 'PUBLISHED',
      isUnlisted: false,
    },
  });

  console.log(`✅ Successfully updated track "${updated.title}"!`);
  console.log(`- Total synced lines: ${linesData.length}`);
  console.log(`- Starts at: ${linesData[0].time}s, Ends at: ${linesData[linesData.length - 1].endTime}s`);
  console.log(`- Track duration: ${updated.duration}s`);
  console.log(`- First line: ${linesData[1].text} (${linesData[1].time}s)`);
  console.log(`- Middle line: ${linesData[20].text} (${linesData[20].time}s)`);
  console.log(`- Climax line: ${linesData[38].text} (${linesData[38].time}s)`);
  console.log(`- Outro line: ${linesData[linesData.length - 2].text} (${linesData[linesData.length - 2].time}s)`);
  console.log(`- Final instrumental outro ends at: ${linesData[linesData.length - 1].endTime}s`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
