import { PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { ButtonGroup, GeneratorViewElementAction, HashNavOverlay, Overlay, renderTopbar } from ".";
import { customElement, property, query, state } from "lit/decorators.js";
import { atIcon, closeIcon, searchIcon, spinnerIcon } from "../icons";
import { i18n } from "../i18n";
import { defaultAvatar, dom, renderError, splitAtUri } from "../utils";
import { FeedSearchStream, FeedSuggestionStream, PostSearchStream, UserSearchStream as UserSearchStream, UserSuggestionStream } from "../streams";
import { GeneratorView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { Store } from "../store";
import { State } from "../state";
import { map } from "lit/directives/map.js";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs.js";

@customElement("search-overlay")
export class SearchOverlay extends HashNavOverlay {
    @property()
    showTypes = Store.getDevMode() ? [i18n("Users"), i18n("Posts"), i18n("Feeds"), "at-uris"] : [i18n("Users"), i18n("Posts"), i18n("Feeds")];

    @query("#search")
    searchElement?: HTMLInputElement;

    @query("#self")
    selfElement?: HTMLInputElement;

    @query("#type")
    typeElement?: ButtonGroup;

    @query("#results")
    resultsElement?: HTMLDivElement;

    @query("#spinnerino")
    spinnerElement?: HTMLElement;

    @property()
    error = "";

    @property()
    selectedType?: string;

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
        this.searchElement?.focus();
    }

    renderContent(): TemplateResult {
        return html`<div class="flex flex-col">
            <div class="bg-background top-[40px] w-full px-4 pt-4 pb-2 max-w-[640px] flex flex-col">
                <div class="search flex items-center gap-2 fancy-shadow">
                    <i class="icon !w-5 !h-5 fill-muted-fg">${searchIcon}</i>
                    <input
                        @input=${() => this.handleSearch()}
                        id="search"
                        class="flex-grow bg-transparent"
                        placeholder="${i18n("E.g. names, keywords, ...")}"
                        autocomplete="off"
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
                          @change=${(ev: Event) => {
                              this.handleSearch();
                              this.selectedType = (ev.target as ButtonGroup).selected!;
                          }}
                          class="self-center mt-4"
                          .values=${this.showTypes}
                          .selected=${this.showTypes.includes(i18n("Feeds")) ? i18n("Feeds") : this.showTypes[0]}
                      ></button-group>`
                    : nothing}
                ${this.selectedType == i18n("Posts") && Store.getUser()
                    ? html`<slide-button
                          id="self"
                          class="self-center mt-4"
                          .text=${i18n("Search my posts")}
                          @change=${() => this.handleSearch()}
                      ></slide-button>`
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
            await this.search(
                this.searchElement!.value,
                this.showTypes.length == 1 ? this.showTypes[0] : this.typeElement!.selected,
                this.selfElement?.checked ?? false
            );
            this.spinnerElement?.classList.add("hidden");
        }, 200) as any as number;
    }

    async search(query: string, type?: string, self?: boolean) {
        query = query.trim();
        if (!type) type = i18n("Posts");
        if (!self) self = false;
        if (type == i18n("Users")) {
            if (query.length == 0)
                this.resultsElement!.append(
                    dom(html`<div class="px-4 h-8 align-top flex items-center font-semibold">${i18n("Suggested follows")}</div>`)[0]
                );
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
            if (self) query = "from:" + Store.getUser()?.profile.handle + " " + query;
            this.resultsElement!.append(dom(html`<posts-stream-view .stream=${new PostSearchStream(query, false)}></posts-streams-view>`)[0]);
        } else if (type == i18n("Feeds")) {
            if (query.length == 0)
                this.resultsElement!.append(
                    dom(html`<div class="px-4 h-8 align-top flex items-center font-semibold">${i18n("Suggested feeds")}</div>`)[0]
                );
            this.resultsElement!.append(
                dom(
                    html`<generators-stream-view
                        .minimal=${false}
                        .stream=${query.length == 0 ? new FeedSuggestionStream() : new FeedSearchStream(query)}
                        .action=${(action: GeneratorViewElementAction, generator: GeneratorView) => this.feedAction(action, generator)}
                    ></generators-stream-view>`
                )[0]
            );
        } else if (type == "at-uris") {
            query = query.trim();
            if (query.length == 0) return;
            const atUri = splitAtUri(query);
            if (atUri.type == "app.bsky.feed.post") {
                (async () => {
                    const result = await State.getPosts([query]);
                    if (result instanceof Error) {
                        this.resultsElement!.append(dom(renderError(result.message))[0]);
                        console.error(result);
                        return;
                    }
                    const post = result[0];
                    this.resultsElement!.append(dom(html`<post-view class="p-4" .post=${post}></post-view>`)[0]);
                })();
            } else if (atUri.type == "app.bsky.feed.generator") {
                (async () => {
                    const result = await State.getGenerator(query);
                    if (result instanceof Error) {
                        this.resultsElement!.append(dom(renderError(result.message))[0]);
                        console.error(result);
                        return;
                    }
                    this.resultsElement!.append(dom(html`<generator-view class="p-4" .generator=${result}></generator-view>`)[0]);
                })();
            } else if (atUri.type == "app.bsky.graph.list") {
                (async () => {
                    const result = await State.getList(query);
                    if (result instanceof Error) {
                        this.resultsElement!.append(dom(renderError(result.message))[0]);
                        console.error(result);
                        return;
                    }
                    this.resultsElement!.append(dom(html`<list-view class="p-4" .list=${result}></list-view>`)[0]);
                })();
            } else if (atUri.repo.startsWith("did:")) {
                (async () => {
                    const result = await State.getProfiles([query]);
                    if (result instanceof Error) {
                        this.resultsElement!.append(dom(renderError(result.message))[0]);
                        console.error(result);
                        return;
                    }
                    this.resultsElement!.append(dom(html`<profile-view class="p-4" .profile=${result[0]}></profile-view>`)[0]);
                })();
            } else {
                this.resultsElement!.append(dom(renderError("Unknown at-uri type: " + query))[0]);
            }
        }
    }

    feedAction(action: GeneratorViewElementAction, generator: GeneratorView) {
        if (action == "clicked") {
            document.body.append(dom(html`<feed-overlay .feedUri=${generator.uri}></feed-overlay>`)[0]);
        }
    }
}

@customElement("actor-search-overlay")
export class ActorSearchOverlay extends Overlay {
    @query("#search")
    searchElement?: HTMLInputElement;

    @state()
    searchResult: ProfileView[] = [];

    @property()
    selectedActor = (actor: ProfileView) => {};

    @property()
    cancled = () => {};

    @property()
    filter = (actor: ProfileView) => {
        return true;
    };

    callCancel = true;

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.searchElement?.focus();
    }

    renderHeader(): TemplateResult {
        return html`<div class="sticky top-2 search bg-background flex items-center gap-2 fancy-shadow mt-2 mx-4">
            <i class="icon !w-5 !h-5 fill-muted-fg">${atIcon}</i>
            <input
                @input=${() => this.handleSearch()}
                id="search"
                class="flex-grow bg-transparent"
                placeholder="${i18n("Search for") + i18n("Users") + " ..."}"
                autocomplete="off"
            />
            <button
                @click=${() => {
                    this.close();
                }}
            >
                <i class="icon !w-5 !h-5 fill-muted-fg hover:fill-primary">${closeIcon}</i>
            </button>
        </div>`;
    }

    close() {
        super.close();
        if (this.callCancel) this.cancled();
    }

    renderContent(): TemplateResult {
        return html`<div class="px-4 mt-2 w-full flex flex-col bg-background rounded">
            ${map(
                this.searchResult,
                (actor) => html` <button
                    @click=${() => {
                        this.selectedActor(actor);
                        this.callCancel = false;
                        this.close();
                    }}
                    class="flex items-center gap-2 p-2 hover:border hover:border-primary hover:rounded-md"
                >
                    ${actor.avatar
                        ? html`<img class="w-6 h-6 rounded-full" src="${actor.avatar}" />`
                        : html`<i class="icon !w-6 !h-6">${defaultAvatar}</i>`}
                    <span class="truncate">${actor.displayName ?? actor.handle}</span>
                    <span class="ml-auto text-muted-fg text-sm line-clamp-1">${actor.displayName ? actor.handle : ""}</span>
                </button>`
            )}
        </div>`;
    }

    async handleSearch() {
        if (this.searchElement!.value.trim().length == 0) {
            this.searchResult = [];
            return;
        }
        const response = await State.bskyClient?.app.bsky.actor.searchActorsTypeahead({
            limit: 25,
            q: this.searchElement!.value,
        });
        if (!response?.success) {
            this.searchResult = [];
        } else {
            this.searchResult = response.data.actors.filter(this.filter);
        }
    }
}
