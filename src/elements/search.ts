import { TemplateResult, html, nothing } from "lit";
import { ButtonGroup, Overlay, renderTopbar } from ".";
import { customElement, property, query } from "lit/decorators.js";
import { spinnerIcon } from "../icons";
import { i18n } from "../i18n";
import { dom } from "../utils";
import { PostSearchStream, UserSearchStream as UserSearchStream } from "../streams";

@customElement("search-overlay")
export class SearchOverlay extends Overlay {
    @query("#search")
    searchElement?: HTMLInputElement;

    @query("#type")
    typeElement?: ButtonGroup;

    @query("#results")
    resultsElement?: HTMLDivElement;

    @query("#spinnerino")
    spinnerElement?: HTMLElement;

    @property()
    error = "";

    renderHeader(): TemplateResult {
        return html`${renderTopbar("Search", this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        return html`<div class="flex flex-col mt-2">
            <div class="fixed bg-background border-b border-divider top-[40px] w-full px-4 py-4 max-w-[640px] flex flex-col">
                <input @input=${() => this.handleSearch()} id="search" class="search" placeholder="${i18n("Search for users, posts, feeds ...")}" />
                <button-group
                    id="type"
                    @change=${() => this.handleSearch()}
                    class="self-center mt-2"
                    .values=${[i18n("Users"), i18n("Posts"), i18n("Feeds")]}
                    .selected=${i18n("Users")}
                ></button-group>
                <div id="spinnerino" class="hidden w-full h-12 flex items-center justify-center mt-2">
                    <i class="absolute ml-2 icon !w-6 !h-6 fill-primary animate-spin">${spinnerIcon}</i>
                </div>
                ${this.error ? html`<div id="error" class="align-top p-4">${this.error}</div>` : nothing}
            </div>
            <div id="results" class="flex flex-col gap-2 mt-[114px]"></div>
        </div>`;
    }

    timeoutId = 0;
    handleSearch() {
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(async () => {
            this.resultsElement!.innerHTML = "";
            if (this.searchElement!.value.trim().length == 0) return;
            this.spinnerElement?.classList.remove("hidden");
            await this.search(this.searchElement!.value, this.typeElement!.selected);
            this.spinnerElement?.classList.add("hidden");
        }, 200) as any as number;
    }

    async search(query: string, type?: string) {
        if (!type) type = i18n("Posts");
        if (type == i18n("Users"))
            this.resultsElement!.append(dom(html`<profiles-stream-view .stream=${new UserSearchStream(query)}></profiles-streams-view>`)[0]);
        else if (type == i18n("Posts")) {
            this.resultsElement!.append(dom(html`<posts-stream-view .stream=${new PostSearchStream(query, false)}></posts-streams-view>`)[0]);
        } else {
        }
    }
}
