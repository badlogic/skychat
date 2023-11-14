import { TemplateResult, html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { HashNavOverlay, renderProfile, renderTopbar } from ".";
import { i18n } from "../i18n";
import { logout } from "../bsky";
import { Store, Theme } from "../store";

@customElement("settings-overlay")
export class SettingsOverlay extends HashNavOverlay {
    getHash(): string {
        return "settings";
    }

    renderHeader(): TemplateResult {
        return html`${renderTopbar("Settings", this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        const user = Store.getUser();
        return html`<div class="px-4 flex flex-col">
            ${user
                ? html`<h2>${i18n("Logged in as")}</h2>
                      <div class="flex gap-4 mt-2">
                          ${renderProfile(user.profile)}
                          <button class="ml-auto text-primary h-8 bg-primary text-white rounded-md px-4 whitespace-nowrap" @click=${this.logout}>
                              ${i18n("Log out")}
                          </button>
                      </div>`
                : nothing}
            <h2 class="mt-4 mb-2">${i18n("Theme")}</h2>
            <select-button
                @change=${(ev: CustomEvent) => this.setTheme(ev.detail.value)}
                .values=${[i18n("Dark"), i18n("Light")]}
                .selected=${Store.getTheme() == "dark" ? "Dark" : "Light"}
            ></select-button>
        </div>`;
    }

    logout() {
        logout();
        location.href = "/";
    }

    setTheme(theme: Theme) {
        theme = i18n("Dark") == theme ? "dark" : "light";
        Store.setTheme(theme);
        if (theme == "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
    }
}

let theme = Store.getTheme();
if (theme == "dark") document.documentElement.classList.add("dark");
else document.documentElement.classList.remove("dark");
