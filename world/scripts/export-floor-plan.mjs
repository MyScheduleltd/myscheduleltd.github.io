import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const result=await build({stdin:{contents:"export {coastalMapGraphic} from './src/ui/coastalMap';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {coastalMapGraphic}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const legend=['1 FESTIVAL GATE','2 MY SQUARE','3 THE PALACE','4 DRIVE-IN 88','5 THE SHORE','6 SLAP AND POP','7 NIMA ROOFTOP','8 TEMPLE'];
const svg=coastalMapGraphic(false).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="1392" height="1128" ').replace('viewBox="-108 -78 232 156"','viewBox="-108 -78 232 188"').replace('</svg>',`<rect x="-108" y="78" width="232" height="32" fill="#f0e7d2"/><g fill="#253d3d" font-family="sans-serif" font-size="3.5">${legend.map((name,i)=>`<text x="${-102+(i%4)*57}" y="${88+Math.floor(i/4)*8}">${name}</text>`).join('')}<text x="-102" y="105">FESTIVAL FLOOR PLAN · NORTH / SEA ABOVE · WORLD X/Z COORDINATES</text></g></svg>`);
await mkdir('public',{recursive:true});await writeFile('public/floor-plan.svg',svg);
