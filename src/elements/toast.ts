import { LitElement, PropertyValueMap, TemplateResult, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { dom } from "../utils";

@customElement("toast-element")
export class Toast extends LitElement {
    @property()
    content: TemplateResult | HTMLElement | string = "";

    @property()
    timeout = 2500;

    @property()
    bottom = true;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        setTimeout(() => {
            this.remove();
        }, this.timeout);
    }

    render() {
        return html`<div class="fixed w-full ${this.bottom ? "bottom-20" : "top-0"} left-0 flex items-center justify-center z-30">
            <div
                id="box"
                class="animate-fade animate-duration-[500ms] w-full max-w-[300px] px-4 py-2 flex justify-center items-center bg-black text-white fill-white rounded-md fancy-shadow"
            >
                ${this.content}
            </div>
        </div>`;
    }
}

export function toast(content: TemplateResult | HTMLElement | string, timeout = 1500) {
    document.body.append(dom(html`<toast-element .content=${content} .timeout=${timeout}></toast-element>`)[0]);
}
