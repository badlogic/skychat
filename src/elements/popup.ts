import { LitElement, TemplateResult, html, css, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { globalStyles } from "./styles";

export abstract class PopupMenu extends LitElement {
    @state()
    show = false;

    @query("#content")
    content?: HTMLElement;

    mouseY = 0;

    constructor() {
        super();
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    handleButtonClick(ev: MouseEvent) {
        this.show = !this.show;
        this.mouseY = ev.clientY;
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
        const checkInBounds = () => {
            if (!this.show) return;
            if (!this.content) {
                requestAnimationFrame(checkInBounds);
                return;
            }
            if (this.mouseY + this.content.clientHeight > window.innerHeight) {
                this.content.classList.add("bottom-[100%]");
            }
        };
        if (this.show) checkInBounds();

        return html`<div class="relative">
            <div @click=${this.handleButtonClick}>${this.renderButton()}</div>
            ${this.show
                ? html`<div id="content" class="whitespace-nowrap flex flex-col bg-white dark:bg-black border border-gray rounded ${
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
