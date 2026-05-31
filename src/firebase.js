import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, logEvent } from "firebase/analytics";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyD8-4Zvzbx2RD2qYqFLKvZ0-3rGDzD8mqg",
  authDomain: "westerpark-tennis.firebaseapp.com",
  databaseURL: "https://westerpark-tennis-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "westerpark-tennis",
  storageBucket: "westerpark-tennis.firebasestorage.app",
  messagingSenderId: "358629997369",
  appId: "1:358629997369:web:78527ba968499140df86e8",
  measurementId: "G-RR78G4JSDF"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);
export { logEvent };

export const messaging = getMessaging(app);

export async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    const token = await getToken(messaging, {
      vapidKey: "BASU8vaJ2wTKAmOcvfaRlxTP7Nimz7RTs_3zqum9QelXSx_Gb8Q-Tg-Ipj6M1dYcCJjNSZflKc6qDStV8WTBg6o"
    });
    return token;
  } catch (err) {
    console.error("Notification permission error:", err);
    return null;
  }
}

export { onMessage };
