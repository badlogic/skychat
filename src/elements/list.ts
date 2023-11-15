import { LitElement, PropertyValueMap, TemplateResult, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { contentLoader, dom, onVisibleOnce } from "../utils";
import { map } from "lit/directives/map.js";
import { bskyClient } from "../bsky";
import { i18n } from "../i18n";

export type Cursor = any;

export type ItemListLoaderResult<C, T> = { cursor?: C; items: T[] } | Error;
export type ItemsListLoader<C, T> = (cursor?: C, limit?: number) => Promise<ItemListLoaderResult<C, T>>;

export abstract class ItemsList<C, T> extends LitElement {
    @property()
    public poll = false;

    @property()
    pollingInterval = 5000;

    @property()
    newItems?: (newItems: T[], allItems: T[]) => void = () => {};

    @state()
    initialItemsLoaded = false;

    @state()
    error?: string;

    @query("#items")
    itemsDom?: HTMLElement;

    cursor?: C;
    items: T[] = [];
    seenItems = new Map<string, T>();
    intervalId: any = -1;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        clearInterval(this.intervalId);
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        const loadInitial = async () => {
            try {
                const result = await this.loadItems(this.cursor);
                if (result instanceof Error) {
                    this.error = result.message;
                    return;
                }
                this.cursor = result.cursor;
                for (const item of result.items) {
                    this.seenItems.set(this.getItemKey(item), item);
                }
                this.items.push(...result.items);
            } catch (e: any) {
                this.error = e instanceof Error ? e.message : i18n("Could not load list");
            } finally {
                this.initialItemsLoaded = true;
            }
        };
        loadInitial();

        if (this.poll) {
            this.intervalId = setInterval(() => this.pollNewItems(), this.pollingInterval);
        }
    }

    insertNewItems(items: T[]) {
        if (items.length == 0 || !this.itemsDom) return;
        const insertNode = this.itemsDom.children[0];
        const itemsDom = this.itemsDom;
        if (!insertNode) {
            for (const item of items) {
                this.seenItems.set(this.getItemKey(item), item);
                itemsDom.append(dom(html`<div class="animate-fade">${this.internalRenderItem(item)}</div>`)[0]);
            }
        } else {
            items.reverse();
            for (const item of items) {
                this.seenItems.set(this.getItemKey(item), item);
                itemsDom.insertBefore(dom(html`<div class="animate-fade">${this.internalRenderItem(item)}</div>`)[0], insertNode);
            }
        }
        this.items = [...items, ...this.items];
        if (this.newItems) this.newItems(items, this.items);
    }

    polling = false;
    async pollNewItems() {
        if (this.polling) return;
        this.polling = true;
        try {
            if (!bskyClient) return;
            if (!this.initialItemsLoaded) return;
            let lastResult: ItemListLoaderResult<C, T> | undefined;
            let done = false;
            const items: T[] = [];
            let cursor = await this.getPollStartCursor();
            if (cursor instanceof Error) throw cursor;
            while (!done) {
                const result = await this.loadItems(cursor);
                if (result instanceof Error) throw cursor;
                if (result.items.length == 0) break;
                for (const item of result.items) {
                    const itemKey = this.getItemKey(item);
                    if (this.seenItems.has(itemKey)) {
                        done = true;
                        break;
                    }
                    items.push(item);
                }
                lastResult = result;
            }
            this.insertNewItems(items);
        } catch (e) {
            this.error = i18n("Could not load newer items");
            console.error(e);
        } finally {
            this.polling = false;
        }
    }

    internalRenderItem(item: T) {
        return html`<div class="px-4 py-2 border-t border-gray/20">
            ${this.renderItem(item)}
            <div></div>
        </div>`;
    }

    render() {
        if (!this.initialItemsLoaded) {
            return html`<div class="flex-grow flex flex-col">
                <div class="align-top">${contentLoader}</div>
            </div>`;
        }

        const itemsDom = dom(html`<div id="items" class="flex flex-col">
            ${map(this.items, (item) => this.internalRenderItem(item))}
            <div id="loader" class="w-full text-center p-4 animate-pulse">${contentLoader}</div>
        </div>`)[0];
        const loader = itemsDom.querySelector("#loader") as HTMLElement;
        let loading = false;
        const loadMore = async () => {
            if (loading) return;
            try {
                loading = true;
                const result = await this.loadItems(this.cursor);
                if (result instanceof Error) {
                    loader.innerText = result.message;
                    loader.classList.remove("animate-pulse");
                    return;
                }
                if (result.items.length == 0) {
                    loader.innerText = i18n("No more items");
                    loader.classList.remove("animate-pulse");
                    return;
                }

                this.cursor = result.cursor;
                this.items.push(...result.items);
                for (const item of result.items) {
                    this.seenItems.set(this.getItemKey(item), item);
                }

                loader.remove();
                for (const item of result.items) {
                    itemsDom.append(dom(this.internalRenderItem(item))[0]);
                }
                itemsDom.append(loader);
                onVisibleOnce(loader, loadMore);
            } catch (e) {
                if (!loader.isConnected) itemsDom.append(loader);
                loader.innerText = e instanceof Error ? e.message : i18n("Could not load more items");
            } finally {
                loading = false;
            }
        };
        onVisibleOnce(loader, loadMore);
        return itemsDom;
    }

    abstract loadItems(cursor?: C, limit?: number): Promise<ItemListLoaderResult<C, T>>;
    abstract getItemKey(item: T): string;
    abstract renderItem(item: T): TemplateResult;
    async getPollStartCursor(): Promise<C | undefined> {
        return undefined;
    }
}
