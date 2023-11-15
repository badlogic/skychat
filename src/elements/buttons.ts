import { LitElement, PropertyValueMap, TemplateResult, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { dom, sleep } from "../utils";
import { arrowUpDoubleIcon, arrowUpIcon, bellIcon, cloudIcon, editIcon, searchIcon } from "../icons";
import { bskyClient } from "../bsky";
import { setupPushNotifications } from "./notifications";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { PostEditor, PostEditorOverlay, navigationGuard } from ".";
import { map } from "lit/directives/map.js";

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
    hide = false;

    @property()
    value?: string;

    translateX = (offset: string) => "translate(calc(min(100vw,600px) " + offset + "))";

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    getScrollParent() {
        let parent = this.parentElement;
        while (parent) {
            if (parent.classList.contains("overflow-auto")) return parent;
            parent = parent.parentElement;
        }
        return null;
    }

    lastScrollTop = 0;
    scrollHandler = () => this.handleScroll();
    handleScroll() {
        if (this.highlight) {
            this.lastScrollTop = this.getScrollParent()!.scrollTop;
            return;
        }
        const dir = this.lastScrollTop - this.getScrollParent()!.scrollTop;
        this.hide = dir < 0;
        this.lastScrollTop = this.getScrollParent()!.scrollTop;
    }

    connectedCallback(): void {
        super.connectedCallback();
        this.getScrollParent()?.addEventListener("scroll", this.scrollHandler);
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.getScrollParent()?.removeEventListener("scroll", this.scrollHandler);
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
                class="${this.highlight ? highlightStyle + " animate-wiggle-more animate-infinite animate-ease-in-out " : normalStyle}"
                @click=${() => this.handleClick()}
            >
                <i class="icon w-6 h-6 ${this.highlight ? "fill-white" : "fill-gray dark:fill-white"}">${this.getIcon()}</i>
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
        this.translateX = () => "translate(16px)";
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
            if (this.getScrollParent()!.scrollTop < 10) {
                this.hide = true;
                this.highlight = false;
            }
            this.lastScrollTop = this.getScrollParent()!.scrollTop;
            return;
        }

        if (this.getScrollParent()!.scrollTop < 10) {
            this.hide = true;
            this.highlight = false;
            this.lastScrollTop = this.getScrollParent()!.scrollTop;
            return;
        }

        const dir = this.lastScrollTop - this.getScrollParent()!.scrollTop;
        this.hide = dir < 0;
        this.lastScrollTop = this.getScrollParent()!.scrollTop;
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
    async handleClick() {
        document.body.append(dom(html`<notifications-overlay></notifications-overlay>`)[0]);
        this.highlight = false;
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

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        const checkNotifications = async () => {
            try {
                if (!bskyClient?.session) return;
                const response = await bskyClient?.countUnreadNotifications();
                if (!response || !response.success) {
                    return;
                }
                if (response.data?.count > 0) {
                    this.value = response.data.count.toString();
                    this.highlight = true;
                } else {
                    this.highlight = false;
                }
            } finally {
                setTimeout(checkNotifications, 5000);
            }
        };
        checkNotifications();
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
        return html`<div class="flex w-full h-8">
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
