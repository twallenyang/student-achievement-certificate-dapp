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
const STATUS_ZH = ["待處理", "AI 已審查", "已核准", "已拒絕", "已完成"]; 
const MOCK_AI_REVIEW_URL = "http://localhost:3001/api/ai-review"; 
const OPENAI_REVIEW_URL = "http://localhost:3001/api/openai-review"; 
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
  openaiReviewBtn: document.querySelector("#openaiReviewBtn"), 
  openaiReviewResult: document.querySelector("#openaiReviewResult"), 
  reviewRequestId: document.querySelector("#reviewRequestId"), 
  approveBtn: document.querySelector("#approveBtn"), 
  mintBtn: document.querySelector("#mintBtn"), 
  rejectBtn: document.querySelector("#rejectBtn"), 
  rejectReason: document.querySelector("#rejectReason"), 
  refreshBtn: document.querySelector("#refreshBtn"), 
  clearLogBtn: document.querySelector("#clearLogBtn"), 
  requestList: document.querySelector("#requestList"), 
  requestCount: document.querySelector("#requestCount"), 
  eventLog: document.querySelector("#eventLog"), 
  // 新增切換按鈕與教師面板元件 
  switchStudentBtn: document.querySelector("#switchStudentBtn"), 
  switchTeacherBtn: document.querySelector("#switchTeacherBtn"), 
  teacherPanel: document.querySelector("#teacherPanel") 
}; 
 
// 視窗切換邏輯 
function switchView(role) { 
  if (role === "student") { 
    elements.switchStudentBtn.classList.add("active"); 
    elements.switchTeacherBtn.classList.remove("active"); 
    elements.submitForm.classList.remove("hidden"); 
    elements.teacherPanel.classList.add("hidden"); 
  } else { 
    elements.switchStudentBtn.classList.remove("active"); 
    elements.switchTeacherBtn.classList.add("active"); 
    elements.submitForm.classList.add("hidden"); 
    elements.teacherPanel.classList.remove("hidden"); 
  } 
} 
 
async function connectWallet() { 
  if (!window.ethereum) { 
    addLog("瀏覽器未安裝 MetaMask。"); 
    return; 
  } 
 
  const previousAccount = getDisplayedWalletAddress(); 
  state.provider = new ethers.BrowserProvider(window.ethereum); 
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }); 
  const selectedAccount = ethers.getAddress(accounts[0]); 
  if (previousAccount && previousAccount !== selectedAccount) { 
    resetWalletScopedFields(); 
  } 
 
  state.signer = await state.provider.getSigner(selectedAccount); 
  state.account = selectedAccount; 
 
  const network = await state.provider.getNetwork(); 
  elements.walletAddress.textContent = state.account; 
  elements.networkName.textContent = `${network.name} (${network.chainId})`; 
  elements.connectWalletBtn.textContent = "已連接錢包"; 
 
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
 
  elements.walletAddress.textContent = "未連接"; 
  elements.networkName.textContent = "未知網路"; 
  elements.ownerAddress.textContent = "尚未載入"; 
  elements.connectWalletBtn.textContent = "連接錢包"; 
  elements.requestList.innerHTML = ""; 
  elements.requestCount.textContent = "0 筆請求"; 
  resetWalletScopedFields(); 
 
  addLog("🔌 已清除前端錢包狀態。如需切換帳號，請在 MetaMask 中操作後再次點擊「連接錢包」。"); 
} 
 
async function loadContract() { 
  if (!state.signer) { 
    await connectWallet(); 
  } 
 
  const originalBtnText = elements.loadContractBtn.textContent; 
  elements.loadContractBtn.disabled = true; 
  elements.loadContractBtn.textContent = "載入中..."; 
 
  try { 
    const readProvider = await getLocalReadProvider(); 
    if (!readProvider) { 
      addLog("無法連接 Hardhat RPC (8545 port)。請確認 npm run node 仍在執行中。"); 
      return; 
    } 
 
    const address = elements.contractAddress.value.trim(); 
    if (!ethers.isAddress(address)) { 
      addLog("請輸入有效的合約地址。"); 
      return; 
    } 
 
    const code = await readProvider.getCode(address); 
    if (code === "0x") { 
      addLog("此地址找不到合約。請確認是否貼錯地址，或 Hardhat 節點重啟後需重新部署。"); 
      return; 
    } 
 
    await warnIfMetaMaskNetworkMismatch(); 
 
    const contract = new ethers.Contract(address, ABI, state.signer); 
    const readContract = new ethers.Contract(address, ABI, readProvider); 
    const owner = await readContract.owner(); 
 
    state.readProvider = readProvider; 
    state.contract = contract; 
    state.readContract = readContract; 
    elements.ownerAddress.textContent = owner; 
 
    bindContractEvents(); 
    await refreshRequests(); 
    addLog(`成功載入合約：${address}`); 
  } finally { 
    elements.loadContractBtn.disabled = false; 
    elements.loadContractBtn.textContent = originalBtnText; 
  } 
} 
 
function bindContractEvents() { 
  state.readContract.removeAllListeners(); 
 
  state.readContract.on("RequestSubmitted", async (requestId, student, certificateTitle, event) => { 
    addLog(`收到新申請！ID: #${requestId}, 學生: ${student}, 標題: "${certificateTitle}"`); 
    await refreshRequests(); 
  }); 
 
  state.readContract.on("AIReviewStored", async (requestId, aiSuggestion, aiScore, certificateLevel, event) => { 
    addLog(`AI 審查已儲存！ID: #${requestId}, 分數: ${aiScore}, 等級: ${certificateLevel}`); 
    await refreshRequests(); 
  }); 
 
  state.readContract.on("RequestApproved", async (id, event) => { 
    addLog(`申請已被核准！ID: #${id}`); 
    await refreshRequests(); 
  }); 
 
  state.readContract.on("RequestRejected", async (id, event) => { 
    addLog(`申請已被拒絕！ID: #${id}`); 
    await refreshRequests(); 
  }); 
 
  state.readContract.on("NFTMinted", async (requestId, tokenId, student, event) => { 
    addLog(`NFT 鑄造成功！Token ID: #${tokenId}, 歸屬學生: ${student} (來源請求 ID: #${requestId})`); 
    await refreshRequests(); 
  }); 
} 
 
async function submitApplication(event) { 
  event.preventDefault(); 
  if (!ensureContract()) return; 
 
  const payload = getApplicationPayload(); 
  if (!payload) return; 
 
  state.account = await state.signer.getAddress(); 
  const owner = await state.readContract.owner();
  if (ethers.getAddress(owner) === ethers.getAddress(state.account)) {
    addLog("老師帳號不能提交學生申請，請切換到學生錢包。");
    return;
  }

  const alreadyApplied = await state.readContract.hasApplied(state.account); 
  if (alreadyApplied) { 
    addLog("此學生錢包已提交過申請，請切換至其他學生帳號。"); 
    return; 
  } 
 
  const originalBtnText = elements.submitBtn.textContent; 
  elements.submitBtn.disabled = true; 
 
  try { 
    addLog("正在向後端請求模擬 AI 審查..."); 
    elements.submitBtn.textContent = "1/3 請求 AI 審查中..."; 
    const aiReview = await requestAIReview(MOCK_AI_REVIEW_URL, payload); 
    renderAIReview(elements.aiReviewResult, "模擬 AI 審查結果", aiReview); 
 
    addLog("獲得 AI 結果，請在 MetaMask 中確認「提交申請」交易。"); 
    elements.submitBtn.textContent = "2/3 請在錢包簽名提交申請..."; 
    const submitTx = await state.contract.submitRequest( 
      payload.studentName, 
      payload.certificateTitle, 
      payload.achievementDescription, 
      payload.evidenceUrl 
    ); 
     
    addLog(`申請交易已送出，等待區塊確認中... (${submitTx.hash})`); 
    elements.submitBtn.textContent = "2/3 等待區塊確認..."; 
    const submitReceipt = await submitTx.wait(); 
    const requestId = getSubmittedRequestId(submitReceipt); 
     
    const metadataURI = buildMetadataURI({ 
      studentName: payload.studentName, 
      certificateTitle: payload.certificateTitle, 
      achievementDescription: payload.achievementDescription, 
      evidenceUrl: payload.evidenceUrl, 
      aiReview 
    }); 
 
 addLog(`申請已上鏈 (ID: #${requestId})。請再次於 MetaMask 簽名以儲存 AI 審查結果。`);
    elements.submitBtn.textContent = "3/3 請在錢包簽名儲存 AI 結果...";
    const tx = await state.contract.storeAIReview(
      requestId,
      aiReview.aiSuggestion,
      aiReview.score,
      aiReview.reason,
      aiReview.certificateLevel,
      metadataURI
    );

    addLog(`AI 儲存交易已送出，等待區塊確認中... (${tx.hash})`);
    elements.submitBtn.textContent = "3/3 等待區塊確認...";
    await tx.wait();
    
    addLog(`流程完成！申請與 AI 結果皆已成功上鏈。`);
    elements.submitForm.reset();
  } finally {
    elements.submitBtn.disabled = false;
    elements.submitBtn.textContent = originalBtnText;
    await refreshRequests();
  }
}

async function previewOpenAIReview() {
  if (!ensureContract()) return;
  const requestId = getReviewRequestId();
  if (!requestId) return;

  const request = await state.readContract.requests(requestId);
  const payload = getPayloadFromRequest(request);

  const originalBtnText = elements.openaiReviewBtn.textContent;
  elements.openaiReviewBtn.disabled = true;
  elements.openaiReviewBtn.textContent = "OpenAI 審查執行中...";
  addLog(`正在為請求 #${requestId} 執行 OpenAI 深度審查...`);
  
  elements.openaiReviewResult.classList.remove("empty-state");
  elements.openaiReviewResult.innerHTML = `<p>等待 OpenAI 回傳請求 #${requestId} 的結果，可能需要幾秒鐘...</p>`;

  try {
    const review = await requestAIReview(OPENAI_REVIEW_URL, payload);
    renderAIReview(elements.openaiReviewResult, `OpenAI 審查結果 (請求 #${requestId})`, review);
    addLog(`OpenAI 審查完成：分數 ${review.score}/100, 等級 ${review.certificateLevel}。`);
  } catch (error) {
    renderReviewError(elements.openaiReviewResult, "OpenAI 審查錯誤", getErrorMessage(error));
    throw error;
  } finally {
    elements.openaiReviewBtn.disabled = false;
    elements.openaiReviewBtn.textContent = originalBtnText;
  }
}

async function handleTeacherAction(actionCallback, btnElement, loadingText, logMessage) {
  if (!ensureContract()) return;
  const requestId = getReviewRequestId();
  if (!requestId) return;

  const originalBtnText = btnElement.textContent;
  btnElement.disabled = true;
  btnElement.textContent = loadingText;

  try {
    const tx = await actionCallback(requestId);
    addLog(`${logMessage}交易已送出，等待區塊確認... (${tx.hash})`);
    await tx.wait();
    addLog(`${logMessage}成功！`);
  } finally {
    btnElement.disabled = false;
    btnElement.textContent = originalBtnText;
    await refreshRequests();
  }
}

async function approveRequest() {
  await handleTeacherAction(
    (id) => state.contract.approveRequest(id), 
    elements.approveBtn, 
    "核准中...", 
    "核准"
  );
}

async function rejectRequest() {
  const reason = elements.rejectReason.value.trim();
  if (!reason) {
    addLog("拒絕操作必須填寫拒絕原因。");
    return;
  }
  await handleTeacherAction(
    (id) => state.contract.rejectRequest(id, reason), 
    elements.rejectBtn, 
    "拒絕中...", 
    "拒絕"
  );
  elements.rejectReason.value = "";
}

async function mintCertificate() {
  await handleTeacherAction(
    (id) => state.contract.mintCertificate(id), 
    elements.mintBtn, 
    "鑄造中...", 
    "鑄造 NFT"
  );
}

async function refreshRequests() {
  if (!ensureContract(false)) return;
  const originalBtnText = elements.refreshBtn.textContent;
  elements.refreshBtn.textContent = "更新中...";

  try {
    const ids = await state.readContract.getRequestIds();
    const requests = await Promise.all(ids.map((id) => state.readContract.requests(id)));
    renderRequests(requests);
  } finally {
    elements.refreshBtn.textContent = originalBtnText;
  }
}

function renderRequests(requests) {
  elements.requestCount.textContent = `共 ${requests.length} 筆請求`;

  if (!requests.length) {
    elements.requestList.innerHTML = '<div class="empty-state">目前還沒有任何證書申請。</div>';
    return;
  }

  elements.requestList.innerHTML = requests
    .map((request) => {
      const statusCode = Number(request.status);
      const statusClass = STATUS_NAMES[statusCode].toLowerCase();
      const statusZh = STATUS_ZH[statusCode];
      
      const tokenText = Number(request.tokenId) > 0 ? `Token #${request.tokenId}` : "尚未鑄造 Token";
      const reason = request.rejectionReason ? `<strong>拒絕原因：</strong>${escapeHtml(request.rejectionReason)}` : "";
      const evidence = formatEvidenceLink(request.evidenceUrl);
      const aiSummary = request.aiSuggestion
        ? `
            <p><strong>AI 評比：</strong>${escapeHtml(request.aiSuggestion)} | 評分：${request.aiScore}/100 | 等級：${escapeHtml(request.certificateLevel)}</p>
            <p><strong>AI 判定理由：</strong>${escapeHtml(request.aiReason)}</p>
          `
        : "<p><strong>AI 狀態：</strong>尚未寫入審查結果</p>";

      return `
        <article class="request-card">
          <div class="request-id">#${request.id}</div>
          <div class="request-main">
            <h3>${escapeHtml(request.certificateTitle)}</h3>
            <p><strong>申請人：</strong>${escapeHtml(request.studentName)} (${request.student})</p>
            <p><strong>成就描述：</strong>${escapeHtml(request.achievementDescription)}</p>
            <p><strong>佐證資料：</strong>${evidence}</p>
            ${aiSummary}
            <p><strong>Metadata：</strong>${escapeHtml(request.metadataURI ? "已產生 URI" : "尚未產生")} - ${tokenText}</p>
            ${reason ? `<p class="error-text">${reason}</p>` : ""}
          </div>
          <div class="status-badge-container">
            <span class="badge ${statusClass}">${statusZh}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

async function requestAIReview(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result) {
    throw new Error(result?.reason || `AI 伺服器回傳錯誤狀態碼 HTTP ${response.status}`);
  }

  const normalized = {
    mode: String(result.mode || ""),
    model: String(result.model || ""),
    aiSuggestion: String(result.aiSuggestion || "Needs Review"),
    score: Number(result.score),
    reason: String(result.reason || "AI 未提供理由"),
    certificateLevel: String(result.certificateLevel || "None"),
    metadataDescription: String(result.metadataDescription || "")
  };

  if (!Number.isInteger(normalized.score) || normalized.score < 0 || normalized.score > 100) {
    throw new Error("AI 伺服器回傳的分數格式無效。");
  }

  return normalized;
}

function getApplicationPayload() {
  const payload = {
    studentName: elements.studentName.value.trim(),
    certificateTitle: elements.certificateTitle.value.trim(),
    achievementDescription: elements.achievementDescription.value.trim(),
    evidenceUrl: elements.evidenceUrl.value.trim()
  };

  if (!payload.studentName || !payload.certificateTitle || !payload.achievementDescription || !payload.evidenceUrl) {
    addLog("請填寫完整的學生姓名、證書標題、成就描述與佐證網址。");
    return null;
  }

  if (!isHttpUrl(payload.evidenceUrl)) {
    addLog("佐證資料網址必須以 http:// 或 https:// 開頭。");
    return null;
  }

  return payload;
}

function getPayloadFromRequest(request) {
  return {
    studentName: String(request.studentName || ""),
    certificateTitle: String(request.certificateTitle || ""),
    achievementDescription: String(request.achievementDescription || ""),
    evidenceUrl: String(request.evidenceUrl || "")
  };
}

function renderAIReview(target, title, review) {
  target.classList.remove("empty-state");
  const modeDetails = review.model ? `<dt>模型</dt><dd>${escapeHtml(review.model)}</dd>` : "";

  target.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <dl>
      <dt>模式</dt><dd>${escapeHtml(review.mode || "mock")}</dd>
      ${modeDetails}
      <dt>建議操作</dt><dd>${escapeHtml(review.aiSuggestion)}</dd>
      <dt>評分</dt><dd>${review.score}/100</dd>
      <dt>核發等級</dt><dd>${escapeHtml(review.certificateLevel)}</dd>
      <dt>判定理由</dt><dd>${escapeHtml(review.reason)}</dd>
      <dt>Metadata</dt><dd>${escapeHtml(review.metadataDescription)}</dd>
    </dl>
    <pre class="review-json">${escapeHtml(JSON.stringify(review, null, 2))}</pre>
  `;
}

function renderReviewError(target, title, message) {
  target.classList.remove("empty-state");
  target.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <p class="error-text">${escapeHtml(message)}</p>
  `;
}

function getSubmittedRequestId(receipt) {
  for (const log of receipt.logs) {
    try {
      const parsed = state.contract.interface.parseLog(log);
      if (parsed?.name === "RequestSubmitted") {
        return parsed.args.requestId;
      }
    } catch (_error) {}
  }
  throw new Error("無法在交易收據中找到 RequestSubmitted 事件。");
}

function buildMetadataURI({ studentName, certificateTitle, achievementDescription, evidenceUrl, aiReview }) {
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
  if (!isHttpUrl(value)) return escapeHtml(value || "無佐證網址");
  return `<a href="${escapeAttribute(value)}" target="_blank" rel="noreferrer">查看連結</a>`;
}

function getReviewRequestId() {
  const requestId = Number(elements.reviewRequestId.value);
  if (!Number.isInteger(requestId) || requestId < 1) {
    addLog("請輸入有效的請求 ID。");
    return null;
  }
  return requestId;
}

function ensureContract(showMessage = true) {
  if (!state.contract || !state.readContract) {
    if (showMessage) addLog("請先連接錢包並載入智能合約！");
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
        return provider;
      }
    } catch (_error) {}
  }
  return null;
}

async function warnIfMetaMaskNetworkMismatch() {
  try {
    const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    const chainId = BigInt(chainIdHex);
    if (chainId !== 31337n) {
      addLog("警告：MetaMask 目前位於其他網路。請切換至 Hardhat Local (31337) 再進行操作。");
    }
  } catch (error) {
    addLog(`無法讀取 MetaMask 網路狀態：${getErrorMessage(error)}`);
  }
}

function addLog(message) {
  const item = document.createElement("li");
  item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  elements.eventLog.prepend(item);
}

function runAction(action) {
  action().catch((error) => {
    addLog(`錯誤：${getErrorMessage(error)}`);
  });
}

function getErrorMessage(error) {
  const detail = getNestedErrorMessage(error);
  const message = detail || "未知錯誤";

  if (message.includes("user rejected")) return "已在 MetaMask 取消交易。";
  if (message.includes("TeacherCannotSubmitApplication")) return "老師帳號不能提交學生申請，請切換到學生錢包。";
  if (message.includes("Student already submitted")) return "此錢包已提交過申請，請切換其他學生帳號。";
  if (message.includes("Only student or teacher")) return "只有提交申請的學生或老師可以儲存 AI 審查結果。";
  if (message.includes("Unauthorized")) return "權限不足：只有合約擁有者 (老師) 可以執行此操作。";
  if (message.includes("InvalidStatus")) return "操作無效：請確認申請目前的狀態 (核准需先有 AI 結果，鑄造需先被核准)。";
  if (message.includes("Failed to fetch")) return "無法連接 AI 伺服器，請確認 npm run server 是否啟動。";
  if (message.includes("missing revert data") || message.includes("could not decode result data")) return "讀取合約失敗，請確認是否切換到 Hardhat Local 網路，且貼上正確的最新部署地址。";
  if (message.includes("could not coalesce error")) return "MetaMask RPC 錯誤。請重啟 Hardhat 節點，切換網路後重新部署合約。";

  return message;
}

function getNestedErrorMessage(error) {
  const candidates = [
    error?.shortMessage, error?.reason, error?.info?.error?.message,
    error?.info?.payload?.error?.message, error?.payload?.error?.message,
    error?.error?.data?.message, error?.error?.message, error?.data?.message, error?.message
  ];
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  try { return JSON.stringify(error); } catch (_jsonError) { return ""; }
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function resetWalletScopedFields() {
  elements.submitForm.reset();
  elements.aiReviewResult.classList.add("empty-state");
  elements.aiReviewResult.textContent = "模擬 AI 審查結果將在提交後顯示於此區塊。";
  elements.openaiReviewResult.classList.add("empty-state");
  elements.openaiReviewResult.textContent = "輸入請求 ID 後執行 OpenAI 審查，結果將顯示於此以便與模擬 AI 進行比對。";
  elements.reviewRequestId.value = "";
  elements.rejectReason.value = "";
  elements.submitBtn.disabled = false;
  elements.openaiReviewBtn.disabled = false;
}

function getDisplayedWalletAddress() {
  if (state.account) return state.account;
  const displayed = elements.walletAddress.textContent.trim();
  return ethers.isAddress(displayed) ? ethers.getAddress(displayed) : null;
}

elements.connectWalletBtn.addEventListener("click", () => runAction(connectWallet));
elements.forgetWalletBtn.addEventListener("click", () => runAction(forgetWallet));
elements.loadContractBtn.addEventListener("click", () => runAction(loadContract));
elements.submitForm.addEventListener("submit", (event) => runAction(() => submitApplication(event)));
elements.openaiReviewBtn.addEventListener("click", () => runAction(previewOpenAIReview));
elements.approveBtn.addEventListener("click", () => runAction(approveRequest));
elements.rejectBtn.addEventListener("click", () => runAction(rejectRequest));
elements.mintBtn.addEventListener("click", () => runAction(mintCertificate));
elements.refreshBtn.addEventListener("click", () => runAction(refreshRequests));
elements.clearLogBtn.addEventListener("click", () => { elements.eventLog.innerHTML = ""; });

// 切換分頁事件監聽
elements.switchStudentBtn.addEventListener("click", () => switchView("student"));
elements.switchTeacherBtn.addEventListener("click", () => switchView("teacher"));

if (window.ethereum) {
  window.ethereum.on("accountsChanged", (accounts) => {
    const nextAccount = accounts[0] ? ethers.getAddress(accounts[0]) : "未連接";
    const previousAccount = getDisplayedWalletAddress();
    if (previousAccount && previousAccount !== nextAccount) resetWalletScopedFields();
    addLog(`MetaMask 帳號已切換：${nextAccount}。操作前請重新點擊「連接錢包」。`);
    state.signer = null;
    state.contract = null;
    state.account = null;
    elements.walletAddress.textContent = nextAccount;
    elements.connectWalletBtn.textContent = "連接錢包";
  });
  window.ethereum.on("chainChanged", () => {
    resetWalletScopedFields();
    addLog("MetaMask 網路已切換，請重新連接錢包並載入合約。");
    state.signer = null;
    state.contract = null;
    elements.connectWalletBtn.textContent = "連接錢包";
  });
}
