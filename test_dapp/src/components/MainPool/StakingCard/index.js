import React, { useState, useEffect } from "react";
import { Card, Row, Col } from "react-bootstrap";
import { Statistic } from 'antd';
import { getWorldTime } from "../../../utils";
import "./index.css";

const { Countdown } = Statistic;

const StakingCard = (props) => {
  const [deadline, setDeadline] = useState(0);
  const { REACT_APP_WITHDRAW_PERIOD } = process.env;

  const {
    totalStakedAmount,
    adminStakedAmount,
    handleclaim,
    endTs
  } = props;

  useEffect(() => {
    (async () => {
      const currentTime = await getWorldTime();
      const timeleft = endTs - currentTime;
      const endtime = timeleft > 0 ? Date.now() + timeleft * 1000 : 0;
      setDeadline(endtime);
    })()
  }, [endTs])

  return (
    <Card className="text-center vesting-card">
      <Card.Body className="pt-5 pb-5">
        <Row>
          <h3><strong>Total Staked Amount:</strong> {totalStakedAmount}</h3>
        </Row>
        <Row>
          <h3><strong>Self Staked Amount:</strong> {totalStakedAmount - adminStakedAmount}</h3>
        </Row>
        <Row>
          <h3><strong>Admin Staked Amount:</strong> {adminStakedAmount}</h3>
        </Row>
        <h3 className="mb-3 text-muted"></h3>
        <Row className="justify-content-center antd-countdonw">
          <h3>Locking Period</h3>
          <Countdown value={deadline} format="DD:HH:mm:ss" />
        </Row>
        <Row className="justify-content-center mt-2">
          <Col sm={12} md={12} lg={6}>
            <Row>
              <button
                onClick={handleclaim}
                className="browser-btn text-dark"
              >
                Claim
              </button>
            </Row>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

export default StakingCard;