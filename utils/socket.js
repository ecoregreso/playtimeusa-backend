let io;
exports.initSocket = (server) => { const { Server } = require('socket.io'); io = new Server(server, { cors:{ origin:'*' }}); io.on('connection', ()=>{}); };
exports.getIO = ()=> io;
