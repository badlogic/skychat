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

export type DevPreferences = {
    enabled: boolean;
    logPostViewRenders: boolean;
    logFeedViewPostRenders: boolean;
    logEmbedRenders: boolean;
    logThreadViewPostRenders: boolean;
    logStreamViewAppended: boolean;
    logStreamViewPrepended: boolean;
};

export type Theme = "dark" | "light";

export type Settings = {
    theme: Theme;
    pinchZoom: boolean;
    pushPrefs: PushPreferences;
    devPrefs: DevPreferences;
};

export type StoreKey = "user" | "settings";

export class Store {
    static db = new IndexedDBStorage("skychat", 1);
    static memory = new Map<string, any>();

    static {
        let settings: Settings | undefined = Store.get<Settings>("settings");
        settings = settings ?? ({} as Settings);

        settings.theme = settings.theme ?? "dark";

        settings.pinchZoom = settings.pinchZoom ?? true;

        settings.pushPrefs ?? ({} as PushPreferences);
        settings.pushPrefs.enabled = settings.pushPrefs.enabled ?? true;
        settings.pushPrefs.likes = settings.pushPrefs.likes ?? true;
        settings.pushPrefs.mentions = settings.pushPrefs.mentions ?? true;
        settings.pushPrefs.newFollowers = settings.pushPrefs.newFollowers ?? true;
        settings.pushPrefs.quotes = settings.pushPrefs.quotes ?? true;
        settings.pushPrefs.replies = settings.pushPrefs.replies ?? true;
        settings.pushPrefs.reposts = settings.pushPrefs.reposts ?? true;

        settings.devPrefs = settings.devPrefs ?? ({} as DevPreferences);
        settings.devPrefs.enabled = settings.devPrefs.enabled ?? false;
        settings.devPrefs.logEmbedRenders = settings.devPrefs.logEmbedRenders ?? false;
        settings.devPrefs.logFeedViewPostRenders = settings.devPrefs.logFeedViewPostRenders ?? false;
        settings.devPrefs.logPostViewRenders = settings.devPrefs.logPostViewRenders ?? false;
        settings.devPrefs.logStreamViewAppended = settings.devPrefs.logStreamViewAppended ?? false;
        settings.devPrefs.logStreamViewPrepended = settings.devPrefs.logStreamViewPrepended ?? false;

        Store.set<Settings>("settings", settings);
    }

    private static get<T>(key: StoreKey) {
        try {
            let memResult = this.memory.get(key);
            if (memResult) return memResult;
            memResult = localStorage.getItem(key) ? (JSON.parse(localStorage.getItem(key)!) as T) : undefined;
            this.memory.set(key, memResult);
            return memResult;
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
            this.memory.delete(key);
        } else {
            localStorage.setItem(key, JSON.stringify(value));
            Store.db.set(key, value);
            this.memory.set(key, value);
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

    static getDevPrefs() {
        return Store.get<Settings>("settings")?.devPrefs;
    }

    static setDevPrefs(devPrefs: DevPreferences) {
        Store.set("settings", { ...Store.get<Settings>("settings"), devPrefs });
    }
}
