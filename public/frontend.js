const webSocket = new WebSocket("ws://localhost:3000/ws");

webSocket.addEventListener("message", (event) => {
    const eventData = JSON.parse(event.data);
    if (eventData.type === 'notification') {
        alert(eventData.message);
    } else if (eventData.type === 'chat-message') {
        onNewMessageReceived(eventData.sender, eventData.timestamp, eventData.message);
    }
});

/**
 * Handles sending a message to the server when the user sends a new message.
 */
function onMessageSent(event) {
    event.preventDefault();
    const message = document.getElementById('message').value;
    webSocket.send(JSON.stringify({ type: 'chat-message', message }));
    document.getElementById('message').value = '';
}
