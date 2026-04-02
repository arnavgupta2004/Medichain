const { ethers, network, artifacts } = require("hardhat");
const fs = require("fs");
const path = require("path");

const LOCAL_ADMIN_PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  console.log("=".repeat(60));
  console.log("  MediChain Deployment Script");
  console.log("=".repeat(60));
  console.log(`Network: ${network.name}`);

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");

  if (network.name === "sepolia" && balance < ethers.parseEther("0.05")) {
    console.warn("WARNING: Low balance. Get Sepolia ETH from https://sepoliafaucet.com");
  }

  // ─── 1. Deploy RoleManager ───────────────────────────────────
  console.log("1. Deploying RoleManager...");
  const RoleManager = await ethers.getContractFactory("RoleManager");
  const roleManager = await RoleManager.deploy(deployer.address);
  await roleManager.waitForDeployment();
  const roleManagerAddress = await roleManager.getAddress();
  console.log(`   RoleManager deployed to: ${roleManagerAddress}`);

  // ─── 2. Deploy MediChainCore ─────────────────────────────────
  console.log("\n2. Deploying MediChainCore...");
  const MediChainCore = await ethers.getContractFactory("MediChainCore");
  const medichain = await MediChainCore.deploy(roleManagerAddress);
  await medichain.waitForDeployment();
  const medichainAddress = await medichain.getAddress();
  console.log(`   MediChainCore deployed to: ${medichainAddress}`);

  // ─── 3. Grant roles for testing ──────────────────────────────
  console.log("\n3. Setting up roles for deployer (testing)...");
  const DISTRIBUTOR_ROLE = await roleManager.DISTRIBUTOR_ROLE();
  const PHARMACY_ROLE    = await roleManager.PHARMACY_ROLE();

  let tx;
  tx = await roleManager.grantRole(DISTRIBUTOR_ROLE, deployer.address);
  await tx.wait();
  console.log(`   Granted DISTRIBUTOR_ROLE to deployer`);

  tx = await roleManager.grantRole(PHARMACY_ROLE, deployer.address);
  await tx.wait();
  console.log(`   Granted PHARMACY_ROLE to deployer`);

  // ─── 4. Seed demo data (local only) ──────────────────────────
  if (network.name === "hardhat" || network.name === "localhost") {
    console.log("\n4. Seeding demo data...");
    await seedDemoData(medichain, roleManager, deployer);
  }

  // ─── 5. Copy ABI to frontend ─────────────────────────────────
  console.log("\n5. Copying ABI to frontend...");
  copyAbiToFrontend(medichainAddress, roleManagerAddress);

  // ─── 6. Write .env.local for frontend ────────────────────────
  console.log("\n6. Writing frontend/.env.local...");
  writeFrontendEnv(medichainAddress, roleManagerAddress, network.name);

  // ─── Summary ─────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log(`  RoleManager:    ${roleManagerAddress}`);
  console.log(`  MediChainCore:  ${medichainAddress}`);
  console.log(`  Network:        ${network.name}`);
  if (network.name === "sepolia") {
    console.log(`\n  View on Etherscan:`);
    console.log(`  https://sepolia.etherscan.io/address/${medichainAddress}`);
    console.log(`\n  Verify contracts with:`);
    console.log(`  npx hardhat verify --network sepolia ${roleManagerAddress} "${deployer.address}"`);
    console.log(`  npx hardhat verify --network sepolia ${medichainAddress} "${roleManagerAddress}"`);
  }
  console.log("=".repeat(60));
}

// ─── Seed demo data for local testing ────────────────────────────
async function seedDemoData(medichain, roleManager, deployer) {
  const now = Math.floor(Date.now() / 1000);
  const twoYears = now + 2 * 365 * 24 * 3600;

  try {
    await medichain.registerBatch(
      "DEMO-BATCH-001",
      "Paracetamol 500mg",
      "Sun Pharma",
      twoYears,
      1000,
      ""
    );
    console.log("   Registered DEMO-BATCH-001");

    await medichain.transferToDistributor(
      "DEMO-BATCH-001",
      deployer.address,
      "Mumbai Warehouse",
      "Initial dispatch"
    );
    console.log("   Transferred DEMO-BATCH-001 to distributor");

    await medichain.transferToPharmacy(
      "DEMO-BATCH-001",
      deployer.address,
      "Delhi Distribution Hub",
      "Delivered to pharmacy"
    );
    console.log("   Transferred DEMO-BATCH-001 to pharmacy");

    await medichain.registerBatch(
      "DEMO-BATCH-002",
      "Amoxicillin 250mg",
      "Cipla Ltd",
      twoYears,
      500,
      ""
    );
    console.log("   Registered DEMO-BATCH-002");

    await medichain.registerBatch(
      "DEMO-BATCH-RECALLED",
      "Metformin 500mg",
      "Dr Reddy's",
      twoYears,
      200,
      ""
    );
    await medichain.recallBatch(
      "DEMO-BATCH-RECALLED",
      "Contamination detected during quality control inspection"
    );
    console.log("   Registered and recalled DEMO-BATCH-RECALLED");
  } catch (err) {
    console.warn("   Demo seed warning:", err.message);
  }
}

// ─── Copy ABI + addresses to frontend/public/abi/ ─────────────────
function copyAbiToFrontend(medichainAddress, roleManagerAddress) {
  const frontendAbiDir = path.join(__dirname, "../frontend/public/abi");
  if (!fs.existsSync(frontendAbiDir)) {
    fs.mkdirSync(frontendAbiDir, { recursive: true });
  }

  // MediChainCore ABI
  const coreArtifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/contracts/MediChainCore.sol/MediChainCore.json"),
      "utf8"
    )
  );

  // RoleManager ABI
  const rmArtifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/contracts/RoleManager.sol/RoleManager.json"),
      "utf8"
    )
  );

  // Write combined ABI file consumed by frontend
  const output = {
    medichain: {
      address: medichainAddress,
      abi: coreArtifact.abi,
    },
    roleManager: {
      address: roleManagerAddress,
      abi: rmArtifact.abi,
    },
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(frontendAbiDir, "MediChain.json"),
    JSON.stringify(output, null, 2)
  );

  console.log(`   ABI written to frontend/public/abi/MediChain.json`);
}

// ─── Write frontend/.env.local ────────────────────────────────────
function writeFrontendEnv(medichainAddress, roleManagerAddress, networkName) {
  const envPath = path.join(__dirname, "../frontend/.env.local");
  const isLocal = networkName === "hardhat" || networkName === "localhost";
  const rpcUrl = isLocal
    ? "http://127.0.0.1:8545"
    : process.env.ALCHEMY_SEPOLIA_URL || "https://eth-sepolia.g.alchemy.com/v2/demo";
  const chainId = isLocal ? 31337 : 11155111;
  const networkLabel = isLocal ? "localhost" : "sepolia";

  const content = `# Auto-generated by deploy.js — do not edit manually
NEXT_PUBLIC_CONTRACT_ADDRESS=${medichainAddress}
NEXT_PUBLIC_ROLE_MANAGER_ADDRESS=${roleManagerAddress}
NEXT_PUBLIC_ALCHEMY_URL=${rpcUrl}
NEXT_PUBLIC_NETWORK=${networkLabel}
NEXT_PUBLIC_CHAIN_ID=${chainId}
${isLocal ? `LOCAL_ADMIN_PRIVATE_KEY=${LOCAL_ADMIN_PRIVATE_KEY}\n` : ""}
`;

  fs.writeFileSync(envPath, content);
  console.log(`   Written to frontend/.env.local`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDeployment failed:", error);
    process.exit(1);
  });
