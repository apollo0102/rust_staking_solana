import { useState, useEffect } from "react";
import { Card, Row, Col } from "react-bootstrap";
import { Store } from 'react-notifications-component';
import { Skeleton, Spin, Statistic, Button, InputNumber, Radio } from "antd";

import { useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program, Provider, web3 } from "@project-serum/anchor";
import * as anchor from "@project-serum/anchor";

import { notificationConfig } from "../../../constants";
import stakingIdl from "../../../idl/staking-idl.json"
import { getWorldTime } from "../../../utils";

import "./index.css";

const { Countdown } = Statistic;
const opts = {
    preflightCommitment: "processed",
};
const {
    REACT_APP_SOLANA_NETWORK,
    REACT_APP_BIND_TOKEN_MINT_ADDRESS,
    REACT_APP_MAIN_POOL_PUBKEY
} = process.env;
const bindTokenMint = new PublicKey(REACT_APP_BIND_TOKEN_MINT_ADDRESS);
const programID = new PublicKey(stakingIdl.metadata.address);
const network = clusterApiUrl(REACT_APP_SOLANA_NETWORK);
const connection = new Connection(network, opts.preflightCommitment);

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const mainPoolKey = new PublicKey(REACT_APP_MAIN_POOL_PUBKEY || REACT_APP_BIND_TOKEN_MINT_ADDRESS);

const MerchantStakingCard = (props) => {
    const [isLoading, setLoading] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [merchantInfo, setMerchantInfo] = useState()
    const [isCreatedUser, setIsCreatedUser] = useState(false)
    const [userInfo, setUserInfo] = useState()
    const [amount, setAmount] = useState(0)
    const [isOwner, setIsOwner] = useState(false)
    const [lockingPeriod, setLockingPeriod] = useState(120)
    const [timeLeft, setTimeLeft] = useState(0)
    const [merchantTokenBalance, setMerchantTokenBalance] = useState(0)

    const {
        merchantPubkey,
        tokenBalance
    } = props

    const wallet = useWallet();
    async function getProvider() {
        const provider = new Provider(connection, wallet, opts.preflightCommitment);
        return provider;
    }

    // find associated token address for user wallet
    const findAssociatedTokenAddress = async (
        walletAddress,
        tokenMintAddress
    ) => {
        return (await PublicKey.findProgramAddress(
            [
                walletAddress.toBuffer(),
                TOKEN_PROGRAM_ID.toBuffer(),
                tokenMintAddress.toBuffer(),
            ],
            SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
        ))[0];
    }

    // get or create associated token account
    const getOrCreateAssociatedTokenAccount = async (
        connection,
        mint,
        owner,
        payer
    ) => {

        const address = await findAssociatedTokenAddress(
            owner,
            mint
        );

        if (!(await connection.getAccountInfo(address))) {
            const txn = new Transaction().add(Token.createAssociatedTokenAccountInstruction(
                ASSOCIATED_TOKEN_PROGRAM_ID,
                TOKEN_PROGRAM_ID,
                mint,
                address,
                owner,
                payer.publicKey
            ));

            txn.feePayer = payer.publicKey

            txn.recentBlockhash = (
                await connection.getRecentBlockhash()
            ).blockhash;

            const signedTxn = await payer.signTransaction(txn)
            const signature = await connection.sendRawTransaction(signedTxn.serialize());
            await connection.confirmTransaction(signature);
        }
        return address;
    }

    const init = async () => {
        try {
            setLoading(true)

            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);

            try {
                const rsp = await program.account.merchant.fetch(merchantPubkey)
                setMerchantInfo(rsp);
                if (provider.wallet.publicKey.toString() == rsp.owner.toString()) {
                    setIsOwner(true)
                } else {
                    setIsOwner(false)
                }
            } catch (_) {
            }

            try {
                setMerchantTokenBalance(tokenBalance)
            } catch (_) {
            }

            try {
                await handleSetUserInfo();
                setIsCreatedUser(true)
            } catch (err) {
            }

            setLoading(false)
        } catch (err) {
            setLoading(false)
        }
    }

    const handleSetAmount = async (value) => {
        setAmount(value)
    }

    const handleSetUserInfo = async () => {
        const provider = await getProvider();
        const program = new Program(stakingIdl, programID, provider);

        const [
            userPubkey,
            userNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [
                provider.wallet.publicKey.toBuffer(),
                merchantPubkey.toBuffer(),
                mainPoolKey.toBuffer()
            ],
            program.programId
        );

        let userInfo = await program.account.merchantUser.fetch(userPubkey);
        const currentTime = await getWorldTime();
        setTimeLeft(userInfo.endTs.toNumber() - currentTime)
        setUserInfo(userInfo)
    }

    /// create a user account belong to merchant
    const handleCreateMerchantUser = async () => {
        try {
            Store.addNotification({
                ...notificationConfig,
                type: "info",
                message: `Creating user account for staking in the ${merchantInfo.merchantName}`
            });

            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);

            const [
                userPubkey,
                userNonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [
                    provider.wallet.publicKey.toBuffer(),
                    merchantPubkey.toBuffer(),
                    mainPoolKey.toBuffer()
                ],
                program.programId
            );

            const currentTs = await getWorldTime()
            await program.rpc.createMerchantUser(
                userNonce,
                new anchor.BN(currentTs),
                {
                    accounts: {
                        pool: mainPoolKey,
                        merchant: merchantPubkey,
                        merchantUser: userPubkey,
                        owner: provider.wallet.publicKey,
                        systemProgram: anchor.web3.SystemProgram.programId,
                    },
                }
            );

            let _userInfo = await program.account.merchantUser.fetch(userPubkey);
            setUserInfo(_userInfo)

            setIsCreatedUser(true)

            return true;
        } catch (err) {
            console.log("creating user account err", err)
            setIsCreatedUser(false)
            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: `Failed to Create user account for staking in the ${merchantInfo.merchantName}`
            });

            return false
        }
    }

    const handleLockingPeriod = e => {
        console.log('radio checked', e.target.value);
        setLockingPeriod(e.target.value);
    };

    const handleStakeTokenToMerchant = async () => {
        if (isOwner) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: `Owner of this merchant pool can't stake tokens to this pool`
            });

            return;
        }

        if (amount <= 0) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: `Please fill amount`
            });

            return;
        }

        if (amount > tokenBalance) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: `Insufficient token balance`
            });

            return;
        }

        try {
            setIsProcessing(true)
            if (!isCreatedUser) {
                const userAccountStatus = await handleCreateMerchantUser()
                if (!userAccountStatus) {
                    setIsProcessing(false)

                    return;
                }
            }

            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);

            let poolObject = await program.account.pool.fetch(mainPoolKey);

            const [
                poolSigner,
                nonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [mainPoolKey.toBuffer()],
                program.programId
            );

            const [
                userPubkey,
                userNonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [
                    provider.wallet.publicKey.toBuffer(),
                    merchantPubkey.toBuffer(),
                    mainPoolKey.toBuffer()
                ],
                program.programId
            );

            const userWalletAta = await findAssociatedTokenAddress(
                program.provider.wallet.publicKey,
                bindTokenMint
            );

            const currentTime = await getWorldTime()

            const tx = await program.rpc.stakeTokenToMerchant(
                new anchor.BN(amount * 10 ** 9),
                new anchor.BN(currentTime),
                new anchor.BN(lockingPeriod),
                {
                    accounts: {
                        // Stake instance.
                        pool: mainPoolKey,
                        merchant: merchantPubkey,
                        stakingVault: poolObject.stakingVault,
                        // User.
                        merchantUser: userPubkey,
                        owner: provider.wallet.publicKey,
                        // From
                        stakeFromAccount: userWalletAta,
                        // Program signers.
                        poolSigner,
                        // Misc.
                        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    },
                }
            );
            console.log("tx: ", tx)

            if (userInfo?.endTs && (userInfo.endTs.toNumber() - currentTime) > 0) {
                setTimeLeft(lockingPeriod * 60 + userInfo.endTs.toNumber() - currentTime)
            } else {
                setTimeLeft(lockingPeriod * 60)
            }

            const _merchantInfo = await program.account.merchant.fetch(merchantPubkey)
            setMerchantInfo(_merchantInfo);

            let _userInfo = await program.account.merchantUser.fetch(userPubkey);
            setUserInfo(_userInfo)

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: `Successed to stake tokens in the ${merchantInfo.merchantName}`
            });
            setIsProcessing(false)
        } catch (err) {
            console.log("err", err)

            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: `Failed to stake tokens in the ${merchantInfo.merchantName}`
            });
            setIsProcessing(false)
        }
    }

    const handleUnstakeTokenFromMerchant = async () => {
        try {
            if (isOwner) {
                Store.addNotification({
                    ...notificationConfig,
                    type: "warning",
                    message: `Owner of this merchant pool can't stake tokens to this pool`
                });

                return;
            }

            const currentTs = await getWorldTime();
            if ((userInfo.endTs - currentTs) > 0) {
                Store.addNotification({
                    ...notificationConfig,
                    type: "warning",
                    message: `You can't unstake tokens during locking period`
                });

                return;
            }

            if (userInfo.balanceStaked.toNumber() <= 0) {
                Store.addNotification({
                    ...notificationConfig,
                    type: "warning",
                    message: `You have no staked tokens in this pool`
                });

                return;
            }

            if (amount <= 0) {
                Store.addNotification({
                    ...notificationConfig,
                    type: "warning",
                    message: `Please fill amount`
                });

                return;
            }

            setIsProcessing(true)

            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);
            let poolObject = await program.account.pool.fetch(mainPoolKey);

            const [
                poolSigner,
                poolNonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [mainPoolKey.toBuffer()],
                program.programId
            );

            const [
                userPubkey,
                userNonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [
                    provider.wallet.publicKey.toBuffer(),
                    merchantPubkey.toBuffer(),
                    mainPoolKey.toBuffer()
                ],
                program.programId
            );

            const userWalletAta = await findAssociatedTokenAddress(
                program.provider.wallet.publicKey,
                bindTokenMint
            );

            const tx = await program.rpc.unstakeTokenToMerchant(
                new anchor.BN(amount * 10 ** 9),
                new anchor.BN(currentTs),
                {
                    accounts: {
                        // Stake instance.
                        pool: mainPoolKey,
                        merchant: merchantPubkey,
                        stakingVault: poolObject.stakingVault,
                        // User.
                        merchantUser: userPubkey,
                        owner: provider.wallet.publicKey,
                        stakeFromAccount: userWalletAta,
                        // Program signers.
                        poolSigner,
                        // Misc.
                        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    },
                }
            );

            console.log("tx: ", tx)

            const _merchantInfo = await program.account.merchant.fetch(merchantPubkey)
            setMerchantInfo(_merchantInfo);

            let _userInfo = await program.account.merchantUser.fetch(userPubkey);
            setUserInfo(_userInfo)

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: `Successed to unstake tokens in the ${merchantInfo.merchantName}`
            });
            setIsProcessing(false)
        } catch (err) {
            console.log("err: ", err)

            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: `Failed to unstake tokens in the ${merchantInfo.merchantName}`
            });
            setIsProcessing(false)
        }
    }

    const handleClaimRewardForMerchant = async () => {
        try {
            setIsProcessing(true)

            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);
            let poolObject = await program.account.pool.fetch(mainPoolKey);

            const [
                poolSigner,
                poolNonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [mainPoolKey.toBuffer()],
                program.programId
            );

            const merchantWalletAta = await getOrCreateAssociatedTokenAccount(
                connection,
                bindTokenMint,
                program.provider.wallet.publicKey,
                program.provider.wallet
            );

            const currentTs = await getWorldTime()
            const tx = await program.rpc.claimRewardForMerchant(
                new anchor.BN(currentTs),
                {
                    accounts: {
                        // Stake instance.
                        pool: mainPoolKey,
                        merchant: merchantPubkey,
                        stakingVault: poolObject.stakingVault,
                        rewardVault: poolObject.rewardVault,
                        owner: provider.wallet.publicKey,
                        rewardAccount: merchantWalletAta,
                        // Program signers.
                        poolSigner,
                        // Misc.
                        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    },
                }
            );
            console.log("tx: ", tx)

            const _tokenBalance = await provider.connection.getTokenAccountBalance(merchantWalletAta);
            setMerchantTokenBalance(_tokenBalance.value.uiAmount)

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: `Successed to claim rewards for merchant in the main pool`
            });
            setIsProcessing(false)
        } catch (err) {
            console.log("err: ", err)

            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: `Failed to claim rewards for merchant in the main pool`
            });
            setIsProcessing(false)
        }
    }

    useEffect(() => {
        (async () => {
            await init();
        })()
    }, [merchantPubkey, tokenBalance])

    return (
        <Card className="merchant-staking-card">
            <Card.Body>
                <Skeleton loading={isLoading} active>
                    <Spin spinning={isProcessing}>
                        {
                            merchantInfo && (
                                <div>
                                    <div>
                                        <Row className="mb-1">
                                            <Col sm={12} md={12} lg={12} className="d-flex justify-content-between">
                                                <h4>{merchantInfo.merchantName}</h4>
                                                {
                                                    !isOwner ? (
                                                        <div className="d-flex">
                                                            <Countdown
                                                                value={Date.now() + timeLeft * 1000}
                                                                format="DD:HH:mm:ss"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="d-flex">
                                                            Token Balance: <strong>{merchantTokenBalance.toLocaleString()}</strong>
                                                        </div>
                                                    )
                                                }
                                            </Col>
                                        </Row>
                                        <Row className="d-flex">
                                            <Col sm={12} md={12} lg={12} className="d-flex justify-content-center">
                                                <div className="merchant-padding-div">
                                                    Total staked token amount: <strong>{merchantInfo.balanceStaked.toNumber() / 10 ** 9}</strong>
                                                </div>
                                                {
                                                    !isOwner ? (
                                                        <div className="merchant-padding-div">
                                                            Token amount you staked: <strong>{userInfo && userInfo.balanceStaked.toNumber() / 10 ** 9}</strong>
                                                        </div>
                                                    ) : (
                                                        <div className="merchant-padding-div">
                                                            Number of users staked tokens: <strong>{merchantInfo.merchantUserStakeCount}</strong>
                                                        </div>
                                                    )
                                                }
                                            </Col>
                                        </Row>

                                        {
                                            !isOwner && (
                                                <>
                                                    <Row className="mt-3">
                                                        <Col sm={12} md={12} lg={12} className="d-flex justify-content-center">
                                                            <div className="align-self-center pr-2">Locking Period: </div>
                                                            <Radio.Group onChange={handleLockingPeriod} value={lockingPeriod}>
                                                                <Radio value={120}>2 min</Radio>
                                                                <Radio value={300}>5 min</Radio>
                                                                <Radio value={600}>10 min</Radio>
                                                                <Radio value={1200}>20 min</Radio>
                                                            </Radio.Group>
                                                        </Col>
                                                    </Row>

                                                    <Row className="mt-3 mb-2">
                                                        <Col sm={12} md={4} lg={4} className="d-flex">
                                                            <div className="align-self-center">Amount:</div>
                                                            <InputNumber
                                                                min={0}
                                                                onInput={handleSetAmount}
                                                            />
                                                        </Col>
                                                        <Col sm={12} md={4} lg={4} className="d-flex justify-content-center">
                                                            <Row className="align-self-center">
                                                                <Button
                                                                    className=""
                                                                    onClick={handleStakeTokenToMerchant}
                                                                >
                                                                    Stake Tokens
                                                                </Button>
                                                            </Row>
                                                        </Col>
                                                        <Col sm={12} md={4} lg={4} className="d-flex justify-content-center">
                                                            <Row className="align-self-center">
                                                                <Button
                                                                    className=""
                                                                    onClick={handleUnstakeTokenFromMerchant}
                                                                >
                                                                    Unstake Tokens
                                                                </Button>
                                                            </Row>
                                                        </Col>
                                                    </Row>
                                                </>
                                            )
                                        }


                                        {
                                            isOwner && (
                                                <Row className="mt-3 justify-content-center">
                                                    <Col sm={12} md={6} lg={4}>
                                                        <Row>
                                                            <Button
                                                                className=""
                                                                onClick={handleClaimRewardForMerchant}
                                                            >
                                                                Claim Reward
                                                            </Button>
                                                        </Row>
                                                    </Col>
                                                </Row>
                                            )
                                        }
                                    </div>
                                </div>
                            )
                        }
                    </Spin>
                </Skeleton>
            </Card.Body>
        </Card>
    );
};

export default MerchantStakingCard;