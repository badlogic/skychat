import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { arrowUpDoubleIcon, bellIcon, cloudIcon, editIcon, hashIcon, listIcon, searchIcon, settingsIcon, spinnerIcon } from "../icons";
import { defaultAvatar, dom, getScrollParent } from "../utils";
import { setupPushNotifications } from "./notifications";
import { State } from "../state";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

function resetAnimation(el: HTMLElement) {
    el.style.animation = "none";
    el.offsetHeight; /* trigger reflow */
    (el.style.animation as any) = null;
}

export abstract class FloatingButton extends LitElement {
    @property()
    highlight = false;

    @property()
    highlightAnimation = "animate-pulse";

    @property()
    highlightStyle = "w-12 h-12 flex justify-center items-center bg-primary rounded-full fancy-shadow";

    @property()
    highlightIconStyle = "fill-[#fff]";

    @property()
    hide = false;

    @property()
    value?: string;

    @property()
    inContainer = true;

    abstract getOffset(): string;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        const root = this.renderRoot.children[0] as HTMLElement;
        resetAnimation(root);
    }

    render() {
        const normalStyle =
            "w-12 h-12 flex justify-center items-center bg-background dark:bg-divider border border-divider rounded-full fancy-shadow";

        return html`<div
            class="fixed z-10 ${this.getOffset()} ${this.hide && !this.highlight
                ? "animate-fade animate-reverse disable-pointer-events"
                : "animate-fade enable-pointer-events"} animate-duration-300"
        >
            <button
                class="${this.highlight ? this.highlightStyle + " animate-infinite animate-ease-in-out " : normalStyle}"
                @click=${() => this.handleClick()}
            >
                <i
                    class="icon !w-5 !h-5 ${this.highlight
                        ? `${this.highlightAnimation} animate-infinite animate-ease-in-out ${this.highlightIconStyle}`
                        : ""}"
                    >${this.getIcon()}</i
                >
            </button>
            <div
                class="${this.highlight && this.value
                    ? ""
                    : "hidden"} pointer-events-none absolute cursor-pointer left-[70%] bottom-[70%] rounded-full border border-white bg-primary text-primary-fg text-xs px-1 text-center"
            >
                ${this.value}
            </div>
        </div>`;
    }

    abstract handleClick(): void;
    abstract getIcon(): TemplateResult;
}

@customElement("up-button")
export class UpButton extends FloatingButton {
    @property()
    clicked: () => void = () => {
        const scrollParent = getScrollParent(this);
        scrollParent?.scrollTo({ top: 0, behavior: "smooth" });
    };

    constructor() {
        super();
        this.hide = true;
        this.highlightStyle =
            "w-12 h-12 bg-background dark:bg-divider flex justify-center items-center border border-primary rounded-full fancy-shadow";
        this.highlightIconStyle = "fill-primary";
    }

    connectedCallback(): void {
        super.connectedCallback();
        const scrollParent = getScrollParent(this);
        if (scrollParent == document.documentElement) {
            window.addEventListener("scroll", this.scrollHandler);
        } else {
            getScrollParent(this)!.addEventListener("scroll", this.scrollHandler);
        }
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        getScrollParent(this)!.removeEventListener("scroll", this.scrollHandler);
    }

    handleClick(): void {
        this.highlight = false;
        this.clicked();
    }

    getIcon(): TemplateResult {
        return html`${arrowUpDoubleIcon}`;
    }

    getOffset() {
        return `${this.inContainer ? "bottom-16" : "bottom-4"} ml-4 md:bottom-4 ${this.inContainer ? "md:ml-0" : "md:-ml-16"}`;
    }

    lastScrollTop = 0;
    scrollHandler = () => this.handleScroll();
    handleScroll() {
        if (this.highlight) {
            if (getScrollParent(this.parentElement)!.scrollTop < 80) {
                this.hide = true;
                this.highlight = false;
            }
            this.lastScrollTop = getScrollParent(this.parentElement)!!.scrollTop;
            return;
        }

        if (getScrollParent(this.parentElement)!.scrollTop < 10) {
            this.hide = true;
            this.highlight = false;
            this.lastScrollTop = getScrollParent(this.parentElement)!.scrollTop;
            return;
        }

        const dir = this.lastScrollTop - getScrollParent(this.parentElement)!.scrollTop;
        if (dir != 0) {
            this.hide = dir < 0;
        }
        this.lastScrollTop = getScrollParent(this.parentElement)!.scrollTop;
    }
}

@customElement("post-editor-button")
export class PostEditorButton extends FloatingButton {
    @property()
    text = "";

    @property()
    anchor: "none" | "bar-right" | "right" = "right";

    @property()
    initialText = "";

    constructor() {
        super();
        this.highlight = true;
        this.highlightAnimation = "";
    }

    handleClick(): void {
        document.body.append(
            dom(html`<post-editor-overlay .text=${this.initialText} .sent=${(post: PostView) => this.sentPost(post)}></post-editor-overly>`)[0]
        );
    }
    getIcon(): TemplateResult {
        return html`${editIcon}`;
    }

    getOffset() {
        switch (this.anchor) {
            case "none":
                return "mt-2";
            case "bar-right":
                return "bottom-16 transform translate-x-[calc(min(100vw,640px)-64px)]";
            case "right":
                return "bottom-4 transform translate-x-[calc(min(100vw,640px)-64px)]";
        }
    }

    sentPost(post: PostView) {
        document.body.append(dom(html`<thread-overlay .postUri=${post.uri}></post-editor-overly>`)[0]);
    }
}

export abstract class BarButton extends LitElement {
    abstract getIcon(): TemplateResult;
    abstract handleClick(): void;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<button class="flex items-center justify-center w-12 h-12" @click=${() => this.handleClick()}>
            <i class="icon !w-6 !h-6">${this.getIcon()}</i>
        </button>`;
    }
}

@customElement("feeds-button")
export class FeedsButton extends BarButton {
    handleClick(): void {
        document.body.append(dom(html`<feed-picker></feed-picker>`)[0]);
    }
    getIcon(): TemplateResult {
        return html`${cloudIcon}`;
    }
}

@customElement("lists-button")
export class ListsButton extends BarButton {
    handleClick(): void {
        document.body.append(dom(html`<list-picker></list-picker>`)[0]);
    }
    getIcon(): TemplateResult {
        return html`${listIcon}`;
    }
}

@customElement("hash-button")
export class HashButton extends BarButton {
    handleClick(): void {
        document.body.append(dom(html`<hashtag-picker></hashtag-picker>`)[0]);
    }
    getIcon(): TemplateResult {
        return html`${hashIcon}`;
    }
}

@customElement("settings-button")
export class SettingsButton extends BarButton {
    getIcon(): TemplateResult {
        return html`${settingsIcon}`;
    }

    handleClick(): void {
        document.body.append(dom(html`<settings-overlay></settings-overlay>`)[0]);
    }
}

@customElement("notifications-button")
export class NotificationsButton extends BarButton {
    @property()
    highlight = false;

    @property()
    value?: string;

    unsub: () => void = () => {};

    async handleClick() {
        document.body.append(dom(html`<notifications-stream-overlay></notifications-stream-overlay>`)[0]);
        // FIXME tell the user that they can have push notifications
        let response = await Notification.requestPermission();
        if (response == "granted") {
            setupPushNotifications();
        }
    }

    getIcon(): TemplateResult {
        return html`${bellIcon}`;
    }

    connectedCallback(): void {
        super.connectedCallback();
        this.unsub = State.subscribe("unreadNotifications", (action, count) => {
            if (count > 0) {
                this.value = count.toString();
                this.highlight = true;
            } else {
                this.highlight = false;
            }
        });
        this;
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsub();
    }

    render() {
        return html`<div class="relative">
            <button
                class=" ${this.highlight
                    ? "animate-wiggle-more animate-infinite animate-ease-in-out"
                    : ""} w-12 h-12 flex justify-center items-center"
                @click=${() => this.handleClick()}
            >
                <i class="icon !w-6 !h-6 ${this.highlight ? `fill-primary` : ""}">${this.getIcon()}</i>
            </button>
            <div
                class="${this.highlight && this.value
                    ? ""
                    : "hidden"} pointer-events-none absolute cursor-pointer left-[60%] bottom-[55%] rounded-full bg-primary text-primary-fg text-xs px-1 text-center"
            >
                ${this.value}
            </div>
        </div>`;
    }
}

@customElement("button-group")
export class ButtonGroup extends LitElement {
    @property()
    values: string[] = [];

    @property()
    selected?: string;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<div class="flex h-8 fancy-shadow rounded-lg cursor-pointer">
            ${map(this.values, (value, index) => {
                let rounded = "";
                if (index == 0) rounded = "rounded-l-lg";
                if (index == this.values.length - 1) rounded = "rounded-r-lg";
                let selected = value == this.selected ? "bg-primary text-primary-fg hover:bg-primarysw-600" : "border border-divider hover:bg-muted";
                return html`<div
                    class="flex items-center justify-center px-4 text-sm ${rounded} ${selected}"
                    @click=${() => this.selectedChanged(value)}
                >
                    ${value}
                </div>`;
            })}
        </div>`;
    }

    selectedChanged(value: string) {
        this.selected = value;
        this.dispatchEvent(
            new CustomEvent("change", {
                detail: {
                    value: this.selected,
                    index: this.values.indexOf(this.selected),
                },
            })
        );
    }
}

@customElement("loading-spinner")
export class LoadingSpinner extends LitElement {
    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<div class="w-full py-4 flex items-center justify-center">
            <i class="icon !w-8 !h-8 fill-primary animate-spin">${spinnerIcon}</i>
        </div>`;
    }
}

@customElement("slide-button")
export class SlideButton extends LitElement {
    @property()
    checked = false;

    @property()
    text?: string | TemplateResult;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<label class="relative inline-flex items-center justify-center cursor-pointer">
            <input
                type="checkbox"
                class="sr-only peer outline-none"
                ?checked=${this.checked}
                @change=${(ev: Event) => this.handleChange(ev.target as HTMLInputElement)}
            />
            <div
                class="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-[#fff] after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-muted-fg peer-checked:bg-primary fancy-shadow"
            ></div>
            ${typeof this.text == "string"
                ? html`<span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">${this.text ? this.text : ""}</span>`
                : this.text}
        </label>`;
    }

    handleChange(el: HTMLInputElement) {
        this.checked = el.checked;
        this.dispatchEvent(
            new CustomEvent("changed", {
                detail: {
                    value: this.checked,
                },
            })
        );
    }
}

// @ts-ignore
import logoSvg from "../../html/logo.svg";
import { Store } from "../store.js";

@customElement("nav-buttons")
export class NavButtons extends LitElement {
    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    @property()
    hide = false;

    @property()
    minimal = false;

    lastScrollTop = 0;
    scrollHandler = () => this.handleScroll();
    handleScroll() {
        const dir = this.lastScrollTop - getScrollParent(this.parentElement)!.scrollTop;
        if (dir != 0) {
            this.hide = dir < 0;
        }
        this.lastScrollTop = getScrollParent(this.parentElement)!.scrollTop;
    }

    connectedCallback(): void {
        super.connectedCallback();
        const scrollParent = getScrollParent(this);
        if (scrollParent == document.documentElement) {
            window.addEventListener("scroll", this.scrollHandler);
        } else {
            getScrollParent(this)!.addEventListener("scroll", this.scrollHandler);
        }
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        getScrollParent(this)!.removeEventListener("scroll", this.scrollHandler);
    }

    render() {
        const animationStyle = `transition-transform  ${this.hide ? "translate-y-full md:translate-y-0" : "translate-y-0"}`;
        const baseStyle = `${animationStyle} fixed bg-topbar dark:bg-topbar-dark border-t border-divider backdrop-blur-[8px]`;
        const mobileStyle = `w-full bottom-0 max-w-[640px]`;
        const desktopStyle = `md:pl-4 md:pr-0 md:-ml-20 md:w-auto md:border-none md:top-0`;
        const user = Store.getUser();

        return html`<div class="${baseStyle} ${mobileStyle} ${desktopStyle}">
            <up-button class="absolute"></up-button>
            <post-editor-button class="absolute md:hidden" .anchor=${"bar-right"}></post-editor-button>
            <div class="flex px-4 md:px-0 justify-between md:flex-col md:justify-start md:align-center md:gap-2">
                <button
                    class="hidden md:flex items-center justify-center w-12 h-12"
                    @click=${() => document.body.append(dom(html`<profile-overlay .did=${user?.profile.did}></profile-overlay>`)[0])}
                >
                    ${user?.profile.avatar
                        ? html`<img class="w-8 max-w-[none] h-8 rounded-full fancy-shadow" src="${user.profile.avatar}" />`
                        : html`<i class="icon !w-8 !h-8">${defaultAvatar}</i>`}
                </button>
                <settings-button class="hidden md:block"></settings-button>
                <hash-button></hash-button>
                <lists-button></lists-button>
                <feeds-button></feeds-button>
                <button
                    class="flex items-center justify-center w-12 h-12"
                    @click=${() => document.body.append(dom(html`<search-overlay></search-overlay>`)[0])}
                >
                    <i class="icon !w-6 !h-6">${searchIcon}</i>
                </button>
                <notifications-button></notifications-button>
                <post-editor-button class="hidden md:block" .anchor=${"none"}></post-editor-button>
            </div>
        </div>`;
    }
}
