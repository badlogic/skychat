import { AtpSessionData } from "@atproto/api";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";

export type PostRef = { cid: string; uri: string };
export type HashTagThread = { parent: PostRef; root: PostRef };
export type User = {
    account: string;
    password: string;
    session?: AtpSessionData;
    profile: ProfileViewDetailed;
    hashTagThreads: Record<string, HashTagThread>;
};
export type StoreKey = "user" | "theme";
export type Theme = "dark" | "light";

export class Store {
    private static get<T>(key: StoreKey): T | undefined {
        const value = localStorage.getItem(key);
        return value ? (JSON.parse(value) as T) : undefined;
    }

    private static set<T>(key: StoreKey, value: T | undefined): T | undefined {
        if (value == undefined) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify(value));
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
