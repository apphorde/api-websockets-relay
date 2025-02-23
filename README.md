# WebSocket relay

A relay for WebSocket communication

## Endpoints

### GET /new

Returns a key to use as session ID

### [ws|wss]://host/hub/[session-id]

Opens a WebSocket connection. All messages sent through this connection are relayed to all the other clients using the same session id.

## Usage

```js
const alice = new WebSocket('ws://host:port/hub/5d256c307df61b1468b06a896d1bfcb0');
const bob = new WebSocket('ws://host:port/hub/5d256c307df61b1468b06a896d1bfcb0');

alice.onmessage = (event) => console.log('Alice received:', event.data);
bob.onmessage = (event) => console.log('Bob received:', event.data);

alice.send('Hi Bob!');
// Bob received: Hi Bob!

bob.send('Hi Alice!');
// Alice received: Hi Alice!

```
