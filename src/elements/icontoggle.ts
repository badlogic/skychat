import { LitElement, TemplateResult, html } from "lit";
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

    unsubscribe = () => {};

    connectedCallback(): void {
        super.connectedCallback();
        this.unsubscribe = State.subscribe("theme", (action, payload) => this.requestUpdate());
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribe();
    }

    render() {
        const isDark = Store.getTheme() == "dark";
        return html` <div class="h-full w-full flex items-center justify-center cursor-pointer gap-1" @click=${(ev: MouseEvent) => this.toggle(ev)}>
            <div class="${this.value ? "fill-primary animate-jump" : "fill-muted-fg"}">${this.icon}</div>
            <span class="${this.value ? "text-primary animate-jump" : "text-muted-fg"}">${this.text}</span>
        </div>`;
    }

    toggle(ev: MouseEvent) {
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        this.value = !this.value;
        this.dispatchEvent(
            new CustomEvent("change", {
                detail: {
                    value: this.value,
                },
            })
        );
    }
}
