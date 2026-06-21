import serverless from 'serverless-http';
import app from '../../api/server.js';

const sls = serverless(app);

export const handler = async (event, context) => sls(event, context);
