import { useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import { Store } from 'react-notifications-component';

import { notificationConfig } from '../../../constants';

const MerchantCreateModal = (props) => {
    const [merchantName, setMerchantName] = useState();

    const {
        show,
        handleModal,
        handleCreateMerchant
    } = props;

    const handleInput = (e) => {
        setMerchantName(e.target.value)
    }

    const handleClose = () => handleModal(false);

    const handleSubmit = async () => {
        if (!merchantName) {
            Store.addNotification({
                ...notificationConfig,
                type: "warning",
                message: "Please input merchant name"
            });

            return;
        }

        handleClose();
        await handleCreateMerchant(merchantName)
    }

    return (
        <Modal show={show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>Create a new merchant pool</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <Form.Group className="mb-3" controlId="exampleForm.ControlInput1">
                        <Form.Label>Merchant Name:</Form.Label>
                        <Form.Control
                            type="text"
                            placeholder="Please input merchant name"
                            onInput={(e) => handleInput(e)}
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

export default MerchantCreateModal;