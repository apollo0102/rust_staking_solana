import { useEffect } from 'react';
import { useState } from "react";
import { Col, Modal, Row } from "react-bootstrap";
import { Table, Skeleton, Divider, Tooltip } from 'antd';
import Countdown from 'react-countdown';

import { useWallet } from "@solana/wallet-adapter-react";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { Program, Provider } from "@project-serum/anchor";

import { getWorldTime } from '../../../utils';
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

const StakingOnBehalfDetailModal = (props) => {
    const [walletAddress, setWalletAddress] = useState()
    const [tableData, setTalbeData] = useState()
    const [isLoading, setLoading] = useState(false)

    const {
        show,
        currentObjectKey,
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
            let userInfo = await program.account.user.fetch(currentObjectKey);
            setWalletAddress(userInfo.owner);
            console.log("userInfo", userInfo);

            let behalfStakedTs = userInfo.behalfStakedTs;
            let behalfStakedAmount = userInfo.behalfStakedAmount;
            let behalfClaimedStatus = userInfo.behalfClaimedStatus;

            let currentTime = await getWorldTime();

            const tableData = await Promise.all(
                behalfStakedTs.map(async (item, index) => {
                    let tableRowData = {
                        key: `${index + 1}`,
                        walletAddress: `${userInfo.owner}`,
                        stakedAmount: behalfStakedAmount[index].toNumber() / 10 ** 9,
                        stakedAt: `${new Date(item.toNumber() * 1000).toLocaleString()}`,
                        endTime: `${new Date((item.toNumber() + 2 * 365 * 86400) * 1000).toLocaleString()}`,
                        withdrawnStatus: `${behalfClaimedStatus[index]}`,
                        remainedTime: (item.toNumber() + 2 * 365 * 86400) - currentTime
                    }

                    console.log("tableRowData", tableRowData)

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
            title: 'StakedAmount',
            dataIndex: 'stakedAmount',
            key: 'stakedAmount',
            responsive: ["sm"],
        },
        {
            title: 'StakedAt',
            dataIndex: 'stakedAt',
            key: 'stakedAt',
            responsive: ["sm"],
        },
        {
            title: 'EndTime',
            dataIndex: 'endTime',
            key: 'endTime',
            responsive: ["sm"],
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
        },
    ];

    useEffect(() => {
        (async () => {
            await initialize()
        })()
    }, [currentObjectKey])

    return (
        <Modal show={show} fullscreen={true} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>Details of Staking on Behalf</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Row className='mb-3'>
                    <Col sm={12} md={12} lg={12}>
                        Wallet Address: {walletAddress?.toString()}
                    </Col>
                </Row>
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

export default StakingOnBehalfDetailModal;