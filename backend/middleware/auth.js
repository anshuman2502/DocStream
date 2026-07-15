const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) { // get token , middleware.
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {// checking token jwt_secret_ket in env file we made 
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    
    req.userId = decoded.userId; // dynamic mutation 

    next(); // move on to the actual route
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;