import { LitElement, TemplateResult, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { globalStyles } from "./styles";
import { Store } from "../store";
import { State } from "../state";

@customElement("icon-toggle")
export class IconToggle extends LitElement {
    static styles = [globalStyles];

    @property()
    value = false;

    @property()
    text = "";

    @property()
    icon?: TemplateResult;

    @property()
    iconTrue?: TemplateResult;

    unsubscribe = () => {};

    animateIcon = false;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    connectedCallback(): void {
        super.connectedCallback();
        this.unsubscribe = State.subscribe("theme", (action, payload) => this.requestUpdate());
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribe();
    }

    render() {
        const animateIcon = this.animateIcon;
        return html` <div class="h-full w-full flex items-center justify-center cursor-pointer" @click=${(ev: MouseEvent) => this.toggle(ev)}>
            ${this.value
                ? html`<div class="fill-primary ${animateIcon ? "animate-jump" : ""}">${this.iconTrue ?? this.icon}</div>`
                : html`<div class="fill-muted-fg">${this.icon}</div>`}
            ${this.text.length > 0 ? html`<span class="ml-1 ${this.value ? "text-primary" : "text-muted-fg"}">${this.text}</span>` : nothing}
        </div>`;
    }

    toggle(ev: MouseEvent) {
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        this.value = !this.value;
        const icon = this.querySelector(".icon");
        this.animateIcon = true;
        this.dispatchEvent(
            new CustomEvent("change", {
                detail: {
                    value: this.value,
                },
            })
        );
    }
}
