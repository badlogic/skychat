export function setupLiveReload() {
    var socket = new WebSocket("ws://localhost:3333");
    socket.onmessage = (ev) => {
        location.reload();
    };
}
