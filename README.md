# rockygpt-ui

The RockyGPT web app: routes, API handlers, and React components.

Answering happens in `rockygpt-brain`, reached over HTTP. What lives here is the
browser's edge of the product — the chat surface, the modals, and HTTP proxies
to the brain and data services.

## Running

    npm install
    cp .env.example .env      # set BRAIN_URL
    npm run dev

The brain must be running for chat to work and data must be running for campus
views. An unavailable dependency produces a 503 rather than a local fallback.
