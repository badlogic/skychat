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
export type StoreKey = "user" | "theme" | "pushPrefs";
export type Theme = "dark" | "light";

export class Store {
    static db = new IndexedDBStorage("skychat", 1);

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
        return Store.get<{ theme: Theme }>("theme")?.theme;
    }

    static setTheme(theme: Theme) {
        Store.set("theme", { theme });
        State.notify("theme", "updated", theme);
        return theme;
    }

    static getPushPreferences() {
        return Store.get<PushPreferences>("pushPrefs");
    }

    static setPushPreferences(pushPrefs: PushPreferences) {
        return Store.set("pushPrefs", pushPrefs);
    }
}
