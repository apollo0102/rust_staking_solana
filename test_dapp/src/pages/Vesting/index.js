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
import VestingCard from "../../components/Vesting/VestingCard";
import VestingModal from "../../components/Vesting/Modal";
import vestingIdl from "../../idl/vesting-idl.json";
import { getWorldTime } from "../../utils";
import { notificationConfig } from "../../constants";

import "./index.css";

const opts = {
  preflightCommitment: "processed",
};
const {
  REACT_APP_SOLANA_NETWORK,
  REACT_APP_BIND_TOKEN_MINT_ADDRESS,
  REACT_APP_WITHDRAW_PERIOD
} = process.env;
const bindTokenMint = new PublicKey(REACT_APP_BIND_TOKEN_MINT_ADDRESS);
const programID = new PublicKey(vestingIdl.metadata.address);
const network = clusterApiUrl(REACT_APP_SOLANA_NETWORK);
const connection = new Connection(network, opts.preflightCommitment);

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

export default function Vesting() {
  const [isRegistered, setRegistered] = useState(false);
  const [isUpfronted, setIsUpfronted] = useState(true);
  const [vestedAmount, setVestedAmount] = useState(0);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [vestedAt, setVestedAt] = useState();
  const [remainedTime, setRemainedTime] = useState();
  const [isApproved, setIsApproved] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

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

  const initialize = async () => {
    try {
      setLoading(true);
      const provider = await getProvider();
      const program = new Program(vestingIdl, programID, provider);
      const owner = program.provider.wallet.publicKey;

      let beneficiaryTokenAccount = await findAssociatedTokenAddress(owner, bindTokenMint);
      const tokenBalance = await provider.connection.getTokenAccountBalance(beneficiaryTokenAccount);
      setTokenBalance(tokenBalance.value.uiAmount)

      const [vestingAccount] = await PublicKey.findProgramAddress(
        [beneficiaryTokenAccount.toBuffer()],
        program.programId
      );

      const rsp = await program.account.vestingAccount.fetch(vestingAccount);
      const currentTime = await getWorldTime();
      const timeleft =
        REACT_APP_WITHDRAW_PERIOD * 1 -
        (currentTime - rsp?.withdrawTs?.toNumber());

      setRegistered(true);
      setIsUpfronted(rsp.upfronted);
      setIsApproved(rsp.approved);
      setVestedAt(rsp?.withdrawTs?.toNumber());
      setRemainedTime(timeleft);
      setVestedAmount((rsp.totalDepositedAmount.toNumber() - rsp.releasedAmount.toNumber()) / 10 ** 9);
      setLoading(false);
    } catch (err) {
      setLoading(false);
    }
  }

  // function to handle token vesting
  const handleVest = async (amount) => {
    setIsProcessing(true);

    const provider = await getProvider();
    const program = new Program(vestingIdl, programID, provider);
    const owner = program.provider.wallet.publicKey;

    let ownerTokenAccount = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, owner, wallet);
    let beneficiaryTokenAccount = ownerTokenAccount;

    const [vaultAccount] = await PublicKey.findProgramAddress(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode('token-vault')),
        beneficiaryTokenAccount.toBuffer(),
      ],
      program.programId
    );

    const [vestingAccount] = await PublicKey.findProgramAddress(
      [beneficiaryTokenAccount.toBuffer()],
      program.programId
    );

    const startTs = await getWorldTime();

    try {
      const tx = await program.rpc.initialize(
        new anchor.BN(amount * 10 ** 9),
        new anchor.BN(startTs),
        true,
        {
          accounts: {
            owner,
            beneficiary: program.provider.wallet.publicKey,
            mint: bindTokenMint,
            beneficiaryAta: beneficiaryTokenAccount,
            vaultAccount: vaultAccount,
            ownerTokenAccount: ownerTokenAccount,
            vestingAccount: vestingAccount,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }
      );
      console.log("tx", tx)

      Store.addNotification({
        ...notificationConfig,
        type: "success",
        message: "Successed"
      });

      const rsp = await program.account.vestingAccount.fetch(vestingAccount);
      const tokenBalance = await provider.connection.getTokenAccountBalance(beneficiaryTokenAccount);
      setRegistered(true);
      setVestedAt(startTs);
      setRemainedTime(REACT_APP_WITHDRAW_PERIOD * 1);
      setTokenBalance(tokenBalance.value.uiAmount)
      setVestedAmount((rsp.totalDepositedAmount.toNumber() - rsp.releasedAmount.toNumber()) / 10 ** 9);
      setIsUpfronted(false);

      setIsProcessing(false);
    } catch (err) {
      console.log(err)
      setIsProcessing(false);

      Store.addNotification({
        ...notificationConfig,
        type: "danger",
        message: "Failed. Try again."
      });
    }
  }

  const handleUpfront = async () => {
    if (isUpfronted) {
      Store.addNotification({
        ...notificationConfig,
        type: "info",
        message: "You already received upfront"
      });

      return;
    }

    if (!isApproved) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You are not allowed to receive tokens"
      });

      return;
    }

    if (vestedAmount <= 0) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You already received all tokens"
      });

      return;
    }

    try {
      setIsProcessing(true);

      const provider = await getProvider();
      const program = new Program(vestingIdl, programID, provider);
      const owner = program.provider.wallet.publicKey;

      let ownerTokenAccount = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, owner, wallet);
      let beneficiaryTokenAccount = ownerTokenAccount;

      const [vaultAccount] = await PublicKey.findProgramAddress(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode('token-vault')),
          beneficiaryTokenAccount.toBuffer(),
        ],
        program.programId
      );

      const [vaultAuthority] = await PublicKey.findProgramAddress(
        [Buffer.from(anchor.utils.bytes.utf8.encode('vault-authority'))],
        program.programId
      );

      const [vestingAccount] = await PublicKey.findProgramAddress(
        [beneficiaryTokenAccount.toBuffer()],
        program.programId
      );

      const currentTime = await getWorldTime();

      const tx = await program.rpc.upfront(
        new anchor.BN(currentTime),
        {
          accounts: {
            beneficiary: program.provider.wallet.publicKey,
            beneficiaryAta: beneficiaryTokenAccount,
            vaultAccount: vaultAccount,
            vestingAccount: vestingAccount,
            vaultAuthority: vaultAuthority,
            ownerTokenAccount: ownerTokenAccount,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }
      );
      console.log("tx for upfront", tx)

      Store.addNotification({
        ...notificationConfig,
        type: "success",
        message: "Successed"
      });

      setIsUpfronted(true);

      const rsp = await program.account.vestingAccount.fetch(vestingAccount);
      const tokenBalance = await provider.connection.getTokenAccountBalance(beneficiaryTokenAccount);
      setTokenBalance(tokenBalance.value.uiAmount)
      setVestedAmount((rsp.totalDepositedAmount.toNumber() - rsp.releasedAmount.toNumber()) / 10 ** 9);

      setIsProcessing(false);
    } catch (err) {
      console.log("upfront err", err)
      setIsProcessing(false);

      Store.addNotification({
        ...notificationConfig,
        type: "danger",
        message: "Failed. Try again."
      });
    }
  }

  const handleWithdraw = async () => {
    if (!wallet.publicKey) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "Please connect your wallet"
      });

      return;
    }

    if (!isApproved) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You are not allowed to receive tokens"
      });

      return;
    }

    if (vestedAmount <= 0) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You already received all tokens"
      });

      return;
    }

    const currentTime = await getWorldTime();
    if (!isRegistered) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You didn\'t vest tokens."
      });

      return;
    }

    if (!isUpfronted) {
      Store.addNotification({
        ...notificationConfig,
        type: "info",
        message: "Please receive upfront before withdrawing tokens"
      });

      return;
    }

    if (currentTime < vestedAt + REACT_APP_WITHDRAW_PERIOD * 1) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You can\'t withdraw tokens yet."
      });

      return;
    }

    try {
      setIsProcessing(true);

      const provider = await getProvider();
      const program = new Program(vestingIdl, programID, provider);
      const owner = program.provider.wallet.publicKey;

      let ownerTokenAccount = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, owner, wallet);
      let beneficiaryTokenAccount = ownerTokenAccount;

      const [vaultAccount] = await PublicKey.findProgramAddress(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode('token-vault')),
          beneficiaryTokenAccount.toBuffer(),
        ],
        program.programId
      );

      const [vaultAuthority] = await PublicKey.findProgramAddress(
        [Buffer.from(anchor.utils.bytes.utf8.encode('vault-authority'))],
        program.programId
      );

      const [vestingAccount] = await PublicKey.findProgramAddress(
        [beneficiaryTokenAccount.toBuffer()],
        program.programId
      );

      let rsp = await program.account.vestingAccount.fetch(vestingAccount);
      const tx = await program.rpc.withdraw(
        new anchor.BN(currentTime),
        {
          accounts: {
            beneficiary: program.provider.wallet.publicKey,
            beneficiaryAta: beneficiaryTokenAccount,
            vaultAccount: vaultAccount,
            vestingAccount: vestingAccount,
            vaultAuthority: vaultAuthority,
            ownerTokenAccount: ownerTokenAccount,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }
      );

      Store.addNotification({
        ...notificationConfig,
        type: "success",
        message: "Successed"
      });

      rsp = await program.account.vestingAccount.fetch(vestingAccount);
      const tokenBalance = await provider.connection.getTokenAccountBalance(beneficiaryTokenAccount);
      setTokenBalance(tokenBalance.value.uiAmount)
      setVestedAmount((rsp.totalDepositedAmount.toNumber() - rsp.releasedAmount.toNumber()) / 10 ** 9);
      setRemainedTime(REACT_APP_WITHDRAW_PERIOD * 1)
      setVestedAt(currentTime);
      setIsProcessing(false);
      console.log("tx for withdraw", tx)
    } catch (err) {
      console.log("withdraw err", err)
      setIsProcessing(false)

      Store.addNotification({
        ...notificationConfig,
        type: "danger",
        message: "Failed. Try again."
      });
    }
  }

  useEffect(() => {
    (async () => {
      await initialize();
    })()
  }, [wallet]);

  return (
    <Spin spinning={isProcessing}>
      <div className="bind-container">
        <Header heading="Vest your tokens" />

        {
          isLoading ?
            (
              <Spin />
            )
            : (
              <>
                <Row className="vesting-card-container justify-content-center">
                  <Col sm={12} md={4} lg={5} className="align-self-center mb-5">
                    <div>
                      <div>
                        <h3 className="text-white">Current Token Amount:</h3>
                        <div className="text-mut text-white">
                          <h5>{tokenBalance?.toLocaleString()}</h5>
                        </div>
                      </div>
                      {!isUpfronted && isRegistered && (
                        <Row>
                          <Col sm={12} md={12} lg={6} className="mt-3">
                            <Row>
                              <button
                                onClick={() => handleUpfront()}
                                className="browser-btn"
                              >
                                Upfront
                              </button>
                            </Row>
                          </Col>
                        </Row>
                      )}
                    </div>
                  </Col>
                  <Col sm={12} md={8} lg={5} className="mb-5">
                    <VestingCard
                      vestedAmount={vestedAmount}
                      vestedAt={vestedAt}
                      handleWithdraw={() => handleWithdraw()}
                    />
                  </Col>
                </Row>
              </>
            )
        }

        <hr className="hr-line" />
      </div>
    </Spin>
  );
}
