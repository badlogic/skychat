import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs.js";
import { LitElement, PropertyValueMap, html } from "lit";
import { repeat } from "lit-html/directives/repeat.js";
import { customElement, state } from "lit/decorators.js";
import { StreamPage } from "../streams.js";
import { onVisibleOnce } from "../utils.js";
export { LitVirtualizer } from "@lit-labs/virtualizer";

@customElement("virtualizer-test")
export class VirtualizerTest extends LitElement {
    @state()
    isLoading = true;

    pages: StreamPage<FeedViewPost>[] = [];
    pageIndex = 0;

    items: FeedViewPost[] = [];

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    async load() {
        const response = await fetch("data/feed.json");
        if (!response.ok) {
            alert("Couldn't load feed");
            return;
        }
        this.pages = (await response.json()) as StreamPage<FeedViewPost>[];
        this.isLoading = false;
    }

    observing = false;
    protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        const virtualizer = this.querySelector("lit-virtualizer");
        if (virtualizer && !this.observing) {
            this.observing = true;
            this.restore();
            virtualizer.addEventListener("visibilityChanged", (ev) => {
                localStorage.setItem("virtualizer", JSON.stringify({ firstVisible: ev.first, lastPage: this.pageIndex }));
                if (ev.last == this.items.length - 1) {
                    const spinner = this.querySelector("loading-spinner");
                    spinner?.classList.remove("hidden");
                    this.appendPage();
                }
            });
        }
    }

    appendPage() {
        if (this.pageIndex == this.pages.length) {
            alert("No more pages");
            return;
        }
        const page = this.pages[this.pageIndex++];
        this.items = [...this.items, ...page.items];
        const virtualizer = this.querySelector("lit-virtualizer")!;
        virtualizer.items = this.items;
    }

    async prependPage() {
        if (this.pageIndex == this.pages.length) {
            alert("No more pages");
            return;
        }
        const page = this.pages[this.pageIndex++];
        this.items = [...page.items, ...this.items];
        const virtualizer = this.querySelector("lit-virtualizer")!;
        virtualizer.items = this.items;
    }

    scrollToTop() {
        const virtualizer = this.querySelector("lit-virtualizer")!;
        virtualizer.element(0)?.scrollIntoView({ behavior: "instant", block: "start" });
    }

    clear() {
        const virtualizer = this.querySelector("lit-virtualizer")!;
        virtualizer.items = this.items = [];
        this.pageIndex = 0;
        this.requestUpdate();
    }

    async restore() {
        const virtualizer = this.querySelector("lit-virtualizer")!;
        const json = localStorage.getItem("virtualizer");
        if (!json) return;
        const restore: { firstVisible: number; lastPage: number } = JSON.parse(json);
        this.items = [];
        for (let i = 0; i < restore.lastPage; i++) {
            this.items.push(...this.pages[i].items);
        }
        this.pageIndex = restore.lastPage;
        virtualizer.items = this.items;
        await virtualizer.layoutComplete;
        virtualizer.element(restore.firstVisible)?.scrollIntoView({ behavior: "instant", block: "start" });
    }

    render() {
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        const json = localStorage.getItem("virtualizer");
        let pin = undefined;
        if (json) {
            const restore: { firstVisible: number; lastPage: number } = JSON.parse(json);
            this.items = [];
            for (let i = 0; i < restore.lastPage; i++) {
                this.items.push(...this.pages[i].items);
            }
            this.pageIndex = restore.lastPage;
            pin = {
                pin: {
                    index: restore.firstVisible,
                    block: "start",
                },
            };
        }

        const renderItem = (item: FeedViewPost) => html`<feed-view-post-view class="w-full" .feedViewPost=${item}></feed-view-post-view>`;
        const feed = pin
            ? html`<lit-virtualizer class="w-full h-full" .items=${this.items} .renderItem=${renderItem} .layout=${pin}></lit-virtualizer>`
            : html`<lit-virtualizer class="w-full h-full" .items=${this.items} .renderItem=${renderItem}></lit-virtualizer>`;
        const content = html`<div class="relative">
            <div class="flex flex-col">${feed}</div>
            <loading-spinner class="hidden"></loading-spinner>
        </div>`;

        return html`<div class="w-full h-full flex flex-col">
            <div class="self-center w-full max-w-[640px]">${undefined}</div>
            <div class="h-[40px]"></div>
            <div class="mx-auto w-full max-w-[640px] min-h-full flex flex-col">${content}</div>
            <div class="fixed top-0, right-0 flex flex-col gap-4">
                <button class="btn" @click=${() => this.prependPage()}>Prepend page</button>
                <button class="btn" @click=${() => this.appendPage()}>Append page</button>
                <button class="btn" @click=${() => this.scrollToTop()}>Scroll top</button>
                <button class="btn" @click=${() => this.clear()}>Clear</button>
            </div>
            <up-button></up-button>
        </div> `;
        // return html`${repeat(this.items, (item) => )}`;
    }
}
