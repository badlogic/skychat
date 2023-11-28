import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { arrowUpDoubleIcon, bellIcon, cloudIcon, editIcon, listIcon, spinnerIcon } from "../icons";
import { dom, getScrollParent } from "../utils";
import { setupPushNotifications } from "./notifications";
import { State } from "../state";

let normalStyle = "w-12 h-12 flex justify-center items-center bg-background dark:bg-divider border border-divider rounded-full fancy-shadow";
let highlightStyle = "w-12 h-12 flex justify-center items-center bg-primary rounded-full fancy-shadow";

function resetAnimation(el: HTMLElement) {
    el.style.animation = "none";
    el.offsetHeight; /* trigger reflow */
    (el.style.animation as any) = null;
}

export abstract class FloatingButton extends LitElement {
    @property()
    highlight = false;

    @property()
    highlightAnimation = "animate-wiggle-more";

    @property()
    highlightAnimationIcon = "";

    @property()
    hide = false;

    @property()
    value?: string;

    translateX = (offset: string) => "translate(calc(min(100vw,640px) " + offset + "))";

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    lastScrollTop = 0;
    scrollHandler = () => this.handleScroll();
    handleScroll() {
        if (this.highlight) {
            this.lastScrollTop = getScrollParent(this.parentElement)!.scrollTop;
            return;
        }
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

    protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        const root = this.renderRoot.children[0] as HTMLElement;
        resetAnimation(root);
    }

    render() {
        return html`<div
            class="fixed z-10 bottom-4 ${this.hide && !this.highlight
                ? "animate-fade animate-reverse disable-pointer-events"
                : "animate-fade enable-pointer-events"} animate-duration-300"
            style="transform: ${this.translateX(this.getOffset())};"
        >
            <button
                class="${this.highlight ? highlightStyle + " " + this.highlightAnimation + " animate-infinite animate-ease-in-out " : normalStyle}"
                @click=${() => this.handleClick()}
            >
                <i class="icon !w-5 !h-5 ${this.highlight ? `${this.highlightAnimationIcon} animate-infinite animate-ease-in-out fill-[#fff]` : ""}"
                    >${this.getIcon()}</i
                >
            </button>
            <div
                class="${this.highlight && this.value
                    ? ""
                    : "hidden"} absolute left-[70%] bottom-[70%] rounded-full border border-white bg-primary text-primary-fg text-xs px-1 text-center"
            >
                ${this.value}
            </div>
        </div>`;
    }

    abstract handleClick(): void;
    abstract getIcon(): TemplateResult;
    abstract getOffset(): string;
}

@customElement("up-button")
export class UpButton extends FloatingButton {
    @property()
    clicked: () => void = () => getScrollParent(this)?.scrollTo({ top: 0, behavior: "smooth" });

    @property()
    renderOnClick: (() => void)[] = [];

    constructor() {
        super();
        this.hide = true;
        this.highlightAnimation = "";
        this.highlightAnimationIcon = "animate-pulse";
        this.translateX = () => "translate(1em)";
    }

    handleClick(): void {
        if (this.renderOnClick.length > 0) {
            for (const listener of this.renderOnClick) {
                listener();
            }
            this.renderOnClick.length = 0;
            this.highlight = false;
            this.hide = true;
            return;
        }
        this.highlight = false;
        this.clicked();
    }

    getIcon(): TemplateResult {
        return html`${arrowUpDoubleIcon}`;
    }

    getOffset(): string {
        return "+ 4em";
    }

    handleScroll() {
        if (this.highlight) {
            if (getScrollParent(this.parentElement)!.scrollTop < 10 && this.renderOnClick.length == 0) {
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

@customElement("feeds-button")
export class FeedsButton extends FloatingButton {
    handleClick(): void {
        document.body.append(dom(html`<feed-picker></feed-picker>`)[0]);
    }
    getIcon(): TemplateResult {
        return html`${cloudIcon}`;
    }
    getOffset(): string {
        return "- 12em";
    }
}

@customElement("lists-button")
export class ListsButton extends FloatingButton {
    handleClick(): void {
        document.body.append(dom(html`<list-picker></list-picker>`)[0]);
    }
    getIcon(): TemplateResult {
        return html`${listIcon}`;
    }
    getOffset(): string {
        return "- 16em";
    }
}

@customElement("open-post-editor-button")
export class OpenPostEditorButton extends FloatingButton {
    @property()
    text = "";

    handleClick(): void {
        document.body.append(
            dom(html`<post-editor-overlay .text=${this.text} .sent=${(post: PostView) => this.sentPost(post)}></post-editor-overly>`)[0]
        );
    }
    getIcon(): TemplateResult {
        return html`${editIcon}`;
    }
    getOffset(): string {
        return "- 8em";
    }

    sentPost(post: PostView) {
        document.body.append(dom(html`<thread-overlay .postUri=${post.uri}></post-editor-overly>`)[0]);
    }
}

@customElement("notifications-button")
export class NotificationsButton extends FloatingButton {
    unsub: () => void = () => {};

    async handleClick() {
        document.body.append(dom(html`<notifications-stream-overlay></notifications-stream-overlay>`)[0]);
        this.highlight = false;
        // FIXME tell the user that they can have push notifications
        let response = await Notification.requestPermission();
        if (response == "granted") {
            setupPushNotifications();
        }
    }

    getOffset() {
        return "- 4em";
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
                },
            })
        );
    }
}

@customElement("pull-to-refresh")
export class PullToRefresh extends LitElement {
    private startY: number = 0;
    private isPulling: boolean = false;
    private threshold = 100;

    @property()
    onRefresh: () => void = () => {};

    @property()
    distance = 0;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        const scrollContainer = this.getScrollContainer();
        if (scrollContainer) {
            scrollContainer.addEventListener("scroll", this.handleScroll, { passive: false });
            scrollContainer.addEventListener("touchstart", this.handleTouchStart, { passive: false });
            scrollContainer.addEventListener("touchmove", this.handleTouchMove, { passive: false });
            scrollContainer.addEventListener("touchend", this.handleTouchEnd, { passive: true });
            this.isPulling = scrollContainer.scrollTop == 0;
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        const scrollContainer = this.getScrollContainer();
        if (scrollContainer) {
            scrollContainer.removeEventListener("scroll", this.handleScroll);
            scrollContainer.removeEventListener("touchstart", this.handleTouchStart);
            scrollContainer.removeEventListener("touchmove", this.handleTouchMove);
            scrollContainer.removeEventListener("touchend", this.handleTouchEnd);
        }
    }

    private getScrollContainer(): HTMLElement | null {
        return this.parentElement;
    }

    private handleScroll = (event: Event) => {
        const target = event.target as HTMLElement;
        this.isPulling = target.scrollTop < 10;
    };

    private handleTouchStart = (event: TouchEvent) => {
        if (this.isPulling) {
            this.startY = event.touches[0].clientY;
        }
    };

    private handleTouchMove = (event: TouchEvent) => {
        if (!this.isPulling) return;

        const touchY = event.touches[0].clientY;
        let rawDistance = touchY - this.startY;
        rawDistance = rawDistance / 4;
        rawDistance = Math.max(0, Math.min(rawDistance, 300));
        this.style.top = rawDistance + "px";
    };

    private handleTouchEnd = (event: TouchEvent) => {
        if (!this.isPulling) return;

        const currentDistance = event.changedTouches[0].clientY - this.startY;
        if (currentDistance > this.threshold) {
            this.onRefresh();
        }

        this.isPulling = this.getScrollContainer()?.scrollTop == 0;
        this.style.top = 0 + "px";
    };

    render() {
        return html`<div class="w-10 h-10 bg-primary text-primary-fg rounded-full flex items-center justify-center">
            <i class="icon !w-8 !h-8 animate-spin fill-[#fff]">${spinnerIcon}</i>
        </div>`;
    }
}

@customElement("loading-spinner")
export class AnimatedSpinner extends LitElement {
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
