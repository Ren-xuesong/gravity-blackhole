import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { formulasTex,atlasIndices } from '../src/formulas-tex.js';
import { ribbonPoint } from '../src/ribbon-path.js';

const svg=await readFile(new URL('../public/formula-atlas.svg',import.meta.url),'utf8');
assert(!svg.includes('data-mml-node="merror"'));
assert(!svg.includes('<text'),'Every mathematical glyph must be an SVG path');
assert(svg.includes('data-mml-node="munderover"'),'Sum limits must retain their above/below layout');
assert.equal(new Set(atlasIndices).size,formulasTex.length,'Every source equation must appear in the atlas');
assert(formulasTex[21].includes(String.raw`\int\nolimits_0^{+\infty}`));
assert(!formulasTex.some(tex=>tex.includes(String.raw`\int\limits`)),'Integral limits must sit to the right');
const proof=await readFile(new URL('../public/formula-proof.svg',import.meta.url),'utf8');
const gamma=proof.match(/<svg x=[\s\S]*?<\/svg>/)?.[0];
assert(gamma?.includes('data-mml-node="msubsup"'),'Gamma integral must have side scripts');
assert(!gamma.includes('data-mml-node="munderover"'),'Gamma integral must not use stacked limits');
const {data,info}=await sharp(fileURLToPath(new URL('../public/formula-atlas.png',import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
assert.equal(info.width,4096);assert.equal(info.height,3072);
// Transparent gutters prevent upper/lower limits leaking into adjacent cells.
for(let row=0;row<12;row++)for(const y of [row*256,row*256+7,row*256+248,row*256+255]) {
  for(let x=0;x<4096;x++)assert.equal(data[(y*4096+x)*4+3],0,`Cell row ${row} clips its limits`);
}
for(let lane=0;lane<7;lane++) {
  let previous=null,maxBend=0;
  for(let i=0;i<=320;i++) {
    const t=i/320*1.25,center=ribbonPoint(lane,t,.5);
    for(const v of [0,.25,.5,.75,1]) {
      const p=ribbonPoint(lane,t,v).point;
      assert(p.toArray().every(Number.isFinite));
    }
    if(previous)assert(center.point.distanceTo(previous)<1,'No discontinuous path jumps');
    previous=center.point;
    const a=ribbonPoint(lane,t,0).point,b=ribbonPoint(lane,t,1).point;
    maxBend=Math.max(maxBend,center.point.distanceTo(a.add(b).multiplyScalar(.5)));
  }
  assert(maxBend>.05,'Ribbon must bend across its width, not be a flat ruled strip');
}
console.log('LaTeX coverage, math limits, atlas gutters and all 7 ribbon surfaces passed.');
