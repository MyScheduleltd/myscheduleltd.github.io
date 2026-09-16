import { SCREENING_SITES, SHORE_SIGN } from '../world/CoastalVenues';
import { COASTAL_ROUTES, ROAD_POLYGONS } from '../world/CoastalCirculation';
import { TEMPLE_STAIRS, templeStairX, shorelineAt } from '../world/CoastalTerrain';

/** Plan coordinates use the same X/Z positions as the navigable world. */
export function coastalMapGraphic(zh:boolean):string {
  const coast=Array.from({length:60},(_,i)=>{const x=-108+i*4;return `${x},${shorelineAt(x)}`;}).join(' ');
  const routes=COASTAL_ROUTES.map(route=>`<polyline ${route.kind==='walk'?'mask="url(#pavement-clearance)"':''} points="${route.points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${route.kind==='road'?'#666c68':route.kind==='carpet'?'#993e3a':'#e7ddc4'}" stroke-width="${route.width}" stroke-linejoin="miter"/>`).join('');
  const label=(x:number,z:number,n:string)=>`<g transform="translate(${x} ${z})"><circle r="4" fill="#f0e7d2" stroke="#474d48" stroke-width=".5"/><text text-anchor="middle" dy="1.6" font-size="4.8" fill="#252e30">${n}</text></g>`;
  const shore=SCREENING_SITES.shore,drive=SCREENING_SITES['drive-in'];
  const carBays=[0,1].flatMap(row=>[-1,0,1].map(column=>`<rect x="${35+column*7.2-1.8}" y="${-20.5-row*6.2-2.8}" width="3.6" height="5.6" rx=".5" fill="#ad7661" stroke="#eee2cb" stroke-width=".4"/>`)).join('');
  return `<svg class="coastal-plan" viewBox="-108 -78 232 156" role="img" aria-label="${zh?'沿岸影展街區、地形與步行路線':'Coastal festival streets, terrain and walking routes'}">
    <rect x="-108" y="-78" width="232" height="156" fill="#abb29a"/>
    <path d="M-108,-78 L${coast} L128,-78 Z" fill="#69999d"/>
    <polyline points="${coast}" fill="none" stroke="#d9c7a0" stroke-width="6"/>
    <path d="M60,-46 Q125,-62 122,36 Q87,55 59,29Z" fill="#829474"/>
    <path d="M68,-39 Q115,-49 115,32 M74,-29 Q106,-40 110,26" fill="none" stroke="#687f64" stroke-width=".6"/>
    <defs><mask id="pavement-clearance"><rect x="-108" y="-78" width="232" height="156" fill="white"/>${ROAD_POLYGONS.map(p=>`<polygon points="${p.map(v=>v.join(',')).join(' ')}" fill="black"/>`).join('')}</mask></defs>
    ${routes}
    <g stroke="#4e5752" stroke-width=".7"><rect x="-90" y="0" width="70" height="42" fill="#7d8580"/><rect x="-46.2" y="-49.2" width="22.4" height="19.4" fill="#687371"/><rect x="22" y="8" width="36" height="36" fill="#b9a987"/><rect x="76" y="-14" width="30" height="36" fill="#aa7254"/><g data-venue="drive-in" transform="translate(${drive.dx} ${drive.dz})"><rect x="22.5" y="-35.5" width="25" height="22" fill="#565f60"/><rect x="49.9" y="-18.65" width="4.2" height="3.3" fill="#a78563"/></g></g>
    ${[[-39,65,17,14],[-66,65,19,13],[35,65,16,14],[62,66,17,12]].map(([x,z,w,d])=>`<rect x="${x-w/2}" y="${z-d/2}" width="${w}" height="${d}" fill="#a28a73" stroke="#626d5e" stroke-width=".6"/>`).join('')}
    <g transform="translate(${drive.dx} ${drive.dz})">${carBays}<path d="M26,-36 H44" stroke="#3c484b" stroke-width="1.5"/></g><g data-venue="shore" transform="translate(${shore.dx} ${shore.dz})"><path d="M-9,-46 H9" stroke="#3c484b" stroke-width="1.5"/>
    <g fill="#d5c5a5">${[-34.5,-37.3,-40.1].flatMap(z=>[-3,-2,-1,0,1,2,3].map(c=>`<rect x="${c*2.25-.65}" y="${z-.7}" width="1.3" height="1.4"/>`)).join('')}</g></g>
    <g data-shore-sign="roadside" transform="translate(${SHORE_SIGN.x} ${SHORE_SIGN.z}) rotate(${SHORE_SIGN.rotation*180/Math.PI})"><rect x="${-SHORE_SIGN.width/2}" y="${-SHORE_SIGN.depth/2}" width="${SHORE_SIGN.width}" height="${SHORE_SIGN.depth}" fill="#354842" stroke="#d9c7a0" stroke-width=".35"/></g>
    <rect x="17.3" y="17.6" width="4.6" height="2.4" fill="#b7aa8b"/><path d="M17.8,20 V36.5 H22" fill="none" stroke="#e7ddc4" stroke-width="3"/>
    <g stroke="#71695c" stroke-width=".18">${Array.from({length:TEMPLE_STAIRS.count},(_,i)=>`<path d="M${templeStairX(i)},-2.5 v13"/>`).join('')}</g>
    <g fill="none" stroke="#b9ddda" stroke-width=".45" opacity=".7">${Array.from({length:18},(_,i)=>`<path d="M${-103+i*12},${-72+(i%3)*4} q2,-1 4,0 t4,0"/>`).join('')}</g>
    <g stroke="#344b45" stroke-width=".5">${[[-94,-20],[-60,-18],[-14,-9],[12,-50],[59,-40],[111,-19],[-84,53],[65,64]].map(([x,z])=>`<g transform="translate(${x} ${z})"><path d="M0,4V-3" stroke="#796144" stroke-width="1"/><path d="M0,-3Q-6,-7 -5,-1Q-2,-3 0,-3Q5,-8 6,-1Q2,-3 0,-3" fill="#4e7962"/></g>`).join('')}</g>
    <g fill="none" stroke="#c3c9b4" stroke-width="1">${[-88,-78,-58,-48,-38,-28].map(x=>`<path d="M${x},2v36"/>`).join('')}<path d="M-44,-47h18v14h-18z"/><path d="M25,12h30v27H25z"/></g>
    <g fill="#d0ba7e"><path d="M74,-14l17,-9 17,9-3,2-14,-6-14,6z"/><path d="M75,-10h32v3H75z"/></g>
    <g fill="#eee1bb"><path d="M-46,-30h22v3h-22z"/><path d="M-42,-29v4m4,-4v4m4,-4v4m4,-4v4" stroke="#a35846"/></g>
    ${label(0,62,'1')}${label(0,3,'2')}${label(-35,-40,'3')}${label(35+drive.dx,-24+drive.dz,'4')}${label(shore.dx,-39+shore.dz,'5')}${label(-58,21,'6')}${label(40,30,'7')}${label(91,4,'8')}
    <g fill="#253d3d" font-family="sans-serif" font-size="3.7"><text x="-99" y="-67">${zh?'海岸':'COAST'}</text><text x="76" y="-37">${zh?'山海小徑':'HILL WALK'}</text><text x="40" y="51" text-anchor="middle">${zh?'屋頂放映':'ROOFTOP'}</text><text x="-83" y="46">${zh?'跳舞俱樂部':'DANCE CLUB'}</text></g>
  </svg>`;
}
