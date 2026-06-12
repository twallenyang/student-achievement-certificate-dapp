# Student Achievement Certificate DApp

Blockchain Programming final project for an NFT-based student achievement certificate workflow.

## Features

- Student submits a certificate application.
- Teacher account reviews, approves, rejects, and mints NFT certificates.
- ERC721 NFT stores metadata URI for the completed certificate.
- Frontend connects through MetaMask and ethers.js.
- AI-assisted review server scores each submission before teacher approval.
- Events show submitted, AI-reviewed, approved, rejected, and minted actions.

## Project Structure

```text
contracts/StudentAchievementCertificate.sol  Smart contract
frontend/index.html                          DApp UI
frontend/styles.css                          UI styling
frontend/app.js                              ethers.js integration
scripts/deploy.js                            Hardhat deploy script
server/mock-ai-server.js                     Optional bonus server
test/StudentAchievementCertificate.test.js   Contract tests
docs/demo-checklist.md                       Demo flow
docs/oral-defense.md                         Defense notes
docs/ai-usage-report.md                      AI usage report
```

## Setup

```bash
npm install
npm run compile
npm test
```

## Local Demo

Start a local blockchain:

```bash
npm run node
```

Deploy in another terminal:

```bash
npm run deploy:localhost
```

Start the AI review server:

```bash
npm run server
```

Open `frontend/index.html` in a browser, connect MetaMask to `http://127.0.0.1:8545`, import a Hardhat test account, and paste the deployed contract address.

## AI Review Server

Create a local `.env` file and keep it out of Git:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.4-mini
PORT=3001
```

If `OPENAI_API_KEY` is present, the server calls the OpenAI Responses API. If the key is missing, it falls back to the local mock review so the demo can still run.

```bash
npm run server
```

Check the active mode:

```bash
curl http://localhost:3001/health
```

Example request:

```bash
curl -X POST http://localhost:3001/api/ai-review \
  -H "Content-Type: application/json" \
  -d '{"studentName":"Ada Chen","certificateTitle":"Blockchain Award","achievementDescription":"Completed a Solidity NFT certificate DApp with tests and MetaMask integration.","evidenceUrl":"https://github.com/example/student-certificate-dapp"}'
```

## Contract Workflow

```text
Pending -> AIReviewed -> Approved -> Completed
Pending -> AIReviewed -> Rejected
```

AI results are stored on-chain as a reference only. Only the contract owner, acting as the teacher, can approve, reject, or mint certificates.
