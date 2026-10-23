import type {JukeboxTrack} from '../network/FestivalClient';

/** Shelf ordering does not touch the separately queued requests. */
export function movedJukeboxShelf(tracks:readonly JukeboxTrack[],id:string,direction:'up'|'down'):string[]|undefined {
  const order=tracks.map(track=>track.id),from=order.indexOf(id),to=from+(direction==='up'?-1:1);
  if(from<0||to<0||to>=order.length)return;
  [order[from],order[to]]=[order[to],order[from]];return order;
}

export function jukeboxShelfMarkup(tracks:readonly JukeboxTrack[],zh:boolean,escape:(text:string)=>string):string {
  return tracks.map((track,index)=>`<li><strong>${escape(track.title)}</strong><span class="staff-jukebox__stock-controls">
    <button type="button" data-jukebox-stock-move="${escape(track.id)}" data-direction="up" aria-label="${escape(zh?'往前移：'+track.title:'Move up: '+track.title)}"${index===0?' disabled':''}>&uarr;</button>
    <button type="button" data-jukebox-stock-move="${escape(track.id)}" data-direction="down" aria-label="${escape(zh?'往後移：'+track.title:'Move down: '+track.title)}"${index===tracks.length-1?' disabled':''}>&darr;</button>
    <button type="button" data-jukebox-remove="${escape(track.id)}">${zh?'取出':'REMOVE'}</button>
  </span></li>`).join('')||`<li><small>${zh?'點唱機是空的。':'The jukebox is empty.'}</small></li>`;
}

export function bindJukeboxShelf(scope:ParentNode,tracks:readonly JukeboxTrack[],send:(order:string[])=>Promise<void>):void {
  let pending=false;
  scope.querySelectorAll<HTMLButtonElement>('[data-jukebox-stock-move]').forEach(button=>{
    button.addEventListener('click',()=>{
      if(pending)return;
      const order=movedJukeboxShelf(tracks,button.dataset.jukeboxStockMove??'',button.dataset.direction==='up'?'up':'down');
      if(!order)return;
      pending=true;button.disabled=true;
      void send(order).finally(()=>{pending=false;button.disabled=false;});
    });
  });
}
