import { LitElement, html } from "lit";
import { globalStyles } from "./styles";
import { customElement } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
// @ts-ignore
import logoSvg from "./logo.svg";
import { dom } from "./utils";
import { map } from "lit/directives/map.js";

@customElement("skychat-help")
class Help extends LitElement {
    static styles = [globalStyles];

    render() {
        const helpDom = dom(html`<main class="flex flex-col justify-between m-auto max-w-[500px] px-4 h-full leading-5">
            <theme-toggle></theme-toggle>
            <a class="text-2xl flex align-center justify-center text-primary font-bold text-center my-8" href="/"
                ><i class="w-[32px] h-[32px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
            >
            <div id="index"></div>
            <div class="content help flex-grow flex flex-col">
                <h1>What is Skychat?</h1>
                <p>
                    Skychat allows you to explore and create BlueSky posts associated with a specific
                    <a href="https://en.wikipedia.org/wiki/Hashtag" target="_blank">hashtag</a>, like
                    <a href="/?hashtag=%23zib2" target="_blank">#zib2</a>, the hashtag commonly used in posts related to a popular Austrian news show.
                </p>
                <p>
                    It is designed for the specific purpose of engaging in live discussions on BlueSky, whether it's the airing of a new TV show
                    episode or an election event.
                </p>
                <h1>Making Participation Easy</h1>
                <p>Skychat aims to address various challenges that arise when trying to engage in live discussions on BlueSky.</p>
                <h2>Real-Time Updates</h2>
                <p>
                    Monitoring live posts for a hashtag on BlueSky can be cumbersome. You would typically need to create a
                    <a href="https://blueskyweb.xyz/blog/7-27-2023-custom-feeds" target="_blank">custom feed</a>, which can be daunting for those who
                    are not technically inclined.
                </p>
                <p>To view the latest posts in your custom feed, you have to manually refresh the feed, which can be quite bothersome.</p>
                <h2>Creating Threads</h2>
                <p>
                    When participating in live discussions about a current event on BlueSky, it's a best practice to organize your posts within a
                    thread. A thread is a series of connected posts, where each post is a reply to the previous one. Here is an
                    <a href="https://bsky.app/profile/badlogic.bsky.social/post/3kbt2y7pw272q">example thread</a>.
                </p>
                <p>
                    This approach helps your followers access all related posts in one place and maintains a cleaner timeline for them, as they can
                    choose to view only the initial post in your thread on BlueSky.
                </p>
                <p>
                    Unfortunately, composing such threads on BlueSky can be a challenging task, and it's easy to accidentally reply to the wrong post,
                    or forget to include the hashtag in each post.
                </p>
                <h1>A Chat Room for Hashtags</h1>
                <img src="img/chat.png" />
                <p>
                    When you enter a hashtag and click "Go live" on <a href="/">Skychat's landing page</a>, you enter a virtual chat room dedicated to
                    that hashtag. Think of the hashtag as the chat room's name. Once you enter the "chat room" for a hashtag, you can access all
                    BlueSky posts containing that hashtag, arranged chronologically.
                </p>
                <p>
                    As new posts with the hashtag are published on BlueSky, they automatically appear in the "chat room," eliminating the need for
                    manual refreshing. By scrolling up, you can also view older posts that include the hashtag.
                </p>
                <p>
                    If you provide Skychat with your BlueSky user name and an
                    <a href="https://bsky.app/settings/app-passwords">app password</a>, you can also write posts. Skychat will automatically create a
                    thread out of all the posts you write with it, and also include the hashtag in each post so you don't have to. Of course you can
                    also add images, alt texts, and link cards to your posts, just like in the BlueSky app.
                </p>
                <p>
                    You can also directly reply to or quote other people's posts, and repost and like them, just like in the BlueSky app. This way,
                    you can stay inside Skychat to discuss a topic in real-time, instead of having to switch back and forth between Skychat and the
                    BlueSky app.
                </p>

                <h1>How to</h1>
                <h2>Enter a chat room</h2>
                <img src="img/enterchatroom.png" />
                <p>Go to the landing page, enter the hashtag, then click "Go live!".</p>
                <p>
                    To post or reply to other people's posts, enter your BlueSky user name, such as
                    <a href="https://bsky.app/profile/badlogic.bsky.social">badlogic.bsky.social</a>, and an app password. You can
                    <a href="https://bsky.app/settings/app-passwords">generate an app password</a> in the BlueSky app.
                </p>

                <h2>Add a post to your thread</h2>
                <img src="img/add.png" />
                <p>
                    Click the post editor at the bottom. Enter the text of the post, then click "Post". Your post will be added to the bottom of your
                    thread for the hashtag. Skychat will automatically add the hashtag to the text of your post.
                </p>

                <h2>Add images to your post</h2>
                <img src="img/images.png" />
                <p>
                    Click image button and select an image file. Alternatively, drag and drop an image file onto the post editor, or paste an image
                    from the clipboard.
                </p>
                <p>You can add up to 4 images to a post. Only JPEG and PNG images are supported.</p>
                <p>Click the pencil button to add alt text to the image.</p>
                <p>Click the garbage bin button to remove the image from the post.</p>

                <h2>Add a link card to your post</h2>
                <img src="img/card1.png" />
                <img src="img/card2.png" />
                <p>Enter a link to your post text, then click "Add card". A link card for the link will be generated and added to your post.</p>
                <p>You can remove the link from your post text once the link card has been generated.</p>
                <p>Click the garbage bin button to remove the link card from the post</p>

                <h2>Quote a post</h2>
                <img src="img/quote1.png" />
                <img src="img/quote2.png" />
                <p>
                    Click the quote button on the post you want to quote. Finish composing your post by adding text, images or a link card, then click
                    "Post". The post will be added to the bottom of your thread for the hashtag.
                </p>
                <p>Click the garbage bin button to remove the quote from the post</p>

                <h2>Reply to a post</h2>
                <img src="img/reply1.png" />
                <img src="img/reply2.png" />
                <p>
                    Click the reply button on the post you want to reply to. Finish composing your post by adding text, images or a link card, then
                    click "Post". The post will be added as a reply to the other user's thread.
                </p>
                <p>Click the garbage bin button to stop replying to the other user's post.</p>

                <h2>Repost and like a post</h2>
                <img src="img/likerepost.png" />
                <p>Click the repost or like button beneath a person's post.</p>

                <h2>Open a post or user profile in the BlueSky app</h2>
                <img src="img/open.png" />
                <p>Click user name in the top left corner to open the user profile in the BlueSky app.</p>
                <p>Click date in the top right corner to open the post in the BlueSky app.</p>

                <h2>Show older posts</h2>
                <img src="img/old.png" />
                <p>Scroll to the top. Skychat will automatically load and display older posts.</p>

                <h2>Switch between the light and dark theme</h2>
                <img src="img/theme1.png" />
                <img src="img/theme2.png" />
                <p>Click the sun or moon button in the top right corner</p>

                <h2>Log out</h2>
                <img src="img/logout1.png" />
                <img src="img/logout2.png" />
                <p>Click "Log out" on the landing page or click the avatar in the top right corner of the chat page.</p>

                <h2>Reuse an existing thread</h2>
                <img src="img/reuse.png" />
                <p>
                    If you have previously written a thread for a hashtag via Skychat and re-open the chat room, Skychat will ask you if you want to
                    add new posts to the existing thread, or start a new thread.
                </p>

                <h2>Reconnect</h2>
                <img src="img/reconnect.png" />
                <p>
                    When your internet connection is interrupted, or the BlueSky servers temporarily don't respond, Skychat will try to automatically
                    reconnect. In this case, some posts may not be shown.
                </p>
                <p>To fully refresh the posts in the chat, reload the page</p>

                <h2>Ask questions</h2>
                <p>
                    If you have questions, simply drop me a message on
                    <a href="https://bsky.app/profile/badlogic.bsky.social" target="_blank">BlueSky</a>.
                </p>
            </div>

            <div class="text-center text-xs italic my-4 pb-4">
                <a href="https://skychat.social" target="_blank">Skychat</a>
                is lovingly made by
                <a href="https://bsky.app/profile/badlogic.bsky.social" target="_blank">Mario Zechner</a><br />
                No data is collected, not even your IP address.<br />
                <a href="https://github.com/badlogic/skychat" target="_blank">Source code</a>
            </div>
        </main>`)[0];
        const headings = Array.from(helpDom.querySelectorAll("h1, h2, h3"));
        const renderHeading = (heading: HTMLElement) => {
            return html`<div
                @click=${() => heading.scrollIntoView({ behavior: "smooth" })}
                class="cursor-pointer ml-${heading.tagName.charAt(1)} text-primary"
            >
                ${heading.innerText}
            </div>`;
        };
        const headingsDom = dom(html`<div>${map(headings, (heading) => renderHeading(heading as HTMLElement))}</div>`)[0];
        (helpDom.querySelector("#index") as HTMLElement).appendChild(headingsDom);
        return helpDom;
    }
}
