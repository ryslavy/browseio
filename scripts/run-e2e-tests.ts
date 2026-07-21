/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BrowseIO E2E Test Suite Runner
 * Executes Tiers 1-4 of the Test Infrastructure Specification.
 */

import assert from 'node:assert';
import {
  parseImdbRating,
  parseReleaseYear,
  filterCatalogItems,
  sortCatalogItems,
} from '../src/lib/catalog-sorter.ts';
import { getCatalog, searchCinemeta, getMetaDetails } from '../src/lib/cinemeta.ts';
import { checkTorBoxCached } from '../src/lib/torbox.ts';

import { GET as proxyGET } from '../src/app/api/proxy/route.ts';

// Test suite state reporter
let passedTests = 0;
let failedTests = 0;

function runTest(name: string, testFn: () => void) {
  try {
    testFn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failedTests++;
  }
}

async function runAsyncTest(name: string, testFn: () => Promise<void>) {
  try {
    await testFn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failedTests++;
  }
}

// Mock dataset for boundary and combination testing
const MOCK_ITEMS = [
  {
    id: 'tt0111161',
    type: 'movie',
    name: 'The Shawshank Redemption',
    genres: ['Drama', 'Crime'],
    releaseInfo: '1994',
    imdbRating: '9.3',
    description: 'Two imprisoned men bond over a number of years...',
  },
  {
    id: 'tt0068646',
    type: 'movie',
    name: 'The Godfather',
    genres: ['Crime', 'Drama'],
    releaseInfo: '1972',
    imdbRating: '9.2',
    description: 'The aging patriarch of an organized crime dynasty...',
  },
  {
    id: 'tt0468569',
    type: 'movie',
    name: 'The Dark Knight',
    genres: ['Action', 'Crime', 'Drama'],
    releaseInfo: '2008',
    imdbRating: '9.0',
    description: 'When the menace known as the Joker wreaks havoc...',
  },
  {
    id: 'tt0903747',
    type: 'series',
    name: 'Breaking Bad',
    genres: ['Crime', 'Drama', 'Thriller'],
    releaseInfo: '2008-2013',
    imdbRating: '9.5',
    description: 'A chemistry teacher diagnosed with inoperable lung cancer...',
  },
  {
    id: 'tt0944947',
    type: 'series',
    name: 'Game of Thrones',
    genres: ['Action', 'Adventure', 'Drama'],
    releaseInfo: '2011-2019',
    imdbRating: '9.2',
    description: 'Nine noble families fight for control over the lands of Westeros...',
  },
  {
    id: 'tt9999999',
    type: 'movie',
    name: 'Unrated Upcoming Movie',
    genres: ['Sci-Fi'],
    releaseInfo: '2027',
    imdbRating: 'N/A',
    description: 'Upcoming mysterious sci-fi title.',
  },
  {
    id: 'tt8888888',
    type: 'movie',
    name: 'Obscure Vintage Film',
    genres: undefined,
    releaseInfo: undefined,
    imdbRating: undefined,
    description: 'Undated vintage film.',
  },
];

async function main() {
  console.log('====================================================');
  console.log('          BROWSEIO E2E TEST SUITE RUNNER            ');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // TIER 1: FEATURE COVERAGE
  // ----------------------------------------------------
  console.log('--- Tier 1: Feature Coverage ---');

  runTest('parseImdbRating converts valid rating strings to floats', () => {
    assert.strictEqual(parseImdbRating('9.3'), 9.3);
    assert.strictEqual(parseImdbRating('8.0'), 8.0);
    assert.strictEqual(parseImdbRating('8.5/10'), 8.5);
  });

  runTest('parseReleaseYear extracts 4-digit start year from release strings', () => {
    assert.strictEqual(parseReleaseYear('1994'), 1994);
    assert.strictEqual(parseReleaseYear('2008-2013'), 2008);
    assert.strictEqual(parseReleaseYear('Release: 2020'), 2020);
  });

  runTest('filterCatalogItems filters by media type (movie vs series)', () => {
    const movies = filterCatalogItems(MOCK_ITEMS, { type: 'movie' });
    assert.strictEqual(movies.length, 5);
    assert(movies.every(m => m.type === 'movie'));

    const series = filterCatalogItems(MOCK_ITEMS, { type: 'series' });
    assert.strictEqual(series.length, 2);
    assert(series.every(s => s.type === 'series'));
  });

  runTest('filterCatalogItems filters by genre', () => {
    const actionItems = filterCatalogItems(MOCK_ITEMS, { genre: 'Action' });
    assert.strictEqual(actionItems.length, 2); // The Dark Knight, Game of Thrones
    assert(actionItems.some(i => i.name === 'The Dark Knight'));
    assert(actionItems.some(i => i.name === 'Game of Thrones'));
  });

  runTest('sortCatalogItems sorts by rating_desc correctly', () => {
    const sorted = sortCatalogItems(MOCK_ITEMS, 'rating_desc');
    assert.strictEqual(sorted[0].name, 'Breaking Bad'); // 9.5
    assert.strictEqual(sorted[1].name, 'The Shawshank Redemption'); // 9.3
  });

  runTest('sortCatalogItems sorts by rating_asc correctly', () => {
    const sorted = sortCatalogItems(MOCK_ITEMS, 'rating_asc');
    assert.strictEqual(parseImdbRating(sorted[0].imdbRating), 0);
  });

  runTest('sortCatalogItems sorts by release_desc correctly', () => {
    const sorted = sortCatalogItems(MOCK_ITEMS, 'release_desc');
    assert.strictEqual(sorted[0].name, 'Unrated Upcoming Movie'); // 2027
    assert.strictEqual(sorted[1].name, 'Game of Thrones'); // 2011
  });

  runTest('sortCatalogItems sorts by title_asc lexicographically', () => {
    const sorted = sortCatalogItems(MOCK_ITEMS, 'title_asc');
    assert.strictEqual(sorted[0].name, 'Breaking Bad');
    assert.strictEqual(sorted[sorted.length - 1].name, 'Unrated Upcoming Movie');
  });

  await runAsyncTest('Cinemeta getCatalog returns valid metadata structure from API', async () => {
    const items = await getCatalog('movie', 'top', 0);
    assert(Array.isArray(items));
    assert(items.length > 0);
    assert(items[0].id && items[0].name && items[0].type);
  });

  await runAsyncTest('Cinemeta searchCinemeta searches items by query', async () => {
    const items = await searchCinemeta('Inception', 'movie');
    assert(Array.isArray(items));
    assert(items.length > 0);
    assert(items.some(i => i.name.toLowerCase().includes('inception')));
  });

  await runAsyncTest('Cinemeta getMetaDetails returns detailed metadata by IMDb ID', async () => {
    const meta = await getMetaDetails('movie', 'tt1375666');
    assert(meta !== null);
    assert.strictEqual(meta.id, 'tt1375666');
    assert(meta.name.toLowerCase().includes('inception'));
  });

  // ----------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES
  // ----------------------------------------------------
  console.log('\n--- Tier 2: Boundary & Corner Cases ---');

  runTest('parseImdbRating handles unparseable / missing values safely without throwing', () => {
    assert.strictEqual(parseImdbRating(undefined), 0);
    assert.strictEqual(parseImdbRating('N/A'), 0);
    assert.strictEqual(parseImdbRating(''), 0);
    assert.strictEqual(parseImdbRating('Not Rated'), 0);
    assert.strictEqual(parseImdbRating(null as any), 0);
  });

  runTest('parseReleaseYear handles unparseable / missing values safely without throwing', () => {
    assert.strictEqual(parseReleaseYear(undefined), 0);
    assert.strictEqual(parseReleaseYear('N/A'), 0);
    assert.strictEqual(parseReleaseYear(''), 0);
    assert.strictEqual(parseReleaseYear('TBA'), 0);
    assert.strictEqual(parseReleaseYear(null as any), 0);
  });

  runTest('filterCatalogItems handles null or missing metadata fields without throwing', () => {
    const corruptItems = [
      { id: 'tt1', type: 'movie', name: 'Corrupt 1', genres: undefined },
      { id: 'tt2', type: 'movie', name: 'Corrupt 2', description: undefined },
    ] as any[];

    const filtered = filterCatalogItems(corruptItems, { genre: 'Action', searchQuery: 'Corrupt' });
    assert.strictEqual(filtered.length, 0);
  });

  runTest('sortCatalogItems maintains array immutability', () => {
    const originalOrder = MOCK_ITEMS.map(i => i.id);
    sortCatalogItems(MOCK_ITEMS, 'rating_desc');
    const newOrder = MOCK_ITEMS.map(i => i.id);
    assert.deepStrictEqual(originalOrder, newOrder);
  });

  await runAsyncTest('checkTorBoxCached handles empty hash arrays and missing hashes safely', async () => {
    const emptyResult = await checkTorBoxCached([]);
    assert.strictEqual(emptyResult.size, 0);

    const nonExistent = await checkTorBoxCached(['0000000000000000000000000000000000000000']);
    assert(nonExistent instanceof Set);
    assert.strictEqual(nonExistent.has('0000000000000000000000000000000000000000'), false);
  });

  // ----------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // ----------------------------------------------------
  console.log('\n--- Tier 3: Cross-Feature Combinations ---');

  runTest('Multi-criteria combination: Type + Genre + Search + Sort (Rating Desc)', () => {
    const filtered = filterCatalogItems(MOCK_ITEMS, {
      type: 'movie',
      genre: 'Crime',
      searchQuery: 'Godfather',
    });
    const sorted = sortCatalogItems(filtered, 'rating_desc');
    assert.strictEqual(sorted.length, 1);
    assert.strictEqual(sorted[0].name, 'The Godfather');
  });

  runTest('Multi-criteria combination: Series + Action + Sort (Release Desc)', () => {
    const filtered = filterCatalogItems(MOCK_ITEMS, {
      type: 'series',
      genre: 'Action',
    });
    const sorted = sortCatalogItems(filtered, 'release_desc');
    assert.strictEqual(sorted.length, 1);
    assert.strictEqual(sorted[0].name, 'Game of Thrones');
  });

  runTest('Sorting Invariant: rating_desc monotonicity across sorted array', () => {
    const sorted = sortCatalogItems(MOCK_ITEMS, 'rating_desc');
    for (let i = 0; i < sorted.length - 1; i++) {
      const r1 = parseImdbRating(sorted[i].imdbRating);
      const r2 = parseImdbRating(sorted[i + 1].imdbRating);
      assert(r1 >= r2, `Monotonicity violated at index ${i}: ${r1} < ${r2}`);
    }
  });

  runTest('Sorting Invariant: release_desc monotonicity across sorted array', () => {
    const sorted = sortCatalogItems(MOCK_ITEMS, 'release_desc');
    for (let i = 0; i < sorted.length - 1; i++) {
      const y1 = parseReleaseYear(sorted[i].releaseInfo);
      const y2 = parseReleaseYear(sorted[i + 1].releaseInfo);
      assert(y1 >= y2, `Monotonicity violated at index ${i}: ${y1} < ${y2}`);
    }
  });

  // ----------------------------------------------------
  // TIER 4: REAL-WORLD SCENARIOS
  // ----------------------------------------------------
  console.log('\n--- Tier 4: Real-World Scenarios ---');

  await runAsyncTest('End-to-End User Path: Movie Search -> Filter Action -> Sort Rating -> Stream Mounting', async () => {
    // 1. User searches Cinemeta catalog
    const catalog = await searchCinemeta('Dark Knight', 'movie');
    assert(catalog.length > 0, 'Catalog search returned no results');

    // 2. User applies filter and sort
    const filtered = filterCatalogItems(catalog, { type: 'movie', genre: 'Action' });
    const sorted = sortCatalogItems(filtered, 'rating_desc');
    assert(sorted.length > 0, 'Filtered/sorted results empty');

    // 3. User selects top item
    const selectedItem = sorted[0];
    assert(selectedItem && selectedItem.id, 'Top selected item must have a valid ID');

    // 4. Fetch details to confirm stream suitability
    const details = await getMetaDetails('movie', selectedItem.id);
    assert(details !== null, 'Failed to fetch details for selected item');
    assert.strictEqual(details.id, selectedItem.id);
    assert(details.name && details.name.length > 0, 'Details must include item title');

    // 5. Test TorBox Debrid availability check contract
    const mockTorrentHash = 'c24945d8b76c8c49f874f676066898863f8510a2';
    const cachedHashes = await checkTorBoxCached([mockTorrentHash]);
    assert(cachedHashes instanceof Set, 'TorBox cached result must be a Set');

    // 6. Verify stream mounting parameters contract
    const streamConfig = {
      sessionId: details.id,
      torrentHash: mockTorrentHash,
      mode: cachedHashes.has(mockTorrentHash) ? 'debrid' : 'local_transcode',
      proxyUrl: `/api/proxy?url=${encodeURIComponent('https://example.com/stream.mp4')}`
    };

    assert.strictEqual(streamConfig.sessionId, details.id);
    assert(streamConfig.proxyUrl.includes('/api/proxy?url='));
  });

  // ----------------------------------------------------
  // TIER 5: SECURITY & STABILITY REMEDIATION TESTS
  // ----------------------------------------------------
  console.log('\n--- Tier 5: Security & Stability Remediation Tests ---');



  await runAsyncTest('Proxy SSRF Rejection: blocks loopback (127.0.0.1, localhost, ::1)', async () => {
    const res1 = await proxyGET(new Request('http://localhost/api/proxy?url=http://127.0.0.1:3000/'));
    assert.strictEqual(res1.status, 400, `127.0.0.1 expected 400, got ${res1.status}`);

    const res2 = await proxyGET(new Request('http://localhost/api/proxy?url=http://localhost:3000/'));
    assert.strictEqual(res2.status, 400, `localhost expected 400, got ${res2.status}`);

    const res3 = await proxyGET(new Request('http://localhost/api/proxy?url=http://[::1]:3000/'));
    assert.strictEqual(res3.status, 400, `[::1] expected 400, got ${res3.status}`);
  });

  await runAsyncTest('Proxy SSRF Rejection: blocks private / internal IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x)', async () => {
    const targets = [
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/admin',
      'http://172.16.0.1/status',
      'http://172.31.255.255/internal',
      'http://192.168.1.1/router',
      'http://0.0.0.0:8080/internal',
    ];

    for (const url of targets) {
      const res = await proxyGET(new Request(`http://localhost/api/proxy?url=${encodeURIComponent(url)}`));
      assert.strictEqual(res.status, 400, `Target ${url} expected 400, got ${res.status}`);
    }
  });

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
