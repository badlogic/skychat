import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { globalStyles } from "./styles";

import { heartIcon, imageIcon, reblogIcon, replyIcon, shieldIcon } from "../icons";
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
    icon?: string;

    render() {
        return html` <div
            class="h-full flex items-center cursor-pointer gap-1 ${this.value
                ? "text-primary dark:text-primary animate-jump"
                : "text-gray dark:text-white/50"}"
            @click=${this.toggle}
        >
            <i class="icon w-5 h-5 ${this.value ? "fill-primary dark:fill-primary" : "fill-gray"}"
                >${icons[this.icon as "reblog" | "heart" | "shield"] ?? ""}</i
            ><slot></slot>
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
