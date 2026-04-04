import { randomBytes } from 'crypto';

export default function requestIdMiddleware(req, res) {
  req.requestId = randomBytes(16).toString('hex');

}
