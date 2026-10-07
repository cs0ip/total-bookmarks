import '@platform/background';

browser.action.onClicked.addListener(() => {
  void browser.tabs.create({ url: browser.runtime.getURL('index.html') }).catch((cause) => {
    console.error('Failed to open the bookmark manager', cause);
  });
});
