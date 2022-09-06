import { useState, useEffect } from 'react'
import { Table, Input, Button, Space, Skeleton, Tooltip } from 'antd';
import Highlighter from 'react-highlight-words';
import { SearchOutlined } from '@ant-design/icons';

import { useWallet } from "@solana/wallet-adapter-react";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { Program, Provider } from "@project-serum/anchor";

import stakingIdl from "../../../idl/staking-idl.json";

const opts = {
    preflightCommitment: "processed",
};
const {
    REACT_APP_SOLANA_NETWORK,
    REACT_APP_BIND_TOKEN_MINT_ADDRESS,
    REACT_APP_MAIN_POOL_PUBKEY,
} = process.env;
const programID = new PublicKey(stakingIdl.metadata.address);
const network = clusterApiUrl(REACT_APP_SOLANA_NETWORK);
const connection = new Connection(network, opts.preflightCommitment);

const mainPoolKey = new PublicKey(REACT_APP_MAIN_POOL_PUBKEY || REACT_APP_BIND_TOKEN_MINT_ADDRESS);

let searchInput;
let tableData = [];

const MainPoolStatusTable = () => {
    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('')
    const [isLoading, setLoading] = useState(false)

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
            title: 'UserPubkey',
            dataIndex: 'userPubkey',
            key: 'userPubkey',
            responsive: ["sm"],
            fixed: "left",
            ...getColumnSearchProps('userPubkey'),
            render: userPubkey => (
                <Tooltip placement="topLeft" title={userPubkey}>
                    {String(userPubkey).substring(0, 4) + "..." + String(userPubkey).substring(40)}
                </Tooltip>
            ),
        },
        {
            title: 'StakedAmount',
            dataIndex: 'stakedAmount',
            key: 'stakedAmount',
            responsive: ["sm"],
            ...getColumnSearchProps('stakedAmount'),
            render: (stakedAmount, record) => (
                <Tooltip
                    placement="topLeft"
                    title={
                        <>
                            <div>Self Staked: {stakedAmount - record.remainedAmount}</div>
                            <div>Admin Staked: {record.remainedAmount}</div>
                        </>
                    }
                >
                    {stakedAmount}
                </Tooltip>
            ),
        },
        {
            title: 'Portion(%)',
            dataIndex: 'portion',
            key: 'portion',
            responsive: ["sm"],
            ...getColumnSearchProps('portion'),
        },
        {
            title: 'FirstStakedAt',
            dataIndex: 'firstStakedAt',
            key: 'firstStakedAt',
            responsive: ["sm"],
            ...getColumnSearchProps('firstStakedAt'),
            render: (firstStakedAt, record) => (
                record.stakedCount > 0 ? firstStakedAt : "-"
            ),
        },
        {
            title: 'LastStakeAt',
            dataIndex: 'lastStakeAt',
            key: 'lastStakeAt',
            responsive: ["sm"],
            ...getColumnSearchProps('lastStakeAt'),
            render: (lastStakeAt, record) => (
                record.stakedCount > 0 ? lastStakeAt : "-"
            ),
        },
        {
            title: 'EndTime',
            dataIndex: 'endTime',
            key: 'endTime',
            responsive: ["sm"],
            ...getColumnSearchProps('endTime'),
            render: (endTime, record) => (
                record.stakedCount > 0 ? endTime : "-"
            ),
        },
        {
            title: 'StakedCount',
            dataIndex: 'stakedCount',
            key: 'stakedCount',
            responsive: ["sm"],
            ...getColumnSearchProps('stakedCount'),
        },
        {
            title: 'LastClaimedAt',
            dataIndex: 'lastClaimedAt',
            key: 'lastClaimedAt',
            responsive: ["sm"],
            ...getColumnSearchProps('lastClaimedAt'),
        },
        {
            title: 'ClaimedCount',
            dataIndex: 'claimedCount',
            key: 'claimedCount',
            responsive: ["sm"],
            ...getColumnSearchProps('claimedCount'),
        },
    ];

    const initialize = async () => {
        try {
            setLoading(true)
            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);
            let poolObject = await program.account.pool.fetch(mainPoolKey);
            const stakingAccount = await provider.connection.getTokenAccountBalance(poolObject.stakingVault)
            const userStakedList = poolObject.userStakeList;

            tableData = await Promise.all(
                userStakedList.map(async (item, index) => {
                    let mainPoolUserInfo = await program.account.user.fetch(item);
                    let remainedAmount = mainPoolUserInfo.behalfStakedAmount.reduce((prev, current, index) => {
                        return mainPoolUserInfo.behalfClaimedStatus[index] ? prev * 1 : prev * 1 + current * 1;
                    }, 0);
                    let tableRowData = {
                        key: `${index + 1}`,
                        userPubkey: `${String(mainPoolUserInfo.owner)}`,
                        stakedAmount: mainPoolUserInfo.balanceStaked.toNumber() / 10 ** 9,
                        portion: `${(mainPoolUserInfo.balanceStaked.toNumber() / stakingAccount.value.uiAmount / 10 ** 9 * 100).toFixed(5) * 1}`,
                        firstStakedAt: `${new Date(mainPoolUserInfo.firstStakedTs.toNumber() * 1000).toLocaleString()}`,
                        lastStakeAt: `${new Date(mainPoolUserInfo.stakedTs.toNumber() * 1000).toLocaleString()}`,
                        endTime: `${new Date(mainPoolUserInfo.endTs.toNumber() * 1000).toLocaleString()}`,
                        stakedCount: `${mainPoolUserInfo.stakedCount}`,
                        lastClaimedAt: `${mainPoolUserInfo.claimedCount > 0 ? new Date(mainPoolUserInfo.claimedTs.toNumber() * 1000).toLocaleString() : '-'}`,
                        claimedCount: `${mainPoolUserInfo.claimedCount}`,
                        remainedAmount: remainedAmount / 10 ** 9
                    }

                    return tableRowData
                })
            )

            setLoading(false)
        } catch (err) {
            setLoading(false)
        }
    }

    useEffect(() => {
        (async () => {
            await initialize()
        })()
    }, [])

    return (
        <Skeleton loading={isLoading && !tableData} active>
            <Table
                columns={columns}
                dataSource={tableData}
                scroll={{ x: 1200 }}
                loading={isLoading}
            />
        </Skeleton>
    );
}

export default MainPoolStatusTable;