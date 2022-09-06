import { useState, useEffect } from 'react'
import { Table, Input, Button, Space, Skeleton, Tooltip, Switch, Popconfirm, InputNumber } from 'antd';
import Highlighter from 'react-highlight-words';
import {
    SearchOutlined,
    InfoCircleOutlined,
    UserOutlined,
    UndoOutlined,
    SketchOutlined
} from '@ant-design/icons';
import { Store } from 'react-notifications-component';

import { useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program, Provider } from "@project-serum/anchor";
import * as anchor from "@project-serum/anchor";

import { notificationConfig } from '../../../constants';
import vestingIdl from "../../../idl/vesting-idl.json";

import "./index.css"

const opts = {
    preflightCommitment: "processed",
};
const {
    REACT_APP_SOLANA_NETWORK,
    REACT_APP_BIND_TOKEN_MINT_ADDRESS,
} = process.env;
const bindTokenMint = new PublicKey(REACT_APP_BIND_TOKEN_MINT_ADDRESS);
const programID = new PublicKey(vestingIdl.metadata.address);
const network = clusterApiUrl(REACT_APP_SOLANA_NETWORK);
const connection = new Connection(network, opts.preflightCommitment);

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

let searchInput;

const VestingStatusTable = (props) => {
    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('')
    const [isLoading, setLoading] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [tableData, setTableData] = useState()
    const [newName, setNewName] = useState("")
    const [amount, setAmount] = useState(0)

    const {
        investors,
        contractOwner
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
            title: 'InvestorName',
            dataIndex: 'investorName',
            key: 'investorName',
            responsive: ["sm"],
            fixed: "left",
            ...getColumnSearchProps('investorName'),
            render: (text, record) => {
                return (
                    <Popconfirm
                        placement="topLeft"
                        title={
                            <>
                                Are you sure to rename this investor?
                                <Input
                                    placeholder="Enter your investor name"
                                    value={newName}
                                    prefix={<UserOutlined className="site-form-item-icon" />}
                                    suffix={
                                        <Tooltip title="Extra information">
                                            <InfoCircleOutlined style={{ color: 'rgba(0,0,0,.45)' }} />
                                        </Tooltip>
                                    }
                                    onChange={e => setNewName(e.target.value)}
                                />
                            </>
                        }
                        okText="Yes"
                        cancelText="No"
                        onConfirm={() => handleRename(record.investorPubkey, newName)}
                        onVisibleChange={status => { status && setNewName("") }}
                    >
                        <Tooltip placement="topLeft" title={text}>
                            <a className='table-action active'>
                                {text.length > 10 ? String(text).substring(0, 10) + "..." : text}
                            </a>
                        </Tooltip>
                    </Popconfirm>
                )
            }
        },
        {
            title: 'InvestorPubkey',
            dataIndex: 'investorPubkey',
            key: 'investorPubkey',
            responsive: ["sm"],
            ...getColumnSearchProps('investorPubkey'),
            render: investorPubkey => (
                <Tooltip placement="topLeft" title={investorPubkey}>
                    {String(investorPubkey).substring(0, 4) + "..." + String(investorPubkey).substring(40)}
                </Tooltip>
            ),
        },
        {
            title: 'TotalAmount',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            responsive: ["sm"],
            ...getColumnSearchProps('totalAmount'),
            render: (totalAmount, record) => {
                return (
                    record.claimedCount > 0 ? (
                        totalAmount
                    ) : (
                        <Popconfirm
                            placement="topLeft"
                            title={
                                <>
                                    Are you sure to add tokens to this investor?
                                    <InputNumber
                                        placeholder="Enter amount"
                                        className="d-flex w-100"
                                        min={0}
                                        value={amount}
                                        prefix={<SketchOutlined className="site-form-item-icon" />}
                                        suffix={
                                            <Tooltip title="Extra information">
                                                <InfoCircleOutlined style={{ color: 'rgba(0,0,0,.45)' }} />
                                            </Tooltip>
                                        }
                                        onChange={e => setAmount(e)}
                                    />
                                </>
                            }
                            okText="Yes"
                            cancelText="No"
                            onConfirm={() => handleAddTokens(record.investorPubkey, amount, record.revoked, record.claimedCount)}
                            onVisibleChange={status => { status && setAmount(0) }}
                        >
                            <Tooltip placement="topLeft" title={"Click to add tokens"}>
                                <a className='table-action active'>
                                    {totalAmount}
                                </a>
                            </Tooltip>
                        </Popconfirm>
                    )
                )
            }
        },
        {
            title: 'ClaimedAmount',
            dataIndex: 'claimedAmount',
            key: 'claimedAmount',
            responsive: ["sm"],
            ...getColumnSearchProps('claimedAmount'),
        },
        {
            title: 'RemainedAmount',
            dataIndex: 'remainedAmount',
            key: 'remainedAmount',
            responsive: ["sm"],
            ...getColumnSearchProps('remainedAmount'),
        },
        {
            title: 'ClaimedCount',
            dataIndex: 'claimedCount',
            key: 'claimedCount',
            responsive: ["sm"],
            ...getColumnSearchProps('claimedCount'),
        },
        {
            title: 'LastClaimedAt',
            dataIndex: 'lastClaimedAt',
            key: 'lastClaimedAt',
            responsive: ["sm"],
            ...getColumnSearchProps('lastClaimedAt'),
            render: (lastClaimedAt, record) => {
                return (
                    record.claimedCount > 0 ? lastClaimedAt : "-"
                )
            }
        },
        {
            title: 'Revoke',
            responsive: ["sm"],
            align: 'center',
            render: (text, record) => {
                return (
                    record.revoked ? (
                        "Revoked"
                    ) : (
                        <Popconfirm
                            placement="topLeft"
                            title={
                                <>
                                    Are you sure to revoke?
                                </>
                            }
                            okText="Yes"
                            cancelText="No"
                            onConfirm={() => handleRevoke(record.investorPubkey, record.revoked)}
                        >
                            <a className='justify-content-center table-action active'>
                                <UndoOutlined />
                            </a>
                        </Popconfirm>
                    )
                )
            },
        },
        {
            title: 'Approved',
            dataIndex: 'approved',
            key: 'approved',
            align: 'center',
            width: 'auto',
            responsive: ["sm"],
            render: (approved, record) => {
                return (
                    <Switch
                        size="small"
                        checked={approved == true}
                        onChange={e => handleManageAccount(e, approved, record.key, record.investorPubkey)}
                    />
                )
            },
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

    const handleManageAccount = async (_nextStatus, _currentStatus, _index, _investorPubkey) => {
        if (!wallet.publicKey) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please connect your wallet"
            });

            return;
        }

        if (wallet.publicKey.toString() != contractOwner?.toString()) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Only owner can do this operation"
            });

            return;
        }

        if (_nextStatus == _currentStatus) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: `Current account was already ${_nextStatus ? 'approved' : 'not approved'}`
            });

            setIsProcessing(false);
            return;
        }

        try {
            setIsProcessing(true);

            const provider = await getProvider();
            const program = new Program(vestingIdl, programID, provider);
            const owner = program.provider.wallet.publicKey;

            let investorPubkey = new PublicKey(_investorPubkey)
            let beneficiaryTokenAccount = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, investorPubkey, wallet);

            const [vestingAccount] = await PublicKey.findProgramAddress(
                [beneficiaryTokenAccount.toBuffer()],
                program.programId
            );

            const [investorAccountPda] = await PublicKey.findProgramAddress(
                [Buffer.from(anchor.utils.bytes.utf8.encode('investor-account'))],
                program.programId
            );

            if (_nextStatus) {
                const tx = await program.rpc.enableAccount(
                    {
                        accounts: {
                            owner,
                            vestingAccount: vestingAccount,
                            investorAccount: investorAccountPda,
                            systemProgram: anchor.web3.SystemProgram.programId,
                        },
                    }
                );
                console.log("tx", tx)
            } else {
                const tx = await program.rpc.disableAccount(
                    {
                        accounts: {
                            owner,
                            vestingAccount: vestingAccount,
                            investorAccount: investorAccountPda,
                            systemProgram: anchor.web3.SystemProgram.programId,
                        },
                    }
                );
                console.log("tx", tx)
            }

            await initialize(false)

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: "Successed"
            });

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

    const handleRename = async (_investorPubkey, _newName) => {
        if (!wallet.publicKey) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please connect your wallet"
            });

            return;
        }

        if (wallet.publicKey.toString() != contractOwner?.toString()) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Only owner can do this operation"
            });

            return;
        }

        try {
            setIsProcessing(true);

            if (_newName == "") {
                Store.addNotification({
                    ...notificationConfig,
                    type: "warning",
                    message: "Please fill in investor name!"
                });
                setIsProcessing(false)

                return
            }

            const provider = await getProvider();
            const program = new Program(vestingIdl, programID, provider);
            const owner = program.provider.wallet.publicKey;

            let investorPubkey = new PublicKey(_investorPubkey)
            let beneficiaryTokenAccount = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, investorPubkey, wallet);

            const [vestingAccount] = await PublicKey.findProgramAddress(
                [beneficiaryTokenAccount.toBuffer()],
                program.programId
            );

            const [investorAccountPda] = await PublicKey.findProgramAddress(
                [Buffer.from(anchor.utils.bytes.utf8.encode('investor-account'))],
                program.programId
            );

            const tx = await program.rpc.renameAccount(
                _newName,
                {
                    accounts: {
                        owner,
                        vestingAccount: vestingAccount,
                        investorAccount: investorAccountPda,
                        systemProgram: anchor.web3.SystemProgram.programId,
                    },
                }
            );
            console.log("tx", tx)

            await initialize(false)

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: "Successed"
            });

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

    const handleRevoke = async (_investorPubkey, _revoked) => {
        if (!wallet.publicKey) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please connect your wallet"
            });

            return;
        }

        if (wallet.publicKey.toString() != contractOwner?.toString()) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Only owner can do this operation"
            });

            return;
        }

        if (_revoked) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Already revoked"
            });

            return;
        }

        try {
            setIsProcessing(true);

            const provider = await getProvider();
            const program = new Program(vestingIdl, programID, provider);
            const owner = program.provider.wallet.publicKey;

            let ownerTokenAccount = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, owner, wallet);
            let investorPubkey = new PublicKey(_investorPubkey)
            let beneficiaryTokenAccount = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, investorPubkey, wallet);

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

            const tx = await program.rpc.revoke(
                {
                    accounts: {
                        owner: owner,
                        vaultAccount: vaultAccount,
                        vestingAccount: vestingAccount,
                        ownerTokenAccount: ownerTokenAccount,
                        vaultAuthority: vaultAuthority,
                        systemProgram: anchor.web3.SystemProgram.programId,
                        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    },
                }
            );
            console.log("tx for revoke", tx)
            await initialize(false)

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: "Successed"
            });

            setIsProcessing(false);
        } catch (err) {
            console.log("revoke err", err)
            setIsProcessing(false)

            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: "Failed. Try again."
            });
        }
    }

    const handleAddTokens = async (_investorPubkey, _amount, _revoked, _claimedCount) => {
        if (!wallet.publicKey) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please connect your wallet"
            });

            return;
        }

        if (wallet.publicKey.toString() != contractOwner?.toString()) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Only owner can do this operation"
            });

            return;
        }

        if (_revoked) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "You can't add tokens. To add tokens, you should have to make 'Approved' button active"
            });

            return;
        }

        if (_claimedCount > 0) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "You can't add tokens because this investor already claimed some amount of tokens"
            });

            return;
        }

        if (amount <= 0) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please fill in amount"
            });

            return;
        }

        try {
            setIsProcessing(true);

            const provider = await getProvider();
            const program = new Program(vestingIdl, programID, provider);
            const owner = program.provider.wallet.publicKey;

            let ownerTokenAccount = await getOrCreateAssociatedTokenAccount(connection, bindTokenMint, owner, wallet);
            let investorPubkey = new PublicKey(_investorPubkey)
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

            const tx = await program.rpc.addTokenToVesting(
                new anchor.BN(amount * 10 ** 9),
                {
                    accounts: {
                        owner: owner,
                        vaultAccount: vaultAccount,
                        ownerTokenAccount: ownerTokenAccount,
                        vestingAccount: vestingAccount,
                        systemProgram: anchor.web3.SystemProgram.programId,
                        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    },
                }
            );
            console.log("tx for addToken", tx)
            await initialize(false)

            Store.addNotification({
                ...notificationConfig,
                type: "success",
                message: "Successed"
            });

            setIsProcessing(false);
        } catch (err) {
            console.log("addToken err", err)
            setIsProcessing(false)

            Store.addNotification({
                ...notificationConfig,
                type: "danger",
                message: "Failed. Try again."
            });
        }
    }

    const initialize = async (isInit) => {
        try {
            if (isInit)
                setLoading(true)
            const provider = await getProvider();
            const program = new Program(vestingIdl, programID, provider);

            const tableData = await Promise.all(
                investors.map(async (investorPubkey, index) => {
                    let beneficiaryTokenAccount = await findAssociatedTokenAddress(investorPubkey, bindTokenMint);

                    const [vestingAccount] = await PublicKey.findProgramAddress(
                        [beneficiaryTokenAccount.toBuffer()],
                        program.programId
                    );

                    const vestingAccountObject = await program.account.vestingAccount.fetch(vestingAccount);

                    let tableRowData = {
                        key: `${index}`,
                        investorName: `${vestingAccountObject.name}`,
                        investorPubkey: `${investorPubkey.toString()}`,
                        totalAmount: `${vestingAccountObject.totalDepositedAmount / 10 ** 9}`,
                        claimedAmount: `${vestingAccountObject.releasedAmount / 10 ** 9}`,
                        remainedAmount: `${(vestingAccountObject.totalDepositedAmount - vestingAccountObject.releasedAmount) / 10 ** 9}`,
                        claimedCount: `${vestingAccountObject.claimedCount}`,
                        lastClaimedAt: `${new Date(vestingAccountObject.withdrawTs.toNumber() * 1000).toLocaleString()}`,
                        revoked: vestingAccountObject.revoked,
                        approved: vestingAccountObject.approved,
                    }

                    return tableRowData
                })
            )

            setTableData(tableData)

            setLoading(false)
        } catch (err) {
            console.log("err", err)
            setLoading(false)
        }
    }

    useEffect(() => {
        (async () => {
            await initialize(true)
        })()
    }, [investors, contractOwner])

    return (
        <Skeleton loading={isLoading} active>
            <Table
                columns={columns}
                dataSource={tableData}
                scroll={{ x: 1200 }}
                loading={isProcessing}
            />
        </Skeleton>
    );
}

export default VestingStatusTable;