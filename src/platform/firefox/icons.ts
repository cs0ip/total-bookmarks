import { defaultIcons, ICON_ORIGINS, ICON_REQUEST, ICON_UPDATED, siteOrigin, type IconUpdate } from '../../icons/protocol';

export { defaultIcons };
export const iconOrigins = ICON_ORIGINS;

export function watchSiteIcon(url: string, onIcon: (icon: string | null) => void): () => void {
  const origin = siteOrigin(url);
  if (!origin) return () => {};
  let active = true;
  let receivedUpdate = false;
  function onUpdate(message: IconUpdate) {
    if (message?.type === ICON_UPDATED && message.origin === origin) {
      receivedUpdate = true;
      onIcon(message.icon);
    }
  }
  browser.runtime.onMessage.addListener(onUpdate);
  void browser.runtime.sendMessage({ type: ICON_REQUEST, url }).then((cached: string | null) => {
    if (active && !receivedUpdate) { onIcon(cached); }
  }).catch((cause) => console.error('Failed to get the favicon', cause));
  return () => {
    active = false;
    browser.runtime.onMessage.removeListener(onUpdate);
  };
}
