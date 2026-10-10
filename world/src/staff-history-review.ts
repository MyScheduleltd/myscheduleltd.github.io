import './style.css';
import { App } from './ui/App';
import type { StaffOffering, NetworkMessage } from './network/FestivalClient';

if (!['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local STAFF review only');
const now = Date.now();
const offerings: StaffOffering[] = Array.from({length:50}, (_, i) => ({
  id:`fixture-${i}`, tradeNo:`TEST-${50-i}`, amount:30+i, state:'paid', createdAt:now-i*60_000,
  paidAt:now-i*60_000, paymentType:'Credit_CreditCard', visitorName:`測試捐款人 ${50-i}`,
  wantsReceipt:true, invoiceNo:`TEST-${50-i}`, invoiceError:'', invoiceTriedAt:now,
  invoiceNoticeSent:true, invoiceNoticeError:'', invoicing:false, canRetry:false,
}));
const messages: NetworkMessage[] = Array.from({length:50}, (_,i) => ({
  id:`message-${i}`, authorId:`fixture-${i}`, author:`測試訪客 ${i+1}`, channel:'FESTIVAL',
  text:`第 ${i+1} 則測試留言：工作人員可以捲動清單查看與管理較早的訊息。`, timestamp:now-i*60_000,
}));
const wishes = Array.from({length:30}, (_,i) => ({id:`wish-${i}`,name:`測試訪客 ${i+1}`,message:`第 ${i+1} 則祈福留言：平安順心。`,at:now-i*60_000}));
const root = document.getElementById('history-lists')!;
// Exercise the real render/refresh methods without starting a world or service.
const review = Object.assign(Object.create(App.prototype), {
  language:'zh-TW', root, staffKey:'local-fixture-only', offeringListCheckedAt:now,
  offeringListError:'', adminState:{offerings,offeringLimit:50,messages}, networkState:{wishes},
  festivalClient:{adminState:async()=>({offerings,offeringLimit:50})},
}) as {
  staffOfferingsList():string; staffWishList():string; staffMessagesList():string;
  bindOfferingList(root:ParentNode):void; refreshOfferingList():Promise<void>;
  festivalClient:{adminState:()=>Promise<unknown>};
};
root.innerHTML=review.staffOfferingsList()+review.staffWishList()+'<h3>近期聊天</h3>'+review.staffMessagesList();
review.bindOfferingList(root);
document.getElementById('failed-refresh')!.onclick=async()=>{
  review.festivalClient.adminState=async()=>{throw new Error('Fixture connection interrupted');};
  await review.refreshOfferingList();
};
