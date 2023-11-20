import { TemplateResult, html } from "lit";

export interface Messages {
    "Not connected": string;
    "Couldn't delete post": string;
    Home: string;
    "Could not load list": string;
    "End of list": string;
    "Could not load more items": string;
    Notifications: string;
    "No more notifications": string;
    "Write your quote. It will be added to your thread about ${this.hashtag!}.": (hashtag: string) => string;
    "Write your quote post.": string;
    "Write your reply. It will be added to the thread by ${this.replyTo.author.displayName ?? this.replyTo.author.handle}.": (
        handle: string
    ) => string;
    "Write your reply": string;
    "Add a post to your thread about ${this.hashtag!}. The hashtag will be added automatically.": (hashtag: string) => string;
    "What's up?": string;
    "Replying to": string;
    "Add card": string;
    Quoting: string;
    "Sending post": string;
    Cancel: string;
    Post: string;
    "You can only upload 4 images per post": string;
    "Couldn't send post": string;
    "Edit Image": string;
    "Add alt text to your image": string;
    Thread: string;
    "Deleted post": string;
    "Alt Text": string;
    "Thread not found. The post may have been deleted, or you were blocked by the user.": string;
    "You have blocked the author or the author has blocked you.": string;
    "Couldn't load profile of ": (handle: string) => string;
    Profile: string;
    Followers: string;
    Following: string;
    "Follows you": string;
    followers: string;
    following: string;
    posts: string;
    "You are blocked by the user.": string;
    "You are blocking the user.": string;
    Posts: string;
    "Posts & Replies": string;
    Media: string;
    Likes: string;
    "Nothing to show": string;
    "Add to List": string;
    Mute: string;
    Block: string;
    Report: string;
    Unfollow: string;
    Follow: string;
    Unblock: string;
    "No post given": string;
    "Couldn't load likes": string;
    "Could not load reposts": string;
    "No account given": string;
    "Could not load followers": string;
    "Could not load followings": string;
    Connecting: string;
    "Explore & create hashtag threads in real-time on BlueSky": string;
    "Hashtag, e.g. #imzentrum": string;
    "You are logged in as": string;
    "Want to post and reply to other posts? Enter your username and an app password below. (optional)": TemplateResult;
    "Account, e.g. badlogic.bsky.social": string;
    "App password": string;
    "Go live!": string;
    "Your credentials will only be stored on your device.": string;
    "Log out": string;
    "How does it work?": string;
    "Trending hashtags": string;
    footer: TemplateResult;
    "Please specify a hashtag": string;
    "Please specify an app password for your account. You can get one in your BlueSky app's settings.": string;
    "Log out?": string;
    "No hashtag given": string;
    "Couldn't log in with your BlueSky credentials": string;
    "You have an existing thread for ": (rootUrl: string, hashtag: string) => TemplateResult;
    "Do you want to add new posts to the existing thread, or start a new thread?": string;
    "Use existing thread": string;
    "Start new thread": string;
    "↓ Catch up ↓": string;
    "Reconnected. Some posts may be missing above.": string;
    "No older posts": string;
    "Failed to download image": string;
    "trend description": string;
    "The better BlueSky app": string;
    "Sign in": string;
    "Invalid account or password.": string;
    Quotes: string;
    Reposts: string;
    "Mute Thread": string;
    "Mute User": string;
    "Block User": string;
    "Delete Post": string;
    "Post by muted user": string;
    "Click to view": string;
    Settings: string;
    Theme: string;
    Dark: string;
    Light: string;
    System: string;
    "Logged in as": string;
    "Could not load newer items": string;
    "You can not add an image if you already have a link card": string;
    Mutuals: string;
    "Couldn't load notifications": string;
    "Invalid stream": string;
    "Sorry, an unknown error occured": string;
    "Show replies": string;
    "Open Thread": string;
    "GIF Search": string;
    "Search for GIFS...": string;
    "Couldn't load images": string;
    Moderation: string;
    Search: string;
    "Search for users, posts, feeds ...": string;
    Users: string;
    Feeds: string;
    "Suggested follows": string;
    "Suggested feeds": string;
    "Enter search terms above to find posts": string;
    "Created by": string;
    likes: string;
    Add: string;
    Remove: string;
}

const english: Messages = {
    "Not connected": "Not connected",
    "Couldn't delete post": "Couldn't delete post",
    Home: "Home",
    "Could not load list": "Could not load list",
    "End of list": "End of list",
    "Could not load more items": "Could not load more items",
    Notifications: "Notifications",
    "No more notifications": "No more notifications",
    "Write your quote. It will be added to your thread about ${this.hashtag!}.": (hashtag: string) =>
        `Write your quote post. It will be added to your thread about ${hashtag}`,
    "Write your quote post.": "Write your quote post.",
    "Write your reply. It will be added to the thread by ${this.replyTo.author.displayName ?? this.replyTo.author.handle}.": (handle) =>
        `Write your reply. It will be added to the thread by ${handle}.`,
    "Write your reply": "Write your reply",
    "Add a post to your thread about ${this.hashtag!}. The hashtag will be added automatically.": (hashtag: string) =>
        `Add a post to your thread about ${hashtag}. The hashtag will be added automatically.`,
    "What's up?": "What's up?",
    "Replying to": "Replying to",
    "Add card": "Add card",
    Quoting: "Quoting",
    "Sending post": "Sending post",
    Cancel: "Cancel",
    Post: "Post",
    "You can only upload 4 images per post": "You can only upload 4 images per post",
    "Couldn't send post": "Couldn't send post",
    "Edit Image": "Edit Image",
    "Add alt text to your image": "Add alt text to your image",
    Thread: "Thread",
    "Deleted post": "Deleted post",
    "Alt Text": "Alt Text",
    "Thread not found. The post may have been deleted, or you were blocked by the user.":
        "Thread not found. The post may have been deleted, or you were blocked by the user.",
    "You have blocked the author or the author has blocked you.": "You have blocked the author or the author has blocked you.",
    "Couldn't load profile of ": (handle: string) => "Couldn't load profile of " + handle,
    Profile: "Profile",
    Followers: "Followers",
    Following: "Following",
    "Follows you": "Follows you",
    followers: "followers",
    following: "following",
    posts: "posts",
    "You are blocked by the user.": "You are blocked by the user.",
    "You are blocking the user.": "You are blocking the user.",
    Posts: "Posts",
    "Posts & Replies": "Posts & Replies",
    Media: "Media",
    Likes: "Likes",
    "Nothing to show": "Nothing to show",
    "Add to List": "Add to List",
    Mute: "Mute",
    Block: "Block",
    Report: "Report",
    Follow: "Follow",
    Unfollow: "Unfollow",
    Unblock: "Unblock",
    "No post given": "No post given",
    "Couldn't load likes": "Couldn't load likes",
    "Could not load reposts": "Could not load reposts",
    "No account given": "No account given",
    "Could not load followers": "Could not load followers",
    "Could not load followings": "Could not load followings",
    Connecting: "Connecting",
    "Explore & create hashtag threads in real-time on BlueSky": "Explore & create hashtag threads in real-time on BlueSky",
    "Hashtag, e.g. #imzentrum": "Hashtag, e.g. #imzentrum",
    "You are logged in as": "You are logged in as",
    "Want to post and reply to other posts? Enter your username and an app password below. (optional)": html`Want to post and reply to other posts?
        Enter your username and an <a href="https://bsky.app/settings/app-passwords">app password</a> below. (optional)`,
    "Account, e.g. badlogic.bsky.social": "Account, e.g. badlogic.bsky.social",
    "App password": "App password",
    "Go live!": "Go live!",
    "Your credentials will only be stored on your device.": "Your credentials will only be stored on your device.",
    "Log out": "Log out",
    "How does it work?": "How does it work?",
    "Trending hashtags": "Trending hashtags",
    footer: html`<a href="https://skychat.social" target="_blank">Skychat</a>
        is lovingly made by
        <a href="https://bsky.app/profile/badlogic.bsky.social" target="_blank">Mario Zechner</a><br />
        No data is collected, not even your IP address.<br />
        <a href="https://github.com/badlogic/skychat" target="_blank">Source code</a>`,
    "Please specify a hashtag": "Please specify a hashtag",
    "Please specify an app password for your account. You can get one in your BlueSky app's settings.":
        "Please specify an app password for your account. You can get one in your BlueSky app's settings.",
    "Log out?": "Log out?",
    "No hashtag given": "No hashtag given",
    "Couldn't log in with your BlueSky credentials": "Couldn't log in with your BlueSky credentials",
    "You have an existing thread for ": (rootUrl: string, hashtag: string) =>
        html`You have an <a href="${rootUrl}">existing thread</a> for ${hashtag}`,
    "Do you want to add new posts to the existing thread, or start a new thread?":
        "Do you want to add new posts to the existing thread, or start a new thread?",
    "Use existing thread": "Use existing thread",
    "Start new thread": "Start new thread",
    "↓ Catch up ↓": "↓ Catch up ↓",
    "Reconnected. Some posts may be missing above.": "Reconnected. Some posts may be missing above. Reload the page to get the latest.",
    "No older posts": "No older posts",
    "Failed to download image": "Failed to download image",
    "trend description":
        "Below you'll see hashtags sorted by the number of posts they are contained in since you opened this page. Updates in real-time. The longer you leave this page open, the more representative the statistics get.",
    "The better BlueSky app": "The better BlueSky app",
    "Sign in": "Sign in",
    "Invalid account or password.": "Invalid account or password.",
    Quotes: "Quotes",
    Reposts: "Reposts",
    "Mute Thread": "Mute Thread",
    "Mute User": "Mute User",
    "Block User": "Block User",
    "Delete Post": "Delete Post",
    "Post by muted user": "Post by muted user",
    "Click to view": "Click to view",
    Settings: "Settings",
    Theme: "Theme",
    Dark: "Dark",
    Light: "Light",
    System: "System",
    "Logged in as": "Logged in as",
    "Could not load newer items": "Could not load newer items",
    "You can not add an image if you already have a link card": "You can not add an image if you already have a link card",
    Mutuals: "Mutuals",
    "Couldn't load notifications": "Couldn't load notifications",
    "Invalid stream": "Invalid stream",
    "Sorry, an unknown error occured": "Sorry, an unknown error occured",
    "Show replies": "Show replies",
    "Open Thread": "Open Thread",
    "GIF Search": "GIF Search",
    "Search for GIFS...": "Search for GIFs ...",
    "Couldn't load images": "Couldn't load images",
    Moderation: "Moderation",
    Search: "Search",
    "Search for users, posts, feeds ...": "Search for users, posts, feeds ....",
    Users: "Users",
    Feeds: "Feeds",
    "Suggested follows": "Suggested follows",
    "Suggested feeds": "Suggested feeds",
    "Enter search terms above to find posts": "Enter search terms above to find posts",
    "Created by": "Created by",
    likes: "likes",
    Add: "Add",
    Remove: "Remove",
};

const german: Messages = {
    "Not connected": "Nicht verbunden",
    "Couldn't delete post": "Konnte Post nicht löschen",
    Home: "Home",
    "Could not load list": "Konnte Liste nicht laden",
    "End of list": "Keine weiteren Einträge",
    "Could not load more items": "Konnte weitere Einträge nicht laden",
    Notifications: "Notifikationen",
    "No more notifications": "Keine weiteren Notifikationen",
    "Write your quote. It will be added to your thread about ${this.hashtag!}.": (hashtag: string) =>
        `Schreibe dein Zitier-Post. Es wird am Ende deines Threads für das Hashtag ${hashtag} hinzugefügt`,
    "Write your quote post.": "Schreibe dein Zitier-Post.",
    "Write your reply. It will be added to the thread by ${this.replyTo.author.displayName ?? this.replyTo.author.handle}.": (handle) =>
        `Schreibe deine Antwort. Sie wird zum Thread von ${handle} hinzugefügt.`,
    "Write your reply": "Schreibe deine Antwort",
    "Add a post to your thread about ${this.hashtag!}. The hashtag will be added automatically.": (hashtag: string) =>
        `Füge ein Post zu deinem Thread über ${hashtag} hinzu. Das Hashtag wird automatisch zum Text hinzugefügt.`,
    "What's up?": "Was gibt's Neues?",
    "Replying to": "Antwort auf",
    "Add card": "Karte hinzufügen",
    Quoting: "Zitiere",
    "Sending post": "Sende Post",
    Cancel: "Abbrechen",
    Post: "Senden",
    "You can only upload 4 images per post": "Maximal 4 Bilder können einem Post hinzugefügt werden",
    "Couldn't send post": "Konnte Post nicht senden",
    "Edit Image": "Bild bearbeiten",
    "Add alt text to your image": "Füge eine Bildbeschreibung hinzu",
    Thread: "Thread",
    "Deleted post": "Gelöschtes Post",
    "Alt Text": "Bildbeschreibung",
    "Thread not found. The post may have been deleted, or you were blocked by the user.":
        "Thread nicht gefunden. Das Post wurde gelöscht oder du bist von der Benutzerin blockiert worden.",
    "You have blocked the author or the author has blocked you.": "Du hast die Benutzerin blockiert oder die Benutzerin blockiert dich.",
    "Couldn't load profile of ": (handle: string) => "Konnte Profil von " + handle + " nicht laden",
    Profile: "Profil",
    Followers: "Followers", // FIXME
    Following: "Following", // FIXME
    "Follows you": "Folgt dir",
    followers: "followers", // FIXME
    following: "following", // FIXME
    posts: "posts",
    "You are blocked by the user.": "Die Benutzerin blockiert dich.",
    "You are blocking the user.": "Du blockierst die Benutzerin.",
    Posts: "Posts",
    "Posts & Replies": "Posts & Antworten",
    Media: "Medien",
    Likes: "Likes",
    "Nothing to show": "Nichts anzuzeigen",
    "Add to List": "Zu Liste hinzufügen",
    Mute: "Stumm schalten",
    Block: "Blockieren",
    Report: "Melden",
    Follow: "Folgen",
    Unfollow: "Entfolgen",
    Unblock: "Entblocken",
    "No post given": "Post fehlt",
    "Couldn't load likes": "Konnte Likes nicht laden",
    "Could not load reposts": "Konnte Reposts nicht laden",
    "No account given": "Benutzerin fehlt",
    "Could not load followers": "Konnte Follower nicht laden",
    "Could not load followings": "Konnte Benutzerinnen, die dieser Benutzerin folgen, nicht laden",
    Connecting: "Verbinde",
    "Explore & create hashtag threads in real-time on BlueSky": "Hashtag Threads auf BlueSky folgen und erstellen",
    "Hashtag, e.g. #imzentrum": "Hashtag, z.B. #imzentrum",
    "You are logged in as": "Angemeldet als ",
    "Want to post and reply to other posts? Enter your username and an app password below. (optional)": html`Willst du selbst einen Hashtag Thread
        schreiben und auf Posts anderer Benutzerinnen antworten können? Dann gib deinen BlueSky Benutzernamen und ein
        <a href="https://bsky.app/settings/app-passwords">App Passwort</a> an. (Optional)`,
    "Account, e.g. badlogic.bsky.social": "Account, z.B. badlogic.bsky.social",
    "App password": "App Passwort",
    "Go live!": "Los geht's!",
    "Your credentials will only be stored on your device.": "Deine Benutzerdaten werden nur auf deinem Gerät gespeichert.",
    "Log out": "Abmelden",
    "How does it work?": "Wie funktioniert es?",
    "Trending hashtags": "Hashtag Trends",
    footer: html`<a href="https://skychat.social" target="_blank">Skychat</a>
        wird liebevoll von
        <a href="https://bsky.app/profile/badlogic.bsky.social" target="_blank">Mario Zechner</a> gebaut<br />
        Es werden keine Daten von dir gespeichert, nicht einmal deine IP Adresse<br />
        <a href="https://github.com/badlogic/skychat" target="_blank">Source Code</a>`,
    "Please specify a hashtag": "Bitte gib ein Hashtag ein",
    "Please specify an app password for your account. You can get one in your BlueSky app's settings.":
        "Bitte gib ein App Passwort für deinen BlueSky Account ein. Du kannst App Passwörter in den Einstellungen der offiziellen BlueSky App erstellen.",
    "Log out?": "Abmelden?",
    "No hashtag given": "Hashtag fehlt",
    "Couldn't log in with your BlueSky credentials": "Anmeldung mit deinen BlueSky Benutzerdaten fehlgeschlagen",
    "You have an existing thread for ": (rootUrl: string, hashtag: string) =>
        html`Du hast für den Hashtag ${hashtag} bereits einen bestehenden <a href="${rootUrl}">Thread</a>`,
    "Do you want to add new posts to the existing thread, or start a new thread?":
        "Willst du neue Posts an den bestehenden Thread hinzufügen oder einen neuen Thread starten?",
    "Use existing thread": "Bestehenden Thread verwenden",
    "Start new thread": "Neuen Thread staren",
    "↓ Catch up ↓": "↓ Neue Nachrichten ↓",
    "Reconnected. Some posts may be missing above.":
        "Neu verbunden. Neue Posts können oben fehlen. Seite neu laden um die aktuellsten Posts zu sehen.",
    "No older posts": "Keine älteren Posts",
    "Failed to download image": "Konnte Bild nicht herunterladen",
    "trend description":
        "Unten siehst du Hashtags sortiert nach der Anzahl and Posts in denen sie vorkommen seit du diese Seite geladen hast. Wird in Echtzeit erhoben. Je länger du die Seite offen lässt, desto representativer werden die Statistiken.",
    "The better BlueSky app": "Die bessere BlueSky App",
    "Sign in": "Anmelden",
    "Invalid account or password.": "Invalider Benutzername oder Passwort.",
    Quotes: "Zitate",
    Reposts: "Reposts",
    "Mute Thread": "Thread ",
    "Mute User": "Benutzerin stummschalten",
    "Block User": "Benutzerin blockieren",
    "Delete Post": "Post löschen",
    "Post by muted user": "Post einer stummgeschaltenen Benutzerin",
    "Click to view": "Zum Anzeigen klicken",
    Settings: "Einstellungen",
    Theme: "Design",
    Dark: "Dunkel",
    Light: "Hell",
    System: "System",
    "Logged in as": "Angemeldet als",
    "Could not load newer items": "Could not load newer items",
    "You can not add an image if you already have a link card": "Kann kein Bild hinzufügen wenn Link-Karte bereits angefügt ist.",
    Mutuals: "Mutuals", // FIXME
    "Couldn't load notifications": "Konnte Notifikationen nicht laden",
    "Invalid stream": "Unbekannter stream",
    "Sorry, an unknown error occured": "Ein unbekannter Fehler ist aufgetreten",
    "Show replies": "Zeige Antworten",
    "Open Thread": "Zeige Thread",
    "GIF Search": "GIF Suche",
    "Search for GIFS...": "Nach GIFs suchen ...",
    "Couldn't load images": "Konnte Bilder nicht laden",
    Moderation: "Moderation",
    Search: "Suche",
    "Search for users, posts, feeds ...": "Suche Benutzerinnen, Posts, Feeds ...",
    Users: "Users",
    Feeds: "Feeds",
    "Suggested follows": "Spannende Benutzerinnen",
    "Suggested feeds": "Spannende Feeds",
    "Enter search terms above to find posts": "Gib Suchbegriffe ein",
    "Created by": "Erstellt von",
    likes: "likes",
    Add: "Hinzufügen",
    Remove: "Entfernen",
};

export type LanguageCode = "en" | "de";

const translations: Record<LanguageCode, Messages> = {
    en: english,
    de: german,
};

export function i18n<T extends keyof Messages>(key: T): Messages[T] {
    const userLocale = navigator.language || (navigator as any).userLanguage;
    const languageCode = userLocale ? (userLocale.split("-")[0] as LanguageCode) : "en";
    const implementation = translations[languageCode];
    const message = implementation ? implementation[key] : translations["en"][key];
    if (!message) {
        console.error("Unknown i18n string " + key);
        return key as any as Messages[T];
    }
    return message;
}
