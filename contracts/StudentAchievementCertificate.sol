// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC721Receiver {
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}

contract StudentAchievementCertificate {
    // 部署合約的人會成為 Teacher。地址不是寫死的，而是由部署交易的 msg.sender 決定。
    address public owner;
    string public name;
    string public symbol;
    uint256 public requestCount;
    uint256 public certificateCount;

    enum Status {
        // 先存 AI 審核結果，Teacher 再把它當作人工審核參考。
        Pending,
        AIReviewed,
        Approved,
        Rejected,
        Completed
    }

    struct CertificateRequest {
        uint256 id;
        address student;
        string studentName;
        string certificateTitle;
        string achievementDescription;
        string evidenceUrl;
        string aiSuggestion;
        uint256 aiScore;
        string aiReason;
        string certificateLevel;
        string metadataURI;
        Status status;
        uint256 tokenId;
        string rejectionReason;
        uint256 submittedAt;
        uint256 reviewedAt;
    }

    mapping(uint256 => CertificateRequest) public requests;
    mapping(address => bool) public hasApplied;
    mapping(address => uint256[]) private studentRequests;
    uint256[] public requestIds;

    mapping(uint256 => address) private tokenOwners;
    mapping(address => uint256) private tokenBalances;
    mapping(uint256 => string) private tokenURIs;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event RequestSubmitted(uint256 indexed requestId, address indexed student, string certificateTitle);
    event AIReviewStored(
        uint256 indexed requestId,
        string aiSuggestion,
        uint256 aiScore,
        string certificateLevel
    );
    event RequestApproved(uint256 indexed requestId);
    event RequestRejected(uint256 indexed requestId);
    event NFTMinted(uint256 indexed requestId, uint256 indexed tokenId, address indexed student);

    error Unauthorized();
    error InvalidRequestId(uint256 id);
    error InvalidStatus(Status current, Status expected);
    error InvalidTokenId(uint256 tokenId);
    error InvalidReceiver(address receiver);

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    constructor() {
        // constructor 只在部署時執行一次，所以 owner 會固定為部署者地址。
        owner = msg.sender;
        name = "Student Achievement Certificate";
        symbol = "SAC";
    }

    function submitRequest(
        string calldata studentName,
        string calldata certificateTitle,
        string calldata achievementDescription,
        string calldata evidenceUrl
    ) external returns (uint256) {
        require(!hasApplied[msg.sender], "Student already submitted an application");
        require(bytes(studentName).length > 0, "Student name is required");
        require(bytes(certificateTitle).length > 0, "Certificate title is required");
        require(bytes(achievementDescription).length > 0, "Achievement description is required");
        require(_isHttpUrl(evidenceUrl), "Evidence URL must be http or https");

        requestCount += 1;
        uint256 requestId = requestCount;

        requests[requestId] = CertificateRequest({
            id: requestId,
            student: msg.sender,
            studentName: studentName,
            certificateTitle: certificateTitle,
            achievementDescription: achievementDescription,
            evidenceUrl: evidenceUrl,
            aiSuggestion: "",
            aiScore: 0,
            aiReason: "",
            certificateLevel: "",
            metadataURI: "",
            status: Status.Pending,
            tokenId: 0,
            rejectionReason: "",
            submittedAt: block.timestamp,
            reviewedAt: 0
        });

        hasApplied[msg.sender] = true;
        requestIds.push(requestId);
        studentRequests[msg.sender].push(requestId);

        emit RequestSubmitted(requestId, msg.sender, certificateTitle);
        return requestId;
    }

    function storeAIReview(
        uint256 requestId,
        string calldata aiSuggestion,
        uint256 aiScore,
        string calldata aiReason,
        string calldata certificateLevel,
        string calldata metadataURI
    ) external {
        CertificateRequest storage request = _getExistingRequest(requestId);
        if (request.status != Status.Pending) {
            revert InvalidStatus(request.status, Status.Pending);
        }
        // AI 在鏈下後端執行，合約只負責保存後端回傳的審核結果。
        require(msg.sender == request.student || msg.sender == owner, "Only student or teacher can store AI review");
        require(bytes(aiSuggestion).length > 0, "AI suggestion is required");
        require(aiScore <= 100, "AI score must be 0-100");
        require(bytes(aiReason).length > 0, "AI reason is required");
        require(bytes(certificateLevel).length > 0, "Certificate level is required");
        require(bytes(metadataURI).length > 0, "Metadata URI is required");

        request.aiSuggestion = aiSuggestion;
        request.aiScore = aiScore;
        request.aiReason = aiReason;
        request.certificateLevel = certificateLevel;
        request.metadataURI = metadataURI;
        request.status = Status.AIReviewed;

        emit AIReviewStored(requestId, aiSuggestion, aiScore, certificateLevel);
    }

    function approveRequest(uint256 requestId) external onlyOwner {
        CertificateRequest storage request = _getExistingRequest(requestId);
        // Teacher 不能跳過 AI 審核參考步驟直接核准。
        if (request.status != Status.AIReviewed) {
            revert InvalidStatus(request.status, Status.AIReviewed);
        }

        request.status = Status.Approved;
        request.reviewedAt = block.timestamp;

        emit RequestApproved(requestId);
    }

    function rejectRequest(uint256 requestId, string calldata reason) external onlyOwner {
        CertificateRequest storage request = _getExistingRequest(requestId);
        if (request.status != Status.AIReviewed) {
            revert InvalidStatus(request.status, Status.AIReviewed);
        }
        require(bytes(reason).length > 0, "Rejection reason is required");

        request.status = Status.Rejected;
        request.rejectionReason = reason;
        request.reviewedAt = block.timestamp;

        emit RequestRejected(requestId);
    }

    function mintCertificate(uint256 requestId) external onlyOwner returns (uint256) {
        CertificateRequest storage request = _getExistingRequest(requestId);
        // 鑄造 NFT 是最後一步，必須先經過 Teacher 人工核准。
        if (request.status != Status.Approved) {
            revert InvalidStatus(request.status, Status.Approved);
        }

        certificateCount += 1;
        uint256 tokenId = certificateCount;

        request.status = Status.Completed;
        request.tokenId = tokenId;

        _safeMint(request.student, tokenId);
        tokenURIs[tokenId] = request.metadataURI;

        emit NFTMinted(requestId, tokenId, request.student);
        return tokenId;
    }

    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "Zero address has no balance");
        return tokenBalances[account];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address tokenOwner = tokenOwners[tokenId];
        if (tokenOwner == address(0)) {
            revert InvalidTokenId(tokenId);
        }
        return tokenOwner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        return tokenURIs[tokenId];
    }

    function getRequestIds() external view returns (uint256[] memory) {
        return requestIds;
    }

    function getStudentRequests(address student) external view returns (uint256[] memory) {
        return studentRequests[student];
    }

    function getRequestCount() external view returns (uint256) {
        return requestIds.length;
    }

    function _safeMint(address to, uint256 tokenId) private {
        require(to != address(0), "Cannot mint to zero address");
        if (tokenOwners[tokenId] != address(0)) {
            revert InvalidTokenId(tokenId);
        }

        tokenOwners[tokenId] = to;
        tokenBalances[to] += 1;

        emit Transfer(address(0), to, tokenId);

        if (to.code.length > 0) {
            bytes4 response = IERC721Receiver(to).onERC721Received(msg.sender, address(0), tokenId, "");
            if (response != IERC721Receiver.onERC721Received.selector) {
                revert InvalidReceiver(to);
            }
        }
    }

    function _getExistingRequest(uint256 requestId) private view returns (CertificateRequest storage) {
        if (requestId == 0 || requestId > requestCount) {
            revert InvalidRequestId(requestId);
        }
        return requests[requestId];
    }

    function _isHttpUrl(string calldata value) private pure returns (bool) {
        bytes calldata url = bytes(value);

        if (url.length >= 8) {
            bool isHttps = url[0] == "h" &&
                url[1] == "t" &&
                url[2] == "t" &&
                url[3] == "p" &&
                url[4] == "s" &&
                url[5] == ":" &&
                url[6] == "/" &&
                url[7] == "/";
            if (isHttps) {
                return true;
            }
        }

        if (url.length >= 7) {
            return url[0] == "h" &&
                url[1] == "t" &&
                url[2] == "t" &&
                url[3] == "p" &&
                url[4] == ":" &&
                url[5] == "/" &&
                url[6] == "/";
        }

        return false;
    }
}
