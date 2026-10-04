# Рекомендации по проекту

## Назначение и источник идеи

- Двухпанельный менеджер закладок.
- Аналогом является Total commander, только интерфейс работает не с файлами, а с закладками браузера.

## Устройство проекта

- Расширение использует Firefox Manifest V3, Svelte 5 и Vite.
- `src/App.svelte` содержит страницу менеджера закладок. У кнопки на панели браузера нет всплывающего окна: `src/background.ts` открывает `index.html` во вкладке.
- Vite компилирует `src/background.ts` в `dist/background.js` и копирует `public/manifest.json` и `public/icons/` в `dist/`. Расширение запрашивает разрешение `bookmarks`.
- Исходники и скрипты компонентов Svelte написаны на TypeScript. Подсказки для WebExtension API в IDE обеспечивают `@types/firefox-webext-browser` и `tsconfig.json`; глобальный объект `browser` не нужно импортировать в исходники.
- Команда `npm run dev` запускает `vite build --watch`, а не сервер разработки. После пересборки перезагрузите временное дополнение в Firefox.

## Сборка и локальная установка

- Используйтся Node.js и npm.
- Установить зависимости: `npm install`. 
- Проверить типы: `npm run check`. Собрать проект: `npm run build`.
- Для временной установки: открыть в Firefox `about:debugging#/runtime/this-firefox`, нажать **Загрузить временное дополнение** и выберать `dist/manifest.json`.
