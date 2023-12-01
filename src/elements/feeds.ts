import { BskyPreferences, RichText } from "@atproto/api";
import { FeedViewPost, GeneratorView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { repeat } from "lit-html/directives/repeat.js";
import { customElement, property } from "lit/decorators.js";
import { HashNavOverlay, renderTopbar } from ".";
import { i18n } from "../i18n";
import { heartFilledIcon, heartIcon, infoIcon, linkIcon, minusIcon, pinIcon, plusIcon, searchIcon } from "../icons";
import { FEED_CHECK_INTERVAL, State } from "../state";
import { Store } from "../store";
import { FeedPostsStream } from "../streams";
import { copyTextToClipboard, defaultFeed, dom, error, getNumber, hasLinkOrButtonParent, renderError, splitAtUri, waitForNavigation } from "../utils";
import { IconToggle } from "./icontoggle";
import { renderRichText } from "./posts";
import { getProfileUrl, renderProfileAvatar } from "./profiles";
import { toast } from "./toast";

export type GeneratorViewElementAction = "clicked" | "pinned" | "unpinned" | "saved" | "unsaved";
export type GeneratorViewElementStyle = "topbar" | "minimal" | "full";

@customElement("generator-view")
export class GeneratorViewElement extends LitElement {
    @property()
    generator?: GeneratorView;

    @property()
    viewStyle: GeneratorViewElementStyle = "full";

    @property()
    expandDetails = false;

    @property()
    editable = true;

    @property()
    defaultActions = true;

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
            ${this.editable && Store.getUser()
                ? html` ${splitAtUri(generator.uri).repo != Store.getUser()?.profile.did
                      ? html`${prefs.saved?.includes(generator.uri) || prefs.pinned?.includes(generator.uri)
                            ? html`<button @click=${() => this.removeFeed()}>
                                  <i class="icon !w-6 !h-6 fill-muted-fg">${minusIcon}</i>
                              </button>`
                            : html`<button @click=${() => this.addFeed()}>
                                  <i class="icon !w-6 !h-6 fill-primary">${plusIcon}</i>
                              </button>`}`
                      : nothing}`
                : nothing}
        </div>`;

        const header = html`<div class="flex items-center gap-2 ${this.viewStyle == "topbar" ? "flex-grow -ml-3" : ""}">
            ${generator.avatar
                ? html`<img
                      src="${generator.avatar}"
                      class="${this.viewStyle == "topbar" ? "w-8 h-8" : "w-10 h-10"} object-cover rounded-md fancy-shadow"
                  />`
                : html`<div class="fancy-shadow">
                      <i class="icon ${this.viewStyle == "topbar" ? "!w-8 !h-8" : "!w-10 !h-10"} fancy-shadow">${defaultFeed}</i>
                  </div>`}
            <div class="flex flex-col">
                <div class="font-semibold">${generator.displayName}</div>
                ${this.viewStyle != "topbar" && this.expandDetails ? createdBy : nothing}
            </div>
        </div>`;

        const details = html`${this.viewStyle == "topbar" && this.expandDetails ? createdBy : nothing}
            <div class="mt-1">${generator.description ? renderRichText(richText) : nothing}</div>
            <div class="flex gap-2 mt-1">
                <icon-toggle
                    @change=${(ev: CustomEvent) => this.toggleLike(ev)}
                    .icon=${html`<i class="icon !w-5 !h-5">${heartIcon}</i>`}
                    .iconTrue=${html`<i class="icon !w-5 !h-5">${heartFilledIcon}</i>`}
                    class="h-6"
                    .value=${generator.viewer?.like}
                    .text=${getNumber(generator.likeCount ?? 0)}
                ></icon-toggle
                ><button
                    class="flex items-center justify-center w-6 h-6"
                    @click=${() => {
                        copyTextToClipboard("https://bsky.app/profile/" + generator.creator.did + "/feed/" + splitAtUri(generator.uri).rkey);
                        toast(i18n("Copied link to clipboard"));
                    }}
                >
                    <i class="icon !w-5 !h-5 fill-muted-fg">${linkIcon}</i>
                </button>
                ${Store.getDevMode()
                    ? html`<button
                          class="text-primary font-bold"
                          @click=${() => {
                              copyTextToClipboard(generator.uri);
                              toast("Copied at-uri to clipboard");
                          }}
                      >
                          at-uri
                      </button>`
                    : nothing}
                ${Store.getDevMode()
                    ? html`<button
                          class="text-primary font-bold"
                          @click=${() => {
                              console.log(generator);
                          }}
                      >
                          JSON
                      </button>`
                    : nothing}
            </div>`;

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
                          class="absolute animate-fade-down animate-duration-300 top-[40px] left-0 w-full bg-secondary text-secondary-fg font-normal px-4 pb-2 pt-2 rounded-md fancy-shadow"
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

    removeFeed() {
        const user = Store.getUser();
        if (!user) return;
        if (!State.bskyClient) return;
        if (!this.generator) return;

        this.action("unsaved", this.generator);
        if (this.defaultActions) State.removeSavedFeed(this.generator.uri);
        this.requestUpdate();
        State.notify("feed", "updated", this.generator);
    }

    addFeed() {
        const user = Store.getUser();
        if (!user) return;
        if (!State.bskyClient) return;
        if (!this.generator) return;
        this.action("saved", this.generator);
        if (this.defaultActions) State.addSavedFeed(this.generator.uri);
        this.generator = { ...this.generator };
        State.notify("feed", "updated", this.generator);
    }
}

@customElement("feed-picker")
export class FeedPicker extends HashNavOverlay {
    @property()
    isLoading = true;

    @property()
    error?: string;

    @property()
    feeds: GeneratorView[] = [];

    @property()
    ownFeeds: GeneratorView[] = [];

    unsubscribe = () => {};

    getHash(): string {
        return "feeds";
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
        this.unsubscribe = State.subscribe("preferences", (action, payload) => {
            if (action == "updated" && !this.isOnTop()) {
                this.load(payload);
                console.log(payload);
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

            const user = Store.getUser();
            prefs = prefs ?? State.preferences;
            if (prefs) {
                this.feeds = (prefs.feeds.saved ?? [])
                    .map((feedUri) => State.getObject("feed", feedUri))
                    .filter((feed) => feed != undefined)
                    .filter((feed) => feed?.creator.did != user?.profile.did) as GeneratorView[];
            } else {
                prefs = await State.getPreferences();
                if (prefs instanceof Error) {
                    this.error = i18n("Couldn't load your feeds");
                    throw prefs;
                }
                const savedUris = (prefs.feeds.saved ?? []).filter((feed) => !feed.includes("app.bsky.graph.list"));
                const response = await State.getFeeds(savedUris);
                if (response instanceof Error) {
                    this.error = i18n("Couldn't load your feeds");
                    return;
                }
                this.feeds = response;
            }

            if (user) {
                (async () => {
                    const feeds: GeneratorView[] = [];
                    let cursor: string | undefined;
                    while (true) {
                        const response = await State.getActorGenerators(user.profile.did, cursor);
                        if (response instanceof Error) {
                            this.error = i18n("Couldn't load your feeds");
                            return;
                        }
                        if (response.items.length == 0) break;
                        feeds.push(...response.items);
                        cursor = response.cursor;
                    }
                    this.ownFeeds = feeds;
                })();
            }
        } catch (e) {
            error("Couldn't load preferences and feeds", e);
        } finally {
            this.isLoading = false;
        }
    }

    renderHeader(): TemplateResult {
        return renderTopbar("Feeds", this.closeButton());
    }

    protected update(changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.update(changedProperties);
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        return html`<div class="flex flex-col">
            <div class="flex items-center justify-center py-4">
                <button @click=${() => this.discoverFeeds()} class="btn rounded-full flex gap-2 items-center">
                    <i class="icon !w-4 !h-4 fill-current">${searchIcon}</i>
                    ${i18n("Discover more feeds")}
                </button>
            </div>
            <div class="px-4 flex items-center text-muted-fg text-muted-fg">${i18n("Saved Feeds")}</div>
            ${this.feeds.length == 0 ? html`<div class="py-4 rounded text-center">${i18n("You don't have saved feeds")}</div>` : nothing}
            ${repeat(
                this.feeds,
                (generator) => generator.uri,
                (generator) =>
                    html`<div class="px-4 py-2">
                        <generator-view
                            .generator=${generator}
                            .viewStyle=${"minimal"}
                            .action=${(action: GeneratorViewElementAction, generator: GeneratorView) => this.feedAction(action, generator)}
                            .editable=${true}
                            .defaultActions=${true}
                        ></generator-view>
                    </div>`
            )}
            ${this.ownFeeds.length > 0
                ? html`<div class="px-4 flex items-center text-muted-fg">${i18n("Feeds by me")}</div>
                      ${repeat(
                          this.ownFeeds,
                          (generator) => generator.uri,
                          (generator) =>
                              html`<div class="px-4 py-2">
                                  <generator-view
                                      .generator=${generator}
                                      .viewStyle=${"minimal"}
                                      .action=${(action: GeneratorViewElementAction, generator: GeneratorView) => this.feedAction(action, generator)}
                                      .editable=${false}
                                      .defaultActions=${false}
                                  ></generator-view>
                              </div>`
                      )}`
                : nothing}
        </div>`;
    }

    async feedAction(action: GeneratorViewElementAction, generator: GeneratorView) {
        if (action == "unsaved") {
            this.feeds = this.feeds.filter((other) => other.uri != generator.uri);
        }

        if (action == "clicked") {
            // this.close();
            // await waitForNavigation();
            document.body.append(dom(html`<feed-overlay .feedUri=${generator.uri}></feed-overlay>`)[0]);
        }
    }

    discoverFeeds() {
        const search = dom(html`<search-overlay .showTypes=${[i18n("Feeds")]}></search-overlay>`)[0];
        document.body.append(search);
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
        if (!this.generator) return renderTopbar("Feed", this.closeButton(false));
        const generator = this.generator;
        const feedName = html`<generator-view class="flex-grow" .viewStyle=${"topbar"} .generator=${generator}></generator-view>`;
        return renderTopbar(dom(feedName)[0], this.closeButton());
    }

    renderContent(): TemplateResult {
        if (this.error) return renderError(this.error);
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        return html`<feed-stream-view
                .stream=${new FeedPostsStream(this.feedUri!, true, FEED_CHECK_INTERVAL)}
                .newItems=${async (newItems: FeedViewPost[] | Error) => {
                    if (newItems instanceof Error) {
                        this.error = i18n("Could not load newer items");
                    }
                }}
            ></feed-stream-view
            >${Store.getUser()
                ? html`<open-post-editor-button id="post"></open-post-editor-button> <notifications-button id="notifications"></notifications-button>`
                : nothing}`;
    }
}
