// @ts-ignore
import sunIconSvg from "remixicon/icons/Weather/sun-line.svg";
// @ts-ignore
import moonIconSvg from "remixicon/icons/Weather/moon-line.svg";
import { html, LitElement } from "lit";
import { customElement, state, property } from "lit/decorators.js";
import { globalStyles } from "./styles";
import { icon } from "../icons";

@customElement("theme-toggle")
export class ThemeToggle extends LitElement {
    static styles = [globalStyles];

    @state()
    theme = "dark";

    @property()
    absolute = true;

    connectedCallback(): void {
        super.connectedCallback();
        this.theme = localStorage.getItem("theme") ?? "dark";
        this.setTheme(this.theme);
    }

    setTheme(theme: string) {
        localStorage.setItem("theme", theme);
        if (theme == "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
    }

    toggleTheme() {
        this.theme = this.theme == "dark" ? "light" : "dark";
        this.setTheme(this.theme);
    }

    render() {
        const moonIcon = icon(moonIconSvg);
        const sunIcon = icon(sunIconSvg);

        return html`<button
            class="${this.absolute == true ? "absolute top-0 right-0 p-4 fill-primary" : "flex items-center p4 fill-primary"}"
            @click=${this.toggleTheme}
        >
            ${this.theme == "dark" ? moonIcon : sunIcon}
        </button>`;
    }
}
