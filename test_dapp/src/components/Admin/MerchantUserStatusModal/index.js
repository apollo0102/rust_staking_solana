import { useEffect } from 'react';
import { useState } from "react";
import { Modal, Row } from "react-bootstrap";
import { Table, Skeleton, Divider, Tooltip } from 'antd';

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

const MerchantUserStatusModal = (props) => {
    const [merchantPoolInfo, setMerchantPoolInfo] = useState()
    const [tableData, setTalbeData] = useState()
    const [isLoading, setLoading] = useState(false)

    const {
        show,
        currentMerchantKey,
        handleModal,
    } = props;

    const handleClose = () => handleModal(false);

    const wallet = useWallet();

    async function getProvider() {
        const provider = new Provider(connection, wallet, opts.preflightCommitment);
        return provider;
    }

    const initialize = async () => {
        try {
            setLoading(true)
            const provider = await getProvider();
            const program = new Program(stakingIdl, programID, provider);
            let merchantPoolInfo = await program.account.merchant.fetch(currentMerchantKey);
            setMerchantPoolInfo(merchantPoolInfo)

            const merchantUserStakeList = merchantPoolInfo.merchantUserStakeList;
            const tableData = await Promise.all(
                merchantUserStakeList.map(async (item, index) => {
                    let merchantUserInfo = await program.account.merchantUser.fetch(item);
                    let tableRowData = {
                        key: `${index + 1}`,
                        userPubkey: `${merchantUserInfo.owner}`,
                        userStakedAmount: `${merchantUserInfo.balanceStaked.toNumber() / 10 ** 9}`,
                        firstStakedAt: `${new Date(merchantUserInfo.firstStakedTs.toNumber() * 1000).toLocaleString()}`,
                        lastStakeAt: `${new Date(merchantUserInfo.stakedTs.toNumber() * 1000).toLocaleString()}`,
                        endTime: `${new Date(merchantUserInfo.endTs.toNumber() * 1000).toLocaleString()}`,
                        stakedCount: `${merchantUserInfo.stakedCount}`,
                        lastClaimedAt: `${merchantUserInfo.claimedCount > 0 ? new Date(merchantUserInfo.claimedTs.toNumber() * 1000).toLocaleString() : '-'}`,
                        claimedCount: `${merchantUserInfo.claimedCount}`,
                    }

                    return tableRowData
                })
            )

            setTalbeData(tableData)

            setLoading(false)
        } catch (err) {
            setLoading(false)
        }
    }

    const columns = [
        {
            title: 'UserPubkey',
            dataIndex: 'userPubkey',
            key: 'userPubkey',
            responsive: ["sm"],
            fixed: "left",
            render: userPubkey => (
                <Tooltip placement="topLeft" title={userPubkey}>
                    {String(userPubkey).substring(0, 4) + "..." + String(userPubkey).substring(40)}
                </Tooltip>
            ),
        },
        {
            title: 'UserStakedAmount',
            dataIndex: 'userStakedAmount',
            key: 'userStakedAmount',
            responsive: ["sm"],
        },
        {
            title: 'FirstStakedAt',
            dataIndex: 'firstStakedAt',
            key: 'firstStakedAt',
            responsive: ["sm"],
        },
        {
            title: 'LastStakeAt',
            dataIndex: 'lastStakeAt',
            key: 'lastStakeAt',
            responsive: ["sm"],
        },
        {
            title: 'EndTime',
            dataIndex: 'endTime',
            key: 'endTime',
            responsive: ["sm"],
        },
        {
            title: 'StakedCount',
            dataIndex: 'stakedCount',
            key: 'stakedCount',
            responsive: ["sm"],
        },
        {
            title: 'LastClaimedAt',
            dataIndex: 'lastClaimedAt',
            key: 'lastClaimedAt',
            responsive: ["sm"],

        },
        {
            title: 'ClaimedCount',
            dataIndex: 'claimedCount',
            key: 'claimedCount',
            responsive: ["sm"],
        },
    ];

    useEffect(() => {
        (async () => {
            await initialize()
        })()
    }, [currentMerchantKey])

    return (
        <Modal show={show} fullscreen={true} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>Merchant Details</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Skeleton loading={isLoading} active>
                    {
                        <>
                            <Row>
                                <span><strong>MerchantPool Name: {merchantPoolInfo && merchantPoolInfo.merchantName}</strong></span>
                            </Row>
                            <Row>
                                <span><strong>MerchantPool Pubkey: {currentMerchantKey && currentMerchantKey.toString()}</strong></span>
                            </Row>
                            <Row>
                                <span><strong>MerchantPool Owner: {merchantPoolInfo && merchantPoolInfo.owner.toString()}</strong></span>
                            </Row>
                            <Row>
                                <span><strong>Total Staked Amount: {merchantPoolInfo && merchantPoolInfo.balanceStaked.toNumber() / 10 ** 9}</strong></span>
                            </Row>
                            <Row>
                                <span><strong>Users Count: {merchantPoolInfo && merchantPoolInfo.merchantUserStakeCount}</strong></span>
                            </Row>
                        </>
                    }
                </Skeleton>

                <Divider />
                <Row>
                    {
                        <Skeleton loading={isLoading} active>
                            <Table
                                columns={columns}
                                dataSource={tableData}
                                scroll={{ x: 1200 }}
                            />
                        </Skeleton>
                    }
                </Row>
            </Modal.Body>
        </Modal>
    );
}

export default MerchantUserStatusModal;