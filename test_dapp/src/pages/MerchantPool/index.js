import { useState, useEffect } from "react";
import { Col, Row } from "react-bootstrap";
import { Store } from 'react-notifications-component';
import { Spin } from "antd";

import { useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program, Provider, web3 } from "@project-serum/anchor";
import * as anchor from "@project-serum/anchor";

import Header from "../../components/Header/Header";
import stakingIdl from "../../idl/staking-idl.json";
import { notificationConfig } from "../../constants";

import "./index.css";
import MerchantStakingCard from "../../components/Merchant/MerchantStakingCard";
import MerchantCreateModal from "../../components/Merchant/MerchantCreateModal";
import { getWorldTime } from "../../utils";

/// Prerequisites
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

/// Start - Component
export default function MerchantPool() {
  const [mainPoolInfo, setMainPoolInfo] = useState()
  const [isMainPoolInitialized, setIsMainPoolInitialized] = useState()
  const [merchantList, setMerchantList] = useState()
  const [tokenBalance, setTokenBalance] = useState(0)
  const [isLoading, setLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showModal, setShowModal] = useState(false);

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
      setLoading(true)

      const provider = await getProvider();
      const program = new Program(stakingIdl, programID, provider);

      try {
        const rsp = await program.account.pool.fetch(mainPoolKey)
        setMainPoolInfo(rsp);
        setMerchantList(rsp.merchantStakeList)
      } catch (_) {
      }

      try {
        await handleSetTokenBalance();
      } catch (_) {
      }

      setIsMainPoolInitialized(true)
      setLoading(false)
    } catch (_) {
      setIsMainPoolInitialized(false)
      setLoading(false)
    }
  }

  const handleSetTokenBalance = async () => {
    const provider = await getProvider();
    const userWalletAta = await findAssociatedTokenAddress(provider.wallet.publicKey, bindTokenMint);
    const tokenBalance = await provider.connection.getTokenAccountBalance(userWalletAta);

    setTokenBalance(tokenBalance.value.uiAmount)
  }

  const handleModal = async (status) => {
    if (!wallet.publicKey) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "Please connect your wallet"
      });

      return;
    }


    const provider = await getProvider();
    const program = new Program(stakingIdl, programID, provider);

    const [
      merchantPubkey,
      merchantNonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode('merchant-pool')),
        provider.wallet.publicKey.toBuffer(),
        mainPoolKey.toBuffer()
      ],
      program.programId
    );

    let isWalletUsed;
    merchantList.forEach(item => {
      if (item.toString() == merchantPubkey.toString())
        isWalletUsed = true;
    })

    if (isWalletUsed) {
      Store.addNotification({
        ...notificationConfig,
        type: "warning",
        message: "You already created merchant pool with current wallet"
      });

      return;
    }

    setShowModal(status)
  }

  /// initialize a merchant pool
  const handleCreateMerchant = async (merchantName) => {
    try {
      setIsProcessing(true);

      const provider = await getProvider();
      const program = new Program(stakingIdl, programID, provider);

      const [
        merchantPubkey,
        merchantNonce,
      ] = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode('merchant-pool')),
          provider.wallet.publicKey.toBuffer(),
          mainPoolKey.toBuffer()
        ],
        program.programId
      );

      const currentTime = await getWorldTime();
      const tx = await program.rpc.initializeMerchantPool(
        merchantName,
        merchantNonce,
        new anchor.BN(currentTime),
        {
          accounts: {
            pool: mainPoolKey,
            merchant: merchantPubkey,
            owner: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          },
        }
      );
      console.log("tx: ", tx)

      try {
        const rsp = await program.account.pool.fetch(mainPoolKey)
        setMainPoolInfo(rsp);
        setMerchantList(rsp.merchantStakeList)
      } catch (_) {
      }

      Store.addNotification({
        ...notificationConfig,
        type: "success",
        message: "Success to create a new merchant pool"
      });
      setIsProcessing(false)
    } catch (err) {
      console.log("err: ", err)

      Store.addNotification({
        ...notificationConfig,
        type: "danger",
        message: "Failed to create a new merchant pool"
      });
      setIsProcessing(false)
    }
  }

  useEffect(() => {
    (async () => {
      await initialize();
    })()
  }, [wallet]);

  return (
    <div className="bind-container">
      <Header heading="Merchant Pool" />
      {
        isLoading ? (
          <Spin />
        ) :
          !isMainPoolInitialized ? (
            <div className="text-center">
              <h2 className="text-white">
                {
                  wallet.publicKey ? (
                    <span>Main Pool is not initialized.</span>
                  ) : (
                    <span>Please connect wallet</span>
                  )
                }
              </h2>
            </div>
          ) : (
            <Spin spinning={isProcessing}>
              <Row className="mt-5 justify-content-center">
                <Col sm={4} md={4} lg={4}>
                  <Row>
                    <button
                      onClick={() => handleModal(true)}
                      className="browser-btn"
                    >
                      Create new Merchant Pool
                    </button>
                  </Row>
                </Col>
              </Row>

              <Row className="mt-5 justify-content-center">
                {
                  merchantList?.length ? (
                    merchantList.map((item, index) => {
                      return (
                        <Col sm={12} md={10} lg={10} className="mb-5" key={index}>
                          <MerchantStakingCard
                            tokenBalance={tokenBalance}
                            merchantPubkey={item}
                          />
                        </Col>
                      )
                    })
                  ) : (
                    <div className="text-center text-white">
                      <h3>No merchants created</h3>
                    </div>
                  )
                }
              </Row>
              <MerchantCreateModal
                show={showModal}
                handleModal={handleModal}
                handleCreateMerchant={handleCreateMerchant}
              />
            </Spin>
          )
      }
    </div>
  );
}