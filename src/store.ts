import { AtpSessionData } from "@atproto/api";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { IndexedDBStorage } from "./indexeddb";
import { State } from "./state";

export type PostRef = { cid: string; uri: string };
export type HashTagThread = { parent: PostRef; root: PostRef };

export type User = {
    account: string;
    password: string;
    session?: AtpSessionData;
    profile: ProfileViewDetailed;
    hashTagThreads: Record<string, HashTagThread>;
    pushToken?: string;
};

export type PushPreferences = {
    enabled: boolean;
    newFollowers: boolean;
    replies: boolean;
    quotes: boolean;
    reposts: boolean;
    mentions: boolean;
    likes: boolean;
};

export type Theme = "dark" | "light";

export type Settings = {
    theme: Theme;
    pinchZoom: boolean;
    pushPrefs: PushPreferences;
    devMode: boolean;
};

export type StoreKey = "user" | "settings";

export class Store {
    static db = new IndexedDBStorage("skychat", 1);

    static {
        let settings: Settings | undefined = Store.get<Settings>("settings");
        if (!settings) {
            settings = {
                theme: "dark",
                pushPrefs: { enabled: true, likes: true, mentions: true, newFollowers: true, quotes: true, replies: true, reposts: true },
                pinchZoom: true,
                devMode: false,
            };
            Store.set<Settings>("settings", settings);
        }
    }

    private static get<T>(key: StoreKey) {
        try {
            return localStorage.getItem(key) ? (JSON.parse(localStorage.getItem(key)!) as T) : undefined;
        } catch (e) {
            localStorage.removeItem(key);
            this.db.remove(key);
            return undefined;
        }
    }

    private static set<T>(key: StoreKey, value: T | undefined) {
        if (value == undefined) {
            localStorage.removeItem(key);
            Store.db.remove(key);
        } else {
            localStorage.setItem(key, JSON.stringify(value));
            Store.db.set(key, value);
        }
        return value;
    }

    static getUser() {
        return Store.get<User>("user");
    }

    static setUser(user: User | undefined) {
        Store.set("user", user);
    }

    static getTheme() {
        return Store.get<Settings>("settings")?.theme;
    }

    static setTheme(theme: Theme) {
        Store.set("settings", { ...Store.get<Settings>("settings"), theme });
        State.notify("theme", "updated", theme);
        return theme;
    }

    static getPinchZoom() {
        return Store.get<Settings>("settings")?.pinchZoom;
    }

    static setPinchZoom(pinchZoom: boolean) {
        Store.set("settings", { ...Store.get<Settings>("settings"), pinchZoom });
    }

    static getPushPreferences() {
        return Store.get<Settings>("settings")?.pushPrefs;
    }

    static setPushPreferences(pushPrefs: PushPreferences) {
        Store.set("settings", { ...Store.get<Settings>("settings"), pushPrefs });
    }

    static getDevMode() {
        return Store.get<Settings>("settings")?.devMode;
    }

    static setDevMode(devMode: boolean) {
        Store.set("settings", { ...Store.get<Settings>("settings"), devMode });
    }
}
