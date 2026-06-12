const ABI = [
  "function owner() view returns (address)",
  "function requestCount() view returns (uint256)",
  "function certificateCount() view returns (uint256)",
  "function hasApplied(address student) view returns (bool)",
  "function getRequestIds() view returns (uint256[])",
  "function requests(uint256) view returns (uint256 id, address student, string studentName, string certificateTitle, string achievementDescription, string evidenceUrl, string aiSuggestion, uint256 aiScore, string aiReason, string certificateLevel, string metadataURI, uint8 status, uint256 tokenId, string rejectionReason, uint256 submittedAt, uint256 reviewedAt)",
  "function submitRequest(string studentName, string certificateTitle, string achievementDescription, string evidenceUrl) returns (uint256)",
  "function storeAIReview(uint256 requestId, string aiSuggestion, uint256 aiScore, string aiReason, string certificateLevel, string metadataURI)",
  "function approveRequest(uint256 requestId)",
  "function rejectRequest(uint256 requestId, string reason)",
  "function mintCertificate(uint256 requestId) returns (uint256)",
  "event RequestSubmitted(uint256 indexed requestId, address indexed student, string certificateTitle)",
  "event AIReviewStored(uint256 indexed requestId, string aiSuggestion, uint256 aiScore, string certificateLevel)",
  "event RequestApproved(uint256 indexed id)",
  "event RequestRejected(uint256 indexed id)",
  "event NFTMinted(uint256 indexed requestId, uint256 indexed tokenId, address indexed student)"
];

const STATUS_NAMES = ["Pending", "AIReviewed", "Approved", "Rejected", "Completed"];
const AI_REVIEW_URL = "http://localhost:3001/api/ai-review";
const LOCAL_RPC_URLS = ["http://127.0.0.1:8545", "http://localhost:8545"];

const state = {
  provider: null,
  readProvider: null,
  signer: null,
  contract: null,
  readContract: null,
  account: null
};

const elements = {
  connectWalletBtn: document.querySelector("#connectWalletBtn"),
  forgetWalletBtn: document.querySelector("#forgetWalletBtn"),
  loadContractBtn: document.querySelector("#loadContractBtn"),
  contractAddress: document.querySelector("#contractAddress"),
  walletAddress: document.querySelector("#walletAddress"),
  networkName: document.querySelector("#networkName"),
  ownerAddress: document.querySelector("#ownerAddress"),
  submitForm: document.querySelector("#submitForm"),
  submitBtn: document.querySelector("#submitBtn"),
  studentName: document.querySelector("#studentName"),
  certificateTitle: document.querySelector("#certificateTitle"),
  achievementDescription: document.querySelector("#achievementDescription"),
  evidenceUrl: document.querySelector("#evidenceUrl"),
  aiReviewResult: document.querySelector("#aiReviewResult"),
  reviewRequestId: document.querySelector("#reviewRequestId"),
  approveBtn: document.querySelector("#approveBtn"),
  mintBtn: document.querySelector("#mintBtn"),
  rejectBtn: document.querySelector("#rejectBtn"),
  rejectReason: document.querySelector("#rejectReason"),
  refreshBtn: document.querySelector("#refreshBtn"),
  clearLogBtn: document.querySelector("#clearLogBtn"),
  requestList: document.querySelector("#requestList"),
  requestCount: document.querySelector("#requestCount"),
  eventLog: document.querySelector("#eventLog")
};

async function connectWallet() {
  if (!window.ethereum) {
    addLog("MetaMask is not available in this browser.");
    return;
  }

  state.provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const selectedAccount = ethers.getAddress(accounts[0]);
  state.signer = await state.provider.getSigner(selectedAccount);
  state.account = selectedAccount;

  const network = await state.provider.getNetwork();
  elements.walletAddress.textContent = state.account;
  elements.networkName.textContent = `${network.name} (${network.chainId})`;
  elements.connectWalletBtn.textContent = "Wallet Connected";

  const address = elements.contractAddress.value.trim();
  if (ethers.isAddress(address)) {
    await loadContract();
  }
}

async function forgetWallet() {
  state.provider = null;
  state.signer = null;
  state.contract = null;
  state.readContract = null;
  state.account = null;

  elements.walletAddress.textContent = "Not connected";
  elements.networkName.textContent = "Unknown";
  elements.ownerAddress.textContent = "Not loaded";
  elements.connectWalletBtn.textContent = "Connect Wallet";
  elements.requestList.innerHTML = "";
  elements.requestCount.textContent = "0 requests";

  addLog("Frontend wallet state cleared. Switch account in MetaMask, then click Connect Wallet again.");
}

async function loadContract() {
  if (!state.signer) {
    await connectWallet();
  }

  const readProvider = await getLocalReadProvider();
  if (!readProvider) {
    addLog("Cannot connect to Hardhat RPC on 8545. Make sure npm run node is still running.");
    return;
  }

  const address = elements.contractAddress.value.trim();
  if (!ethers.isAddress(address)) {
    addLog("Enter a valid contract address.");
    return;
  }

  const code = await readProvider.getCode(address);
  if (code === "0x") {
    addLog("No contract found at this address. Paste the deployed contract address, or redeploy after restarting Hardhat node.");
    return;
  }

  await warnIfMetaMaskNetworkMismatch();

  const contract = new ethers.Contract(address, ABI, state.signer);
  const readContract = new ethers.Contract(address, ABI, readProvider);
  // owner 是合約 constructor 記錄的部署者；第一個連前端的使用者不能改變它。
  const owner = await readContract.owner();

  state.readProvider = readProvider;
  state.contract = contract;
  state.readContract = readContract;
  elements.ownerAddress.textContent = owner;

  bindContractEvents();
  await refreshRequests();
  addLog(`Contract loaded: ${address}`);
}

function bindContractEvents() {
  state.readContract.removeAllListeners();

  state.readContract.on("RequestSubmitted", async (requestId, student, certificateTitle, event) => {
    addLog(`Request #${requestId} submitted by ${student} for "${certificateTitle}". Tx: ${event.log.transactionHash}`);
    await refreshRequests();
  });

  state.readContract.on("AIReviewStored", async (requestId, aiSuggestion, aiScore, certificateLevel, event) => {
    addLog(`AI review stored for request #${requestId}: ${aiSuggestion}, ${aiScore}/100, ${certificateLevel}. Tx: ${event.log.transactionHash}`);
    await refreshRequests();
  });

  state.readContract.on("RequestApproved", async (id, event) => {
    addLog(`Request #${id} approved. Tx: ${event.log.transactionHash}`);
    await refreshRequests();
  });

  state.readContract.on("RequestRejected", async (id, event) => {
    addLog(`Request #${id} rejected. Tx: ${event.log.transactionHash}`);
    await refreshRequests();
  });

  state.readContract.on("NFTMinted", async (requestId, tokenId, student, event) => {
    addLog(`Token #${tokenId} minted for ${student} from request #${requestId}. Tx: ${event.log.transactionHash}`);
    await refreshRequests();
  });
}

async function submitApplication(event) {
  event.preventDefault();
  if (!ensureContract()) return;

  const studentName = elements.studentName.value.trim();
  const certificateTitle = elements.certificateTitle.value.trim();
  const achievementDescription = elements.achievementDescription.value.trim();
  const evidenceUrl = elements.evidenceUrl.value.trim();

  if (!studentName || !certificateTitle || !achievementDescription || !evidenceUrl) {
    addLog("Fill in student name, certificate title, achievement description, and evidence URL before submitting.");
    return;
  }

  if (!isHttpUrl(evidenceUrl)) {
    addLog("Evidence URL must start with http:// or https://.");
    return;
  }

  state.account = await state.signer.getAddress();
  const alreadyApplied = await state.readContract.hasApplied(state.account);
  if (alreadyApplied) {
    addLog("This student wallet already submitted an application. Switch to another student account.");
    return;
  }

  addLog("Requesting AI review from the backend server.");
  elements.submitBtn.disabled = true;

  // 送出鏈上申請前先取得 AI 審核結果，但 AI 只作為 Teacher 參考。
  const aiReview = await requestAIReview({
    studentName,
    certificateTitle,
    achievementDescription,
    evidenceUrl
  });
  renderAIReview(aiReview);

  // 第一筆交易：在鏈上建立學生申請。
  addLog("AI review received. Confirm the application transaction in MetaMask.");
  const submitTx = await state.contract.submitRequest(
    studentName,
    certificateTitle,
    achievementDescription,
    evidenceUrl
  );

  addLog(`Submit transaction sent: ${submitTx.hash}`);
  const submitReceipt = await submitTx.wait();
  const requestId = getSubmittedRequestId(submitReceipt);
  const metadataURI = buildMetadataURI({
    studentName,
    certificateTitle,
    achievementDescription,
    evidenceUrl,
    aiReview
  });

  // 第二筆交易：把 AI 結果寫入合約，讓 Teacher 核准前可以查看。
  addLog(`Confirm the AI review storage transaction for request #${requestId} in MetaMask.`);
  const tx = await state.contract.storeAIReview(
    requestId,
    aiReview.aiSuggestion,
    aiReview.score,
    aiReview.reason,
    aiReview.certificateLevel,
    metadataURI
  );

  addLog(`AI review storage transaction sent: ${tx.hash}`);
  await tx.wait();
  elements.submitForm.reset();
  elements.submitBtn.disabled = false;
  await refreshRequests();
}

async function approveRequest() {
  if (!ensureContract()) return;
  const requestId = getReviewRequestId();
  if (!requestId) return;

  // 智能合約會檢查只有 owner 可操作，且狀態必須是 AIReviewed。
  const tx = await state.contract.approveRequest(requestId);
  addLog(`Approve transaction sent: ${tx.hash}`);
  await tx.wait();
  await refreshRequests();
}

async function rejectRequest() {
  if (!ensureContract()) return;
  const requestId = getReviewRequestId();
  const reason = elements.rejectReason.value.trim();
  if (!requestId || !reason) {
    addLog("Request ID and reject reason are required.");
    return;
  }

  const tx = await state.contract.rejectRequest(requestId, reason);
  addLog(`Reject transaction sent: ${tx.hash}`);
  await tx.wait();
  elements.rejectReason.value = "";
  await refreshRequests();
}

async function mintCertificate() {
  if (!ensureContract()) return;
  const requestId = getReviewRequestId();
  if (!requestId) return;

  // 只有 Teacher 核准後才能鑄造；Rejected 或 AIReviewed 狀態都會被合約擋下。
  const tx = await state.contract.mintCertificate(requestId);
  addLog(`Mint transaction sent: ${tx.hash}`);
  await tx.wait();
  await refreshRequests();
}

async function refreshRequests() {
  if (!ensureContract(false)) return;

  const ids = await state.readContract.getRequestIds();
  const requests = await Promise.all(ids.map((id) => state.readContract.requests(id)));
  renderRequests(requests);
}

function renderRequests(requests) {
  elements.requestCount.textContent = `${requests.length} request${requests.length === 1 ? "" : "s"}`;

  if (!requests.length) {
    elements.requestList.innerHTML = '<div class="empty-state">No certificate requests yet.</div>';
    return;
  }

  elements.requestList.innerHTML = requests
    .map((request) => {
      const statusName = STATUS_NAMES[Number(request.status)];
      const statusClass = statusName.toLowerCase();
      const tokenText = Number(request.tokenId) > 0 ? `Token #${request.tokenId}` : "No token";
      const reason = request.rejectionReason ? `Reason: ${escapeHtml(request.rejectionReason)}` : "";
      const evidence = formatEvidenceLink(request.evidenceUrl);
      const aiSummary = request.aiSuggestion
        ? `
            <p>AI: ${escapeHtml(request.aiSuggestion)} - ${request.aiScore}/100 - ${escapeHtml(request.certificateLevel)}</p>
            <p>AI reason: ${escapeHtml(request.aiReason)}</p>
          `
        : "<p>AI: Not reviewed yet</p>";

      return `
        <article class="request-card">
          <div class="request-id">#${request.id}</div>
          <div class="request-main">
            <h3>${escapeHtml(request.certificateTitle)}</h3>
            <p>${escapeHtml(request.studentName)} - ${request.student}</p>
            <p>Achievement: ${escapeHtml(request.achievementDescription)}</p>
            <p>Evidence: ${evidence}</p>
            ${aiSummary}
            <p>${escapeHtml(request.metadataURI || "No metadata URI yet")} - ${tokenText}</p>
            ${reason ? `<p>${reason}</p>` : ""}
          </div>
          <span class="badge ${statusClass}">${statusName}</span>
        </article>
      `;
    })
    .join("");
}

async function requestAIReview(payload) {
  const response = await fetch(AI_REVIEW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result) {
    throw new Error(result?.reason || `AI review server returned HTTP ${response.status}`);
  }

  const normalized = {
    aiSuggestion: String(result.aiSuggestion || "Needs Review"),
    score: Number(result.score),
    reason: String(result.reason || "AI did not provide a reason."),
    certificateLevel: String(result.certificateLevel || "None"),
    metadataDescription: String(result.metadataDescription || "")
  };

  if (!Number.isInteger(normalized.score) || normalized.score < 0 || normalized.score > 100) {
    throw new Error("AI review server returned an invalid score.");
  }

  return normalized;
}

function renderAIReview(review) {
  elements.aiReviewResult.classList.remove("empty-state");
  elements.aiReviewResult.innerHTML = `
    <h3>AI Review Result</h3>
    <dl>
      <dt>Suggestion</dt>
      <dd>${escapeHtml(review.aiSuggestion)}</dd>
      <dt>Score</dt>
      <dd>${review.score}/100</dd>
      <dt>Level</dt>
      <dd>${escapeHtml(review.certificateLevel)}</dd>
      <dt>Reason</dt>
      <dd>${escapeHtml(review.reason)}</dd>
      <dt>Metadata</dt>
      <dd>${escapeHtml(review.metadataDescription)}</dd>
    </dl>
  `;
}

function getSubmittedRequestId(receipt) {
  for (const log of receipt.logs) {
    try {
      const parsed = state.contract.interface.parseLog(log);
      if (parsed?.name === "RequestSubmitted") {
        return parsed.args.requestId;
      }
    } catch (_error) {
      // 忽略其他合約發出的 log。
    }
  }

  throw new Error("Could not find RequestSubmitted event in the transaction receipt.");
}

function buildMetadataURI({ studentName, certificateTitle, achievementDescription, evidenceUrl, aiReview }) {
  // 本機 demo 直接用 data URI 保存 metadata，不另外上傳 JSON 到 IPFS。
  const metadata = {
    name: certificateTitle,
    description: aiReview.metadataDescription || achievementDescription,
    attributes: [
      { trait_type: "Student", value: studentName },
      { trait_type: "Evidence URL", value: evidenceUrl },
      { trait_type: "AI Suggestion", value: aiReview.aiSuggestion },
      { trait_type: "AI Score", value: aiReview.score },
      { trait_type: "Certificate Level", value: aiReview.certificateLevel }
    ]
  };

  return `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function formatEvidenceLink(value) {
  if (!isHttpUrl(value)) {
    return escapeHtml(value || "No evidence URL");
  }

  return `<a href="${escapeAttribute(value)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`;
}

function getReviewRequestId() {
  const requestId = Number(elements.reviewRequestId.value);
  if (!Number.isInteger(requestId) || requestId < 1) {
    addLog("Enter a valid request ID.");
    return null;
  }
  return requestId;
}

function ensureContract(showMessage = true) {
  if (!state.contract || !state.readContract) {
    if (showMessage) addLog("Connect wallet and load the contract first.");
    return false;
  }
  return true;
}

async function getLocalReadProvider() {
  for (const rpcUrl of LOCAL_RPC_URLS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const network = await provider.getNetwork();
      if (network.chainId === 31337n) {
        addLog(`Hardhat RPC connected: ${rpcUrl}`);
        return provider;
      }
    } catch (_error) {
      // 嘗試下一個本機 RPC URL。
    }
  }
  return null;
}

async function warnIfMetaMaskNetworkMismatch() {
  try {
    const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    const chainId = BigInt(chainIdHex);
    if (chainId !== 31337n) {
      addLog(`Warning: MetaMask is on chain ${chainId}. Switch to Hardhat Local (31337) before sending transactions.`);
    }
  } catch (error) {
    addLog(`Warning: cannot read MetaMask network. ${getErrorMessage(error)}`);
  }
}

function addLog(message) {
  const item = document.createElement("li");
  item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  elements.eventLog.prepend(item);
}

function runAction(action) {
  action().catch((error) => {
    elements.submitBtn.disabled = false;
    addLog(`Error: ${getErrorMessage(error)}`);
  });
}

function getErrorMessage(error) {
  const detail = getNestedErrorMessage(error);
  const message = detail || "Unknown error";

  if (message.includes("user rejected")) {
    return "Transaction was rejected in MetaMask.";
  }

  if (message.includes("Student already submitted")) {
    return "This student wallet already submitted an application. Switch to another student account.";
  }

  if (message.includes("Only student or teacher")) {
    return "Only the student wallet or Teacher wallet can store the AI review.";
  }

  if (message.includes("Unauthorized")) {
    return "Only the Teacher wallet can do this action.";
  }

  if (message.includes("InvalidStatus")) {
    return "This action is not allowed in the current request status. AI review must be stored before approval or rejection, and only approved requests can be minted.";
  }

  if (message.includes("Failed to fetch")) {
    return "Cannot reach the AI review server. Start it with npm run server, then submit again.";
  }

  if (message.includes("missing revert data") || message.includes("could not decode result data")) {
    return "Cannot read this contract. Check that MetaMask is on Hardhat Local and the pasted address is the latest deployed contract address.";
  }

  if (message.includes("could not coalesce error")) {
    return "MetaMask returned an RPC error. Restart Hardhat node, switch MetaMask to Hardhat Local (31337), then redeploy and paste the new contract address.";
  }

  return message;
}

function getNestedErrorMessage(error) {
  const candidates = [
    error?.shortMessage,
    error?.reason,
    error?.info?.error?.message,
    error?.info?.payload?.error?.message,
    error?.payload?.error?.message,
    error?.error?.data?.message,
    error?.error?.message,
    error?.data?.message,
    error?.message
  ];

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }

  try {
    return JSON.stringify(error);
  } catch (_jsonError) {
    return "";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

elements.connectWalletBtn.addEventListener("click", () => runAction(connectWallet));
elements.forgetWalletBtn.addEventListener("click", () => runAction(forgetWallet));
elements.loadContractBtn.addEventListener("click", () => runAction(loadContract));
elements.submitForm.addEventListener("submit", (event) => runAction(() => submitApplication(event)));
elements.approveBtn.addEventListener("click", () => runAction(approveRequest));
elements.rejectBtn.addEventListener("click", () => runAction(rejectRequest));
elements.mintBtn.addEventListener("click", () => runAction(mintCertificate));
elements.refreshBtn.addEventListener("click", () => runAction(refreshRequests));
elements.clearLogBtn.addEventListener("click", () => {
  elements.eventLog.innerHTML = "";
});

if (window.ethereum) {
  window.ethereum.on("accountsChanged", (accounts) => {
    const nextAccount = accounts[0] ? ethers.getAddress(accounts[0]) : "Not connected";
    addLog(`MetaMask account changed: ${nextAccount}. Click Connect Wallet again before sending transactions.`);
    state.signer = null;
    state.contract = null;
    state.account = null;
    elements.walletAddress.textContent = nextAccount;
    elements.connectWalletBtn.textContent = "Connect Wallet";
  });
  window.ethereum.on("chainChanged", () => {
    addLog("MetaMask network changed. Click Connect Wallet and Load again.");
    state.signer = null;
    state.contract = null;
    elements.connectWalletBtn.textContent = "Connect Wallet";
  });
}
