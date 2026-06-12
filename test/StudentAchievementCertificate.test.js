const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StudentAchievementCertificate", function () {
  async function deployFixture() {
    const [teacher, student, other] = await ethers.getSigners();
    const Contract = await ethers.getContractFactory("StudentAchievementCertificate");
    const certificate = await Contract.deploy();
    return { certificate, teacher, student, other };
  }

  async function submitRequest(certificate, student) {
    await certificate
      .connect(student)
      .submitRequest(
        "Ada Chen",
        "Blockchain Programming Award",
        "Completed a blockchain NFT certificate workflow with Solidity and ethers.js.",
        "https://github.com/example/student-certificate-dapp"
      );
  }

  async function storeAIReview(certificate, student) {
    await certificate
      .connect(student)
      .storeAIReview(
        1,
        "Approve",
        88,
        "The submitted achievement is specific and related to the course objectives.",
        "Silver",
        "data:application/json,%7B%7D"
      );
  }

  it("submits a certificate request", async function () {
    const { certificate, student } = await deployFixture();

    await expect(
      certificate
        .connect(student)
        .submitRequest(
          "Ada Chen",
          "Blockchain Programming Award",
          "Completed a blockchain NFT certificate workflow with Solidity and ethers.js.",
          "https://github.com/example/student-certificate-dapp"
        )
    )
      .to.emit(certificate, "RequestSubmitted")
      .withArgs(1, student.address, "Blockchain Programming Award");

    const request = await certificate.requests(1);
    expect(request.student).to.equal(student.address);
    expect(request.achievementDescription).to.equal(
      "Completed a blockchain NFT certificate workflow with Solidity and ethers.js."
    );
    expect(request.evidenceUrl).to.equal("https://github.com/example/student-certificate-dapp");
    expect(request.status).to.equal(0);
    expect(await certificate.hasApplied(student.address)).to.equal(true);
  });

  it("prevents duplicate applications", async function () {
    const { certificate, student } = await deployFixture();

    await submitRequest(certificate, student);

    await expect(
      certificate
        .connect(student)
        .submitRequest(
          "Ada Chen",
          "Second Award",
          "Completed a second project",
          "https://github.com/example/second-project"
        )
    ).to.be.revertedWith("Student already submitted an application");
  });

  it("requires an http or https evidence URL", async function () {
    const { certificate, student } = await deployFixture();

    await expect(
      certificate
        .connect(student)
        .submitRequest(
          "Ada Chen",
          "Blockchain Programming Award",
          "Completed a blockchain NFT certificate workflow with Solidity and ethers.js.",
          "github.com/example/student-certificate-dapp"
        )
    ).to.be.revertedWith("Evidence URL must be http or https");
  });

  it("stores AI review before teacher decision", async function () {
    const { certificate, student } = await deployFixture();

    await submitRequest(certificate, student);

    await expect(
      certificate
        .connect(student)
        .storeAIReview(
          1,
          "Approve",
          88,
          "The submitted achievement is specific and related to the course objectives.",
          "Silver",
          "data:application/json,%7B%7D"
        )
    )
      .to.emit(certificate, "AIReviewStored")
      .withArgs(1, "Approve", 88, "Silver");

    const request = await certificate.requests(1);
    expect(request.aiSuggestion).to.equal("Approve");
    expect(request.aiScore).to.equal(88);
    expect(request.certificateLevel).to.equal("Silver");
    expect(request.status).to.equal(1);
  });

  it("requires AI review before approve or reject", async function () {
    const { certificate, student } = await deployFixture();

    await submitRequest(certificate, student);

    await expect(certificate.approveRequest(1))
      .to.be.revertedWithCustomError(certificate, "InvalidStatus")
      .withArgs(0, 1);

    await expect(certificate.rejectRequest(1, "Evidence is incomplete"))
      .to.be.revertedWithCustomError(certificate, "InvalidStatus")
      .withArgs(0, 1);
  });

  it("restricts review and mint actions to the owner", async function () {
    const { certificate, student, other } = await deployFixture();

    await submitRequest(certificate, student);
    await storeAIReview(certificate, student);

    await expect(certificate.connect(other).approveRequest(1))
      .to.be.revertedWithCustomError(certificate, "Unauthorized");
  });

  it("approves and mints a certificate NFT", async function () {
    const { certificate, student } = await deployFixture();

    await submitRequest(certificate, student);
    await storeAIReview(certificate, student);
    await expect(certificate.approveRequest(1)).to.emit(certificate, "RequestApproved").withArgs(1);

    await expect(certificate.mintCertificate(1))
      .to.emit(certificate, "NFTMinted")
      .withArgs(1, 1, student.address);

    expect(await certificate.ownerOf(1)).to.equal(student.address);
    expect(await certificate.tokenURI(1)).to.equal("data:application/json,%7B%7D");

    const request = await certificate.requests(1);
    expect(request.status).to.equal(4);
    expect(request.tokenId).to.equal(1);
  });

  it("rejects an AI-reviewed request", async function () {
    const { certificate, student } = await deployFixture();

    await submitRequest(certificate, student);
    await storeAIReview(certificate, student);

    await expect(certificate.rejectRequest(1, "Evidence is incomplete"))
      .to.emit(certificate, "RequestRejected")
      .withArgs(1);

    const request = await certificate.requests(1);
    expect(request.status).to.equal(3);
    expect(request.rejectionReason).to.equal("Evidence is incomplete");
  });
});
