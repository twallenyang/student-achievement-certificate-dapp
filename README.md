# Student Achievement Certificate DApp

Blockchain Programming final project: an NFT-based student achievement certificate workflow with MetaMask, ethers.js, Hardhat, a mock AI review flow, and an optional OpenAI review preview for teachers.

## What This Project Does

Students submit certificate applications with an achievement description and evidence URL. The frontend asks the local AI review server for a stable mock review, then stores both the application and mock AI result on-chain. The teacher, which is the contract owner, reviews the request, optionally runs a separate OpenAI preview for comparison, approves or rejects the application, and mints an NFT certificate after approval.

AI is only an assistant. The smart contract enforces that the teacher makes the final approve, reject, and mint decisions.

## Features

- Student certificate application form with MetaMask transaction signing.
- Mock AI review result stored on-chain: suggestion, score, reason, certificate level, and metadata description.
- Optional teacher-only OpenAI review preview through a backend endpoint.
- Owner-only teacher actions: approve, reject, and mint.
- Minimal self-contained ERC721-style certificate NFT implementation.
- On-chain status workflow: `Pending -> AIReviewed -> Approved -> Completed`, or `Pending -> AIReviewed -> Rejected`.
- Activity log for submitted, AI-reviewed, approved, rejected, and minted events.
- Hardhat tests covering permissions, status rules, duplicate application prevention, URL validation, and minting.

## Project Structure

```text
contracts/StudentAchievementCertificate.sol  Smart contract and minimal NFT logic
frontend/index.html                          DApp UI
frontend/styles.css                          UI styling
frontend/app.js                              MetaMask, ethers.js, AI, and contract integration
server/mock-ai-server.js                     Mock AI and optional OpenAI review server
server/frontend-server.js                    Static frontend server
scripts/deploy.js                            Hardhat deployment script
scripts/check-contract.js                    Local deployment checker
test/StudentAchievementCertificate.test.js   Contract tests
docs/完整使用說明.md                          Full Chinese demo guide
docs/02-系統架構與目標.md                      Architecture and goals
docs/03-SmartContract與前端關鍵程式碼.md       Key contract and frontend code notes
docs/demo-checklist.md                       Demo checklist
docs/oral-defense.md                         English oral defense notes
docs/oral-defense.zh-TW.md                   Chinese oral defense script
docs/ai-usage-report.md                      AI usage report
docs/需求符合檢查中文版.md                      Requirement compliance checklist
```

## Requirements

- Node.js and npm
- MetaMask browser extension
- A local browser
- Optional: `OPENAI_API_KEY` for the teacher OpenAI preview

## Setup

```bash
npm install
npm run compile
npm test
```

The current contract test suite should report `8 passing`.

## Local Demo

Use separate terminals for the long-running processes.

1. Start a local Hardhat chain:

```bash
npm run node
```

2. Start the AI review server:

```bash
npm run server
```

3. Start the frontend server:

```bash
npm run frontend
```

4. Deploy the contract in another terminal:

```bash
npm run deploy:localhost
```

5. Open `http://localhost:8000`, connect MetaMask to Hardhat Local, and paste the deployed contract address.

Hardhat Local settings:

```text
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
Currency symbol: ETH
```

The deployer account becomes the teacher owner. In the default Hardhat node, use `Account #0` as the teacher and another account, such as `Account #1`, as the student.

## AI Review Server

Copy `.env.example` to `.env` if you want to enable the optional OpenAI preview:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.4-mini
PORT=3001
```

The default student submit flow always uses `POST /api/ai-review`, which returns deterministic mock review data for a stable demo. The teacher can separately press `Run OpenAI Review`, which calls `POST /api/openai-review` and displays the OpenAI result for comparison. The OpenAI preview does not automatically write to the smart contract.

Health check:

```bash
curl http://localhost:3001/health
```

Example mock review request:

```bash
curl -X POST http://localhost:3001/api/ai-review \
  -H "Content-Type: application/json" \
  -d '{"studentName":"Ada Chen","certificateTitle":"Blockchain Award","achievementDescription":"Completed a Solidity NFT certificate DApp with tests and MetaMask integration.","evidenceUrl":"https://github.com/example/student-certificate-dapp"}'
```

## Contract Workflow

```text
Student submits request
  -> Pending
Mock AI result is stored on-chain
  -> AIReviewed
Teacher approves
  -> Approved
Teacher mints NFT
  -> Completed
```

Reject path:

```text
Pending -> AIReviewed -> Rejected
```

Important rules:

- Each student wallet can submit only one application.
- `evidenceUrl` must start with `http://` or `https://`.
- Only the student wallet or teacher owner can store an AI review.
- Only the teacher owner can approve, reject, or mint.
- Only `AIReviewed` requests can be approved or rejected.
- Only `Approved` requests can be minted.
- Restarting the Hardhat node resets local chain state, so redeploy and paste the new contract address.
