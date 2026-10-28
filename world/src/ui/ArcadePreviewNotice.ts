import type {ArcadePreviewClient,ArcadePreviewState} from '../network/ArcadePreview';
export type ArcadePreviewDialog=HTMLDialogElement&{refreshArcadePreview?:()=>void};
export function createArcadePreviewNotice(options:{client:ArcadePreviewClient;zh:boolean;canPlay:boolean;changed:(state:ArcadePreviewState)=>void;play:()=>void}):ArcadePreviewDialog{
 const {client,zh}=options,dialog=document.createElement('dialog') as ArcadePreviewDialog;
 dialog.className='moth-release-notice arcade-preview-notice';dialog.setAttribute('aria-labelledby','moth-release-title');
 dialog.innerHTML=`<span class="moth-release-notice__label">M.O.T.H</span><h2 id="moth-release-title">${zh?'提前解鎖 M.O.T.H 遊戲機':'UNLOCK THE M.O.T.H ARCADE EARLY'}</h2>
  <p>${zh?'M.O.T.H 是影展裡那台街機上的遊戲，2026 年 11 月 16 日 00:00（台灣時間）起開放給所有人。':'M.O.T.H is the game on the arcade machine in the festival. It opens to everyone on November 16, 2026, 00:00 Taiwan time.'}</p>
  <p>${zh?'想先玩？完成一筆供養（廟裡的美麗仙人像前，或登入頁的 Donate），付款確認後這裡會出現一組序號。按「兌換」，就能馬上解鎖影展裡的 M.O.T.H 遊戲機。':'Want to play sooner? Make an offering (at the statue in the temple, or with Donate on the sign-in page). Once the payment is confirmed, a code appears here. Redeem it to unlock the M.O.T.H arcade machine in the festival straight away.'}</p>
  <p class="arcade-preview-note">${zh?'序號就是你的通行證：序號只會顯示在你付款的這個瀏覽器上，請抄下來或截圖保存；弄丟了就找不回來啦！':'Your code is your pass: it is only shown here, in the browser you paid with, so write it down or take a screenshot. A lost code cannot be recovered.'}</p>
  <div data-arcade-own-codes></div><form data-arcade-code-form><label>${zh?'輸入序號':'ENTER CODE'}<input name="arcadeCode" data-arcade-code autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="MOTH-…" /></label><button type="submit" data-arcade-redeem>${zh?'兌換':'REDEEM'}</button></form>
  <p role="status" aria-live="polite" data-arcade-code-status></p>
  <div class="arcade-preview-actions"><button type="button" data-arcade-preview-play hidden>${zh?'開始遊玩':'PLAY M.O.T.H'}</button><button type="button" data-arcade-preview-close>${zh?'關閉':'CLOSE'}</button></div>`;
 const field=dialog.querySelector<HTMLInputElement>('[data-arcade-code]')!,status=dialog.querySelector<HTMLElement>('[data-arcade-code-status]')!,redeem=dialog.querySelector<HTMLButtonElement>('[data-arcade-redeem]')!,play=dialog.querySelector<HTMLButtonElement>('[data-arcade-preview-play]')!;
 let busy=false;
 const paint=(state:ArcadePreviewState)=>{
  const own=dialog.querySelector<HTMLElement>('[data-arcade-own-codes]')!;own.replaceChildren();
  if(state.codes.length){const heading=document.createElement('h3');heading.textContent=zh?'你的序號 · 請抄下保存':'YOUR CODES · KEEP A COPY';own.append(heading);
   for(const entry of state.codes){const row=document.createElement('div');row.className='arcade-preview-code';const text=document.createElement('code');text.textContent=entry.code;const copy=document.createElement('button');copy.type='button';copy.textContent=zh?'複製':'COPY';copy.addEventListener('click',()=>{const select=()=>{field.value=entry.code;field.focus();field.select();status.textContent=zh?'請複製選取的序號。':'Copy the selected code.';};if(!navigator.clipboard){select();return;}void navigator.clipboard.writeText(entry.code).then(()=>{status.textContent=zh?'已複製序號。':'Code copied.';}).catch(select);});row.append(text,copy);own.append(row);}
   if(!field.value)field.value=state.codes.find(code=>!code.redeemed)?.code??state.codes[0].code;
  }
  play.hidden=!state.unlocked||!options.canPlay;
  if(state.unlocked)status.textContent=options.canPlay?(zh?'這台裝置已解鎖。按「開始遊玩」繼續。':'Unlocked on this device. Press PLAY to continue.'):(zh?'已解鎖。進入影展，走到 M.O.T.H 遊戲機前就能玩。':'Unlocked. Enter the festival and walk up to the M.O.T.H arcade machine to play.');
  else if(!busy)status.textContent=state.codes.length?(zh?'付款已確認。先把序號抄下來，再按「兌換」解鎖遊戲機。':'Payment confirmed. Copy your code somewhere safe, then press REDEEM to unlock the arcade machine.'):(zh?'付款確認後，序號會出現在這裡。':'Your code appears here after payment is confirmed.');
 };
 dialog.refreshArcadePreview=()=>paint(client.state);
 dialog.querySelector('[data-arcade-preview-close]')!.addEventListener('click',()=>dialog.close());
 play.addEventListener('click',()=>{dialog.close();options.play();});
 dialog.querySelector('form')!.addEventListener('submit',event=>{
  event.preventDefault();if(busy)return;if(!field.value.trim()){status.textContent=zh?'請輸入序號。':'Enter your code.';return;}
  busy=true;redeem.disabled=true;status.textContent=zh?'正在驗證…':'Verifying…';
  void client.redeem(field.value).then(state=>{options.changed(state);paint(state);}).catch(error=>{status.textContent=error instanceof Error?error.message:(zh?'無法驗證序號。':'Could not verify the code.');}).finally(()=>{busy=false;redeem.disabled=false;});
 });
 dialog.addEventListener('keydown',event=>event.stopPropagation());paint(client.state);
 void client.status().then(state=>{options.changed(state);paint(state);}).catch(error=>{status.textContent=error instanceof Error?error.message:'Could not check arcade access.';});
 return dialog;
}
