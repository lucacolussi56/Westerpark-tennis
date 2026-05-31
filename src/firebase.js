import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, logEvent } from "firebase/analytics";

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
