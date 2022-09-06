import React, { useEffect, useState } from "react";
import {
    BrowserRouter as Router,
    Route,
    Redirect,
    Switch,
} from "react-router-dom";
import { Col, Row } from "react-bootstrap";
import { Store } from 'react-notifications-component';
import { Skeleton, Spin } from 'antd';

import { useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program, Provider, web3 } from "@project-serum/anchor";
import * as anchor from "@project-serum/anchor";

import Header from "../../components/Header/Header";
import MainStakingPool from "../../components/Admin/MainStakingPool";
import MainPoolConfigCard from "../../components/Admin/MainPoolConfigCard";
import MainPoolStatusCard from "../../components/Admin/MainPoolStatusCard";
import MerchantStatusCard from "../../components/Admin/MerchantStatusCard";
import FundingModal from "../../components/Admin/FundingModal";
import stakingIdl from "../../idl/staking-idl.json";
import { notificationConfig } from "../../constants";

import "./index.css";
import VestingStatusCard from "../../components/Admin/VestingStatusCard";

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

export default function Admin() {
    const [isMainPoolInitialized, setMainPoolInitialized] = useState(false);
    const [isPubkeyExisted, setIsPubkeyExisted] = useState(false);
    const [mainPoolPubkey, setMainPoolPubkey] = useState();
    const [poolInfo, setPoolInfo] = useState();
    const [tokenBalance, setTokenBalance] = useState(0);
    const [showFundingModal, setShowFundingModal] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoading, setLoading] = useState(false);

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
            Store.addNotification({
                ...notificationConfig,
                type: "info",
                message: "Creating an associated token account for the main pool"
            });

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

    const initialize = async () => {
        try {
            setLoading(true);
            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);
            const mainPoolAccount = new PublicKey(REACT_APP_MAIN_POOL_PUBKEY);
            const rsp = await program.account.pool.fetch(mainPoolAccount);

            try {
                const adminWalletAta = await findAssociatedTokenAddress(program.provider.wallet.publicKey, bindTokenMint);
                const tokenBalance = await provider.connection.getTokenAccountBalance(adminWalletAta);
                setTokenBalance(tokenBalance.value.uiAmount)
            } catch (_) {

            }

            setPoolInfo(rsp);
            setIsPaused(rsp.paused)
            setMainPoolPubkey(REACT_APP_MAIN_POOL_PUBKEY);
            setIsPubkeyExisted(true);
            setMainPoolInitialized(true);
            setLoading(false);
        } catch (err) {
            console.log("initialize error", err)
            setLoading(false);
        }
    }

    const handleInitializeMainPool = async () => {
        if (!wallet.publicKey) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please connect your wallet"
            });

            return;
        }

        setMainPoolInitialized(false);
        setIsProcessing(true);

        const provider = await getProvider();
        const program = new Program(stakingIdl, programID, provider);

        const poolKeypair = anchor.web3.Keypair.generate();
        const [poolSigner, bump] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            program.programId
        );
        let poolTokenAta;

        try {
            poolTokenAta = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, poolKeypair.publicKey, wallet);
        } catch (err) {
            console.log("getOrCreating associated token account err", err)
            setIsProcessing(false);

            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: "failed to create an associated token account for the main pool"
            });

            return;
        }

        const [stakingVault] = await PublicKey.findProgramAddress(
            [
                Buffer.from(anchor.utils.bytes.utf8.encode('staking-vault')),
                poolTokenAta.toBuffer(),
            ],
            program.programId
        );

        const [rewardVault] = await PublicKey.findProgramAddress(
            [
                Buffer.from(anchor.utils.bytes.utf8.encode('reward-vault')),
                poolTokenAta.toBuffer(),
            ],
            program.programId
        );

        const rewardDuration = new anchor.BN(1 * 30 * 86400);

        Store.addNotification({
            ...notificationConfig,
            type: "info",
            message: "Initializing the main pool"
        });

        try {
            const tx = await program.rpc.initializeMainPool(
                bump,
                rewardDuration,
                {
                    accounts: {
                        authority: program.provider.wallet.publicKey,
                        stakingMint: bindTokenMint,
                        stakingVault: stakingVault,
                        rewardMint: bindTokenMint,
                        rewardVault: rewardVault,
                        poolSigner: poolSigner,
                        pool: poolKeypair.publicKey,
                        poolTokenAta: poolTokenAta,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                        systemProgram: anchor.web3.SystemProgram.programId,
                    },
                    signers: [poolKeypair],
                }
            );
            console.log("tx for initialization of main pool")

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: "Successed to initialize the main pool"
            });

            setIsProcessing(false);
            setMainPoolInitialized(true);
            setMainPoolPubkey(poolKeypair.publicKey.toBase58());
        } catch (err) {
            console.log("Initialize Main pool err", err)
            setIsProcessing(false);

            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: "Failed to initialize the main pool"
            });
        }
    }

    const handleFundModal = async (status) => {
        if (isPaused) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "The main pool is paused now"
            });

            return;
        }
        if (!wallet.publicKey) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please connect your wallet"
            });

            return;
        }

        if (tokenBalance == 0) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "You have no tokens"
            });

            return;
        }

        setShowFundingModal(status)
    }

    const handleFund = async (amount) => {
        setIsProcessing(true);
        try {
            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);
            const adminWalletAta = await findAssociatedTokenAddress(program.provider.wallet.publicKey, bindTokenMint);

            let poolObject = await program.account.pool.fetch(mainPoolKey);

            const [
                poolSigner,
                nonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [mainPoolKey.toBuffer()],
                program.programId
            );

            const tx = await program.rpc.fund(
                new anchor.BN(amount * 10 ** 9),
                {
                    accounts: {
                        // Stake instance.
                        pool: mainPoolKey,
                        stakingVault: poolObject.stakingVault,
                        rewardVault: poolObject.rewardVault,
                        funder: provider.wallet.publicKey,
                        from: adminWalletAta,
                        // Program signers.
                        poolSigner,
                        // Misc.
                        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    },
                }
            );
            console.log("funding tx", tx)

            const tokenBalance = await provider.connection.getTokenAccountBalance(adminWalletAta);
            setTokenBalance(tokenBalance.value.uiAmount)

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: "Successed to fund"
            });

            setIsProcessing(false);
        } catch (err) {
            console.log("funding err", err)
            setIsProcessing(false);

            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: "Failed to fund"
            });
        }
    }

    const handlePausePool = async () => {
        if (!wallet.publicKey) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please connect your wallet"
            });

            return;
        }

        if (poolInfo.authority.toString() != wallet.publicKey.toString()) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "You can't handle the main pool because you're not owner of the main pool"
            });

            return;
        }

        if (isPaused) {
            Store.addNotification({
                ...notificationConfig,
                type: "info",
                message: "The main pool was already paused"
            });

            return;
        }

        try {
            setIsProcessing(true);
            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);

            const [
                poolSigner,
                nonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [mainPoolKey.toBuffer()],
                program.programId
            );

            const tx = await program.rpc.pause(
                {
                    accounts: {
                        pool: mainPoolKey,
                        authority: provider.wallet.publicKey,
                        poolSigner: poolSigner,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    },
                }
            );
            console.log("pause pool tx", tx)

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: "Successed to pause pool"
            });
            setIsPaused(true)
            setIsProcessing(false)
        } catch (err) {
            console.log("pause pool err", err)
            setIsProcessing(false)

            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: "Failed to pause pool"
            });
        }
    }

    const handleUnpausePool = async () => {
        if (!wallet.publicKey) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please connect your wallet"
            });

            return;
        }

        if (poolInfo.authority.toString() != wallet.publicKey.toString()) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "You can't handle the main pool because you're not owner of the main pool"
            });

            return;
        }

        if (!isPaused) {
            Store.addNotification({
                ...notificationConfig,
                type: "info",
                message: "The main pool is working now"
            });

            return;
        }

        try {
            setIsProcessing(true);

            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);

            const [
                poolSigner,
                nonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [mainPoolKey.toBuffer()],
                program.programId
            );

            const tx = await program.rpc.unpause(
                {
                    accounts: {
                        pool: mainPoolKey,
                        authority: provider.wallet.publicKey,
                        poolSigner: poolSigner,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    },
                }
            );
            console.log("unpause pool tx", tx)

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: "Successed to unpause pool"
            });
            setIsPaused(false)
            setIsProcessing(false)
        } catch (err) {
            console.log("unpause pool err", err)
            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: "Failed to unpause pool"
            });
            setIsProcessing(false)
        }
    }

    useEffect(() => {
        (async () => {
            await initialize();
        })()
    }, [wallet, REACT_APP_MAIN_POOL_PUBKEY]);

    return (
        <Spin spinning={isProcessing}>
            {
                isLoading ? (
                    <Spin />
                ) : (
                    <div className="bind-container">
                        <Header heading="Admin Panel" />
                        {
                            !isMainPoolInitialized && !isPubkeyExisted && (
                                <Row className="mt-5 justify-content-center">
                                    <Col sm={4} md={4} lg={4}>
                                        <Row>
                                            <button
                                                onClick={() => handleInitializeMainPool()}
                                                className="browser-btn"
                                            >
                                                initialize Main Pool
                                            </button>
                                        </Row>
                                    </Col>
                                </Row>
                            )
                        }
                        {
                            isMainPoolInitialized && !isPubkeyExisted && (
                                <Row className="mt-5 justify-content-center">
                                    <MainPoolConfigCard mainPoolPubkey={mainPoolPubkey} />
                                </Row>
                            )
                        }
                        {
                            isPubkeyExisted && (
                                <>
                                    <Row className="mt-5 justify-content-center">
                                        <div className="text-center text-white">
                                            {
                                                tokenBalance ? (
                                                    <h3>Your token balance: {tokenBalance?.toLocaleString()}</h3>
                                                ) : (
                                                    <Skeleton.Input active />
                                                )
                                            }
                                        </div>
                                        {
                                            poolInfo && mainPoolKey && (
                                                <VestingStatusCard
                                                    poolInfo={{ ...poolInfo, mainPoolPubkey, paused: isPaused }}
                                                    handleFundModal={handleFundModal}
                                                    handlePausePool={handlePausePool}
                                                    handleUnpausePool={handleUnpausePool}
                                                />
                                            )
                                        }
                                        
                                        {
                                            poolInfo && mainPoolKey && (
                                                <MainPoolStatusCard
                                                    poolInfo={{ ...poolInfo, mainPoolPubkey, paused: isPaused }}
                                                    handleFundModal={handleFundModal}
                                                    handlePausePool={handlePausePool}
                                                    handleUnpausePool={handleUnpausePool}
                                                />
                                            )
                                        }

                                        {
                                            poolInfo && mainPoolKey && (
                                                <MerchantStatusCard
                                                    poolInfo={{ ...poolInfo, mainPoolPubkey, paused: isPaused }}
                                                    handleFundModal={handleFundModal}
                                                    handlePausePool={handlePausePool}
                                                    handleUnpausePool={handleUnpausePool}
                                                />
                                            )
                                        }
                                    </Row>

                                    <FundingModal
                                        show={showFundingModal}
                                        tokenBalance={tokenBalance}
                                        handleModal={handleFundModal}
                                        handleFund={handleFund}
                                    />
                                </>
                            )
                        }
                    </div>
                )
            }
        </Spin>
    );
}
