import { Card } from "react-bootstrap";

import "./index.css";

const MainPoolConfigCard = (props) => {
    const { mainPoolPubkey } = props;

    return (
        <Card className="text-center main-pool-config-card">
            <Card.Body className="pt-5 pb-5">
                <div>
                    To finish initialization please copy below into <strong>project/.env</strong> and restart yarn or redeploy
                </div>
                <hr />
                <div className="main-pool-configuration">
                    {`REACT_APP_MAIN_POOL_PUBKEY=${mainPoolPubkey}`}
                </div>
            </Card.Body>
        </Card>
    );
};

export default MainPoolConfigCard;