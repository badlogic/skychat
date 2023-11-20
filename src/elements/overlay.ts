import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
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

    getTop(): T | undefined {
        return this.callbacks[this.callbacks.length - 1];
    }
}

export type NavigationCallback = () => void;

class NavigationGuard extends BaseGuard<NavigationCallback> {
    private popStateListener;
    private inPopState = false;
    afterNextPopstate: (() => void)[] = [];
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
            const funcs = [...this.afterNextPopstate];
            this.afterNextPopstate = [];
            for (const func of funcs) {
                func();
            }
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

    @property()
    scrollUpButton = true;

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
        const overlayDom = dom(html`<div class="fixed top-0 left-0 w-full h-full bg-background overflow-auto z-10">
            <div class="mx-auto max-w-[640px] h-full flex flex-col">
                ${this.renderHeader()} ${this.renderContent()}
                ${this.scrollUpButton
                    ? html`<up-button id="up" @click=${() => getScrollParent(overlayDom)?.scrollTo({ top: 0, behavior: "smooth" })}></up-button>`
                    : nothing}
            </div>
        </div>`)[0];
        return overlayDom;
    }

    abstract renderHeader(): TemplateResult;
    abstract renderContent(): TemplateResult;

    closeButton(): TemplateResult {
        return html`<button @click=${() => this.close()} class="ml-auto -mr-2 flex items-center justify-center w-10 h-10">
            <i class="icon !w-6 !h-6 fill-primary">${closeIcon}</i>
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
import { Messages, i18n } from "../i18n";
import { closeIcon } from "../icons";
import { dom, getScrollParent } from "../utils";

export function renderTopbar(title: keyof Messages | HTMLElement, buttons?: TemplateResult | HTMLElement) {
    return html`<top-bar .heading=${title instanceof HTMLElement ? title : i18n(title)} .buttons=${buttons}> </top-bar>`;
}

@customElement("top-bar")
export class Topbar extends LitElement {
    @property()
    heading?: TemplateResult;

    @property()
    buttons?: TemplateResult;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<div
                class="fixed top-0 z-10 w-[640px] max-w-[100%] h-10 px-2 flex items-center bg-background border-b border-divider shadow-md sm:shadow-none"
            >
                <a class="w-10 h-10 flex items-center justify-center font-bold text-center" href="/"
                    ><i class="icon !w-5 !h-5 fill-primary">${unsafeHTML(logoSvg)}</i></a
                >
                <span class="text-primary font-bold">${this.heading}</span>
                ${this.buttons}
            </div>
            <div class="w-full h-10"></div>`;
    }
}
