import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { arrowUpDoubleIcon, bellIcon, cloudIcon, editIcon, spinnerIcon } from "../icons";
import { dom, getScrollParent } from "../utils";
import { setupPushNotifications } from "./notifications";
import { State } from "../state";

let normalStyle = "flex justify-center items-center w-12 h-12 bg-[#ccc] dark:bg-[#333] rounded-full";
let highlightStyle = "flex justify-center items-center w-12 h-12 bg-primary rounded-full";

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

    translateX = (offset: string) => "translate(calc(min(100vw,600px) " + offset + "))";

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
        this.hide = dir < 0;
        this.lastScrollTop = getScrollParent(this.parentElement)!.scrollTop;
    }

    connectedCallback(): void {
        super.connectedCallback();
        getScrollParent(this.parentElement)!?.addEventListener("scroll", this.scrollHandler);
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        getScrollParent(this.parentElement)!?.removeEventListener("scroll", this.scrollHandler);
    }

    protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        const root = this.renderRoot.children[0] as HTMLElement;
        resetAnimation(root);
    }

    render() {
        return html`<div
            class="fixed bottom-4 ${this.hide && !this.highlight ? "animate-fade animate-reverse" : "animate-fade"} animate-duration-300"
            style="transform: ${this.translateX(this.getOffset())};"
        >
            <button
                class="${this.highlight ? highlightStyle + " " + this.highlightAnimation + " animate-infinite animate-ease-in-out " : normalStyle}"
                @click=${() => this.handleClick()}
            >
                <i
                    class="icon w-6 h-6 ${this.highlight
                        ? `fill-white ${this.highlightAnimationIcon} animate-infinite animate-ease-in-out`
                        : "fill-gray dark:fill-white"}"
                    >${this.getIcon()}</i
                >
            </button>
            <div
                class="${this.highlight && this.value
                    ? ""
                    : "hidden"} absolute left-[70%] bottom-[70%] rounded-full border border-white dark:border-gray/50 bg-primary text-white text-xs px-1 text-center"
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
    clicked: () => void = () => {};

    constructor() {
        super();
        this.hide = true;
        this.highlightAnimation = "";
        this.highlightAnimationIcon = "animate-pulse";
        this.translateX = () => "translate(1em)";
    }

    handleClick(): void {
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
            if (getScrollParent(this.parentElement)!.scrollTop < 10) {
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
        this.hide = dir < 0;
        this.lastScrollTop = getScrollParent(this.parentElement)!.scrollTop;
    }
}

@customElement("feeds-button")
export class FeedsButton extends FloatingButton {
    handleClick(): void {
        document.body.append(dom(html`<post-editor-overlay></post-editor-overly>`)[0]);
    }
    getIcon(): TemplateResult {
        return html`${cloudIcon}`;
    }
    getOffset(): string {
        return "- 12em";
    }
}

@customElement("open-post-editor-button")
export class OpenPostEditorButton extends FloatingButton {
    handleClick(): void {
        document.body.append(dom(html`<post-editor-overlay .sent=${(post: PostView) => this.sentPost(post)}></post-editor-overly>`)[0]);
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

@customElement("select-button")
export class SelectButton extends LitElement {
    @property()
    values: string[] = [];

    @property()
    selected?: string;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<div class="flex h-8">
            ${map(this.values, (value, index) => {
                let rounded = "";
                if (index == 0) rounded = "rounded-l-lg";
                if (index == this.values.length - 1) rounded = "rounded-r-lg";
                let selected = value == this.selected ? "bg-primary text-white" : "";
                return html`<div
                    class="flex items-center justify-center px-4 border border-lightgray/50 dark:border-gray/50 text-sm ${rounded} ${selected}"
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
        return html`<div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
            <i class="icon w-8 h-8 animate-spin fill-white">${spinnerIcon}</i>
        </div>`;
    }
}
