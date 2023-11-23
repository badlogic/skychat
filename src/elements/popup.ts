import { LitElement, TemplateResult, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { CloseableElement } from "./overlay";
import { dom } from "../utils";

@customElement("popup-overlay")
export class PopupOverlay extends CloseableElement {
    @property()
    viewportCoords = { left: 0, top: 0 };

    @property()
    content?: TemplateResult;

    @query("#content")
    contentElement?: HTMLElement;

    render() {
        const checkInBounds = () => {
            if (!this.contentElement) {
                requestAnimationFrame(checkInBounds);
                return;
            }
            if (this.viewportCoords.top + this.contentElement.clientHeight > window.innerHeight) {
                this.contentElement.style.top = this.viewportCoords.top - this.contentElement.clientHeight + "px";
            }
            if (this.viewportCoords.left + this.contentElement.clientWidth > window.innerWidth) {
                this.contentElement.style.left = this.viewportCoords.left - this.contentElement.clientWidth + "px";
            }
        };
        checkInBounds();

        return html`<div
            class="fixed top-0 left-0 w-full h-full overflow-none z-10"
            @click=${() => {
                this.close();
            }}
        >
            <div
                id="content"
                class="absolute animate-fade animate-duration-300 whitespace-nowrap overflow-x-clip flex flex-col bg-background border border-divider rounded-md fancy-shadow"
                style="left: ${this.viewportCoords.left}px; top: ${this.viewportCoords.top}px;"
            >
                ${this.content}
            </div>
        </div>`;
    }
}

export abstract class PopupMenu extends LitElement {
    @query("#content")
    content?: HTMLElement;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    handleButtonClick(ev: MouseEvent) {
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        document.body.append(
            dom(html`<popup-overlay .viewportCoords=${{ left: ev.clientX, top: ev.clientY }} .content=${this.renderContent()}></popup-overlay>`)[0]
        );
    }

    protected render(): TemplateResult {
        return html`<div class="relative text-black dark:text-white">
            <div @click=${(ev: MouseEvent) => this.handleButtonClick(ev)} class="cursor-pointer">${this.renderButton()}</div>
        </div>`;
    }

    close(): void {
        document.body.classList.remove("disable-pointer-events");
    }
    protected abstract renderButton(): TemplateResult;
    protected abstract renderContent(): TemplateResult;
}
