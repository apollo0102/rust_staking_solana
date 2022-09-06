import React, { useState, useEffect } from "react";
import { Card, Row, Col } from "react-bootstrap";
import { Statistic } from 'antd';
import { getWorldTime } from "../../../utils";
import "./index.css";

const { Countdown } = Statistic;

const VestingCard = (props) => {
  const [deadline, setDeadline] = useState(0);

  const { REACT_APP_WITHDRAW_PERIOD } = process.env;
  const {
    vestedAmount,
    vestedAt,
    handleWithdraw,
  } = props;

  useEffect(() => {
    (async () => {
      const currentTime = await getWorldTime();
      const timeleft = REACT_APP_WITHDRAW_PERIOD * 1 - (currentTime - vestedAt);
      const endtime = timeleft > 0 ? Date.now() + timeleft * 1000 : 0;
      setDeadline(endtime);
    })()
  }, [vestedAt])

  return (
    <Card className="text-center vesting-card">
      <Card.Body className="pt-5 pb-5">
        <h1>Vested Token Amount</h1>
        <h3 className="mb-2 text-muted">{vestedAmount?.toLocaleString()}</h3>
        <Row className="justify-content-center antd-countdonw">
          <Countdown
            // onFinish={setRemainedTime(0)}
            value={deadline}
            format="DD:HH:mm:ss"
          />
        </Row>
        <Row className="justify-content-center mt-5">
          <Col sm={12} md={12} lg={6}>
            <Row>
              <button
                onClick={() => handleWithdraw()}
                className="browser-btn text-dark"
              >
                Withdraw
              </button>
            </Row>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

export default VestingCard;