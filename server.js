 const express = require('express');
22
	
 const cors = require('cors');
33
	
 const dotenv = require('dotenv');
44
	
 const path = require('path');
55
	
 
66
	
 dotenv.config();
77
	
 
88
	
 const { sequelize } = require('./models');
9
	
+const { connectDB, disconnectDB } = require('./utils/db');
910
	
 const cashierRoutes = require('./routes/cashierRoutes');
1011
	
 const playerRoutes = require('./routes/playerRoutes');
1112
	
 const gameRoutes = require('./routes/gameRoutes');
1213
	
 const adminRoutes = require('./routes/adminRoutes');
1314
	
 
1415
	
 const app = express();
1516
	
 const PORT = process.env.PORT || 3000;
1617
	
 const shouldExitAfterBoot = process.argv.includes('--exit');
1718
	
 
1819
	
 const sanitizeBaseUrl = (url) => (url.endsWith('/') ? url.slice(0, -1) : url);
1920
	
 const FRONTEND_BASE_URL = sanitizeBaseUrl(
2021
	
   process.env.FRONTEND_URL || process.env.PUBLIC_URL || `http://localhost:${PORT}`
2122
	
 );
2223
	
 
2324
	
 app.use(cors({ origin: '*' }));
2425
	
 app.use(express.json());
2526
	
 app.use(express.urlencoded({ extended: true }));
2627
	
 app.use(express.static(path.join(__dirname, 'public')));
2728
	
 
2829
	
 app.use('/api/cashier', cashierRoutes);
2930
	
 app.use('/api/player', playerRoutes);
3031
	
 app.use('/api/game', gameRoutes);
3132
	
 app.use('/api/admin', adminRoutes);
3233
	
 
3334
	
 app.get('/', (req, res) => {
3435
	
   if (req.accepts('html')) {
3536
	
     return res.sendFile(path.join(__dirname, 'public', 'cashier.html'));
3637
	
   }
3738
	
   res.json({ message: 'Casino backend is running 🚀' });
3839
	
 });
3940
	
 
4041
	
 app.get('/cashier', (_req, res) => {
4142
	
   res.sendFile(path.join(__dirname, 'public', 'cashier.html'));
4243
	
 });
4344
	
 
4445
	
 app.get('/login', (_req, res) => {
4546
	
   res.sendFile(path.join(__dirname, 'public', 'login.html'));
4647
	
 });
4748
	
 
4849
	
 let httpServer;
4950
	
 
5051
	
 const gracefulShutdown = async (reason) => {
5152
	
   console.log(`\nShutting down server (${reason}).`);
5253
	
 
5354
	
   if (httpServer) {
5455
	
     await new Promise((resolve) => httpServer.close(resolve));
5556
	
     httpServer = null;
5657
	
   }
5758
	
 
5859
	
   try {
60
	
+    await disconnectDB();
5961
	
     await sequelize.close();
6062
	
   } catch (error) {
6163
	
     console.error('Error while closing database connection:', error);
6264
	
   }
6365
	
 };
6466
	
 
6567
	
 const startServer = async () => {
6668
	
   try {
69
	
+    await connectDB();
6770
	
     await sequelize.authenticate();
6871
	
     await sequelize.sync();
6972
	
 
7073
	
     httpServer = app.listen(PORT, () => {
7174
	
       console.log(`🚀 Server running on port ${PORT}`);
7275
	
       console.log(`💳 Cashier portal: ${FRONTEND_BASE_URL}/cashier.html`);
7376
	
     });
7477
	
 
7578
	
     if (shouldExitAfterBoot) {
7679
	
       setImmediate(() => {
7780
	
         gracefulShutdown('CLI --exit flag triggered')
7881
	
           .then(() => process.exit(0))
7982
	
           .catch((error) => {
8083
	
             console.error('Failed to shutdown after --exit flag:', error);
8184
	
             process.exit(1);
8285
	
           });
8386
	
       });
+
8487
	
     }
8588
	
   } catch (error) {
8689
	
     console.error('❌ Server startup failed due to database error.', error);
8790
	
     process.exit(1);
8891
	
   }
8992
	
 };
9093
	
 
9194
	
 ['SIGINT', 'SIGTERM'].forEach((signal) => {
