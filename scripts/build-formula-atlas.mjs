import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import sharp from 'sharp';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { formulasTex,atlasIndices } from '../src/formulas-tex.js';

const adaptor=liteAdaptor();
RegisterHTMLHandler(adaptor);
const document=mathjax.document('',{InputJax:new TeX({packages:AllPackages}),OutputJax:new SVG({fontCache:'none'})});
const compiled=formulasTex.map((tex,index)=>{
  const markup=adaptor.outerHTML(document.convert(tex,{display:true}));
  if(markup.includes('data-mml-node="merror"'))throw new Error(`Invalid formula ${index}: ${tex}`);
  const svg=markup.match(/<svg[\s\S]*<\/svg>/)?.[0];
  if(!svg)throw new Error(`Missing SVG for ${index}`);
  const box=svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  return {tex,svg,box};
});
function placed(index,x,y,maxWidth,maxHeight) {
  const {svg,box}=compiled[index];
  const scale=Math.min(maxWidth/box[2],maxHeight/box[3],.105);
  const w=box[2]*scale,h=box[3]*scale;
  return svg.replace(/<svg[^>]*>/,`<svg x="${x+(maxWidth-w)/2}" y="${y+(maxHeight-h)/2}" width="${w}" height="${h}" viewBox="${box.join(' ')}" color="#fff">`);
}
const cells=atlasIndices.map((index,i)=>placed(index,(i%4)*1024+48,Math.floor(i/4)*256+24,928,208));
const atlas=`<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="3072">${cells.join('')}</svg>`;
const root=new URL('../public/',import.meta.url);
await mkdir(root,{recursive:true});
await writeFile(new URL('formula-atlas.svg',root),atlas);
await sharp(Buffer.from(atlas)).png().toFile(fileURLToPath(new URL('formula-atlas.png',root)));
// Standalone proof for checking limits outside 3D distortion.
const selected=[21,36,23,4,0,2];
const proof=`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><rect width="100%" height="100%" fill="#07090d"/>${selected.map((index,i)=>placed(index,80,15+i*145,1280,130)).join('')}</svg>`;
await writeFile(new URL('formula-proof.svg',root),proof);
await sharp(Buffer.from(proof)).png().toFile(fileURLToPath(new URL('formula-proof.png',root)));
const gamma=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="240"><rect width="100%" height="100%" fill="#07090d"/>${placed(21,50,20,900,200)}</svg>`;
await sharp(Buffer.from(gamma)).png().toFile(fileURLToPath(new URL('gamma-proof.png',root)));
await writeFile(new URL('formula-atlas.json',root),JSON.stringify({width:4096,height:3072,columns:4,rows:12,formulas:atlasIndices.map(i=>formulasTex[i])},null,2));
console.log(`Compiled ${compiled.length} LaTeX formulas to a 48-cell MathJax SVG/PNG atlas.`);
