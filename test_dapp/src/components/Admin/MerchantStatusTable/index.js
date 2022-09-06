import { useState, useEffect } from 'react'
import { Table, Input, Button, Space, Skeleton, Tooltip } from 'antd';
import Highlighter from 'react-highlight-words';
import { SearchOutlined } from '@ant-design/icons';

import { useWallet } from "@solana/wallet-adapter-react";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { Program, Provider } from "@project-serum/anchor";

import stakingIdl from "../../../idl/staking-idl.json";

import "./index.css"

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

const MerchantStatusTable = (props) => {
    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('')
    const [merchantList, setMerchantList] = useState();
    const [isLoading, setLoading] = useState(false)

    const { handleModal } = props

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

    const handleShowDetails = async (key) => {
        if (merchantList && merchantList.length > 0) {
            const currentMerchantKey = merchantList[key - 1];
            await handleModal(true, currentMerchantKey)
        }
    }

    const columns = [
        {
            title: 'MerchantName',
            dataIndex: 'merchantName',
            key: 'merchantName',
            responsive: ["sm"],
            fixed: "left",
            ...getColumnSearchProps('merchantName'),
            render: (text, record) => {
                return (
                    <a
                        className='table-action active'
                        onClick={() => handleShowDetails(record.key)}>{record.merchantName}</a>
                )
            }
        },
        {
            title: 'MerchantPubkey',
            dataIndex: 'merchantPubkey',
            key: 'merchantPubkey',
            responsive: ["sm"],
            ...getColumnSearchProps('merchantPubkey'),
            render: merchantPubkey => (
                <Tooltip placement="topLeft" title={merchantPubkey}>
                    {String(merchantPubkey).substring(0, 4) + "..." + String(merchantPubkey).substring(40)}
                </Tooltip>
            ),
        },
        {
            title: 'Owner',
            dataIndex: 'owner',
            key: 'owner',
            responsive: ["sm"],
            ...getColumnSearchProps('owner'),
            render: owner => (
                <Tooltip placement="topLeft" title={owner}>
                    {String(owner).substring(0, 4) + "..." + String(owner).substring(40)}
                </Tooltip>
            ),
        },
        {
            title: 'TotalStakedAmount',
            dataIndex: 'totalStakedAmount',
            key: 'totalStakedAmount',
            responsive: ["sm"],
            ...getColumnSearchProps('totalStakedAmount'),
        },
        {
            title: 'Portion(%)',
            dataIndex: 'portion',
            key: 'portion',
            responsive: ["sm"],
            ...getColumnSearchProps('portion'),
        },
        {
            title: 'UsersCount',
            dataIndex: 'usersCount',
            key: 'usersCount',
            responsive: ["sm"],
            ...getColumnSearchProps('usersCount'),
        },
        {
            title: 'CreatedAt',
            dataIndex: 'createdAt',
            key: 'createdAt',
            responsive: ["sm"],
            ...getColumnSearchProps('createdAt'),
        },
        {
            title: 'LastUpdatedAt',
            dataIndex: 'lastClaimedAt',
            key: 'lastClaimedAt',
            responsive: ["sm"],
            ...getColumnSearchProps('LastClaimedAt'),
        },
    ];

    const initialize = async () => {
        try {
            setLoading(true)
            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);
            const poolObject = await program.account.pool.fetch(mainPoolKey);
            const stakingAccount = await provider.connection.getTokenAccountBalance(poolObject.stakingVault)
            const merchantStakeList = poolObject.merchantStakeList;
            setMerchantList(merchantStakeList)

            tableData = await Promise.all(
                merchantStakeList.map(async (item, index) => {
                    let merchantPoolInfo = await program.account.merchant.fetch(item);
                    let tableRowData = {
                        key: `${index + 1}`,
                        merchantName: `${merchantPoolInfo.merchantName}`,
                        merchantPubkey: `${item}`,
                        owner: `${merchantPoolInfo.owner.toString()}`,
                        totalStakedAmount: `${merchantPoolInfo.balanceStaked / 10 ** 9}`,
                        portion: `${(merchantPoolInfo.balanceStaked.toNumber() / stakingAccount.value.uiAmount / 10 ** 9 * 100).toFixed(5) * 1}`,
                        usersCount: `${merchantPoolInfo.merchantUserStakeCount}`,
                        createdAt: `${new Date(merchantPoolInfo.createdAt.toNumber() * 1000).toLocaleString()}`,
                        lastClaimedAt: `${new Date(merchantPoolInfo.lastUpdatedTs.toNumber() * 1000).toLocaleString()}`,
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
        <Skeleton loading={isLoading} active>
            <Table
                columns={columns}
                dataSource={tableData}
                scroll={{ x: 1200 }}
            />
        </Skeleton>
    );
}

export default MerchantStatusTable;