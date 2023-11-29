import { BskyPreferences, RichText } from "@atproto/api";
import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { ListView } from "@atproto/api/dist/client/types/app/bsky/graph/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { HashNavOverlay, renderTopbar } from ".";
import { i18n } from "../i18n";
import { blockIcon, infoIcon, linkIcon, listIcon, minusIcon, muteIcon, pinIcon, plusIcon, shieldIcon } from "../icons";
import { FEED_CHECK_INTERVAL, State } from "../state";
import { Store } from "../store";
import { ListFeedPostsStream } from "../streams";
import { copyTextToClipboard, defaultFeed, dom, error, hasLinkOrButtonParent, splitAtUri } from "../utils";
import { renderRichText } from "./posts";
import { getProfileUrl, renderProfileAvatar } from "./profiles";
import { toast } from "./toast";

export type ListViewElementAction = "clicked" | "pinned" | "unpinned" | "saved" | "unsaved";
export type ListViewElementStyle = "topbar" | "minimal" | "full";

@customElement("list-view")
export class ListViewElement extends LitElement {
    @property()
    list?: ListView;

    @property()
    viewStyle: ListViewElementStyle = "full";

    @property()
    expandDetails = false;

    @property()
    editable = true;

    @property()
    defaultActions = true;

    @property()
    action = (action: ListViewElementAction, list: ListView) => {};

    unsubscribe = () => {};

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        if (this.viewStyle == "full") this.expandDetails = true;
        this.unsubscribe = State.subscribe(
            "list",
            (action, payload) => {
                if (action == "updated") {
                    this.list = { ...payload };
                }
            },
            this.list?.uri
        );
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribe();
    }

    render() {
        if (!this.list) return html`${nothing}`;

        const list = this.list;
        const prefs = State.preferences?.feeds ?? {
            pinned: [],
            saved: [],
        };
        const muteAndBlockLists = State.muteAndBlockLists;
        const richText = new RichText({ text: list.description ?? "" });
        richText.detectFacetsWithoutResolution();

        const createdBy = html`<div class="flex gap-1 text-xs items-center font-normal text-muted-fg">
            <span class="whitespace-nowrap">${i18n("Created by")}</span>
            ${renderProfileAvatar(list.creator, true)}
            <a
                class="line-clamp-1 hover:underline text-muted-fg"
                href="${getProfileUrl(list.creator ?? "")}"
                target="_blank"
                @click=${(ev: Event) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    document.body.append(dom(html`<profile-overlay .did=${list.creator.did}></profile-overlay>`)[0]);
                }}
                >${list.creator.displayName ?? list.creator.handle}</a
            >
        </div>`;

        // FIXME need to display mod list toggles according to settings
        const editButtons =
            list.purpose == "app.bsky.graph.defs#curatelist"
                ? html` <div class="flex gap-2">
                      <icon-toggle
                          @change=${(ev: CustomEvent) => this.togglePin(ev)}
                          .icon=${html`<i class="icon !w-5 !h-5">${pinIcon}</i>`}
                          .value=${prefs.pinned?.includes(list.uri)}
                      ></icon-toggle>
                      ${prefs.saved?.includes(list.uri) || prefs.pinned?.includes(list.uri)
                          ? html`<button @click=${() => this.removeList()}>
                                <i class="icon !w-6 !h-6 fill-muted-fg">${minusIcon}</i>
                            </button>`
                          : html`<button @click=${() => this.addList()}>
                                <i class="icon !w-6 !h-6 fill-primary">${plusIcon}</i>
                            </button>`}
                  </div>`
                : html`<div class="flex gap-2">
                      <icon-toggle
                          @change=${(ev: CustomEvent) => this.toggleMute(ev)}
                          .icon=${html`<i class="icon !w-5 !h-5">${muteIcon}</i>`}
                          .value=${muteAndBlockLists.muteListUris.has(this.list.uri)}
                          class="w-6 h-6"
                      ></icon-toggle>
                      <icon-toggle
                          @change=${(ev: CustomEvent) => this.toggleBlock(ev)}
                          .icon=${html`<i class="icon !w-5 !h-5">${blockIcon}</i>`}
                          .value=${muteAndBlockLists.blockListUris.has(this.list.uri)}
                          class="w-6 h-6"
                      ></icon-toggle>
                  </div>`;

        const buttons = html`<div class="flex gap-2 ml-auto">
            ${this.viewStyle != "full"
                ? html`<icon-toggle
                      @change=${(ev: CustomEvent) => (this.expandDetails = !this.expandDetails)}
                      .icon=${html`<i class="icon !w-6 !h-6">${infoIcon}</i>`}
                      .value=${this.expandDetails}
                  ></icon-toggle>`
                : nothing}
            ${this.editable ? editButtons : nothing}
        </div>`;

        const header = html`<div class="flex items-center gap-2 ${this.viewStyle == "topbar" ? "flex-grow -ml-3" : ""}">
            ${list.avatar
                ? html`<img
                      src="${list.avatar}"
                      class="${this.viewStyle == "topbar" ? "w-8 h-8" : "w-10 h-10"} object-cover rounded-md fancy-shadow"
                  />`
                : html`<div class="fancy-shadow">
                      <i class="icon ${this.viewStyle == "topbar" ? "!w-8 !h-8" : "!w-10 !h-10"} fancy-shadow">${defaultFeed}</i>
                  </div>`}
            <div class="flex flex-col">
                <div class="font-semibold">${list.name}</div>
                ${this.viewStyle != "topbar" && this.expandDetails ? createdBy : nothing}
            </div>
        </div>`;

        const details = html`${this.viewStyle == "topbar" && this.expandDetails ? createdBy : nothing}
            <div class="mt-1 flex flex-col">
                <div class="flex items-center">
                    <div class="self-start p-1 text-xs rounded bg-muted text-muted-fg flex items-center gap-1">
                        ${this.list.purpose == "app.bsky.graph.defs#curatelist"
                            ? html`<i class="icon !w-4 !h-4 fill-muted-fg">${listIcon}</i>${i18n("Curation list")}`
                            : html`<i class="icon !w-4 !h-4 fill-muted-fg">${shieldIcon}</i>${i18n("Moderation list")}`}
                    </div>
                    <button
                        class="flex items-center justify-center w-10 h-4"
                        @click=${() => {
                            copyTextToClipboard("https://bsky.app/profile/" + list.creator.did + "/lists/" + splitAtUri(list.uri).rkey);
                            toast(i18n("Copied link to clipboard"));
                        }}
                    >
                        <i class="icon !w-5 !h-5 fill-muted-fg">${linkIcon}</i>
                    </button>
                </div>
                ${list.description ? renderRichText(richText) : nothing}
            </div>`;

        return html`<div
            class="flex flex-col cursor-pointer"
            @click=${(ev: Event) => {
                if (window.getSelection() && window.getSelection()?.toString().length != 0) return;
                if (hasLinkOrButtonParent(ev.target as HTMLElement)) return;
                ev.stopPropagation();
                this.action("clicked", list);
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

    toggleBlock(ev: CustomEvent) {
        if (!this.list) return;
        if (ev.detail.value) {
            State.subscribeBlockList(this.list);
        } else {
            State.unsubscribeBlockList(this.list);
        }
    }

    toggleMute(ev: CustomEvent) {
        if (!this.list) return;
        if (ev.detail.value) {
            State.subscribeMuteList(this.list);
        } else {
            State.unsubscribeMuteList(this.list);
        }
    }

    togglePin(ev: CustomEvent) {
        if (!this.list) return;

        if (this.defaultActions) {
            if (ev.detail.value) {
                State.addPinnedList(this.list.uri);
            } else {
                State.removePinnedList(this.list.uri);
            }
        }

        this.requestUpdate();
        State.notify("list", "updated", this.list);
        this.action(ev.detail.value ? "pinned" : "unpinned", this.list);
    }

    removeList() {
        if (!this.list) return;
        if (this.defaultActions) State.removeSavedList(this.list.uri);
        this.requestUpdate();
        State.notify("list", "updated", this.list);
        this.action("unsaved", this.list);
    }

    addList() {
        if (!this.list) return;
        if (this.defaultActions) State.addSavedList(this.list.uri);
        this.list = { ...this.list };
        State.notify("list", "updated", this.list);
        this.action("saved", this.list);
    }
}

@customElement("list-overlay")
export class ListOverlay extends HashNavOverlay {
    @property()
    listUri?: string;

    @property()
    list?: ListView;

    @property()
    isLoading = true;

    @property()
    error?: string;

    getHash(): string {
        if (!this.listUri) return "list/unknown";
        const atUri = splitAtUri(this.listUri);
        return "list/" + atUri.repo + "/" + atUri.rkey;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    async load() {
        try {
            if (!this.listUri) throw new Error();
            if (State.getObject("list", this.listUri)) {
                this.list = State.getObject("list", this.listUri);
            } else {
                const list = await State.getList(this.listUri);
                if (list instanceof Error) throw list;
                this.list = list;
            }
        } catch (e) {
            error("Could not load list feed" + this.listUri, e);
            this.error = i18n("Could not load list feed");
        } finally {
            this.isLoading = false;
        }
    }

    renderHeader(): TemplateResult {
        if (!this.list) return renderTopbar("List", this.closeButton(false), false);
        const list = this.list;
        const listName = html`<list-view class="flex-grow" .viewStyle=${"topbar"} .list=${list}></list-view>`;
        return renderTopbar(dom(listName)[0], this.closeButton(), false);
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        return html`<feed-stream-view
                .stream=${new ListFeedPostsStream(this.listUri!, true, FEED_CHECK_INTERVAL)}
                .newItems=${async (newItems: FeedViewPost[] | Error) => {
                    if (newItems instanceof Error) {
                        this.error = i18n("Could not load newer items");
                    }
                }}
            ></feed-stream-view
            ><open-post-editor-button id="post"></open-post-editor-button> <notifications-button id="notifications"></notifications-button>`;
    }
}
