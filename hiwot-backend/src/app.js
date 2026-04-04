import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import routes from './routes/index.js';
import requestIdMiddleware from './middleware/requestId.js';

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use('/api', routes);
app.use(requestIdMiddleware);


export default app;
