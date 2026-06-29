# 🦆 Duck Hunt AR — WebAR-квест по кампусу School 21

Веб-приложение дополненной реальности для офлайн-мероприятий. Гости ходят по кампусу, наводят камеру телефона на стикеры и ловят 3D-уточек — прямо в браузере, без установки приложения.

## Как это работает

Каждый стикер на стене — уникальная картинка. Приложение распознаёт её через камеру и поверх неё появляется анимированная 3D-уточка. Тап по экрану — уточка поймана. Одну и ту же поймать дважды нельзя, счёт сохраняется даже если закрыть браузер. Кто соберёт больше всех — получает приз.

## Стек

- **[MindAR](https://hiukim.github.io/mind-ar-js-doc/)** — image tracking в браузере на TensorFlow.js
- **[A-Frame](https://aframe.io/)** — 3D-рендеринг
- **[Duck.glb](https://github.com/KhronosGroup/glTF-Sample-Assets)** — low-poly модель уточки от Khronos Group
- Хостинг — статический (GitHub Pages), бэкенд не нужен

## Особенности

- Работает на iOS (Safari) и Android (Chrome) без установки приложения
- Оптимизировано для слабых телефонов: одиночный трекинг, `mediump` precision, `low-power` GPU
- Прогресс хранится в `localStorage` — переживает перезагрузку страницы
- Детект встроенных браузеров (Instagram, Telegram, VK) с подсказкой открыть в Safari/Chrome
- Опциональная таблица лидеров через Firebase Realtime Database

## Лицензия

Код проекта — MIT. Модель Duck.glb — [SCEA Shared Source License 1.0](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/LICENSE.md).
