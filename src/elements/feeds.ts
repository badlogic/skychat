import { AppBskyActorDefs, RichText } from "@atproto/api";
import { GeneratorView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { State } from "../state";
import { defaultFeed, dom, error, splitAtUri } from "../utils";
import { renderRichText } from "./posts";
import { getProfileUrl, renderProfileAvatar } from "./profiles";
import { i18n } from "../i18n";
import { IconToggle } from "./icontoggle";
import { Store } from "../store";
import { addIcon, heartIcon, minusIcon, pinIcon, plusIcon, spinnerIcon } from "../icons";

@customElement("generator-view")
export class GeneratorViewElement extends LitElement {
    @property()
    generator?: GeneratorView;

    @property()
    modifyingFeed = false;

    unsubscribe = () => {};

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.unsubscribe = State.subscribe(
            "feed",
            (action, payload) => {
                if (action == "updated") {
                    this.generator = { ...payload };
                }
            },
            this.generator?.did
        );
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribe();
    }

    render() {
        if (!this.generator) return html`${nothing}`;

        const generator = this.generator;
        const createdBy = html`<div class="flex gap-1 text-xs items-center text-muted-fg">
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

        const richText = new RichText({ text: generator.description ?? "" });
        richText.detectFacetsWithoutResolution();

        const prefs = State.preferences?.feeds ?? {
            pinned: [],
            saved: [],
        };

        return html`<div class="flex flex-col">
            <div class="flex items-center gap-2">
                ${generator.avatar
                    ? html`<img src="${generator.avatar}" class="w-10 h-10 object-cover rounded-md" />`
                    : html`<i class="icon !w-10 !h-10">${defaultFeed}</i>`}
                <div class="flex flex-col">
                    <div class="font-bold">${generator.displayName}</div>
                    ${createdBy}
                </div>
                <div class="flex gap-2 ml-auto">
                    <icon-toggle
                        @change=${(ev: CustomEvent) => this.togglePin(ev)}
                        .icon=${html`<i class="icon !w-6 !h-6">${pinIcon}</i>`}
                        .value=${prefs.pinned?.includes(generator.uri)}
                    ></icon-toggle>
                    ${this.modifyingFeed
                        ? html`<button class="rounded-full bg-muted text-muted-fg">
                              <i class="icon !w-6 !h-6 fill-muted-fg animate-spin">${spinnerIcon}</i>
                          </button>`
                        : prefs.saved?.includes(generator.uri) || prefs.pinned?.includes(generator.uri)
                        ? html`<button @click=${() => this.removeFeed()} class="rounded-full bg-muted text-muted-fg">
                              <i class="icon !w-6 !h-6 fill-muted-fg">${minusIcon}</i>
                          </button>`
                        : html`<button @click=${() => this.addFeed()} class="bg-primary rounded-full">
                              <i class="icon !w-6 !h-6 fill-white">${plusIcon}</i>
                          </button>`}
                </div>
            </div>
            <div class="mt-1">${generator.description ? renderRichText(richText) : nothing}</div>
            <icon-toggle
                @change=${(ev: CustomEvent) => this.toggleLike(ev)}
                .icon=${html`<i class="icon w-4 h-4">${heartIcon}</i>`}
                class="h-4 mt-1"
                .value=${generator.viewer?.like}
                .text=${generator.likeCount}
            ></icon-toggle>
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
        } catch (e) {
            error("Couldn't add saved feed", e);
        } finally {
            this.modifyingFeed = false;
        }
    }
}
