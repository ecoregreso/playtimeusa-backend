# PlaytimeUSA Backend

1. Install dependencies: npm install
2. Run locally: node server.js
3. Deploy on Render as a Node.js Web Service
4. API endpoint: POST /api/cashier/voucher
An Express + MongoDB API that powers the PlaytimeUSA voucher-driven casino experience. The service issues cashier vouchers, authenticates players, manages spins, and tracks transactions for financial reporting.

# playtime-backend
# playtime-backend
## Prerequisites
- Node.js 20.x LTS (ships with npm 10)
- MongoDB Atlas or a self-hosted MongoDB connection string stored in `DB_URI`
- A JWT signing secret stored in `JWT_SECRET`
- Optional: `FRONTEND_URL` to customise the login link embedded in vouchers (defaults to `http://localhost:5173`)

## Environment Configuration
1. Copy `.env.example` to `.env`.
2. Fill in `DB_URI`, `JWT_SECRET`, and any optional overrides.
3. For local MongoDB (e.g. via Docker Compose), use `mongodb://localhost:27017/playtimeusa`.

## Local Development
- Install dependencies: `npm install`
- Start the API with hot reload: `npm run dev`
- Start the API without hot reload: `npm start`
- The Express server listens on `PORT` (defaults to `3000`)

## Testing
- Execute the Jest test suite (runs Supertest integration coverage): `npm test`
- Tests automatically stub database models, so MongoDB is not required during execution
- Set `NODE_ENV=test` when invoking tests from other tooling to bypass the MongoDB connection logic

## Containerised Deployment
### Build the production image
```bash
docker build -t playtimeusa-backend:latest .
```

### Run the stack with Docker Compose
1. Ensure Docker Desktop or the Docker Engine + Compose plugin is installed.
2. Start the API and MongoDB locally:
   ```bash
   docker compose up --build
   ```
3. The API will be available at `http://localhost:3000` and persist MongoDB data in the `mongo-data` volume.
4. To tear everything down (including the volume), run:
   ```bash
   docker compose down --volumes
   ```

### Publish the container image
- Tag a release such as `v1.0.0` and push it to GitHub. The `Docker Publish` workflow builds the Docker image and pushes it to GitHub Container Registry at `ghcr.io/<owner>/playtimeusa-backend`.
- Images may also be built manually:
  ```bash
  docker login ghcr.io -u <github-username>
  docker build -t ghcr.io/<owner>/playtimeusa-backend:latest .
  docker push ghcr.io/<owner>/playtimeusa-backend:latest
  ```

## Render Deployment Blueprint
A ready-to-use Render blueprint is provided at `deploy/render/render.yaml`.
1. Install the [Render CLI](https://render.com/docs/blueprint-spec#deploying-via-the-cli) and authenticate.
2. Deploy the stack:
   ```bash
   render blueprint apply deploy/render/render.yaml
   ```
3. Supply secrets (`JWT_SECRET`) during the deployment prompts. Render provisions a managed MongoDB instance and injects its connection string automatically.
4. Subsequent Git pushes trigger auto-deploys thanks to the `autoDeploy: true` flag.

## Continuous Integration
- `.github/workflows/node.js.yml` runs the Jest suite across Node.js 18, 20, and 22.
- `.github/workflows/docker-publish.yml` builds and publishes the production Docker image on demand or whenever a semver tag (`v*.*.*`) is pushed.

## Syncing Large File Sets
Need to pull in a full set of files from another branch, PR, or release without recreating everything manually? Follow the Git-centric workflow documented in [`docs/operations/bulk-import.md`](docs/operations/bulk-import.md) to fetch, merge, or apply patches in a single command.

## Key Endpoints
- `POST /api/cashier/voucher` – Generates a voucher, transaction record, login URL, and QR code
- `POST /api/player/login` – Authenticates a player with a voucher PIN and issues a JWT
- `POST /api/game/spin` – Consumes a bet, resolves a win/loss, and records transactions
- `GET /api/admin/transactions` – Lists all transactions in descending creation order
- `GET /api/admin/transactions/:userCode` – Lists transactions for a specific player
- `GET /api/admin/financials` – Summarises deposits, bets, wins, and profit across all players
- `GET /api/admin/financials/:userCode` – Summarises deposits, bets, wins, and profit for one player
