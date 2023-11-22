import { PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { ButtonGroup, GeneratorViewElementAction, HashNavOverlay, Overlay, renderTopbar } from ".";
import { customElement, property, query } from "lit/decorators.js";
import { closeIcon, searchIcon, spinnerIcon } from "../icons";
import { i18n } from "../i18n";
import { dom } from "../utils";
import { FeedSearchStream, FeedSuggestionStream, PostSearchStream, UserSearchStream as UserSearchStream, UserSuggestionStream } from "../streams";
import { GeneratorView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";

@customElement("search-overlay")
export class SearchOverlay extends HashNavOverlay {
    @property()
    showTypes = [i18n("Users"), i18n("Posts"), i18n("Feeds")];

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

    getHash(): string {
        return "search";
    }

    renderHeader(): TemplateResult {
        return html`${renderTopbar(
            dom(html`<span class="font-semibold">${i18n("Search") + (this.showTypes.length == 1 ? " " + this.showTypes[0] : "")}</span>`)[0],
            this.closeButton()
        )}`;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.search("", this.showTypes.length == 1 ? this.showTypes[0] : this.typeElement!.selected);
    }

    renderContent(): TemplateResult {
        return html`<div class="flex flex-col">
            <div class="bg-background border-b border-divider top-[40px] w-full px-4 py-4 max-w-[640px] flex flex-col">
                <div class="search flex items-center gap-2">
                    <i class="icon !w-5 !h-5 fill-muted-fg">${searchIcon}</i>
                    <input
                        @input=${() => this.handleSearch()}
                        id="search"
                        class="flex-grow"
                        placeholder="${i18n("Search for") + this.showTypes.join(", ") + " ..."}"
                    />
                    <button
                        @click=${() => {
                            this.searchElement!.value = "";
                            this.handleSearch();
                        }}
                    >
                        <i class="icon !w-5 !h-5 fill-muted-fg hover:fill-primary">${closeIcon}</i>
                    </button>
                </div>
                ${this.showTypes.length > 1
                    ? html`<button-group
                          id="type"
                          @change=${() => this.handleSearch()}
                          class="self-center mt-4"
                          .values=${this.showTypes}
                          .selected=${this.showTypes.includes(i18n("Feeds")) ? i18n("Feeds") : this.showTypes[0]}
                      ></button-group>`
                    : nothing}
                <div id="spinnerino" class="hidden w-full h-12 flex items-center justify-center mt-2">
                    <i class="absolute ml-2 icon !w-6 !h-6 fill-primary animate-spin">${spinnerIcon}</i>
                </div>
                ${this.error ? html`<div id="error" class="align-top p-4">${this.error}</div>` : nothing}
            </div>
            <div id="results" class="flex flex-col"></div>
        </div>`;
    }

    timeoutId = 0;
    handleSearch() {
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(async () => {
            this.resultsElement!.innerHTML = "";
            this.spinnerElement?.classList.remove("hidden");
            await this.search(this.searchElement!.value, this.showTypes.length == 1 ? this.showTypes[0] : this.typeElement!.selected);
            this.spinnerElement?.classList.add("hidden");
        }, 200) as any as number;
    }

    async search(query: string, type?: string) {
        query = query.trim();
        if (!type) type = i18n("Posts");
        if (type == i18n("Users")) {
            if (query.length == 0)
                this.resultsElement!.append(dom(html`<div class="px-4 h-12 flex items-center font-semibold">${i18n("Suggested follows")}</div>`)[0]);
            this.resultsElement!.append(
                dom(
                    html`<profiles-stream-view .stream=${
                        query.length == 0 ? new UserSuggestionStream() : new UserSearchStream(query)
                    }></profiles-streams-view>`
                )[0]
            );
        } else if (type == i18n("Posts")) {
            if (query.length == 0) {
                this.resultsElement!.append(
                    dom(
                        html`<div class="px-4 h-12 flex items-center justify-center font-semibold">
                            ${i18n("Enter search terms above to find posts")}
                        </div>`
                    )[0]
                );
                return;
            }
            this.resultsElement!.append(dom(html`<posts-stream-view .stream=${new PostSearchStream(query, false)}></posts-streams-view>`)[0]);
        } else if (type == i18n("Feeds")) {
            if (query.length == 0)
                this.resultsElement!.append(dom(html`<div class="px-4 h-12 flex items-center font-semibold">${i18n("Suggested feeds")}</div>`)[0]);
            this.resultsElement!.append(
                dom(
                    html`<generators-stream-view
                        .minimal=${false}
                        .stream=${query.length == 0 ? new FeedSuggestionStream() : new FeedSearchStream(query)}
                        .action=${(action: GeneratorViewElementAction, generator: GeneratorView) => this.feedAction(action, generator)}
                    ></generators-stream-view>`
                )[0]
            );
        }
    }

    feedAction(action: GeneratorViewElementAction, generator: GeneratorView) {
        if (action == "clicked") {
            document.body.append(dom(html`<feed-overlay .feedUri=${generator.uri}></feed-overlay>`)[0]);
        }
    }
}
