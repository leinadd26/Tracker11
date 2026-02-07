const CACHE = 'meine-apps-1.0.8';

const FILES = [
    '/',                      // Root-URL statt ./index.html
    '/style.css',
    '/icon.png',

    '/seelenflamme/',          // Ordner statt index.html
    '/seelenflamme/style.css',
    '/seelenflamme/app.js',

    '/routine/',
    '/routine/style.css',
    '/routine/app.js',

    '/stats/',
    '/stats/style.css',
    '/stats/app.js',

    '/FortniteRanks/Bronze.png',
    '/FortniteRanks/Silber.png',
    '/FortniteRanks/Gold.png',
    '/FortniteRanks/Platin.png',
    '/FortniteRanks/Diamant.png',
    '/FortniteRanks/Elite.png',
    '/FortniteRanks/Champion.png',
    '/FortniteRanks/Unranked.png',

    '/gymlog/',
    '/gymlog/style.css',
    '/gymlog/app.js',

// ... füge hinzu:
'./finance/',
'./finance/style.css',
'./finance/app.js',

];


self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
});

self.addEventListener('fetch', e => {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});