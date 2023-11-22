import { LitElement, PropertyValueMap, TemplateResult, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { repeat } from "lit-html/directives/repeat.js";
import { HashNavOverlay, Overlay } from "./overlay";

type Item = { id: number; title: string; price: number };

type ListItemAction = "remove";

@customElement("list-item")
export class ListItem extends LitElement {
    @property()
    item?: Item;

    @property()
    action = (action: ListItemAction, item: Item) => {};

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        if (!this.item) return html`<div>Not loaded</div>`;

        return html`<div @click=${() => this.action("remove", this.item!)} class="flex flex-col border-b border-divisor px-4 py-2">
            <span>${this.item.title}</span>
            <span>${this.item.price}</span>
        </div>`;
    }
}

export abstract class AbstractListTest extends HashNavOverlay {
    @property()
    items?: Item[];

    constructor() {
        super();
        this.scrollUpButton = true;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    async load() {
        const response = await fetch("https://dummyjson.com/products");
        if (!response.ok) this.items = [];
        const json = await response.json();
        this.items = json.products as Item[];
    }
}

@customElement("list-test")
export class ListTest extends AbstractListTest {
    getHash(): string {
        return "items";
    }

    renderHeader(): TemplateResult {
        return html`<div class="mb-12 text-red-500 font-semibold">TEST</div>`;
    }

    renderContent(): TemplateResult {
        if (!this.items) return html`<div>Loading</div>`;

        return html`<div class="flex flex-col">
            ${repeat(
                this.items,
                (item) => item.id,
                (item) =>
                    html`<list-item
                        .item=${item}
                        .action=${(action: ListItemAction, item: Item) => (this.items = this.items?.filter((other) => other.id != item.id))}
                    ></list-item>`
            )}
        </div>`;
    }
}
