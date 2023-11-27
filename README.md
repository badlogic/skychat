# skychat

A better BlueSky client.

## Setup

-   Put `firebase-credentials.json` in `~/`.
-   `export SKYCHAT_DB_PASSWORD=<some-password>`
-   `export SKYCHAT_OPENAI=<openai-api-key>`

### Development

```
./docker/control.sh startdev
npm run dev
```

You can find endpoints here:

-   Frontend: https://localhost:8080
-   Backend: https://localhost:3333
-   Posgres: localhost:5432

### Deployment

On your machine with the recent changes checked out:

```
./publish.sh server
```

This will (re-)load the server and frontend.

```
./publish.sh
```

Will only deploy frontend code and data.
