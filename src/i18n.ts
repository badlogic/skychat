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
    "You are muting the user.": string;
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
    "Want to post and reply to other posts? Enter your username and an app password below. (optional)": string;
    "Account, e.g. badlogic.bsky.social": string;
    "App password": string;
    "Go live!": string;
    "Your credentials will only be stored on your device.": string;
    "Log out": string;
    "How does it work?": string;
    "Trending hashtags": string;
    footer: string;
    "Please specify a hashtag": string;
    "Please specify an app password for your account. You can get one in your BlueSky app's settings.": string;
    "Log out?": string;
    "No hashtag given": string;
    "Couldn't log in with your BlueSky credentials": string;
    "You have an existing thread for ": (rootUrl: string, hashtag: string) => string;
    "Do you want to add new posts to the existing thread, or start a new thread?": string;
    "Use existing thread": string;
    "Start new thread": string;
    "↓ Catch up ↓": string;
    "Reconnected. Some posts may be missing above.": string;
    "No older posts": string;
    "Failed to download image": string;
    "trend description": string;
    "The better BlueSky app": string;
    "(Possibly, once it's done, work-in-progress :D)": string;
    "Sign in": string;
    "Sign up": string;
    "Invalid account or password.": string;
    Quotes: string;
    Reposts: string;
    "Mute Thread": string;
    "Mute User": string;
    "Unmute User": string;
    "Block User": string;
    "Unblock User": string;
    "Delete Post": string;
    "Post by muted user": string;
    "Post by blocked user": string;
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
    "Search for": string;
    Users: string;
    Feeds: string;
    "Suggested follows": string;
    "Suggested feeds": string;
    "Enter search terms above to find posts": string;
    "Created by": string;
    likes: string;
    Add: string;
    Remove: string;
    "Pinned Feeds": string;
    "Saved Feeds": string;
    "Discover more feeds": string;
    "Couldn't load your feeds": string;
    Feed: string;
    "Could not load feed": string;
    "Could not load list feed": string;
    "You don't have pinned feeds": string;
    "You don't have saved feeds": string;
    Edit: string;
    Save: string;
    "Search my posts": string;
    "Open in Bluesky": string;
    "Push notifications": string;
    Enabled: string;
    "New follower": string;
    Replies: string;
    Mentions: string;
    "Copy link": string;
    "Copied link to clipboard": string;
    List: string;
    Lists: string;
    "Moderation Lists": string;
    "Curation list": string;
    "Moderation list": string;
    "Feeds by me": string;
    "Couldn't mute user": string;
    "Couldn't unmute user": string;
    "Couldn't block user": string;
    "Couldn't unblock user": string;
    "Post does not exist": string;
    "Post author has blocked you": string;
    "You have blocked the post author": string;
    "User Interface": string;
    "Muted words": string;
    "Muted Words": string;
    "Muted users": string;
    "Muted threads": string;
    "Muted Threads": string;
    "Blocked users": string;
    "Moderation lists": string;
    "Allow pinch-zoom": string;
    "is following you": (handle: string) => string;
    "liked your post": (handle: string) => string;
    "quoted your post": (handle: string) => string;
    "replied to your post": (handle: string) => string;
    "reposted your post": (handle: string) => string;
    "mentioned you": (handle: string) => string;
    "You have a new notification": string;
    "New notification": string;
    "Couldn't load your lists": string;
    "You have not created feeds yourself yet": string;
    "Saved Lists": string;
    "You don't have saved lists": string;
    "Lists by me": string;
    "Create a new list": string;
    "New List": string;
    "New Moderation List": string;
    "Edit List": string;
    "Edit Moderation List": string;
    Name: string;
    Description: string;
    "Name is required": string;
    "E.g. 'Cool people'": string;
    "Add people": string;
    "Members of": (name: string) => string;
    "Explore without an Account": string;
    Explore: string;
    "Explore BlueSky with": string;
    "Search people": string;
    "Search posts": string;
    "Search feeds": string;
    "explore-header": string;
    "(Viewed through Skychat)": string;
    "explore-callout": string;
    "Hello, Anyone There?": string;
    "explore-box-1-text-1": string;
    "I need George Takei in my life": string;
    "(You can view all users' followers, followings, posts, media, likes, feeds, and lists)": string;
    "My God, It's Full of Posts": string;
    "explore-box-2-text-1": string;
    "explore-box-2-text-2": string;
    "Do you want to see more?": string;
    "Your Feeds, Your Choice": string;
    "explore-box-3-text-1": string;
    "explore-box-3-text-2": string;
    "explore-box-3-text-3": string;
    "Time for some ...": string;
    "(or how I learned to love the algorithm)": string;
    Entertainment: string;
    News: string;
    Science: string;
    "E.g. names, keywords, ...": string;
    "(Click on a post to view the entire thread)": string;
    people: string;
    "Couldn't add user to list": string;
    "Couldn't save list": string;
    "Saving list": string;
    Joined: string;
    "Content filtering": string;
    "I'm an adult": string;
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
    "You are muting the user.": "You are muting the user.",
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
    "Want to post and reply to other posts? Enter your username and an app password below. (optional)": `Want to post and reply to other posts?
        Enter your username and an <a href="https://bsky.app/settings/app-passwords">app password</a> below. (optional)`,
    "Account, e.g. badlogic.bsky.social": "Account, e.g. badlogic.bsky.social",
    "App password": "App password",
    "Go live!": "Go live!",
    "Your credentials will only be stored on your device.": "Your credentials will only be stored on your device.",
    "Log out": "Log out",
    "How does it work?": "How does it work?",
    "Trending hashtags": "Trending hashtags",
    footer: `<a href="https://skychat.social" target="_blank">Skychat</a>
        is lovingly made by
        <a href="https://bsky.app/profile/badlogic.bsky.social" target="_blank">Mario Zechner</a><br />
        <a href="https://github.com/badlogic/skychat" target="_blank">Source code</a>`,
    "Please specify a hashtag": "Please specify a hashtag",
    "Please specify an app password for your account. You can get one in your BlueSky app's settings.":
        "Please specify an app password for your account. You can get one in your BlueSky app's settings.",
    "Log out?": "Log out?",
    "No hashtag given": "No hashtag given",
    "Couldn't log in with your BlueSky credentials": "Couldn't log in with your BlueSky credentials",
    "You have an existing thread for ": (rootUrl: string, hashtag: string) => `You have an <a href="${rootUrl}">existing thread</a> for ${hashtag}`,
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
    "(Possibly, once it's done, work-in-progress :D)": "(Possibly, once it's done, work-in-progress :D)",
    "Sign in": "Sign in",
    "Sign up": "Sign up",
    "Invalid account or password.": "Invalid account or password.",
    Quotes: "Quotes",
    Reposts: "Reposts",
    "Mute Thread": "Mute Thread",
    "Mute User": "Mute User",
    "Unmute User": "Unmute User",
    "Block User": "Block User",
    "Unblock User": "Unblock User",
    "Delete Post": "Delete Post",
    "Post by muted user": "Post by muted user",
    "Post by blocked user": "Post by blocked user",
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
    "Search for": "Search ",
    Users: "Users",
    Feeds: "Feeds",
    "Suggested follows": "Suggested follows",
    "Suggested feeds": "Suggested feeds",
    "Enter search terms above to find posts": "Enter search terms above to find posts",
    "Created by": "Created by",
    likes: "likes",
    Add: "Add",
    Remove: "Remove",
    "Pinned Feeds": "Pinned feeds",
    "Saved Feeds": "Saved feeds",
    "Discover more feeds": "Discover more feeds",
    "Couldn't load your feeds": "Couldn't load your feeds",
    Feed: "Feed",
    "Could not load feed": "Could not load feed",
    "Could not load list feed": "Could not load list feed",
    "You don't have pinned feeds": "You don't have pinned feeds",
    "You don't have saved feeds": "You don't have saved feeds",
    Edit: "Edit",
    Save: "Save",
    "Search my posts": "Search my posts",
    "Open in Bluesky": "Open in Bluesky app",
    "Push notifications": "Push notifications",
    Enabled: "Enabled",
    "New follower": "New followers",
    Replies: "Replies",
    Mentions: "Mentions",
    "Copy link": "Copy link",
    "Copied link to clipboard": "Copied link to clipboard",
    List: "List",
    Lists: "Lists",
    "Moderation Lists": "Moderation Lists",
    "Curation list": "Curation list",
    "Moderation list": "Moderation list",
    "Feeds by me": "Feeds by me",
    "Couldn't mute user": "Couldn't mute user",
    "Couldn't unmute user": "Couldn't unmute user",
    "Couldn't block user": "Couldn't block user",
    "Couldn't unblock user": "Couldn't unblock user",
    "Post does not exist": "Post does not exist",
    "Post author has blocked you": "Post author has blocked you",
    "You have blocked the post author": "You have blocked the post author",
    "User Interface": "User Interface",
    "Muted users": "Muted users",
    "Blocked users": "Blocked users",
    "Allow pinch-zoom": "Allow pinch-zoom",
    "is following you": (handle: string) => handle + " is following you",
    "liked your post": (handle: string) => handle + " liked your post",
    "quoted your post": (handle: string) => handle + " quoted your post",
    "replied to your post": (handle: string) => handle + " replied to your post",
    "reposted your post": (handle: string) => handle + " reposted your post",
    "mentioned you": (handle: string) => handle + " mentioned you",
    "You have a new notification": "You have a new notification",
    "New notification": "New notification",
    "Couldn't load your lists": "Couldn't load your lists",
    "You have not created feeds yourself yet": "You have not created feeds yourself yet",
    "Saved Lists": "Saved Lists",
    "You don't have saved lists": "You don't have saved lists",
    "Lists by me": "Lists by me",
    "Create a new list": "Create a new list",
    "New List": "New List",
    "New Moderation List": "New Moderation List",
    "Edit List": "Edit List",
    "Edit Moderation List": "Edit Moderation List",
    Name: "Name",
    Description: "Description",
    "Name is required": "Name is required",
    "E.g. 'Cool people'": "E.g. 'Cool people'",
    "Add people": "Add people",
    "Members of": (name: string) => "Members of " + name,
    "Explore without an Account": "Explore BlueSky without account",
    Explore: "Explore",
    "Explore BlueSky with": "Explore BlueSky with",
    "Search people": "Search people",
    "Search posts": "Search posts",
    "Search feeds": "Search feeds",
    "explore-header": `Welcome to <a href="https://bsky.app">BlueSky</a>`,
    "(Viewed through Skychat)": "(Viewed through Skychat)",
    "explore-callout": `Scroll down and <span class="text-blue-500 font-bold">explore BlueSky without an account</span>, or ...`,
    "Hello, Anyone There?": "Hello, Anyone There?",
    "explore-box-1-text-1": `Not everyone has made the jump yet. But it's cosy and there're plenty of cool peeps around. We have a <span class="text-blue-500 font-bold">freaking George Takei</span>`,
    "I need George Takei in my life": "I need George Takei in my life",
    "(You can view all users' followers, followings, posts, media, likes, feeds, and lists)":
        "(You can view all users' followers, followings, posts, media, likes, feeds, and lists)",
    "My God, It's Full of Posts": "My God, It's Full of Posts",
    "explore-box-2-text-1":
        "It's a hive of conversation here, reminiscent of that other unnamed network. While we're still warming up to hashtags, searching for posts is a breeze.",
    "explore-box-2-text-2": `Check out the latest three posts on everyone's beloved <span class="text-blue-500 font-bold">Godzilla</span>.`,
    "Do you want to see more?": "Do you want to see more?",
    "Your Feeds, Your Choice": "Your Feeds, Your Choice",
    "explore-box-3-text-1": "BlueSky respects your timeline — posts from people you follow, in chronological order, untouched by algorithms.",
    "explore-box-3-text-2": `Want a change of pace? Opt for <a href="https://blueskyweb.xyz/blog/7-27-2023-custom-feeds" target="_blank" class="font-bold">algorithmically or manually curated feeds</a> for a dash of serendipity.`,
    "explore-box-3-text-3":
        "Plus, you're free to create and share your own feeds, or simply curate lists of users whose posts you want to see separately from your main feed.",
    "Time for some ...": "Time for some ...",
    "(or how I learned to love the algorithm)": "(or how I learned to love the algorithm)",
    Entertainment: "Entertainment",
    News: "News",
    Science: "Science",
    "E.g. names, keywords, ...": "E.g. names, keywords, ...",
    "(Click on a post to view the entire thread)": "(Click on a post to view the entire thread)",
    people: "people",
    "Couldn't add user to list": "Couldn't add user to list",
    "Couldn't save list": "Couldn't save list",
    "Saving list": "Saving list",
    Joined: "Joined",
    "Content filtering": "Content filtering",
    "Muted words": "Muted words",
    "Muted Words": "Muted Words",
    "Muted threads": "Muted threads",
    "Muted Threads": "Muted Threads",
    "Moderation lists": "Moderation lists",
    "I'm an adult": "I'm an adult",
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
    "You are muting the user.": "Du hast die Benutzerin stumm geschaltet.",
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
    "Want to post and reply to other posts? Enter your username and an app password below. (optional)": `Willst du selbst einen Hashtag Thread
        schreiben und auf Posts anderer Benutzerinnen antworten können? Dann gib deinen BlueSky Benutzernamen und ein
        <a href="https://bsky.app/settings/app-passwords">App Passwort</a> an. (Optional)`,
    "Account, e.g. badlogic.bsky.social": "Account, z.B. badlogic.bsky.social",
    "App password": "App Passwort",
    "Go live!": "Los geht's!",
    "Your credentials will only be stored on your device.": "Deine Benutzerdaten werden nur auf deinem Gerät gespeichert.",
    "Log out": "Abmelden",
    "How does it work?": "Wie funktioniert es?",
    "Trending hashtags": "Hashtag Trends",
    footer: `<a href="https://skychat.social" target="_blank">Skychat</a>
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
        `Du hast für den Hashtag ${hashtag} bereits einen bestehenden <a href="${rootUrl}">Thread</a>`,
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
    "(Possibly, once it's done, work-in-progress :D)": "(Möglicherweise, wenn sie fertig ist, work-in-progress :D)",
    "Sign up": "Account erstellen",
    "Sign in": "Anmelden",
    "Invalid account or password.": "Invalider Benutzername oder Passwort.",
    Quotes: "Zitate",
    Reposts: "Reposts",
    "Mute Thread": "Thread ",
    "Mute User": "Benutzerin stummschalten",
    "Unmute User": "Stummschaltung aufheben",
    "Block User": "Benutzerin blockieren",
    "Unblock User": "Blockierung aufheben",
    "Delete Post": "Post löschen",
    "Post by muted user": "Post einer stummgeschaltenen Benutzerin",
    "Post by blocked user": "Post einer geblockten Benutzerin",
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
    "Search for": "Suche",
    Users: "Benutzerinnen",
    Feeds: "Feeds",
    "Suggested follows": "Spannende Benutzerinnen",
    "Suggested feeds": "Spannende Feeds",
    "Enter search terms above to find posts": "Gib Suchbegriffe ein",
    "Created by": "Erstellt von",
    likes: "likes",
    Add: "Hinzufügen",
    Remove: "Entfernen",
    "Pinned Feeds": "Angehefteten Feeds",
    "Saved Feeds": "Gespeicherte Feeds",
    "Discover more feeds": "Entdecke mehr Feeds",
    "Couldn't load your feeds": "Konnte deine Feeds nicht laden",
    Feed: "Feed",
    "Could not load feed": "Konnte Feed nicht laden",
    "Could not load list feed": "Konnte Listen Feed nicht laden",
    "You don't have pinned feeds": "Keine angehefteten Feeds vorhanden",
    "You don't have saved feeds": "Keine gespeicherten Feeds vorhanden",
    Edit: "Editieren",
    Save: "Speichern",
    "Search my posts": "Nur in meinen Posts suchen",
    "Open in Bluesky": "In BlueSky App öffnen",
    "Push notifications": "Push Notifikationen",
    Enabled: "Aktiviert",
    "New follower": "Neuer Follower",
    Replies: "Antworten",
    Mentions: "Mentions", // FIXME
    "Copy link": "Link kopieren",
    "Copied link to clipboard": "Link in Zwischenablage kopiert",
    List: "Liste",
    Lists: "Listen",
    "Moderation Lists": "Moderations Listen",
    "Curation list": "Kuratierte Liste",
    "Moderation list": "Moderations Liste",
    "Feeds by me": "Feeds von mir",
    "Couldn't mute user": "Konnte Benutzerin nicht stumm schalten",
    "Couldn't unmute user": "Konnte Stummschaltung der Benutzerin nicht aufheben",
    "Couldn't block user": "Konnte Benutzerin nicht blockieren",
    "Couldn't unblock user": "Konnte Blockierung der Benutzerin nicht aufheben",
    "Post does not exist": "Post existiert nicht",
    "Post author has blocked you": "Autor des Posts blockiert dich",
    "You have blocked the post author": "Du blockierst den Autor des Posts",
    "User Interface": "Benutzeroberfläche",
    "Muted users": "Stummgeschaltene Benutzerinnen",
    "Blocked users": "Blockierte Benutzerinnen",
    "Allow pinch-zoom": "Pinch-Zoom erlauben",
    "is following you": (handle: string) => handle + " folgt dir",
    "liked your post": (handle: string) => handle + " hat dein Post geliked",
    "quoted your post": (handle: string) => handle + " hat dich zitiert",
    "replied to your post": (handle: string) => handle + " hat dir geantwortet",
    "reposted your post": (handle: string) => handle + " hat dein Post reposted",
    "mentioned you": (handle: string) => handle + " hat dich erwähnt",
    "You have a new notification": "Du hast eine neue Notifikation",
    "New notification": "Neue Notifikation",
    "Couldn't load your lists": "Konnte deine Listen nicht laden",
    "You have not created feeds yourself yet": "Du hast selbst noch keine Feeds kreirt",
    "Saved Lists": "Gespeicherte Listen",
    "You don't have saved lists": "Keine gespeicherten Listen vorhanden",
    "Lists by me": "Listen von mir",
    "Create a new list": "Neue Liste erstellen",
    "New List": "Neue Liste",
    "New Moderation List": "Neue Moderations Liste",
    "Edit List": "Liste editieren",
    "Edit Moderation List": "Moderations Liste editieren",
    Name: "Name",
    Description: "Beschreibung",
    "Name is required": "Name erforderlich",
    "E.g. 'Cool people'": "Z.B. 'Coole Leute'",
    "Add people": "Benutzerin hizufügen",
    "Members of": (name: string) => "Mitglieder von " + name,
    "Explore without an Account": "Entdecke BlueSky ohne Account",
    Explore: "Entdecken",
    "Explore BlueSky with": "Entdecke BlueSky mit",
    "Search people": "Leute suchen",
    "Search posts": "Posts suchen",
    "Search feeds": "Feeds suchen",
    "explore-header": `Willkommen bei <a href="https://bsky.app">BlueSky</a>`,
    "(Viewed through Skychat)": "(Betrachtet via Skychat)",
    "explore-callout": `Runterscrollen und <span class="text-blue-500 font-bold">BlueSky ohne Account entdecken</span> oder ...`,
    "Hello, Anyone There?": "Hallo, ist da wer?",
    "explore-box-1-text-1": `Nicht jeder hat den Sprung schon gewagt. Aber es ist gemütlich und es gibt viele nette Leute hier. Wir haben sogar einen <span class="text-blue-500 font-bold">echten George Takei</span>`,
    "I need George Takei in my life": "Ich will George Takei",
    "(You can view all users' followers, followings, posts, media, likes, feeds, and lists)":
        "(Du kannst hier die Follower, Followings, Posts, Medien, Likes, Feeds und Listen aller Benutzerinnen durchstöbern)",
    "My God, It's Full of Posts": "Mein Gott, es ist voller Beiträge",
    "explore-box-2-text-1":
        "Hier geht's ähnlich zu, wie im Netzwerk das nicht genannt werden soll. Nur (fast) ohne Nazis. Während wir Hashtags noch üben müssen, kann man Beiträge super einfach finden.",
    "explore-box-2-text-2": `Hier, die letzten 3 Beiträge über <span class="text-blue-500 font-bold">Godzilla</span>. Warum nicht?`,
    "Do you want to see more?": "Willst du mehr sehen?",
    "Your Feeds, Your Choice": "Deine Feeds, Deine Wahl",
    "explore-box-3-text-1":
        "BlueSky respektiert deine Timeline - Beiträge von Personen, denen du folgst, in chronologischer Reihenfolge, unberührt von Algorithmen.",
    "explore-box-3-text-2": `Möchtest du etwas Abwechslung? Wähle <a href="https://blueskyweb.xyz/blog/7-27-2023-custom-feeds" target="_blank" class="font-bold">algorithmisch oder manuell kuratierte Feeds</a> und stolpere in neue Themen und Communities hinein.`,
    "explore-box-3-text-3":
        "Zudem kannst du deine eigenen Feeds erstellen und teilen, oder einfach Listen von Nutzern zusammenstellen, deren Beiträge du getrennt von deinem Haupt-Feed sehen möchtest.",
    "Time for some ...": "Zeit für etwas ...",
    "(or how I learned to love the algorithm)": "(oder wie ich den Algorithmus lieben lernte)",
    Entertainment: "Unterhaltung",
    News: "Nachrichten",
    Science: "Wissenschaft",
    "E.g. names, keywords, ...": "Z.B. Names, phrasen, ...",
    "(Click on a post to view the entire thread)": "(Auf Post klicken, um ganzen Thread anzuzeigen)",
    people: "Benutzerinnen",
    "Couldn't add user to list": "Konnte Benutzerin nicht zur Liste hinzufügen",
    "Couldn't save list": "Konnte Liste nicht speichern",
    "Saving list": "Speichere Liste",
    Joined: "Hier seit",
    "Content filtering": "Content Filter",
    "Muted words": "Stummgeschaltete Wörter",
    "Muted Words": "Stummgeschaltete Wörter",
    "Muted threads": "Stummgeschaltete Threads",
    "Muted Threads": "Stummgeschaltete Threads",
    "Moderation lists": "Stummgeschaltete Listen",
    "I'm an adult": "I'm an adult",
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
