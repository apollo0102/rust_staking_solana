const anchor = require("@project-serum/anchor");
const { TOKEN_PROGRAM_ID, Token, AccountLayout } = require("@solana/spl-token");
const {
    PublicKey,
} = require('@solana/web3.js');
const utils = require("./utils");

///user can be an admin or a staker. either way, call init - then can call other methods
class User {
    constructor(a) { this.id = a; }

    async init(initialLamports, bindPubkey, initialAmount) {
        this.keypair = new anchor.web3.Keypair();
        this.pubkey = this.keypair.publicKey;

        let envProvider = anchor.Provider.env();
        envProvider.commitment = 'pending';
        await utils.sendLamports(envProvider, this.pubkey, initialLamports);

        this.provider = new anchor.Provider(envProvider.connection, new anchor.Wallet(this.keypair), envProvider.opts);
        let program = anchor.workspace.StakingContract;
        this.program = new anchor.Program(program.idl, program.programId, this.provider);

        this.initialLamports = initialLamports;
        this.bindTokenMint = new Token(this.provider.connection, bindPubkey, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.initialAmount = initialAmount;

        this.poolPubkey = null;
        this.userPubkey = null;
        this.userNonce = null;
        this.merchantPubkey = null;
        this.merchantNonce = null;

        this.bindTokenAta = await this.bindTokenMint.createAssociatedTokenAccount(this.pubkey);
        if (initialAmount > 0) {
            await this.bindTokenMint.mintTo(this.bindTokenAta, envProvider.wallet.payer, [], initialAmount);
        }
    }

    async initializeMainPool(poolKeypair, rewardDuration) {
        const [poolSigner, bump] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            this.program.programId
        );

        let poolTokenAta = await this.bindTokenMint.getOrCreateAssociatedAccountInfo(poolKeypair.publicKey);

        const [stakingVault] = await PublicKey.findProgramAddress(
            [
                Buffer.from(anchor.utils.bytes.utf8.encode('staking-vault')),
                poolTokenAta.address.toBuffer(),
            ],

            this.program.programId
        );

        const [rewardVault] = await PublicKey.findProgramAddress(
            [
                Buffer.from(anchor.utils.bytes.utf8.encode('reward-vault')),
                poolTokenAta.address.toBuffer(),
            ],

            this.program.programId
        );

        console.log("===============stakingVault===============", stakingVault.toBase58())
        console.log("===============rewardVault===============", rewardVault.toBase58())

        this.poolPubkey = poolKeypair.publicKey;

        await this.program.rpc.initializeMainPool(
            bump,
            rewardDuration,
            {
                accounts: {
                    authority: this.provider.wallet.publicKey,
                    stakingMint: this.bindTokenMint.publicKey,
                    stakingVault: stakingVault,
                    rewardMint: this.bindTokenMint.publicKey,
                    rewardVault: rewardVault,
                    poolSigner: poolSigner,
                    pool: this.poolPubkey,
                    poolTokenAta: poolTokenAta.address,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                    systemProgram: anchor.web3.SystemProgram.programId,
                },
                signers: [poolKeypair],
            }
        );

    }

    async createUserStakingAccount(poolPubkey) {
        this.poolPubkey = poolPubkey;

        const [
            _userPubkey, _userNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [
                this.provider.wallet.publicKey.toBuffer(),
                poolPubkey.toBuffer()
            ],
            this.program.programId
        );
        this.userPubkey = _userPubkey;
        this.userNonce = _userNonce;

        const currentTs = new anchor.BN(Date.now() / 1000);

        console.log("============this.userPubkey============", this.userPubkey.toBase58())

        await this.program.rpc.createUser(this.userNonce, currentTs, {
            accounts: {
                pool: poolPubkey,
                user: this.userPubkey,
                owner: this.provider.wallet.publicKey,
                payer: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async stakeTokens(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        console.log("============poolSigner============", poolSigner.toBase58())
        const currentTs = new anchor.BN(Date.now() / 1000);
        const lockingPeriod = 0;

        await this.program.rpc.stake(
            new anchor.BN(amount),
            currentTs,
            new anchor.BN(lockingPeriod),
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    stakingVault: poolObject.stakingVault,
                    // User.
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                    // From
                    stakeFromAccount: this.bindTokenAta,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async pausePool(authority) {
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.pause(
            {
                accounts: {
                    pool: this.poolPubkey,
                    authority: authority ?? this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async unpausePool(authority) {
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.unpause(
            {
                accounts: {
                    pool: this.poolPubkey,
                    authority: authority ?? this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async unstakeTokens(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        const currentTs = new anchor.BN(Date.now() / 1000);
        await this.program.rpc.unstake(
            new anchor.BN(amount),
            currentTs,
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    stakingVault: poolObject.stakingVault,
                    // User.
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                    stakeFromAccount: this.bindTokenAta,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }

    async fund(amount, poolPubkey) {
        let pubkeyToUse = poolPubkey ?? this.poolPubkey;
        let poolObject = await this.program.account.pool.fetch(pubkeyToUse);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [pubkeyToUse.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.fund(
            new anchor.BN(amount),
            {
                accounts: {
                    // Stake instance.
                    pool: pubkeyToUse,
                    stakingVault: poolObject.stakingVault,
                    rewardVault: poolObject.rewardVault,
                    funder: this.provider.wallet.publicKey,
                    from: this.bindTokenAta,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }

    async claim() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        const startTs = new anchor.BN(Date.now() / 1000);

        await this.program.rpc.claim(
            startTs,
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    stakingVault: poolObject.stakingVault,
                    rewardVault: poolObject.rewardVault,
                    // User.
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                    rewardAccount: this.bindTokenAta,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );

    }

    async closeUser() {
        await this.program.rpc.closeUser(
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                },
            });
    }

    async closePool() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.closePool(
            {
                accounts: {
                    // Stake instance.
                    authority: this.provider.wallet.publicKey,
                    refundee: this.provider.wallet.publicKey,
                    stakingRefundee: this.bindTokenAta,
                    pool: this.poolPubkey,
                    stakingVault: poolObject.stakingVault,
                    rewardVault: poolObject.rewardVault,
                    poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }

    ///////////////////////////////////////
    /// Start Merchant Pool
    ///////////////////////////////////////

    /// initialize a merchant pool
    async initializeMerchantPool(poolPubkey) {
        this.poolPubkey = poolPubkey;

        const [
            _merchantPubkey, _merchantNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [
                Buffer.from(anchor.utils.bytes.utf8.encode('merchant-pool')),
                this.provider.wallet.publicKey.toBuffer(),
                poolPubkey.toBuffer()
            ],
            this.program.programId
        );
        this.merchantPubkey = _merchantPubkey;
        this.merchantNonce = _merchantNonce;
        let merchantName = "Merchant 1"
        const currentTs = new anchor.BN(Date.now() / 1000);

        console.log("=======this.merchantPubkey======", this.merchantPubkey.toBase58())

        await this.program.rpc.initializeMerchantPool(
            merchantName,
            this.merchantNonce,
            currentTs,
            {
                accounts: {
                    pool: poolPubkey,
                    merchant: this.merchantPubkey,
                    owner: this.provider.wallet.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                },
            });
    }

    /// create a user account belong to merchant
    async createMerchantUser(poolPubkey, merchantPubkey) {
        this.poolPubkey = poolPubkey;
        this.merchantPubkey = merchantPubkey;

        const [
            _userPubkey, _userNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [
                this.provider.wallet.publicKey.toBuffer(),
                merchantPubkey.toBuffer(),
                poolPubkey.toBuffer()
            ],
            this.program.programId
        );
        this.userPubkey = _userPubkey;
        this.userNonce = _userNonce;

        console.log("============this.userPubkey============", this.userPubkey.toBase58())

        const currentTs = new anchor.BN(Date.now() / 1000);
        await this.program.rpc.createMerchantUser(this.userNonce, currentTs, {
            accounts: {
                pool: poolPubkey,
                merchant: merchantPubkey,
                merchantUser: this.userPubkey,
                owner: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async stakeTokenToMerchant(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );

        let poolSigner = _poolSigner;

        console.log("============poolSigner============", poolSigner.toBase58())
        const startTs = new anchor.BN(Date.now() / 1000);
        const lockingPeriod = new anchor.BN(0);

        await this.program.rpc.stakeTokenToMerchant(
            new anchor.BN(amount),
            startTs,
            lockingPeriod,
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    merchant: this.merchantPubkey,
                    stakingVault: poolObject.stakingVault,
                    // User.
                    merchantUser: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                    // From
                    stakeFromAccount: this.bindTokenAta,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async unstakeTokenToMerchant(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        const currentTs = new anchor.BN(Date.now() / 1000);

        await this.program.rpc.unstakeTokenToMerchant(
            new anchor.BN(amount),
            currentTs,
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    merchant: this.merchantPubkey,
                    stakingVault: poolObject.stakingVault,
                    // User.
                    merchantUser: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                    stakeFromAccount: this.bindTokenAta,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }

    async pauseMerchant(authority) {
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.pauseMerchant(
            {
                accounts: {
                    pool: this.poolPubkey,
                    merchant: this.merchantPubkey,
                    owner: this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async unpauseMerchant(authority) {
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.unpauseMerchant(
            {
                accounts: {
                    pool: this.poolPubkey,
                    merchant: this.merchantPubkey,
                    owner: this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async claimRewardForMerchant() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        const currentTs = new anchor.BN(Date.now() / 1000);

        await this.program.rpc.claimRewardForMerchant(currentTs, {
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                merchant: this.merchantPubkey,
                stakingVault: poolObject.stakingVault,
                rewardVault: poolObject.rewardVault,
                owner: this.provider.wallet.publicKey,
                rewardAccount: this.bindTokenAta,
                // Program signers.
                poolSigner,
                // Misc.
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
        });

    }

    async merchantStake(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.merchantStake(
            new anchor.BN(amount),
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    merchant: this.merchantPubkey,
                    stakingVault: poolObject.stakingVault,
                    owner: this.provider.wallet.publicKey,
                    // From
                    stakeFromAccount: this.bindTokenAta,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async merchantUnstake(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.merchantUnstake(
            new anchor.BN(amount),
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    merchant: this.merchantPubkey,
                    stakingVault: poolObject.stakingVault,
                    owner: this.provider.wallet.publicKey,
                    stakeFromAccount: this.bindTokenAta,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }

    async claimMerchantReward() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.claimMerchantReward({
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                merchant: this.merchantPubkey,
                stakingVault: poolObject.stakingVault,
                rewardVault: poolObject.rewardVault,
                owner: this.provider.wallet.publicKey,
                rewardAccount: this.bindTokenAta,
                // Program signers.
                poolSigner,
                // Misc.
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
        });
    }

    async stakeOnBehalf(_userPubkey, amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        console.log("============poolSigner============", poolSigner.toBase58())
        const currentTs = new anchor.BN(Date.now() / 1000);

        await this.program.rpc.stakeOnBehalf(
            new anchor.BN(amount),
            currentTs,
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    stakingVault: poolObject.stakingVault,
                    // User.
                    user: _userPubkey,
                    owner: this.provider.wallet.publicKey,
                    // From
                    stakeFromAccount: this.bindTokenAta,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );

        poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        console.log("================poolObjectAfterStakeOnBehalf=============", poolObject)
    }

    async withdrawToken() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        const currentTs = new anchor.BN(Date.now() / 1000);
        await this.program.rpc.withdraw(
            0,
            currentTs,
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    stakingVault: poolObject.stakingVault,
                    // User.
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                    stakeFromAccount: this.bindTokenAta,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });

        let userInfo = await this.program.account.user.fetch(this.userPubkey);
        console.log("===============userInfoAfterWithdrawn=================", userInfo)
    }
}

module.exports = {
    User
};
