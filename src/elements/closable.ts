import { LitElement, PropertyValueMap, html } from "lit";
import { BskyAgent } from "@atproto/api";
import { property } from "lit/decorators.js";
import { ProfileOverlay } from "./profile";
import { dom } from "../utils";
import { ThreadOverlay } from "./postview";

class BaseGuard<T> {
    protected callbacks: T[] = [];

    register(callback: T): T {
        this.callbacks.push(callback);
        return callback;
    }

    remove(callback: T | undefined) {
        if (!callback) return;
        this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    }

    protected getTop(): T | undefined {
        return this.callbacks[this.callbacks.length - 1];
    }
}

export type NavigationCallback = () => void;

class NavigationGuard extends BaseGuard<NavigationCallback> {
    private popStateListener;
    private inPopState = false;
    _call = true;
    set call(value: boolean) {
        this._call = value;
    }

    constructor() {
        super();
        history.scrollRestoration = "manual";

        this.popStateListener = (event: PopStateEvent) => {
            this.inPopState = true;
            if (this._call) {
                const callback = this.getTop();
                if (callback) callback();
            } else {
                this._call = true;
            }
            this.inPopState = false;
        };
        window.addEventListener("popstate", this.popStateListener);
    }

    register(callback: NavigationCallback): NavigationCallback {
        const result = super.register(callback);
        return result;
    }

    remove(callback: NavigationCallback) {
        super.remove(callback);
        if (!this.inPopState) {
            this._call = false;
            history.back();
        }
    }
}

export const navigationGuard = new NavigationGuard();

export type EscapeCallback = () => void;

export class EscapeGuard extends BaseGuard<EscapeCallback> {
    private listener;

    constructor() {
        super();
        this.listener = this.handleEscape.bind(this);
        document.addEventListener("keydown", this.listener);
    }

    private handleEscape(event: KeyboardEvent): void {
        if (event.keyCode == 27 || event.key == "Escape") {
            const callback = this.getTop();
            if (callback) callback();
        }
    }
}

export const escapeGuard = new EscapeGuard();

export class CloseableElement extends LitElement {
    readonly navCallback;
    readonly escapeCallback;
    closed = false;

    constructor() {
        super();
        this.navCallback = navigationGuard.register(() => this.close());
        this.escapeCallback = escapeGuard.register(() => this.close());
        history.pushState(null, "", null);
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        navigationGuard.remove(this.navCallback);
        escapeGuard.remove(this.escapeCallback);
        this.remove();
    }
}

export abstract class HashNavCloseableElement extends LitElement {
    readonly navCallback;
    readonly escapeCallback;
    bskyClient?: BskyAgent;
    closed = false;
    @property()
    pushState = true;

    constructor() {
        super();
        this.navCallback = navigationGuard.register(() => this.close());
        this.escapeCallback = escapeGuard.register(() => this.close());
    }

    abstract getHash(): string;

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (!this.bskyClient) return;
        if (this.pushState) history.pushState(null, "", location.href.split("#")[0]);
        pushHash(this.bskyClient, this.getHash());
        document.title = "Skychat - " + this.getHash();
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        navigationGuard.remove(this.navCallback);
        escapeGuard.remove(this.escapeCallback);
        this.remove();
    }
}

let setup = false;
export function pushHash(bskyClient: BskyAgent, hash: string) {
    if (!setup) {
        setup = true;
        window.addEventListener("hashchange", () => {
            if (!bskyClient) return;
            routeHash(bskyClient, location.hash);
        });
    }

    if (hash.startsWith("#")) hash = hash.substring(1);
    const baseUrl = window.location.href.split("#")[0];
    history.replaceState(null, "", baseUrl + (hash.length == 0 ? "" : "#" + hash));
}

export function routeHash(bskyClient: BskyAgent, hash: string) {
    if (hash && hash.length > 0) {
        const tokens = hash.replace("#", "").split("/");
        if (tokens.length > 0) {
            if (tokens[0] == "profile" && tokens[1]) {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "PROFILE-OVERLAY") {
                    const profileOverlay = child as ProfileOverlay;
                    if (profileOverlay.did == tokens[1]) return;
                }
                document.body.append(
                    dom(html`<profile-overlay .bskyClient=${bskyClient} .did=${tokens[1]} .pushState=${false}></profile-overlay>`)[0]
                );
            }
            if (tokens[0] == "thread" && tokens[1] && tokens[2]) {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "THREAD-OVERLAY") {
                    const threadOverlay = child as ThreadOverlay;
                    if (threadOverlay.author == tokens[1] && threadOverlay.rkey == tokens[2]) return;
                }
                document.body.append(
                    dom(
                        html`<thread-overlay .bskyClient=${bskyClient} .author=${tokens[1]} .rkey=${tokens[2]} .pushState=${false}></thread-overlay>`
                    )[0]
                );
            }
            if (tokens[0] == "notifications") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "NOTIFICATIONS-OVERLAY") {
                    const threadOverlay = child as ThreadOverlay;
                    if (threadOverlay.author == tokens[1] && threadOverlay.rkey == tokens[2]) return;
                }
                document.body.append(dom(html`<notifications-overlay .bskyClient=${bskyClient} .pushState=${false}></notifications-overlay>`)[0]);
            }
        }
    }
}
