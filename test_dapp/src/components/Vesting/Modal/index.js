import React from 'react';
import { useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import { Store } from 'react-notifications-component';

import { notificationConfig } from '../../../constants';

const VestingModal = (props) => {
    const [vestingAmount, setVestingAmount] = useState();

    const {
        show,
        tokenBalance,
        handleModal,
        handleVest
    } = props;

    const handleClose = () => handleModal(false);

    const handleSubmit = async () => {
        if (!vestingAmount) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please fill amount"
            });

            return;
        }

        if (vestingAmount * 1 <= 0) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please input corrent number"
            });

            return;
        }

        if (vestingAmount > tokenBalance) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Insufficient amount"
              });

            return;
        }


        handleModal(false)
        await handleVest(vestingAmount);
    }

    return (
        <Modal show={show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>Vest tokens</Modal.Title>
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
                            onInput={e => setVestingAmount(e.target.value)}
                            type="number"
                            placeholder="Please input amount"
                            autoFocus
                        />
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

export default VestingModal;