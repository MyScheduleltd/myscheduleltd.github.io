export interface ChatRect { left: number; top: number; width: number; height: number; }
export interface ChatViewport { width: number; height: number; left?: number; top?: number; }
export const CHAT_LAYOUT_KEY = 'myschedule-chat-layout-v1';

export function boundChatRect(rect: ChatRect, viewport: ChatViewport): ChatRect {
  const margin = Math.min(12, viewport.width / 4, viewport.height / 4);
  const x = (viewport.left ?? 0) + margin, y = (viewport.top ?? 0) + margin;
  const maxWidth = Math.max(1, viewport.width - margin * 2), maxHeight = Math.max(1, viewport.height - margin * 2);
  const width = Math.max(Math.min(310, maxWidth), Math.min(maxWidth, rect.width));
  const height = Math.max(Math.min(310, maxHeight), Math.min(maxHeight, rect.height));
  return { width, height, left: Math.max(x, Math.min(x + maxWidth - width, rect.left)), top: Math.max(y, Math.min(y + maxHeight - height, rect.top)) };
}

export function readChatRect(storage: Pick<Storage, 'getItem'>, viewport: ChatViewport): ChatRect {
  let rect: ChatRect | undefined;
  try { const value = JSON.parse(storage.getItem(CHAT_LAYOUT_KEY) ?? 'null');
    if (value && ['left', 'top', 'width', 'height'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]))) rect = value;
  } catch { /* Private browsing can deny storage. */ }
  return boundChatRect(rect ?? { left: (viewport.width - 560) / 2, top: 90, width: 560, height: Math.min(570, viewport.height - 110) }, viewport);
}

/** Pointer capture keeps a drag/resize alive outside the panel. Only the
 * labelled grip and corner handle consume gestures; message scrolling stays native. */
export function installFloatingChat(panel: HTMLElement, zh: boolean): () => void {
  const viewport = (): ChatViewport => ({ width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight,
    left: window.visualViewport?.offsetLeft ?? 0, top: window.visualViewport?.offsetTop ?? 0 });
  const storage = { getItem: (key: string) => localStorage.getItem(key) };
  let rect = readChatRect(storage, viewport()), pointer: { id: number; x: number; y: number; rect: ChatRect; resize: boolean } | undefined;
  const header = panel.querySelector<HTMLElement>('.panel__header p')!;
  header.dataset.chatDrag = ''; header.tabIndex = 0; header.setAttribute('role', 'button');
  header.setAttribute('aria-label', zh ? '移動聊天視窗，方向鍵可移動' : 'Move chat window; use arrow keys');
  const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'chat-resize'; handle.dataset.chatResize = '';
  // The corner grip is drawn in CSS so iOS cannot substitute an emoji glyph.
  handle.setAttribute('aria-label', zh ? '調整聊天視窗大小，方向鍵可調整' : 'Resize chat window; use arrow keys'); panel.append(handle);
  // This viewport solver owns the floating panel's height. The older mobile
  // sheet cap otherwise clamps its rendered box below the saved height and
  // makes the first part of a resize drag appear to do nothing.
  const paint = () => { const visible = boundChatRect(rect, viewport()); panel.style.inset = 'auto'; panel.style.maxHeight = 'none'; panel.style.left = `${visible.left}px`; panel.style.top = `${visible.top}px`; panel.style.width = `${visible.width}px`; panel.style.height = `${visible.height}px`; };
  const save = () => { rect = boundChatRect(rect, viewport()); try { localStorage.setItem(CHAT_LAYOUT_KEY, JSON.stringify(rect)); } catch { /* Still usable without persistence. */ } };
  const down = (event: PointerEvent) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation();
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, rect: { left: parseFloat(panel.style.left), top: parseFloat(panel.style.top), width: parseFloat(panel.style.width), height: parseFloat(panel.style.height) }, resize: event.currentTarget === handle };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); panel.classList.add('is-chat-adjusting'); };
  const move = (event: PointerEvent) => { if (!pointer || pointer.id !== event.pointerId) return; event.preventDefault();
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    rect = pointer.resize ? { ...pointer.rect, width: pointer.rect.width + dx, height: pointer.rect.height + dy }
      : { ...pointer.rect, left: pointer.rect.left + dx, top: pointer.rect.top + dy }; paint(); };
  const end = () => { pointer = undefined; panel.classList.remove('is-chat-adjusting'); save(); };
  const key = (event: KeyboardEvent) => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); const amount = event.shiftKey ? 30 : 10;
    const dx = event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0, dy = event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0;
    rect = event.currentTarget === handle ? { ...rect, width: rect.width + dx, height: rect.height + dy } : { ...rect, left: rect.left + dx, top: rect.top + dy }; paint(); save(); };
  for (const element of [header, handle]) { element.addEventListener('pointerdown', down); element.addEventListener('pointermove', move); element.addEventListener('pointerup', end); element.addEventListener('pointercancel', end); element.addEventListener('lostpointercapture', end); element.addEventListener('keydown', key); }
  const resize = () => { paint(); }; window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize); paint();
  return () => { for (const element of [header, handle]) { element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', end); element.removeEventListener('pointercancel', end); element.removeEventListener('lostpointercapture', end); element.removeEventListener('keydown', key); }
    window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); handle.remove(); panel.classList.remove('is-chat-adjusting');
    for (const property of ['inset', 'max-height', 'left', 'top', 'width', 'height']) panel.style.removeProperty(property); };
}
