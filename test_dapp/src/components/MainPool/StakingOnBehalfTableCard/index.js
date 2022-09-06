import { useState, useEffect } from 'react'
import { Card, Row } from "react-bootstrap";
import Countdown from 'react-countdown';
import { Store } from 'react-notifications-component';
import { Table, Input, Button, Space, Skeleton, Tooltip } from 'antd';
import Highlighter from 'react-highlight-words';
import {
    SearchOutlined,
    DeliveredProcedureOutlined
} from '@ant-design/icons';

import { useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program, Provider } from "@project-serum/anchor";
import * as anchor from "@project-serum/anchor";

import { getWorldTime } from '../../../utils';
import { notificationConfig } from '../../../constants';
import stakingIdl from "../../../idl/staking-idl.json";

import "./index.css"

const opts = {
    preflightCommitment: "processed",
};
const {
    REACT_APP_SOLANA_NETWORK,
    REACT_APP_MAIN_POOL_PUBKEY,
    REACT_APP_BIND_TOKEN_MINT_ADDRESS
} = process.env;
const programID = new PublicKey(stakingIdl.metadata.address);
const network = clusterApiUrl(REACT_APP_SOLANA_NETWORK);
const connection = new Connection(network, opts.preflightCommitment);
const mainPoolKey = new PublicKey(REACT_APP_MAIN_POOL_PUBKEY || REACT_APP_BIND_TOKEN_MINT_ADDRESS);
const bindTokenMint = new PublicKey(REACT_APP_BIND_TOKEN_MINT_ADDRESS);

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

let searchInput;

const StakingOnBehalfTableCard = (props) => {
    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('')
    const [isLoading, setLoading] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [tableData, setTableData] = useState()

    const {
        mianPoolInfo,
        onCompletedWithdraw
    } = props
    const wallet = useWallet();

    async function getProvider() {
        const provider = new Provider(connection, wallet, opts.preflightCommitment);
        return provider;
    }

    const getColumnSearchProps = dataIndex => ({
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
            <div style={{ padding: 8 }}>
                <Input
                    ref={node => {
                        searchInput = node;
                    }}
                    placeholder={`Search ${dataIndex}`}
                    value={selectedKeys[0]}
                    onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
                    onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
                    style={{ marginBottom: 8, display: 'block' }}
                />
                <Space>
                    <Button
                        type="primary"
                        onClick={() => handleSearch(selectedKeys, confirm, dataIndex)}
                        icon={<SearchOutlined />}
                        size="small"
                        style={{ width: 90 }}
                    >
                        Search
                    </Button>
                    <Button onClick={() => handleReset(clearFilters)} size="small" style={{ width: 90 }}>
                        Reset
                    </Button>
                    <Button
                        type="link"
                        size="small"
                        onClick={() => {
                            confirm({ closeDropdown: false });
                            setSearchText(selectedKeys[0]);
                            setSearchedColumn(dataIndex);
                        }}
                    >
                        Filter
                    </Button>
                </Space>
            </div>
        ),
        filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
        onFilter: (value, record) =>
            record[dataIndex]
                ? record[dataIndex].toString().toLowerCase().includes(value.toLowerCase())
                : '',
        onFilterDropdownVisibleChange: visible => {
            if (visible) {
                setTimeout(() => searchInput.select(), 100);
            }
        },
        render: text =>
            searchedColumn === dataIndex ? (
                <Highlighter
                    highlightStyle={{ backgroundColor: '#ffc069', padding: 0 }}
                    searchWords={[searchText]}
                    autoEscape
                    textToHighlight={text ? text.toString() : ''}
                />
            ) : (
                text
            ),
    });

    const handleSearch = (selectedKeys, confirm, dataIndex) => {
        confirm();
        setSearchText(selectedKeys[0])
        setSearchedColumn(dataIndex)
    };

    const handleReset = clearFilters => {
        clearFilters();
        setSearchText('')
    };

    const columns = [
        {
            title: 'StakedAmount',
            dataIndex: 'stakedAmount',
            key: 'stakedAmount',
            responsive: ["sm"],
            ...getColumnSearchProps('stakedAmount'),
        },
        {
            title: 'StakedAt',
            dataIndex: 'stakedAt',
            key: 'stakedAt',
            responsive: ["sm"],
            ...getColumnSearchProps('stakedAt'),
        },
        {
            title: 'EndTime',
            dataIndex: 'endTime',
            key: 'endTime',
            responsive: ["sm"],
            ...getColumnSearchProps('endTime'),
        },
        {
            title: 'CountDown',
            dataIndex: 'remainedTime',
            key: 'remainedTime',
            responsive: ["sm"],
            render: (remainedTime, record) => (
                <Countdown date={Date.now() + remainedTime * 1000} />
            ),

        },
        {
            title: 'WithdrawnStatus',
            dataIndex: 'withdrawnStatus',
            key: 'withdrawnStatus',
            responsive: ["sm"],
            ...getColumnSearchProps('withdrawnStatus'),
            render: (text, record) => (
                record.withdrawnStatus ? (
                    "Withdrawn"
                ) : (
                    "Non-Withdrawn"
                )
            )
        },
        {
            title: 'Action',
            responsive: ["sm"],
            align: "center",
            render: (text, record) => (
                record.withdrawnStatus ? (
                    <DeliveredProcedureOutlined />
                ) : (
                    <Tooltip placement="topLeft" title="Withdraw">
                        <a
                            className='table-action justify-content-center active'
                            onClick={() => handleWithdraw(record.key, record.remainedTime, record.stakedAmount)}
                        >
                            <DeliveredProcedureOutlined />
                        </a>
                    </Tooltip>
                )
            )
        },
    ];

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

    const initialize = async (isInit) => {
        try {
            if (isInit)
                setLoading(true)
            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);
            const [
                userPubkey, userNonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [provider.wallet.publicKey.toBuffer(), mainPoolKey.toBuffer()],
                program.programId
            );

            let userInfo = await program.account.user.fetch(userPubkey);

            let behalfStakedTs = userInfo.behalfStakedTs;
            let behalfStakedAmount = userInfo.behalfStakedAmount;
            let behalfClaimedStatus = userInfo.behalfClaimedStatus;

            let currentTime = await getWorldTime();

            const tableData = await Promise.all(
                behalfStakedTs.map(async (item, index) => {
                    let tableRowData = {
                        key: `${index}`,
                        walletAddress: `${userInfo.owner}`,
                        stakedAmount: behalfStakedAmount[index].toNumber() / 10 ** 9,
                        stakedAt: `${new Date(item.toNumber() * 1000).toLocaleString()}`,
                        endTime: `${new Date((item.toNumber() + 2 * 365 * 86400) * 1000).toLocaleString()}`,
                        withdrawnStatus: behalfClaimedStatus[index],
                        remainedTime: (item.toNumber() + 2 * 365 * 86400) - currentTime
                    }

                    return tableRowData
                })
            )

            setTableData(tableData)

            setLoading(false)
        } catch (err) {
            setLoading(false)
        }
    }

    const handleWithdraw = async (listIndex, remainedTime, stakedAmount) => {
        try {
            if (mianPoolInfo.paused) {
                Store.addNotification({
                    ...notificationConfig,
                    type: "warning",
                    message: "You can't withdraw tokens because the main pool is paused"
                });

                return
            }

            if (remainedTime * 1 > 0) {
                Store.addNotification({
                    ...notificationConfig,
                    type: "warning",
                    message: "You can't withdraw tokens during locking period"
                });

                return;
            }

            setIsProcessing(true);

            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);

            let poolObject = await program.account.pool.fetch(mainPoolKey);

            const [
                poolSigner, poolNonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [mainPoolKey.toBuffer()],
                program.programId
            );

            const userWalletAta = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, provider.wallet.publicKey, wallet)
            const [
                userPubkey, userNonce,
            ] = await anchor.web3.PublicKey.findProgramAddress(
                [provider.wallet.publicKey.toBuffer(), mainPoolKey.toBuffer()],
                program.programId
            );

            const currentTs = await getWorldTime()
            const tx = await program.rpc.withdraw(
                listIndex,
                new anchor.BN(currentTs),
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
                });

            await initialize(false)
            await onCompletedWithdraw(stakedAmount)

            console.log("withdraw tx: ", tx)
            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: "Successed to unstake tokens"
            });

            setIsProcessing(false)
        } catch (err) {
            console.log("withdraw err: ", err)
            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: "Failed to withdraw tokens"
            });
            setIsProcessing(false)
        }

    }

    useEffect(() => {
        (async () => {
            await initialize(true)
        })()
    }, [mianPoolInfo])

    return (
        <Card className="text-center vesting-card">
            <Card.Body className="pt-5 pb-5">
                <Row>
                    <h2>Tokens Staked by Admin</h2>
                </Row>
                <Skeleton loading={isLoading} active>
                    <Table
                        columns={columns}
                        dataSource={tableData}
                        scroll={{ x: 1000 }}
                        loading={isProcessing}
                    />
                </Skeleton>
            </Card.Body>
        </Card>
    );
}

export default StakingOnBehalfTableCard;