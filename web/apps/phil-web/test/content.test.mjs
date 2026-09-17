import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import worker, {TUTORIAL_KEY,TUTORIAL_BYTES,videoRange,CSP} from '../hosting/worker.mjs';
const read = p => readFile(new URL(p, import.meta.url), 'utf8');
test('complete owner history is preserved, chronological and linked only to original posts', async () => {
 const data=JSON.parse(await read('../content/history.json')), original=await read('../content/phil-history.md');
 assert.equal(data.sourceSHA256,createHash('sha256').update(original).digest('hex'));
 assert.equal(data.entries.length,161);
 assert.deepEqual(['2024','2025','2026'].map(y=>data.entries.filter(e=>e.year===y).length),[98,22,41]);
 assert.deepEqual(data.entries.map(e=>e.date),data.entries.map(e=>e.date).sort());
 for(const e of data.entries) assert.match(e.url,/^https:\/\/x\.com\/tyler_lengyel\/status\/\d+$/);
 const story=original.split('## Phil  \n')[1].replace(/\n##\s*$/,'').trim().replace(/\*\*(.*?)\*\*/gs,'$1').replaceAll('\u2028','\n');
 assert.equal(data.story.join('\n').replace(/\s/g,''),story.replace(/\s/g,''));
 for(const m of data.milestones) assert.ok(data.entries.some(e=>e.url.endsWith('/'+m.post)));
});
test('content renderer uses text nodes, no execution/custody/storage or remote player', async () => {
 const content=await read('../src/content.mjs');
 assert.doesNotMatch(content,/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|localStorage|indexedDB/);
 assert.match(content,/textContent = text/);
 assert.match(content,/noopener noreferrer/);
 assert.equal((content.match(/^import /gm)||[]).length,1);
 assert.match(CSP,/media-src 'self'/); assert.doesNotMatch(CSP,/unsafe-|media-src[^;]*https:/);
 const html=await read('../public/index.html');assert.match(html,/preload="none"/);assert.doesNotMatch(html,/<iframe|<script[^>]*https:/);
});
test('video ranges support bounded, open and suffix requests and reject invalid ranges', () => {
 assert.deepEqual(videoRange('bytes=0-1023',2000),{offset:0,length:1024});
 assert.deepEqual(videoRange('bytes=1000-',2000),{offset:1000,length:1000});
 assert.deepEqual(videoRange('bytes=-500',2000),{offset:1500,length:500});
 for(const v of ['bytes=2000-','bytes=5-4','bytes=-0','bytes=-','bytes=0-1,4-5','bytes=1e2-']) assert.equal(videoRange(v,2000),null);
});
test('tutorial streams only the pinned R2 object with exact range, isolated headers and no credentials', async () => {
 const env={PHIL_RELEASE_ID:'a'.repeat(40)+':'+ 'b'.repeat(64),ASSETS:{fetch(){throw Error('no assets')}},TUTORIAL:{
  async head(key){assert.equal(key,TUTORIAL_KEY);return {size:TUTORIAL_BYTES,httpEtag:'"fixture"',etag:'fixture'}},
  async get(key,opts){assert.equal(key,TUTORIAL_KEY);assert.deepEqual(opts,{onlyIf:{etagMatches:'fixture'},range:{offset:0,length:4}});return {body:new Uint8Array([1,2,3,4])}}
 }};
 const url='https://phil.tylerlengyel.com/media/'+TUTORIAL_KEY;
 const response=await worker.fetch(new Request(url,{headers:{Range:'bytes=0-3',Cookie:'private',Authorization:'private'}}),env);
 assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),`bytes 0-3/${TUTORIAL_BYTES}`);
 assert.equal(response.headers.get('Content-Security-Policy'),CSP);assert.equal(response.headers.get('Cross-Origin-Resource-Policy'),'same-origin');
 assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3,4]);
 assert.equal((await worker.fetch(new Request(url,{method:'HEAD'}),env)).status,200);
 assert.equal((await worker.fetch(new Request(url,{headers:{Range:`bytes=${TUTORIAL_BYTES}-`}}),env)).status,416);
 assert.equal((await worker.fetch(new Request(url+'/other'),env)).status,404);
 assert.equal((await worker.fetch(new Request(url,{method:'POST'}),env)).status,405);
});

test('untrusted links cannot supply scripts, credentials, lookalike hosts or executable markup', async () => {
 const {safeXLink,filterTimeline}=await import('../src/content.mjs');
 for(const url of ['javascript:alert(1)','https://x.com.evil.test/tyler_lengyel/status/1','https://user@x.com/tyler_lengyel/status/1','https://x.com/tyler_lengyel/status/1?redirect=evil','data:text/html,<script>alert(1)</script>']) assert.equal(safeXLink(url),null);
 assert.equal(safeXLink('https://x.com/tyler_lengyel/status/1/photo/2'),'https://x.com/tyler_lengyel/status/1/photo/2');
 const rows=[{year:'2024',dateLabel:'March 2024',text:'Phil 🦖'}, {year:'2025',dateLabel:'May 2025',text:'SVG'}];
 assert.deepEqual(filterTimeline(rows,'2024','PHIL'),[rows[0]]);assert.deepEqual(filterTimeline(rows,'all','<script>'),[]);
});
