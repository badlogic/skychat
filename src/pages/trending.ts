import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { AppBskyRichtextFacet, RichText } from "@atproto/api";
import { FirehosePost, startEventStream } from "../firehose";
// @ts-ignore
import logoSvg from "../../html/logo.svg";
import { map } from "lit/directives/map.js";

type HashTag = {
    name: string;
    count: number;
    lastDate: Date;
};

@customElement("skychat-trending")
class Trending extends LitElement {
    tagLookup = new Map<string, HashTag>();
    tags: HashTag[] = [];

    extractTags(post: FirehosePost) {
        const rt = new RichText({ text: post.text });
        rt.detectFacetsWithoutResolution();
        const foundTags = new Set<string>();
        if (rt.facets) {
            for (const facet of rt.facets) {
                for (const feature of facet.features) {
                    if (AppBskyRichtextFacet.isTag(feature)) {
                        foundTags.add(feature.tag);
                    }
                }
            }
        }

        for (const tag of foundTags) {
            let hashTag = this.tagLookup.get(tag);
            if (!hashTag) {
                hashTag = { name: tag, count: 0, lastDate: new Date(post.createdAt) };
                this.tagLookup.set(tag, hashTag);
                this.tags.push(hashTag);
            }
            hashTag.count++;
        }
        this.tags.sort((a, b) => {
            if (a.count !== b.count) {
                return b.count - a.count;
            } else {
                return b.lastDate.getTime() - a.lastDate.getTime();
            }
        });
        this.requestUpdate();
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    connectedCallback(): void {
        super.connectedCallback();
        const ingestTags = () => {
            startEventStream(
                (post) => this.extractTags(post),
                () => ingestTags()
            );
            console.log("Started tag ingestion");
        };
        ingestTags();
    }

    render() {
        return html`<main class="flex flex-col justify-between m-auto max-w-[728px] px-4 h-full leading-5">
            <theme-toggle></theme-toggle>
            <a class="text-2xl flex align-center justify-center text-primary font-bold text-center my-8" href="/"
                ><i class="w-[32px] h-[32px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
            >
            <div class="flex-grow flex flex-col gap-3">
                <h1 class="text-center text-xl text-primary font-bold">What's trending</h1>
                <div class="text-center">
                    Below you'll see hashtags sorted by the number of posts they are contained in since you opened this page. Updates in real-time.
                    The longer you leave this page open, the more representative the statistics get.
                </div>
                ${map(
                    this.tags.slice(0, 100),
                    (tag) =>
                        html`<a class="text-center text-primary" target="_blank" href="/?hashtag=${encodeURIComponent(tag.name)}"
                            ><span>${tag.name}</span> (${tag.count})</a
                        >`
                )}
            </div>

            <div class="text-center text-xs italic my-4 pb-4">
                <a class="text-primary" href="https://skychat.social" target="_blank">Skychat</a>
                is lovingly made by
                <a class="text-primary" href="https://bsky.app/profile/badlogic.bsky.social" target="_blank">Mario Zechner</a><br />
                No data is collected, not even your IP address.<br />
                <a class="text-primary" href="https://github.com/badlogic/skychat" target="_blank">Source code</a>
            </div>
        </main>`;
    }
}
