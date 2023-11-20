import { html, LitElement } from "lit";
import { customElement, state, property } from "lit/decorators.js";
import { globalStyles } from "./styles";
import { Store, Theme } from "../store";
import { moonIcon, sunIcon } from "../icons";
import { State } from "../state";

@customElement("theme-toggle")
export class ThemeToggle extends LitElement {
    static styles = [globalStyles];

    @state()
    theme: Theme = "dark";

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    connectedCallback(): void {
        super.connectedCallback();
        this.theme = Store.getTheme() ?? "dark";
        this.setTheme(this.theme);
    }

    setTheme(theme: Theme) {
        Store.setTheme(theme);
        if (theme == "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
    }

    toggleTheme() {
        this.theme = this.theme == "dark" ? "light" : "dark";
        this.setTheme(this.theme);
    }

    render() {
        return html`<button class="flex items-center justify-center w-full h-full primary" @click=${this.toggleTheme}>
            <i class="icon w-6 h-6">${this.theme == "dark" ? moonIcon : sunIcon}</i>
        </button>`;
    }
}
