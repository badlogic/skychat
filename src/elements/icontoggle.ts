import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { globalStyles } from "./styles";

import { heartIcon, imageIcon, reblogIcon, replyIcon, shieldIcon } from "../icons";
import { Store } from "../store";
import { State } from "../state";
const icons = {
    reblog: reblogIcon,
    reply: replyIcon,
    heart: heartIcon,
    image: imageIcon,
    shield: shieldIcon,
};

@customElement("icon-toggle")
export class IconToggle extends LitElement {
    static styles = [globalStyles];

    @property()
    value = false;

    @property()
    text = "";

    @property()
    icon?: string;

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
        const fill = !isDark ? "fill-gray" : "fill-white/60";
        const text = !isDark ? "text-gray" : "text-white/60";
        return html` <div class="h-full flex items-center cursor-pointer gap-1" @click=${() => this.toggle()}>
            <i class="icon w-4 h-4 ${this.value ? "fill-primary" : fill}">${icons[this.icon as "reblog" | "heart" | "shield"] ?? ""}</i
            ><span class="${this.value ? "text-primary animate-jump" : text}">${this.text}</span>
        </div>`;
    }

    toggle() {
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
