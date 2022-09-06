import { useState, useEffect } from "react";
import { Card, Row, Col } from "react-bootstrap";

import { useWallet } from "@solana/wallet-adapter-react";
import { clusterApiUrl, Connection } from "@solana/web3.js";
import { Provider } from "@project-serum/anchor";

import MainPoolStatusTable from "../MainPoolStatusTable";
import { Divider, Skeleton } from "antd";

import "./index.css";
import StakingOnBehalfCard from "../StakingOnBehalfCard";

const opts = {
    preflightCommitment: "processed",
};
const {
    REACT_APP_SOLANA_NETWORK,
} = process.env;
const network = clusterApiUrl(REACT_APP_SOLANA_NETWORK);
const connection = new Connection(network, opts.preflightCommitment);

const MainPoolStatusCard = (props) => {
    const [isLoading, setLoading] = useState(false)
    const [rewardAmount, setRewardAmount] = useState();
    const [stakedAmount, setStakedAmount] = useState();

    const {
        poolInfo,
        handleFundModal,
        handlePausePool,
        handleUnpausePool
    } = props;

    const {
        mainPoolPubkey,
        authority,
        rewardVault,
        stakingVault,
        paused
    } = poolInfo

    const wallet = useWallet();
    async function getProvider() {
        const provider = new Provider(connection, wallet, opts.preflightCommitment);
        return provider;
    }

    const init = async () => {
        try {
            setLoading(true)
            const provider = await getProvider();
            const rewardAccount = await provider.connection.getTokenAccountBalance(rewardVault)
            const stakingAccount = await provider.connection.getTokenAccountBalance(stakingVault)

            setRewardAmount(rewardAccount.value.uiAmount)
            setStakedAmount(stakingAccount.value.uiAmount)

            setLoading(false)
        } catch (_) {
            setLoading(false)
        }
    }

    const onCompleteStakeOnBehalf = async (amount) => {
        setStakedAmount(prev => {
            return prev * 1 + amount * 1
        })
    }

    useEffect(() => {
        (async () => {
            await init();
        })()
    }, [poolInfo])

    return (
        <Card className="main-pool-status-card">
            <Card.Body className="pt-5 pb-5">
                <Skeleton loading={isLoading} active>
                    <div className="w-100">
                        <div>
                            <h3>MainPool Inforamtion</h3>
                            <Row>
                                <span><strong>MainPool Pubkey: </strong>{mainPoolPubkey}</span>
                            </Row>
                            <Row>
                                <span><strong>MainPool authority: </strong>{authority?.toBase58()}</span>
                            </Row>
                            <Row>
                                <span><strong>Token amount for reward: </strong>{rewardAmount && rewardAmount?.toLocaleString()}</span>
                            </Row>
                            <Row>
                                <span><strong>Total staked token amount: </strong>{stakedAmount && stakedAmount?.toLocaleString()}</span>
                            </Row>
                            <Row>
                                <span><strong>Pool status: </strong>{paused ? 'Paused' : 'Unpaused'}</span>
                            </Row>

                            <Row className="mt-5 justify-content-center">
                                <Col sm={12} md={4} lg={4}>
                                    <Row className="browser-btn-row">
                                        <button
                                            className="browser-btn text-black"
                                            onClick={() => handleFundModal(true)}
                                        >
                                            Fund
                                        </button>
                                    </Row>
                                </Col>

                                <Col sm={12} md={4} lg={4}>
                                    <Row className="browser-btn-row">
                                        <button
                                            className="browser-btn text-black"
                                            onClick={handlePausePool}
                                        >
                                            Pause pool
                                        </button>
                                    </Row>
                                </Col>

                                <Col sm={12} md={4} lg={4}>
                                    <Row className="browser-btn-row">
                                        <button
                                            className="browser-btn text-black"
                                            onClick={handleUnpausePool}
                                        >
                                            Unpause pool
                                        </button>
                                    </Row>
                                </Col>
                            </Row>

                            <Divider />

                            <StakingOnBehalfCard
                                contractOwner={authority}
                                onCompleteStakeOnBehalf={onCompleteStakeOnBehalf}
                            />

                            <Row>
                                <h3>MainPool Status</h3>
                                <MainPoolStatusTable />
                            </Row>
                        </div>
                    </div>
                </Skeleton>
            </Card.Body>
        </Card>
    );
};

export default MainPoolStatusCard;