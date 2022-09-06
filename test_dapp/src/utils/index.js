import axios from 'axios';

const { REACT_APP_WORLD_TIME_API_URL } = process.env;

async function getWorldTime() {
    const currentTimeData = await axios.get(`${REACT_APP_WORLD_TIME_API_URL}`);
    const currentTime = currentTimeData.data.datetime;
    const secondTypeCurrentTime = Math.round(new Date(currentTime).getTime() / 1000);
    
    return secondTypeCurrentTime;
}

export {
    getWorldTime
};