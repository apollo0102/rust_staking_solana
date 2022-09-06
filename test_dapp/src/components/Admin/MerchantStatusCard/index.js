import { useState, useEffect } from "react";
import { Card, Row } from "react-bootstrap";

import MerchantStatusTable from "../MerchantStatusTable";
import MerchantUserStatusModal from "../MerchantUserStatusModal";

import "./index.css";

const MerchantStatusCard = () => {
    const [showModal, setShowModal] = useState(false)
    const [currentMerchantKey, setCurrentMerchantKey] = useState()

    const handleModal = async (status, currentMerchantKey) => {
        setCurrentMerchantKey(currentMerchantKey)
        setShowModal(status)
    }

    useEffect(() => {
    }, [])

    return (
        <Card className="main-pool-status-card mt-5 mb-5">
            <Card.Body className="pt-5 pb-5">
                <div className="w-100">
                    <div>
                        <Row>
                            <h3>Merchant Status</h3>
                            <MerchantStatusTable
                                handleModal={handleModal}
                            />
                        </Row>

                        <MerchantUserStatusModal
                            show={showModal}
                            currentMerchantKey={currentMerchantKey}
                            handleModal={handleModal}
                        />
                    </div>
                </div>
            </Card.Body>
        </Card>
    );
};

export default MerchantStatusCard;