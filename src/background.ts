import { ICON_REQUEST } from './icons/protocol';
import { getSiteIcon, maintainSiteIcons, retryMissingSiteIcons } from './icons/store';

const ICON_MAINTENANCE = 'site-icons:maintenance';

browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === browser.runtime.id && message?.type === ICON_REQUEST && typeof message.url === 'string') {
    return getSiteIcon(message.url).catch((cause) => {
      console.error('Не удалось прочитать хранилище иконок', cause);
      return null;
    });
  }
});

function maintainIcons(): void {
  void maintainSiteIcons().catch((cause) => console.error('Не удалось обслужить хранилище иконок', cause));
}

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ICON_MAINTENANCE) maintainIcons();
});

// Firefox alarms don't survive a browser restart. Recreate a missing alarm
// whenever the background event page starts, without postponing an existing one.
void browser.alarms.get(ICON_MAINTENANCE).then((alarm) => {
  if (!alarm) browser.alarms.create(ICON_MAINTENANCE, { delayInMinutes: 1, periodInMinutes: 24 * 60 });
}).catch((cause) => console.error('Не удалось запланировать обслуживание иконок', cause));
browser.runtime.onStartup.addListener(maintainIcons);
browser.runtime.onInstalled.addListener(maintainIcons);

browser.permissions.onAdded.addListener((permissions) => {
  if (permissions.origins?.length) {
    void retryMissingSiteIcons().catch((cause) => console.error('Не удалось повторить загрузку иконок', cause));
  }
});

browser.action.onClicked.addListener(() => {
  void browser.tabs.create({ url: browser.runtime.getURL('index.html') });
});
