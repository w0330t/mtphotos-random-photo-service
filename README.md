# random-photo-service

A tiny Express service that redirects `/random.jpg` to a random photo from an upstream MT Photos API.

The service is intended to sit in front of a private MT Photos instance. It fetches the timeline from the internal API, chooses one valid photo at random, obtains an auth code, and returns a `302` redirect to the public proxy URL for that photo.

## Features

- Single endpoint: `GET /random.jpg`
- Simple client-side access token via the `token` query parameter
- Keeps the upstream `API_KEY` on the server side
- Docker-friendly Node.js service

## Requirements

- Node.js 20 or newer
- An MT Photos-compatible API endpoint

## Configuration

Configure the service with environment variables:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `API_KEY` | Yes | - | API key used to call the upstream MT Photos API. |
| `CLIENT_TOKEN` | Yes | - | Token clients must pass as `?token=...` when requesting `/random.jpg`. |
| `PUBLIC_API_URL` | Yes | - | Public base URL used to build the final photo redirect URL. |
| `INTERNAL_API_URL` | No | `http://mtphotos:8063/api` | Internal base URL used by this service to call MT Photos. |
| `PORT` | No | `8064` | Port the Express server listens on. |

The service refuses to start if `API_KEY`, `CLIENT_TOKEN`, or `PUBLIC_API_URL` is missing.

You can start from the included example file:

```bash
cp .env.example .env
```

This project does not load `.env` automatically. Export the variables in your shell, pass them to Docker, or use your deployment platform's environment variable settings.

## Run Locally

```bash
npm install

API_KEY="your-mt-photos-api-key" \
CLIENT_TOKEN="choose-a-long-random-token" \
PUBLIC_API_URL="https://photos.example.com/api" \
INTERNAL_API_URL="http://mtphotos:8063/api" \
PORT=8064 \
node index.js
```

Then request:

```bash
curl -I "http://localhost:8064/random.jpg?token=choose-a-long-random-token"
```

On success, the response is a `302` redirect to a random photo URL.

## Docker

Build the image:

```bash
docker build -t random-photo-service .
```

Run it:

```bash
docker run --rm -p 8064:8064 \
  -e API_KEY="your-mt-photos-api-key" \
  -e CLIENT_TOKEN="choose-a-long-random-token" \
  -e PUBLIC_API_URL="https://photos.example.com/api" \
  -e INTERNAL_API_URL="http://mtphotos:8063/api" \
  random-photo-service
```

## API

### `GET /random.jpg`

Query parameters:

| Parameter | Required | Description |
| --- | --- | --- |
| `token` | Yes | Must match `CLIENT_TOKEN`. |

Responses:

| Status | Description |
| --- | --- |
| `302` | Redirects to a random photo. |
| `401` | Invalid or missing client token. |
| `404` | No valid photos were returned by the upstream timeline API. |
| `500` | Upstream API failed or returned an unexpected response. |

## Security Notes

- Do not commit real `API_KEY` or `CLIENT_TOKEN` values.
- Use a long, random `CLIENT_TOKEN`; anyone with this token can request random photo redirects.
- Put the service behind HTTPS if it is exposed outside a trusted network.
- `API_KEY` is only sent from the server to the upstream API and is not returned to clients.
- The generated photo redirect includes an upstream `auth_code` in the URL. Treat redirected URLs as temporary sensitive links and avoid logging them publicly.
- `node_modules` and local `.env` files are intentionally ignored by Git.
