// Сервис-воркер WeMed: сначала сеть (чтобы обновления доходили сразу), но не дольше NET_WAIT мс:
// если сеть медленная (плохая связь, VPN), сразу отдаём копию из кэша, а свежая версия докачивается в фоне.
var CACHE = 'wemed-v30';
var NET_WAIT = 3500;
var SHELL = ['./', 'index.html', 'config.js', 'supabase.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return; // запросы к облаку (Supabase, Telegram) не трогаем
  var net = fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  });
  var fromCache = function () {
    return caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(function (hit) { return hit || (req.mode === 'navigate' ? caches.match('index.html') : null); });
  };
  e.respondWith(new Promise(function (resolve) {
    var done = false;
    var finish = function (r) { if (!done && r) { done = true; resolve(r); } };
    // сеть не успела — пробуем кэш; если в кэше нет, продолжаем ждать сеть
    var t = setTimeout(function () { fromCache().then(finish); }, NET_WAIT);
    net.then(function (res) { clearTimeout(t); finish(res); }).catch(function () {
      clearTimeout(t);
      fromCache().then(function (hit) { if (hit) finish(hit); else if (!done) { done = true; resolve(Response.error()); } });
    });
  }));
  e.waitUntil(net.catch(function () {}));
});

// Пуш-уведомления (приходят с сервера напоминаний)
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { try { d = { body: e.data.text() }; } catch (y) { d = {}; } }
  var title = d.title || 'WeMed';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'wemed',
    renotify: false,
    data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : null;
  }));
});
