import { Component } from 'react'
import { Table, Input, Button, Space } from 'antd';
import Highlighter from 'react-highlight-words';
import { SearchOutlined } from '@ant-design/icons';

const data = [
    {
        key: '1',
        merchantName: 'Merchant1',
        merchantPubkey: 'GQzX..CZxy',
        totalStakedAmount: '2,000',
        UsersCount: '2022-5-2 00:00:00',
        CreatedAt: '2022-5-2 00:00:00',
    },
    {
        key: '2',
        merchantName: 'Merchant2',
        merchantPubkey: 'GQzX..CZxy',
        totalStakedAmount: '2,000',
        UsersCount: '2022-5-2 00:00:00',
        CreatedAt: '2022-5-2 00:00:00',
    },
    {
        key: '3',
        merchantName: 'Merchant3',
        merchantPubkey: 'GQzX..CZxy',
        totalStakedAmount: '2,000',
        UsersCount: '2022-5-2 00:00:00',
        CreatedAt: '2022-5-2 00:00:00',
    },
    {
        key: '4',
        merchantName: 'Merchant4',
        merchantPubkey: 'GQzX..CZxy',
        totalStakedAmount: '2,000',
        UsersCount: '2022-5-2 00:00:00',
        CreatedAt: '2022-5-2 00:00:00',
    },
];

class MerchantPoolStatusTable extends Component {
    state = {
        searchText: '',
        searchedColumn: '',
    };

    getColumnSearchProps = dataIndex => ({
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
            <div style={{ padding: 8 }}>
                <Input
                    ref={node => {
                        this.searchInput = node;
                    }}
                    placeholder={`Search ${dataIndex}`}
                    value={selectedKeys[0]}
                    onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
                    onPressEnter={() => this.handleSearch(selectedKeys, confirm, dataIndex)}
                    style={{ marginBottom: 8, display: 'block' }}
                />
                <Space>
                    <Button
                        type="primary"
                        onClick={() => this.handleSearch(selectedKeys, confirm, dataIndex)}
                        icon={<SearchOutlined />}
                        size="small"
                        style={{ width: 90 }}
                    >
                        Search
                    </Button>
                    <Button onClick={() => this.handleReset(clearFilters)} size="small" style={{ width: 90 }}>
                        Reset
                    </Button>
                    <Button
                        type="link"
                        size="small"
                        onClick={() => {
                            confirm({ closeDropdown: false });
                            this.setState({
                                searchText: selectedKeys[0],
                                searchedColumn: dataIndex,
                            });
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
                setTimeout(() => this.searchInput.select(), 100);
            }
        },
        render: text =>
            this.state.searchedColumn === dataIndex ? (
                <Highlighter
                    highlightStyle={{ backgroundColor: '#ffc069', padding: 0 }}
                    searchWords={[this.state.searchText]}
                    autoEscape
                    textToHighlight={text ? text.toString() : ''}
                />
            ) : (
                text
            ),
    });

    handleSearch = (selectedKeys, confirm, dataIndex) => {
        confirm();
        this.setState({
            searchText: selectedKeys[0],
            searchedColumn: dataIndex,
        });
    };

    handleReset = clearFilters => {
        clearFilters();
        this.setState({ searchText: '' });
    };

    render() {
        const columns = [
            {
                title: 'MerchantName',
                dataIndex: 'merchantName',
                key: 'merchantName',
                responsive: ["sm"],
                ...this.getColumnSearchProps('merchantName'),
            },
            {
                title: 'MerchantPubkey',
                dataIndex: 'merchantPubkey',
                key: 'merchantPubkey',
                responsive: ["sm"],
                ...this.getColumnSearchProps('merchantPubkey'),
            },
            {
                title: 'TotalStakedAmount',
                dataIndex: 'totalStakedAmount',
                key: 'totalStakedAmount',
                responsive: ["sm"],
                ...this.getColumnSearchProps('totalStakedAmount'),
            },
            {
                title: 'UsersCount',
                dataIndex: 'usersCount',
                key: 'usersCount',
                responsive: ["sm"],
                ...this.getColumnSearchProps('usersCount'),
            },
            {
                title: 'CreatedAt',
                dataIndex: 'createdAt',
                key: 'createdAt',
                responsive: ["sm"],
                ...this.getColumnSearchProps('createdAt'),
                sorter: (a, b) => a.lastClaimedAt.length - b.lastClaimedAt.length,
                sortDirections: ['descend', 'ascend'],
            },
        ];
        return <Table columns={columns} dataSource={data} />;
    }
}

export default MerchantPoolStatusTable;