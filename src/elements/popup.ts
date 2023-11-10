import { LitElement, TemplateResult, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { globalStyles } from "./styles";

export abstract class PopupMenu extends LitElement {
    @state()
    show = false;

    constructor() {
        super();
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    handleButtonClick() {
        this.show = !this.show;
        if (this.show) {
            document.body.classList.add("disable-pointer-events");
        } else {
            document.body.classList.remove("disable-pointer-events");
        }
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener("click", (ev) => this.handleDocumentClick(ev));
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener("click", (ev) => this.handleDocumentClick(ev));
    }

    handleDocumentClick(event: Event) {
        if (this.show && !this.contains(event.target as Node)) {
            this.show = false;
            document.body.classList.remove("disable-pointer-events");
        }
    }

    protected render(): TemplateResult {
        return html`<div class="relative">
            <div @click=${this.handleButtonClick}>${this.renderButton()}</div>
            ${this.show
                ? html`<div class="whitespace-nowrap flex flex-col bg-white dark:bg-black border border-gray rounded ${
                      this.show ? "enable-pointer-events" : "hidden"
                  } absolute right-0">
                      ${this.renderContent()}
                          </div>
                      </div>`
                : nothing}
        </div>`;
    }

    protected close(): void {
        this.show = false;
        document.body.classList.remove("disable-pointer-events");
    }
    protected abstract renderButton(): TemplateResult;
    protected abstract renderContent(): TemplateResult;
}
