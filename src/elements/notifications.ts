import { FirebaseOptions, initializeApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";
import { html } from "lit";
import { Store } from "../store";
import { dom, fetchApi, supportsNotifications } from "../utils";

export async function setupPushNotifications() {
    try {
        if (!supportsNotifications()) {
            console.error("Push notifications not supported");
            return;
        }
        const user = Store.getUser();
        if (Notification.permission != "granted" || !user) {
            console.error("Can not setup push notifications, permission not granted or not logged in.");
            return;
        }
        const firebaseConfig: FirebaseOptions = {
            apiKey: "AIzaSyAZ2nH3qKCFqFhQSdeNH91SNAfTHl-nP7s",
            authDomain: "skychat-733ab.firebaseapp.com",
            projectId: "skychat-733ab",
            storageBucket: "skychat-733ab.appspot.com",
            messagingSenderId: "693556593993",
            appId: "1:693556593993:web:8137dd0568c75b50d1c698",
        };

        const app = initializeApp(firebaseConfig);
        const messaging = getMessaging(app);
        const token = await getToken(messaging, {
            vapidKey: "BIqRsppm0-uNKJoRjVCzu5ZYtT-Jo6jyjDXVuqLbudGvpRTuGwptZ9x5ueu5imL7xdjVA989bJOJYcx_Pvf-AYM",
        });

        const response = await fetchApi(`register?token=${encodeURIComponent(token)}&did=${encodeURIComponent(user.profile.did)}`);
        if (!response.ok) {
            console.error("Couldn't register push token.");
            return;
        }

        user.pushToken = token;
        Store.setUser(user);

        console.log("Initialized push notifications, token:\n" + token);
        navigator.serviceWorker.addEventListener("message", (ev) => {
            if (ev.data && ev.data == "notifications") {
                if (location.hash.replace("#", "") != "notifications") {
                    document.body.append(dom(html`<notifications-stream-overlay></notifications-stream-overlay>`)[0]);
                }
            }
        });
    } catch (e) {
        console.error("Couldn't request notification permission and start service worker.", e);
    }
}
