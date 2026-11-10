// Live check that every external service the app depends on still answers the way the code expects.
// The unit tests stub the network, so they cannot notice a service changing or retiring an endpoint
// (the Met retired /v1/search on 2026-10-01). Run this now and then: `npm run check:apis`.

const checks = [
  ['Met departments', 'https://collectionapi.metmuseum.org/public/collection/v1/departments',
    (data) => Array.isArray(data.departments) && data.departments.length > 0],
  ['Met search (v1.1)', 'https://collectionapi.metmuseum.org/public/collection/v1.1/search?hasImages=true&q=monet&limit=5&offset=0',
    (data) => typeof data.total === 'number' && data.total > 0 && Array.isArray(data.objectIDs) && data.objectIDs.length > 0],
  ['Met object', 'https://collectionapi.metmuseum.org/public/collection/v1/objects/436535',
    (data) => typeof data.title === 'string' && 'primaryImageSmall' in data && 'artistDisplayName' in data],
  ['Wikimedia Commons image search', 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=3&gsrsearch=Olympia+Manet&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json&origin=*',
    (data) => Object.values(data.query?.pages ?? {}).some((page) => page.imageinfo?.[0]?.thumburl)],
  ['Wikipedia search', 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=Realism+art+history&srlimit=1&format=json&origin=*',
    (data) => typeof data.query?.search?.[0]?.title === 'string'],
  ['Wikipedia summary', 'https://en.wikipedia.org/api/rest_v1/page/summary/Realism_(art_movement)',
    (data) => typeof data.extract === 'string' && data.extract.length > 0],
  ['Wikidata search', 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=Claude+Monet&language=en&type=item&limit=5&format=json&origin=*',
    (data) => Array.isArray(data.search) && data.search.some((result) => /painter/i.test(result.description ?? ''))],
  ['Wikidata entity', 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q296&props=claims&languages=en&format=json&origin=*',
    (data) => Array.isArray(data.entities?.Q296?.claims?.P27)],
];

// Wikimedia rejects requests from anonymous generic clients (Node's default User-Agent gets HTTP 429), so say who is asking.
const headers = { 'User-Agent': 'art-history-study-canary/1.0' };

let failed = 0;
for (const [name, url, valid] of checks) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    const body = response.ok ? await response.json() : null;
    const ok = response.ok && valid(body);
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  (HTTP ${response.status}${response.ok ? ', unexpected response shape' : ''})`}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}  (${error instanceof Error ? error.message : String(error)})`);
  }
}
console.log(failed ? `\n${failed} of ${checks.length} checks failed.` : `\nAll ${checks.length} services respond as expected.`);
process.exit(failed ? 1 : 0);
