import { BskyPreferences, RichText } from "@atproto/api";
import { FeedViewPost, GeneratorView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { HashNavOverlay, UpButton, renderTopbar } from ".";
import { i18n } from "../i18n";
import { heartIcon, infoIcon, minusIcon, pinIcon, plusIcon, spinnerIcon } from "../icons";
import { EventAction, FEED_CHECK_INTERVAL, State } from "../state";
import { Store } from "../store";
import { defaultFeed, dom, error, getScrollParent, hasLinkOrButtonParent, splitAtUri, waitForNavigation as waitForNavigation } from "../utils";
import { IconToggle } from "./icontoggle";
import { renderRichText } from "./posts";
import { getProfileUrl, renderProfileAvatar } from "./profiles";
import { repeat } from "lit-html/directives/repeat.js";
import { FeedPostsStream } from "../streams";

export type GeneratorViewElementAction = "clicked" | "pinned" | "unpinned" | "removed" | "saved";
export type GeneratorViewElementStyle = "topbar" | "minimal" | "full";

@customElement("generator-view")
export class GeneratorViewElement extends LitElement {
    @property()
    generator?: GeneratorView;

    @property()
    modifyingFeed = false;

    @property()
    viewStyle: GeneratorViewElementStyle = "full";

    @property()
    expandDetails = false;

    @property()
    action = (action: GeneratorViewElementAction, generator: GeneratorView) => {};

    unsubscribe = () => {};

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        if (this.viewStyle == "full") this.expandDetails = true;
        this.unsubscribe = State.subscribe(
            "feed",
            (action, payload) => {
                if (action == "updated") {
                    this.generator = { ...payload };
                }
            },
            this.generator?.uri
        );
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribe();
    }

    render() {
        if (!this.generator) return html`${nothing}`;

        const generator = this.generator;
        const prefs = State.preferences?.feeds ?? {
            pinned: [],
            saved: [],
        };
        const richText = new RichText({ text: generator.description ?? "" });
        richText.detectFacetsWithoutResolution();

        const createdBy = html`<div class="flex gap-1 text-xs items-center font-normal text-muted-fg">
            <span class="whitespace-nowrap">${i18n("Created by")}</span>
            ${renderProfileAvatar(generator.creator, true)}
            <a
                class="line-clamp-1 hover:underline text-muted-fg"
                href="${getProfileUrl(generator.creator ?? "")}"
                target="_blank"
                @click=${(ev: Event) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    document.body.append(dom(html`<profile-overlay .did=${generator.creator.did}></profile-overlay>`)[0]);
                }}
                >${generator.creator.displayName ?? generator.creator.handle}</a
            >
        </div>`;

        const buttons = html`<div class="flex gap-2 ml-auto">
            ${this.viewStyle != "full"
                ? html`<icon-toggle
                      @change=${(ev: CustomEvent) => (this.expandDetails = !this.expandDetails)}
                      .icon=${html`<i class="icon !w-6 !h-6">${infoIcon}</i>`}
                      .value=${this.expandDetails}
                  ></icon-toggle>`
                : nothing}
            <icon-toggle
                @change=${(ev: CustomEvent) => this.togglePin(ev)}
                .icon=${html`<i class="icon !w-6 !h-6">${pinIcon}</i>`}
                .value=${prefs.pinned?.includes(generator.uri)}
            ></icon-toggle>
            ${this.modifyingFeed
                ? html`<button>
                      <i class="icon !w-6 !h-6 fill-primary animate-spin">${spinnerIcon}</i>
                  </button>`
                : prefs.saved?.includes(generator.uri) || prefs.pinned?.includes(generator.uri)
                ? html`<button @click=${() => this.removeFeed()}>
                      <i class="icon !w-6 !h-6 fill-muted-fg">${minusIcon}</i>
                  </button>`
                : html`<button @click=${() => this.addFeed()}>
                      <i class="icon !w-6 !h-6 !fill-primary">${plusIcon}</i>
                  </button>`}
        </div>`;

        const header = html`<div class="flex items-center gap-2 ${this.viewStyle == "topbar" ? "flex-grow" : ""}">
            ${generator.avatar
                ? html`<img src="${generator.avatar}" class="${this.viewStyle == "topbar" ? "w-8 h-8" : "w-10 h-10"} object-cover rounded-md" />`
                : html`<i class="icon !w-10 !h-10">${defaultFeed}</i>`}
            <div class="flex flex-col">
                <div class="font-bold">${generator.displayName}</div>
                ${this.viewStyle != "topbar" && this.expandDetails ? createdBy : nothing}
            </div>
        </div>`;

        const details = html`${this.viewStyle == "topbar" && this.expandDetails ? createdBy : nothing}
            <div class="mt-1">${generator.description ? renderRichText(richText) : nothing}</div>
            <icon-toggle
                @change=${(ev: CustomEvent) => this.toggleLike(ev)}
                .icon=${html`<i class="icon w-4 h-4">${heartIcon}</i>`}
                class="h-4 mt-1 mr-auto"
                .value=${generator.viewer?.like}
                .text=${generator.likeCount}
            ></icon-toggle>`;

        return html`<div
            class="flex flex-col cursor-pointer"
            @click=${(ev: Event) => {
                if (window.getSelection() && window.getSelection()?.toString().length != 0) return;
                if (hasLinkOrButtonParent(ev.target as HTMLElement)) return;
                ev.stopPropagation();
                this.action("clicked", generator);
            }}
        >
            <div class="flex items-center">${header} ${buttons}</div>
            ${this.expandDetails
                ? this.viewStyle == "topbar"
                    ? html`<div
                          class="absolute top-[39px] left-0 w-full bg-background text-black dark:text-white font-normal px-4 pb-2 pt-1 border-b border-divider shadow-md sm:shadow-none"
                      >
                          ${details}
                      </div>`
                    : details
                : nothing}
        </div>`;
    }

    async toggleLike(ev: CustomEvent) {
        const toggle = ev.target as IconToggle;
        const user = Store.getUser();
        if (!user) return;
        if (!State.bskyClient) return;
        if (!this.generator) return;
        if (!this.generator.viewer) this.generator.viewer = {};
        if (ev.detail.value) {
            const likeRecord = {
                subject: {
                    uri: this.generator.uri,
                    cid: this.generator.cid,
                },
                createdAt: new Date().toISOString(),
                $type: "app.bsky.feed.like",
            };
            const response = await State.bskyClient.com.atproto.repo.createRecord({
                record: likeRecord,
                collection: "app.bsky.feed.like",
                repo: user.profile.did,
            });
            if (!response.success) toggle.value = !toggle.value;
            this.generator.viewer.like = response.data.uri;
            this.generator.likeCount = this.generator.likeCount ? this.generator.likeCount + 1 : 1;
        } else {
            if (this.generator.viewer.like)
                await State.bskyClient.com.atproto.repo.deleteRecord({
                    collection: "app.bsky.feed.like",
                    repo: user.profile.did,
                    rkey: splitAtUri(this.generator.viewer.like).rkey,
                });
            delete this.generator.viewer.like;
            this.generator.likeCount = this.generator.likeCount ? this.generator.likeCount - 1 : 0;
        }
        State.notify("feed", "updated", this.generator);
    }

    async togglePin(ev: CustomEvent) {
        const user = Store.getUser();
        if (!user) return;
        if (!State.bskyClient) return;
        if (!this.generator) return;

        this.modifyingFeed = true;
        try {
            if (ev.detail.value) {
                await State.bskyClient.addPinnedFeed(this.generator.uri);
            } else {
                await State.bskyClient.removePinnedFeed(this.generator.uri);
            }
            await State.updatePreferences();
            this.generator = { ...this.generator };
            State.notify("feed", "updated", this.generator);
            this.action(ev.detail.value ? "pinned" : "unpinned", this.generator);
        } catch (e) {
            error("Couldn't save or remove pinned feed", e);
        } finally {
            this.modifyingFeed = false;
        }
    }

    async removeFeed() {
        const user = Store.getUser();
        if (!user) return;
        if (!State.bskyClient) return;
        if (!this.generator) return;

        this.modifyingFeed = true;
        try {
            await State.bskyClient.removeSavedFeed(this.generator.uri);
            await State.updatePreferences();
            this.generator = { ...this.generator };
            State.notify("feed", "updated", this.generator);
            this.action("removed", this.generator);
        } catch (e) {
            error("Couldn't remove saved feed", e);
        } finally {
            this.modifyingFeed = false;
        }
    }

    async addFeed() {
        const user = Store.getUser();
        if (!user) return;
        if (!State.bskyClient) return;
        if (!this.generator) return;

        this.modifyingFeed = true;
        try {
            await State.bskyClient.addSavedFeed(this.generator.uri);
            await State.updatePreferences();
            this.generator = { ...this.generator };
            State.notify("feed", "updated", this.generator);
            this.action("saved", this.generator);
        } catch (e) {
            error("Couldn't add saved feed", e);
        } finally {
            this.modifyingFeed = false;
        }
    }
}

@customElement("feed-picker")
export class FeedPicker extends HashNavOverlay {
    @property()
    isLoading = true;

    @property()
    error?: string;

    @property()
    pinned: GeneratorView[] = [];

    @property()
    saved: GeneratorView[] = [];

    unsubscribe = () => {};

    getHash(): string {
        return "feeds";
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
        this.unsubscribe = State.subscribe("preferences", (action, payload) => {
            if (action == "updated") {
                this.load(payload);
            }
        });
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribe();
    }

    async load(prefs?: BskyPreferences | Error) {
        try {
            if (prefs instanceof Error) {
                this.error = i18n("Couldn't load your feeds");
                throw prefs;
            }

            prefs = prefs ?? State.preferences;
            if (prefs) {
                this.pinned = (prefs.feeds.pinned ?? [])
                    .map((feedUri) => State.getObject("feed", feedUri))
                    .filter((feed) => feed != undefined) as GeneratorView[];
                this.saved = (prefs.feeds.saved ?? [])
                    .map((feedUri) => State.getObject("feed", feedUri))
                    .filter((feed) => feed != undefined) as GeneratorView[];
            } else {
                prefs = await State.updatePreferences();
                if (prefs instanceof Error) {
                    this.error = i18n("Couldn't load your feeds");
                    throw prefs;
                }
                const pinnedUris = prefs.feeds.pinned ?? [];
                const savedUris = (prefs.feeds.saved ?? []).filter((feed) => !pinnedUris.includes(feed));
                const promises = await Promise.all([State.getFeeds(pinnedUris), State.getFeeds(savedUris)]);
                if (promises[0] instanceof Error || promises[1] instanceof Error) {
                    this.error = i18n("Couldn't load your feeds");
                    return;
                }
                this.pinned = promises[0];
                this.saved = promises[1];
            }
        } catch (e) {
            error("Couldn't load preferences and feeds", e);
        } finally {
            this.isLoading = false;
        }
    }

    renderHeader(): TemplateResult {
        return renderTopbar("Feeds", this.closeButton(), false);
    }

    protected update(changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.update(changedProperties);
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        return html`<div class="flex flex-col">
            <button @click=${() => this.discoverFeeds()} class="btn self-right mt-4 mx-auto">${i18n("Discover more feeds")}</button>
            <div class="px-4 h-12 flex items-center font-bold">${i18n("Pinned Feeds")}</div>
            <div class="flex flex-col">
                ${repeat(
                    this.pinned,
                    (generator) => generator.uri,
                    (generator) =>
                        html`<div class="px-4 py-2 border-b border-divider">
                            <generator-view
                                .generator=${generator}
                                .viewStyle=${"minimal"}
                                .action=${(action: GeneratorViewElementAction, generator: GeneratorView) => this.feedAction(action, generator)}
                            ></generator-view>
                        </div>`
                )}
            </div>
            <div class="px-4 h-12 flex items-center font-bold">${i18n("Saved Feeds")}</div>
            ${repeat(
                this.saved,
                (generator) => generator.uri,
                (generator) =>
                    html`<div class="px-4 py-2 border-b border-divider">
                        <generator-view
                            .generator=${generator}
                            .viewStyle=${"minimal"}
                            .action=${(action: GeneratorViewElementAction, generator: GeneratorView) => this.feedAction(action, generator)}
                        ></generator-view>
                    </div>`
            )}
        </div>`;
    }

    async feedAction(action: GeneratorViewElementAction, generator: GeneratorView) {
        if (action == "clicked") {
            this.close();
            console.log(location.hash);
            await waitForNavigation();
            console.log(location.hash);
            document.body.append(dom(html`<feed-overlay .feedUri=${generator.uri}></feed-overlay>`)[0]);
        }
    }

    discoverFeeds() {
        document.body.append(dom(html`<search-overlay .showTypes=${[i18n("Feeds")]}></search-overlay>`)[0]);
    }
}

@customElement("feed-overlay") //
export class FeedOverlay extends HashNavOverlay {
    @property()
    feedUri?: string;

    @property()
    generator?: GeneratorView;

    @property()
    isLoading = true;

    @property()
    error?: string;

    getHash(): string {
        if (!this.feedUri) return "feed/unknown";
        const atUri = splitAtUri(this.feedUri);
        return "feed/" + atUri.repo + "/" + atUri.rkey;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    async load() {
        try {
            if (!this.feedUri) throw new Error();
            if (State.preferences && State.getObject("feed", this.feedUri)) {
                this.generator = State.getObject("feed", this.feedUri);
            } else {
                const generator = await State.getFeeds([this.feedUri]);
                if (generator instanceof Error) throw generator;
                this.generator = generator[0];
            }
        } catch (e) {
            error("Could not load feed" + this.feedUri, e);
            this.error = i18n("Could not load feed");
        } finally {
            this.isLoading = false;
        }
    }

    renderHeader(): TemplateResult {
        if (!this.generator) return renderTopbar("Feed", this.closeButton(false), false);
        const generator = this.generator;
        const feedName = html`<generator-view class="flex-grow" .viewStyle=${"topbar"} .generator=${generator}></generator-view>`;
        return renderTopbar(dom(feedName)[0], this.closeButton(), false);
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        return html`<feed-stream-view
                .stream=${new FeedPostsStream(this.feedUri!, true, FEED_CHECK_INTERVAL)}
                .newItems=${async (newItems: FeedViewPost[]) => {
                    const result = await State.loadFeedViewPostsDependencies(newItems);
                    if (result instanceof Error) {
                        this.error = i18n("Could not load newer items");
                    }
                    const scrollParent = getScrollParent(this);
                    if (scrollParent && scrollParent.scrollTop > 0) {
                        const upButton = scrollParent.querySelector("up-button") as UpButton;
                        if (upButton) {
                            upButton.classList.remove("hidden");
                            upButton.highlight = true;
                        }
                    }
                }}
            ></feed-stream-view
            ><open-post-editor-button id="post"></open-post-editor-button> <notifications-button id="notifications"></notifications-button>`;
    }
}
