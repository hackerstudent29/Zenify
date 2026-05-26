import { prisma } from '../utils/prisma.js';

const ICEBOY_LRC = `[ti:ICEBOY - Asal Kolaar]
[length:03:14]

[00:00.18][Intro]
[00:00.18]Male : Aah aahn kaalaila
[00:01.88]Padthunu iruppaen paayila
[00:03.18]Nee nenaikkuradhu naan illa
[00:04.86]Indhaa vaangiko vaayila
[00:06.11]Male : Aah aahn kaalaila
[00:07.82]Padthunu iruppaen paayila
[00:09.10]Nee nenaikkuradhu naan illa
[00:10.78]Indhaa vaangiko vaayila
[00:12.05][Verse 1]
[00:12.05]Male : Aah aahn
[00:12.84]Naan edhira vandhaa uchchaa poara paiyanlaam
[00:15.78]Enna edhirinu solli suthinu irukkangalaam
[00:17.06]Konjom comedy pannaa pazhaiya villaindradhu
[00:21.54]Ivanunga marandhuduraango inna panradhu
[00:24.29][Verse 2]
[00:24.29]Male : Kuduppaen temporary-ah elumbula steel bolt-ya
[00:27.44]Bucket-ah thookida uttu aakiduvenpaa alti-ya
[00:29.91]Unna ivlo uttadhu fault-ya ini thollaiya tharuvoam quality-ah
[00:32.96]En thambinga paatha kottiruvanungo ready-ah irudaa podi paiya
[00:36.31][Chorus 1]
[00:36.31]Male : Naan laesa feel aaitaa lawsuit file aavum
[00:39.17]Waste-ah un soul-uh ghost-ah povum
[00:41.80]Nee moonu seat muthu en case kaaran paththu
[00:44.66]Naan paesama kan aatunaa command-ukke remand aavum
[00:47.47]Male : Naan laesa feel aaitaa lawsuit file aavum
[00:51.09]Waste-ah un soul-uh ghost-ah povum
[00:53.66]Nee moonu seat muthu en case kaaran paththu
[00:56.50]Naan paesama kan aatunaa command-ukke remand aavum
[00:59.42]Male : Naan laesa feel aaitaa
[01:02.58]Lawsuit file aavum
[01:05.34]Naan paesama kan aatunaa
[01:08.54]Command-ukke remand aavum
[01:11.37][Verse 3]
[01:11.37]Male : Aah aahn kaalaila
[01:12.98]Padthunu iruppaen paayila
[01:14.26]Nee nenaikkuradhu naan illa
[01:15.94]Indhaa vaangiko vaayila
[01:17.44]Male : Aah aahn kaalaila
[01:18.92]Padthunu iruppaen paayila
[01:20.20]Nee nenaikkuradhu naan illa
[01:21.92]Indhaa vaangiko vaayila
[01:23.40][Verse 4]
[01:23.40]Male : Aah aahn
[01:24.28]Naan attom aadi alamaarila adikkitten cup-ah
[01:26.86]Oru paatta utta pathikkum eppa oru oru club-ah
[01:29.84]Naan padhungi irukken- uh enna pudikka nee vandhaa
[01:32.61]Peesa kaila iceboy adichiduven dabbaa
[01:35.06][Verse 5]
[01:35.06]Male : Aah aahn
[01:35.72]Enna pudikkalanaalum pudicha mathiri paesu da natpaa
[01:38.67]Illa veetukku pona yaarunu unna kaepar ungoppaa
[01:41.68]Un gavuravathukku enta power-ah kaatunaa
[01:44.48]Fuse kayira pudingi aakiduvaen choppa
[01:46.82]Dei 1 to 1 vandhaa alinjidum un data ellaam
[01:50.23]Kathu kudtha vaathiyarukku kaatta koodathu saettai ellaam
[01:52.98]Alavoda irundhukkunaa adipadaama kaathukkalaam
[01:55.92]Korangu kaila kolli katta koluthidume kaattai ellaam
[01:58.90]Kaattikalam yaaruvaena gethunu
[02:01.18]Jithungalaam bittungala paathu sollum aahn nadathu nadathunu
[02:04.86]Veliya varaama veetu ullaiye padthunu
[02:07.06]Veliya irundhu varadhungala thirutha mudiyumaa eppa oruthana
[02:10.52]Neenga katti vechadha uruvurom
[02:12.04]Enga niruvanatha niruvurom
[02:13.49]Konjom keduva kudthoam ivlo kaalam
[02:15.20]Adippoam inimae evan vandhaalum
[02:16.66]Udala moonjila karapada
[02:17.93]Naanga marandhutom da bayapada
[02:19.86]Uttadhellam thiruppi edukka
[02:21.14]Thayaaraa irukku tharai padai
[02:22.96][Chorus 2]
[02:22.96]Male : Naan laesa feel aaitaa
[02:25.58]Lawsuit file aavum
[02:28.30]Naan paesama kan aatunaa
[02:31.48]Command-ukke remand aavum
[02:34.80]Male : Naan laesa feel aaitaa lawsuit file aavum
[02:37.95]Waste-ah un soul-uh ghost-ah povum
[02:40.31]Nee moonu seat muthu en case kaaran paththu
[02:43.20]Naan paesama kan aatunaa command-ukke remand aavum
[02:46.40]Male : Naan laesa feel aaitaa lawsuit file aavum
[02:49.71]Waste-ah un soul-uh ghost-ah povum
[02:52.16]Nee moonu seat muthu en case kaaran paththu
[02:54.96]Naan paesama kan aatunaa command-ukke remand aavum
[02:58.93]Male : Naan laesa feel aaitaa
[02:58.93]Lawsuit file aavum
[02:58.93]Naan paesama kan aatunaa
[02:58.93]Command-ukke remand aavum
[02:58.98][Outro]
[02:58.98]Male : Aah aahn kaalaila
[02:59.66]Padthunu iruppaen paayila
[03:00.96]Nee nenaikkuradhu naan illa
[03:02.62]Indhaa vaangiko vaayila
[03:03.89]Male : Aah aahn kaalaila
[03:05.60]Padthunu iruppaen paayila
[03:06.88]Nee nenaikkuradhu naan illa
[03:08.68]Indhaa vaangiko vaayila
[03:09.99]Male : Aah aahn`;

// Parse LRC into synced tokens
function parseLRC(lrc: string) {
  const lines = lrc.split('\n');
  const result: Array<{ time: number; text: string }> = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{1,3})\]/;

  for (const line of lines) {
    const match = timeRegex.exec(line);
    if (!match) continue;
    const mins = parseInt(match[1]);
    const secs = parseInt(match[2]);
    const msStr = match[3];
    const ms = parseInt(msStr);
    const timeInSeconds = mins * 60 + secs + (ms / Math.pow(10, msStr.length));
    const text = line.replace(/\[.*?\]/g, '').trim();
    if (text) {
      result.push({ time: Math.round(timeInSeconds * 100) / 100, text });
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

async function main() {
  const syncedTokens = parseLRC(ICEBOY_LRC);
  console.log(`Parsed ${syncedTokens.length} synced lines from LRC`);

  // Find ICEBOY track
  const track = await prisma.track.findFirst({
    where: {
      OR: [
        { title: { contains: 'ICEBOY', mode: 'insensitive' } },
        { title: { contains: 'Asal Kolaar', mode: 'insensitive' } },
        { title: { contains: 'iceboy', mode: 'insensitive' } },
      ]
    },
    select: { id: true, title: true }
  });

  if (!track) {
    console.error('ICEBOY track not found in database');
    process.exit(1);
  }

  console.log(`Found track: "${track.title}" (${track.id})`);

  await prisma.track.update({
    where: { id: track.id },
    data: {
      synced_lyrics: syncedTokens as any,
      raw_lrc: ICEBOY_LRC,
    }
  });

  console.log(`✅ Successfully seeded ${syncedTokens.length} synced lyric lines for ICEBOY!`);
  
  // Print first 5 lines to verify
  console.log('\nFirst 5 synced lines:');
  syncedTokens.slice(0, 5).forEach(line => {
    console.log(`  [${line.time}s] ${line.text}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
