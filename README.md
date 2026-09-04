# rockygpt-ui

The RockyGPT web app: routes, API handlers, and React components.

Answering happens in `rockygpt-brain`, reached over HTTP. What lives here is the
browser's edge of the product — the chat surface, the modals, and HTTP proxies
to the Brain. The data repository publishes trusted campus data for the Brain;
it is not a separate runtime service.

## Running

    npm install
    cp .env.example .env      # set BRAIN_URL
    npm run dev

The Brain must be running for chat to work. Each JSON chat request contains only
`messages`, with the complete ordered user and assistant conversation. The UI
renders the returned answer and citations. An answer can explain missing or
stale campus data; transport and validation failures remain explicit errors.

The existing campus panels depend on their corresponding Brain data endpoints.
Panels whose endpoints are not implemented show an unavailable state.
