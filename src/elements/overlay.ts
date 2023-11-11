import { LitElement, PropertyValueMap, TemplateResult, html } from "lit";
import { property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { pushHash } from "./routing";

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

    constructor(pushState = true) {
        super();
        this.navCallback = navigationGuard.register(() => this.close());
        this.escapeCallback = escapeGuard.register(() => this.close());
        if (pushState) history.pushState(null, "", null);
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        navigationGuard.remove(this.navCallback);
        escapeGuard.remove(this.escapeCallback);
        this.remove();
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }
}

export abstract class Overlay extends LitElement {
    readonly navCallback;
    readonly escapeCallback;
    closed = false;

    constructor(pushState = true) {
        super();
        this.navCallback = navigationGuard.register(() => this.close());
        this.escapeCallback = escapeGuard.register(() => this.close());
        if (pushState) history.pushState(null, "", null);
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        navigationGuard.remove(this.navCallback);
        escapeGuard.remove(this.escapeCallback);
        this.remove();
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<div class="fixed top-0 left-0 w-full h-full bg-white dark:bg-black overflow-auto z-10">
            <div class="mx-auto max-w-[600px] h-full flex flex-col">${this.renderHeader()} ${this.renderContent()}</div>
        </div>`;
    }

    abstract renderHeader(): TemplateResult;
    abstract renderContent(): TemplateResult;

    closeButton(): TemplateResult {
        return html`<button
            @click=${() => this.close()}
            class="ml-auto bg-primary text-white px-2 rounded disabled:bg-gray/70 disabled:text-white/70"
        >
            Close
        </button>`;
    }
}

export abstract class HashNavOverlay extends Overlay {
    @property()
    pushState = true;

    constructor() {
        super(false);
    }

    abstract getHash(): string;

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (this.pushState) history.pushState(null, "", location.href.split("#")[0]);
        pushHash(this.getHash());
        document.title = "Skychat - " + this.getHash();
    }
}

// @ts-ignore
import logoSvg from "../../html/logo.svg";

export function renderTopbar(title: string, buttons?: TemplateResult | HTMLElement) {
    return html`<div class="fixed w-[600px] max-w-[100%] top-0 flex p-2 items-center bg-white dark:bg-black z-10">
            <a class="flex items-center text-primary font-bold text-center" href="/client.html"
                ><i class="flex justify-center w-6 h-6 inline-block fill-primary">${unsafeHTML(logoSvg)}</i></a
            >
            <button class="text-primary font-bold pl-2 relative pr-2">
                <span>${title}</span>
            </button>
            ${buttons}
        </div>
        <div class="min-h-[40px] max-h-[40px]"></div>`;
}
