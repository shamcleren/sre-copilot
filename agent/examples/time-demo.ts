import { getCurrentTime } from '../src/time-tool.js';

const timeResult = getCurrentTime();

console.log(JSON.stringify(timeResult, null, 2));
