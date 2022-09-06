import { useState, useEffect } from 'react'
import { Table, Input, Button, Space, Skeleton, Tooltip } from 'antd';
import Highlighter from 'react-highlight-words';
import {
    SearchOutlined,
} from '@ant-design/icons';

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
} = process.env;
const programID = new PublicKey(stakingIdl.metadata.address);
const network = clusterApiUrl(REACT_APP_SOLANA_NETWORK);
const connection = new Connection(network, opts.preflightCommitment);

let searchInput;

const StakingOnBehalfTable = (props) => {
    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('')
    const [isLoading, setLoading] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [tableData, setTableData] = useState()

    const {
        passiveStakersList,
        handleModal
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
            title: 'WalletAddress',
            dataIndex: 'walletAddress',
            key: 'walletAddress',
            responsive: ["sm"],
            fixed: "left",
            ...getColumnSearchProps('walletAddress'),
            render: (walletAddress, record) => (
                <Tooltip placement="topLeft" title={walletAddress}>
                    <a
                        className='table-action active'
                        onClick={() => handleModal(true, record.userPubkey)}
                    >
                        {String(walletAddress).substring(0, 4) + "..." + String(walletAddress).substring(40)}
                    </a>
                </Tooltip>
            ),
        },
        {
            title: 'TotalAmount',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            responsive: ["sm"],
            ...getColumnSearchProps('totalAmount'),
        },
        {
            title: 'WithdrawnAmount',
            dataIndex: 'withdrawnAmount',
            key: 'withdrawnAmount',
            responsive: ["sm"],
            ...getColumnSearchProps('withdrawnAmount'),
        },
        {
            title: 'RemainedAmount',
            dataIndex: 'remainedAmount',
            key: 'remainedAmount',
            responsive: ["sm"],
            ...getColumnSearchProps('remainedAmount'),
        },
        {
            title: 'WithdrawnCount',
            dataIndex: 'withdrawnCount',
            key: 'withdrawnCount',
            responsive: ["sm"],
            ...getColumnSearchProps('withdrawnCount'),
        },
    ];

    const initialize = async (isInit) => {
        try {
            if (isInit)
                setLoading(true)
            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);

            const tableData = await Promise.all(
                passiveStakersList.map(async (userPubkey, index) => {
                    const userInfo = await program.account.user.fetch(userPubkey);
                    let totalAmount = userInfo.behalfStakedAmount.reduce((prev, current) => prev * 1 + current * 1, 0)
                    let withdrawnAmount = userInfo.behalfStakedAmount.reduce((prev, current, index) => {
                        return userInfo.behalfClaimedStatus[index] ? prev * 1 + current * 1 : prev * 1;
                    }, 0);
                    let withdrawnCount = userInfo.behalfClaimedStatus.reduce((prev, current) => {
                        return current ? prev + 1 : prev
                    }, 0);

                    let tableRowData = {
                        key: `${index}`,
                        userPubkey: userPubkey.toString(),
                        walletAddress: `${userInfo.owner.toString()}`,
                        totalAmount: totalAmount / 10 ** 9,
                        withdrawnAmount: withdrawnAmount / 10 ** 9,
                        remainedAmount: (totalAmount - withdrawnAmount) / 10 ** 9,
                        withdrawnCount: withdrawnCount,
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
    }, [passiveStakersList])

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

export default StakingOnBehalfTable;