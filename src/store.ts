import { AtpSessionData } from "@atproto/api";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { IndexedDBStorage } from "./indexeddb";

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
export type StoreKey = "user" | "theme";
export type Theme = "dark" | "light";

export class Store {
    static db = new IndexedDBStorage("skychat", 1);

    private static get<T>(key: StoreKey) {
        return localStorage.getItem(key) ? (JSON.parse(localStorage.getItem(key)!) as T) : undefined;
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
        return Store.set("theme", { theme });
    }
}
