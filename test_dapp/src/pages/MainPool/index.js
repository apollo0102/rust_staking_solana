import React, { useEffect, useState } from "react";
import { Col, Row } from "react-bootstrap";
import { Spin } from "antd";
import { Store } from 'react-notifications-component';

import { useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program, Provider, web3 } from "@project-serum/anchor";
import * as anchor from "@project-serum/anchor";

import Header from "../../components/Header/Header";
import StakingCard from "../../components/MainPool/StakingCard";
import StakingModal from "../../components/MainPool/Modal";
import StakingOnBehalfTableCard from "../../components/MainPool/StakingOnBehalfTableCard";
import stakingIdl from "../../idl/staking-idl.json";
import { getWorldTime } from "../../utils";
import { notificationConfig } from "../../constants";

import "./index.css";

const opts = {
  preflightCommitment: "processed",
};
const {
  REACT_APP_SOLANA_NETWORK,
  REACT_APP_BIND_TOKEN_MINT_ADDRESS,
  REACT_APP_WITHDRAW_PERIOD,
  REACT_APP_MAIN_POOL_PUBKEY
} = process.env;
const bindTokenMint = new PublicKey(REACT_APP_BIND_TOKEN_MINT_ADDRESS);
const programID = new PublicKey(stakingIdl.metadata.address);
const network = clusterApiUrl(REACT_APP_SOLANA_NETWORK);
const connection = new Connection(network, opts.preflightCommitment);

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const mainPoolKey = new PublicKey(REACT_APP_MAIN_POOL_PUBKEY || REACT_APP_BIND_TOKEN_MINT_ADDRESS);

export default function MainPool() {
  const [showModal, setShowModal] = useState(false);
  const [isCreatedUser, setIsCreatedUser] = useState(false);
  const [userInfo, setUserInfo] = useState();
  const [endtime, setEndtime] = useState();
  const [totalStakedAmount, setTotalStakedAmount] = useState(0);
  const [adminStakedAmount, setAdminStakedAmount] = useState(0);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [mianPoolInfo, setMainPoolInfo] = useState();
  const [isLoading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const wallet = useWallet();

  async function getProvider() {
    const provider = new Provider(connection, wallet, opts.preflightCommitment);
    return provider;
  }

  const handleStakingModal = async (status) => {
    if (mianPoolInfo.paused) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You can't stake tokens because the main pool is paused"
      });

      return
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

    setShowModal(status)
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

  const initialize = async () => {
    try {
      setLoading(true)

      const provider = await getProvider();
      const program = new Program(stakingIdl, programID, provider);

      try {
        const rsp = await program.account.pool.fetch(mainPoolKey);
        setMainPoolInfo(rsp);
      } catch (_) {
      }

      try {
        await handleSetUserInfo();
        setIsCreatedUser(true)
      } catch (_) {
      }

      await handleSetTokenBalance();

      setLoading(false)
    } catch (_) {
      setLoading(false)
    }
  }

  const handleSetTokenBalance = async () => {
    const provider = await getProvider();
    const userWalletAta = await findAssociatedTokenAddress(provider.wallet.publicKey, bindTokenMint);
    const tokenBalance = await provider.connection.getTokenAccountBalance(userWalletAta);
    setTokenBalance(tokenBalance.value.uiAmount)
  }

  const handleSetUserInfo = async () => {
    const provider = await getProvider();
    const program = new Program(stakingIdl, programID, provider);

    const [
      userPubkey, userNonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
      [provider.wallet.publicKey.toBuffer(), mainPoolKey.toBuffer()],
      program.programId
    );
    let userInfo = await program.account.user.fetch(userPubkey);
    let adminStakedAmount = userInfo.behalfStakedAmount.reduce((prev, current, index) => {
      return userInfo.behalfClaimedStatus[index] ? prev : prev * 1 + current * 1;
    }, 0);

    setTotalStakedAmount(userInfo.balanceStaked.toNumber() / 10 ** 9)
    setAdminStakedAmount(adminStakedAmount / 10 ** 9)
    setEndtime(userInfo.endTs?.toNumber())
    setUserInfo(userInfo)
  }

  const handleCreateUserStakingAccount = async () => {
    try {
      Store.addNotification({
        ...notificationConfig,
        type: "info",
        message: "Creating user account for staking in the main pool"
      });

      const provider = await getProvider();
      const program = new Program(stakingIdl, programID, provider);

      const [
        userPubkey, userNonce,
      ] = await anchor.web3.PublicKey.findProgramAddress(
        [provider.wallet.publicKey.toBuffer(), mainPoolKey.toBuffer()],
        program.programId
      );

      const currentTime = await getWorldTime();

      await program.rpc.createUser(
        userNonce,
        new anchor.BN(currentTime),
        {
          accounts: {
            pool: mainPoolKey,
            user: userPubkey,
            owner: provider.wallet.publicKey,
            payer: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          },
        }
      );


      let userInfo = await program.account.user.fetch(userPubkey);
      setIsCreatedUser(true)
      setUserInfo(userInfo)

      return true;
    } catch (err) {
      console.log("creating user account err", err)
      Store.addNotification({
        ...notificationConfig,
        type: "danger",
        message: "Failed to Create user account for staking in the main pool"
      });

      return false
    }
  }

  const handleStake = async (amount, lockingPeriod) => {
    try {
      setIsProcessing(true)
      if (!isCreatedUser) {
        const userAccountStatus = await handleCreateUserStakingAccount()
        if (!userAccountStatus) {
          setIsProcessing(false)

          return;
        }
      }

      const provider = await getProvider();
      const program = new Program(stakingIdl, programID, provider);

      const userWalletAta = await findAssociatedTokenAddress(program.provider.wallet.publicKey, bindTokenMint)
      const [
        userPubkey, userNonce,
      ] = await anchor.web3.PublicKey.findProgramAddress(
        [provider.wallet.publicKey.toBuffer(), mainPoolKey.toBuffer()],
        program.programId
      );
      let poolObject = await program.account.pool.fetch(mainPoolKey);

      const [
        poolSigner,
        nonce,
      ] = await anchor.web3.PublicKey.findProgramAddress(
        [mainPoolKey.toBuffer()],
        program.programId
      );

      const currentTime = await getWorldTime();

      const tx = await program.rpc.stake(
        new anchor.BN(amount * 10 ** 9),
        new anchor.BN(currentTime),
        new anchor.BN(lockingPeriod),
        {
          accounts: {
            // Stake instance.
            pool: mainPoolKey,
            stakingVault: poolObject.stakingVault,
            // User.
            user: userPubkey,
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
      console.log("staking in main pool tx", tx)


      await handleSetTokenBalance();
      let userInfo = await program.account.user.fetch(userPubkey);
      setTotalStakedAmount(userInfo.balanceStaked.toNumber() / 10 ** 9)
      setEndtime(userInfo.endTs.toNumber())

      Store.addNotification({
        ...notificationConfig,
        type: "success",
        message: "Successed to stake tokens in the main pool"
      });
      setIsProcessing(false)
    } catch (err) {
      console.log("staking in main pool err", err)

      Store.addNotification({
        ...notificationConfig,
        type: "danger",
        message: "Failed to stake tokens in the main pool"
      });
      setIsProcessing(false)
    }
  }

  const handleUnstake = async (amount) => {
    if (mianPoolInfo.paused) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You can't unstake tokens because the main pool is paused"
      });

      return
    }

    if (!isCreatedUser) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You didn't stake tokens yet"
      });

      return;
    }

    if ((totalStakedAmount - adminStakedAmount) <= 0) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You have no tokens staked by yourself"
      });

      return;
    }

    const currentTime = await getWorldTime()

    if (endtime > currentTime) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You can't unstake tokens during locking period"
      });

      return;
    }

    try {
      setIsProcessing(true)
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

      const userWalletAta = await findAssociatedTokenAddress(program.provider.wallet.publicKey, bindTokenMint)
      const [
        userPubkey, userNonce,
      ] = await anchor.web3.PublicKey.findProgramAddress(
        [provider.wallet.publicKey.toBuffer(), mainPoolKey.toBuffer()],
        program.programId
      );

      const tx = await program.rpc.unstake(
        new anchor.BN(amount * 10 ** 9),
        new anchor.BN(currentTime),
        {
          accounts: {
            // Stake instance.
            pool: mainPoolKey,
            stakingVault: poolObject.stakingVault,
            // User.
            user: userPubkey,
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
      console.log("unstake token in main pool => tx", tx)

      await handleSetTokenBalance();
      let userInfo = await program.account.user.fetch(userPubkey);
      setTotalStakedAmount(userInfo.balanceStaked.toNumber() / 10 ** 9)

      Store.addNotification({
        ...notificationConfig,
        type: "success",
        message: "Successed to unstake tokens"
      });

      setEndtime(0)
      setIsProcessing(false)
    } catch (err) {
      console.log("unstake token in main pool => err", err)
      Store.addNotification({
        ...notificationConfig,
        type: "danger",
        message: "Failed to unstake tokens"
      });
      setIsProcessing(false)
    }
  }

  const handleclaim = async () => {
    if (mianPoolInfo.paused) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You can't claim rewards because the main pool is paused"
      });

      return
    }

    if (!isCreatedUser) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You didn't stake tokens yet"
      });

      return;
    }

    if ((totalStakedAmount) <= 0) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You can't claim rewards because you already did unstake tokens"
      });

      return;
    }

    try {
      setIsProcessing(true)
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

      const userWalletAta = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, program.provider.wallet.publicKey, wallet)
      const [
        userPubkey, userNonce,
      ] = await anchor.web3.PublicKey.findProgramAddress(
        [provider.wallet.publicKey.toBuffer(), mainPoolKey.toBuffer()],
        program.programId
      );

      const currentTime = await getWorldTime();

      const tx = await program.rpc.claim(
        new anchor.BN(currentTime),
        {
          accounts: {
            // Stake instance.
            pool: mainPoolKey,
            stakingVault: poolObject.stakingVault,
            rewardVault: poolObject.rewardVault,
            // User.
            user: userPubkey,
            owner: provider.wallet.publicKey,
            rewardAccount: userWalletAta,
            // Program signers.
            poolSigner,
            // Misc.
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }
      );
      console.log("claim tokens => tx", tx)

      await handleSetTokenBalance()

      Store.addNotification({
        ...notificationConfig,
        type: "success",
        message: "Successed to claim tokens"
      });
      setIsProcessing(false)
    } catch (err) {
      console.log("claim tokens => err", err)

      Store.addNotification({
        ...notificationConfig,
        type: "danger",
        message: "Failed to claim tokens"
      });
      setIsProcessing(false)
    }
  }

  const onCompletedWithdraw = async (amount) => {
    setTokenBalance(prev => {
      return prev * 1 + amount * 1
    })

    setTotalStakedAmount(prev => {
      return prev * 1 - amount * 1
    })

    setAdminStakedAmount(prev => {
      return prev * 1 - amount * 1
    })
  }

  useEffect(() => {
    (async () => {
      await initialize();
    })()
  }, [wallet, REACT_APP_MAIN_POOL_PUBKEY]);

  return (
    <Spin spinning={isProcessing}>
      <div className="bind-container">
        <Header heading="Main Pool" />

        {
          isLoading ?
            (
              <Spin />
            )
            : (
              <>
                <Row className="staking-card-container">
                  <Col sm={12} md={4} lg={6} className="align-self-center mb-5">
                    <div>
                      <div>
                        <h3 className="text-white">Current Token Amount:</h3>
                        <div className="text-mut text-white">
                          <h5>{tokenBalance?.toLocaleString()}</h5>
                        </div>
                      </div>
                      <Row className="mt-5">
                        <Col sm={12} md={12} lg={6}>
                          <Row>
                            <button
                              onClick={() => handleStakingModal(true)}
                              className="browser-btn"
                            >
                              Stake
                            </button>
                          </Row>
                        </Col>
                      </Row>

                      <Row className="mt-3">
                        <Col sm={12} md={12} lg={6}>
                          <Row>
                            <button
                              onClick={() => handleUnstake(totalStakedAmount)}
                              className="browser-btn"
                            >
                              Unstake
                            </button>
                          </Row>
                        </Col>
                      </Row>
                    </div>
                  </Col>
                  <Col sm={12} md={8} lg={6} className="mb-5">
                    <StakingCard
                      totalStakedAmount={totalStakedAmount}
                      adminStakedAmount={adminStakedAmount}
                      endTs={endtime}
                      handleclaim={handleclaim}
                    />
                  </Col>

                  <Col sm={12} md={12} lg={12}>
                    <StakingOnBehalfTableCard
                      mianPoolInfo={mianPoolInfo}
                      onCompletedWithdraw={onCompletedWithdraw}
                    />
                  </Col>
                </Row>
              </>
            )
        }

        <StakingModal
          show={showModal}
          tokenBalance={tokenBalance}
          handleModal={handleStakingModal}
          handleStake={handleStake}
        />
        <hr className="hr-line" />
      </div>
    </Spin>
  );
}
