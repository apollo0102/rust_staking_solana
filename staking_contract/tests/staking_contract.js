const assert = require("assert");
const anchor = require('@project-serum/anchor');
const serumCmn = require("@project-serum/common");
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const utils = require("./utils");
const { User } = require("./user_configure");
const fs = require('fs');

let program = anchor.workspace.StakingContract;

const envProvider = anchor.Provider.env();
let provider = envProvider;

function setProvider(p) {
  provider = p;
  anchor.setProvider(p);
  program = new anchor.Program(program.idl, program.programId, p);
};
setProvider(provider);

describe('Multiuser Reward Pool', () => {

  const rewardDuration = new anchor.BN(10);

  let bindKeypair;
  let bindTokenMint;
  let bindPubkey;
  let users;
  let mainPoolCreator;
  let mainPoolKeypair = anchor.web3.Keypair.generate();
  let merchant;

  it("Initialize mints", async () => {
    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());

    let keypairFile = fs.readFileSync('tests/keys/test.json');
    let keypairData = JSON.parse(keypairFile);

    bindKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(keypairData));
    bindPubkey = bindKeypair.publicKey;
    bindTokenMint = await utils.createMintFromPriv(bindKeypair, provider, provider.wallet.publicKey, null, 9, TOKEN_PROGRAM_ID);

    setProvider(envProvider);

    console.log("===========bindPubkey============", bindPubkey.toBase58())
    console.log("===========bindTokenMint============", bindTokenMint.publicKey.toBase58())
  });

  it("Initialize users", async () => {
    users = [1, 2, 3, 4, 5].map(a => new User(a));
    await Promise.all(
      users.map(a => a.init(10_000_000_000, bindPubkey, 5_000_000_000))
    );
  })

  it("Initialize funders", async () => {
    mainPoolCreator = new User(0);
    await Promise.all([
      mainPoolCreator.init(10_000_000_000, bindPubkey, 10_000_000_000_000)
    ]);
  });

  it("Creates a main pool", async () => {
    await mainPoolCreator.initializeMainPool(mainPoolKeypair, rewardDuration);
  });

  it('User does some single staking', async () => {

    //we test all this in greater detail later, but this is a flow for single reward staking

    let pool = mainPoolCreator.poolPubkey;
    let user = new User(99);
    await user.init(10_000_000_000, bindPubkey, 5_000_000_000);
    await user.createUserStakingAccount(pool);
    await user.stakeTokens(100_000_000);

    await mainPoolCreator.fund(1_000_000_000);

    await user.claim();

    await user.unstakeTokens(100_000_000);
    await user.closeUser();
  });

  ///////////////////////////////////////////////////////
  /// Start merchant staking
  ///////////////////////////////////////////////////////

  it('Merchant Staking', async () => {

    //we test all this in greater detail later, but this is a flow for single reward staking

    let pool = mainPoolCreator.poolPubkey;
    merchant = new User(50);
    await merchant.init(10_000_000_000, bindPubkey, 5_000_000_000);
    await merchant.initializeMerchantPool(pool);

    // await mainPoolCreator.pausePool();
    // await mainPoolCreator.closePool();
  });

  it('Create a merchant user', async () => {

    let pool = mainPoolCreator.poolPubkey;
    let merchantKey = merchant.merchantPubkey;

    let merchantUser = new User(60);
    await merchantUser.init(10_000_000_000, bindPubkey, 5_000_000_000);
    await merchantUser.createMerchantUser(pool, merchantKey);

    _merchantUser = merchantUser;
  });

  it('Stake token to the merchant pool', async () => {
    let merchantUser = _merchantUser;
    console.log("=================poolPubkey================", merchantUser.poolPubkey.toBase58())
    console.log("=================merchantPubkey================", merchantUser.merchantPubkey.toBase58())

    await merchantUser.stakeTokenToMerchant(100_000_000);
  });

  it('Unstake token from the merchant pool', async () => {
    let merchantUser = _merchantUser;
    console.log("=================poolPubkey================", merchantUser.poolPubkey.toBase58())
    console.log("=================merchantPubkey================", merchantUser.merchantPubkey.toBase58())

    await merchantUser.unstakeTokenToMerchant(100_000_000);
  });

  it('Pause the merchant pool', async () => {
    await merchant.pauseMerchant();
  });

  it('Unpause the merchant pool', async () => {
    await merchant.unpauseMerchant();
  });

  it('Clamin rewards for merchant whloe pool', async () => {
    await merchant.claimRewardForMerchant();
  });

  ///////////////////////////////////////////////////////
  /// Stake on Behalf
  ///////////////////////////////////////////////////////
  it('Admin stake tokens behalf of users/merchants', async () => {

    let pool = mainPoolCreator.poolPubkey;
    let user = new User(200);
    await user.init(10_000_000_000, bindPubkey, 5_000_000_000);
    await user.createUserStakingAccount(pool);

    await mainPoolCreator.stakeOnBehalf(user.userPubkey, 1_000_000_000);

    await delay(2000);
    await user.withdrawToken()
  });
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}