import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { GET as proxyGET } from '../../src/app/api/proxy/route.ts';
import { GET as hlsGET } from '../../src/app/api/hls/[...slug]/route.ts';
import { POST as torboxPOST } from '../../src/app/api/torbox/route.ts';
import { POST as transcodePOST, DELETE as transcodeDELETE, cleanupStaleHlsDirectories } from '../../src/app/api/transcode/route.ts';

async function testSSRFProtection() {
  console.log('--- 1. Testing Proxy SSRF Protection & Protocols ---');

  // Test 1: Missing URL parameter
  const reqNoUrl = new Request('http://localhost:3000/api/proxy');
  const resNoUrl = await proxyGET(reqNoUrl);
  assert.strictEqual(resNoUrl.status, 400);
  const textNoUrl = await resNoUrl.text();
  assert.strictEqual(textNoUrl, 'Chybí URL adresa videa');
  console.log('  ✓ Empty URL correctly rejected (400)');

  // Test 2: Invalid URL string
  const reqInvalidUrl = new Request('http://localhost:3000/api/proxy?url=not_a_valid_url');
  const resInvalidUrl = await proxyGET(reqInvalidUrl);
  assert.strictEqual(resInvalidUrl.status, 400);
  const textInvalidUrl = await resInvalidUrl.text();
  assert.strictEqual(textInvalidUrl, 'Neplatná URL adresa');
  console.log('  ✓ Invalid URL string correctly rejected (400)');

  // Test 3: Protocols: file://
  const reqFile = new Request('http://localhost:3000/api/proxy?url=' + encodeURIComponent('file:///etc/passwd'));
  const resFile = await proxyGET(reqFile);
  assert.strictEqual(resFile.status, 400);
  assert.strictEqual(await resFile.text(), 'Zakázaný protokol: vyžadováno HTTP nebo HTTPS');
  console.log('  ✓ file:// protocol rejected (400)');

  // Test 4: Protocols: ftp://
  const reqFtp = new Request('http://localhost:3000/api/proxy?url=' + encodeURIComponent('ftp://example.com/test.mp4'));
  const resFtp = await proxyGET(reqFtp);
  assert.strictEqual(resFtp.status, 400);
  assert.strictEqual(await resFtp.text(), 'Zakázaný protokol: vyžadováno HTTP nebo HTTPS');
  console.log('  ✓ ftp:// protocol rejected (400)');

  // Test 5: Protocols: gopher://
  const reqGopher = new Request('http://localhost:3000/api/proxy?url=' + encodeURIComponent('gopher://example.com'));
  const resGopher = await proxyGET(reqGopher);
  assert.strictEqual(resGopher.status, 400);
  assert.strictEqual(await resGopher.text(), 'Zakázaný protokol: vyžadováno HTTP nebo HTTPS');
  console.log('  ✓ gopher:// protocol rejected (400)');

  // Test 6: Protocols: javascript:
  const reqJs = new Request('http://localhost:3000/api/proxy?url=' + encodeURIComponent('javascript:alert(1)'));
  const resJs = await proxyGET(reqJs);
  assert.strictEqual(resJs.status, 400);
  assert.strictEqual(await resJs.text(), 'Zakázaný protokol: vyžadováno HTTP nebo HTTPS');
  console.log('  ✓ javascript: protocol rejected (400)');

  // Test 7: Localhost / Internal IP checks (SSRF Vector Analysis)
  console.log('  [Security Analysis] Checking if local/internal IP restrictions exist in /api/proxy...');
  // Valid http protocol, target is localhost
  const reqLocal = new Request('http://localhost:3000/api/proxy?url=' + encodeURIComponent('http://127.0.0.1:9999/test'));
  const resLocal = await proxyGET(reqLocal);
  // It passes protocol check (http:), tries fetch which fails with error 500 (connection refused) because nothing listens on 9999
  assert.strictEqual(resLocal.status, 500);
  console.log('  ⚠️ Proxy allowed http://127.0.0.1:9999 to pass protocol check (failed at fetch stage). Private IP blocking not enforced.');
}

async function testHlsRouteAndPathTraversal() {
  console.log('\n--- 2. Testing HLS Route & Path Traversal Vulnerability ---');

  const baseTmpDir = path.join(process.cwd(), 'tmp-hls');
  const testSession = 'test_session_hls';
  const testDir = path.join(baseTmpDir, testSession);
  fs.mkdirSync(testDir, { recursive: true });

  const dummyM3u8 = path.join(testDir, 'index.m3u8');
  const m3u8Data = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-MAP:URI="E:\\some\\path\\tmp-hls\\${testSession}\\init.mp4"\n#EXTINF:6.000,\nsegment_000.m4s\n`;
  fs.writeFileSync(dummyM3u8, m3u8Data, 'utf-8');

  // Test standard M3U8 retrieval and init.mp4 path rewriting
  const req = new Request(`http://localhost:3000/api/hls/${testSession}/index.m3u8`);
  const params = Promise.resolve({ slug: [testSession, 'index.m3u8'] });
  const res = await hlsGET(req, { params });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('Content-Type'), 'application/vnd.apple.mpegurl');
  assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
  const bodyText = await res.text();
  assert(bodyText.includes('URI="init.mp4"'), 'M3U8 rewrite should replace absolute path with init.mp4');
  assert(!bodyText.includes('tmp-hls'), 'Original absolute path should be stripped');
  console.log('  ✓ HLS playlist fetch and init.mp4 path rewriting verified');

  // Test non-existent file
  const params404 = Promise.resolve({ slug: [testSession, 'nonexistent.m4s'] });
  const res404 = await hlsGET(req, { params: params404 });
  assert.strictEqual(res404.status, 404);
  console.log('  ✓ Missing HLS file returns 404');

  // Test Path Traversal Vector
  console.log('  [Security Analysis] Testing Path Traversal in /api/hls/[...slug]...');
  const traversalParams = Promise.resolve({ slug: [testSession, '..', '..', 'package.json'] });
  // path.join(cwd, 'tmp-hls', testSession, '..', '..', 'package.json') => cwd/package.json
  const resTraversal = await hlsGET(req, { params: traversalParams });
  if (resTraversal.status === 200) {
    console.log('  🚨 PATH TRAVERSAL CONFIRMED: /api/hls/[...slug] served package.json via relative path!');
    const packageJsonText = await resTraversal.text();
    assert(packageJsonText.includes('"name": "browseio"'));
  } else {
    console.log(`  ✓ Path traversal returned status ${resTraversal.status}`);
  }

  // Cleanup test session
  fs.rmSync(testDir, { recursive: true, force: true });
}

async function testCleanupStaleHlsDirectories() {
  console.log('\n--- 3. Testing Transcode Cleanup Helper (cleanupStaleHlsDirectories) ---');

  const baseTmpDir = path.join(process.cwd(), 'tmp-hls');
  fs.mkdirSync(baseTmpDir, { recursive: true });

  const staleSession = 'stale_session_test_123';
  const activeSession = 'active_session_test_456';

  const staleDir = path.join(baseTmpDir, staleSession);
  const activeDir = path.join(baseTmpDir, activeSession);

  fs.mkdirSync(staleDir, { recursive: true });
  fs.mkdirSync(activeDir, { recursive: true });

  // Artificially modify mtime of staleDir to 2 hours ago (7200000 ms)
  const twoHoursAgo = new Date(Date.now() - 7200000);
  fs.utimesSync(staleDir, twoHoursAgo, twoHoursAgo);

  // Keep activeDir fresh (now)
  const now = new Date();
  fs.utimesSync(activeDir, now, now);

  assert(fs.existsSync(staleDir), 'Stale dir should exist before cleanup');
  assert(fs.existsSync(activeDir), 'Active dir should exist before cleanup');

  // Run cleanup with default threshold (1 hour = 3600000 ms)
  cleanupStaleHlsDirectories(3600000);

  const staleExistsAfter = fs.existsSync(staleDir);
  const activeExistsAfter = fs.existsSync(activeDir);

  assert.strictEqual(staleExistsAfter, false, 'Stale directory should have been purged');
  assert.strictEqual(activeExistsAfter, true, 'Active/recent directory should have been preserved');

  console.log('  ✓ cleanupStaleHlsDirectories correctly purged stale folder (>1h) and kept active folder');

  // Cleanup activeDir
  fs.rmSync(activeDir, { recursive: true, force: true });
}

async function testTorboxRoute() {
  console.log('\n--- 4. Testing TorBox API Route (/api/torbox) ---');

  // Test missing action / invalid action
  const reqInvalid = new Request('http://localhost:3000/api/torbox', {
    method: 'POST',
    body: JSON.stringify({ action: 'unknown' }),
  });
  const resInvalid = await torboxPOST(reqInvalid);
  assert.strictEqual(resInvalid.status, 400);
  const jsonInvalid = await resInvalid.json();
  assert.strictEqual(jsonInvalid.error, 'Neplatný požadavek');
  console.log('  ✓ Invalid action returns 400 error');

  // Test action: check (with empty array)
  const reqCheck = new Request('http://localhost:3000/api/torbox', {
    method: 'POST',
    body: JSON.stringify({ action: 'check', hashes: [] }),
  });
  const resCheck = await torboxPOST(reqCheck);
  assert.strictEqual(resCheck.status, 200);
  const jsonCheck = await resCheck.json();
  assert(Array.isArray(jsonCheck.cached));
  console.log('  ✓ Action "check" returns cached array');

  // Test action: resolve without apiKey
  const reqResolveNoKey = new Request('http://localhost:3000/api/torbox', {
    method: 'POST',
    body: JSON.stringify({ action: 'resolve', magnet: 'magnet:?xt=urn:btih:123' }),
  });
  const resResolveNoKey = await torboxPOST(reqResolveNoKey);
  assert.strictEqual(resResolveNoKey.status, 400);
  const jsonResolveNoKey = await resResolveNoKey.json();
  assert.strictEqual(jsonResolveNoKey.error, 'Chybí TorBox API klíč');
  console.log('  ✓ Action "resolve" without apiKey returns 400 error');
}

async function testTranscodeRouteValidation() {
  console.log('\n--- 5. Testing Transcode Route Validation (/api/transcode) ---');

  // Test POST missing url/magnet or sessionId
  const reqBadPost = new Request('http://localhost:3000/api/transcode', {
    method: 'POST',
    body: JSON.stringify({ url: '' }),
  });
  const resBadPost = await transcodePOST(reqBadPost);
  assert.strictEqual(resBadPost.status, 400);
  const jsonBadPost = await resBadPost.json();
  assert.strictEqual(jsonBadPost.error, 'Missing url/magnet or sessionId');
  console.log('  ✓ POST missing fields correctly returns 400 error');

  // Test DELETE missing sessionId
  const reqBadDelete = new Request('http://localhost:3000/api/transcode', {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
  const resBadDelete = await transcodeDELETE(reqBadDelete);
  assert.strictEqual(resBadDelete.status, 400);
  const jsonBadDelete = await resBadDelete.json();
  assert.strictEqual(jsonBadDelete.error, 'Missing sessionId');
  console.log('  ✓ DELETE missing sessionId correctly returns 400 error');

  // Test DELETE valid sessionId
  const reqGoodDelete = new Request('http://localhost:3000/api/transcode', {
    method: 'DELETE',
    body: JSON.stringify({ sessionId: 'dummy_session_to_stop' }),
  });
  const resGoodDelete = await transcodeDELETE(reqGoodDelete);
  assert.strictEqual(resGoodDelete.status, 200);
  const jsonGoodDelete = await resGoodDelete.json();
  assert.strictEqual(jsonGoodDelete.success, true);
  console.log('  ✓ DELETE with valid sessionId returns success: true');
}

async function main() {
  console.log('======================================================');
  console.log('  STREAMING & SECURITY EMPIRICAL CHALLENGE SUITE      ');
  console.log('======================================================\n');

  try {
    await testSSRFProtection();
    await testHlsRouteAndPathTraversal();
    await testCleanupStaleHlsDirectories();
    await testTorboxRoute();
    await testTranscodeRouteValidation();

    console.log('\n======================================================');
    console.log('  ALL EMPIRICAL TESTS EXECUTED SUCCESSFULLY           ');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ EMPIRICAL TEST FAILURE:', err);
    process.exit(1);
  }
}

main();
