import React from 'react';
import { useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import { Store } from 'react-notifications-component';

import { notificationConfig } from '../../../constants';

const StakingModal = (props) => {
    const [stakingAmount, setStakingAmount] = useState();
    const [lockingPeriod, setLockingPeriod] = useState(120)

    const {
        show,
        tokenBalance,
        handleModal,
        handleStake
    } = props;

    const handleClose = () => handleModal(false);

    const handleSubmit = async () => {
        if (!stakingAmount) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please fill amount"
            });

            return;
        }

        if (stakingAmount * 1 <= 0) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please input corrent number"
            });

            return;
        }

        if (stakingAmount > tokenBalance) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Insufficient amount"
            });

            return;
        }


        handleModal(false)
        await handleStake(stakingAmount, lockingPeriod);
    }

    const handleLockingTime = (e) => {
        console.log("locking time", lockingPeriod)
        console.log("e.target.value", e.target.value)
        setLockingPeriod(e.target.value * 1)
    }

    return (
        <Modal show={show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>Stake tokens</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <Form.Group className="mb-3" controlId="exampleForm.ControlInput1">
                        <Form.Label>Current token amount</Form.Label>
                        <Form.Control
                            type="text"
                            value={tokenBalance?.toLocaleString()}
                            disabled
                        />
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="exampleForm.ControlInput1">
                        <Form.Label>Amount</Form.Label>
                        <Form.Control
                            onInput={e => setStakingAmount(e.target.value)}
                            type="number"
                            placeholder="Please input amount"
                            autoFocus
                        />
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="exampleForm.ControlInput1">
                        <Form.Label>Locking Period</Form.Label>
                        <Form.Select
                            defaultValue={lockingPeriod}
                            onChange={handleLockingTime}
                        >
                            <option value={120}>2 min</option>
                            <option value={300}>5 min</option>
                            <option value={600}>10 min</option>
                        </Form.Select>
                    </Form.Group>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={handleClose}>
                    Close
                </Button>
                <Button variant="primary" onClick={() => handleSubmit()}>
                    Submit
                </Button>
            </Modal.Footer>
        </Modal>
    );
}

export default StakingModal;