import {
  LitElement,
  PropertyValueMap,
  TemplateResult,
  html,
  nothing,
  svg,
} from "lit";
import { map } from "lit-html/directives/map.js";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { customElement, query, state } from "lit/decorators.js";
import { globalStyles } from "./styles";
import {
  BskyAuthor,
  BskyPost,
  BskyRecord,
  getAccount,
  getFollowers,
  getPosts,
  processText,
} from "./bsky";
// @ts-ignore
import logoSvg from "./logo.svg";
import {
  contentLoader,
  dom,
  generateDates,
  generateHours,
  generateWeekdays,
  getTimeDifferenceString,
  getYearMonthDate,
  renderCard,
  renderGallery,
  replaceSpecialChars,
} from "./utils";
import { Chart, registerables } from "chart.js";
import {
  WordCloudChart,
  WordCloudController,
  WordElement,
} from "chartjs-chart-wordcloud";
import { removeStopwords, eng, deu, fra } from "stopword";
import { subscribeRepos } from "./firehose";

subscribeRepos(
  (message) => {
    console.log("Message");
  },
  () => {
    console.log("Closed");
  }
);

type Interaction = { count: number; did: string; account?: BskyAuthor };

type Word = { count: number; text: string };

interface Stats {
  account: BskyAuthor;
  posts: BskyPost[];
  postsPerDate: Record<string, BskyPost[]>;
  postsPerTimeOfDay: Record<string, BskyPost[]>;
  postsPerWeekday: Record<string, BskyPost[]>;
  interactedWith: Interaction[];
  words: Word[];
}

const numDays = 30;

@customElement("skychat-app")
class App extends LitElement {
  static styles = [globalStyles];

  @state()
  error?: string;

  @state()
  stats?: Stats;

  @state()
  loading = false;

  @query("#account")
  accountElement?: HTMLInputElement;

  account: string | null;

  constructor() {
    super();
    this.account = new URL(location.href).searchParams.get("account");
  }

  firstUpdate = true;
  protected willUpdate(
    _changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>
  ): void {
    if (this.firstUpdate) {
      if (this.account) this.load();
      this.firstUpdate = false;
    }
  }

  protected createRenderRoot(): Element | ShadowRoot {
    return this;
  }

  async load() {
    this.loading = true;
    let account = (this.account ?? "").trim().replace("@", "");
    if (account.length == 0) {
      this.error = "No account given";
      return;
    }
    if (!account.includes(".")) {
      account += ".bsky.social";
    }

    const author = await getAccount(account);
    if (author instanceof Error) {
      this.error = author.message;
      return;
    }

    const followers = await getFollowers(account);
    if (followers instanceof Error) {
      this.error = followers.message;
      return;
    }

    const posts = await getPosts(author, numDays);
    if (posts instanceof Error) {
      this.error = posts.message;
      return;
    }

    const postsPerDate: Record<string, BskyPost[]> = {};
    const postsPerTimeOfDay: Record<string, BskyPost[]> = {};
    const postsPerWeekday: Record<string, BskyPost[]> = {};
    const interactedWith: Record<string, Interaction> = {};
    const words: Record<string, Word> = {};
    const weekdays = generateWeekdays();
    const stopWords = [...eng, ...deu, ...fra];
    for (const post of posts) {
      const date = getYearMonthDate(post.record.createdAt);
      let array = postsPerDate[date];
      if (!array) {
        array = [];
        postsPerDate[date] = array;
      }
      array.push(post);

      const hour = new Date(post.record.createdAt).getHours();
      const hourKey = (hour < 10 ? "0" : "") + hour + ":00";
      array = postsPerTimeOfDay[hourKey];
      if (!array) {
        array = [];
        postsPerTimeOfDay[hourKey] = array;
      }
      array.push(post);

      const day = weekdays[new Date(post.record.createdAt).getDay()];
      array = postsPerWeekday[day];
      if (!array) {
        array = [];
        postsPerWeekday[day] = array;
      }
      array.push(post);

      const replyUri = post.record.reply?.parent?.uri;
      if (replyUri) {
        const did = replyUri.replace("at://", "").split("/")[0];
        if (author.did == did) continue;
        let interaction = interactedWith[did];
        if (!interaction) {
          interaction = {
            count: 0,
            did: did,
            account: undefined,
          };
          interactedWith[did] = interaction;
        }
        interaction.count++;
      }

      const tokens = removeStopwords(
        replaceSpecialChars(post.record.text)
          .split(" ")
          .filter(
            (token) =>
              !(
                token.startsWith("http") ||
                token.includes("/") ||
                token.includes("bsky.social")
              )
          )
          .map((token) =>
            token.endsWith(".") ? token.substring(0, token.length - 1) : token
          )
          .map((token) => token.toLowerCase()),
        stopWords
      );

      for (let token of tokens) {
        token = token.toLowerCase().trim();
        if (token.length < 2) continue;
        if (/^\d+$/.test(token)) continue;
        if (token.startsWith("@")) continue;
        let word = words[token];
        if (!word) {
          word = {
            count: 0,
            text: token,
          };
          words[token] = word;
        }
        word.count++;
      }
    }

    const interactions: Interaction[] = [];
    for (const interaction of Object.values(interactedWith)) {
      interactions.push(interaction);
    }
    interactions.sort((a, b) => b.count - a.count);
    for (let i = 0; i < Math.min(10, interactions.length); i++) {
      const account = await getAccount(interactions[i].did);
      if (account instanceof Error) continue;
      interactions[i].account = account;
    }
    this.stats = {
      account: author,
      posts,
      postsPerDate,
      postsPerTimeOfDay,
      postsPerWeekday,
      interactedWith: interactions,
      words: Object.values(words).sort((a, b) => b.count - a.count),
    };
    this.loading = false;
  }

  render() {
    let content: TemplateResult | HTMLElement = html``;
    if (this.error) {
      content = html`<div
        class="border border-gray bg-gray text-white p-4 rounded text-center"
      >
        Error: ${this.error}
      </div>`;
    } else if (this.loading) {
      content = html` <p class="text-center">
          Fetching 30 days statistics for ${this.account}
        </p>
        <p class="text-center">This could take a little while</p>
        <div class="align-top">${contentLoader}</div>`;
    } else if (this.stats) {
      content = this.renderStats(this.stats);
    } else {
      content = html` <p class="text-center">
          Analytics for your BlueSky account
        </p>
        <div class="flex mt-4">
          <input
            id="account"
            class="flex-1 bg-none border-l border-t border-b border-gray/75 outline-none rounded-l text-black px-2 py-2"
            placeholder="Account, e.g. badlogic.bsky.social"
          />
          <button
            class="align-center rounded-r bg-primary text-white px-4"
            @click=${this.viewAccount}
          >
            View
          </button>
        </div>`;
    }

    return html` <main
      class="flex flex-col justify-between m-auto max-w-[728px] px-4 h-full leading-5"
    >
      <a
        class="text-2xl flex align-center justify-center text-primary font-bold text-center my-8"
        href="/"
        ><i class="w-[32px] h-[32px] inline-block fill-primary"
          >${unsafeHTML(logoSvg)}</i
        ><span class="ml-2">Skychat</span></a
      >
      <div class="flex-grow flex flex-col">${content}</div>
      <div class="text-center text-xs italic my-4 pb-4">
        <a class="text-primary" href="https://skychat.social" target="_blank"
          >Skychat</a
        >
        is lovingly made by
        <a
          class="text-primary"
          href="https://bsky.app/profile/badlogic.bsky.social"
          target="_blank"
          >Mario Zechner</a
        ><br />
        No data is collected, not even your IP address.<br />
        <a
          class="text-primary"
          href="https://github.com/badlogic/skychat"
          target="_blank"
          >Source code</a
        >
      </div>
    </main>`;
  }

  viewAccount() {
    if (!this.accountElement) return;
    const newUrl = new URL(location.href);
    newUrl.searchParams.set("account", this.accountElement?.value);
    location.href = newUrl.href;
  }

  renderStats(stats: Stats) {
    Chart.register(...registerables);
    Chart.register(WordCloudController, WordElement);

    let likes = 0;
    let reposts = 0;
    for (const post of stats.posts) {
      likes += post.likeCount;
      reposts += post.repostCount;
    }

    const author = stats.account;
    const topRepliedTo = [...stats.interactedWith].filter(
      (interaction) => interaction.account
    );
    const topReposted = [...stats.posts]
      .sort((a, b) => b.repostCount - a.repostCount)
      .slice(0, 5);
    const topLiked = [...stats.posts]
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, 5);
    const statsDom = dom(html`<div>
      <div class="flex flex-col items-center">
        <a
          class="text-center"
          href="https://bsky.app/profile/${author.handle ?? author.did}"
          target="_blank"
        >
          ${author.avatar
            ? html`<img
                class="w-[6em] h-[6em] rounded-full"
                src="${author.avatar}"
              />`
            : this.defaultAvatar}
        </a>
        <a
          class="text-center"
          href="https://bsky.app/profile/${author.handle ?? author.did}"
          target="_blank"
        >
          <span class="text-primary text-xl"
            >${author.displayName ?? author.handle}</span
          >
        </a>
      </div>
      <div class="mx-auto font-bold text-xl text-center">30 days activity</div>
      <div class="text-center text-lg flex flex-col">
        <span>${stats.posts.length} posts</span>
        <span>${reposts} reposts</span>
        <span>${likes} likes</span>
      </div>
      <div class="font-bold text-xl underline mt-8 mb-4">
        Replied the most to
      </div>
      ${map(
        topRepliedTo,
        (interaction) => html`<div class="flex items-center gap-2 mb-2">
          <a
            class="flex items-center gap-2"
            href="?account=${interaction.account!.handle ??
            interaction.account!.did}"
            target="_blank"
          >
            ${interaction.account!.avatar
              ? html`<img
                  class="w-[2em] h-[2em] rounded-full"
                  src="${interaction.account!.avatar}"
                />`
              : this.defaultAvatar}
            <span class="text-primary"
              >${interaction.account!.displayName ??
              interaction.account!.handle}</span
            >
          </a>
          <span class="text-lg">${interaction.count} times</span>
        </div> `
      )}
      <div class="font-bold text-xl underline mt-8 mb-4">Word cloud</div>
      <canvas
        id="wordCloud"
        class="mt-4 h-[500px] max-h-[500px]"
        height="500"
      ></canvas>
      <div class="font-bold text-xl underline mt-8">Posts per day</div>
      <canvas id="postsPerDay" class="mt-4"></canvas>
      <div class="font-bold text-xl underline mt-8">Posts per time of day</div>
      <canvas id="postsPerTimeOfDay" class="mt-4"></canvas>
      <div class="font-bold text-xl underline mt-8">Posts per weekday</div>
      <canvas id="postsPerWeekday" class="mt-4"></canvas>
      <div class="font-bold text-xl underline mt-8">Top 5 reposted posts</div>
      <div>${map(topReposted, (post) => this.postPartial(post))}</div>
      <div class="font-bold text-xl underline mt-8">Top 5 liked posts</div>
      <div>${map(topLiked, (post) => this.postPartial(post))}</div>
    </div>`)[0];

    const chartOptions = {
      scales: {
        x: {
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          grid: { display: false },
        },
      },
      plugins: {
        legend: {
          display: false, // Hide the legend box and all labels
        },
      },
    };

    const wordCloudCanvas = statsDom.querySelector(
      "#wordCloud"
    ) as HTMLCanvasElement;
    const words = stats.words.map((word) => word.text).slice(0, 100);
    const maxCount = stats.words.reduce((prevWord, word) =>
      prevWord.count < word.count ? word : prevWord
    ).count;
    const wordFrequencies = stats.words
      .map((word) => 10 + (word.count / maxCount) * 72)
      .slice(0, 100);
    let ctx = wordCloudCanvas.getContext("2d");
    if (ctx) {
      new Chart(ctx, {
        type: WordCloudController.id,
        data: {
          labels: words,
          datasets: [
            {
              data: wordFrequencies,
            },
          ],
        },
        options: {
          plugins: {
            legend: {
              display: false, // Hide the legend box and all labels
            },
          },
        },
      });
    }

    const postsPerDayCanvas = statsDom.querySelector(
      "#postsPerDay"
    ) as HTMLCanvasElement;
    const dates = generateDates(numDays);
    const postsPerDay = dates.map((date) =>
      stats.postsPerDate[date] ? stats.postsPerDate[date].length : 0
    );
    ctx = postsPerDayCanvas.getContext("2d");
    if (ctx) {
      new Chart(ctx, {
        type: "bar",
        data: {
          labels: dates,
          datasets: [
            {
              data: postsPerDay,
              backgroundColor: "rgba(75, 192, 192, 0.2)",
              borderColor: "rgba(75, 192, 192, 1)",
              borderWidth: 1,
            },
          ],
        },
        options: chartOptions,
      });
    }

    const postsPerTimeOfDayCanvas = statsDom.querySelector(
      "#postsPerTimeOfDay"
    ) as HTMLCanvasElement;
    const hours = generateHours();
    const postsPerTimeOfDay = hours.map((hour) =>
      stats.postsPerTimeOfDay[hour] ? stats.postsPerTimeOfDay[hour].length : 0
    );
    ctx = postsPerTimeOfDayCanvas.getContext("2d");
    if (ctx) {
      new Chart(ctx, {
        type: "bar",
        data: {
          labels: hours,
          datasets: [
            {
              data: postsPerTimeOfDay,
              backgroundColor: "rgba(75, 192, 192, 0.2)",
              borderColor: "rgba(75, 192, 192, 1)",
              borderWidth: 1,
            },
          ],
        },
        options: chartOptions,
      });
    }

    const postsPerWeekdayCanvas = statsDom.querySelector(
      "#postsPerWeekday"
    ) as HTMLCanvasElement;
    const days = generateWeekdays();
    const postsPerWeekday = days.map((day) =>
      stats.postsPerWeekday[day] ? stats.postsPerWeekday[day].length : 0
    );
    ctx = postsPerWeekdayCanvas.getContext("2d");
    if (ctx) {
      new Chart(ctx, {
        type: "bar",
        data: {
          labels: days,
          datasets: [
            {
              data: postsPerWeekday,
              backgroundColor: "rgba(75, 192, 192, 0.2)",
              borderColor: "rgba(75, 192, 192, 1)",
              borderWidth: 1,
            },
          ],
        },
        options: chartOptions,
      });
    }
    return statsDom;
  }

  defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;

  recordPartial(
    author: BskyAuthor,
    uri: string,
    record: BskyRecord,
    isQuote = false
  ) {
    return html`<div class="flex items-center gap-2">
        <a
          class="flex items-center gap-2"
          href="https://bsky.app/profile/${author.handle ?? author.did}"
          target="_blank"
        >
          ${author.avatar
            ? html`<img
                class="w-[2em] h-[2em] rounded-full"
                src="${author.avatar}"
              />`
            : this.defaultAvatar}
          <span class="text-primary"
            >${author.displayName ?? author.handle}</span
          >
        </a>
        <a
          class="text-xs text-primary/75"
          href="https://bsky.app/profile/${author.did}/post/${uri
            .replace("at://", "")
            .split("/")[2]}"
          target="_blank"
          >${getTimeDifferenceString(record.createdAt)}</a
        >
      </div>
      <div class="${isQuote ? "italic" : ""} mt-1">
        ${unsafeHTML(processText(record))}
      </div>`;
  }

  postPartial(post: BskyPost): HTMLElement {
    let images = post.embed?.images
      ? renderGallery(post.embed.images)
      : undefined;
    if (!images)
      images = post.embed?.media?.images
        ? renderGallery(post.embed.media.images)
        : undefined;
    let card = post.embed?.external
      ? renderCard(post.embed.external)
      : undefined;

    let quotedPost = post.embed?.record;
    if (quotedPost && quotedPost?.$type != "app.bsky.embed.record#viewRecord")
      quotedPost = quotedPost.record;
    const quotedPostAuthor = quotedPost?.author;
    const quotedPostUri = quotedPost?.uri;
    const quotedPostValue = quotedPost?.value;
    let quotedPostImages = quotedPost?.embeds[0]?.images
      ? renderGallery(quotedPost.embeds[0].images)
      : undefined;
    if (!quotedPostImages)
      quotedPostImages = quotedPost?.embeds[0]?.media?.images
        ? renderGallery(quotedPost.embeds[0].media.images)
        : undefined;
    let quotedPostCard = quotedPost?.embeds[0]?.external
      ? renderCard(quotedPost.embeds[0].external)
      : undefined;

    const postDom = dom(html`<div>
      <div
        class="flex flex-col py-4 post min-w-[280px] border-b border-gray/50"
      >
        ${this.recordPartial(post.author, post.uri, post.record)}
        ${images ? html`<div class="mt-2">${images}</div>` : nothing}
        ${quotedPost
          ? html`<div class="border border-gray/50 rounded p-4 mt-2">
              ${this.recordPartial(
                quotedPostAuthor!,
                quotedPostUri!,
                quotedPostValue!,
                true
              )}
              ${quotedPostImages
                ? html`<div class="mt-2">${quotedPostImages}</div>`
                : nothing}
              ${quotedPostCard ? quotedPostCard : nothing}
            </div>`
          : nothing}
        ${card ? card : nothing}
        <div class="flex gap-2 font-bold mt-4 text-primary">
          <span>${post.repostCount} reposts</span
          ><span>${post.likeCount} likes</span>
        </div>
      </div>
    </div>`)[0];

    return postDom;
  }
}
