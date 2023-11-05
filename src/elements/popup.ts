import { LitElement, TemplateResult, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { globalStyles } from "./styles";

@customElement("popup-overlay")
export class Popup extends LitElement {
    static styles = [globalStyles];

    @property()
    buttonText = "Click me";

    @property()
    show = false;

    protected render(): TemplateResult {
        return html`<div class="relative">
            <div @click=${() => (this.show = !this.show)} class="rounded bg-black text-white p-1 text-xs">${this.buttonText}</div>
            ${this.show
                ? html`<div @click=${() => (this.show = !this.show)} class="absolute bg-black text-white p-4 rounded border border-gray/50 z-[100]">
                      <slot></slot>
                  </div>`
                : nothing}
        </div> `;
    }
}
