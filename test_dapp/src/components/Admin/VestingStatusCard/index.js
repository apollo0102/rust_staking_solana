import { useState, useEffect } from "react";
import { Card, Row, Col } from "react-bootstrap";
import { Store } from 'react-notifications-component';
import { SketchOutlined, UserOutlined, CreditCardOutlined } from '@ant-design/icons';
import { Skeleton, Button, Form, Input, Spin } from 'antd';

import { useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program, Provider } from "@project-serum/anchor";
import * as anchor from "@project-serum/anchor";

import VestingStatusTable from "../VestingStatusTable";
import vestingIdl from "../../../idl/vesting-idl.json";
import { notificationConfig } from "../../../constants";
import { getWorldTime } from "../../../utils";

import "./index.css";

const opts = {
    preflightCommitment: "processed",
};
const {
    REACT_APP_SOLANA_NETWORK,
    REACT_APP_BIND_TOKEN_MINT_ADDRESS,
} = process.env;

const bindTokenMint = new PublicKey(REACT_APP_BIND_TOKEN_MINT_ADDRESS);
const network = clusterApiUrl(REACT_APP_SOLANA_NETWORK);
const programID = new PublicKey(vestingIdl.metadata.address);
const connection = new Connection(network, opts.preflightCommitment);
const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const VestingStatusCard = (props) => {
    const [isRegistered, setRegistered] = useState(false)
    const [investorAccountList, setInvestorAccountList] = useState();
    const [isLoading, setLoading] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false);
    const [, forceUpdate] = useState({});

    const [form] = Form.useForm();

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
            const program = new Program(vestingIdl, programID, provider);

            const [investorAccountPda] = await PublicKey.findProgramAddress(
                [Buffer.from(anchor.utils.bytes.utf8.encode('investor-account'))],
                program.programId
            );

            const investorAccountList = await program.account.investorAccount.fetch(investorAccountPda);
            setInvestorAccountList(investorAccountList)
            setRegistered(true);

            setLoading(false)
        } catch (_) {
            setLoading(false)
        }
    }

    const handleInitializeVestingContract = async () => {
        try {
            setIsProcessing(true);

            const provider = await getProvider();
            const program = new Program(vestingIdl, programID, provider);
            const owner = program.provider.wallet.publicKey;

            const [investorAccountPda] = await PublicKey.findProgramAddress(
                [Buffer.from(anchor.utils.bytes.utf8.encode('investor-account'))],
                program.programId
            );

            const tx = await program.rpc.initializeVesting(
                {
                    accounts: {
                        owner: owner,
                        investorAccount: investorAccountPda,
                        systemProgram: anchor.web3.SystemProgram.programId,
                    },
                }
            );
            console.log("tx", tx)
            setRegistered(true)

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: "Successed"
            });

            const investorAccountList = await program.account.investorAccount.fetch(investorAccountPda);
            setInvestorAccountList(investorAccountList)
            console.log("investorAccountList", investorAccountList)

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

    const onFinish = async (values) => {
        console.log('Finish:', values);
        await handleVest(values)
    };

    const handleVest = async (params) => {
        try {
            setIsProcessing(true);

            const {
                amount,
                investorName,
            } = params;

            const provider = await getProvider();
            const program = new Program(vestingIdl, programID, provider);
            const owner = program.provider.wallet.publicKey;

            if (owner.toString() !== investorAccountList.owner.toString()) {
                Store.addNotification({
                    ...notificationConfig,
                    type: "warning",
                    message: "You can't do this action because current wallet is not a owner's wallet."
                });

                setIsProcessing(false);
                return;
            }

            if (investorAccountList.investors.find(item => item.toString() == params.investorPubkey)) {
                Store.addNotification({
                    ...notificationConfig,
                    type: "warning",
                    message: `${investorName}(${params.investorPubkey}) was already registerd`
                });

                setIsProcessing(false);
                return;
            }

            let ownerTokenAccount = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, owner, wallet);
            let investorPubkey = new PublicKey(params.investorPubkey)
            let beneficiaryTokenAccount = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, investorPubkey, wallet);

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

            const [investorAccountPda] = await PublicKey.findProgramAddress(
                [Buffer.from(anchor.utils.bytes.utf8.encode('investor-account'))],
                program.programId
            );

            const startTs = await getWorldTime();

            const tx = await program.rpc.initialize(
                new anchor.BN(amount * 10 ** 9),
                investorName,
                new anchor.BN(startTs),
                true,
                {
                    accounts: {
                        owner,
                        beneficiary: investorPubkey,
                        mint: bindTokenMint,
                        beneficiaryAta: beneficiaryTokenAccount,
                        vaultAccount: vaultAccount,
                        ownerTokenAccount: ownerTokenAccount,
                        vestingAccount: vestingAccount,
                        investorAccount: investorAccountPda,
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

            const _investorAccountList = await program.account.investorAccount.fetch(investorAccountPda);
            setInvestorAccountList(_investorAccountList)

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

    useEffect(() => {
        (async () => {
            forceUpdate({});
            await init();
        })()
    }, [])

    return (

        <Card className="main-pool-status-card mt-2 mb-5">
            <Skeleton loading={isLoading} active>
                <Spin spinning={isProcessing}>
                    <Card.Body className="pt-5 pb-5">
                        <div className="w-100">
                            <div>
                                <Row>
                                    <h3>Vesting Status</h3>
                                    {
                                        !isRegistered ? (
                                            <Row className="mt-2 justify-content-center">
                                                <Col sm={4} md={4} lg={4}>
                                                    <Row>
                                                        <button
                                                            onClick={() => handleInitializeVestingContract()}
                                                            className="browser-btn text-black"
                                                        >
                                                            Initialize Vesting Contract
                                                        </button>
                                                    </Row>
                                                </Col>
                                            </Row>
                                        ) : (
                                            <>
                                                <h5>Contract Owner: {investorAccountList && investorAccountList?.owner?.toString()}</h5>
                                                <Col sm={12} md={12} lg={12} className="mt-5 mb-1">
                                                    <Form
                                                        form={form}
                                                        name="horizontal_login"
                                                        layout="inline"
                                                        className="justify-content-center"
                                                        onFinish={onFinish}
                                                    >
                                                        <Form.Item
                                                            name="investorName"
                                                            className="mb-2"
                                                            rules={[
                                                                {
                                                                    required: true,
                                                                    message: 'Please input investor name!',
                                                                },
                                                            ]}
                                                        >
                                                            <Input prefix={<UserOutlined className="site-form-item-icon" />} placeholder="Investor Name" />
                                                        </Form.Item>

                                                        <Form.Item
                                                            name="investorPubkey"
                                                            className="min-w-30 mb-2"
                                                            rules={[
                                                                {
                                                                    required: true,
                                                                    message: 'Please input wallet address of an investor!',
                                                                },
                                                            ]}
                                                        >
                                                            <Input prefix={<CreditCardOutlined className="site-form-item-icon" />} placeholder="Investor Address" />
                                                        </Form.Item>
                                                        <Form.Item
                                                            name="amount"
                                                            className="mb-2"
                                                            rules={[
                                                                {
                                                                    required: true,
                                                                    message: 'Please input amount!',
                                                                },
                                                            ]}
                                                        >
                                                            <Input
                                                                prefix={<SketchOutlined className="site-form-item-icon" />}
                                                                type="number"
                                                                className="mb-2"
                                                                min={0}
                                                                placeholder="Amount"
                                                            />
                                                        </Form.Item>
                                                        <Form.Item shouldUpdate>
                                                            {() => (
                                                                <Button
                                                                    type="primary"
                                                                    htmlType="submit"
                                                                    disabled={
                                                                        !form.isFieldsTouched(true) ||
                                                                        !!form.getFieldsError().filter(({ errors }) => errors.length).length
                                                                    }
                                                                >
                                                                    Submit
                                                                </Button>
                                                            )}
                                                        </Form.Item>
                                                    </Form>
                                                </Col>

                                                <VestingStatusTable
                                                    investors={investorAccountList.investors}
                                                    contractOwner={investorAccountList.owner}
                                                />
                                            </>
                                        )
                                    }
                                </Row>
                            </div>
                        </div>
                    </Card.Body>
                </Spin>
            </Skeleton>
        </Card>
    );
};

export default VestingStatusCard;