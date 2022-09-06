import { useState, useEffect } from "react";
import { Row, Col } from "react-bootstrap";
import { Store } from 'react-notifications-component';
import { SketchOutlined, CreditCardOutlined } from '@ant-design/icons';
import { Skeleton, Button, Form, Input, Spin } from 'antd';

import { useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program, Provider } from "@project-serum/anchor";
import * as anchor from "@project-serum/anchor";

import StakingOnBehalfTable from "../StakingOnBehalfTable";
import StakingOnBehalfDetailModal from "../StakingOnBehalfDetailModal";

import stakingIdl from "../../../idl/staking-idl.json";
import { notificationConfig } from "../../../constants";
import { getWorldTime } from "../../../utils";

import "./index.css";

const opts = {
    preflightCommitment: "processed",
};
const {
    REACT_APP_SOLANA_NETWORK,
    REACT_APP_MAIN_POOL_PUBKEY,
    REACT_APP_BIND_TOKEN_MINT_ADDRESS,
} = process.env;

const bindTokenMint = new PublicKey(REACT_APP_BIND_TOKEN_MINT_ADDRESS);
const network = clusterApiUrl(REACT_APP_SOLANA_NETWORK);
const programID = new PublicKey(stakingIdl.metadata.address);
const connection = new Connection(network, opts.preflightCommitment);
const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const mainPoolKey = new PublicKey(REACT_APP_MAIN_POOL_PUBKEY || REACT_APP_BIND_TOKEN_MINT_ADDRESS);

const StakingOnBehalfCard = (props) => {
    const [passiveStakersList, setPassiveStakersList] = useState([]);
    const [currentObjectKey, setCurrentObjectKey] = useState();
    const [showModal, setShowModal] = useState(false)
    const [isLoading, setLoading] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false);
    const [, forceUpdate] = useState({});

    const [form] = Form.useForm();
    const wallet = useWallet();

    const {
        contractOwner,
        onCompleteStakeOnBehalf
    } = props;

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

    const init = async () => {
        try {
            setLoading(true)
            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);

            let poolObject = await program.account.pool.fetch(mainPoolKey);
            setPassiveStakersList(poolObject.passiveStakersList)

            setLoading(false)
        } catch (_) {
            setLoading(false)
        }
    }

    const handleModal = async (status, currentObjectKey) => {
        setCurrentObjectKey(currentObjectKey)
        setShowModal(status)
    }

    const onFinish = async (params) => {
        await handleStakeOnBehalf(params)
    };

    const handleCreateUserStakingAccount = async (_userPubkey) => {
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
                [_userPubkey.toBuffer(), mainPoolKey.toBuffer()],
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
                        owner: _userPubkey,
                        payer: provider.wallet.publicKey,
                        systemProgram: anchor.web3.SystemProgram.programId,
                    },
                }
            );

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

    const handleStakeOnBehalf = async (params) => {
        if (contractOwner.toString() != wallet.publicKey.toString()) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Not Allowed. Should change current wallet to admin wallet."
            });

            return;
        }

        if (params.amount <= 0) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Amount can't be less than zero"
            });

            return;
        }

        try {
            setIsProcessing(true)
            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);

            const _userPubkey = new PublicKey(params.targetAddress);
            const [
                userPubkey, userNonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [_userPubkey.toBuffer(), mainPoolKey.toBuffer()],
                program.programId
            );

            try {
                await program.account.user.fetch(userPubkey);
            } catch (_) {
                const userAccountStatus = await handleCreateUserStakingAccount(_userPubkey)
                if (!userAccountStatus) {
                    setIsProcessing(false)

                    return;
                }
            }

            const userWalletAta = await findAssociatedTokenAddress(program.provider.wallet.publicKey, bindTokenMint)
            let poolObject = await program.account.pool.fetch(mainPoolKey);

            const [
                poolSigner,
                nonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [mainPoolKey.toBuffer()],
                program.programId
            );

            const currentTime = await getWorldTime();

            const tx = await program.rpc.stakeOnBehalf(
                new anchor.BN(params.amount * 10 ** 9),
                new anchor.BN(currentTime),
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
            console.log("stake on behalf tx", tx)

            poolObject = await program.account.pool.fetch(mainPoolKey);
            setPassiveStakersList(poolObject.passiveStakersList)

            await onCompleteStakeOnBehalf(params.amount)

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: "Successed to stake on behalf in the main pool"
            });
            setIsProcessing(false)
        } catch (err) {
            console.log("stake on behalf err", err)

            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: "Failed to stake on behalf in the main pool"
            });
            setIsProcessing(false)
        }
    }

    useEffect(() => {
        (async () => {
            forceUpdate({});
            await init();
        })()
    }, [contractOwner])

    return (

        <Skeleton loading={isLoading} active>
            <Spin spinning={isProcessing}>
                <div className="w-100">
                    <div>
                        <Row>
                            <h3>Staking on Behalf</h3>
                            <Col sm={12} md={12} lg={12} className="mt-3 mb-1">
                                <Form
                                    form={form}
                                    name="horizontal_login"
                                    layout="inline"
                                    className="justify-content-center"
                                    onFinish={onFinish}
                                >
                                    <Form.Item
                                        name="targetAddress"
                                        className="min-w-50 mb-2"
                                        rules={[
                                            {
                                                required: true,
                                                message: 'Please input wallet address!',
                                            },
                                        ]}
                                    >
                                        <Input
                                            prefix={<CreditCardOutlined className="site-form-item-icon" />}
                                            placeholder="Wallet Address of Users/Merchants"
                                        />
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

                            <StakingOnBehalfTable
                                passiveStakersList={passiveStakersList}
                                handleModal={handleModal}
                            />

                            <StakingOnBehalfDetailModal
                                show={showModal}
                                currentObjectKey={currentObjectKey}
                                handleModal={handleModal}
                            />
                        </Row>
                    </div>
                </div>
            </Spin>
        </Skeleton>
    );
};

export default StakingOnBehalfCard;