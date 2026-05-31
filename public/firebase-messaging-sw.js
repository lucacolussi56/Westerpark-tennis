importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD8-4Zvzbx2RD2qYqFLKvZ0-3rGDzD8mqg",
  authDomain: "westerpark-tennis.firebaseapp.com",
  projectId: "westerpark-tennis",
  storageBucket: "westerpark-tennis.firebasestorage.app",
  messagingSenderId: "358629997369",
  appId: "1:358629997369:web:78527ba968499140df86e8",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: '/tennis-icon.png',
    badge: '/tennis-icon.png',
    tag: 'westerpark-tennis',
    renotify: true,
  });
});
