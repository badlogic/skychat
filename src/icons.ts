// @ts-ignore
import settingsIconSvg from "remixicon/icons/System/settings-2-line.svg";
// @ts-ignore
import bookmarkIconSvg from "remixicon/icons/Business/bookmark-line.svg";
// @ts-ignore
import addIconSvg from "remixicon/icons/System/add-circle-line.svg";
// @ts-ignore
import closeIconSvg from "remixicon/icons/System/close-circle-line.svg";
// @ts-ignore
import commentIconSvg from "remixicon/icons/Communication/chat-4-line.svg";
// @ts-ignore
import quoteIconSvg from "remixicon/icons/Communication/chat-quote-line.svg";
// @ts-ignore
import replyIconSvg from "remixicon/icons/Business/reply-line.svg";
// @ts-ignore
import starIconSvg from "remixicon/icons/System/star-line.svg";
// @ts-ignore
import reblogIconSvg from "remixicon/icons/Media/repeat-line.svg";
// @ts-ignore
import imageIconSvg from "remixicon/icons/Media/image-line.svg";
// @ts-ignore
import bellIconSvg from "remixicon/icons/Media/notification-line.svg";
// @ts-ignore
import checkmarkIconSvg from "remixicon/icons/System/check-line.svg";
// @ts-ignore
import githubIconSvg from "remixicon/icons/Logos/github-line.svg";
// @ts-ignore
import heartIconSvg from "remixicon/icons/Health & Medical/heart-line.svg";
// @ts-ignore
import editIconSvg from "remixicon/icons/Design/edit-line.svg";
// @ts-ignore
import deleteIconSvg from "remixicon/icons/System/delete-bin-line.svg";
// @ts-ignore
import shieldIconSvg from "remixicon/icons/System/shield-keyhole-line.svg";
// @ts-ignore
import atIconSvg from "remixicon/icons/Business/at-line.svg";
// @ts-ignore
import followIconSvg from "remixicon/icons/User & Faces/user-follow-line.svg";
// @ts-ignore
import homeIconSvg from "remixicon/icons/Buildings/home-line.svg";
// @ts-ignore
import moreIconSvg from "remixicon/icons/System/more-line.svg";
// @ts-ignore
import spinnerIconSvg from "remixicon/icons/System/loader-3-line.svg";
// @ts-ignore
import settings2IconSvg from "remixicon/icons/Media/equalizer-line.svg";

import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { html } from "lit";

export const settingsIcon = unsafeHTML(settingsIconSvg);
export const settings2Icon = unsafeHTML(settings2IconSvg);
export const bookmarkIcon = unsafeHTML(bookmarkIconSvg);
export const addIcon = unsafeHTML(addIconSvg);
export const closeIcon = unsafeHTML(closeIconSvg);
export const commentIcon = unsafeHTML(commentIconSvg);
export const replyIcon = unsafeHTML(replyIconSvg);
export const starIcon = unsafeHTML(starIconSvg);
export const reblogIcon = unsafeHTML(reblogIconSvg);
export const imageIcon = unsafeHTML(imageIconSvg);
export const bellIcon = unsafeHTML(bellIconSvg);
export const checkmarkIcon = unsafeHTML(checkmarkIconSvg);
export const githubIcon = unsafeHTML(githubIconSvg);
export const heartIcon = unsafeHTML(heartIconSvg);
export const editIcon = unsafeHTML(editIconSvg);
export const deleteIcon = unsafeHTML(deleteIconSvg);
export const shieldIcon = unsafeHTML(shieldIconSvg);
export const quoteIcon = unsafeHTML(quoteIconSvg);
export const atIcon = unsafeHTML(atIconSvg);
export const followIcon = unsafeHTML(followIconSvg);
export const homeIcon = unsafeHTML(homeIconSvg);
export const moreIcon = unsafeHTML(moreIconSvg);
export const spinnerIcon = unsafeHTML(spinnerIconSvg);

export function icon(svg: string) {
    return html`<i class="flex w-[1.2em] h-[1.2em] border-white fill-primary">${unsafeHTML(svg)}</i>`;
}
